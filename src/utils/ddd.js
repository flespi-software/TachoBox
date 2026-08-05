// Pure DDD/VU normalization - turns raw flespi tacho-file-parse JSON into the
// normalized record shape the compliance engine and UI consume. Framework-free
// (no Vue/Pinia); the Pinia store (src/stores/ddd.js) imports from here and owns
// only the reactive state/orchestration.

// Single-element arrays were collapsed to scalars in the current parser output;
// older output still wraps them. Read either.
const scalar = (v) => (Array.isArray(v) ? v[0] : v)

// UTC midnight of the day a timestamp falls in. Kept local to this module so it
// stays free of the app's date formatting, which is Vue-reactive.
const dayStart = (ts) => ts - (ts % 86400)

// Vehicle-unit files decoded before the tachograph plugin was corrected are
// still readable, but the decoder mis-interpreted the mass-memory layout, so the
// result cannot be trusted. Shown as a warning rather than a hard failure so a
// previously saved JSON still opens.
const OUTDATED_VU_WARNING = 'This vehicle unit file was decoded by an older version of the parser and its data may be incomplete or wrong. Upload the original DDD file again to have it decoded properly.'
// Exact i18n keys - the English text is the key, so these must match the
// entries in src/i18n/ character for character, em dash included.
const NO_ACTIVITY_WARNING = 'VU file contains no driver activity data — only technical/admin data loaded'

function resolveRegistration(c) {
  const regObj = scalar(c.VehicleRegistrationIdentification)
  if (regObj) return regObj
  const num = scalar(c.VehicleRegistrationNumber)
  if (num) return { vehicleRegistrationNumber: num, vehicleRegistrationNation: '' }
  return {}
}

// The GNSS sub-object goes by several names depending on generation, file kind
// and parser version: gnssPlaceRecord / gnssPlaceAuthRecord (authenticated,
// Gen2v2), their entryGNSS* equivalents inside place records, and the older
// capitalised GNSSPlaceAuthRecord. Canonicalize on read so every consumer has
// exactly one name per record type and none of them has to know the variants.
const GNSS_ALIASES = [
  'gnssPlaceRecord', 'gnssPlaceAuthRecord', 'GNSSPlaceAuthRecord',
  'entryGNSSPlaceRecord', 'entryGNSSPlaceAuthRecord',
]

function canonicalGnss(record, target) {
  if (!record || record[target]) return record
  for (const alias of GNSS_ALIASES) {
    if (record[alias]) return { ...record, [target]: record[alias] }
  }
  return record
}

// A place entry nests its fields in `placeRecord` in current parser output and
// carries them flat in older output. Flatten, then canonicalize its GNSS entry.
const normalizePlace = (r) => canonicalGnss({ ...(r?.placeRecord || r) }, 'entryGNSSPlaceRecord')

function normalizeVuDaily(items) {
  const activityDailyRecords = items.map((item) => {
    const c = item.content
    const currentDateTime = c.CurrentDateTime?.[0] || 0
    const dayTs = currentDateTime - (currentDateTime % 86400)
    return {
      activityRecordDate: dayTs,
      activityChangeInfo: c.ActivityChangeInfo || [],
      activityDayDistance: 0,
    }
  })

  const firstMeta = items[0].meta || {}

  const companyLocksMap = new Map()
  const downloadActivityMap = new Map()
  for (const item of items) {
    const c = item.content
    for (const lock of (c.VuCompanyLocksData || [])) {
      const key = `${lock.lockInTime}:${lock.companyName}`
      if (!companyLocksMap.has(key)) companyLocksMap.set(key, lock)
    }
    for (const dl of (c.VuDownloadActivityData || [])) {
      const key = `${dl.downloadingTime}:${dl.companyOrWorkshopName}`
      if (!downloadActivityMap.has(key)) downloadActivityMap.set(key, dl)
    }
  }

  return {
    EF_Driver_Activity_Data: {
      CardDriverActivity: { activityDailyRecords },
    },
    EF_Identification: {
      CardIdentification: {
        cardNumber: firstMeta.plate_number || '',
        cardIssuingMemberState: firstMeta.region || '',
      },
      DriverCardHolderIdentification: {
        cardHolderName: {
          holderSurname: firstMeta.vin || firstMeta.plate_number || 'Vehicle Unit',
          holderFirstNames: '',
        },
      },
    },
    EF_Vehicles_Used: {
      cardVehicleRecords: items.map((item) => {
        const c = item.content
        const ts = c.CurrentDateTime?.[0] || 0
        const dayTs = ts - (ts % 86400)
        return {
          vehicleRegistration: resolveRegistration(c),
          vehicleFirstUse: dayTs,
          vehicleLastUse: dayTs + 86399,
          vehicleOdometerBegin: c.OdometerValueMidnight?.[0] ?? 0,
          vehicleOdometerEnd: c.OdometerValueMidnight?.[0] ?? 0,
        }
      }),
    },
    VU_Company_Locks: [...companyLocksMap.values()],
    VU_Download_Activity: [...downloadActivityMap.values()],
  }
}

