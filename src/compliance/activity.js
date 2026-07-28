// Pure activity-record primitives shared by the compliance engine.
// No UI / framework dependencies - safe to reuse outside this app.
// The UI-coupled helpers (colours, segment building) live in src/utils/activity.js,
// which re-exports these so existing component imports keep working.

export const MINUTES_IN_DAY = 1440

// A driver-activity day may carry changes for both the DRIVER and CO-DRIVER slot,
// and may contain stale changes from a previous day (changeTime resets at midnight).
// Keep only the active slot's changes from the last day boundary onwards.
export function filterDriverChanges(changes) {
  const hasDriver = changes.some((c) => c.slot === 'DRIVER')
  const slotChanges = changes.filter((c) => !c.slot || c.slot === (hasDriver ? 'DRIVER' : 'CO-DRIVER'))
  if (!slotChanges.length) return changes

  // Find last day boundary (last time changeTime resets)
  let lastResetIdx = 0
  for (let i = 1; i < slotChanges.length; i++) {
    if (slotChanges[i].changeTime < slotChanges[i - 1].changeTime) {
      lastResetIdx = i
    }
  }

  return slotChanges.slice(lastResetIdx)
}
