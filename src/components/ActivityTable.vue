<template>
  <q-table
    ref="tableRef"
    :rows="rows"
    :columns="columns"
    row-key="date"
    :virtual-scroll="!printMode"
    :virtual-scroll-item-size="35"
    :rows-per-page-options="[0]"
    flat
    bordered
    dense
    class="sticky-header-table activity-table"
    :style="tableStyle"
    @virtual-scroll="onVirtualScroll"
  >
    <template #body="props">
      <q-tr :props="props" :class="{ 'highlight-row': props.row.date === highlightDate }" @click="$emit('day-click', props.row.date)" style="cursor: pointer">
        <q-td v-for="col in props.cols" :key="col.name" :props="props">
          <template v-if="col.name === 'timeline'">
            <ActivityBar
              class="activity-timeline"
              :segments="props.row.segments"
              :hidden-activities="hiddenActivities"
              :markers="timelineMarkers(props.row.date)"
              min-width="180px"
            />
          </template>
          <template v-else-if="col.name === 'distance'">
            <div v-if="props.row.distPct" class="dist-cell">
              <div class="dist-bar-bg">
                <div class="dist-bar" :style="{ width: props.row.distPct + '%' }" />
              </div>
              <span class="dist-value">{{ col.value }}</span>
            </div>
          </template>
          <template v-else-if="col.name === 'date'">{{ col.value }}</template>
          <template v-else-if="col.name === 'violations'">
            <span
              v-if="dayAlerts.has(props.row.date) && dayAlerts.get(props.row.date).violations.length"
              :class="'text-' + violationColor(dayAlerts.get(props.row.date).violations)"
            >
              <q-icon name="mdi-shield-alert" size="14px" />
              <q-tooltip>
                <div v-for="(v, vi) in dayAlerts.get(props.row.date).violations" :key="vi" class="tooltip-row">
                  <q-icon :name="v.icon || 'mdi-alert'" size="xs" :class="v.uncertain ? 'text-grey-4' : (v.severity === 'very-serious' || v.severity === 'serious' ? 'text-red' : 'text-amber')" />
                  <span>{{ $t(v.message, v.messageParams || {}) }}</span>
                </div>
              </q-tooltip>
            </span>
          </template>
          <template v-else-if="col.name === 'anomalies'">
            <span
              v-if="dayAlerts.has(props.row.date) && dayAlerts.get(props.row.date).anomalies.length"
              :class="'text-' + anomalyColor(dayAlerts.get(props.row.date).anomalies)"
            >
              <q-icon name="mdi-magnify-scan" size="14px" />
              <q-tooltip>
                <div v-for="(a, ai) in dayAlerts.get(props.row.date).anomalies" :key="ai" class="tooltip-row">
                  <q-icon :name="a.icon" size="xs" :class="a.severity === 'critical' ? 'text-red' : (a.severity === 'warning' ? 'text-orange' : 'text-grey-4')" />
                  <span>{{ $t(a.message, a.messageParams || {}) }}</span>
                </div>
              </q-tooltip>
            </span>
          </template>
          <template v-else-if="col.name === 'dayevents'">
            <template v-if="dayEvents.has(props.row.date)">
              <span
                v-for="(ev, ei) in dayEvents.get(props.row.date)"
                :key="ei"
                @mouseenter="setMarker(props.row.date, ev)"
                @mouseleave="clearMarker()"
              >
                <q-icon
                  :name="ev.icon"
                  :color="ev.color"
                  size="14px"
                  class="q-mr-xs event-icon"
                />
                <q-tooltip>{{ ev.label }} — {{ formatMin(ev.minute) }}</q-tooltip>
              </span>
            </template>
          </template>
          <template v-else>{{ col.value }}</template>
        </q-td>
      </q-tr>
    </template>
  </q-table>
</template>

<script>
import { defineComponent, computed, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDuration, buildDaySegments } from 'src/utils/activity'
import ActivityBar from 'src/components/ActivityBar.vue'
import { formatDate } from 'src/utils/format'