// Vehicle-unit (mass memory) download. Unlike a driver card, where the days sit
// in one contiguous structure, a VU file carries them as separate per-day blocks
// under VuActivities - each with its own activity list, date, odometer and
// per-day sub-records. The file-wide fields live in VuOverview, and everything
// is wrapped in VU_Tachograph (Gen1) or VU_Tachograph_G2 (Gen2), which is also
// the generation marker.
function normalizeVuMemory(vu, meta = {}) {
  const content = { ...(vu.VuOverview || {}) }
  const eventsAndFaults = vu.VuEventsAndFaults || {}
  const technical = vu.VuTechnicalData || {}
  const days = [...(vu.VuActivities || [])]
    .filter((d) => d && d.DateOfDayDownloaded)
    .sort((a, b) => a.DateOfDayDownloaded - b.DateOfDayDownloaded)

  // Distance per day is the gap between consecutive midnight odometer readings.
  // The last day has no following reading, so it stays 0 rather than guessing.
  const activityDailyRecords = days.map((d, i) => {
    const odo = d.OdometerValueMidnight ?? 0
    const nextOdo = days[i + 1]?.OdometerValueMidnight
    return {
      // The parser reports the day as 23:59:59 of that day, while the engine's
      // contract is UTC midnight - normalize so day keys line up everywhere.
      activityRecordDate: dayStart(d.DateOfDayDownloaded),
      activityChangeInfo: d.ActivityChangeInfo || [],
      activityDayDistance: odo && nextOdo != null ? Math.max(0, nextOdo - odo) : 0,
    }
  })

  // Per-day sub-records are collected across the whole download. Record naming
  // differences between a VU and a card are ironed out in extractRecords, which
  // every consumer goes through, so nothing type-specific is needed here.
  const collect = (key) => days.flatMap((d) => d[key] || [])

  const first = days[0]
  const last = days[days.length - 1]
  const vin = meta.vin || scalar(content.VehicleIdentificationNumber) || ''

  return {
    EF_Driver_Activity_Data: {
      CardDriverActivity: { activityDailyRecords },
    },
    EF_Identification: {
      CardIdentification: {
        cardNumber: meta.plate_number || resolveRegistration(content).vehicleRegistrationNumber || '',
        cardIssuingMemberState: meta.region || resolveRegistration(content).vehicleRegistrationNation || '',
      },
      DriverCardHolderIdentification: {
        cardHolderName: {
          holderSurname: vin || meta.plate_number || 'Vehicle Unit',
          holderFirstNames: '',
        },
      },
    },
    // One vehicle for the whole download, spanning the days it covers, rather
    // than one pseudo-vehicle per day as the previous VU handling produced.
    EF_Vehicles_Used: {
      cardVehicleRecords: first ? [{
        vehicleRegistration: resolveRegistration(content),
        vehicleFirstUse: dayStart(first.DateOfDayDownloaded),
        vehicleLastUse: dayStart(last.DateOfDayDownloaded) + 86399,
        vehicleOdometerBegin: first.OdometerValueMidnight ?? 0,
        vehicleOdometerEnd: last.OdometerValueMidnight ?? 0,
      }] : [],
    },
    // Over-speeding records are events in their own right (type 7) and share the
    // event shape, so they join the event list rather than hiding in a block of
    // their own. The VU stores the same event once per eventRecordPurpose, and
    // mergeRecordSets dedups on begin time + type, which collapses those back
    // into one row.
    EF_Events_Data: {
      CardEventData: {
        cardEventRecords: [
          ...(eventsAndFaults.VuEventRecords || []),
          ...(eventsAndFaults.VuOverSpeedingEventRecords || []),
          // Power cuts are recorded under technical data but carry the event
          // shape and an event type of their own, so they belong in the list.
          ...(technical.VuPowerSupplyInterruptionRecords || []),
        ],
      },
    },
    EF_Faults_Data: { CardFaultData: { cardFaultRecords: eventsAndFaults.VuFaultRecords || [] } },
    EF_Places: { placeRecords: collect('VuPlaceDailyWorkPeriodData') },
    EF_GNSS_Places: { gnssAccumulatedDrivingRecords: collect('VuGNSSADRecords') },
    EF_Specific_Conditions: { specificConditionRecords: collect('VuSpecificConditionData') },
    EF_Border_Crossings: { cardBorderCrossingRecords: collect('VuBorderCrossingRecords') },
    EF_Load_Unload_Operations: { cardLoadUnloadRecords: collect('VuLoadUnloadRecords') },
    EF_Control_Activity_Data: scalar(content.VuControlActivityData) || null,
    // Card insertion/withdrawal cycles: which driver cards were used in this
    // vehicle and when. The mirror of a card's "vehicles used" list, and the
    // only place a VU file names the people who drove it.
    VU_Card_IW: collect('VuCardIWData'),
    // Equipment data about the vehicle unit itself: who built it, how it was
    // calibrated, which sensors are paired and which cards it knows. Not
    // time-series, so it is kept as one object rather than a record list.
    // Gen1 names the paired sensor SensorPaired and carries a single object;
    // Gen2 uses VuSensorPaired and allows several.
    // Per-second speed, one block per minute the vehicle was moving. Kept raw:
    // the chart thins it, and thinning depends on the visible range.
    VU_Detailed_Speed: vu.VuDetailedSpeed?.VuDetailedSpeedBlocks || [],
    VU_Technical: {
      identification: technical.VuIdentification || null,
      calibrations: technical.VuCalibrationData || [],
      sensors: technical.VuSensorPaired || (technical.SensorPaired ? [technical.SensorPaired] : []),
      gnssSensors: technical.VuSensorExternalGNSSCoupled || [],
      cards: technical.VuCardRecords || [],
      itsConsent: technical.VuITSConsentRecords || [],
    },
    VU_Company_Locks: content.VuCompanyLocksData || [],
    VU_Download_Activity: content.VuDownloadActivityData || [],
  }
}

