import { describe, it, expect } from 'vitest'
import { detectAndNormalize, extractRecords, mergeRecordSets, isCompatible, sourceData } from '../src/utils/ddd.js'

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
    expect(src.byGeneration.g1).toBeTruthy()
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
    const { activityRecords } = extractRecords(src.byGeneration.g1)
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

// A vehicle-unit download carries its days as separate blocks under VuActivities,
// each with per-day sub-records, and names some of them differently from a driver
// card. These pin that mapping: the shapes below are taken from real parser output.
describe('VU mass-memory normalization', () => {
  // Current layout: everything under a generation wrapper, file-wide fields in
  // VuOverview, one object per day in VuActivities, single-element arrays
  // collapsed to scalars.
  const vuFile = {
    result: [{
      content: {
        VU_Tachograph_G2: {
          VuOverview: {
            CurrentDateTime: DAY + 2 * 86400,
            VehicleIdentificationNumber: 'VIN-1',
            VehicleRegistrationIdentification: { vehicleRegistrationNumber: 'B-220-AFL', vehicleRegistrationNation: 'RO' },
            VuCompanyLocksData: [{ lockInTime: DAY, companyName: 'Co' }],
          },
          VuActivities: [
          {
            DateOfDayDownloaded: DAY,
            OdometerValueMidnight: 1000,
            ActivityChangeInfo: [{ changeTime: 0, activity: 'DRIVING', slot: 'DRIVER', cardInserted: true }],
            VuGNSSADRecords: [{
              timeStamp: DAY + 3600,
              vehicleOdometerValue: 1050,
              gnssPlaceAuthRecord: { geoCoordinates: { latitude: 44.86, longitude: 24.86 }, timeStamp: DAY + 3600 },
            }],
            VuPlaceDailyWorkPeriodData: [{
              FullCardNumberAndGeneration: {},
              placeRecord: { entryTime: DAY + 60, entryTypeDailyWorkPeriod: 'Begin', dailyWorkPeriodCountry: 'RO', vehicleOdometerValue: 1000 },
            }],
            VuBorderCrossingRecords: [
              { countryLeft: 'RO', countryEntered: 'HU', gnssPlaceAuthRecord: { geoCoordinates: { latitude: 46.2, longitude: 20.75 }, timeStamp: DAY + 7200 } },
              { countryLeft: 'HU', countryEntered: 'AT', gnssPlaceAuthRecord: { geoCoordinates: { latitude: 47.1, longitude: 16.4 }, timeStamp: DAY + 14400 } },
            ],
          },
          {
            DateOfDayDownloaded: DAY + 86400,
            OdometerValueMidnight: 1400,
            ActivityChangeInfo: [{ changeTime: 0, activity: 'BREAK/REST', slot: 'DRIVER', cardInserted: true }],
          },
          ],
        },
      },
    }],
  }

  it('reads every day out of VuActivities', () => {
    const src = detectAndNormalize(vuFile)
    expect(src.type).toBe('vu-daily')
    expect(src.warning).toBeFalsy() // must not fall through to a legacy or technical-only branch
    expect(src.generation).toBe('g2') // taken from the VU_Tachograph_G2 wrapper
    const { activityRecords } = extractRecords(sourceData(src, 'g2'))
    expect(activityRecords).toHaveLength(2)
    expect(activityRecords[0].activityRecordDate).toBe(DAY)
  })

  // Distance comes from the gap between consecutive midnight odometer readings;
  // the last day has no following reading, so it stays 0 rather than guessing.
  it('derives daily distance from midnight odometer readings', () => {
    const { activityRecords } = extractRecords(sourceData(detectAndNormalize(vuFile), 'g2'))
    expect(activityRecords[0].activityDayDistance).toBe(400)
    expect(activityRecords[1].activityDayDistance).toBe(0)
  })

  it('spans the whole download with one vehicle record', () => {
    const { vehicleRecords } = extractRecords(sourceData(detectAndNormalize(vuFile), 'g2'))
    expect(vehicleRecords).toHaveLength(1)
    expect(vehicleRecords[0].vehicleOdometerBegin).toBe(1000)
    expect(vehicleRecords[0].vehicleOdometerEnd).toBe(1400)
  })

  // A VU file calls the GNSS position GNSSPlaceAuthRecord and wraps places in
  // placeRecord; both are remapped to the driver-card shape the UI reads.
  it('maps GNSS and place records to the card shape', () => {
    const { gnssRecords, placeRecords } = mergeRecordSets([detectAndNormalize(vuFile)], 'g1')
    expect(gnssRecords[0].gnssPlaceRecord.geoCoordinates.latitude).toBe(44.86)
    expect(placeRecords[0].entryTime).toBe(DAY + 60)
    expect(placeRecords[0].dailyWorkPeriodCountry).toBe('RO')
  })

  // Files decoded before the plugin was corrected still open, but their data
  // cannot be trusted, so they must carry a warning telling the user to have the
  // original DDD decoded again.
  it('flags a VU file decoded by the older parser', () => {
    const legacy = {
      result: [{
        content: {
          CurrentDateTime: [DAY],
          VehicleIdentificationNumber: ['VIN-1'],
          ActivityChangeInfo: [{ changeTime: 0, activity: 'DRIVING', slot: 'DRIVER', cardInserted: true }],
        },
      }],
    }
    const src = detectAndNormalize(legacy)
    expect(src.type).toBe('vu-daily')
    expect(src.warning).toMatch(/older version of the parser/i)
  })

  // Border crossings key off gnssPlaceAuthRecord - a different target name from
  // GNSS records. Getting it wrong is silent: every record hashes to the same
  // dedup key and the whole set collapses to one row.
  it('maps border crossings without collapsing them in dedup', () => {
    const { borderCrossingRecords } = mergeRecordSets([detectAndNormalize(vuFile)], 'g1')
    expect(borderCrossingRecords).toHaveLength(2)
    expect(borderCrossingRecords[0].gnssPlaceAuthRecord.timeStamp).toBe(DAY + 7200)
    expect(borderCrossingRecords[0].countryEntered).toBe('HU')
  })
})
