// Pure DDD/VU normalization - turns raw flespi tacho-file-parse JSON into the
// normalized record shape the compliance engine and UI consume. Framework-free
// (no Vue/Pinia); the Pinia store (src/stores/ddd.js) imports from here and owns
// only the reactive state/orchestration.

function resolveRegistration(c) {
  const regObj = c.VehicleRegistrationIdentification?.[0]
  if (regObj) return regObj
  const num = c.VehicleRegistrationNumber?.[0]
  if (num) return { vehicleRegistrationNumber: num, vehicleRegistrationNation: '' }
  return {}
}

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
        g1: content.DF_Tachograph || null,
        g2: content.DF_Tachograph_G2 || null,
        enabled: true,
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
        g1: normalizeVuDaily(items),
        g2: null,
        enabled: true,
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
        g1: normalizeVuTechnical(items),
        g2: null,
        enabled: true,
        warning: 'VU file contains no driver activity data — only technical/admin data loaded',
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
      g1: json,
      g2: null,
      enabled: true,
    }
  }

  return null
}

export function extractRecords(data) {
  const empty = { activityRecords: [], vehicleRecords: [], placeRecords: [], eventRecords: [], faultRecords: [], conditionRecords: [], gnssRecords: [], vehicleUnitsUsed: [], companyLocksRecords: [], downloadActivityRecords: [], borderCrossingRecords: [], loadUnloadRecords: [], loadTypeRecords: [], controlActivityRecords: [], gnssAuthRecords: [], placesAuthRecords: [] }
  if (!data) return empty
  return {
    activityRecords: data.EF_Driver_Activity_Data?.CardDriverActivity?.activityDailyRecords || [],
    vehicleRecords: data.EF_Vehicles_Used?.cardVehicleRecords || [],
    placeRecords: data.EF_Places?.placeRecords || [],
    eventRecords: data.EF_Events_Data?.CardEventData?.cardEventRecords || [],
    faultRecords: data.EF_Faults_Data?.CardFaultData?.cardFaultRecords || [],
    conditionRecords: data.EF_Specific_Conditions?.specificConditionRecords || [],
    gnssRecords: data.EF_GNSS_Places?.gnssAccumulatedDrivingRecords || [],
    vehicleUnitsUsed: data.EF_Vehicle_Units_Used?.cardVehicleUnitRecords || [],
    companyLocksRecords: data.VU_Company_Locks || [],
    downloadActivityRecords: data.VU_Download_Activity || [],
    borderCrossingRecords: data.EF_Border_Crossings?.cardBorderCrossingRecords || [],
    loadUnloadRecords: data.EF_Load_Unload_Operations?.cardLoadUnloadRecords || [],
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

export function mergeRecordSets(sources, gen) {
  const all = { activityRecords: [], vehicleRecords: [], placeRecords: [], eventRecords: [], faultRecords: [], conditionRecords: [], gnssRecords: [], vehicleUnitsUsed: [], companyLocksRecords: [], downloadActivityRecords: [], borderCrossingRecords: [], loadUnloadRecords: [], loadTypeRecords: [], controlActivityRecords: [], gnssAuthRecords: [], placesAuthRecords: [] }

  for (const src of sources) {
    const data = gen === 'g2' && src.g2 ? src.g2 : src.g1
    const r = extractRecords(data)
    all.activityRecords.push(...r.activityRecords)
    all.vehicleRecords.push(...r.vehicleRecords)
    all.placeRecords.push(...r.placeRecords)
    all.eventRecords.push(...r.eventRecords)
    all.faultRecords.push(...r.faultRecords)
    all.conditionRecords.push(...r.conditionRecords)
    all.gnssRecords.push(...r.gnssRecords)
    all.vehicleUnitsUsed.push(...r.vehicleUnitsUsed)
    all.companyLocksRecords.push(...r.companyLocksRecords)
    all.downloadActivityRecords.push(...r.downloadActivityRecords)
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