function normalizeVuTechnical(items) {
  const firstMeta = items[0].meta || {}
  const first = items[0].content || {}

  const companyLocksMap = new Map()
  const downloadActivityMap = new Map()
  for (const item of items) {
    const c = item.content
    for (const lock of (c.VuCompanyLocksData || [])) {
      const key = `${lock.lockInTime}:${lock.companyName}`
      if (!companyLocksMap.has(key)) companyLocksMap.set(key, lock)
    }
    for (const dl of (c.VuDownloadActivityData || [])) {
      const key = `${dl.downloadingTime}:${dl.companyOrWorkshopName}`
      if (!downloadActivityMap.has(key)) downloadActivityMap.set(key, dl)
    }
  }

  return {
    EF_Driver_Activity_Data: {
      CardDriverActivity: { activityDailyRecords: [] },
    },
    EF_Identification: {
      CardIdentification: {
        cardNumber: firstMeta.plate_number || '',
        cardIssuingMemberState: firstMeta.region || '',
      },
      DriverCardHolderIdentification: {
        cardHolderName: {
          holderSurname: firstMeta.vin || firstMeta.plate_number || 'Vehicle Unit',
          holderFirstNames: '',
        },
      },
    },
    EF_Vehicles_Used: {
      cardVehicleRecords: [{
        vehicleRegistration: resolveRegistration(first),
        vehicleFirstUse: first.CurrentDateTime?.[0] || 0,
        vehicleLastUse: first.CurrentDateTime?.[0] || 0,
        vehicleOdometerBegin: 0,
        vehicleOdometerEnd: 0,
      }],
    },
    VU_Company_Locks: [...companyLocksMap.values()],
    VU_Download_Activity: [...downloadActivityMap.values()],
  }
}

