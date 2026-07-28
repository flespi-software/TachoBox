import { describe, it, expect } from 'vitest'
import { detectAndNormalize, extractRecords, mergeRecordSets, isCompatible } from '../src/utils/ddd.js'

const DAY = 1717977600 // a UTC midnight
const card = (changes) => ({
  EF_Driver_Activity_Data: {
    CardDriverActivity: {
      activityDailyRecords: [{ activityRecordDate: DAY, activityChangeInfo: changes }],
    },
  },
  EF_Identification: { CardIdentification: { cardNumber: 'CARD-1' } },
})

// Unit tests for the normalization adapter that turns raw flespi tacho-file-parse
// JSON into the record shape the compliance engine consumes.
describe('ddd normalization adapter', () => {
  it('detects a raw driver-card object', () => {
    const src = detectAndNormalize(card([{ changeTime: 0, activity: 'DRIVING' }]))
    expect(src.type).toBe('driver-card')
    expect(src.g1).toBeTruthy()
    expect(src.enabled).toBe(true)
  })

  it('detects a VU daily file (result[].content.ActivityChangeInfo)', () => {
    const src = detectAndNormalize({
      result: [{ content: { CurrentDateTime: [DAY], ActivityChangeInfo: [{ changeTime: 0, activity: 'WORK' }] } }],
    })
    expect(src.type).toBe('vu-daily')
  })

  it('returns null for unrecognized JSON', () => {
    expect(detectAndNormalize({ foo: 1 })).toBeNull()
  })

  it('extractRecords pulls out the activity records', () => {
    const src = detectAndNormalize(card([{ changeTime: 0, activity: 'DRIVING' }]))
    const { activityRecords } = extractRecords(src.g1)
    expect(activityRecords).toHaveLength(1)
    expect(activityRecords[0].activityRecordDate).toBe(DAY)
  })

  it('mergeRecordSets keeps the richer record when a day is duplicated', () => {
    const poor = detectAndNormalize(card([{ changeTime: 0, activity: 'DRIVING' }]))
    const rich = detectAndNormalize(card([
      { changeTime: 0, activity: 'DRIVING' },
      { changeTime: 300, activity: 'BREAK/REST' },
      { changeTime: 345, activity: 'DRIVING' },
    ]))
    const { activityRecords } = mergeRecordSets([poor, rich], 'g1')
    expect(activityRecords).toHaveLength(1) // same day deduped
    expect(activityRecords[0].activityChangeInfo).toHaveLength(3) // richer wins
  })

  it('isCompatible rejects mixing card and VU sources', () => {
    const c = detectAndNormalize(card([{ changeTime: 0, activity: 'DRIVING' }]))
    const vu = detectAndNormalize({
      result: [{ content: { CurrentDateTime: [DAY], ActivityChangeInfo: [{ changeTime: 0, activity: 'WORK' }] } }],
    })
    expect(isCompatible(vu, [c])).toBe(false)
    expect(isCompatible(c, [])).toBe(true)
  })
})
