import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { analyze } from '../src/analyze.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const load = (file) => JSON.parse(readFileSync(resolve(__dirname, '../public', file), 'utf8'))

const SEVERITIES = new Set([
  'minor', 'serious', 'very-serious', 'most-serious', 'uncertain', 'uncategorized',
])

// End-to-end test for the CLI pipeline: raw parsed-DDD JSON in, structured
// report out. Locks the wiring of the normalization adapter + compliance engine.
describe('analyze() pipeline', () => {
  it('produces a driver-card report from demo data', () => {
    const r = analyze(load('example.json'))
    expect(r.sources).toHaveLength(1)
    expect(r.sources[0].type).toBe('driver-card')
    expect(r.sources[0].generation).toBe('g2') // Gen2 preferred when present
    expect(r.sources[0].days).toBeGreaterThan(0)
    expect(r.summary.violations).toBe(r.violations.length)
    expect(r.summary.violations).toBeGreaterThan(0)
  })

  it('reads vehicle-unit files too', () => {
    const r = analyze(load('example-vu.json'))
    expect(r.sources[0].type).toBe('vu-daily')
    expect(r.sources[0].days).toBeGreaterThan(0)
  })

  it('honours a forced generation', () => {
    expect(analyze(load('example.json'), { gen: 'g1' }).sources[0].generation).toBe('g1')
  })

  it('throws on unrecognized input', () => {
    expect(() => analyze({ foo: 1 })).toThrow(/not a recognized/i)
    expect(() => analyze([load('example.json'), { foo: 1 }])).toThrow(/not a recognized/i)
  })

  // Merging is idempotent: the same file loaded twice dedupes back to one timeline,
  // so the violations are identical to loading it once.
  it('merges compatible files into one timeline', () => {
    const json = load('example.json')
    const one = analyze(json)
    const twice = analyze([json, json])
    expect(twice.sources).toHaveLength(2)
    expect(twice.summary.violations).toBe(one.summary.violations)
    expect(twice.violations).toEqual(one.violations)
  })

  // Incompatible inputs (a driver card mixed with a VU, or different drivers) are
  // rejected rather than silently merged into meaningless results.
  it('throws on incompatible files', () => {
    expect(() => analyze([load('example.json'), load('example-vu.json')]))
      .toThrow(/incompatible/i)
  })

  // Every emitted entry is well-formed and rendered (no leftover {placeholders}).
  it('shapes and renders every entry', () => {
    const r = analyze(load('example.json'))
    for (const v of [...r.violations, ...r.usageErrors, ...r.anomalies]) {
      expect(typeof v.text).toBe('string')
      expect(v.text).not.toMatch(/\{\w+\}/)
    }
    for (const v of r.violations) {
      expect(SEVERITIES.has(v.severity)).toBe(true)
      expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  // Compact golden master: counts by severity/type catch any pipeline regression.
  it('summary is unchanged', () => {
    expect(analyze(load('example.json')).summary).toMatchSnapshot()
    expect(analyze(load('example-vu.json')).summary).toMatchSnapshot()
  })
})