export function detectAndNormalize(json) {
  if (json.result && Array.isArray(json.result)) {
    const items = json.result
    if (!items.length) return null

    const first = items[0]
    const content = first.content

    if (content?.DF_Tachograph || content?.DF_Tachograph_G2) {
      const cardNumber = content.DF_Tachograph?.EF_Identification?.CardIdentification?.cardNumber
        || content.DF_Tachograph_G2?.EF_Identification?.CardIdentification?.cardNumber || ''
      const downloadTs = content.DF_Tachograph?.EF_Card_Download?.LastCardDownload || 0
      return {
        type: 'driver-card',
        uuid: first.uuid || null,
        key: `card:${cardNumber}`,
        downloadTs,
        meta: first.meta || {},
        name: first.name || '',
        // A driver card physically carries both applications; the user picks
        // which to view. `generation` is the richest one present.
        generation: content.DF_Tachograph_G2 ? 'g2' : 'g1',
        byGeneration: {
          g1: content.DF_Tachograph || null,
          g2: content.DF_Tachograph_G2 || null,
        },
        enabled: true,
      }
    }

    // Current VU (mass memory) layout: everything under a generation wrapper,
    // file-wide fields in VuOverview, one object per day in VuActivities.
    const vu = content?.VU_Tachograph_G2 || content?.VU_Tachograph
    if (vu) {
      // The wrapper name is the generation marker. A VU download carries only
      // one generation, unlike a card, which holds both applications side by
      // side - so it is recorded here rather than inferred from the g1/g2 slots.
      const generation = content.VU_Tachograph_G2 ? 'g2' : 'g1'
      const overview = vu.VuOverview || {}
      const meta = first.meta || {}
      const vin = meta.vin || scalar(overview.VehicleIdentificationNumber) || ''
      const plate = meta.plate_number || resolveRegistration(overview).vehicleRegistrationNumber || ''
      return {
        type: 'vu-daily',
        uuid: first.uuid || null,
        key: `vu:${vin || plate}`,
        downloadTs: scalar(overview.CurrentDateTime) || 0,
        meta,
        name: first.name || '',
        generation,
        // A vehicle unit download is one generation only - it is stored under
        // its own key, never under the other one.
        byGeneration: { [generation]: normalizeVuMemory(vu, meta) },
        enabled: true,
        warning: vu.VuActivities?.length ? null : NO_ACTIVITY_WARNING,
      }
    }

    // Legacy VU layouts, from before the decoder was corrected: one item per day
    // with the activity directly under content, or a flat VuActivities array.
    // The data itself is unreliable, so it loads with a warning telling the user
    // to have the file decoded again. See isOutdatedVuFormat().
    if (content?.VuActivities?.length) {
      const vin = first.meta?.vin || scalar(content.VehicleIdentificationNumber) || ''
      const plate = first.meta?.plate_number || resolveRegistration(content).vehicleRegistrationNumber || ''
      return {
        type: 'vu-daily',
        uuid: first.uuid || null,
        key: `vu:${vin || plate}`,
        downloadTs: scalar(content.CurrentDateTime) || 0,
        meta: first.meta || {},
        name: first.name || '',
        generation: 'g1',
        byGeneration: { g1: normalizeVuMemory({ VuOverview: content, VuActivities: content.VuActivities }, first.meta || {}) },
        enabled: true,
        warning: OUTDATED_VU_WARNING,
      }
    }

    if (content?.ActivityChangeInfo?.length) {
      const vin = first.meta?.vin || content.VehicleIdentificationNumber?.[0] || ''
      const plate = first.meta?.plate_number || content.VehicleRegistrationIdentification?.[0]?.vehicleRegistrationNumber || content.VehicleRegistrationNumber?.[0] || ''
      return {
        type: 'vu-daily',
        uuid: first.uuid || null,
        key: `vu:${vin || plate}`,
        downloadTs: content.CurrentDateTime?.[0] || 0,
        meta: first.meta || {},
        name: first.name || '',
        generation: 'g1',
        byGeneration: { g1: normalizeVuDaily(items) },
        enabled: true,
        warning: OUTDATED_VU_WARNING,
      }
    }

    if (content?.VehicleIdentificationNumber || content?.VuCompanyLocksData || content?.VuDownloadActivityData) {
      const vin = first.meta?.vin || content.VehicleIdentificationNumber?.[0] || ''
      const plate = first.meta?.plate_number || resolveRegistration(content).vehicleRegistrationNumber || ''
      return {
        type: 'vu-daily',
        uuid: first.uuid || null,
        key: `vu:${vin || plate}`,
        downloadTs: content.CurrentDateTime?.[0] || 0,
        meta: first.meta || {},
        name: first.name || '',
        generation: 'g1',
        byGeneration: { g1: normalizeVuTechnical(items) },
        enabled: true,
        warning: OUTDATED_VU_WARNING,
      }
    }
  }

  if (json.EF_Application_Identification || json.EF_Driver_Activity_Data) {
    const cardNumber = json.EF_Identification?.CardIdentification?.cardNumber || ''
    const downloadTs = json.EF_Card_Download?.LastCardDownload || 0
    return {
      type: 'driver-card',
      uuid: null,
      key: `card:${cardNumber || 'local'}`,
      downloadTs,
      meta: {},
      name: '',
      generation: 'g1',
      byGeneration: { g1: json },
      enabled: true,
    }
  }

  return null
}

