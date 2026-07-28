#!/usr/bin/env node
// Self-contained demo of the compliance engine.
//
//   node example.mjs
//
// No dependencies, no data files, no build step - it builds a few days of driver
// activity inline and runs the full analysis over them. Copy this directory
// anywhere and this script still runs.
//
// The records are built by hand on purpose: this file must run with nothing but
// this directory present. If your input is flespi tacho-file-parse JSON, the
// equivalent starting from a real file is ../../scripts/find-violations.mjs -
// the same call sequence, but with ../utils/ddd.js normalizing the parser output
// into the records below first.

import {
  analyzeDayViolations,
  analyzeDailyDriving,
  analyzeDailyRest,
  analyzeWeeklyRest,
  analyzeWeeklyViolations,
  detectAnomalies,
  RULES_VERSION,
} from './index.js'

const DAY = 86400
const MONDAY = Date.UTC(2026, 5, 1) / 1000 // 2026-06-01, a Monday, UTC

// changeTime is minutes since midnight; each entry runs until the next one.
const at = (h, m = 0) => h * 60 + m
const change = (time, activity) => ({ changeTime: time, activity, slot: 'DRIVER', cardInserted: true })

// One deliberately illegal day, repeated. Each day has 6h of driving before any
// break (over the 4h30 continuous limit), 12h15 of driving in total (over the
// 10h daily limit), and an evening rest that merges with the next morning into
// 10h - a reduced daily rest. Note what the output shows as the week goes on:
// the daily-driving message changes once the two weekly 10h extensions are used
// up, and the fourth reduced daily rest becomes an Art.8.4 finding.
const hardDay = (dayIndex) => ({
  activityRecordDate: MONDAY + dayIndex * DAY,
  activityChangeInfo: [
    change(at(0), 'BREAK/REST'), // rest continues from the previous evening
    change(at(4), 'DRIVING'), // 04:00 - 10:00, six hours without a break
    change(at(10), 'BREAK/REST'), // 45 min break
    change(at(10, 45), 'DRIVING'), // 10:45 - 17:00
    change(at(17), 'WORK'),
    change(at(18), 'BREAK/REST'), // 18:00 - 02:00 next day = 8h
  ],
})

const records = [0, 1, 2, 3, 4, 5, 6, 7].map(hardDay)

// --- the full call sequence -------------------------------------------------

const days = records.filter((r) => r.activityChangeInfo?.length)
const lastTs = Math.max(...days.map((r) => r.activityRecordDate))

// Per day. These findings carry no date of their own - attach it yourself.
const perDay = days.flatMap((r) =>
  analyzeDayViolations(r, { isLastDay: r.activityRecordDate === lastTs }).map((v) => ({
    ...v,
    dayTs: r.activityRecordDate,
  })),
)

// Whole dataset: rest and weekly rules cross day boundaries.
const spanning = [...analyzeDailyDriving(records), ...analyzeDailyRest(records), ...analyzeWeeklyRest(records)]

// Note the object return - not an array.
const { weeklyViolations, biweeklyViolations } = analyzeWeeklyViolations(records)

const violations = [...perDay, ...spanning, ...weeklyViolations, ...biweeklyViolations].sort(
  (a, b) => (a.dayTs ?? a.weekStart ?? 0) - (b.dayTs ?? b.weekStart ?? 0),
)

const anomalies = detectAnomalies(records, [])

// --- rendering --------------------------------------------------------------

// `message` is an i18n key with {placeholders}, not display text.
const render = (v) => v.message.replace(/\{(\w+)\}/g, (_, k) => v.messageParams?.[k] ?? `{${k}}`)
const date = (v) => new Date((v.dayTs ?? v.weekStart ?? v.ts ?? 0) * 1000).toISOString().slice(0, 10)

console.log(`Compliance engine, rule set ${RULES_VERSION}`)
console.log(`${records.length} days analysed, ${violations.length} violations, ${anomalies.length} anomalies\n`)

for (const v of violations) {
  console.log(`${date(v)}  ${v.severity.padEnd(14)} Art.${(v.code || '-').padEnd(5)} ${render(v)}`)
}

if (anomalies.length) {
  console.log('\nAnomalies (data quality, a different severity scale):')
  for (const a of anomalies) {
    console.log(`${date(a)}  ${a.severity.padEnd(14)} ${render(a)}`)
  }
}
