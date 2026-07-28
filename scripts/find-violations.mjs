#!/usr/bin/env node
// Find EU 561/2006 + 165/2014 violations in one or more parsed DDD files, print JSON.
//
// Usage:
//   node scripts/find-violations.mjs <parsed.json> [more.json ...] [--gen g1|g2] [--pretty]
//   node scripts/find-violations.mjs public/example.json --pretty
//   node scripts/find-violations.mjs day1.json day2.json day3.json   # same card, merged
//
// Pass several complementary files - successive downloads of the SAME driver card,
// or of the same vehicle unit. They are normalized, merged into one timeline (same
// day from two files -> the richer record is kept), and analysed together. Mixing
// different drivers/vehicles (or a card with a VU) throws an error.
//
// Input is the JSON produced by the flespi tacho-file-parse plugin. This wires
// together the two framework-free libraries this repo ships: src/utils/ddd.js
// (normalization adapter) and src/compliance (the engine). analyze() is exported
// so it can be reused/tested directly (see test/find-violations.test.js).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detectAndNormalize, mergeRecordSets, extractRecords, isCompatible } from '../src/utils/ddd.js'
import {
  analyzeDayViolations,
  analyzeDailyDriving,
  analyzeDailyRest,
  analyzeWeeklyRest,
  analyzeWeeklyViolations,
  detectUsageErrors,
  detectAnomalies,
  RULES_VERSION,
} from '../src/compliance/index.js'

const fill = (msg, params) =>
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
  text: fill(v.message, v.messageParams), // message is an i18n key with {placeholders}
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

// Analyze one or more raw parsed-DDD JSONs. Returns a plain report object (no IO).
// Multiple files must be complementary - the same driver card (e.g. successive
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

// --- CLI wrapper (only when run directly, not when imported) ---
function main() {
  const args = process.argv.slice(2)
  const files = args.filter((a) => !a.startsWith('--'))
  const pretty = args.includes('--pretty')
  const genArg = (args.find((a) => a.startsWith('--gen=')) || '').split('=')[1]
    || (args.includes('--gen') ? args[args.indexOf('--gen') + 1] : null)
  const genFiles = genArg ? files.filter((f) => f !== genArg) : files // drop `--gen g1` value

  if (!genFiles.length) {
    console.error('Usage: node scripts/find-violations.mjs <parsed.json> [more.json ...] [--gen g1|g2] [--pretty]')
    process.exit(1)
  }
  let report
  try {
    const jsons = genFiles.map((f) => JSON.parse(readFileSync(f, 'utf8')))
    report = analyze(jsons, { gen: genArg })
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  process.stdout.write(JSON.stringify(report, null, pretty ? 2 : 0) + '\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
