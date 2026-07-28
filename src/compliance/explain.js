// Human-readable explanation of each infringement article, shown as a tooltip
// wherever a code/article appears (summary matrix + violation rows). Keyed by
// article code; the string IS the i18n key (project convention - English key =
// fallback value). Wording follows the thresholds encoded in ./rules.js.
const EXPLAIN = {
  '6.1': 'Daily driving is limited to 9h, extendable to 10h at most twice a week. Above the applicable limit it is an infringement; severity grows with the excess, and driving with no break or rest of at least 4.5h aggravates it (Reg. 561/2006 Art. 6.1).',
  '6.2': 'Weekly driving is limited to 56h. Severity by weekly total: 60–65h serious, 65–70h very serious, ≥70h most serious (Art. 6.2).',
  '6.3': 'Driving over two consecutive weeks is limited to 90h. Severity: 100–105h serious, 105–112h30 very serious, ≥112h30 most serious (Art. 6.3).',
  '7': 'Driving may not exceed 4h30 without a break of at least 45 min (or 15 min followed by 30 min). Breaks under 15 min, other work and availability do not count. Severity by continuous driving: 5–6h serious, ≥6h very serious (Art. 7).',
  '8.2': 'Daily rest must be at least 11h, or a reduced 9h up to three times between weekly rests. A reduced daily rest under 9h is graded: 8–9h serious, 7–8h very serious, under 7h most serious. More than three reduced daily rests between weekly rests is an infringement that Reg. 2016/403 does not grade (shown as “not graded”) (Art. 8.2 / 8.4).',
  '8.6': 'A weekly rest must start within six 24-hour periods of the previous one (overage 3–12h serious, ≥12h very serious). Over any two consecutive weeks at least one weekly rest must be regular (≥45h), and a reduced weekly rest (24–45h) must be compensated within three weeks; these two rules are not graded by Reg. 2016/403 (Art. 8.6).',
  '34.1': 'The driver card was withdrawn without properly closing the session (improper card removal, Reg. 165/2014 Art. 34).',
  '34.7': 'The start or end of the daily work period was not marked (no place entry) when the card was inserted or withdrawn (Reg. 165/2014 Art. 34).',
}

// Returns the explanation i18n key for a violation/usage-error code, or null.
// Accepts EU165-prefixed codes (e.g. "EU165 34.7").
export function explainKey(code) {
  if (!code) return null
  return EXPLAIN[String(code).replace(/^EU\d+\s+/, '')] || null
}
