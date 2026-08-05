import { filterDriverChanges, MINUTES_IN_DAY } from './activity.js'
import { LIMITS, classifySeverity, classifyDailyDriving } from './rules.js'

// All statutory thresholds and severity bands live in ./rules.js (EU 561/2006 +
// 2016/403). This module holds only the algorithms that apply them.

function getDayActivities(record) {
  if (!record?.activityChangeInfo?.length) return []
  const changes = filterDriverChanges(record.activityChangeInfo)
  const result = []
  for (let i = 0; i < changes.length; i++) {
    const startMin = changes[i].changeTime
    if (startMin >= MINUTES_IN_DAY) continue
    const endMin = i < changes.length - 1
      ? Math.min(changes[i + 1].changeTime, MINUTES_IN_DAY)
      : MINUTES_IN_DAY
    // Card-out time (cardInserted === false) is treated as rest. The stored
    // activity is stale (whatever was active before withdrawal, usually WORK or
    // DRIVING), so counting it would raise false rest/driving violations - the
    // driver is normally off-shift. The missing manual entry is surfaced instead
    // as a usage error (Reg. 165/2014 Art.34) in detectUsageErrors().
    const cardOut = changes[i].cardInserted === false
    result.push({
      activity: cardOut ? 'BREAK/REST' : (changes[i].activity || 'BREAK/REST'),
      cardInserted: !cardOut,
      startMin,
      endMin,
      duration: endMin - startMin,
    })
  }
  return result
}

function getDailyDriving(record) {
  return getDayActivities(record)
    .filter((a) => a.activity === 'DRIVING')
    .reduce((sum, a) => sum + a.duration, 0)
}

// Continuous driving stretches (Reg. 561/2006 Art.7). A stretch is the driving
// accumulated between qualifying breaks. A qualifying break (Art.7) is a single
// REST of >=45 min, OR a >=15 min rest followed later by a >=30 min rest (the
// 15+30 split). Rests shorter than 15 min, "other work" and "availability" are
// NOT breaks: they neither reset nor count toward the break. Each stretch carries
// its driving total and the clock span [startMin,endMin] of the driving.
export function continuousDrivingStretches(record) {
  const activities = getDayActivities(record)
  const stretches = []
  let cur = null
  let had15 = false // a >=15 min rest is pending as the first half of a split break
  for (const a of activities) {
    if (a.activity === 'DRIVING') {
      if (!cur) cur = { startMin: a.startMin, endMin: a.endMin, driving: 0 }
      cur.driving += a.duration
      cur.endMin = a.endMin
    } else if (a.activity === 'BREAK/REST') {
      if (a.duration >= LIMITS.breakRequired || (had15 && a.duration >= LIMITS.breakSplit2)) {
        if (cur) { stretches.push(cur); cur = null }
        had15 = false
      } else if (a.duration >= LIMITS.breakSplit1) {
        had15 = true
      }
    }
    // WORK / AVAILABILITY: pause the stretch but neither reset nor credit a break.
  }
  if (cur) stretches.push(cur)
  return stretches
}

export function maxContinuousDriving(record) {
  return continuousDrivingStretches(record).reduce((m, s) => Math.max(m, s.driving), 0)
}

function checkContinuousDriving(record) {
  return continuousDrivingStretches(record)
    .filter((s) => s.driving > LIMITS.continuousDrive)
    .map((s) => ({
      type: 'continuous-driving', code: '7',
      severity: classifySeverity('continuous-driving', s.driving),
      message: 'Continuous driving {time} exceeds 4h30 limit without 45min break',
      messageParams: { time: formatMin(s.driving) },
      icon: 'mdi-steering',
      minutes: s.driving,
      startMin: s.startMin, endMin: s.endMin, // clock span of the stretch (for display + timeline highlight)
    }))
}

