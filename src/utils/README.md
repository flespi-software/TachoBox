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
| `detectAndNormalize(json)` | Detects what the file is - driver card, vehicle unit, or a VU download with no activity - and returns a *source* object: `{ type, uuid, key, downloadTs, meta, name, enabled, generation, byGeneration }`. Returns `null` if the JSON is not a recognized parsed DDD file. |
| `sourceData(src, gen)` | The payload of a source for the requested generation, falling back to whatever it actually has. Use this instead of reading `byGeneration` directly. |
| `extractRecords(data)` | Pulls the flat record arrays (`activityRecords`, `placeRecords`, `eventRecords`, `faultRecords`, GNSS, vehicles, ...) out of one generation's data. |
| `mergeRecordSets(sources, gen)` | Merges several sources into one timeline for the chosen generation (`'g1'` or `'g2'`), deduplicating. Where two sources carry the same day, the record with more activity changes wins, so a day's driving is never silently dropped. |
| `isCompatible(src, enabledSources)` | Whether a source can be analysed together with the ones already loaded. Different drivers, different vehicles, or a card mixed with a VU are incompatible. |

## How a vehicle unit file differs from a driver card

The two are not the same structure with different values - they are laid out
differently, and the adapter exists largely to hide that.

A driver card hands you one contiguous structure with the days inside it. A VU
(mass memory) download is wrapped in a generation marker and split into transfer
blocks, with one object per calendar day:

```
content.VU_Tachograph      (Gen1)      // exactly one of the two per file
content.VU_Tachograph_G2   (Gen2)
  VuOverview        // file-wide: VIN, registration, CurrentDateTime, company
                    // locks, download and control activity, certificates
  VuActivities[]    // one object per day:
                    //   DateOfDayDownloaded, OdometerValueMidnight (scalars),
                    //   ActivityChangeInfo[] (DRIVER and CO-DRIVER slots),
                    //   VuCardIWData[], VuPlaceDailyWorkPeriodData[],
                    //   VuGNSSADRecords[], VuSpecificConditionData[],
                    //   VuBorderCrossingRecords[], VuLoadUnloadRecords[]
  VuEventsAndFaults // events, faults, over-speeding, time adjustments
  VuDetailedSpeed   // per-second speed, a ring buffer of 1440 one-minute
                    //   blocks - see the note below
  VuTechnicalData   // calibrations, sensors, VU identification, power cuts
```

Note that single-element arrays are scalars here (`CurrentDateTime`, not
`CurrentDateTime[0]`), while genuine collections stay arrays. Older parser output
wrapped them; `scalar()` reads either.

Two naming differences matter, because the UI and the engine speak driver-card:

- a place entry nests its fields in `placeRecord`, where an older card put them
  flat;
- the GNSS position goes by several names - `gnssPlaceRecord`,
  `gnssPlaceAuthRecord` (authenticated, Gen2v2), their `entryGNSS*` equivalents
  inside place records, and the older capitalised `GNSSPlaceAuthRecord`.

`extractRecords` canonicalizes both on read, so every consumer sees exactly one
name per record type and no normalizer has to know the variants. Getting this
wrong is silent rather than loud: records whose GNSS block is missing all hash to
the same dedup key and the whole set collapses to a single row.

Two consequences worth knowing. Daily distance for a VU is *derived*, not
recorded: it is the gap between consecutive midnight odometer readings, so the
last day of a download always reads 0. And the whole download becomes a single
vehicle record spanning its date range, rather than one per day.

### Detailed speed covers 24 hours of movement, not 24 hours

Annex IC (Reg. (EU) 2016/799, as amended by 2018/502) requires the vehicle unit
to store the instantaneous speed for each second of the last 24 hours *during
which the vehicle was in motion*. Idle time does not consume the buffer.

That is exactly what the output shows: a ring buffer of 1440 one-minute blocks,
1440 x 60 = 86400 seconds = 24 hours, with a block written only while moving. The
calendar window it spans is however far back that takes - in the two files
measured, 13 and 25 days for the same 1440 blocks.

Everything else in the download is retained far longer: both of those files carry
91 days of activity, places, events and faults. So a 90-day download really does
give 90 days of data, with per-second speed the one exception. Say so wherever
you display it, or the empty stretches read as missing data.

All the transfer blocks are read: events, faults, over-speeding and power
interruptions land in the ordinary event and fault lists; `VuCardIWData` becomes
`driverRecords` (which cards were used in this vehicle); `VuTechnicalData`
becomes `technicalData`; `VuDetailedSpeed` becomes `speedBlocks`, kept raw
because thinning it depends on the range being displayed.

Files decoded before the plugin was corrected are still accepted - the old
layouts are recognised - but they load with a warning telling the user to upload
the original DDD again, because that decoder mis-read the mass-memory layout and
its output cannot be trusted.

## Why the two generations are separate

A Gen2 driver card carries both a Gen1 and a Gen2 application, with overlapping
but not identical data. `detectAndNormalize` keeps them apart under
`byGeneration` rather than merging, and the caller picks which to analyse - Gen2
when present, since it holds the richer record. Forcing Gen1 is what the CLI's
`--gen g1` does.

A vehicle unit download has only one generation and nothing to switch between,
so it fills only its own key and states which one in `generation`. Always read
the payload through `sourceData(src, gen)`: it honours the request when the
source can satisfy it and returns what the source has otherwise, so selecting a
generation the source does not carry cannot blank it out.

## Usage

Normally you do not call this directly: [`../analyze.js`](../analyze.js) wires it
to the engine in one call. Use it directly when you need the intermediate
records - for example to render activity in a UI as well as analyse it.

```js
import { detectAndNormalize, mergeRecordSets } from './utils/ddd.js'

const source = detectAndNormalize(apiResponse)
if (!source) throw new Error('not a parsed DDD file')

const { activityRecords, placeRecords, eventRecords } =
  mergeRecordSets([source], source.generation)
```

`activityRecords` is one entry per calendar day in the shape the engine expects;
see [the record shape](../compliance/README.md#input-record-shape).

## Tests

[`../../test/ddd.test.js`](../../test/ddd.test.js) covers detection, merging and
compatibility. The end-to-end path from an API response to a report is covered by
[`../../test/analyze.test.js`](../../test/analyze.test.js) and the conformance
fixtures.
