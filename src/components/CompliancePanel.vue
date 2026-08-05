<template>
  <div class="compliance-panel">

    <!-- Filters -->
    <div class="filter-bar q-mb-sm">
      <div class="filter-row">
        <q-chip
          v-for="c in categoryDefs" :key="c.key"
          clickable size="sm"
          :icon="c.icon"
          color="primary"
          :text-color="activeCategories[c.key] ? 'white' : 'primary'"
          :outline="!activeCategories[c.key]"
          @click="toggleCat(c.key)"
        >{{ $t(c.label) }}<q-badge v-if="categoryCounts[c.key]" color="transparent" :text-color="activeCategories[c.key] ? 'white' : 'grey'" class="chip-count">{{ categoryCounts[c.key] }}</q-badge></q-chip>
      </div>
      <div class="filter-row">
        <q-chip
          v-for="s in severityDefs" :key="s.key"
          clickable size="sm"
          :class="['sev-chip', 'sev-chip--' + s.key, { 'sev-chip--on': activeSeverities[s.key] }]"
          @click="toggleSev(s.key)"
        >{{ $t(s.label) }}</q-chip>
      </div>
    </div>

    <!-- Cross-reference -->
    <template v-if="xrefFindings !== null">
      <div class="section-title text-subtitle2 q-mb-xs">
        <q-icon name="mdi-compare-horizontal" size="xs" class="q-mr-xs" />
        {{ $t('Card / VU Cross-Reference') }}
        <q-badge v-if="xrefFindings.length" color="blue-grey" class="q-ml-xs">{{ xrefFindings.length }}</q-badge>
        <q-icon v-else name="mdi-check-circle" size="xs" class="text-green q-ml-xs" />
      </div>
      <div v-if="xrefFindings.length" class="detail-list q-mb-md">
        <div v-for="f in xrefFindings" :key="rowKey(f)" class="detail-row">
          <q-icon :name="f.icon" size="xs" :class="anomalySeverityClass(f.severity)" />
          <span class="text-caption">{{ $t(f.message, f.messageParams || {}) }}</span>
        </div>
      </div>
      <div v-else class="text-caption text-grey q-mb-md">{{ $t('No discrepancies found between driver card and VU data') }}</div>
    </template>

    <!-- Summary matrix (article × severity) -->
    <template v-if="settingsStore.showViolations && hasActivityData">
      <div class="section-title text-subtitle2 q-mb-xs">
        <q-icon name="mdi-table" size="xs" class="q-mr-xs" />
        {{ $t('Summary') }}
      </div>
      <table class="summary-matrix">
        <thead>
          <tr>
            <th class="text-left sev-code-col">{{ $t('Art.') }}</th>
            <th class="text-left">{{ $t('Infringement') }}</th>
            <th v-if="activeSeverities['minor']" class="sev-minor sev-head">MI<q-tooltip>{{ $t('Minor') }}</q-tooltip></th>
            <th v-if="activeSeverities['serious']" class="sev-serious sev-head">SI<q-tooltip>{{ $t('Serious') }}</q-tooltip></th>
            <th v-if="activeSeverities['very-serious']" class="sev-very-serious sev-head">VSI<q-tooltip>{{ $t('Very serious') }}</q-tooltip></th>
            <th v-if="activeSeverities['most-serious']" class="sev-most-serious sev-head">MSI<q-tooltip>{{ $t('Most serious') }}</q-tooltip></th>
            <th v-if="activeSeverities['uncertain']" class="sev-uncertain sev-head sev-unc-col">?<q-tooltip>{{ $t('Uncertain') }}</q-tooltip></th>
            <th v-if="activeSeverities['uncategorized']" class="sev-uncategorized sev-head sev-unc-col">NC<q-tooltip>{{ $t('Not graded by Reg. 2016/403') }}</q-tooltip></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summaryMatrix" :key="row.code">
            <td class="text-left text-grey sev-code-col">{{ row.code }}</td>
            <td class="text-left">{{ $t(row.label) }}
              <q-icon v-if="explain(row.code)" name="mdi-help-circle-outline" size="xs" class="text-grey help-icon">
                <q-tooltip max-width="320px">{{ $t(explain(row.code)) }}</q-tooltip>
              </q-icon>
            </td>
            <td v-if="activeSeverities['minor']" :class="{ 'sev-minor': row.MI }">{{ row.MI || '·' }}</td>
            <td v-if="activeSeverities['serious']" :class="{ 'sev-serious': row.SI }">{{ row.SI || '·' }}</td>
            <td v-if="activeSeverities['very-serious']" :class="{ 'sev-very-serious': row.VSI }">{{ row.VSI || '·' }}</td>
            <td v-if="activeSeverities['most-serious']" :class="{ 'sev-most-serious text-weight-bold': row.MSI }">{{ row.MSI || '·' }}</td>
            <td v-if="activeSeverities['uncertain']" class="sev-unc-col" :class="{ 'sev-uncertain': row.UNC }">{{ row.UNC || '·' }}</td>
            <td v-if="activeSeverities['uncategorized']" class="sev-unc-col" :class="{ 'sev-uncategorized': row.NC }">{{ row.NC || '·' }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- Violations -->
    <template v-if="settingsStore.showViolations && (activeCategories.rest || activeCategories.driving || activeCategories.breaks)">
      <div class="section-title text-subtitle2 q-mb-xs">
        <q-icon name="mdi-shield-alert" size="xs" class="q-mr-xs" />
        {{ $t('EU 561/2006 Violations') }}
        <q-badge v-if="filteredViolations.length" :color="worstColor" class="q-ml-xs">{{ filteredViolations.length }}</q-badge>
        <q-icon v-else name="mdi-check-circle" size="xs" class="text-green q-ml-xs" />
      </div>
      <div v-if="filteredViolations.length" class="detail-list q-mb-md">
        <div v-for="v in filteredViolations" :key="rowKey(v)" class="detail-row clickable-row" @click="openViolation(v)">
          <q-icon :name="v.icon || 'mdi-alert'" size="xs" :class="severityTextClass(v.severity)" />
          <span v-if="v.code" class="text-caption help-code" :class="severityTextClass(v.severity)">{{ v.code }}
            <q-tooltip v-if="explain(v.code)" max-width="320px">{{ $t(explain(v.code)) }}</q-tooltip>
          </span>
          <span class="text-caption" :class="severityTextClass(v.severity)">{{ v.dateStr || '' }}</span>
          <span class="text-caption">{{ $t(v.message, v.messageParams || {}) }}</span>
        </div>
      </div>
      <div v-else class="text-caption text-grey q-mb-md">{{ $t('No violations detected') }}</div>
    </template>

    <!-- Tachograph usage errors (Reg. 165/2014) -->
    <template v-if="settingsStore.showViolations && activeCategories.usage">
      <div class="section-title text-subtitle2 q-mb-xs">
        <q-icon name="mdi-card-account-details-outline" size="xs" class="q-mr-xs" />
        {{ $t('Tachograph usage errors (EU165)') }}
        <q-badge v-if="filteredUsageErrors.length" color="deep-orange" class="q-ml-xs">{{ filteredUsageErrors.length }}</q-badge>
        <q-icon v-else name="mdi-check-circle" size="xs" class="text-green q-ml-xs" />
      </div>
      <div v-if="filteredUsageErrors.length" class="detail-list q-mb-md">
        <div v-for="e in filteredUsageErrors" :key="rowKey(e)" class="detail-row clickable-row" @click="openViolation(e)">
          <q-icon :name="e.icon || 'mdi-alert'" size="xs" class="sev-serious" />
          <span class="text-caption sev-serious help-code">{{ e.code }}
            <q-tooltip v-if="explain(e.code)" max-width="320px">{{ $t(explain(e.code)) }}</q-tooltip>
          </span>
          <span class="text-caption text-grey">{{ e.dateStr }}</span>
          <span class="text-caption">{{ $t(e.message, e.messageParams || {}) }}</span>
        </div>
      </div>
      <div v-else class="text-caption text-grey q-mb-md">{{ $t('No usage errors detected') }}</div>
    </template>

    <!-- Anomalies -->
    <template v-if="activeCategories.anomalies">
      <div class="section-title text-subtitle2 q-mb-xs">
        <q-icon name="mdi-magnify-scan" size="xs" class="q-mr-xs" />
        {{ $t('Anomalies') }}
        <q-badge v-if="anomalies.length" color="orange" class="q-ml-xs">{{ anomalies.length }}</q-badge>
        <q-icon v-else name="mdi-check-circle" size="xs" class="text-green q-ml-xs" />
      </div>
      <div v-if="anomalies.length" class="detail-list q-mb-md">
        <div v-for="a in anomalies" :key="rowKey(a)" class="detail-row clickable-row" @click="a.dayTs && emit('day-click', a.dayTs)">
          <q-icon :name="a.icon" size="xs" :class="anomalySeverityClass(a.severity)" />
          <span class="text-caption" :class="anomalySeverityClass(a.severity)">{{ a.dateStr }}</span>
          <span class="text-caption">{{ $t(a.message, a.messageParams || {}) }}</span>
          <q-icon v-if="a.description" name="mdi-information-outline" size="xs" class="text-grey q-ml-auto">
            <q-tooltip max-width="280px">{{ $t(a.description) }}</q-tooltip>
          </q-icon>
        </div>
      </div>
      <div v-else class="text-caption text-grey q-mb-md">{{ $t('No anomalies detected') }}</div>
    </template>
  </div>
</template>

<script>
import { defineComponent, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDddStore } from 'src/stores/ddd'
import { useSettingsStore } from 'src/stores/settings'
import { analyzeDayViolations, analyzeDailyDriving, analyzeDailyRest, analyzeWeeklyRest, analyzeWeeklyViolations, detectAnomalies, detectUsageErrors, crossReference, explainKey } from 'src/compliance'
import { formatDate, formatDateTime } from 'src/utils/format'
import { useViolationDialog } from 'src/composables/violationDialog'

// Map a 561/2006 violation type to a filter category
const CATEGORY_BY_TYPE = {
  'daily-rest': 'rest',
  'daily-rest-reduced': 'rest',
  'weekly-rest-interval': 'rest',
  'weekly-rest-pair': 'rest',
  'weekly-rest-compensation': 'rest',
  'daily-driving': 'driving',
  'daily-driving-extended': 'driving',
  'weekly-driving': 'driving',
  'biweekly-driving': 'driving',
  'continuous-driving': 'breaks',
}

export default defineComponent({
  name: 'CompliancePanel',
  emits: ['day-click'],
  setup(props, { emit }) {
    const { t } = useI18n()
    const dddStore = useDddStore()
    const settingsStore = useSettingsStore()
    const { openViolation } = useViolationDialog()

    // --- Filters (category + severity, AND-combined) ---
    const categoryDefs = [
      { key: 'rest', label: 'Rest', icon: 'mdi-sleep' },
      { key: 'driving', label: 'Driving', icon: 'mdi-steering' },
      { key: 'breaks', label: 'Breaks', icon: 'mdi-coffee' },
      { key: 'usage', label: 'Usage errors', icon: 'mdi-card-account-details-outline' },
      { key: 'anomalies', label: 'Anomalies', icon: 'mdi-magnify-scan' },
    ]
    // Chip background/text styling is driven by the `sev-chip--<key>` CSS classes
    // (see <style>), which space the two reds apart and stay theme-aware when
    // de-selected. Severity order high->low: most < very < serious < minor.
    const severityDefs = [
      { key: 'most-serious', label: 'Most serious' },
      { key: 'very-serious', label: 'Very serious' },
      { key: 'serious', label: 'Serious' },
      { key: 'minor', label: 'Minor' },
      { key: 'uncategorized', label: 'Not graded' },
      { key: 'uncertain', label: 'Uncertain' },
    ]
    const activeCategories = reactive(Object.fromEntries(categoryDefs.map((c) => [c.key, true])))
    const activeSeverities = reactive(Object.fromEntries(severityDefs.map((s) => [s.key, true])))
    const toggleCat = (k) => { activeCategories[k] = !activeCategories[k] }
    const toggleSev = (k) => { activeSeverities[k] = !activeSeverities[k] }

    const dayViolations = computed(() => {
      const all = []
      const records = dddStore.activityRecords.filter((r) => r.activityChangeInfo?.length)
      const maxTs = records.reduce((max, r) => Math.max(max, r.activityRecordDate), 0)
      for (const r of records) {
        const isLastDay = r.activityRecordDate === maxTs
        const vs = analyzeDayViolations(r, { isLastDay })
        for (const v of vs) {
          all.push({ ...v, dayTs: r.activityRecordDate, dateStr: formatDate(r.activityRecordDate) })
        }
      }
      return all
    })

    const restViolations = computed(() =>
      [
        ...analyzeDailyDriving(dddStore.activityRecords),
        ...analyzeDailyRest(dddStore.activityRecords),
        ...analyzeWeeklyRest(dddStore.activityRecords),
      ].map((v) => ({ ...v, dateStr: formatDate(v.dayTs) })),
    )

    const weeklyData = computed(() => analyzeWeeklyViolations(dddStore.activityRecords))

    const allViolations = computed(() => {
      const list = [...dayViolations.value, ...restViolations.value]
      for (const v of weeklyData.value.weeklyViolations) {
        list.push({ ...v, dayTs: v.weekStart, dateStr: t('Week of {date}', { date: formatDate(v.weekStart) }), icon: 'mdi-calendar-week' })
      }
      for (const v of weeklyData.value.biweeklyViolations) {
        list.push({ ...v, dayTs: v.weekStart, dateStr: t('Fortnight from {date}', { date: formatDate(v.weekStart) }), icon: 'mdi-calendar-range' })
      }
      return list.sort((a, b) => (a.dayTs || 0) - (b.dayTs || 0))
    })

    const filteredViolations = computed(() => allViolations.value.filter((v) => {
      const cat = CATEGORY_BY_TYPE[v.type] || 'driving'
      const sev = activeSeverities[v.severity] !== undefined ? activeSeverities[v.severity] : true
      return activeCategories[cat] && sev
    }))

    const worstColor = computed(() => {
      if (filteredViolations.value.some((v) => v.severity === 'most-serious')) return 'red-10'
      if (filteredViolations.value.some((v) => v.severity === 'very-serious')) return 'red'
      if (filteredViolations.value.some((v) => v.severity === 'serious')) return 'deep-orange'
      return 'amber'
    })

    const anomalies = computed(() => {
      const raw = detectAnomalies(dddStore.activityRecords, dddStore.eventRecords)
      return raw.map((a) => {
        if (!a.ts) return { ...a, dateStr: '', dayTs: null }
        const dayTs = a.ts - (a.ts % 86400)
        const dateStr = a.type === 'event' ? formatDateTime(a.ts) : formatDate(a.ts)
        return { ...a, dateStr, dayTs }
      })
    })

    const usageErrors = computed(() => {
      const raw = detectUsageErrors(dddStore.activityRecords, dddStore.placeRecords, dddStore.eventRecords, { placesTruncatedBefore: dddStore.placesTruncatedBefore })
      return raw.map((e) => {
        const dayTs = e.ts ? e.ts - (e.ts % 86400) : null
        const dateStr = e.ts ? formatDateTime(e.ts) : ''
        return { ...e, dayTs, dateStr }
      })
    })

    const filteredUsageErrors = computed(() =>
      usageErrors.value.filter((e) => activeSeverities[e.severity] !== false),
    )

    // Summary matrix: every infringement type we evaluate x severity (MI/SI/VSI/MSI).
    // All rows are always shown (0 when none), so the full compliance picture
    // (EC561 + EU165) is visible, not just the articles that happen to have findings.
    // Uncertain items are excluded.
    const SEV_COL = { minor: 'MI', serious: 'SI', 'very-serious': 'VSI', 'most-serious': 'MSI', uncertain: 'UNC', uncategorized: 'NC' }
    const SUMMARY_ROWS = [
      { code: '6.1', label: 'Daily driving' },
      { code: '6.2', label: 'Weekly driving' },
      { code: '6.3', label: 'Two-week driving' },
      { code: '7', label: 'Break' },
      { code: '8.2', label: 'Daily rest' },
      { code: '8.6', label: 'Weekly rest' },
      { code: '34.1', label: 'Card withdrawal' },
      { code: '34.7', label: 'Work period marking' },
    ]
    // Per-category item counts for the filter chips. Respect the severity filter but
    // NOT the category's own on/off state, so a chip still shows what it would reveal.
    const categoryCounts = computed(() => {
      const c = { rest: 0, driving: 0, breaks: 0, usage: 0, anomalies: 0 }
      for (const v of allViolations.value) {
        if (activeSeverities[v.severity] === false) continue
        const cat = CATEGORY_BY_TYPE[v.type] || 'driving'
        if (c[cat] !== undefined) c[cat]++
      }
      for (const e of usageErrors.value) {
        if (activeSeverities[e.severity] === false) continue
        c.usage++
      }
      c.anomalies = anomalies.value.length
      return c
    })

    const hasActivityData = computed(() => dddStore.activityRecords.some((r) => r.activityChangeInfo?.length))
    const summaryMatrix = computed(() => {
      const rows = new Map(SUMMARY_ROWS.map((r) => [r.code, { ...r, MI: 0, SI: 0, VSI: 0, MSI: 0, UNC: 0, NC: 0 }]))
      for (const v of [...filteredViolations.value, ...filteredUsageErrors.value]) {
        const col = SEV_COL[v.severity]
        // usage errors carry codes like "EU165 34.7" - match on the bare article number
        const row = rows.get((v.code || '').replace(/^EU\d+\s+/, ''))
        if (col && row) row[col]++
      }
      return [...rows.values()]
    })

    const xrefFindings = computed(() => crossReference(dddStore.sources))

    function severityTextClass(severity) {
      if (severity === 'most-serious') return 'sev-most-serious'
      if (severity === 'very-serious') return 'sev-very-serious'
      if (severity === 'serious') return 'sev-serious'
      if (severity === 'uncertain') return 'sev-uncertain'
      if (severity === 'uncategorized') return 'sev-uncategorized'
      return 'sev-minor'
    }

    function anomalySeverityClass(severity) {
      if (severity === 'critical') return 'sev-very-serious'
      if (severity === 'warning') return 'sev-warning'
      return 'sev-uncertain'
    }

    // Stable, content-based v-for key for the detail lists (violations, usage
    // errors, anomalies, cross-reference findings). An array index key would let
    // Vue patch the wrong row - and carry over a stale tooltip - when the lists
    // are re-filtered by the category/severity toggles above.
    // The exact `ts` must win over `dayTs`: usage errors carry both, and dayTs is
    // rounded to midnight, so two findings of the same kind on one day would
    // otherwise collide. Duplicate keys corrupt Vue's list patching and surface
    // as "Cannot read properties of null" from deep inside the renderer.
    const rowKey = (x) => [x.type, x.code, x.ts ?? x.dayTs ?? x.weekStart, x.minutes, x.startMin, x.message].join('|')

    return {
      settingsStore,
      categoryDefs,
      severityDefs,
      activeCategories,
      activeSeverities,
      toggleCat,
      toggleSev,
      filteredViolations,
      summaryMatrix,
      hasActivityData,
      categoryCounts,
      worstColor,
      filteredUsageErrors,
      anomalies,
      xrefFindings,
      severityTextClass,
      anomalySeverityClass,
      openViolation,
      explain: explainKey,
      emit,
      rowKey,
    }
  },
})
</script>

<style scoped>
.compliance-panel {
  padding: 8px;
}

.section-title {
  display: flex;
  align-items: center;
}

.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.filter-row .q-chip {
  margin: 2px 0;
  font-size: 12px;
}

/* Severity filter chips. Selected (--on) = solid fill with a deliberate
   lightness ramp so the two reds read apart (very-serious bright red vs
   most-serious dark maroon). De-selected = outline whose text/border use the
   theme-aware --sev-* vars so it stays legible on both the light and dark page. */
.filter-row .sev-chip {
  border: 1px solid transparent;
  background: transparent;
}
.filter-row .sev-chip--minor:not(.sev-chip--on)        { color: var(--sev-minor);        border-color: var(--sev-minor); }
.filter-row .sev-chip--serious:not(.sev-chip--on)      { color: var(--sev-serious);      border-color: var(--sev-serious); }
.filter-row .sev-chip--very-serious:not(.sev-chip--on) { color: var(--sev-very-serious); border-color: var(--sev-very-serious); }
.filter-row .sev-chip--most-serious:not(.sev-chip--on) { color: var(--sev-most-serious); border-color: var(--sev-most-serious); }
.filter-row .sev-chip--uncertain:not(.sev-chip--on)    { color: var(--sev-uncertain);    border-color: var(--sev-uncertain); }
.filter-row .sev-chip--uncategorized:not(.sev-chip--on) { color: var(--sev-uncategorized); border-color: var(--sev-uncategorized); }
.filter-row .sev-chip--on              { color: #fff; border-color: transparent; }
.filter-row .sev-chip--minor.sev-chip--on        { background: #c98a00; color: #1a1a1a; }
.filter-row .sev-chip--serious.sev-chip--on      { background: #e65100; }
.filter-row .sev-chip--very-serious.sev-chip--on { background: #d32f2f; }
.filter-row .sev-chip--most-serious.sev-chip--on { background: #7f0000; }
.filter-row .sev-chip--uncertain.sev-chip--on    { background: #546e7a; }
.filter-row .sev-chip--uncategorized.sev-chip--on { background: #5c6bc0; }

.filter-row .chip-count {
  margin-left: 4px;
  padding: 0 3px;
  font-size: 10px;
  font-weight: 700;
  opacity: 0.9;
}

.summary-matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.summary-matrix th,
.summary-matrix td {
  padding: 2px 6px;
  text-align: center;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
}

.summary-matrix th {
  font-weight: 600;
  opacity: 0.85;
}

.summary-matrix tbody tr:hover {
  background: rgba(128, 128, 128, 0.12);
}

.summary-matrix th.sev-head {
  cursor: help;
}

.summary-matrix .sev-code-col {
  width: 1%;
  white-space: nowrap;
  padding-right: 10px;
}

.summary-matrix .sev-unc-col {
  border-left: 1px solid rgba(128, 128, 128, 0.25);
}

.summary-matrix td.text-left,
.summary-matrix th.text-left {
  text-align: left;
}

.detail-list {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.detail-row:last-child {
  border-bottom: none;
}

.clickable-row {
  cursor: pointer;
}
.help-icon,
.help-code {
  cursor: help;
}

.clickable-row:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
