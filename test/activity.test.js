import { describe, it, expect } from 'vitest'
import { buildDaySegments, segmentsGradient } from '../src/utils/activity.js'
import { continuousDrivingStretches, detectAnomalies } from '../src/compliance/index.js'

const DAY = 1717977600 // a UTC midnight
// A morning download: work from midnight, driving from 04:49, read at 06:11
const changes = [
  { changeTime: 0, activity: 'WORK', cardInserted: true, slot: 'DRIVER' },
  { changeTime: 289, activity: 'DRIVING', cardInserted: true, slot: 'DRIVER' },
]
const record = (extra = {}) => ({ activityRecordDate: DAY, activityChangeInfo: changes, ...extra })

// The activity running when the file was downloaded has no recorded end. Reading
// it as lasting until midnight turned a short morning drive into a day of driving.
describe('the day a download cut short', () => {
  it('ends the last activity at the download, not at midnight', () => {
    const { segments, totals } = buildDaySegments(record({ recordedUntilMin: 371 }))
    expect(totals.DRIVING).toBe(82) // 04:49 -> 06:11
    const last = segments[segments.length - 1]
    expect(last.endLabel).toBe('06:11')
    expect(last.truncated).toBe(true) // still marked as not having ended there
    expect(last.ongoing).toBe(false)
  })

  it('without the download time, extrapolates to midnight as before', () => {
    expect(buildDaySegments(record()).totals.DRIVING).toBe(1440 - 289)
  })

  it('shows the open activity as ongoing on the last day when nothing bounds it', () => {
    const { segments, totals } = buildDaySegments(record(), { isLastDay: true })
    expect(totals.DRIVING).toBe(0)
    expect(segments[segments.length - 1].ongoing).toBe(true)
  })

  it('takes a bare change list too', () => {
    expect(buildDaySegments(changes).totals.DRIVING).toBe(1440 - 289)
  })

  it('bounds the engine the same way', () => {
    expect(continuousDrivingStretches(record({ recordedUntilMin: 371 }))).toEqual([
      { startMin: 289, endMin: 371, driving: 82 },
    ])
    expect(continuousDrivingStretches(record())[0].driving).toBe(1440 - 289)
  })

  // A CSS gradient stretches its last colour to the edge, so the uncovered rest
  // of the day used to be painted with the activity that was running.
  it('paints only the recorded part of the day', () => {
    const { segments } = buildDaySegments(record({ recordedUntilMin: 371 }))
    const css = segmentsGradient(segments)
    expect(css.endsWith('transparent 25.764% 100%)')).toBe(true)
    expect(css).toContain('var(--act-driving) 20.069% 25.764%')
  })

  it('leaves a full day fully painted', () => {
    const css = segmentsGradient(buildDaySegments(record()).segments)
    expect(css).not.toContain('transparent')
  })

  it('does not report the rest of that day as unaccounted time', () => {
    const bounded = detectAnomalies([record({ recordedUntilMin: 371 })], [])
    expect(bounded.filter((a) => a.type === 'unaccounted')).toHaveLength(0)
  })
})

// Card out (p=1): manualEntry, set by the adapter for card data, separates
// UNKNOWN time from a manual entry.
describe('card-out time', () => {
  const ch = (changeTime, activity, cardInserted, manualEntry = false) =>
    ({ changeTime, activity, cardInserted, manualEntry, slot: 'DRIVER' })

  it('keeps UNKNOWN time out of the activity totals', () => {
    const { segments, totals } = buildDaySegments([
      ch(0, 'WORK', false),
      ch(331, 'DRIVING', true),
      ch(963, 'WORK', false),
    ])
    expect(totals.WORK).toBe(0)
    expect(totals.DRIVING).toBe(963 - 331)
    expect(totals.UNKNOWN).toBe(331 + 1440 - 963)
    expect(segments.map((s) => s.activity)).toEqual(['UNKNOWN', 'DRIVING', 'UNKNOWN'])
    expect(segments[0].cardOut).toBe(true)
  })

  it('counts a manual entry as the declared activity', () => {
    const { segments, totals } = buildDaySegments([
      ch(0, 'WORK', false, true),
      ch(600, 'DRIVING', true),
    ])
    expect(totals.WORK).toBe(600)
    expect(totals.UNKNOWN).toBe(0)
    expect(segments[0]).toMatchObject({ activity: 'WORK', cardOut: true })
  })

  // In VU data the activity of an empty slot is what the unit recorded.
  it('shows VU card-out time as recorded', () => {
    const { totals } = buildDaySegments([
      { changeTime: 0, activity: 'DRIVING', cardInserted: false, drivingStatus: 'SINGLE', slot: 'DRIVER' },
    ])
    expect(totals.DRIVING).toBe(1440)
    expect(totals.UNKNOWN).toBe(0)
  })
})

// On a card `slot` is only where the card sat; in VU data the slots are two drivers.
describe('slots', () => {
  const changes = [
    { changeTime: 0, activity: 'BREAK/REST', cardInserted: true, slot: 'CO-DRIVER' },
    { changeTime: 300, activity: 'AVAILABILITY', cardInserted: true, slot: 'CO-DRIVER' },
    { changeTime: 600, activity: 'WORK', cardInserted: false, manualEntry: false, slot: 'CO-DRIVER' },
    { changeTime: 600, activity: 'DRIVING', cardInserted: true, slot: 'DRIVER' },
  ]

  it('keeps both slots of a card day as one timeline', () => {
    const { segments, totals } = buildDaySegments({ source: 'card', activityChangeInfo: changes })
    expect(segments.map((s) => s.activity)).toEqual(['BREAK/REST', 'AVAILABILITY', 'DRIVING'])
    expect(totals).toMatchObject({ 'BREAK/REST': 300, AVAILABILITY: 300, DRIVING: 840, UNKNOWN: 0 })
  })

  it('keeps one slot of a VU day', () => {
    const { totals } = buildDaySegments({ activityChangeInfo: changes })
    expect(totals.DRIVING).toBe(840)
    expect(totals.AVAILABILITY).toBe(0)
  })
})
