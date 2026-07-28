import { MINUTES_IN_DAY, filterDriverChanges } from '../compliance/activity.js'

// Pure activity primitives now live in the framework-free compliance core;
// re-export them so existing `src/utils/activity` imports keep working.
export { MINUTES_IN_DAY, filterDriverChanges }

export const ACTIVITY_COLORS = {
  DRIVING: '#ff5722',
  WORK: '#03a9f4',
  AVAILABILITY: '#ffa000',
  'BREAK/REST': '#616161',
}

export const ACTIVITY_CLS = {
  DRIVING: 'activity-driving',
  WORK: 'activity-work',
  AVAILABILITY: 'activity-availability',
  'BREAK/REST': 'activity-rest',
}

function ongoingBackground(color) {
  return `repeating-linear-gradient(45deg, ${color}cc, ${color}cc 8px, ${color}aa 8px, ${color}aa 16px)`
}

// Diagonal hatch over the recorded colour - marks periods when the driver card
// was NOT inserted (cardInserted === false). The stored activity for these is
// unreliable (stale value from before withdrawal), so they are flagged visually.
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

export function buildDaySegments(rawChanges, { isLastDay = false } = {}) {
  const changes = filterDriverChanges(rawChanges)
  const totals = { DRIVING: 0, WORK: 0, AVAILABILITY: 0, 'BREAK/REST': 0 }
  const segments = []

  for (let i = 0; i < changes.length; i++) {
    const current = changes[i]
    const startMin = current.changeTime
    if (startMin >= MINUTES_IN_DAY) continue

    const isLast = i === changes.length - 1
    let endMin

    if (isLast && isLastDay) {
      endMin = null
    } else {
      const nextMin = !isLast ? changes[i + 1].changeTime : MINUTES_IN_DAY
      endMin = nextMin <= startMin ? MINUTES_IN_DAY : Math.min(nextMin, MINUTES_IN_DAY)
    }

    const duration = endMin !== null ? endMin - startMin : 0
    const activity = current.activity || 'BREAK/REST'
    if (duration > 0 && totals[activity] !== undefined) {
      totals[activity] += duration
    }

    const color = ACTIVITY_COLORS[activity] || '#616161'
    const ongoing = endMin === null
    const cardOut = current.cardInserted === false

    let bgStyle = null
    if (ongoing) bgStyle = { background: ongoingBackground(color) }
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
      bgStyle,
    })
  }

  return { segments, totals }
}
