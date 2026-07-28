// Compliance rule parameters - the single source of truth for every statutory
// threshold used by the engine. Pure data + classifiers, zero dependencies, so
// this module can be audited against the regulations in isolation and reused
// outside the app. Algorithms live in ./violations.js; only the *numbers* and
// the severity banding live here.
//
//  - Limits: Regulation (EU) 561/2006
//    https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:02006R0561-20241231
//  - Severity bands: Commission Regulation (EU) 2016/403, Annex

// Version of the RULE SET, not of the app. Bump it whenever a number in LIMITS
// or SEVERITY changes, or when the set of detected infringements changes.
// Reimplementations in other languages should report the version they were
// ported from, so a divergence shows up instead of going unnoticed.
export const RULES_VERSION = '1.0.0'

const H = (h) => Math.round(h * 60) // hours -> minutes

// --- Statutory limits (minutes, unless noted) ---
export const LIMITS = {
  continuousDrive: 270, // Art.7 - 4h30 max uninterrupted driving
  breakRequired: 45, // Art.7 - 45 min break resets continuous driving
  breakSplit1: 15, // Art.7 - first part of a split break (>=15 min)
  breakSplit2: 30, // Art.7 - second part of a split break (>=30 min after the first)
  dailyDrive: 9 * 60, // Art.6.1 - 9h base daily driving
  dailyDriveExtended: 10 * 60, // Art.6.1 - 10h extended
  dailyDriveExtPerWeek: 2, // Art.6.1 - extension allowed at most twice per week
  weeklyDrive: 56 * 60, // Art.6.2 - 56h weekly driving
  biweeklyDrive: 90 * 60, // Art.6.3 - 90h over two consecutive weeks
  dailyRestRegular: 11 * 60, // Art.4(g)/8.2 - 11h regular daily rest
  dailyRestReduced: 9 * 60, // Art.4(g)/8.2 - 9h reduced daily rest
  dailyRestSplitPart1: 3 * 60, // Art.4(g) - first part of a split regular daily rest (3h + 9h)
  dailyRestReducedMax: 3, // Art.8.2/8.4 - reduced daily rest max 3x between weekly rests
  weeklyRestReduced: 24 * 60, // Art.8.6 - 24h reduced weekly rest
  weeklyRestRegular: 45 * 60, // Art.8.6 - 45h regular weekly rest
  weeklyRestMaxInterval: 6 * 24 * 60, // Art.8.6 - next weekly rest within six 24h periods
}

// --- Severity bands (Reg. 2016/403) ---
// The regulation lists only the SI/VSI/MSI thresholds; anything above the legal
// limit but below the first listed band is the residual MI (minor).
//   dir 'over'  -> larger value is worse (driving overages): first band with at <= value wins
//   dir 'under' -> smaller value is worse (short rests):     first band with at >  value wins
//   offset      -> subtracted from the value before comparison (e.g. interval overage)
// `value` is minutes (driving time, rest duration, or interval), per type.
export const SEVERITY = {
  'continuous-driving': {
    dir: 'over',
    bands: [
      { at: H(6), level: 'very-serious' },
      { at: H(5), level: 'serious' },
    ],
  },
  'weekly-driving': {
    dir: 'over',
    bands: [
      { at: H(70), level: 'most-serious' },
      { at: H(65), level: 'very-serious' },
      { at: H(60), level: 'serious' },
    ],
  },
  'biweekly-driving': {
    dir: 'over',
    bands: [
      { at: H(112.5), level: 'most-serious' },
      { at: H(105), level: 'very-serious' },
      { at: H(100), level: 'serious' },
    ],
  },
  'daily-rest': {
    // Insufficient reduced daily rest < 9h (reduction allowed) - Reg. 2016/403
    // Annex III rows D4-D6: 8-9h Serious, 7-8h Very serious, < 7h Most serious.
    dir: 'under',
    bands: [
      { at: H(7), level: 'most-serious' },
      { at: H(8), level: 'very-serious' },
      { at: H(9), level: 'serious' },
    ],
  },
  // NOTE: the Art.8.4 "more than 3 reduced daily rests" infringement is NOT in
  // either annex of Reg. 2016/403, so it has no severity band here - it is
  // emitted with severity 'uncategorized' (see violations.js). Same for the
  // Art.8.6 "two consecutive reduced weekly rests" and "reduced weekly rest not
  // compensated" rules: real infringements, but ungraded by 2016/403.

  'weekly-rest-reduced-short': {
    // Insufficient REDUCED weekly rest < 24h - Annex III rows D13-D15:
    // 22-24h Serious, 20-22h Very serious, < 20h Most serious.
    // NOTE: bands kept as a verified fact (and unit-tested), but NO detection is
    // wired for this type: Reg. 561/2006 / 2016/403 do not define how to tell a
    // sub-24h *weekly-rest attempt* apart from an ordinary long daily rest, so
    // detecting it would require an invented heuristic. Intentionally left unwired.
    dir: 'under',
    bands: [
      { at: H(20), level: 'most-serious' },
      { at: H(22), level: 'very-serious' },
      { at: H(24), level: 'serious' },
    ],
  },
  'weekly-rest-regular-short': {
    // Insufficient weekly rest < 45h when a reduced weekly rest was not allowed -
    // Annex III rows D16-D18: 42-45h Serious, 36-42h Very serious, < 36h Most serious.
    dir: 'under',
    bands: [
      { at: H(36), level: 'most-serious' },
      { at: H(42), level: 'very-serious' },
      { at: H(45), level: 'serious' },
    ],
  },
  'weekly-rest-interval': {
    // Exceeding 6 consecutive 24h periods after the previous weekly rest -
    // Reg. 2016/403 Annex III rows D19-D21 (overage beyond six 24h periods):
    // < 3h Minor, 3-12h Serious, >= 12h Very serious.
    dir: 'over',
    offset: LIMITS.weeklyRestMaxInterval,
    bands: [
      { at: H(12), level: 'very-serious' },
      { at: H(3), level: 'serious' },
    ],
  },
}

export const SEVERITY_RESIDUAL = 'minor' // above the limit but below the first listed band
export const SEVERITY_DEFAULT = 'serious' // unknown type - conservative fallback

export function classifySeverity(type, value) {
  const cfg = SEVERITY[type]
  if (!cfg) return SEVERITY_DEFAULT
  const v = cfg.offset ? value - cfg.offset : value
  for (const b of cfg.bands) {
    if (cfg.dir === 'over' ? v >= b.at : v < b.at) return b.level
  }
  return SEVERITY_RESIDUAL
}

// Daily-driving (Art.6.1) severity per Reg. 2016/403 Annex I rows 2-7. Distinct
// from classifySeverity because it depends on runtime state: whether the weekly
// 10h-extension allowance was still available, and whether the driver took no
// break/rest of >=4.5h. Bands:
//   extension available (limit 10h):     >10h -> 11-12h SI, >=12h VSI, >=15h w/o break MSI
//   extension used twice (limit 9h):     >9h  -> 10-11h SI, >=11h VSI, >=13h30 w/o break MSI
//   residual below the first threshold -> MI (minor)
export function classifyDailyDriving(driving, { extensionAllowed, noBreakNorRest }) {
  if (extensionAllowed) {
    if (noBreakNorRest && driving >= H(15)) return 'most-serious'
    if (driving >= H(12)) return 'very-serious'
    if (driving >= H(11)) return 'serious'
    return 'minor'
  }
  if (noBreakNorRest && driving >= H(13.5)) return 'most-serious'
  if (driving >= H(11)) return 'very-serious'
  if (driving >= H(10)) return 'serious'
  return 'minor'
}
