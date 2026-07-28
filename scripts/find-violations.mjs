#!/usr/bin/env node
// CLI wrapper around src/analyze.js: read flespi API responses from disk, print
// the compliance report as JSON.
//
// Usage:
//   node scripts/find-violations.mjs <parsed.json> [more.json ...] [--gen g1|g2] [--pretty]
//   node scripts/find-violations.mjs public/example.json --pretty
//   node scripts/find-violations.mjs day1.json day2.json day3.json   # same card, merged
//
// Pass several complementary files - successive downloads of the SAME driver card,
// or of the same vehicle unit. They are normalized, merged into one timeline (same
// day from two files -> the richer record is kept), and analysed together. Mixing
// different drivers/vehicles (or a card with a VU) throws an error.
//
// All the logic lives in src/analyze.js - import analyze() from there rather than
// shelling out to this script.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { analyze } from '../src/analyze.js'

function main() {
  const args = process.argv.slice(2)
  const files = args.filter((a) => !a.startsWith('--'))
  const pretty = args.includes('--pretty')
  const genArg = (args.find((a) => a.startsWith('--gen=')) || '').split('=')[1]
    || (args.includes('--gen') ? args[args.indexOf('--gen') + 1] : null)
  const genFiles = genArg ? files.filter((f) => f !== genArg) : files // drop `--gen g1` value

  if (!genFiles.length) {
    console.error('Usage: node scripts/find-violations.mjs <parsed.json> [more.json ...] [--gen g1|g2] [--pretty]')
    process.exit(1)
  }
  let report
  try {
    const jsons = genFiles.map((f) => JSON.parse(readFileSync(f, 'utf8')))
    report = analyze(jsons, { gen: genArg })
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  process.stdout.write(JSON.stringify(report, null, pretty ? 2 : 0) + '\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
