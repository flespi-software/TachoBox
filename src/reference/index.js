// Reference lookup tables for the EU digital tachograph spec (Reg. 2016/799 +
// 2021/1228). Framework-free, dependency-free static data - reusable anywhere a
// numeric code needs a human-readable label. See ./README.md.
export { NATION_NUMERIC, nationName } from './countries.js'
export { eventTypes, faultTypes } from './tacho-codes.js'

import { eventTypes, faultTypes } from './tacho-codes.js'

export function eventName(code) {
  return eventTypes[code] ?? `Unknown event (${code})`
}

export function faultName(code) {
  return faultTypes[code] ?? `Unknown fault (${code})`
}