export function extractRecords(data) {
  const empty = { activityRecords: [], vehicleRecords: [], placeRecords: [], placeCapacity: null, eventRecords: [], faultRecords: [], conditionRecords: [], gnssRecords: [], vehicleUnitsUsed: [], companyLocksRecords: [], downloadActivityRecords: [], driverRecords: [], technicalData: null, speedBlocks: [], borderCrossingRecords: [], loadUnloadRecords: [], loadTypeRecords: [], controlActivityRecords: [], gnssAuthRecords: [], placesAuthRecords: [] }
  if (!data) return empty
  return {
    activityRecords: data.EF_Driver_Activity_Data?.CardDriverActivity?.activityDailyRecords || [],
    vehicleRecords: data.EF_Vehicles_Used?.cardVehicleRecords || [],
    placeRecords: (data.EF_Places?.placeRecords || []).map(normalizePlace),
    // How many place records the card can hold. Its place storage is a ring
    // buffer, so this is what tells a full (wrapped) buffer from a partly used
    // one - see detectUsageErrors.
    placeCapacity: data.EF_Application_Identification?.DriverCardApplicationIdentification?.noOfCardPlaceRecords
      ?? data.EF_Application_Identification?.noOfCardPlaceRecords ?? null,
    eventRecords: data.EF_Events_Data?.CardEventData?.cardEventRecords || [],
    faultRecords: data.EF_Faults_Data?.CardFaultData?.cardFaultRecords || [],
    conditionRecords: data.EF_Specific_Conditions?.specificConditionRecords || [],
    gnssRecords: (data.EF_GNSS_Places?.gnssAccumulatedDrivingRecords || []).map((r) => canonicalGnss(r, 'gnssPlaceRecord')),
    vehicleUnitsUsed: data.EF_Vehicle_Units_Used?.cardVehicleUnitRecords || [],
    companyLocksRecords: data.VU_Company_Locks || [],
    downloadActivityRecords: data.VU_Download_Activity || [],
    driverRecords: data.VU_Card_IW || [],
    technicalData: data.VU_Technical || null,
    speedBlocks: data.VU_Detailed_Speed || [],
    borderCrossingRecords: (data.EF_Border_Crossings?.cardBorderCrossingRecords || []).map((r) => canonicalGnss(r, 'gnssPlaceAuthRecord')),
    loadUnloadRecords: (data.EF_Load_Unload_Operations?.cardLoadUnloadRecords || []).map((r) => canonicalGnss(r, 'gnssPlaceAuthRecord')),
    loadTypeRecords: data.EF_Load_Type_Entries?.cardLoadTypeEntryRecords || [],
    controlActivityRecords: data.EF_Control_Activity_Data ? [data.EF_Control_Activity_Data].filter((r) => r.controlTime > 0) : [],
    gnssAuthRecords: data.EF_GNSS_Places_Authentication?.gnssAuthStatusADRecords || [],
    placesAuthRecords: data.EF_Places_Authentication?.placeAuthStatusRecords || [],
  }
}

function dedup(arr, keyFn) {
  const seen = new Map()
  for (const item of arr) {
    const k = keyFn(item)
    if (!seen.has(k)) seen.set(k, item)
  }
  return [...seen.values()]
}

// Dedup keeping, per key, the item ranked best by `better` (a < b -> a wins).
// Used where two sources can carry the same key with different richness and the
// first-wins of dedup() would silently drop the better record.
function dedupBest(arr, keyFn, better) {
  const seen = new Map()
  for (const item of arr) {
    const k = keyFn(item)
    const prev = seen.get(k)
    if (!prev || better(item, prev) < 0) seen.set(k, item)
  }
  return [...seen.values()]
}

// The payload of a source for the requested generation. A driver card holds two
// applications and honours the choice; a vehicle unit holds one and returns it
// whatever is asked, so a global G1/G2 toggle can never blank it out.
export function sourceData(src, gen) {
  const by = src?.byGeneration
  if (!by) return null
  return by[gen] || by[src.generation] || by.g2 || by.g1 || null
}

