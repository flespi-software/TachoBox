import { MINUTES_IN_DAY, filterDriverChanges } from '../compliance/activity.js'

// Pure activity primitives now live in the framework-free compliance core;
// re-export them so existing `src/utils/activity` imports keep working.
export { MINUTES_IN_DAY, filterDriverChanges }

export const ACTIVITY_COLORS = {
  DRIVING: '#ff5722',
  WORK: '#03a9f4',
  AVAILABILITY: '#ffa000',
  'BREAK/REST': '#616161',
  UNKNOWN: '#616161',
}

export const ACTIVITY_CLS = {
  DRIVING: 'activity-driving',
  WORK: 'activity-work',
  AVAILABILITY: 'activity-availability',
  'BREAK/REST': 'activity-rest',
  UNKNOWN: 'activity-rest',
}

function ongoingBackground(color) {
  return `repeating-linear-gradient(45deg, ${color}cc, ${color}cc 8px, ${color}aa 8px, ${color}aa 16px)`
}

// Diagonal hatch over the recorded colour - marks periods when the driver card
// was NOT inserted (cardInserted === false): either UNKNOWN time or a manual entry.
// Even diagonal hatch laid OVER the activity colour (which comes from the
// element's theme-aware class). Only background-image is set so the class
// background-color shows through the transparent parts. A fixed background tile
// (background-size) with percentage stops avoids the uneven stripe widths that
// repeating-linear-gradient produces from fractional per-device-pixel rounding.
function cardOutBackground() {
  return {
    backgroundImage: 'linear-gradient(45deg, rgba(0,0,0,0.11) 25%, transparent 25%, transparent 50%, rgba(0,0,0,0.11) 50%, rgba(0,0,0,0.11) 75%, transparent 75%)',
    backgroundSize: '8px 8px',
  }
}

// Theme-aware colours of the activity bands, as CSS variables
export const ACTIVITY_VARS = {
  DRIVING: 'var(--act-driving)',
  WORK: 'var(--act-work)',
  AVAILABILITY: 'var(--act-availability)',
  'BREAK/REST': 'var(--act-rest)',
  UNKNOWN: 'var(--act-rest)',
}

const NO_HIDDEN = new Set()

// One day of segments as a single CSS gradient (cheaper than a node per
// segment). A gradient stretches its first and last colour to the edges, so a
// day the segments do not cover end to end - one cut short by the download -
// would be painted with the neighbouring activity rather than reading as no
// data. Those stretches get explicit transparent stops, as do the activities
// hidden in the legend, which keeps every segment in place.
export function segmentsGradient(segments, { hidden = NO_HIDDEN, direction = '90deg', empty = 'transparent' } = {}) {
  const parts = []
  let coveredTo = 0
  for (const s of segments) {
    const start = s.startPct
    const end = Math.min(100, start + s.widthPct)
    if (start > coveredTo) parts.push(`transparent ${coveredTo.toFixed(3)}% ${start.toFixed(3)}%`)
    const col = hidden.has(s.activity) ? 'transparent' : (ACTIVITY_VARS[s.activity] || 'var(--act-rest)')
    parts.push(`${col} ${start.toFixed(3)}% ${end.toFixed(3)}%`)
    coveredTo = Math.max(coveredTo, end)
  }
  if (!parts.length) return empty
  if (coveredTo < 100) parts.push(`transparent ${coveredTo.toFixed(3)}% 100%`)
  return `linear-gradient(${direction}, ${parts.join(', ')})`
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

// Takes an activity record, or a bare change list when the record is not at
// hand. A record carrying `recordedUntilMin` (the day the download cut short)
// ends its last activity there instead of at midnight.
export function buildDaySegments(input, { isLastDay = false } = {}) {
  const record = Array.isArray(input) ? null : input
  const changes = filterDriverChanges(record ? record.activityChangeInfo || [] : input, { card: record?.source === 'card' })
  const recordedUntil = record?.recordedUntilMin ?? null
  const totals = { DRIVING: 0, WORK: 0, AVAILABILITY: 0, 'BREAK/REST': 0, UNKNOWN: 0 }
  const segments = []

  for (let i = 0; i < changes.length; i++) {
    const current = changes[i]
    const startMin = current.changeTime
    if (startMin >= MINUTES_IN_DAY) continue

    const isLast = i === changes.length - 1
    let endMin

    if (isLast && recordedUntil != null) {
      endMin = Math.max(startMin, recordedUntil)
    } else if (isLast && isLastDay) {
      endMin = null
    } else {
      const nextMin = !isLast ? changes[i + 1].changeTime : MINUTES_IN_DAY
      // Two changes in the same minute (a card moved between slots) give a
      // zero-length segment; only a backwards step means the day wrapped.
      endMin = nextMin < startMin ? MINUTES_IN_DAY : Math.min(nextMin, MINUTES_IN_DAY)
    }
    if (endMin === startMin) continue

    const duration = endMin !== null ? endMin - startMin : 0
    // Card data marks each card-out change as a manual entry or not (see
    // markCardActivity in ddd.js). UNKNOWN time carries the activity selected
    // at withdrawal, not what the driver did, so it stays out of the activity
    // totals. VU data has no such flag: there the recorded activity is real.
    const cardOut = current.cardInserted === false
    const activity = cardOut && current.manualEntry === false
      ? 'UNKNOWN'
      : current.activity || 'BREAK/REST'
    if (duration > 0 && totals[activity] !== undefined) {
      totals[activity] += duration
    }

    const color = ACTIVITY_COLORS[activity] || '#616161'
    const ongoing = endMin === null
    // Recorded up to the download and still running then - a real duration, but
    // marked like an ongoing one, since the activity did not end there.
    const truncated = isLast && recordedUntil != null

    let bgStyle = null
    if (ongoing || truncated) bgStyle = { background: ongoingBackground(color) }
    else if (cardOut) bgStyle = cardOutBackground()

    segments.push({
      activity,
      cardOut,
      cls: ACTIVITY_CLS[activity] || 'bg-grey-7',
      startMin,
      endMin,
      duration,
      startPct: (startMin / MINUTES_IN_DAY) * 100,
      widthPct: ongoing ? 8 : ((endMin - startMin) / MINUTES_IN_DAY) * 100,
      startLabel: formatTime(startMin),
      endLabel: ongoing ? '...' : formatTime(endMin),
      ongoing,
      truncated,
      bgStyle,
    })
  }

  return { segments, totals }
}