function formatMin(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${m ? ` ${m}m` : ''}`
}

export function analyzeDayViolations(record, { isLastDay = false } = {}) {
  if (isLastDay) return []

  const violations = []

  // Daily driving (Art.6.1) is analysed per-week in analyzeDailyDriving() because
  // the 9h->10h extension is allowed only twice per week.

  // Continuous driving
  violations.push(...checkContinuousDriving(record))

  return violations
}

// Daily driving (Art.6.1): max 9h, extendable to 10h at most twice per week.
// The extension allowance is per ISO week (Mon-Sun, UTC), so this runs across the
// whole dataset rather than per day. Severity via classifyDailyDriving() in rules.js.
export function analyzeDailyDriving(records) {
  const sorted = [...records]
    .filter((r) => r.activityChangeInfo?.length)
    .sort((a, b) => a.activityRecordDate - b.activityRecordDate)
  if (!sorted.length) return []

  // The most recent day may be incomplete - don't judge it (matches analyzeDayViolations).
  const lastTs = sorted[sorted.length - 1].activityRecordDate

  const weeks = new Map()
  for (const r of sorted) {
    const day = new Date(r.activityRecordDate * 1000).getUTCDay()
    const monday = r.activityRecordDate - ((day === 0 ? 6 : day - 1) * 86400)
    if (!weeks.has(monday)) weeks.set(monday, [])
    weeks.get(monday).push(r)
  }

  const violations = []
  for (const weekRecords of weeks.values()) {
    let extensionsUsed = 0 // days this week already driving > 9h (max 2 allowed)
    for (const r of weekRecords) {
      const driving = getDailyDriving(r)
      if (driving <= LIMITS.dailyDrive) continue // <= 9h - within the base limit

      // The incomplete final day is not judged - and must not consume one of the
      // week's two extension allowances, or a later legitimate day could be wrongly
      // flagged as "extension already used twice".
      if (r.activityRecordDate === lastTs) continue
      const extensionAllowed = extensionsUsed < LIMITS.dailyDriveExtPerWeek
      extensionsUsed++ // this day extends beyond 9h, consuming one allowance
      if (extensionAllowed && driving <= LIMITS.dailyDriveExtended) continue // 9-10h with an extension available - legal

      // "without taking a break or any rest of >=4.5h" - no BREAK/REST segment >= 45 min
      const noBreakNorRest = !getDayActivities(r).some(
        (a) => a.activity === 'BREAK/REST' && a.duration >= LIMITS.breakRequired,
      )
      const severity = classifyDailyDriving(driving, { extensionAllowed, noBreakNorRest })
      const message = extensionAllowed
        ? 'Daily driving {time} exceeds the extended 10h limit'
        : 'Daily driving {time} exceeds 9h (extension already used twice this week)'
      violations.push({
        type: 'daily-driving', code: '6.1', severity,
        message, messageParams: { time: formatMin(driving) },
        icon: 'mdi-steering', minutes: driving, dayTs: r.activityRecordDate,
      })
    }
  }
  return violations
}

// Daily rest (Reg. 561/2006 Art. 8.2) - computed on a CONTINUOUS timeline, not
// per calendar day. A daily rest period normally spans midnight, so summing
// BREAK/REST within 00:00-24:00 wrongly splits it and under-reports rest. Here
// we merge rest blocks across day boundaries and apply the rolling 24h rule:
// within 24h after the end of the previous daily/weekly rest a new daily rest
// (>=9h reduced, >=11h regular, or a 3h+9h split) must be taken.
function dayTsOf(absMin) {
  const ts = absMin * 60
  return ts - (ts % 86400)
}

function buildTimeline(records) {
  const sorted = [...records]
    .filter((r) => r.activityChangeInfo?.length)
    .sort((a, b) => a.activityRecordDate - b.activityRecordDate)
  const segs = []
  for (const r of sorted) {
    const base = r.activityRecordDate / 60 // absolute minutes since epoch
    for (const a of getDayActivities(r)) {
      segs.push({ start: base + a.startMin, end: base + a.endMin, rest: a.activity === 'BREAK/REST' })
    }
  }
  return segs
}

// Total minutes within [a, b] NOT covered by any activity segment (missing days).
function uncoveredWithin(segs, a, b) {
  let covered = 0
  for (const s of segs) {
    const lo = Math.max(a, s.start)
    const hi = Math.min(b, s.end)
    if (hi > lo) covered += hi - lo
  }
  return Math.max(0, (b - a) - covered)
}

// Merge contiguous BREAK/REST segments into rest blocks spanning day boundaries.
function getRestBlocks(records) {
  const segs = buildTimeline(records)
  const restBlocks = []
  let cur = null
  for (const s of segs) {
    if (s.rest) {
      if (cur && Math.abs(s.start - cur.end) < 1) cur.end = s.end
      else { if (cur) restBlocks.push(cur); cur = { start: s.start, end: s.end } }
    } else if (cur) { restBlocks.push(cur); cur = null }
  }
  if (cur) restBlocks.push(cur)
  for (const b of restBlocks) b.dur = b.end - b.start
  return { segs, restBlocks }
}

export function analyzeDailyRest(records) {
  const { segs, restBlocks } = getRestBlocks(records)
  if (!segs.length) return []

  const timelineEnd = segs[segs.length - 1].end
  const violations = []
  let T0 = segs[0].start
  let reducedCount = 0 // reduced daily rests taken since the last weekly rest (Art.8.2/8.4: max 3)
  // T0 advances by at least a reduced daily rest (9h) every iteration, so this
  // bound always covers a real timeline; it only guards a pathological non-advance.
  const maxIter = Math.ceil((timelineEnd - T0) / LIMITS.dailyRestReduced) + 10
  let guard = 0
  while (T0 + MINUTES_IN_DAY <= timelineEnd + 1 && guard++ < maxIter) {
    const windowEnd = T0 + MINUTES_IN_DAY
    // Art.8.2 requires the daily rest to be TAKEN within the 24h - i.e. at least
    // a 9h rest must fall inside the window, so it must start by windowEnd - 9h. A
    // rest begun later (even a long one) leaves < 9h inside the 24h and does not
    // satisfy the daily rest for this window.
    const dr = restBlocks.find((b) => b.start >= T0 - 1 && b.start <= windowEnd - LIMITS.dailyRestReduced && b.dur >= LIMITS.dailyRestReduced)
    if (dr) {
      // 3h+9h split counts as a regular daily rest (Art.4(g)): an earlier >=3h
      // block in the same window paired with this >=9h rest.
      const hasSplit = restBlocks.some((b) => b.end <= dr.start && b.start >= T0 - 1 && b.dur >= LIMITS.dailyRestSplitPart1)
      if (dr.dur >= LIMITS.weeklyRestReduced) {
        reducedCount = 0 // a weekly rest opens a new interval for the 3x allowance
      } else if (dr.dur < LIMITS.dailyRestRegular && !hasSplit) {
        reducedCount++
        // Reduced daily rest is allowed up to 3x between weekly rests; flag only the 4th+.
        if (reducedCount > LIMITS.dailyRestReducedMax) {
          violations.push({
            type: 'daily-rest-reduced', code: '8.2',
            severity: 'uncategorized', // Art.8.4 count infringement - not graded by Reg. 2016/403
            message: 'Reduced daily rest {time} — more than 3 since last weekly rest',
            messageParams: { time: formatMin(dr.dur) },
            icon: 'mdi-sleep', minutes: dr.dur, dayTs: dayTsOf(T0),
          })
        }
      }
      T0 = dr.end
    } else {
      const within = restBlocks.filter((b) => b.start >= T0 - 1 && b.start < windowEnd)
      // A rest started inside the window only counts for the part before the 24h
      // boundary (a late-started long rest gives < 9h within the window).
      const longest = within.reduce((m, b) => Math.max(m, Math.min(b.end, windowEnd) - b.start), 0)
      const missing = uncoveredWithin(segs, T0, windowEnd)
      // Window sitting in a data gap (missing days) - no basis to judge; jump to next data
      // and assume the 3x reduced-rest allowance resets (a weekly rest likely occurred).
      if (missing >= MINUTES_IN_DAY - 60) {
        const next = segs.find((s) => s.start > T0 + 1)
        if (!next) break
        T0 = next.start
        reducedCount = 0
        continue
      }
      const uncertain = missing > 60 && longest + missing >= LIMITS.dailyRestReduced
      violations.push({
        type: 'daily-rest', code: '8.2',
        severity: uncertain ? 'uncertain' : classifySeverity('daily-rest', longest),
        message: uncertain
          ? 'Daily rest {time} — {missing} of data missing, rest may be sufficient'
          : 'Daily rest {time} below minimum 9h',
        messageParams: uncertain
          ? { time: formatMin(longest), missing: formatMin(missing) }
          : { time: formatMin(longest) },
        icon: uncertain ? 'mdi-help-circle-outline' : 'mdi-sleep',
        uncertain, minutes: longest, dayTs: dayTsOf(T0),
      })
      // If a >=9h rest WAS taken in this window but started too late (so < 9h fell
      // inside the 24h), advance past its end so the ongoing rest isn't re-flagged
      // next window; a weekly-length late rest also reopens the 3x reduced allowance.
      const lateRest = within.filter((b) => b.dur >= LIMITS.dailyRestReduced).sort((a, b) => b.end - a.end)[0]
      if (lateRest && lateRest.dur >= LIMITS.weeklyRestReduced) reducedCount = 0
      T0 = lateRest ? lateRest.end : windowEnd
    }
  }
  return violations
}

// Weekly rest (Reg. 561/2006 Art. 8.6). A weekly rest is a continuous rest of
// >=24h (reduced) or >=45h (regular). We check:
//  (b) it must start no later than six 24h periods after the previous one;
//  (a) over two consecutive weekly rests at least one must be regular (you may
//      not take two reduced weekly rests in a row);
//  (c) a reduced weekly rest must be compensated by an equivalent block of rest
//      taken before the end of the third week that follows.
// All checks run on the continuous timeline; spans containing missing-day gaps
// are skipped (cannot be assessed) to avoid false positives on incomplete data.
export function analyzeWeeklyRest(records) {
  const { segs, restBlocks } = getRestBlocks(records)
  if (!restBlocks.length) return []
  const weekly = restBlocks.filter((b) => b.dur >= LIMITS.weeklyRestReduced)
  for (const w of weekly) w.regular = w.dur >= LIMITS.weeklyRestRegular
  // ISO week (Mon, UTC) of an absolute-minute timestamp - used to decide whether
  // a week already satisfies the "at least one regular weekly rest" rule (Art.8.9:
  // one weekly rest per week). A week can hold several rests >=24h (a long mid-week
  // daily rest plus the real weekly rest); without this, an extra long rest gets
  // mis-counted as a second reduced weekly rest and yields false 8.6 pairs.
  const weekOf = (startMin) => {
    const startSec = Math.round(startMin * 60)
    const dayStart = startSec - (startSec % 86400)
    const dow = new Date(startSec * 1000).getUTCDay()
    return dayStart - ((dow === 0 ? 6 : dow - 1) * 86400)
  }
  const weeksWithRegular = new Set(weekly.filter((w) => w.regular).map((w) => weekOf(w.start)))
  const violations = []

  for (let i = 1; i < weekly.length; i++) {
    const prev = weekly[i - 1]
    const next = weekly[i]
    if (uncoveredWithin(segs, prev.end, next.start) > 60) continue // data gap - can't assess
    const interval = next.start - prev.end
    if (interval > LIMITS.weeklyRestMaxInterval) {
      violations.push({
        type: 'weekly-rest-interval', code: '8.6',
        severity: classifySeverity('weekly-rest-interval', interval),
        message: 'More than 6×24h ({time}) without a weekly rest',
        messageParams: { time: formatMin(interval) },
        icon: 'mdi-calendar-alert', minutes: interval, dayTs: dayTsOf(prev.end),
      })
    }
    // 8.6 - two consecutive reduced weekly rests. The later one was taken where a
    // regular (45h) was required (the reduction allowance was used on `prev`), i.e.
    // a "weekly rest < 45h, reduction not allowed" - graded by its duration per
    // Reg. 2016/403 Annex III rows D16-D18.
    // Guard (Art.8.9, one weekly rest per week): a "pair" is real only if prev and
    // next are weekly rests of DIFFERENT weeks and NEITHER week has a regular rest.
    // Otherwise an extra long rest sharing a week with the real (regular) weekly
    // rest is wrongly paired.
    const prevWk = weekOf(prev.start)
    const nextWk = weekOf(next.start)
    const realPair = prevWk !== nextWk && !weeksWithRegular.has(prevWk) && !weeksWithRegular.has(nextWk)
    if (!prev.regular && !next.regular && realPair) {
      violations.push({
        type: 'weekly-rest-pair', code: '8.6',
        severity: classifySeverity('weekly-rest-regular-short', next.dur),
        message: 'Two reduced weekly rests in a row ({a} then {b}) — one must be regular',
        messageParams: { a: formatMin(prev.dur), b: formatMin(next.dur) },
        icon: 'mdi-calendar-alert', minutes: next.dur, dayTs: dayTsOf(next.start),
      })
    }
  }

  // 8.6(c) - reduced weekly rest not compensated within the next three weeks
  const COMP_WINDOW = 21 * MINUTES_IN_DAY
  for (const w of weekly) {
    if (w.regular) continue
    const windowEnd = w.end + COMP_WINDOW
    if (uncoveredWithin(segs, w.end, windowEnd) > 60) continue // can't confirm non-compensation
    const shortfall = LIMITS.weeklyRestRegular - w.dur
    const compensated = restBlocks.some((b) => b.start >= w.end && b.start < windowEnd && b.dur >= shortfall + LIMITS.dailyRestReduced)
    if (!compensated) {
      violations.push({
        type: 'weekly-rest-compensation', code: '8.6', severity: 'uncategorized', // 8.6 compensation - not graded by Reg. 2016/403
        message: 'Reduced weekly rest ({time}) not compensated within 3 weeks',
        messageParams: { time: formatMin(w.dur) },
        icon: 'mdi-scale-balance', dayTs: dayTsOf(w.end),
      })
    }
  }

  return violations.sort((a, b) => (a.dayTs || 0) - (b.dayTs || 0))
}

export function analyzeWeeklyViolations(records) {
  // Group records into weeks (ISO weeks, Monday-based)
  const sorted = [...records]
    .filter((r) => r.activityChangeInfo?.length)
    .sort((a, b) => a.activityRecordDate - b.activityRecordDate)

  if (!sorted.length) return { weeklyViolations: [], biweeklyViolations: [] }

  const weeks = new Map()
  for (const r of sorted) {
    const d = new Date(r.activityRecordDate * 1000)
    const day = d.getUTCDay()
    const monday = r.activityRecordDate - ((day === 0 ? 6 : day - 1) * 86400)
    if (!weeks.has(monday)) weeks.set(monday, [])
    weeks.get(monday).push(r)
  }

  const weeklyViolations = []
  const weekEntries = [...weeks.entries()].sort((a, b) => a[0] - b[0])

  for (const [weekStart, weekRecords] of weekEntries) {
    const totalDriving = weekRecords.reduce((sum, r) => sum + getDailyDriving(r), 0)
    if (totalDriving > LIMITS.weeklyDrive) {
      weeklyViolations.push({
        type: 'weekly-driving', code: '6.2',
        severity: classifySeverity('weekly-driving', totalDriving),
        weekStart,
        message: 'Weekly driving {time} exceeds 56h limit',
        messageParams: { time: formatMin(totalDriving) },
        totalDriving, minutes: totalDriving,
      })
    }
  }

  // Biweekly check
  const biweeklyViolations = []
  for (let i = 0; i < weekEntries.length - 1; i++) {
    // Art.6.3 is the total over two *consecutive* calendar weeks. weekEntries
    // holds only weeks that have data, so a gap can leave non-adjacent weeks side
    // by side - pair them only when they are exactly one week apart.
    if (weekEntries[i + 1][0] - weekEntries[i][0] !== 7 * 86400) continue
    const w1 = weekEntries[i][1].reduce((sum, r) => sum + getDailyDriving(r), 0)
    const w2 = weekEntries[i + 1][1].reduce((sum, r) => sum + getDailyDriving(r), 0)
    if (w1 + w2 > LIMITS.biweeklyDrive) {
      biweeklyViolations.push({
        type: 'biweekly-driving', code: '6.3',
        severity: classifySeverity('biweekly-driving', w1 + w2),
        weekStart: weekEntries[i][0],
        message: 'Biweekly driving {time} exceeds 90h limit',
        messageParams: { time: formatMin(w1 + w2) },
        minutes: w1 + w2,
      })
    }
  }

  return { weeklyViolations, biweeklyViolations }
}

export function getDayStatus(violations) {
  if (!violations.length) return 'green'
  const certain = violations.filter((v) => !v.uncertain)
  if (!certain.length) return 'grey'
  const hasSeriousOrWorse = certain.some((v) => v.severity === 'serious' || v.severity === 'very-serious' || v.severity === 'most-serious')
  return hasSeriousOrWorse ? 'red' : 'amber'
}

// Per-day compliance status across a record set: Map<dayTs, 'red'|'amber'|'grey'>.
// Days with no violations are absent (= green). Groups all 561/2006 driving/rest
// violations by day, then reduces with getDayStatus. Pure; callers pass whatever
// record window they want (e.g. the full dataset for an overview timeline).
export function dayStatusMap(records) {
  const recs = records.filter((r) => r.activityChangeInfo?.length)
  if (!recs.length) return new Map()
  const maxTs = recs.reduce((m, r) => Math.max(m, r.activityRecordDate), 0)
  const byDay = new Map()
  const add = (dayTs, v) => {
    if (dayTs == null) return
    if (!byDay.has(dayTs)) byDay.set(dayTs, [])
    byDay.get(dayTs).push(v)
  }
  for (const r of recs) {
    for (const v of analyzeDayViolations(r, { isLastDay: r.activityRecordDate === maxTs })) add(r.activityRecordDate, v)
  }
  for (const v of [...analyzeDailyDriving(recs), ...analyzeDailyRest(recs), ...analyzeWeeklyRest(recs)]) add(v.dayTs, v)
  const out = new Map()
  for (const [dayTs, vs] of byDay) out.set(dayTs, getDayStatus(vs))
  return out
}


// Anomaly detection
export function detectAnomalies(records, eventRecords) {
  const anomalies = []
  const sorted = [...records]
    .filter((r) => r.activityChangeInfo?.length)
    .sort((a, b) => a.activityRecordDate - b.activityRecordDate)

  // Gap detection - missing days
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].activityRecordDate - sorted[i - 1].activityRecordDate
    const gapDays = gap / 86400
    if (gapDays > 1) {
      anomalies.push({
        type: 'gap',
        severity: 'warning',
        ts: sorted[i - 1].activityRecordDate + 86400,
        message: '{count} day(s) missing between {from} and {to}',
        messageParams: { count: Math.round(gapDays - 1), from: formatDate(sorted[i - 1].activityRecordDate), to: formatDate(sorted[i].activityRecordDate) },
        description: 'No card activity was recorded on these days — the driver card was likely not inserted (e.g. days off).',
        icon: 'mdi-calendar-remove',
      })
    }
  }

  // Suspicious events from event records
  const suspiciousEventTypes = new Set([1, 2, 3, 4, 5, 6, 8, 10, 16, 17, 18, 19, 20, 21, 22, 23, 24, 32, 33, 34, 35, 36, 37])
  if (eventRecords?.length) {
    for (const ev of eventRecords) {
      if (suspiciousEventTypes.has(ev.eventType)) {
        anomalies.push({
          type: 'event',
          severity: ev.eventType >= 16 ? 'critical' : 'warning',
          ts: ev.eventBeginTime,
          message: getEventName(ev.eventType),
          description: getEventDescription(ev.eventType),
          icon: ev.eventType >= 16 ? 'mdi-shield-alert' : 'mdi-alert-circle',
        })
      }
    }
  }

  // Unaccounted time - days where total activities < 24h (significant gaps within day)
  for (const r of sorted) {
    const activities = getDayActivities(r)
    if (!activities.length) continue
    const totalMin = activities.reduce((sum, a) => sum + a.duration, 0)
    if (totalMin < MINUTES_IN_DAY - 5 && totalMin > 0) { // 5min tolerance
      const unaccounted = MINUTES_IN_DAY - totalMin
      if (unaccounted > 30) { // Only flag if > 30min unaccounted
        anomalies.push({
          type: 'unaccounted',
          severity: 'info',
          ts: r.activityRecordDate,
          message: '{time} unaccounted time on {date}',
          messageParams: { time: formatMin(unaccounted), date: formatDate(r.activityRecordDate) },
          description: 'Part of this day has no recorded activity — a gap within the card data for that day.',
          icon: 'mdi-clock-alert-outline',
        })
      }
    }
  }

  return anomalies.sort((a, b) => (a.ts || 0) - (b.ts || 0))
}

// EU165 / Reg. 165/2014 usage errors (digital tachograph). These are NOT
// driving-time infringements; they flag that the driver failed to operate the
// tachograph correctly (missing manual entries / place markings, improper card
// removal).
const PLACE_MARK_TOLERANCE = 60 * 60 // s - match a place marking within 1h of the card event

function reconstructCardEvents(records) {
  // Detect card insertion / withdrawal moments from cardInserted transitions.
  const sorted = [...records]
    .filter((r) => r.activityChangeInfo?.length)
    .sort((a, b) => a.activityRecordDate - b.activityRecordDate)
  const events = []
  for (const r of sorted) {
    const base = r.activityRecordDate
    const changes = filterDriverChanges(r.activityChangeInfo)
    let prev = null
    for (const ch of changes) {
      const inserted = ch.cardInserted !== false
      if (prev === null) { prev = inserted; continue }
      if (inserted !== prev) {
        events.push({ ts: base + ch.changeTime * 60, kind: inserted ? 'insert' : 'withdraw' })
        prev = inserted
      }
    }
  }
  return events
}

// Where the card's place-record ring buffer has wrapped, i.e. the point before
// which markings were overwritten and their absence means nothing. Returns null
// while the buffer still has room - then nothing was lost.
// MUST be computed over the complete place set: on a date-filtered slice the
// count looks below capacity and the earliest entry is too late, so the answer
// comes out wrong in both directions.
export function placeBufferBoundary(placeRecords = [], placeCapacity = null) {
  if (placeCapacity == null || placeRecords.length < placeCapacity) return null
  const times = placeRecords.map((p) => p.entryTime).filter(Boolean)
  return times.length ? Math.min(...times) - PLACE_MARK_TOLERANCE : null
}

export function detectUsageErrors(records, placeRecords = [], eventRecords = [], { placesTruncatedBefore = null } = {}) {
  const errors = []
  const begins = placeRecords.filter((p) => (p.entryTypeDailyWorkPeriod || '').startsWith('Begin')).map((p) => p.entryTime)
  const ends = placeRecords.filter((p) => (p.entryTypeDailyWorkPeriod || '').startsWith('End')).map((p) => p.entryTime)
  const near = (ts, arr) => arr.some((a) => Math.abs(ts - a) <= PLACE_MARK_TOLERANCE)

  // Where the place ring buffer has wrapped, markings before the earliest
  // retained one were overwritten and their absence means nothing. The boundary
  // arrives from the caller (placeBufferBoundary) because it has to be derived
  // from the COMPLETE place set: on a date-filtered slice a full buffer looks
  // like it still has room, and suppression silently switches off.
  const judgeable = (ts) => placesTruncatedBefore == null || ts >= placesTruncatedBefore

  // Art. 34(7) - symbols / start-end marking of the daily work period missing.
  for (const ev of reconstructCardEvents(records)) {
    if (!judgeable(ev.ts)) continue
    if (ev.kind === 'insert' && !near(ev.ts, begins)) {
      errors.push({
        type: '34.7', code: 'EU165 34.7', severity: 'serious',
        ts: ev.ts,
        message: 'Work period start marking missing',
        icon: 'mdi-map-marker-off',
      })
    } else if (ev.kind === 'withdraw' && !near(ev.ts, ends)) {
      errors.push({
        type: '34.7', code: 'EU165 34.7', severity: 'serious',
        ts: ev.ts,
        message: 'Work period end marking missing',
        icon: 'mdi-map-marker-off',
      })
    }
  }

  // Art. 34(1) - unauthorised / improper withdrawal of the driver card.
  // Surfaced from VU/card events: "Last session not correctly closed" (type 6).
  for (const ev of eventRecords) {
    if (ev.eventType === 6) {
      errors.push({
        type: '34.1', code: 'EU165 34.1', severity: 'serious',
        ts: ev.eventBeginTime,
        message: 'Unauthorised driver card withdrawal (last session not closed)',
        icon: 'mdi-card-remove',
      })
    }
  }

  return errors.sort((a, b) => (a.ts || 0) - (b.ts || 0))
}

const EVENT_NAMES = {
  1: 'Non-valid card insertion',
  2: 'Card conflict',
  3: 'Time overlap',
  4: 'Driving without appropriate card',
  5: 'Card insertion while driving',
  6: 'Last session not correctly closed',
  8: 'Power supply interruption',
  10: 'Vehicle motion conflict',
  16: 'Security breach',
  17: 'Motion sensor auth failure',
  18: 'Tachograph card auth failure',
  19: 'Unauthorised motion sensor change',
  20: 'Card data integrity error',
  21: 'Stored data integrity error',
  22: 'Internal data transfer error',
  23: 'Unauthorised case opening',
  24: 'Hardware sabotage',
  32: 'Sensor security breach',
  33: 'Sensor auth failure',
  34: 'Sensor data integrity error',
  35: 'Sensor internal transfer error',
  36: 'Sensor case opening',
  37: 'Sensor hardware sabotage',
}

function getEventName(type) {
  return EVENT_NAMES[type] || `Unknown event (${type})`
}

// Plain-language descriptions of tachograph event types (for UI tooltips).
const EVENT_DESCRIPTIONS = {
  1: 'An invalid or unrecognised card was inserted into the tachograph.',
  2: 'Conflicting driver cards were inserted (e.g. two cards in the driver slot).',
  3: 'A time inconsistency between card sessions (last withdrawal later than next insertion).',
  4: 'The vehicle was driven without a valid driver card inserted.',
  5: 'The driver card was inserted while the vehicle was already moving.',
  6: 'The previous card session was not closed properly (card removed without finishing).',
  8: 'The tachograph lost its power supply.',
  10: 'Motion-sensor data conflicts with other vehicle-movement information.',
  16: 'The tachograph detected a general security breach.',
  17: 'Authentication of the motion sensor failed.',
  18: 'Authentication of the tachograph card failed.',
  19: 'The motion sensor was changed without authorisation.',
  20: 'Integrity check of data read from the card failed (possible corruption or tampering).',
  21: 'Integrity check of data stored in the tachograph/card failed (possible corruption or tampering).',
  22: 'An error occurred transferring data internally within the tachograph.',
  23: 'The tachograph case was opened without authorisation.',
  24: 'Tampering or sabotage of the tachograph hardware was detected.',
  32: 'A security breach related to the motion sensor was detected.',
  33: 'Motion-sensor authentication failed.',
  34: 'Integrity check of motion-sensor data failed.',
  35: 'An internal data-transfer error occurred in the motion sensor.',
  36: 'The motion-sensor case was opened.',
  37: 'Tampering or sabotage of the motion sensor was detected.',
}

function getEventDescription(type) {
  return EVENT_DESCRIPTIONS[type] || ''
}

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

// Cross-reference driver card + VU
export function crossReference(sources) {
  const driverCards = sources.filter((s) => s.enabled && s.type === 'driver-card')
  const vuDailies = sources.filter((s) => s.enabled && s.type === 'vu-daily')

  if (!driverCards.length || !vuDailies.length) return null

  const findings = []

  // Compare overlapping dates
  for (const card of driverCards) {
    const cardData = card.byGeneration?.g2 || card.byGeneration?.g1
    const cardRecords = cardData?.EF_Driver_Activity_Data?.CardDriverActivity?.activityDailyRecords || []

    for (const vu of vuDailies) {
      const vuData = vu.byGeneration?.g2 || vu.byGeneration?.g1
      const vuRecords = vuData?.EF_Driver_Activity_Data?.CardDriverActivity?.activityDailyRecords || []

      const cardDates = new Set(cardRecords.map((r) => r.activityRecordDate))
      const vuDates = new Set(vuRecords.map((r) => r.activityRecordDate))

      // Days in VU but not in card
      for (const ts of vuDates) {
        if (!cardDates.has(ts)) {
          findings.push({
            type: 'vu-only',
            severity: 'info',
            ts,
            message: '{date}: present in VU data but not in driver card',
            messageParams: { date: formatDate(ts) },
            icon: 'mdi-truck',
          })
        }
      }

      // Days in card but not in VU
      for (const ts of cardDates) {
        if (!vuDates.has(ts)) {
          findings.push({
            type: 'card-only',
            severity: 'info',
            ts,
            message: '{date}: present in driver card but not in VU data',
            messageParams: { date: formatDate(ts) },
            icon: 'mdi-card-account-details',
          })
        }
      }

      // Overlapping days - compare driving time
      for (const ts of cardDates) {
        if (!vuDates.has(ts)) continue
        const cardRec = cardRecords.find((r) => r.activityRecordDate === ts)
        const vuRec = vuRecords.find((r) => r.activityRecordDate === ts)
        const cardDriving = getDailyDriving(cardRec)
        const vuDriving = getDailyDriving(vuRec)
        const diff = Math.abs(cardDriving - vuDriving)
        if (diff > 15) { // >15min difference
          findings.push({
            type: 'driving-mismatch',
            severity: 'warning',
            ts,
            message: '{date}: driving time differs — Card: {cardTime}, VU: {vuTime}',
            messageParams: { date: formatDate(ts), cardTime: formatMin(cardDriving), vuTime: formatMin(vuDriving) },
            icon: 'mdi-alert',
          })
        }
      }
    }
  }

  return findings.sort((a, b) => (a.ts || 0) - (b.ts || 0))
}
