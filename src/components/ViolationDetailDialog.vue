<template>
  <q-dialog v-model="show">
    <q-card v-if="v" class="violation-detail-card">
      <q-card-section class="row items-center q-pb-sm">
        <q-icon :name="v.icon || 'mdi-shield-alert'" size="sm" :class="sevClass" class="q-mr-sm" />
        <div class="col">
          <div class="text-subtitle1">
            <span v-if="v.code" class="vd-dim q-mr-xs">{{ v.code }}</span>{{ $t(typeName) }}
          </div>
          <div class="text-caption vd-dim">{{ periodText }}</div>
        </div>
        <q-badge :class="sevClass" class="sev-badge q-mr-sm">{{ $t(sevLabel) }}</q-badge>
        <q-btn flat round dense icon="mdi-close" @click="show = false" />
      </q-card-section>

      <q-separator />

      <q-card-section class="q-py-sm">
        <div v-if="description" class="text-caption q-mb-sm vd-desc">{{ $t(description) }}</div>
        <div class="text-body2"><q-icon name="mdi-alert-circle-outline" size="xs" :class="sevClass" class="q-mr-xs" />{{ caseText }}</div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-py-md">
        <div class="text-caption vd-dim q-mb-sm">{{ $t('Timeline') }}</div>
        <ViolationTimeline
          :records="dddStore.activityRecords"
          :from-ts="win.fromTs" :to-ts="win.toTs"
          :hl-from="win.hlFrom" :hl-to="win.hlTo"
          @day-click="openDay"
        />
      </q-card-section>

      <q-separator />

      <q-card-actions align="right">
        <q-btn flat dense no-caps icon="mdi-calendar-text" :label="$t('Open full day')" @click="openDay(dayTs)" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDddStore } from 'src/stores/ddd'
import { useViolationDialog } from 'src/composables/violationDialog'
import { explainKey } from 'src/compliance'
import { formatDayParts } from 'src/utils/format'
import ViolationTimeline from './ViolationTimeline.vue'

const DAY = 86400
const TYPE_NAME = {
  'continuous-driving': 'Continuous driving',
  'daily-driving': 'Daily driving',
  'weekly-driving': 'Weekly driving',
  'biweekly-driving': 'Two-week driving',
  'daily-rest': 'Daily rest',
  'daily-rest-reduced': 'Daily rest',
  'weekly-rest-interval': 'Weekly rest interval',
  'weekly-rest-pair': 'Weekly rest',
  'weekly-rest-compensation': 'Weekly rest compensation',
}
const SEV = {
  'most-serious': { label: 'Most serious', cls: 'sev-most-serious' },
  'very-serious': { label: 'Very serious', cls: 'sev-very-serious' },
  serious: { label: 'Serious', cls: 'sev-serious' },
  minor: { label: 'Minor', cls: 'sev-minor' },
  uncategorized: { label: 'Not graded', cls: 'sev-uncategorized' },
  uncertain: { label: 'Uncertain', cls: 'sev-uncertain' },
}

// Display window + highlight span for each violation type (absolute unix seconds).
function windowFor(v) {
  const t = v.type
  const dayTs = v.dayTs != null ? v.dayTs : (v.ts ? v.ts - (v.ts % DAY) : 0)
  if (t === 'continuous-driving' && v.startMin != null) {
    return { fromTs: dayTs, toTs: dayTs, hlFrom: dayTs + v.startMin * 60, hlTo: dayTs + v.endMin * 60 }
  }
  if (t === 'daily-driving') return { fromTs: dayTs, toTs: dayTs, hlFrom: dayTs, hlTo: dayTs + DAY }
  if (t === 'daily-rest' || t === 'daily-rest-reduced') return { fromTs: dayTs - DAY, toTs: dayTs + DAY, hlFrom: dayTs, hlTo: dayTs + DAY }
  if (t === 'weekly-rest-interval') return { fromTs: dayTs, toTs: dayTs + (v.minutes || 0) * 60, hlFrom: dayTs, hlTo: dayTs + (v.minutes || 0) * 60 }
  if (t === 'weekly-rest-compensation') return { fromTs: dayTs, toTs: dayTs + 21 * DAY, hlFrom: dayTs, hlTo: dayTs + 21 * DAY }
  if (t === 'weekly-rest-pair') return { fromTs: dayTs - 7 * DAY, toTs: dayTs + DAY, hlFrom: dayTs - 7 * DAY, hlTo: dayTs + DAY }
  if (t === 'weekly-driving' || t === 'biweekly-driving') {
    const weeks = t === 'biweekly-driving' ? 2 : 1
    const start = v.weekStart || dayTs
    return { fromTs: start, toTs: start + (weeks * 7 - 1) * DAY, hlFrom: start, hlTo: start + weeks * 7 * DAY }
  }
  return { fromTs: dayTs, toTs: dayTs, hlFrom: v.ts || dayTs, hlTo: (v.ts || dayTs) + 600 }
}

const fmtDate = (ts) => formatDayParts(ts, { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtClock = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export default defineComponent({
  name: 'ViolationDetailDialog',
  components: { ViolationTimeline },
  emits: ['open-day'],
  setup(props, { emit }) {
    const { t } = useI18n()
    const dddStore = useDddStore()
    const { activeViolation, closeViolation } = useViolationDialog()

    const v = computed(() => activeViolation.value)
    const show = computed({ get: () => !!activeViolation.value, set: (val) => { if (!val) closeViolation() } })
    const win = computed(() => (v.value ? windowFor(v.value) : { fromTs: 0, toTs: 0, hlFrom: null, hlTo: null }))
    const dayTs = computed(() => (v.value?.dayTs != null ? v.value.dayTs : win.value.fromTs))

    const typeName = computed(() => TYPE_NAME[v.value?.type] || v.value?.code || '')
    const sevLabel = computed(() => (SEV[v.value?.severity]?.label) || 'Minor')
    const sevClass = computed(() => (SEV[v.value?.severity]?.cls) || 'sev-minor')
    const description = computed(() => explainKey(v.value?.code))
    const caseText = computed(() => (v.value?.message ? t(v.value.message, v.value.messageParams || {}) : ''))

    const periodText = computed(() => {
      if (!v.value) return ''
      const w = win.value
      if (w.fromTs === w.toTs) {
        // single day - show date + highlighted clock span if any
        const span = (w.hlFrom != null && w.hlTo != null && w.hlTo - w.hlFrom < DAY)
          ? ` · ${fmtClock((w.hlFrom - w.fromTs) / 60)}–${fmtClock((w.hlTo - w.fromTs) / 60)}`
          : ''
        return `${fmtDate(w.fromTs)}${span}`
      }
      return `${fmtDate(w.fromTs)} – ${fmtDate(w.toTs)}`
    })

    function openDay(ts) {
      closeViolation()
      emit('open-day', ts)
    }

    return { dddStore, v, show, win, dayTs, typeName, sevLabel, sevClass, description, caseText, periodText, openDay }
  },
})
</script>

<style scoped>
.violation-detail-card {
  width: 560px;
  max-width: 92vw;
}
.sev-badge {
  background: transparent;
  border: 1px solid currentColor;
  font-weight: 600;
}
/* Theme-aware muted text (readable on both light and dark, unlike fixed grey). */
.vd-dim {
  opacity: 0.68;
}
.vd-desc {
  opacity: 0.92;
}
</style>
