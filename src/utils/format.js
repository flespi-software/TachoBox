// Shared formatting helpers and tachograph spec constants.
//
// Tachograph timestamps are UNIX seconds in UTC (per Regulation (EU) 2016/799).
// Every date/time in the UI is rendered through this single module so display
// is consistent - and so the two user-facing display settings below can be
// switched from one place and have the whole app update reactively:
//
//   - timeZone   - which time zone timestamps are shown in (default UTC, the spec)
//   - dateFormat - the calendar date layout (day/month order)
//   - timeFormat - 24-hour (European standard) or 12-hour clock
//
// A settings UI only needs to set `timeZone.value` / `dateFormat.value` /
// `timeFormat.value` (see stores/settings.js, which persists them). Because the
// formatters read these refs, any Vue computed that calls them re-renders
// automatically.

import { ref } from 'vue'

export const SECONDS_PER_DAY = 86400

// "Not set" / "not available" sentinels used across the tachograph data model.
// A field the recorder never filled in is stored as all ones (Reg. 2016/799,
// Appendix 1), so it decodes as a plausible-looking number: a timestamp in 2106
// or an odometer of 16 777 215 km. Never display one, and never do arithmetic
// with it - check with the helpers below first.
export const MAX_TS = 4294967295 // 0xFFFFFFFF - timestamp not set
export const MAX_ODO = 16777215 //  0xFFFFFF   - odometer not available
export const MAX_SERIAL = 4294967295 // 0xFFFFFFFF - serial number not set

// What the UI shows in place of a value the file does not carry.
export const NOT_RECORDED = '—'

/** True when a timestamp is absent or carries the "not set" filler. */
export function isUnsetTime(ts) {
  return ts == null || ts === 0 || ts >= MAX_TS
}

/** True when an odometer reading is absent or carries the "not set" filler. */
export function isUnsetOdometer(v) {
  return v == null || v >= MAX_ODO
}

/** Format an odometer reading in km, or a dash if the file does not carry it. */
export function formatOdometer(v) {
  return isUnsetOdometer(v) ? NOT_RECORDED : v.toLocaleString()
}

// Selectable date layouts. The value is the BCP-47 locale that produces that
// numeric date order; time is always rendered 24-hour regardless (see below).
// `key` is what gets persisted; `sample` is a ready-made label for a UI picker.
export const DATE_FORMATS = [
  { key: 'dmy', locale: 'en-GB', sample: '31/12/2025' }, //      DD/MM/YYYY (UK, IE)
  { key: 'dmy_dot', locale: 'de-DE', sample: '31.12.2025' }, //  DD.MM.YYYY (DE, AT, CH, CEE)
  { key: 'dmy_dash', locale: 'nl-NL', sample: '31-12-2025' }, // DD-MM-YYYY (NL)
  { key: 'mdy', locale: 'en-US', sample: '12/31/2025' }, //      MM/DD/YYYY (US)
  { key: 'iso', locale: 'sv-SE', sample: '2025-12-31' }, //      YYYY-MM-DD (ISO 8601)
]

// Selectable clock formats. `hour12: false` is the 24-hour clock used across
// continental Europe; `true` is the 12-hour AM/PM clock.
export const TIME_FORMATS = [
  { key: '24h', sample: '14:30', hour12: false }, // European standard
  { key: '12h', sample: '2:30 PM', hour12: true },
]

// Active display settings (reactive). Defaults: UTC + DD/MM/YYYY + 24-hour.
export const timeZone = ref('UTC')
export const dateFormat = ref('dmy')
export const timeFormat = ref('24h')

function activeLocale() {
  return (DATE_FORMATS.find((f) => f.key === dateFormat.value) || DATE_FORMATS[0]).locale
}

function hour12() {
  return (TIME_FORMATS.find((f) => f.key === timeFormat.value) || TIME_FORMATS[0]).hour12
}

/** Truncate a UNIX-seconds timestamp to the start of its UTC day. */
export function dayStart(ts) {
  return ts - (ts % SECONDS_PER_DAY)
}

/** Format a UNIX-seconds timestamp as a date, or a dash if unset. */
export function formatDate(ts) {
  if (isUnsetTime(ts)) return NOT_RECORDED
  return new Date(ts * 1000).toLocaleDateString(activeLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: timeZone.value,
  })
}

/** Format a UNIX-seconds timestamp as date + time, or a dash if unset. */
export function formatDateTime(ts) {
  if (isUnsetTime(ts)) return NOT_RECORDED
  return new Date(ts * 1000).toLocaleString(activeLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: hour12(),
    timeZone: timeZone.value,
  })
}

/** Format a UNIX-seconds timestamp as time only (HH:MM), or a dash if unset. */
export function formatTimeOfDay(ts) {
  if (isUnsetTime(ts)) return NOT_RECORDED
  return new Date(ts * 1000).toLocaleTimeString(activeLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: hour12(),
    timeZone: timeZone.value,
  })
}

// --- Day-grid labels (always UTC) ---
// Tachograph activity is bucketed by UTC calendar day, so a label that names a
// *day* of activity (chart axes, the activity disc, calendar/heatmap cells,
// violation periods) must NOT shift with the timeZone setting - that would
// desync the label from the activity bars it sits next to. These force UTC; only
// the date-part *order* and month/weekday names follow the user's date-format
// preference. Use the instant formatters above for point-in-time data instead.

/** Format a UTC day-grid timestamp with arbitrary Intl date parts, or '' if unset. */
export function formatDayParts(ts, opts) {
  if (ts == null) return ''
  return new Date(ts * 1000).toLocaleDateString(activeLocale(), { ...opts, timeZone: 'UTC' })
}

/** Long weekday name in the active time zone (pairs with formatDate for headers). */
export function formatWeekdayLong(ts) {
  if (isUnsetTime(ts)) return NOT_RECORDED
  return new Date(ts * 1000).toLocaleDateString(activeLocale(), { weekday: 'long', timeZone: timeZone.value })
}
