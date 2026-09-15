# Embedding TachoBox

TachoBox is a static page, so embedding it means pointing an `<iframe>` at it
and describing what to show in the URL. Everything after `#/` is the app route
and its query parameters:

```
https://tachobox.flespi.io/#/?jsonurl=https://example.com/ddd/a.json&jsonurl=https://example.com/ddd/b.json&from=2026-01-01&to=2026-01-31&hidepanels=1
```

There are two ways to give it data:

| | From flespi | From your backend |
|---|---|---|
| URL | `/#/device/{deviceId}/file/{uuid},{uuid}?token=...` | `/#/?jsonurl=...&jsonurl=...` |
| What it shows | one or more files of a flespi device | one or more files |
| Authentication | a flespi token in the URL | none - the files are fetched as they are |
| Needs | a device with the [tacho-file-parse](https://flespi.com/kb/tacho-file-parse-plugin) plugin | the parsed JSON, served with CORS |

Both take several files at once, so a period the user picks - several downloads
of one card or one vehicle unit - can be shown as one timeline.

## Quick start

```html
<iframe
  id="tachobox"
  src="https://tachobox.flespi.io/#/?jsonurl=https://example.com/ddd/abc.json&hidepanels=1&hidedisclaimer=1"
  width="100%"
  height="700"
  frameborder="0"
></iframe>
```

`hidepanels=1` removes the header and the sidebar and leaves only the data
view; it is the mode meant for embedding.

## Parameters

Parameter values are case-sensitive. Flags accept `1` or `true`.

"Live" means the app reacts when the parameter changes in the iframe URL.
"On start" means it is read once when the page loads; to change it, reload the
iframe.

### Data

| Parameter | Value | Applied |
|---|---|---|
| `jsonurl` | URL of a parsed JSON file. Repeat the parameter to load several files: `jsonurl=A&jsonurl=B`. URL-encode each value. See [Loading from your backend](#loading-from-your-backend) | live |
| `device/{deviceId}` | route: flespi device ID. Without a file, opens the file picker for that device | live |
| `device/{deviceId}/file/{uuid}` | route: flespi device ID and media file UUID; several UUIDs of that device separated by commas: `file/{uuid},{uuid}` | live |
| `token` | flespi token, used with the device routes | on start |
| `demo` | `1` - load the demo driver card | on start |

### Period

| Parameter | Value | Applied |
|---|---|---|
| `from` | first day shown: unix timestamp in seconds or `YYYY-MM-DD` | live |
| `to` | last day shown, inclusive: unix timestamp in seconds or `YYYY-MM-DD` | live |

Days are whole UTC days: a timestamp is rounded down to its UTC midnight.
Either parameter can be omitted to leave that end open. The range only filters
what is displayed - the user can still widen it with the date bar, up to the
data that was loaded. Works with both data sources.

### Layout

| Parameter | Value | Applied |
|---|---|---|
| `hidepanels` | `1` - hide the header and the sidebar | live |
| `hidecalendar` | `1` - hide the calendar panel | live |
| `hidedisclaimer` | `1` - hide the "not an official viewer" banner | live |
| `whitelabel` | `1` - no TachoBox branding: no product name in the header or the page title, no disclaimer banner, no flespi plugin link in messages | live |
| `noupload` | `1` - hide uploading raw DDD files to a flespi device (sidebar item and file dialog tab) | live |
| `noprint` | `1` - hide the print button; Ctrl+P no longer builds the app's print layout | live |
| `tabs` | comma-separated list of tabs to show, all others hidden: `tabs=overview,activities,compliance` | live |

Tab names: `overview`, `activities`, `vehicles`, `places`, `events`, `faults`,
`conditions`, `compliance`, `locks`, `downloads`, `borders`, `cargo`,
`controls`, `drivers`, `speed`, `technical`, `map`. A tab is also hidden when
the loaded data has nothing for it.

### Initial view

| Parameter | Value | Applied |
|---|---|---|
| `tab` | tab to open first, one of the names above | on start |
| `day` | unix timestamp of a day - opens its detail dialog once data is loaded | on start |
| `theme` | `light` or `dark` | on start |
| `lang` | UI language: `en-US`, `bg-BG`, `cs-CZ`, `de-DE`, `es-ES`, `fr-FR`, `it-IT`, `lv-LV`, `lt-LT`, `nl-NL`, `pl-PL`, `ro-RO`, `fi-FI`, `sv-SE` | on start |

## Loading from flespi

One file:

```
/#/device/{deviceId}/file/{uuid}?token={token}&hidepanels=1
```

Several files of the same device - UUIDs separated by commas:

```
/#/device/{deviceId}/file/{uuid1},{uuid2},{uuid3}?token={token}&from=2026-01-01&to=2026-01-31&hidepanels=1
```

The app logs in with the token, loads the files from the device's media storage
in parallel and shows them merged. A UUID the device does not have is reported
in a notification and skipped. With `/#/device/{deviceId}` and no file, it opens
the file picker locked to that device.

To switch files or the period, change the route in the iframe URL - with
`hidepanels=1` the new files replace the previous ones:

```js
iframe.src = `https://tachobox.flespi.io/#/device/${deviceId}/file/${uuids.join(',')}?token=${token}&hidepanels=1`
```

A token in a URL ends up in browser history, referrer headers and server logs.
Issue a short-lived flespi token limited to the devices being viewed, or use
`jsonurl` instead.

## Loading from your backend

`jsonurl` points to a JSON document your backend serves; TachoBox fetches it in
the browser. The document is the parsed JSON of a DDD file - the same document
the flespi API returns for a media file requested with the fields
`uuid,name,meta,content`:

```json
{ "result": [ { "uuid": "...", "name": "C_20260131.ddd", "meta": { }, "content": { } } ] }
```

### Several files

Repeat `jsonurl`, one parameter per file:

```
/#/?jsonurl=https%3A%2F%2Fexample.com%2Fddd%2Fa.json&jsonurl=https%3A%2F%2Fexample.com%2Fddd%2Fb.json&hidepanels=1
```

The files are fetched in parallel and merged. Each link adds its length to the
iframe URL; for a long list, one of the forms below keeps the URL short.

### Other forms of a `jsonurl` document

A single `jsonurl` can also point to a document that carries several files:

- **Several items in `result`** - `{ "result": [ {file a}, {file b} ] }`, or the
  items as a bare array `[ {file a}, {file b} ]`.
- **A manifest of links** - `[ "files/a.json", "https://cdn.example.com/ddd/b.json" ]`.
  Relative links resolve against the manifest's own URL. A linked document
  cannot be another manifest.

### How several files are loaded

This applies to repeated `jsonurl`, the forms above, and a UUID list alike.

- Every file becomes a source of its own, and the sources are merged. Several
  downloads of the same driver card or vehicle unit are combined: overlapping
  days are deduplicated, and days only an older download holds are kept.
- The files should cover one driver or one vehicle. Driver card and vehicle unit
  files, or files of different drivers or vehicles, do not mix: a file that does
  not match the first one is loaded disabled, and a notification names it. In
  `hidepanels` mode there is no control to enable it.
- A file that cannot be fetched, or one without `content` (not processed by the
  plugin yet), is reported in a notification and skipped. The rest still loads.
- With `hidepanels=1` new files replace what was shown. Without it, they are
  added to the ones already loaded, as the sidebar does.

### Requirements for the backend

- **CORS.** The browser fetches the documents from the TachoBox origin, so every
  response needs an `Access-Control-Allow-Origin` header allowing it.
- **Access.** No credentials are sent. If the data is private, serve it on
  unguessable or short-lived signed URLs.
- **Content.** The JSON must be the tacho-file-parse plugin output. TachoBox
  never uploads it anywhere; it is parsed in the browser.

## Showing a period the user picks

The host application keeps the iframe and rewrites its URL when the user picks
a period. Only the part after `#` changes, so the page is not reloaded - the app
loads the new files and applies the range:

```js
const TACHOBOX = 'https://tachobox.flespi.io/'

// fileUrls: links to the parsed files of the period; from/to: 'YYYY-MM-DD' or unix seconds
function showPeriod(iframe, fileUrls, from, to) {
  const params = new URLSearchParams({ hidepanels: '1', hidedisclaimer: '1' })
  for (const url of fileUrls) params.append('jsonurl', url)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  iframe.src = `${TACHOBOX}#/?${params}`
}

showPeriod(document.getElementById('tachobox'), [
  'https://example.com/ddd/0f3c9a.json',
  'https://example.com/ddd/7b21e4.json',
], '2026-01-01', '2026-01-31')
```

With flespi files, build the route instead:
`#/device/${deviceId}/file/${uuids.join(',')}?token=...&from=...&to=...&hidepanels=1`.

- **New files** - they are loaded again, and a load still in progress is
  dropped.
- **Same files, new `from` / `to`** - only the range changes, nothing is
  fetched.
- **`from` / `to` removed** - the range shown stays as it was. Pass the full
  period, or load the files again, to show everything.
- **Range entirely outside the loaded data** - the filter is dropped and all
  loaded data is shown.

Driver card downloads usually reach back further than the picked period, which
is why `from` / `to` are worth passing along with the files.
