import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

import { detectAndNormalize, mergeRecordSets, isCompatible } from '../utils/ddd'
import { formatDayParts } from '../utils/format'

export const useDddStore = defineStore('ddd', () => {
  const sources = ref([])
  const activeGen = ref('g1')
  const loadError = ref(null)
  const loading = ref(false)

  function setLoadError(err) {
    loadError.value = err
  }

  function clearLoadError() {
    loadError.value = null
  }

  const enabledSources = computed(() => sources.value.filter((s) => s.enabled))

  const hasG1 = computed(() => enabledSources.value.some((s) => !!s.g1))
  const hasG2 = computed(() => enabledSources.value.some((s) => !!s.g2))

  // Keep activeGen valid: if no enabled source carries G2 data (e.g. after the
  // last G2 source is disabled or removed), fall back to G1. Without this it
  // stays 'g2' and the generation selector / indicator misreport the data.
  watch(hasG2, (g2) => { if (!g2 && activeGen.value === 'g2') activeGen.value = 'g1' })

  const raw = computed(() => {
    if (!enabledSources.value.length) return null
    const driverCard = enabledSources.value.find((s) => s.type === 'driver-card')
    const src = driverCard || enabledSources.value[0]
    return activeGen.value === 'g2' && src.g2 ? src.g2 : src.g1
  })

  const sourceType = computed(() => {
    if (!enabledSources.value.length) return null
    const driverCard = enabledSources.value.find((s) => s.type === 'driver-card')
    return driverCard ? 'driver-card' : enabledSources.value[0].type
  })

  const fileNames = computed(() => enabledSources.value.map((s) => s.name).filter(Boolean))

  const printTitle = computed(() => {
    if (!enabledSources.value.length) return ''
    const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).replace(/\//g, '.') : ''
    const src = enabledSources.value[0]
    let subject = ''
    if (sourceType.value === 'driver-card') {
      const r = raw.value
      const holder = r?.EF_Identification?.DriverCardHolderIdentification?.cardHolderName
      subject = holder ? [holder.holderSurname, holder.holderFirstNames].filter(Boolean).join(' ') : ''
    }
    if (!subject) subject = src.meta?.plate_number || src.meta?.vin || ''
    if (!subject) subject = fileNames.value[0] || 'TachoBox'
    const recs = allActivityRecords.value
    if (!recs.length) return subject
    const sorted = recs.map((rec) => rec.activityRecordDate).filter(Boolean).sort((a, b) => a - b)
    return `${subject} ${fmtDate(sorted[0])} - ${fmtDate(sorted[sorted.length - 1])}`
  })
  const fileCount = computed(() => sources.value.length)

  function toggleSource(index) {
    const src = sources.value[index]
    if (!src) return null

    if (src.enabled) {
      src.enabled = false
      return null
    }

    // Check compatibility before enabling
    const currentlyEnabled = sources.value.filter((s, i) => s.enabled && i !== index)
    if (!isCompatible(src, currentlyEnabled)) {
      return 'Incompatible with currently enabled files (different driver or vehicle)'
    }

    src.enabled = true
    if (src.g2 && activeGen.value === 'g1') {
      activeGen.value = 'g2'
    }
    return null
  }

  function addData(json, name, { deviceId = null } = {}) {
    const normalized = detectAndNormalize(json)
    if (!normalized) return { error: 'Unrecognized file format. The file may contain data but the parser does not support this format yet.' }

    loadError.value = null

    normalized.name = name || normalized.name || ''
    normalized.rawJson = json
    normalized.deviceId = deviceId

    // Dedup by uuid
    if (normalized.uuid) {
      const existing = sources.value.findIndex((s) => s.uuid === normalized.uuid)
      if (existing >= 0) return { error: null, skipped: true }
    }

    // Driver card: replace if same key and older download
    if (normalized.type === 'driver-card') {
      const idx = sources.value.findIndex((s) => s.type === 'driver-card' && s.key === normalized.key)
      if (idx >= 0) {
        if (normalized.downloadTs >= sources.value[idx].downloadTs) {
          normalized.enabled = sources.value[idx].enabled
          sources.value.splice(idx, 1, normalized)
        }
        return { error: null }
      }
    }

    // Check compatibility with current enabled set
    const currentlyEnabled = sources.value.filter((s) => s.enabled)
    const compatible = isCompatible(normalized, currentlyEnabled)
    normalized.enabled = compatible

    sources.value.push(normalized)

    if (normalized.enabled && normalized.g2 && activeGen.value === 'g1') {
      activeGen.value = 'g2'
    }

    if (!compatible && currentlyEnabled.length) {
      return { error: null, warning: normalized.warning || null, conflict: true, newIndex: sources.value.length - 1 }
    }

    return { error: null, warning: normalized.warning || null }
  }

  function enableOnly(index) {
    sources.value.forEach((s, i) => { s.enabled = i === index })
    const src = sources.value[index]
    if (src?.g2 && activeGen.value === 'g1') activeGen.value = 'g2'
  }

  function removeSource(index) {
    sources.value.splice(index, 1)
    if (!sources.value.length) activeGen.value = 'g1'
  }

  function clearData() {
    sources.value = []
    activeGen.value = 'g1'
    loadError.value = null
    clearDateRange()
  }

  function setData(json, name) {
    clearData()
    return addData(json, name)
  }

  function autoResetDateRange() {
    if (!dateFrom.value && !dateTo.value) return
    const recs = allActivityRecords.value
    if (!recs.length) { clearDateRange(); return }
    const sorted = recs.map((r) => r.activityRecordDate).filter(Boolean).sort((a, b) => a - b)
    const dataMin = sorted[0]
    const dataMax = sorted[sorted.length - 1]
    const from = dateFrom.value || dataMin
    const to = dateTo.value || dataMax
    if (to < dataMin || from > dataMax) clearDateRange()
  }

  const merged = computed(() => mergeRecordSets(enabledSources.value, activeGen.value))

  // Date range filter
  const dateFrom = ref(null)
  const dateTo = ref(null)

  function setDateRange(from, to) {
    dateFrom.value = from
    dateTo.value = to
  }

  function clearDateRange() {
    dateFrom.value = null
    dateTo.value = null
  }

  function inRange(ts) {
    if (!ts) return true
    if (dateFrom.value && ts < dateFrom.value) return false
    if (dateTo.value && ts >= dateTo.value + 86400) return false
    return true
  }

  const MIN_VALID_TS = 946684800
  const MAX_VALID_TS = Math.floor(Date.now() / 1000) + 86400 * 366

  // All valid records without date-range filter (for tab visibility + timeline range picker)
  const allActivityRecords = computed(() => merged.value.activityRecords.filter((r) => r.activityRecordDate >= MIN_VALID_TS && r.activityRecordDate <= MAX_VALID_TS))

  watch(allActivityRecords, () => autoResetDateRange())
  const unfilteredCounts = computed(() => {
    const m = merged.value
    return {
      events: m.eventRecords.length,
      faults: m.faultRecords.length,
      conditions: m.conditionRecords.length,
      gnss: m.gnssRecords.length,
      mapPoints: m.gnssRecords.length + m.borderCrossingRecords.length + m.loadUnloadRecords.length,
      companyLocks: m.companyLocksRecords.length,
      downloads: m.downloadActivityRecords.length,
      borders: m.borderCrossingRecords.length,
      cargo: m.loadUnloadRecords.length,
      controls: m.controlActivityRecords.length,
    }
  })

  const activityRecords = computed(() => allActivityRecords.value.filter((r) => inRange(r.activityRecordDate)))
  const vehicleRecords = computed(() => merged.value.vehicleRecords.filter((r) => inRange(r.vehicleFirstUse) || inRange(r.vehicleLastUse)))
  const placeRecords = computed(() => merged.value.placeRecords.filter((r) => inRange(r.entryTime)))
  const eventRecords = computed(() => merged.value.eventRecords.filter((r) => inRange(r.eventBeginTime)))
  const faultRecords = computed(() => merged.value.faultRecords.filter((r) => inRange(r.faultBeginTime)))
  const conditionRecords = computed(() => merged.value.conditionRecords.filter((r) => inRange(r.entryTime)))
  const gnssRecords = computed(() => merged.value.gnssRecords.filter((r) => inRange(r.gnssPlaceRecord?.timeStamp || r.timeStamp)))
  const vehicleUnitsUsed = computed(() => merged.value.vehicleUnitsUsed)
  const companyLocksRecords = computed(() => merged.value.companyLocksRecords)
  const downloadActivityRecords = computed(() => merged.value.downloadActivityRecords)
  const borderCrossingRecords = computed(() => merged.value.borderCrossingRecords.filter((r) => inRange(r.gnssPlaceAuthRecord?.timeStamp)))
  const loadUnloadRecords = computed(() => merged.value.loadUnloadRecords.filter((r) => inRange(r.timeStamp)))
  const loadTypeRecords = computed(() => merged.value.loadTypeRecords.filter((r) => inRange(r.timeStamp)))
  const controlActivityRecords = computed(() => merged.value.controlActivityRecords.filter((r) => inRange(r.controlTime)))
  const gnssAuthRecords = computed(() => merged.value.gnssAuthRecords.filter((r) => inRange(r.timeStamp)))
  const placesAuthRecords = computed(() => merged.value.placesAuthRecords.filter((r) => inRange(r.entryTime)))

  const warnings = computed(() => {
    const list = []
    const activities = merged.value.activityRecords
    if (activities.length) {
      const tooOld = activities.filter((r) => r.activityRecordDate && r.activityRecordDate < MIN_VALID_TS)
      if (tooOld.length) {
        const dates = tooOld.map((r) =>
          formatDayParts(r.activityRecordDate, { day: '2-digit', month: '2-digit', year: 'numeric' }),
        )
        list.push({ key: 'Activity records with suspicious dates (before year 2000): {dates}', params: { dates: dates.join(', ') } })
      }
      const tooNew = activities.filter((r) => r.activityRecordDate && r.activityRecordDate > MAX_VALID_TS)
      if (tooNew.length) {
        const dates = tooNew.map((r) =>
          formatDayParts(r.activityRecordDate, { day: '2-digit', month: '2-digit', year: 'numeric' }),
        )
        list.push({ key: 'Activity records with suspicious dates (in the future): {dates}', params: { dates: dates.join(', ') } })
      }
    }

    // Out-of-range GNSS coordinates - a tachograph file-parsing defect (e.g. a
    // longitude sign/overflow bug) yields coordinates outside +/-90/+/-180. Such
    // points are dropped from the map; warn so the user knows the file's geodata
    // is partly unreliable rather than silently hiding it.
    const outOfRange = (g) => g && g.latitude != null && g.longitude != null
      && (Math.abs(g.latitude) > 90 || Math.abs(g.longitude) > 180)
    const m = merged.value
    let badCoords = 0
    for (const r of m.gnssRecords) if (outOfRange(r.gnssPlaceRecord?.geoCoordinates)) badCoords++
    for (const r of m.borderCrossingRecords) if (outOfRange(r.gnssPlaceAuthRecord?.geoCoordinates)) badCoords++
    for (const r of m.loadUnloadRecords) if (outOfRange(r.GNSSPlaceAuthRecord?.geoCoordinates)) badCoords++
    for (const r of m.placeRecords) if (outOfRange(r.entryGNSSPlaceRecord?.geoCoordinates)) badCoords++
    if (badCoords) {
      list.push({ key: '{count} GNSS position(s) have invalid coordinates and were excluded from the map — the tachograph file may be parsed incorrectly', params: { count: badCoords } })
    }
    return list
  })

  return {
    sources,
    enabledSources,
    activeGen,
    hasG1,
    hasG2,
    raw,
    sourceType,
    fileNames,
    printTitle,
    fileCount,
    loadError,
    loading,
    setLoadError,
    clearLoadError,
    addData,
    setData,
    toggleSource,
    enableOnly,
    removeSource,
    clearData,
    dateFrom,
    dateTo,
    setDateRange,
    clearDateRange,
    allActivityRecords,
    unfilteredCounts,
    activityRecords,
    vehicleRecords,
    placeRecords,
    eventRecords,
    faultRecords,
    conditionRecords,
    gnssRecords,
    vehicleUnitsUsed,
    companyLocksRecords,
    downloadActivityRecords,
    borderCrossingRecords,
    loadUnloadRecords,
    loadTypeRecords,
    controlActivityRecords,
    gnssAuthRecords,
    placesAuthRecords,
    warnings,
  }
})
