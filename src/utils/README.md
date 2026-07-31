# DDD normalization adapter

[`ddd.js`](ddd.js) turns the JSON that the flespi `tacho-file-parse` plugin
produces into the flat activity records the [compliance engine](../compliance/)
consumes. It is the first half of the pipeline; the engine is the second.

Framework-free and dependency-free, like the engine - no Vue, no Pinia, no
network access. It only reshapes data.

Everything else in this directory (`format.js`, `geo.js`, `media.js`,
`activity.js`, `map-fullscreen.js`) is app-specific UI support and is not part
of the reusable surface.

## Input

The raw response of the flespi media API for a tacho file:

```
GET /gw/devices/{id}/media?data={"uuid":"...","fields":"uuid,name,meta,content"}
```

```json
{ "result": [ { "uuid": "...", "name": "...", "meta": {}, "content": { } } ] }
```

`public/example.json` and `public/example-vu.json` are exactly that, unmodified,
and are used as the conformance inputs. A bare driver-card structure without the
`result` wrapper (`{ EF_Application_Identification: ... }`) is also accepted, for
files loaded straight from disk.

## API

| Function | Purpose |
|----------|---------|
| `detectAndNormalize(json)` | Detects what the file is - driver card, vehicle unit, or a VU download with no activity - and returns a *source* object: `{ type, uuid, key, downloadTs, meta, name, g1, g2, enabled }`. Returns `null` if the JSON is not a recognized parsed DDD file. |
| `extractRecords(data)` | Pulls the flat record arrays (`activityRecords`, `placeRecords`, `eventRecords`, `faultRecords`, GNSS, vehicles, ...) out of one generation's data. |
| `mergeRecordSets(sources, gen)` | Merges several sources into one timeline for the chosen generation (`'g1'` or `'g2'`), deduplicating. Where two sources carry the same day, the record with more activity changes wins, so a day's driving is never silently dropped. |
| `isCompatible(src, enabledSources)` | Whether a source can be analysed together with the ones already loaded. Different drivers, different vehicles, or a card mixed with a VU are incompatible. |

## How a vehicle unit file differs from a driver card

The two are not the same structure with different values - they are laid out
differently, and the adapter exists largely to hide that.

A driver card hands you one contiguous structure with the days inside it. A VU
(mass memory) download instead carries each day as its own block under
`VuActivities`, with its own activity list, date, odometer and sub-records:

```
content.VuActivities[i] = {
  DateOfDayDownloaded,        // UTC midnight, a scalar - not a one-element array
  OdometerValueMidnight,      // also a scalar
  ActivityChangeInfo[],       // both DRIVER and CO-DRIVER slots
  VuPlaceDailyWorkPeriodData[], VuGNSSADRecords[], VuCardIWData[],
  VuBorderCrossingRecords[], VuLoadUnloadRecords[], VuSpecificConditionData[],
}
```

Two naming differences matter, because the UI and the engine speak driver-card:

- a place record wraps its fields in `placeRecord`, where a card has them flat;
- the GNSS position sits under `GNSSPlaceAuthRecord`, where a card calls it
  `gnssPlaceRecord`.

`normalizeVuGen2` remaps both. It is written tolerantly, so a record that already
arrives in the card shape passes through untouched.

Two consequences worth knowing. Daily distance for a VU is *derived*, not
recorded: it is the gap between consecutive midnight odometer readings, so the
last day of a download always reads 0. And the whole download becomes a single
vehicle record spanning its date range, rather than one per day.

Events, faults and speed data are not mapped from VU files yet.

## Why the two generations are separate

A Gen2 driver card carries both a Gen1 and a Gen2 application, with overlapping
but not identical data. `detectAndNormalize` keeps them as `g1` and `g2` rather
than merging, and the caller picks which to analyse - Gen2 when present, since
it holds the richer record. Forcing Gen1 is what the CLI's `--gen g1` does.

## Usage

Normally you do not call this directly: [`../analyze.js`](../analyze.js) wires it
to the engine in one call. Use it directly when you need the intermediate
records - for example to render activity in a UI as well as analyse it.

```js
import { detectAndNormalize, mergeRecordSets } from './utils/ddd.js'

const source = detectAndNormalize(apiResponse)
if (!source) throw new Error('not a parsed DDD file')

const { activityRecords, placeRecords, eventRecords } =
  mergeRecordSets([source], source.g2 ? 'g2' : 'g1')
```

`activityRecords` is one entry per calendar day in the shape the engine expects;
see [the record shape](../compliance/README.md#input-record-shape).

## Tests

[`../../test/ddd.test.js`](../../test/ddd.test.js) covers detection, merging and
compatibility. The end-to-end path from an API response to a report is covered by
[`../../test/analyze.test.js`](../../test/analyze.test.js) and the conformance
fixtures.
