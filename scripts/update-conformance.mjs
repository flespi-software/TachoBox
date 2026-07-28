#!/usr/bin/env node
// Regenerate the conformance artifacts committed to this repository:
//
//   src/compliance/rules.json         - LIMITS + SEVERITY as plain data
//   test/conformance/expected-*.json  - analyze() output over the demo files
//
// These exist so the engine can be reimplemented in another language and checked
// for equivalence without reading JavaScript: read rules.json instead of
// transcribing the numbers, then run the same demo inputs through the port and
// diff against the expected reports. See src/compliance/README.md.
//
// rules.js stays the single source of truth - rules.json is generated from it,
// never edited by hand, and test/conformance.test.js fails if the two drift.
//
// Usage: npm run conformance:update

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  LIMITS,
  SEVERITY,
  SEVERITY_RESIDUAL,
  SEVERITY_DEFAULT,
  RULES_VERSION,
} from '../src/compliance/index.js'
import { analyze } from '../src/analyze.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_FILES = ['example.json', 'example-vu.json']

export function rulesDocument() {
  return {
    rulesVersion: RULES_VERSION,
    units: {
      limits: 'minutes, unless the name says otherwise',
      severityValue: 'minutes (driving time, rest duration or interval)',
    },
    sources: {
      limits: 'Regulation (EU) 561/2006',
      severity: 'Commission Regulation (EU) 2016/403, Annex',
    },
    banding: {
      over: 'larger value is worse; the first band with at <= value wins',
      under: 'smaller value is worse; the first band with at > value wins',
      offset: 'subtracted from the value before comparison',
      residual: SEVERITY_RESIDUAL,
      unknownType: SEVERITY_DEFAULT,
    },
    limits: LIMITS,
    severity: SEVERITY,
  }
}

function write(relPath, data) {
  const file = resolve(root, relPath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  console.log(`wrote ${relPath}`)
}

function main() {
  write('src/compliance/rules.json', rulesDocument())
  for (const name of DEMO_FILES) {
    const json = JSON.parse(readFileSync(resolve(root, 'public', name), 'utf8'))
    write(`test/conformance/expected-${name}`, analyze(json))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
