// Pure activity-record primitives shared by the compliance engine.
// No UI / framework dependencies - safe to reuse outside this app.
// The UI-coupled helpers (colours, segment building) live in src/utils/activity.js,
// which re-exports these so existing component imports keep working.

export const MINUTES_IN_DAY = 1440

// A day may contain stale changes from a previous day (changeTime resets at
// midnight); keep the changes from the last day boundary onwards.
// In VU data the DRIVER and CO-DRIVER slots are two different people, so one
// slot is kept. On a driver card `slot` only says where this driver's card sat,
// and the changes of both slots form one chronological timeline - a crew
// driver moves the card between them - so a card record (`source: 'card'`)
// keeps them all.
export function filterDriverChanges(changes, { card = false } = {}) {
  const hasDriver = changes.some((c) => c.slot === 'DRIVER')
  const slotChanges = card
    ? changes
    : changes.filter((c) => !c.slot || c.slot === (hasDriver ? 'DRIVER' : 'CO-DRIVER'))
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