export default defineComponent({
  name: 'ActivityTable',
  components: { ActivityBar },
  inject: { printMode: { default: () => ref(false) } },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
    hiddenActivities: { type: Set, default: () => new Set() },
    dayAlerts: { type: Map, default: () => new Map() },
    dayEvents: { type: Map, default: () => new Map() },
  },
  emits: ['visible-date', 'day-click'],
  setup(props, { expose, emit }) {
    const { t } = useI18n()
    const tableRef = ref(null)
    const highlightDate = ref(null)
    const columns = computed(() => [
      { name: 'date', label: t('Date'), field: 'dateStr', align: 'left', style: 'width: 100px' },
      { name: 'violations', label: '', field: 'date', align: 'center', style: 'width: 24px; padding: 0 4px' },
      { name: 'anomalies', label: '', field: 'date', align: 'center', style: 'width: 24px; padding: 0 4px' },
      { name: 'dayevents', label: '', field: 'date', align: 'left', style: 'width: 60px; padding: 0 4px' },
      { name: 'timeline', label: t('Timeline'), field: 'date', align: 'left', style: 'min-width: 200px' },
      { name: 'driving', label: t('Driving'), field: 'drivingStr', align: 'center', style: 'width: 90px' },
      { name: 'work', label: t('Work'), field: 'workStr', align: 'center', style: 'width: 90px' },
      { name: 'availability', label: t('Availability'), field: 'availabilityStr', align: 'center', style: 'width: 100px' },
      { name: 'rest', label: t('Break/Rest'), field: 'restStr', align: 'center', style: 'width: 90px' },
      { name: 'distance', label: t('Distance (km)'), field: 'distance', align: 'center', style: 'width: 110px' },
    ])

    const rows = computed(() => {
      const filtered = props.records
        .filter((r) => r.activityChangeInfo && r.activityChangeInfo.length > 0)
        .sort((a, b) => a.activityRecordDate - b.activityRecordDate)

      const maxDist = Math.max(...filtered.map((r) => r.activityDayDistance || 0), 1)

      return filtered.map((record, idx) => {
          const dateStr = formatDate(record.activityRecordDate)

          const isLastDay = idx === filtered.length - 1
          const { segments, totals } = buildDaySegments(record.activityChangeInfo, { isLastDay })
          const dist = record.activityDayDistance || 0

          return {
            date: record.activityRecordDate,
            dateStr,
            drivingStr: totals.DRIVING ? formatDuration(totals.DRIVING) : '',
            workStr: totals.WORK ? formatDuration(totals.WORK) : '',
            availabilityStr: totals.AVAILABILITY ? formatDuration(totals.AVAILABILITY) : '',
            restStr: totals['BREAK/REST'] ? formatDuration(totals['BREAK/REST']) : '',
            distance: dist || '',
            distPct: dist ? (dist / maxDist) * 100 : 0,
            segments,
          }
        })
    })


    async function scrollToDate(ts) {
      const idx = rows.value.findIndex((r) => r.date === ts)
      if (idx >= 0 && tableRef.value) {
        tableRef.value.scrollTo(idx, 'center')
        highlightDate.value = ts
        await nextTick()
        const el = tableRef.value.$el.querySelector('.highlight-row')
        if (el) {
          el.getAnimations().forEach((a) => a.cancel())
          el.animate(
            [
              { background: 'rgba(25, 118, 210, 0.35)' },
              { background: 'transparent' },
            ],
            { duration: 2000, easing: 'ease-out' },
          )
        }
      }
    }

    function onVirtualScroll({ index }) {
      const row = rows.value[index]
      if (row) emit('visible-date', row.date)
    }

    expose({ scrollToDate })

    const activeMarker = ref(null)

    function setMarker(date, ev) {
      activeMarker.value = { date, minute: ev.minute, color: ev.color }
    }
    function clearMarker() {
      activeMarker.value = null
    }

    // Per-segment hover info without per-segment DOM: find the segment under the
    // cursor and set the container's native title imperatively.
    function timelineMarkers(date) {
      const m = activeMarker.value
      if (!m || m.date !== date) return []
      const pct = (m.minute / 1440) * 100
      return [{ pct }]
    }

    function formatMin(min) {
      if (min == null) return ''
      const h = Math.floor(min / 60)
      const m = min % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }

    function violationColor(violations) {
      if (violations.every((v) => v.uncertain)) return 'blue-grey'
      if (violations.some((v) => v.severity === 'very-serious' || v.severity === 'serious')) return 'red'
      return 'amber'
    }

    function anomalyColor(anomalies) {
      if (anomalies.some((a) => a.severity === 'critical')) return 'red'
      if (anomalies.some((a) => a.severity === 'warning')) return 'orange'
      return 'blue-grey'
    }

    return { tableRef, columns, rows, highlightDate, onVirtualScroll, violationColor, anomalyColor, setMarker, clearMarker, timelineMarkers, formatMin }
  },
})
</script>

<style scoped>
.activity-timeline {
  height: 18px;
}
.event-icon {
  cursor: pointer;
}

.dist-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dist-bar-bg {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  min-width: 40px;
}

.dist-bar {
  height: 100%;
  background: #26a641;
  border-radius: 3px;
}

.dist-value {
  font-size: 11px;
  min-width: 30px;
  text-align: right;
}

.tooltip-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
}
</style>

<style>
.body--light .activity-timeline { background: rgba(0, 0, 0, 0.06); }
.body--light .dist-bar { background: #4caf50; }
</style>
