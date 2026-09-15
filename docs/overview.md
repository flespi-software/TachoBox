# TachoBox - what's inside

TachoBox is a web-based viewer for tachograph DDD files parsed into JSON. It works with both driver card and vehicle unit (VU) daily data, supporting Gen1 and Gen2 formats.

> **Note:** Driver card files are fully supported. A vehicle unit download loads its daily activities, places, GNSS positions, border crossings, load/unload operations, control activities, company locks and download history, and its daily distance is derived from the midnight odometer readings. Events, faults and speed data are not read from VU files yet.

## Getting data in

There are four ways to load data:
- **From flespi** - log in, pick a device with the tachograph plugin, and browse its DDD files. You can add multiple devices and load files from each.
- **From disk** - upload one or more JSON files directly.
- **From URL** - pass `?jsonurl=https://example.com/data.json` to load a JSON file, a set of files or a manifest of links from an external URL - see [embedding.md](embedding.md#loading-from-your-backend).
- **Demo data** - one click loads a realistic sample with 62 days of activity, 5 vehicles across Europe, violations, events, faults, and GNSS coordinates.

Multiple files can be loaded simultaneously. Incompatible files (e.g. different drivers) prompt you to choose which one to display.

A VU download that carries no driver activity at all - only company locks and download history - still loads: the available technical and administrative data is shown, together with a warning that there is no activity to analyse.

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

## Embedding and URL parameters

TachoBox can be embedded in another application through an iframe, with the data and the view described by URL parameters: a flespi device file, a JSON file or a set of files from your own backend, the period, visible tabs, theme and language. See [embedding.md](embedding.md).

## Languages

TachoBox is available in 14 languages: English, Bulgarian, Czech, German, Spanish, French, Italian, Latvian, Lithuanian, Dutch, Polish, Romanian, Finnish, and Swedish. The language can be changed in the Settings panel.
