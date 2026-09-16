import { describe, it, expect } from 'vitest'
import { buildDaySegments } from '../src/utils/activity.js'
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

  it('does not report the rest of that day as unaccounted time', () => {
    const bounded = detectAnomalies([record({ recordedUntilMin: 371 })], [])
    expect(bounded.filter((a) => a.type === 'unaccounted')).toHaveLength(0)
  })
})
