import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { detectAndNormalize, extractRecords, mergeRecordSets } from '../src/utils/ddd.js'
import {
  analyzeDayViolations,
  analyzeDailyDriving,
  analyzeDailyRest,
  analyzeWeeklyRest,
  analyzeWeeklyViolations,
  detectAnomalies,
  detectUsageErrors,
  crossReference,
} from '../src/compliance/violations.js'
import { classifySeverity } from '../src/compliance/rules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadDemo(file) {
  const json = JSON.parse(readFileSync(resolve(__dirname, '../public', file), 'utf8'))
  const src = detectAndNormalize(json)
  const records = extractRecords(src.g1 || src.g2)
  return { src, records }
}

// ---------------------------------------------------------------------------
// Golden master - runs every analysis over the bundled demo data and snapshots
// the full result. This is the safety net for the rules/config split: the
// snapshot is captured against the CURRENT implementation, so with LIMITS and
// SEVERITY living in rules.js every violation (type, code, severity, minutes,
// message) must still come out byte-for-byte identical.
// ---------------------------------------------------------------------------
describe('golden master — demo data', () => {
  for (const file of ['example.json', 'example-vu.json']) {
    it(`analysis of ${file} is unchanged`, () => {
      const { records } = loadDemo(file)
      const a = records.activityRecords
      const maxTs = Math.max(...a.map((r) => r.activityRecordDate))

      const result = {
        dayViolations: a
          .flatMap((r) => analyzeDayViolations(r, { isLastDay: r.activityRecordDate === maxTs }))
          .sort((x, y) => (x.minutes || 0) - (y.minutes || 0)),
        dailyDriving: analyzeDailyDriving(a),
        dailyRest: analyzeDailyRest(a),
        weeklyRest: analyzeWeeklyRest(a),
        weekly: analyzeWeeklyViolations(a),
        anomalies: detectAnomalies(a, records.eventRecords),
        usageErrors: detectUsageErrors(a, records.placeRecords, records.eventRecords),
      }
      expect(result).toMatchSnapshot()
    })
  }

  it('crossReference between driver card and VU is unchanged', () => {
    const card = loadDemo('example.json').src
    const vu = loadDemo('example-vu.json').src
    expect(crossReference([card, vu])).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Boundary suite - pins the exact severity band edges that move into the
// declarative SEVERITY config. Each assertion exercises a band threshold
// through an exported function, so a one-minute drift in any boundary fails.
// ---------------------------------------------------------------------------
const DAY = 86400
const MONDAY = Date.UTC(2024, 0, 1) / 1000 // 2024-01-01 is a Monday (UTC)

// A day with a single continuous DRIVING block followed by rest to midnight.
function drivingDay(dayIndex, drivingMinutes) {
  return {
    activityRecordDate: MONDAY + dayIndex * DAY,
    activityChangeInfo: [
      { changeTime: 0, activity: 'DRIVING', slot: 'DRIVER', cardInserted: true },
      { changeTime: drivingMinutes, activity: 'BREAK/REST', slot: 'DRIVER', cardInserted: true },
    ],
  }
}

describe('continuous driving severity bands (Art.7)', () => {
  // value = uninterrupted driving minutes; analysed per day (never the last day).
  const cases = [
    [280, 'minor'], // > 4h30, < 5h
    [300, 'serious'], // 5h
    [359, 'serious'], // just under 6h
    [360, 'very-serious'], // 6h
    [600, 'very-serious'],
  ]
  for (const [minutes, severity] of cases) {
    it(`${minutes}min → ${severity}`, () => {
      const v = analyzeDayViolations(drivingDay(0, minutes), { isLastDay: false })
      const cd = v.find((x) => x.type === 'continuous-driving')
      expect(cd?.severity).toBe(severity)
    })
  }
})

describe('weekly driving severity bands (Art.6.2 — > 56h)', () => {
  // Spread the total over Mon-Sat so it stays within one ISO week.
  function weekTotalling(totalMinutes) {
    const perDay = Math.round(totalMinutes / 6)
    return Array.from({ length: 6 }, (_, i) => drivingDay(i, perDay))
  }
  const cases = [
    [57 * 60, 'minor'], // 57h
    [60 * 60, 'serious'], // 60h
    [65 * 60, 'very-serious'], // 65h
    [70 * 60, 'most-serious'], // 70h
  ]
  for (const [total, severity] of cases) {
    it(`${total / 60}h → ${severity}`, () => {
      const { weeklyViolations } = analyzeWeeklyViolations(weekTotalling(total))
      const wv = weeklyViolations.find((x) => x.type === 'weekly-driving')
      expect(wv?.severity).toBe(severity)
    })
  }

  it('≤ 56h produces no weekly-driving violation', () => {
    const { weeklyViolations } = analyzeWeeklyViolations(weekTotalling(56 * 60))
    expect(weeklyViolations.find((x) => x.type === 'weekly-driving')).toBeUndefined()
  })
})

describe('biweekly driving severity bands (Art.6.3 — > 90h)', () => {
  // Two consecutive ISO weeks; week 1 = days 0-5, week 2 = days 7-12.
  function twoWeeksTotalling(totalMinutes) {
    const perDay = Math.round(totalMinutes / 12)
    return [
      ...Array.from({ length: 6 }, (_, i) => drivingDay(i, perDay)),
      ...Array.from({ length: 6 }, (_, i) => drivingDay(7 + i, perDay)),
    ]
  }
  const cases = [
    [95 * 60, 'minor'], // 95h
    [100 * 60, 'serious'], // 100h
    [105 * 60, 'very-serious'], // 105h
    [112.5 * 60, 'most-serious'], // 112h30
  ]
  for (const [total, severity] of cases) {
    it(`${total / 60}h → ${severity}`, () => {
      const { biweeklyViolations } = analyzeWeeklyViolations(twoWeeksTotalling(total))
      const bv = biweeklyViolations.find((x) => x.type === 'biweekly-driving')
      expect(bv?.severity).toBe(severity)
    })
  }
})

describe('insufficient reduced daily rest severity bands (Art.8.2, Annex III D4–D6)', () => {
  // A fully-covered day whose only rest block is `restMin` long (< 9h, so a
  // daily-rest violation fires) and is the longest rest in the 24h window.
  // The demo data never lands in the 8-9h band, so these pin it explicitly.
  function restDay(restMin) {
    const work1End = Math.floor((1440 - restMin) / 2)
    return [{
      activityRecordDate: MONDAY,
      activityChangeInfo: [
        { changeTime: 0, activity: 'WORK', slot: 'DRIVER', cardInserted: true },
        { changeTime: work1End, activity: 'BREAK/REST', slot: 'DRIVER', cardInserted: true },
        { changeTime: work1End + restMin, activity: 'WORK', slot: 'DRIVER', cardInserted: true },
      ],
    }]
  }
  const cases = [
    [400, 'most-serious'], // < 7h (D6)
    [450, 'very-serious'], // 7-8h (D5)
    [480, 'serious'], // 8h exactly - band edge (D4)
    [510, 'serious'], // 8-9h (D4)
  ]
  for (const [restMin, severity] of cases) {
    it(`${(restMin / 60).toFixed(1)}h rest → ${severity}`, () => {
      const v = analyzeDailyRest(restDay(restMin)).find((x) => x.type === 'daily-rest')
      expect(v?.minutes).toBe(restMin)
      expect(v?.severity).toBe(severity)
    })
  }
})

// Art.6.3 is the total over two *consecutive* calendar weeks. The week list holds
// only weeks that have data, so a gap can leave non-adjacent weeks side by side -
// they must not be summed as a fortnight.
describe('biweekly driving — consecutive weeks only (Art.6.3)', () => {
  const PER_DAY = Math.round((50 * 60) / 6) // 50h/week - legal alone, > 90h paired
  const week = (startDay) => Array.from({ length: 6 }, (_, i) => drivingDay(startDay + i, PER_DAY))

  it('consecutive weeks (days 0–5 + 7–12) → one biweekly violation', () => {
    const { biweeklyViolations } = analyzeWeeklyViolations([...week(0), ...week(7)])
    expect(biweeklyViolations).toHaveLength(1)
  })

  it('non-adjacent weeks across a gap (days 0–5 + 14–19) → no biweekly violation', () => {
    const { biweeklyViolations } = analyzeWeeklyViolations([...week(0), ...week(14)])
    expect(biweeklyViolations).toHaveLength(0)
  })
})

// Activity is deduped per calendar day across merged sources; when two sources
// carry the same day with different content the richer record (more activity
// changes) must survive rather than first-wins, so a day's driving isn't dropped.
describe('multi-source merge keeps the richer activity record', () => {
  const mkSource = (records) => ({ g1: { EF_Driver_Activity_Data: { CardDriverActivity: { activityDailyRecords: records } } } })
  const rich = {
    activityRecordDate: MONDAY,
    activityChangeInfo: [
      { changeTime: 0, activity: 'DRIVING' },
      { changeTime: 300, activity: 'BREAK/REST' },
      { changeTime: 600, activity: 'WORK' },
    ],
  }
  const poor = { activityRecordDate: MONDAY, activityChangeInfo: [{ changeTime: 0, activity: 'DRIVING' }] }

  for (const [label, order] of [['poor then rich', [poor, rich]], ['rich then poor', [rich, poor]]]) {
    it(`${label} → keeps the 3-change record`, () => {
      const merged = mergeRecordSets([mkSource([order[0]]), mkSource([order[1]])], 'g1')
      expect(merged.activityRecords).toHaveLength(1)
      expect(merged.activityRecords[0].activityChangeInfo).toHaveLength(3)
    })
  }
})

describe('weekly rest duration severity bands (Annex III D13–D18)', () => {
  // D13-D15: insufficient reduced weekly rest < 24h
  const reduced = [
    [23 * 60, 'serious'], // 22-24h
    [21 * 60, 'very-serious'], // 20-22h
    [19 * 60, 'most-serious'], // < 20h
  ]
  for (const [m, sev] of reduced) {
    it(`reduced-short ${m / 60}h → ${sev}`, () => {
      expect(classifySeverity('weekly-rest-reduced-short', m)).toBe(sev)
    })
  }
  // D16-D18: weekly rest < 45h when a reduced weekly rest was not allowed
  const regular = [
    [44 * 60, 'serious'], // 42-45h
    [40 * 60, 'very-serious'], // 36-42h
    [30 * 60, 'most-serious'], // < 36h
  ]
  for (const [m, sev] of regular) {
    it(`regular-short ${m / 60}h → ${sev}`, () => {
      expect(classifySeverity('weekly-rest-regular-short', m)).toBe(sev)
    })
  }
})
