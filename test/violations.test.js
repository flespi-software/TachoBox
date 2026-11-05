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
  continuousDrivingStretches,
} from '../src/compliance/violations.js'
import { classifySeverity } from '../src/compliance/rules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadDemo(file) {
  const json = JSON.parse(readFileSync(resolve(__dirname, '../public', file), 'utf8'))
  const src = detectAndNormalize(json)
  const records = extractRecords(src.byGeneration.g1 || src.byGeneration.g2)
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
  const mkSource = (records) => ({ byGeneration: { g1: { EF_Driver_Activity_Data: { CardDriverActivity: { activityDailyRecords: records } } } } })
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

describe('multi-manning daily rest severity bands (Art.8.5, Annex III D10-D12)', () => {
  const bands = [
    [9 * 60 - 1, 'serious'], // 8-9h
    [8 * 60, 'serious'],
    [8 * 60 - 1, 'very-serious'], // 7-8h
    [7 * 60, 'very-serious'],
    [7 * 60 - 1, 'most-serious'], // < 7h
  ]
  for (const [m, sev] of bands) {
    it(`${m} min -> ${sev}`, () => {
      expect(classifySeverity('daily-rest-multi-manning', m)).toBe(sev)
    })
  }
})

// Card out: UNKNOWN time counts as rest, a manual entry keeps the declared
// activity, and data without the flag (a VU) stays rest as before.
describe('card-out time in the engine', () => {
  const ch = (changeTime, activity, cardInserted, manualEntry) =>
    ({ changeTime, activity, cardInserted, manualEntry, slot: 'DRIVER' })
  const day = (manual) => ({
    activityRecordDate: 1704067200,
    activityChangeInfo: [
      ch(0, 'DRIVING', true),
      ch(200, 'WORK', false, manual),
      ch(260, 'DRIVING', true),
      ch(360, 'BREAK/REST', true),
    ],
  })

  it('treats UNKNOWN time as a break', () => {
    expect(continuousDrivingStretches(day(false)).map((s) => s.driving)).toEqual([200, 100])
  })

  it('keeps a manually entered activity', () => {
    expect(continuousDrivingStretches(day(true)).map((s) => s.driving)).toEqual([300])
  })

  it('treats card-out time without the flag as a break', () => {
    expect(continuousDrivingStretches(day(undefined)).map((s) => s.driving)).toEqual([200, 100])
  })
})

// Multi-manning (Art.4(o)): a break may be taken riding as co-driver (Art.7), and
// the daily rest is 9h within 30h (Art.8.5), graded by Annex III D10-D12.
describe('multi-manning', () => {
  const D0 = 1704067200 // Monday
  const ch = (changeTime, activity, crew, slot = 'DRIVER') =>
    ({ changeTime, activity, cardInserted: true, drivingStatus: crew ? 'CREW' : 'SINGLE', slot })
  const H = (h) => h * 60
  // Rest until 11:00, a long shift driving in turns, then a daily rest of
  // `restH` from 08:00 the next day.
  const shift = (crew, restH) => {
    const co = crew ? 'CO-DRIVER' : 'DRIVER'
    const restEnd = H(8 + restH)
    return [
      { source: 'card', activityRecordDate: D0, activityChangeInfo: [
        ch(0, 'BREAK/REST', false), ch(H(11), 'DRIVING', crew), ch(H(15), 'AVAILABILITY', crew, co),
        ch(H(19), 'DRIVING', crew), ch(H(23), 'AVAILABILITY', crew, co),
      ] },
      { source: 'card', activityRecordDate: D0 + 86400, activityChangeInfo: [
        ch(0, 'AVAILABILITY', crew, co), ch(H(5), 'DRIVING', crew), ch(H(8), 'BREAK/REST', crew),
        ch(restEnd, 'WORK', crew), ch(H(17), 'BREAK/REST', crew),
      ] },
      { source: 'card', activityRecordDate: D0 + 2 * 86400, activityChangeInfo: [
        ch(0, 'BREAK/REST', crew), ch(H(4), 'WORK', crew),
      ] },
    ]
  }
  const rest = (records) => analyzeDailyRest(records).filter((v) => v.type === 'daily-rest')

  it('takes a break riding as co-driver', () => {
    expect(continuousDrivingStretches(shift(true, 9)[0]).map((s) => s.driving)).toEqual([H(4), H(4)])
    expect(continuousDrivingStretches(shift(false, 9)[0]).map((s) => s.driving)).toEqual([H(8)])
  })

  it('does not count crew availability in the driver slot as a break', () => {
    const day = { activityRecordDate: D0, activityChangeInfo: [
      ch(0, 'DRIVING', true), ch(H(3), 'AVAILABILITY', true), ch(H(4), 'DRIVING', true), ch(H(6), 'BREAK/REST', true),
    ] }
    expect(continuousDrivingStretches(day).map((s) => s.driving)).toEqual([H(5)])
  })

  it('accepts a 9h daily rest within 30h for a crew', () => {
    expect(rest(shift(true, 9))).toEqual([])
  })

  it('judges the same shift without a crew against 24h', () => {
    const v = rest(shift(false, 9))
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ code: '8.2', severity: 'most-serious' })
  })

  it('grades a short crew daily rest under Art.8.5', () => {
    const v = rest(shift(true, 8))
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ code: '8.5', severity: 'serious', minutes: H(8), multiManning: true })
  })
})

// A card keeps no record of days it was never inserted, so its data resumes
// mid-rest after a weekend off - and opens mid-rest on the first day.
describe('daily rest around days without a card', () => {
  const FRI = 1704412800 // Friday 2024-01-05
  const ch = (changeTime, activity, cardInserted = true) =>
    ({ changeTime, activity, cardInserted, manualEntry: false, slot: 'DRIVER' })
  const records = [
    { source: 'card', activityRecordDate: FRI, activityChangeInfo: [
      ch(0, 'BREAK/REST', false), ch(360, 'WORK'), ch(960, 'WORK', false),
    ] },
    { source: 'card', activityRecordDate: FRI + 3 * 86400, activityChangeInfo: [
      ch(0, 'BREAK/REST', false), ch(360, 'WORK'), ch(1080, 'BREAK/REST', false),
    ] },
    { source: 'card', activityRecordDate: FRI + 4 * 86400, activityChangeInfo: [
      ch(0, 'BREAK/REST', false), ch(420, 'WORK'),
    ] },
  ]

  it('does not judge the rest that ran through the gap as a short one', () => {
    const graded = analyzeDailyRest(records).filter((v) => v.severity !== 'uncertain')
    expect(graded).toEqual([])
  })
})