export function mergeRecordSets(sources, gen) {
  const all = { activityRecords: [], vehicleRecords: [], placeRecords: [], placeCapacity: null, eventRecords: [], faultRecords: [], conditionRecords: [], gnssRecords: [], vehicleUnitsUsed: [], companyLocksRecords: [], downloadActivityRecords: [], driverRecords: [], technicalData: null, speedBlocks: [], borderCrossingRecords: [], loadUnloadRecords: [], loadTypeRecords: [], controlActivityRecords: [], gnssAuthRecords: [], placesAuthRecords: [] }

  for (const src of sources) {
    const data = sourceData(src, gen)
    const r = extractRecords(data)
    all.activityRecords.push(...r.activityRecords)
    all.vehicleRecords.push(...r.vehicleRecords)
    all.placeRecords.push(...r.placeRecords)
    if (all.placeCapacity == null) all.placeCapacity = r.placeCapacity
    all.eventRecords.push(...r.eventRecords)
    all.faultRecords.push(...r.faultRecords)
    all.conditionRecords.push(...r.conditionRecords)
    all.gnssRecords.push(...r.gnssRecords)
    all.vehicleUnitsUsed.push(...r.vehicleUnitsUsed)
    all.companyLocksRecords.push(...r.companyLocksRecords)
    all.downloadActivityRecords.push(...r.downloadActivityRecords)
    all.driverRecords.push(...r.driverRecords)
    if (!all.technicalData && r.technicalData?.identification) all.technicalData = r.technicalData
    all.speedBlocks.push(...r.speedBlocks)
    all.borderCrossingRecords.push(...r.borderCrossingRecords)
    all.loadUnloadRecords.push(...r.loadUnloadRecords)
    all.loadTypeRecords.push(...r.loadTypeRecords)
    all.controlActivityRecords.push(...r.controlActivityRecords)
    all.gnssAuthRecords.push(...r.gnssAuthRecords)
    all.placesAuthRecords.push(...r.placesAuthRecords)
  }

  // Activity is keyed on the calendar day, but two sources (e.g. driver card + VU,
  // or overlapping downloads) can both carry that day with different content -
  // keep the richer record (more activity changes) rather than first-wins, so a
  // day's driving isn't silently dropped before compliance runs.
  all.activityRecords = dedupBest(
    all.activityRecords,
    (r) => r.activityRecordDate,
    (a, b) => (b.activityChangeInfo?.length || 0) - (a.activityChangeInfo?.length || 0),
  )
  all.gnssRecords = dedup(all.gnssRecords, (r) => r.gnssPlaceRecord?.timeStamp || r.timeStamp)
  all.conditionRecords = dedup(all.conditionRecords, (r) => `${r.entryTime}:${r.specificConditionType}`)
  all.eventRecords = dedup(all.eventRecords, (r) => `${r.eventBeginTime}:${r.eventType}`)
  all.faultRecords = dedup(all.faultRecords, (r) => `${r.faultBeginTime}:${r.faultType}`)
  all.placeRecords = dedup(all.placeRecords, (r) => `${r.entryTime}:${r.entryTypeDailyWorkPeriod}`)
  all.vehicleRecords = dedup(all.vehicleRecords, (r) => `${r.vehicleFirstUse}:${r.vehicleLastUse}`)
  all.companyLocksRecords = dedup(all.companyLocksRecords, (r) => `${r.lockInTime}:${r.companyName}`)
  all.downloadActivityRecords = dedup(all.downloadActivityRecords, (r) => `${r.downloadingTime}:${r.companyOrWorkshopName}`)
  all.speedBlocks = dedup(all.speedBlocks, (r) => `${r.speedBlockBeginDate}`)
  all.driverRecords = dedup(all.driverRecords, (r) => `${r.cardInsertionTime}:${r.FullCardNumberAndGeneration?.FullCardNumber?.driverIdentification || r.FullCardNumber?.driverIdentification || ''}`)
  all.borderCrossingRecords = dedup(all.borderCrossingRecords, (r) => `${r.gnssPlaceAuthRecord?.timeStamp}`)
  all.loadUnloadRecords = dedup(all.loadUnloadRecords, (r) => `${r.timeStamp}:${r.operationType}`)
  all.loadTypeRecords = dedup(all.loadTypeRecords, (r) => `${r.timeStamp}:${r.loadTypeEntered}`)

  return all
}

export function isCompatible(src, enabledSources) {
  if (!enabledSources.length) return true
  for (const existing of enabledSources) {
    // Don't mix VU and driver card sources
    if (src.type !== existing.type) return false
    if (src.type === 'driver-card' && src.key !== existing.key) return false
    if (src.type === 'vu-daily' && src.key !== existing.key) return false
  }
  return true
}
