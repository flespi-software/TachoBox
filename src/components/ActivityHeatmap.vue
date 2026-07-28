<template>
  <div class="activity-heatmap">
    <div class="heatmap-header">
      <q-btn-toggle
        v-model="metric"
        flat
        dense
        no-caps
        toggle-color="primary"
        size="sm"
        :options="metricOptions"
      />
      <div class="heatmap-legend q-ml-auto">
        <span class="text-caption text-grey q-mr-xs">{{ $t('Less') }}</span>
        <span class="legend-cell level-0" />
        <span class="legend-cell level-1" />
        <span class="legend-cell level-2" />
        <span class="legend-cell level-3" />
        <span class="legend-cell level-4" />
        <span class="text-caption text-grey q-ml-xs">{{ $t('More') }}</span>
      </div>
    </div>

    <div ref="scrollRef" class="heatmap-scroll">
      <div v-for="yearGroup in years" :key="yearGroup.year" class="heatmap-year">
        <div class="year-title text-caption text-bold q-mb-xs">{{ yearGroup.year }}</div>
        <div class="heatmap-grid-wrapper">
          <div class="heatmap-grid" :style="{ gridTemplateColumns: `20px repeat(${yearGroup.weekCount}, 12px)` }">
            <!-- Day labels in first column -->
            <span class="day-label text-caption text-grey" style="grid-row: 2; grid-column: 1">{{ $t('Mo') }}</span>
            <span class="day-label text-caption text-grey" style="grid-row: 4; grid-column: 1">{{ $t('We') }}</span>
            <span class="day-label text-caption text-grey" style="grid-row: 6; grid-column: 1">{{ $t('Fr') }}</span>

            <!-- Month labels in row 1 -->
            <span
              v-for="ml in yearGroup.monthLabels"
              :key="ml.label + ml.col"
              class="month-label text-caption text-grey"
              :style="{ gridRow: 1, gridColumn: ml.col + 2 }"
            >{{ ml.label }}</span>

            <!-- Cells in rows 2-8, columns 2+ -->
            <div
              v-for="(cell, i) in yearGroup.cells"
              :key="i"
              :class="['heatmap-cell', `level-${cell.level}`, { 'has-data': cell.value > 0, 'empty': !cell.inRange, 'month-start': cell.isFirstOfMonth && cell.inRange }]"
              :style="{ gridRow: cell.weekday + 2, gridColumn: cell.weekCol + 2 }"
              @click="cell.value > 0 && $emit('day-click', cell.ts)"
            >
              <q-tooltip v-if="cell.inRange" :offset="[0, 4]">
                <div class="text-caption">
                  <div>{{ cell.dateStr }}</div>
                  <div v-if="cell.value > 0">{{ cell.valueStr }}</div>
                  <div v-else class="text-grey">{{ $t('No activity') }}</div>
                </div>
              </q-tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildDaySegments, formatDuration } from 'src/utils/activity'
import { formatDayParts } from 'src/utils/format'

