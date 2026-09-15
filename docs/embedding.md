# Embedding TachoBox

TachoBox is a static page, so embedding it means pointing an `<iframe>` at it
and describing what to show in the URL. Everything after `#/` is the app route
and its query parameters:

```
https://tachobox.flespi.io/#/?jsonurl=https://example.com/period/42/manifest.json&from=2026-01-01&to=2026-01-31&hidepanels=1
```

There are two ways to give it data:

| | From flespi | From your backend |
|---|---|---|
| URL | `/#/device/{deviceId}/file/{fileUuid}?token=...` | `/#/?jsonurl=...` |
| What it shows | one file of a flespi device | one file or a set of files |
| Authentication | a flespi token in the URL | none - the files are fetched as they are |
| Needs | a device with the [tacho-file-parse](https://flespi.com/kb/tacho-file-parse-plugin) plugin | the parsed JSON, served with CORS |

To show a period the user picks - several downloads at once - use `jsonurl`.

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
| `jsonurl` | URL of a JSON document - a single parsed file, a set of files or a manifest of links, see [Loading from your backend](#loading-from-your-backend). URL-encode it if it has its own query string | live |
| `device/{deviceId}` | route: flespi device ID. Without a file, opens the file picker for that device | live |
| `device/{deviceId}/file/{fileUuid}` | route: flespi device ID and media file UUID; loads that file | live |
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
data that was loaded.

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

```
/#/device/{deviceId}/file/{fileUuid}?token={token}&hidepanels=1
```

The app logs in with the token, loads the file from the device's media storage
and shows it. With `/#/device/{deviceId}` and no file, it opens the file picker
locked to that device.

To switch to another file, change the route in the iframe URL - the new file
replaces the previous one:

```js
iframe.src = `https://tachobox.flespi.io/#/device/${deviceId}/file/${fileUuid}?token=${token}&hidepanels=1`
```

A token in a URL ends up in browser history, referrer headers and server logs.
Issue a short-lived flespi token limited to the devices being viewed, or use
`jsonurl` instead.

## Loading from your backend

`jsonurl` points to a document your backend serves. TachoBox fetches it in the
browser and recognizes its shape.

### A single file

The parsed JSON of one DDD file - the same document the flespi API returns for
a media file requested with the fields `uuid,name,meta,content`:

```json
{ "result": [ { "uuid": "...", "name": "C_20260131.ddd", "meta": { }, "content": { } } ] }
```

### A set of files

The same `result` array with several items, or the items as a bare array:

```json
{ "result": [ { "uuid": "a", "name": "...", "meta": { }, "content": { } },
              { "uuid": "b", "name": "...", "meta": { }, "content": { } } ] }
```

```json
[ { "uuid": "a", "name": "...", "meta": { }, "content": { } },
  { "uuid": "b", "name": "...", "meta": { }, "content": { } } ]
```

### A manifest of links

An array of URLs, each pointing to a single file (or a set) as above:

```json
[
  "files/a.json",
  "https://cdn.example.com/ddd/b.json"
]
```

Relative links resolve against the manifest's own URL. The files are fetched in
parallel. This is the lightest option for a period: the backend returns a short
list for the selected period, and the files themselves stay individually
cacheable. A linked document cannot be another manifest.

### How a set is loaded

- Every file becomes a source of its own, and the sources are merged. Several
  downloads of the same driver card or vehicle unit are combined: overlapping
  days are deduplicated, and days only an older download holds are kept.
- A set should cover one driver or one vehicle. Driver card and vehicle unit
  files, or files of different drivers or vehicles, do not mix: a file that does
  not match the first file of the set is loaded disabled, and a notification
  names it. In `hidepanels` mode there is no control to enable it.
- A link that cannot be fetched, or an item without `content` (not processed by
  the plugin yet), is reported in a notification and skipped. The rest of the
  set still loads.
- With `hidepanels=1` a new `jsonurl` replaces what was shown. Without it, files
  are added to the ones already loaded, as the sidebar does.

### Requirements for the backend

- **CORS.** The browser fetches the documents from the TachoBox origin, so every
  response - the manifest and each file - needs an
  `Access-Control-Allow-Origin` header allowing it.
- **Access.** No credentials are sent. If the data is private, serve it on
  unguessable or short-lived signed URLs.
- **Content.** The JSON must be the tacho-file-parse plugin output. TachoBox
  never uploads it anywhere; it is parsed in the browser.

## Showing a period the user picks

The host application keeps the iframe and rewrites its URL when the user picks
a period. Only the part after `#` changes, so the page is not reloaded - the app
loads the new set and applies the range:

```js
const TACHOBOX = 'https://tachobox.flespi.io/'

function showPeriod(iframe, manifestUrl, from, to) {
  const params = new URLSearchParams({ jsonurl: manifestUrl, hidepanels: '1', hidedisclaimer: '1' })
  if (from) params.set('from', from) // 'YYYY-MM-DD' or unix seconds
  if (to) params.set('to', to)
  iframe.src = `${TACHOBOX}#/?${params}`
}

showPeriod(document.getElementById('tachobox'), 'https://example.com/drivers/17/period.json?from=2026-01-01&to=2026-01-31', '2026-01-01', '2026-01-31')
```

- **New `jsonurl`** - the set is loaded again, and a load still in progress is
  dropped.
- **Same `jsonurl`, new `from` / `to`** - only the range changes, nothing is
  fetched.
- **`from` / `to` removed** - the range shown stays as it was. Pass the full
  period, or load the set again, to show everything.
- **Range entirely outside the loaded data** - the filter is dropped and all
  loaded data is shown.

Driver card downloads usually reach back further than the picked period, which
is why `from` / `to` are worth passing along with the set.
