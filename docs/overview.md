# TachoBox - what's inside

TachoBox is a web-based viewer for tachograph DDD files parsed into JSON. It works with both driver card and vehicle unit (VU) daily data, supporting Gen1 and Gen2 formats.

> **Note:** VU file parsing is currently under development. When loading VU data, the application displays only a minimal set of information (daily activities). Full VU support - including detailed events, faults, speed data, and vehicle-specific records - is planned for future releases. Driver card files are fully supported.

## Getting data in

There are four ways to load data:
- **From flespi** - log in, pick a device with the tachograph plugin, and browse its DDD files. You can add multiple devices and load files from each.
- **From disk** - upload one or more JSON files directly.
- **From URL** - pass `?jsonurl=https://example.com/data.json` to load a JSON file from an external URL.
- **Demo data** - one click loads a realistic sample with 62 days of activity, 5 vehicles across Europe, violations, events, faults, and GNSS coordinates.

Multiple files can be loaded simultaneously. Incompatible files (e.g. different drivers) prompt you to choose which one to display.

VU files without driver activity data (e.g. mass memory downloads containing only company locks and download history) are partially supported - the available technical/admin data is loaded and a warning is shown.

## Overview

The first tab gives you the big picture at a glance:
- **Vehicles** - all vehicles used by the driver, with license plates, time periods, and odometer readings.
- **Daily distance chart** - bar chart with week separators. Click any bar to inspect that day.
- **Activity heatmap** - GitHub-style grid showing driving intensity across weeks and months.
- **Driver profile radar** - spider chart breaking down time spent driving, working, and on availability.

## Activities

Two view modes:
- **Table** - each day as a row with an inline timeline bar, driving/work/rest/availability durations, and a distance progress bar.
- **Timeline** - vertical gantt chart with days as columns, distance bars below each day, and a kilometer scale. Scroll horizontally with the mouse wheel.

A collapsible calendar sidebar shows months with color-coded activity bars. Click any day in any view to open the day detail dialog.

## Day detail

A comprehensive breakdown of a single day:
- **24-hour clock disc** - hover over an activity in the list and the corresponding sector highlights on the disc.
- **Activity radar** - distribution of driving, work, and availability for that day.
- **EU 561/2006 limits** - progress bars for daily driving (9h), continuous driving (4.5h), and weekly driving (56h).
- **Violations** - if any limits were exceeded.
- **Activity list** - every activity change with times and durations.
- **Events, faults, places, special conditions** - everything recorded for that day.
- **Vehicle** - registration plate with odometer begin/end and distance.
- **GNSS map** - if coordinates are available, a map with the day's route.
- **Navigation** - arrows to step through days without closing the dialog.

The last day in the file is marked as "Incomplete" since the download may have happened mid-day - violation checks are skipped for it.

## Vehicles, Places, Events, Faults, Conditions

Each has its own tab with a searchable table. Click any row to jump to that day's detail view.

## Map

Available when Gen2 GNSS data is present. Shows the full route with waypoints on a Leaflet map, plus a table of all GNSS points below. Hover over a row to highlight the point on the map and vice versa. Fullscreen mode available.

## Compliance

- **EU 561/2006 violations** - daily driving (Art.6), breaks (Art.7), rest periods (Art.8), weekly and bi-weekly limits. Click any violation to see the day.
- **Anomalies** - missing days, suspicious events (power interruptions, security breaches, card conflicts), unaccounted time gaps. Each entry shows date and time, clickable.
- **Cross-reference** - when both driver card and VU data are loaded, compares them for discrepancies.

## Other details

- Gen1/Gen2 toggle when both generations are available.
- Download the original JSON for any loaded file.
- Dark and light themes.
- 14 languages.
- Responsive layout - works on desktop and mobile.
- Not an official DDD viewer - intended for data exploration only.

## URL parameters

TachoBox supports deep linking to load data directly via URL.

### Open a device file list

```
/#/device/{deviceId}?token={flespiToken}
```

Opens the file browser dialog for the specified device.

### Load a specific file

```
/#/device/{deviceId}/file/{fileUuid}?token={flespiToken}
```

Loads the file immediately and displays its data.

### Parameters

| Parameter | Description |
|-----------|-------------|
| `deviceId` | flespi device ID (route param) |
| `fileUuid` | UUID of the media file on the device (route param) |
| `token` | flespi token for authentication |
| `demo` | `1` - load demo driver card data on startup |
| `hidepanels` | `1` - hide header and sidebar (for embedding) |
| `hidecalendar` | `1` - hide the calendar sidebar |
| `hidedisclaimer` | `1` - hide the "not an official viewer" disclaimer banner |
| `jsonurl` | URL to a JSON file - loads and displays the data on page load |
| `tab` | Initial tab to open: `overview`, `activities`, `vehicles`, `places`, `events`, `faults`, `conditions`, `compliance`, `map` |
| `tabs` | Comma-separated list of tabs to show (hides all others). Example: `tabs=overview,map,compliance` |
| `day` | Unix timestamp - automatically open day detail dialog for this day |
| `theme` | `light` or `dark` - override the default dark theme |
| `lang` | Locale code - set the UI language. Example: `lang=fr-FR`. Supported: `en-US`, `bg-BG`, `cs-CZ`, `de-DE`, `es-ES`, `fr-FR`, `it-IT`, `lv-LV`, `lt-LT`, `nl-NL`, `pl-PL`, `ro-RO`, `fi-FI`, `sv-SE` |

## Embedding

TachoBox can be embedded into other applications via iframe. Use `hidepanels=1` to hide the header and sidebar, leaving only the data view.

```html
<iframe
  src="https://your-host/#/device/123456/file/abc-def-123?token=YOUR_TOKEN&hidepanels=1"
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

To switch the displayed file dynamically, change the iframe URL:

```js
const iframe = document.getElementById('tachobox')
iframe.src = `https://your-host/#/device/123456/file/NEW_UUID?token=YOUR_TOKEN&hidepanels=1`
```

The application detects URL changes and automatically loads the new file, replacing the previous one.

### Embedded mode behavior

When `hidepanels=1` is active:
- A loading spinner is shown while data is being fetched (instead of "No data loaded").
- If the URL points to a device without a specific file, the file picker dialog is locked to that device - the user cannot navigate to other devices, and must select a file before proceeding.
- The disclaimer banner can be hidden with `hidedisclaimer=1`.

### Loading JSON from external URL

You can also load data without flespi authentication by pointing to a pre-built JSON file:

```html
<iframe
  src="https://your-host/#/?jsonurl=https://example.com/driver-data.json&hidepanels=1&hidedisclaimer=1"
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

The JSON format should match the output of the flespi tacho-file-parse plugin.

## Languages

TachoBox is available in 14 languages: English, Bulgarian, Czech, German, Spanish, French, Italian, Latvian, Lithuanian, Dutch, Polish, Romanian, Finnish, and Swedish. The language can be changed in the Settings panel.