export default defineComponent({
  name: 'ActivityHeatmap',
  props: {
    records: { type: Array, required: true },
  },
  emits: ['day-click'],
  setup(props) {
    const { t } = useI18n()
    const metric = ref('DRIVING')
    const scrollRef = ref(null)

    const metricOptions = computed(() => [
      { label: t('Driving'), value: 'DRIVING' },
      { label: t('Work'), value: 'WORK' },
      { label: t('All'), value: 'ALL' },
    ])

    const dayMap = computed(() => {
      const map = {}
      const validRecords = props.records.filter((r) => r.activityChangeInfo?.length)
      const maxTs = validRecords.reduce((max, r) => Math.max(max, r.activityRecordDate), 0)
      for (const r of validRecords) {
        const isLastDay = r.activityRecordDate === maxTs
        const { totals } = buildDaySegments(r.activityChangeInfo, { isLastDay })
        map[r.activityRecordDate] = totals
      }
      return map
    })

    function getValue(totals) {
      if (!totals) return 0
      if (metric.value === 'ALL') {
        return (totals.DRIVING || 0) + (totals.WORK || 0) + (totals.AVAILABILITY || 0)
      }
      return totals[metric.value] || 0
    }

    const years = computed(() => {
      const timestamps = Object.keys(dayMap.value).map(Number)
      if (!timestamps.length) return []

      const minTs = Math.min(...timestamps)
      const maxTs = Math.max(...timestamps)
      const startDate = new Date(minTs * 1000)
      const endDate = new Date(maxTs * 1000)
      const startYear = startDate.getUTCFullYear()
      const endYear = endDate.getUTCFullYear()

      const allValues = Object.values(dayMap.value).map((t) => getValue(t)).filter((v) => v > 0)
      allValues.sort((a, b) => a - b)
      const p25 = allValues[Math.floor(allValues.length * 0.25)] || 1
      const p50 = allValues[Math.floor(allValues.length * 0.5)] || 1
      const p75 = allValues[Math.floor(allValues.length * 0.75)] || 1

      const yearGroups = []

      for (let y = startYear; y <= endYear; y++) {
        const yearStart = y === startYear ? new Date(minTs * 1000) : new Date(Date.UTC(y, 0, 1))
        const yearEnd = y === endYear ? new Date(maxTs * 1000) : new Date(Date.UTC(y, 11, 31))

        // Align to Monday
        let dow = yearStart.getUTCDay()
        dow = dow === 0 ? 6 : dow - 1
        const alignedStart = new Date(yearStart.getTime() - dow * 86400000)

        const cells = []
        const monthLabels = []
        const seenMonths = new Set()
        let weekCol = 0
        let prevWeekday = -1

        const cursor = new Date(alignedStart.getTime())
        while (cursor <= yearEnd) {
          let weekday = cursor.getUTCDay()
          weekday = weekday === 0 ? 6 : weekday - 1

          if (weekday <= prevWeekday) weekCol++
          prevWeekday = weekday

          const ts = Math.floor(cursor.getTime() / 1000)
          const inRange = cursor >= yearStart && cursor <= yearEnd
          const totals = dayMap.value[ts]
          const value = inRange ? getValue(totals) : 0

          const monthKey = `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}`
          if (!seenMonths.has(monthKey) && inRange) {
            seenMonths.add(monthKey)
            const label = formatDayParts(cursor.getTime() / 1000, { month: 'short' })
            monthLabels.push({ label, col: weekCol })
          }

          const dateStr = formatDayParts(cursor.getTime() / 1000, { day: '2-digit', month: '2-digit', year: 'numeric' })
          const isFirstOfMonth = cursor.getUTCDate() === 1

          cells.push({
            ts,
            weekday,
            weekCol,
            inRange,
            value,
            valueStr: value > 0 ? formatDuration(value) : '',
            dateStr,
            isFirstOfMonth,
            level: !inRange || value <= 0 ? 0 : value <= p25 ? 1 : value <= p50 ? 2 : value <= p75 ? 3 : 4,
          })

          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }

        // Filter out labels that are too close to the next one
        const filteredLabels = monthLabels.filter((ml, idx) => {
          if (idx < monthLabels.length - 1) {
            return monthLabels[idx + 1].col - ml.col >= 3
          }
          return true
        })

        yearGroups.push({
          year: y,
          cells,
          weekCount: weekCol + 1,
          monthLabels: filteredLabels,
        })
      }

      return yearGroups
    })

    return { metric, metricOptions, scrollRef, years }
  },
})
</script>

<style scoped>
.activity-heatmap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.heatmap-header {
  padding: 8px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
}

.body--light .heatmap-header {
  border-bottom-color: rgba(0, 0, 0, 0.1);
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 3px;
}

.legend-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  display: inline-block;
}

.heatmap-scroll {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.heatmap-year {
  margin-bottom: 16px;
}

.heatmap-grid {
  display: grid;
  grid-template-rows: 14px repeat(7, 12px);
  gap: 2px;
}

.day-label {
  font-size: 9px;
  line-height: 12px;
  align-self: center;
}

.month-label {
  font-size: 9px;
  line-height: 14px;
  white-space: nowrap;
}

.heatmap-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  cursor: default;
}

.heatmap-cell.has-data {
  cursor: pointer;
}

.heatmap-cell.month-start {
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  border-left: 1px solid rgba(255, 255, 255, 0.15);
}

.body--light .heatmap-cell.month-start {
  border-top-color: rgba(0, 0, 0, 0.15);
  border-left-color: rgba(0, 0, 0, 0.15);
}

.heatmap-cell.empty {
  background: transparent !important;
}

.level-0 {
  background: rgba(255, 255, 255, 0.05);
}
.body--light .level-0 {
  background: rgba(0, 0, 0, 0.08);
}
.level-1 {
  background: #0e4429;
}
.body--light .level-1 {
  background: #9be9a8;
}
.level-2 {
  background: #006d32;
}
.body--light .level-2 {
  background: #40c463;
}
.level-3 {
  background: #26a641;
}
.body--light .level-3 {
  background: #30a14e;
}
.level-4 {
  background: #39d353;
}
.body--light .level-4 {
  background: #216e39;
}
</style>
