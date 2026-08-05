# AGENTS.md

Guidance for AI coding agents working in this repository. Human contributors should
read [README.md](README.md) and the [Contributing](README.md#contributing) section
first; everything below is additional detail an agent needs to avoid breaking things
that are not obvious from the code.

## What this is

TachoBox is a Quasar 2 / Vue 3 single-page app that reads tachograph DDD files
(already parsed into JSON) and analyses driving and rest times against EU
Regulation 561/2006. There is no backend in this repository.

## Commands

```bash
npm install
npm run dev        # dev server on http://localhost:8189
npm run build      # production build -> dist/spa/
npm test           # vitest, run once
npm run lint       # eslint
npm run format     # prettier
npm run violations -- public/example.json --pretty   # compliance CLI
```

Before proposing a change as finished, run `npm run lint`, `npm test` and
`npm run build`. For UI changes also load http://localhost:8189/?demo=1 and look
at the result; if the page appears stale, hard-reload - Vite HMR sometimes keeps
an old module graph.

## Architecture rules

The repository is deliberately layered so the analysis logic can be reused
outside this app. Keep it that way:

| Layer | Rule |
|-------|------|
| `src/compliance/` | Framework-free and dependency-free, and **self-contained**: no imports outside its own directory at all, so the folder can be copied elsewhere and run. It has its own `package.json`. Relative imports carry the `.js` extension so it runs in plain Node. `cd src/compliance && node example.mjs` must keep working - that demo is the advertised entry point for anyone vendoring the engine. |
| `src/reference/` | Same constraints. Static lookup tables only. |
| `src/utils/ddd.js` | The adapter between the raw flespi `tacho-file-parse` JSON and the normalized records the engine consumes. Also framework-free. Documented in `src/utils/README.md`. |
| `src/analyze.js` | Facade over the two: flespi API response in, report out. The public entry point for consumers and the one a port mirrors, so its report shape is a contract - `test/conformance/` pins it. |
| `src/stores/`, `src/components/`, `src/pages/` | May import from all of the above; never the other way round. |

`scripts/find-violations.mjs` runs the engine under Node with no bundler. If you
add an import inside `src/compliance/`, `src/reference/` or `src/utils/ddd.js`,
that script must still run.

## Compliance logic

- Every statutory threshold lives in `src/compliance/rules.js`. Never inline a
  number in `violations.js` - import it. A new threshold needs a comment naming
  the article it comes from.
- Limits come from Regulation (EU) 561/2006; severity bands from Commission
  Regulation (EU) 2016/403. Cite the regulation and article generally. Do not
  reference specific real-world files, customer cases, report comparisons or
  third-party products in source comments.
- `test/violations.test.js` holds a golden-master snapshot of the full analysis
  over the bundled demo data, plus boundary assertions on every severity band.
  A change that alters violation output will fail it. That is the point: only
  update the snapshot when the change to the results is intended, and say why.
- `src/compliance/rules.json` and `test/conformance/expected-*.json` are
  **generated** - never edit them by hand. Run `npm run conformance:update`
  after any change that alters thresholds or analysis output, and bump
  `RULES_VERSION` in `rules.js` when a number or the detection coverage changes.
  They exist so the engine can be reimplemented in other languages and checked
  for equivalence, so an unexplained change to them is a breaking change.
- Severity values are `minor | serious | very-serious | most-serious`, plus
  `uncertain` (data gap, cannot judge) and `uncategorized` (a real infringement
  that 2016/403 does not grade). Do not collapse the last two into a severity
  band - the distinction is deliberate.

## Dates and times

- Tachograph timestamps are UNIX seconds in UTC (Reg. 2016/799). Activity is
  bucketed by UTC calendar day.
- All user-facing date/time rendering goes through `src/utils/format.js`, which
  owns the reactive time-zone, date-format and time-format settings. Do not call
  `toLocaleString` or build date strings anywhere else.
- Labels that name a *day* of activity (chart axes, calendar cells, the activity
  disc, violation periods) must stay UTC regardless of the time-zone setting, or
  they desync from the bars they sit next to. `format.js` has separate helpers
  for this - use them instead of the instant formatters.
- `MAX_TS` (`0xFFFFFFFF`), `MAX_ODO` (`0xFFFFFF`) and `MAX_SERIAL` are "not set"
  fillers written by the recorder, not missing values - they decode as a date in
  2106 or a 16 777 215 km odometer. Check with `isUnsetTime` / `isUnsetOdometer`
  from `format.js` before displaying **and before any arithmetic** (a filler
  minus a real odometer reading is a 16-million-km trip), and show
  `NOT_RECORDED` or a named state such as "Still inserted" rather than a blank
  cell, so the user can tell "the file does not say" from "nothing happened".

## Internationalization

- The English string **is** the i18n key: `t('Save JSON')`, not `t('save_json')`.
- A new string must be added to every locale in `src/i18n/` - there are 14. A
  missing key silently falls back to the key itself, so it will look fine in
  English and untranslated everywhere else.
- Never change a user-facing string while doing unrelated work; it silently
  invalidates that key in all 14 locales.

## Code style

- ESLint and Prettier are configured; run them rather than hand-formatting.
- Comments and documentation are ASCII-only: write `->` instead of an arrow
  glyph, `-` instead of an em dash, `>=` instead of the greater-or-equal sign.
  This keeps diffs, terminals and greps predictable. Where the output is HTML,
  use a character entity (`&mdash;`) rather than a raw glyph.
- Comments are brief and explain *why*, not *what*.
- Match the density and idiom of the surrounding file rather than introducing a
  new style.

## Quasar gotchas seen in this codebase

- `QItemSection` lays its content out as a **column**. The `row` utility class
  only sets `flex-wrap`, not `flex-direction`, so it cannot override that - set
  `flex-direction: row` explicitly or the icons in a list row will stack.
- Long lists use `QVirtualScroll`, not pagination. When virtualizing inside a
  dialog, point `scroll-target` at the dialog body so there is one scrollbar
  rather than nested ones.

## Data handling

- **Never commit real tachograph data.** Driver cards and VU files contain
  personal data: names, card numbers, VINs, certificates. `.gitignore` blocks
  the common extensions, but the responsibility is yours.
- The files in `public/` are synthetic demo data and are safe to use in tests
  and examples. Do not replace them with a real file.
- Do not add analytics, telemetry or third-party reporting. The README states
  that the app has none, and that claim must stay true.

## flespi API notes

- Device files are listed via `GET /gw/devices/{id}/media`. Its `data` parameter
  accepts only `fields`, `filter` and `uuid` - there is no `limit`/`offset`, so
  the whole list arrives in one response and any paging is client-side.
- Media file timestamps are `created` / `uploaded` / `modified`. There is no
  `ctime` field; asking for it silently yields nothing.
- The tachograph download date is not exposed in media metadata. It lives inside
  the file content (`LastCardDownload` for a driver card, `CurrentDateTime` for
  a VU) and is surfaced as `downloadTs` by `src/utils/ddd.js`.
- The original binary is fetched from `https://media.flespi.io/{uuid}`; files
  that are not `shared` require the token, so it goes through fetch + blob.

## Version

The version lives only in `package.json` and reaches the UI as `__APP_VERSION__`,
injected in `quasar.config.js`. Do not duplicate it anywhere else.
