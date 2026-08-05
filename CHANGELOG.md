# Changelog

Notable changes, written for anyone reimplementing the normalization adapter
([`src/utils/ddd.js`](src/utils/ddd.js)) or the compliance engine
([`src/compliance/`](src/compliance/)) in another language. Each entry says what
changed in the data, what it means for a port, and where to look in the code.

See [src/compliance/README.md](src/compliance/README.md#porting-to-another-language)
for the conformance artifacts used to check a port.

## 0.9.0

The flespi `tacho-file-parse` plugin was corrected: the previous decoder
mis-read the vehicle unit (mass memory) layout, and its output for those files
could not be trusted. This release follows the corrected output.

**The compliance engine changed in one place only.** `RULES_VERSION` moves to
`1.1.0` for the place-buffer rule in item 9; no threshold or severity band moved,
and the conformance reports in `test/conformance/` are identical apart from the
version they carry. Everything else below is about the adapter - the stage that
turns parser JSON into activity records. If your port keeps those two layers
separate, most of the work is in the first one.

### 1. Vehicle unit files have a new shape

Previously each element of `result[]` was one day, with the activity directly
under `content`. Now one element holds the whole download, wrapped in a
generation marker:

```
content.VU_Tachograph      (Gen1)     // exactly one of the two per file
content.VU_Tachograph_G2   (Gen2)
  VuOverview        // file-wide: VIN, registration, CurrentDateTime,
                    // company locks, download and control activity
  VuActivities[]    // one object per calendar day
  VuEventsAndFaults // events, faults, over-speeding, time adjustments
  VuDetailedSpeed   // per-second speed
  VuTechnicalData   // calibrations, sensors, VU identification, power cuts
```

Each day in `VuActivities` carries `DateOfDayDownloaded`,
`OdometerValueMidnight`, `ActivityChangeInfo[]`, and per-day sub-record lists
(`VuCardIWData`, `VuPlaceDailyWorkPeriodData`, `VuGNSSADRecords`,
`VuSpecificConditionData`, `VuBorderCrossingRecords`, `VuLoadUnloadRecords`).

**Watch out:** single-element arrays became scalars. `CurrentDateTime` is a
number now, not `[number]`; the same for `VehicleIdentificationNumber`,
`VehicleRegistrationIdentification`, `CardSlotsStatus` and the certificates.
Genuine collections stay arrays. The per-day fields were always scalars. Reading
either form costs one helper:

```js
const scalar = (v) => (Array.isArray(v) ? v[0] : v)
```

`_rawValue` was removed from `ActivityChangeInfo` items - it was debug output.

Driver card files (`DF_Tachograph` / `DF_Tachograph_G2`) keep their shape apart
from items 2 and 3 below.

### 2. The GNSS block goes by five names

The same position object appears as `gnssPlaceRecord`, `gnssPlaceAuthRecord`
(authenticated, Gen2v2), `entryGNSSPlaceRecord` and `entryGNSSPlaceAuthRecord`
inside place records, and the older capitalised `GNSSPlaceAuthRecord`. Which one
you get depends on generation, file kind and parser version.

Canonicalize on read, once, in whatever your `extractRecords` equivalent is,
rather than teaching each consumer the variants. The target name differs per
record type, and this is not arbitrary - it is what the card side already used:

| Record type | Canonical name |
|-------------|----------------|
| GNSS accumulated driving | `gnssPlaceRecord` |
| Border crossings | `gnssPlaceAuthRecord` |
| Load/unload operations | `gnssPlaceAuthRecord` |
| Place records | `entryGNSSPlaceRecord` |

**This failure is silent.** If a record's GNSS block is missing, every record
hashes to the same deduplication key and the whole set collapses to one row. We
lost 77 border crossings down to 1 this way, and the UI looked perfectly
plausible. Test the counts, not just that it renders.

### 3. Place records are wrapped

Every place entry, on both cards and vehicle units, now nests its fields in a
`placeRecord` object:

```json
{ "placeRecord": { "entryTime": 0, "entryTypeDailyWorkPeriod": "", 
                   "dailyWorkPeriodCountry": "", "dailyWorkPeriodRegion": "",
                   "vehicleOdometerValue": 0 } }
```

Unwrap before use. Same silent-collapse risk as item 2: we read 1 place instead
of 112 on a driver card until this was fixed. Note `dailyWorkPeriodRegion` is a
string now - it was a raw number on the memory side.

### 4. Data that is now available

None of this existed in the previous parser output for vehicle unit files:

| Source | What it is |
|--------|------------|
| `VuEventsAndFaults.VuEventRecords` | Events, same shape as card events |
| `VuEventsAndFaults.VuFaultRecords` | Faults |
| `VuEventsAndFaults.VuOverSpeedingEventRecords` | Over-speeding, event type 7, plus `maxSpeedValue` / `averageSpeedValue` |
| `VuTechnicalData.VuPowerSupplyInterruptionRecords` | Power cuts, event type 8, event shape |
| `VuActivities[].VuCardIWData` | Card insertion/withdrawal cycles: driver name, card id, slot, odometer at both ends, previous vehicle |
| `VuTechnicalData` | VU identification, calibrations, paired sensors, cards known to the VU, ITS consent |
| `VuDetailedSpeed.VuDetailedSpeedBlocks` | Per-second speed, one block per minute of movement |

We fold over-speeding events and power interruptions into the ordinary event
list: they carry the event shape and their own event types, so keeping them
apart would only hide them. Whether you do the same is a UI decision, but note
that the anomaly detector consumes the event list, so folding them in changes
what it reports.

### 5. Values that are derived, not read

- **Daily distance for a vehicle unit** is the gap between consecutive midnight
  odometer readings. The last day of a download has no following reading, so it
  is 0 - not a missing value to guess at.
- **One vehicle record per download**, spanning its date range, with the
  odometer of the first and last day. The previous handling emitted one
  pseudo-vehicle per day.

### 6. Generation is a property of the source (breaking API change)

A driver card physically carries two applications and the user switches between
them; a vehicle unit download is one generation with nothing to switch. The
normalized source now says so directly:

```js
// before
{ g1: <payload>, g2: <payload or null> }

// now
{
  generation: 'g1' | 'g2',            // what this source's data actually is
  byGeneration: { g1: <payload>, g2: <payload> },  // only the keys it has
}
```

A vehicle unit fills only its own key. Read the payload through the accessor
rather than reaching into the object, so a global G1/G2 selection can never
blank out a source that has only one generation:

```js
export function sourceData(src, gen) {
  const by = src?.byGeneration
  if (!by) return null
  return by[gen] || by[src.generation] || by.g2 || by.g1 || null
}
```

The old shape read plausibly but lied: everything went into `g1` because that
was the fallback slot, so Gen2 memory files were labelled "G1" throughout the UI
and in the CLI report. If you copied the old two-slot design, this is worth
following - naming the slots after generations while using one of them as
"wherever the data goes" is what caused the bug.

Note the compliance engine's `crossReference(sources)` also reads this shape; it
is the one place where the engine knows about the adapter's source object.

### 7. Files decoded by the old parser

The old layouts are still recognised so previously saved JSON opens, but the
source is flagged and the UI shows a persistent banner telling the user to
upload the original DDD again. Detection is unambiguous - the shapes do not
overlap:

- current: `content.VU_Tachograph` or `content.VU_Tachograph_G2`
- legacy: `content.ActivityChangeInfo`, or `VuActivities` / 
  `VehicleIdentificationNumber` directly under `content`

Decide for yourself whether to refuse such files outright. We warn rather than
refuse because the data still renders and users have saved files.

### 8. The day is reported as 23:59:59, not midnight

`VuActivities[].DateOfDayDownloaded` comes back as the **last second** of the day
(90 of 91 days in the file measured), where the previous decoder gave midnight.
The engine's contract is that `activityRecordDate` is UTC midnight, so normalize
it - otherwise the whole activity timeline sits nearly a day away from records
that carry absolute timestamps (places, GNSS, events).

This one is expensive to miss because nothing looks broken: dates still format to
the right calendar day, and the app renders happily. What it does instead is
quietly wreck any cross-check between activity and absolute-time records. Here it
produced 29 phantom "work period marking missing" errors, which vanished once the
timestamps were aligned.

### 9. Place markings can only be judged where the record survives

Not a parser change, but a trap on the consuming side, and it cost us the same
kind of silent wrongness. A card holds its place entries in a ring buffer of
`noOfCardPlaceRecords` slots while activity data reaches back much further. Once
the buffer wraps, the oldest entries are gone - so the absence of a marking
before the earliest retained one means nothing.

Check the capacity, not just the earliest record: with slots still free nothing
was overwritten and every missing marking is genuine. On a card with 112 of 112
slots used this cut 893 findings to 2; on a reference card with 103 of 112 used,
suppressing anything would have contradicted the official infringement report we
validate against.

Derive the boundary from the **complete** place set, not from whatever slice the
caller is displaying. We got this wrong first: the UI passes date-filtered
records, so a full buffer looked like it still had room and the suppression
switched itself off - the same false findings reappeared as soon as a date range
was selected.

### 10. Deduplication traps

Two came up while following the new output, both of which look like data loss or
duplication rather than bugs:

- **The same event is stored more than once.** A VU writes an event once per
  `eventRecordPurpose` (most recent, longest, and so on) with identical begin and
  end times. Deduplicating on begin time plus type is correct here - it is one
  event. Calibration records duplicate the same way, by `calibrationPurpose`.
- **Rounding a timestamp before using it as a key merges distinct findings.**
  Usage errors carry an exact `ts`; rounding to the day and keying on that
  silently merges two findings of the same kind on one day.

### Checklist for a port

1. Read `VU_Tachograph` / `VU_Tachograph_G2`, and `VuOverview` for file-wide fields.
2. Accept scalars where you previously read one-element arrays.
3. Unwrap `placeRecord`.
4. Canonicalize the GNSS block name per record type (table in item 2).
5. Assert record **counts** against a known file, not just that parsing succeeds -
   both bugs above were silent.
6. Re-run the conformance reports in `test/conformance/`; they should still match,
   since the compliance engine is unchanged.

## Earlier versions

Not documented here. This file starts at the release that broke input
compatibility for vehicle unit files.
