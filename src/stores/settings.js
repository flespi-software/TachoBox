import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { timeZone, dateFormat, timeFormat, DATE_FORMATS, TIME_FORMATS } from 'src/utils/format'

const STORAGE_KEY = 'tachobox-settings'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// A bad IANA zone makes every `toLocaleString({ timeZone })` throw RangeError,
// which would break all date rendering. Guard restored/external values.
function isValidTimeZone(tz) {
  if (!tz) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = loadFromStorage()

  const showViolations = ref(saved.showViolations ?? true)
  const showRemainingHours = ref(saved.showRemainingHours ?? true)
  const fileDisplayMode = ref(saved.fileDisplayMode ?? 'meta') // 'meta' | 'filename'

  // Date/time display settings live in utils/format as the single source of
  // truth for all formatting; the store just persists and restores them.
  if (isValidTimeZone(saved.timeZone)) timeZone.value = saved.timeZone
  if (DATE_FORMATS.some((f) => f.key === saved.dateFormat)) dateFormat.value = saved.dateFormat
  if (TIME_FORMATS.some((f) => f.key === saved.timeFormat)) timeFormat.value = saved.timeFormat

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      showViolations: showViolations.value,
      showRemainingHours: showRemainingHours.value,
      fileDisplayMode: fileDisplayMode.value,
      timeZone: timeZone.value,
      dateFormat: dateFormat.value,
      timeFormat: timeFormat.value,
    }))
  }

  watch(
    [showViolations, showRemainingHours, fileDisplayMode, timeZone, dateFormat, timeFormat],
    persist,
  )

  return {
    showViolations,
    showRemainingHours,
    fileDisplayMode,
    timeZone,
    dateFormat,
    timeFormat,
  }
})
