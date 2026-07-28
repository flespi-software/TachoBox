// One call from a flespi API response to a compliance report.
//
//   import { analyze } from './src/analyze.js'
//   const report = analyze(apiResponse)
//
// Input is the JSON returned by the flespi media API for a tacho file, i.e.
// GET /gw/devices/{id}/media?data={uuid, fields:'uuid,name,meta,content'} -
// an object shaped { result: [{ uuid, name, meta, content }] }. The bundled
// demo files in public/ are exactly that, unmodified.
//
// This is the facade over the two framework-free libraries in this repo:
// ./utils/ddd.js normalizes the parser output into activity records, and
// ./compliance analyses them. Both can also be used directly; this module
// exists so the common case is a single function call, and so a port to
// another language has one entry point to mirror.
//
// Framework-free: runs in plain Node and in the browser, no dependencies.

import { detectAndNormalize, mergeRecordSets, extractRecords, isCompatible } from './utils/ddd.js'
import {
  analyzeDayViolations,
  analyzeDailyDriving,
  analyzeDailyRest,
  analyzeWeeklyRest,
  analyzeWeeklyViolations,
  detectUsageErrors,
  detectAnomalies,
  RULES_VERSION,
} from './compliance/index.js'

// `message` on every finding is an i18n key with {placeholders}, not display
// text. Exported because any consumer that is not wiring up an i18n library
// needs exactly this.
export const renderMessage = (msg, params) =>
  !params ? msg : msg.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`))

const isoDay = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null)
const countBy = (arr, key) =>
  arr.reduce((acc, v) => ((acc[v[key]] = (acc[v[key]] || 0) + 1), acc), {})

// A violation/anomaly is dated by its dayTs, or (for time-stamped anomalies) by ts.
const shape = (v) => ({
  code: v.code,
  type: v.type,
  severity: v.severity,
  date: isoDay(v.dayTs ?? (v.ts ? v.ts - (v.ts % 86400) : null)),
  minutes: v.minutes,
  text: renderMessage(v.message, v.messageParams),
})

// Per-source summary (type, generation used, holder, day count and date range).
function describeSource(src, usedGen) {
  const data = usedGen === 'g2' && src.g2 ? src.g2 : src.g1
  const days = extractRecords(data).activityRecords.filter((r) => r.activityChangeInfo?.length)
  const dates = days.map((r) => r.activityRecordDate).sort((a, b) => a - b)
  return {
    type: src.type,
    generation: usedGen === 'g2' && src.g2 ? 'g2' : 'g1',
    holder: src.name || undefined,
    days: days.length,
    range: dates.length ? { from: isoDay(dates[0]), to: isoDay(dates[dates.length - 1]) } : null,
  }
}

// Analyze one or more flespi API responses. Returns a plain report object, no IO.
// Multiple inputs must be complementary - the same driver card (e.g. successive
// downloads) or the same vehicle unit; mixing different drivers/vehicles, or a
// card with a VU, throws (same rule as the app's isCompatible).
// opts.gen forces a generation; default prefers Gen2 when any source carries it.
export function analyze(input, { gen } = {}) {
  const jsons = Array.isArray(input) ? input : [input]
  if (!jsons.length) throw new Error('No input provided')
  const sources = jsons.map(detectAndNormalize)
  if (sources.some((s) => !s)) throw new Error('One or more inputs are not a recognized parsed DDD file')

  // All inputs must be mutually compatible to be analysed as one dataset.
  const accepted = []
  for (const s of sources) {
    if (!isCompatible(s, accepted)) {
      throw new Error('Incompatible files: every input must be the same driver card or the same vehicle unit (different driver or vehicle detected)')
    }
    accepted.push(s)
  }
  const valid = sources

  const usedGen = gen || (valid.some((s) => s.g2) ? 'g2' : 'g1')
  const { activityRecords, placeRecords, eventRecords } = mergeRecordSets(valid, usedGen)

  // Same call sequence as the UI's CompliancePanel.
  const withDay = (v, dayTs) => ({ ...v, dayTs: v.dayTs ?? dayTs })
  const days = activityRecords.filter((r) => r.activityChangeInfo?.length)
  const maxTs = days.reduce((m, r) => Math.max(m, r.activityRecordDate), 0)

  const perDay = days.flatMap((r) =>
    analyzeDayViolations(r, { isLastDay: r.activityRecordDate === maxTs })
      .map((v) => withDay(v, r.activityRecordDate)),
  )
  const rest = [
    ...analyzeDailyDriving(activityRecords),
    ...analyzeDailyRest(activityRecords),
    ...analyzeWeeklyRest(activityRecords),
  ]
  const { weeklyViolations, biweeklyViolations } = analyzeWeeklyViolations(activityRecords)
  const weekly = [...weeklyViolations, ...biweeklyViolations].map((v) => withDay(v, v.weekStart))

  const violations = [...perDay, ...rest, ...weekly].sort((a, b) => (a.dayTs || 0) - (b.dayTs || 0))
  const usageErrors = detectUsageErrors(activityRecords, placeRecords, eventRecords)
  const anomalies = detectAnomalies(activityRecords, eventRecords)

  return {
    rulesVersion: RULES_VERSION,
    sources: valid.map((s) => describeSource(s, usedGen)),
    summary: {
      violations: violations.length,
      bySeverity: countBy(violations, 'severity'),
      byType: countBy(violations, 'type'),
      usageErrors: usageErrors.length,
      anomalies: anomalies.length,
    },
    violations: violations.map(shape),
    usageErrors: usageErrors.map(shape),
    anomalies: anomalies.map(shape),
  }
}
