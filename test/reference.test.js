import { describe, it, expect } from 'vitest'
import { nationName, eventName, faultName, eventTypes, faultTypes } from '../src/reference/index.js'

// Spot checks for the tacho spec reference tables (Reg. 2016/799 + 2021/1228).
describe('reference lookups', () => {
  it('maps NationNumeric codes to names', () => {
    expect(nationName(13)).toBe('Germany')
    expect(nationName(26)).toBe('Italy')
    expect(nationName('France')).toBe('France') // already-a-name passthrough
    expect(nationName('')).toBe('—')
    expect(nationName(9999)).toMatch(/^Unknown/)
  })

  it('names event and fault codes with a fallback', () => {
    expect(eventName(6)).toBe('Last card session not correctly closed')
    expect(eventName(-1)).toBe('Unknown event (-1)')
    expect(typeof faultName(0)).toBe('string')
    expect(faultName(-1)).toBe('Unknown fault (-1)')
  })

  it('exposes the raw tables', () => {
    expect(Object.keys(eventTypes).length).toBeGreaterThan(30)
    expect(Object.keys(faultTypes).length).toBeGreaterThan(20)
  })
})
