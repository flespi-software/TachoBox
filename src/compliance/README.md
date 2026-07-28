# Compliance engine

A framework-free, dependency-free analyzer for EU driving-time rules. Give it
normalized driver-activity records and it returns violations, severity-graded
per Commission Regulation (EU) 2016/403.

It has no ties to Vue, the store, or the DDD parser - the only input is plain
record objects (below).

## Quick start

**You do not need to know JavaScript to run this.** The directory is
self-contained: no dependencies, no imports outside itself, nothing to install,
nothing to build. There is no `npm install` step.

The only requirement is Node.js 20 or newer, from [nodejs.org](https://nodejs.org)
or your package manager. Check what you have:

```bash
node --version
```

Then copy the directory anywhere and run the demo:

```bash
cp -r src/compliance ~/compliance
node ~/compliance/example.mjs
```

You should see output like this:

```
Compliance engine, rule set 1.0.0
8 days analysed, 27 violations, 0 anomalies

2026-06-01  very-serious   Art.7     Continuous driving 6h exceeds 4h30 limit without 45min break
2026-06-01  very-serious   Art.6.1   Daily driving 12h 15m exceeds the extended 10h limit
2026-06-01  most-serious   Art.8.2   Daily rest 6h below minimum 9h
...
```

That is the whole engine running end to end. [`example.mjs`](example.mjs) builds
a few days of driver activity inline - no data files, no parser - runs every
analysis over them and prints the findings.

**To try your own data without writing code**, edit the top of `example.mjs`:
the activity is a plain list of `(time, activity)` pairs, where time is minutes
since midnight. Change the numbers, re-run, watch the findings change. That is
usually the fastest way to understand a rule.

**If your input comes from the flespi API**, this engine is only the second half
of the job. The first half is [`../utils/ddd.js`](../utils/ddd.js), which turns
a `tacho-file-parse` response into the records below, and the two are already
wired together in [`../analyze.js`](../analyze.js):

```js
import { analyze } from './src/analyze.js'
const report = analyze(apiResponse)
```

`example.mjs` deliberately does not do this - it builds records by hand so that
this folder runs with nothing else present. For flespi input, start from
[`../analyze.js`](../analyze.js) and its
[adapter README](../utils/README.md) instead, or from the command line:

```bash
node scripts/find-violations.mjs public/example.json --pretty
```

**If you are reimplementing this in another language**, `example.mjs` shows the
required call order, [`rules.json`](rules.json) gives you the thresholds as data
so you never transcribe a number by hand, and
[Porting to another language](#porting-to-another-language) explains how to check
your port against the reference outputs.

In a bundler, import from `index.js` instead; nothing here is browser- or
Node-specific.

## Files

| File            | Contents |
|-----------------|----------|
| `rules.js`      | The numbers only: statutory `LIMITS` (EU 561/2006) and `SEVERITY` bands (EU 2016/403), plus the `classifySeverity` / `classifyDailyDriving` classifiers. Auditable against the regulations in isolation. |
| `violations.js` | The algorithms. Imports every threshold from `rules.js` - no magic numbers here. |
| `activity.js`   | Pure record primitives (`MINUTES_IN_DAY`, `filterDriverChanges`). |
| `explain.js`    | Plain-language, per-article explanation strings for the UI. |
| `index.js`      | Public barrel - import from `src/compliance`. |
| `example.mjs`   | Runnable demo, see above. Not imported by anything. |
| `rules.json`    | Generated: the limits and severity bands as plain data, for consumers that cannot import JavaScript. |
| `package.json`  | Makes the directory installable on its own (`npm install ./compliance`). Not published to npm. |

## Input record shape

One record per driver-activity day, as produced by `src/utils/ddd.js` from the
flespi tacho-file-parse output:

```js
{
  activityRecordDate: 1717977600,  // UNIX seconds, UTC midnight of the day
  activityChangeInfo: [
    // one entry per activity change; changeTime is minutes since midnight
    { changeTime: 0,   activity: 'DRIVING',    slot: 'DRIVER', cardInserted: true },
    { changeTime: 270, activity: 'BREAK/REST', slot: 'DRIVER', cardInserted: true },
    // activity: 'DRIVING' | 'WORK' | 'AVAILABILITY' | 'BREAK/REST'
  ],
}
```

Most functions take an array of these records (the whole loaded dataset), since
weekly and rest rules span day boundaries.

## Public API

| Function | Rule | Returns |
|----------|------|---------|
| `analyzeDayViolations(record, {isLastDay})` | Art.7 continuous driving | per-day violations |
| `analyzeDailyDriving(records)`  | Art.6.1 | daily driving over 9h/10h |
| `analyzeDailyRest(records)`     | Art.8.2 | insufficient daily rest |
| `analyzeWeeklyRest(records)`    | Art.8.6 | weekly rest interval / pairing / compensation |
| `analyzeWeeklyViolations(records)` | Art.6.2, 6.3 | an **object** `{ weeklyViolations, biweeklyViolations }`, not an array |
| `detectUsageErrors(records, places, events)` | Reg.165/2014 Art.34 | missing markings, improper card removal |
| `detectAnomalies(records, events)` | - | data gaps, suspicious events, unaccounted time |
| `crossReference(sources)` | - | driver-card vs vehicle-unit discrepancies |
| `dayStatusMap(records)` | - | `Map<dayTs, 'red'|'amber'|'grey'>` for calendars/timelines |

## Using the engine

### Getting the code

Not published to npm. Vendor it: copy the directory (see [Quick start](#quick-start)),
then either import `index.js` directly or `npm install ./compliance` to get it
into your dependency tree under its own name. Nothing else in this repository is
required.

One optional extra: if your input is raw flespi `tacho-file-parse` output, take
[`../utils/ddd.js`](../utils/ddd.js) too. It is the adapter that turns that JSON
into the records below and is likewise framework-free - but it lives outside this
directory, so copying it is a deliberate extra step, not part of the engine.

### Getting records in

The engine consumes the record shape documented above and nothing else. Two ways
to produce it:

```js
// A. from flespi tacho-file-parse output, using the bundled adapter
import { detectAndNormalize, mergeRecordSets } from './utils/ddd.js'

const source = detectAndNormalize(parsedDddJson)
const { activityRecords, placeRecords, eventRecords } =
  mergeRecordSets([source], source.g2 ? 'g2' : 'g1')
```

```js
// B. from any other parser, or your own database - build them yourself
const activityRecords = [
  {
    activityRecordDate: 1717977600,
    activityChangeInfo: [
      { changeTime: 0, activity: 'DRIVING', slot: 'DRIVER', cardInserted: true },
      { changeTime: 270, activity: 'BREAK/REST', slot: 'DRIVER', cardInserted: true },
    ],
  },
]
```

There is no flespi dependency in the engine. Any parser that can produce one
record per day with activity changes in minutes-since-midnight will do.

### The full call sequence

Per-day and dataset-wide analyses are separate calls, and getting the split
wrong is the most common mistake. `analyzeDayViolations` runs **once per day**
and needs to know which day is the last one; everything else runs **once over
the whole set**, because rest and weekly rules cross day boundaries.

```js
import {
  analyzeDayViolations, analyzeDailyDriving, analyzeDailyRest,
  analyzeWeeklyRest, analyzeWeeklyViolations,
  detectUsageErrors, detectAnomalies,
} from './compliance/index.js'

const days = activityRecords.filter((r) => r.activityChangeInfo?.length)
const lastTs = Math.max(...days.map((r) => r.activityRecordDate))

// Per day. Findings carry no date of their own - attach the day yourself.
const perDay = days.flatMap((r) =>
  analyzeDayViolations(r, { isLastDay: r.activityRecordDate === lastTs })
    .map((v) => ({ ...v, dayTs: r.activityRecordDate })),
)

// Whole dataset.
const spanning = [
  ...analyzeDailyDriving(activityRecords),
  ...analyzeDailyRest(activityRecords),
  ...analyzeWeeklyRest(activityRecords),
]

// Note the object return, and that these are dated by weekStart, not dayTs.
const { weeklyViolations, biweeklyViolations } = analyzeWeeklyViolations(activityRecords)

const violations = [...perDay, ...spanning, ...weeklyViolations, ...biweeklyViolations]

// Separate categories, not violations - see the severity note below.
const usageErrors = detectUsageErrors(activityRecords, placeRecords, eventRecords)
const anomalies = detectAnomalies(activityRecords, eventRecords)
```

[`../../scripts/find-violations.mjs`](../../scripts/find-violations.mjs) is this
same sequence wrapped in a CLI, and is the shortest thing to copy from:

```bash
node scripts/find-violations.mjs public/example.json --pretty
```

### What comes back

Every finding has `type`, `severity` and `message`. The rest depends on the type:

| Field | Present on | Meaning |
|-------|-----------|---------|
| `type` | all | Machine-readable kind, e.g. `continuous-driving`. Key your logic off this. |
| `code` | violations, usage errors | Article, e.g. `7`, `8.6`, `EU165 34.7`. Absent on anomalies. |
| `severity` | all | See the two scales below. |
| `message` | all | **i18n key** with `{placeholders}`, not display text. |
| `messageParams` | most | Values for those placeholders. |
| `dayTs` | day-based violations | UTC midnight of the day. **Not** set by `analyzeDayViolations` - the caller attaches it. |
| `weekStart` | `weekly-driving`, `biweekly-driving` | UTC start of the ISO week; these carry no `dayTs`. |
| `ts` | usage errors, anomalies | Exact UNIX-seconds moment. |
| `minutes` | most violations | The measured value the severity was derived from. |
| `startMin`, `endMin` | `continuous-driving` | Clock span of the driving stretch, minutes since midnight. |
| `totalDriving` | `weekly-driving` | Week total in minutes. |
| `uncertain` | `daily-rest` | Data gap - the finding may be an artefact of missing days. |
| `description` | anomalies | Plain-language explanation. |
| `icon` | most | Material Design Icons name, purely for UI. Ignore it outside a UI. |

**Two severity scales, do not mix them.** Violations and usage errors use
`minor | serious | very-serious | most-serious`, plus `uncategorized` for real
infringements that Reg. 2016/403 does not grade. Anomalies from
`detectAnomalies` use `info | warning | critical` instead - they are data-quality
observations, not infringements.

### Rendering messages

`message` is an i18n key whose English text doubles as the fallback, so you must
interpolate `messageParams` yourself. Minimal renderer:

```js
const render = (v) =>
  v.message.replace(/\{(\w+)\}/g, (_, k) => v.messageParams?.[k] ?? `{${k}}`)
```

With a real i18n library, pass `message` as the key and `messageParams` as the
values. `explainKey(code)` returns a longer plain-language explanation of the
article, also as an i18n key, for tooltips and reports.

## Coverage and limits

What the engine detects:

| Rule | Emitted type | Severity from |
|------|--------------|---------------|
| Art. 6.1 daily driving over 9h/10h | `daily-driving` | `classifyDailyDriving`, Reg. 2016/403 Annex I rows 2-7 |
| Art. 6.2 weekly driving over 56h | `weekly-driving` | `SEVERITY['weekly-driving']` |
| Art. 6.3 two-week driving over 90h | `biweekly-driving` | `SEVERITY['biweekly-driving']` |
| Art. 7 driving over 4h30 without a qualifying break | `continuous-driving` | `SEVERITY['continuous-driving']` |
| Art. 8.2 daily rest shorter than required | `daily-rest` | `SEVERITY['daily-rest']` (Annex III D4-D6) |
| Art. 8.4 more than three reduced daily rests between weekly rests | `daily-rest-reduced` | not graded -> `uncategorized` |
| Art. 8.6 weekly rest not started within six 24h periods | `weekly-rest-interval` | `SEVERITY['weekly-rest-interval']` (D19-D21) |
| Art. 8.6 two consecutive reduced weekly rests | `weekly-rest-pair` | `SEVERITY['weekly-rest-regular-short']` (D16-D18) |
| Art. 8.6(c) reduced weekly rest not compensated within three weeks | `weekly-rest-compensation` | not graded -> `uncategorized` |
| Reg. 165/2014 Art. 34 missing markings / improper card removal | `detectUsageErrors` | fixed per error |

What it deliberately does **not** detect. A port should not treat these as bugs:

- **Insufficient reduced weekly rest under 24h (Annex III D13-D15).** The bands
  exist in `rules.js` as `weekly-rest-reduced-short` and are unit-tested, but no
  code path emits them. Neither 561/2006 nor 2016/403 defines how to tell a
  sub-24h *weekly rest attempt* apart from an ordinary long daily rest, so
  detecting it would need an invented heuristic. Left unwired on purpose.
- **Daily rest under 11h where a reduction was not allowed (Annex III D1-D3).**
  Daily rest is graded against the 9h reduced threshold only. Exceeding the
  three-reductions allowance is reported as `daily-rest-reduced` with severity
  `uncategorized` rather than graded by duration.
- **Multi-manning (Art. 4(o), 8.5).** Only one card slot is analysed, so the
  30-hour multi-manning window is not modelled.
- **Ferry and train derogations (Art. 9.1) and Art. 12 departures.** A rest
  interrupted by a ferry crossing is treated as an ordinary interrupted rest.
- **A driver who never rests at all.** Weekly-rest checks work by comparing
  consecutive rest blocks of 24h or more. If the analysed window contains fewer
  than two such blocks, there is nothing to compare and no weekly-rest finding is
  emitted - so the worst case, a driver taking no weekly rest whatsoever, is
  silent. `detectAnomalies` is what surfaces such a dataset.
- **Continuous driving across midnight.** Art. 7 stretches are computed within a
  calendar day, so a stretch spanning midnight is split into two and may fall
  under the 4h30 limit on both sides. Daily and weekly *rest*, by contrast, are
  computed on a continuous timeline.

## Algorithm notes

The regulation text does not determine these choices; they are decisions this
implementation makes. A reimplementation has to match them to produce the same
output.

**Time base.** UNIX seconds, UTC. Activity is bucketed by UTC calendar day.
Weeks are ISO weeks starting Monday, UTC.

**Slot selection.** A day may carry changes for the DRIVER and the CO-DRIVER
slot, and stale changes from the previous day (`changeTime` resets at midnight).
`filterDriverChanges` keeps the DRIVER slot when present, otherwise CO-DRIVER,
and only from the last midnight reset onwards.

**Card-out counts as rest.** When `cardInserted === false` the stored activity is
whatever was active before the card was withdrawn, usually WORK or DRIVING.
Counting it produces false rest and driving violations, so those minutes are
treated as BREAK/REST. The missing manual entry is reported separately as a
Reg. 165/2014 usage error.

**The last day is never judged.** The most recent day in the dataset may be a
mid-day download. It is skipped for per-day violations, and it must not consume
one of the week's two 10h extension allowances either, or a later legitimate day
gets wrongly flagged.

**Qualifying break (Art. 7).** A single BREAK/REST of at least 45 min, or one of
at least 15 min followed later by one of at least 30 min. Rests under 15 min,
WORK and AVAILABILITY neither reset the stretch nor count toward a break.

**Daily driving extension (Art. 6.1).** The 10h extension is allowed at most
twice per ISO week. Every day over 9h consumes one allowance, in chronological
order, whether or not it ends up flagged.

**Daily rest (Art. 8.2) uses a rolling 24h window on a continuous timeline.**
Rest blocks are merged across midnight, then windows of 24h are walked forward.
A rest satisfies a window only if it *starts* no later than `windowEnd - 9h` --
a rest begun later leaves under 9h inside the window even if it is long. A
regular rest is 11h, or a 3h block earlier in the same window paired with a 9h
block (the 3+9 split).

**Reduced daily rest counter.** Reduced rests are counted between weekly rests;
only the fourth and later are flagged. The counter resets on a rest of 24h or
more, and also when a window sits in a data gap, where a weekly rest most likely
occurred but is not recorded.

**Weekly rest (Art. 8.6).** Any rest block of 24h or more is a weekly rest;
45h or more makes it regular. Two consecutive reduced weekly rests are flagged
only when they belong to *different* ISO weeks and neither week already contains
a regular weekly rest -- without that guard, a long mid-week daily rest pairs
with the real weekly rest and produces a false positive. Compensation for a
reduced weekly rest is satisfied by any later rest block within 21 days lasting
at least the shortfall plus 9h.

**Data gaps are skipped, not flagged.** If the span between two rests contains
more than an hour of uncovered timeline, the interval is not assessed. This
trades missed findings for the absence of false positives on partial downloads.

## Tests

`test/violations.test.js` is a Vitest golden master over the demo files plus
boundary asserts for every severity band. Run `npm test`. Any change to the
algorithms or numbers that alters output will fail the snapshot.

## Porting to another language

Two generated artifacts exist so the engine can be reimplemented without reading
JavaScript, and the result checked for equivalence:

| Artifact | Purpose |
|----------|---------|
| [`rules.json`](rules.json) | `LIMITS` and `SEVERITY` as plain data, with the banding semantics spelled out. Read it instead of transcribing numbers by hand. |
| [`../../test/conformance/`](../../test/conformance/) | The output of `analyze()` over the two bundled demo inputs, as JSON. |

Both are produced by `npm run conformance:update` from `rules.js` and the demo
files; `test/conformance.test.js` fails if they drift from the code, so they
always describe the real engine.

To validate a port: run it over `public/example.json` and `public/example-vu.json`,
produce the same report shape as
[`scripts/find-violations.mjs`](../../scripts/find-violations.mjs), and diff
against `test/conformance/expected-*.json`. The reports must match exactly --
`analyze()` is a pure function of its input, with no clock, locale or iteration
order affecting the result.

`RULES_VERSION` in `rules.js` versions the rule set, not the app. It is bumped
when a threshold or a severity band changes, or when detection coverage changes,
and it is echoed in the report as `rulesVersion`. A port should report the
version it was ported from so a divergence surfaces instead of going unnoticed.

Note that `message` is an i18n key with `{placeholders}`, not display text; the
CLI renders it into `text`. A port targeting a different UI should key off
`type` and `code`, not the English string.
