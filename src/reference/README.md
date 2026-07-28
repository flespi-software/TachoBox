# Reference data

Static lookup tables for the EU digital tachograph spec - numeric codes mapped to
human-readable labels. Framework-free, dependency-free; import and use anywhere.

| File             | Contents |
|------------------|----------|
| `countries.js`   | `NATION_NUMERIC` (NationNumeric -> country name, Reg. 2016/799 Annex IC) and `nationName(code)`. |
| `tacho-codes.js` | `eventTypes` and `faultTypes` (numeric -> label, Reg. 2016/799 s.2.70, amended by 2021/1228). |
| `index.js`       | Barrel + `eventName(code)` / `faultName(code)` helpers with a fallback string. |

```js
import { nationName, eventName, faultName } from 'src/reference'

nationName(13)  // 'Germany'
eventName(6)    // 'Last card session not correctly closed'
faultName(0)    // whatever code 0 maps to, or 'Unknown fault (0)'
```

Every table cites its source regulation at the top of its file, so the values can
be checked against the spec in isolation.
