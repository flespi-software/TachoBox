<template>
  <div class="activity-calendar">
    <div class="calendar-legend">
      <span
        v-for="item in legend"
        :key="item.label"
        class="legend-item"
        :class="{ 'legend-hidden': hidden.has(item.activity) }"
        @click="toggleActivity(item.activity)"
      >
        <span class="legend-color" :class="item.cls" />
        <q-icon :name="item.icon" size="xs" />
        {{ item.label }}
      </span>
    </div>

    <div ref="scrollRef" class="calendar-scroll">
      <div v-for="yearGroup in years" :key="yearGroup.year" class="calendar-year">
      <div class="year-title text-subtitle1 text-bold q-mb-xs">{{ yearGroup.year }}</div>
      <div class="calendar-months">
        <div v-for="month in yearGroup.months" :key="month.key" :data-month="month.key" class="calendar-month">
          <div class="month-title text-caption text-bold">{{ month.label }}</div>
          <div class="month-weekdays">
            <span v-for="d in weekdays" :key="d" class="weekday-label text-caption text-grey">{{ d }}</span>
          </div>
          <div class="month-grid">
            <div
              v-for="(cell, i) in month.cells"
              :key="i"
              :class="['day-cell', { 'has-data': cell.hasData, 'empty': !cell.day }]"
              @click="cell.hasData && $emit('day-click', cell.ts)"
            >
              <template v-if="cell.day">
                <span class="day-number text-caption">{{ cell.day }}</span>
                <div v-if="cell.hasData" class="day-bar" :style="{ backgroundImage: dayGradient(cell.segments) }" />
                <q-tooltip v-if="cell.hasData" :offset="[0, 4]">
                  <div class="text-caption">
                    <div v-if="cell.totals.DRIVING"><q-icon name="mdi-steering" size="xs" class="text-deep-orange-4" /> {{ fmt(cell.totals.DRIVING) }}</div>
                    <div v-if="cell.totals.WORK"><q-icon name="mdi-hammer-wrench" size="xs" class="text-light-blue-5" /> {{ fmt(cell.totals.WORK) }}</div>
                    <div v-if="cell.totals.AVAILABILITY"><q-icon name="mdi-clock-outline" size="xs" class="text-amber-5" /> {{ fmt(cell.totals.AVAILABILITY) }}</div>
                    <div v-if="cell.totals['BREAK/REST']"><q-icon name="mdi-sleep" size="xs" class="text-grey-5" /> {{ fmt(cell.totals['BREAK/REST']) }}</div>
                  </div>
                </q-tooltip>
              </template>
            </div>
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
import { formatDuration, buildDaySegments, ACTIVITY_CLS } from 'src/utils/activity'
import { formatDayParts } from 'src/utils/format'

function buildCalendarData(rawChanges, isLastDay) {
  const { segments, totals } = buildDaySegments(rawChanges, { isLastDay })
  const calSegments = segments.map((s) => ({
    activity: s.activity,
    startPct: s.startPct,
    widthPct: s.widthPct,
  }))
  return { segments: calSegments, totals }
}

export default defineComponent({
  name: 'ActivityCalendar',
  props: {
    records: { type: Array, required: true },
  },
  emits: ['day-click'],
  setup(props, { expose }) {
    const { t } = useI18n()
    const scrollRef = ref(null)
    const hidden = ref(new Set())

    const weekdays = computed(() => [t('Mo'), t('Tu'), t('We'), t('Th'), t('Fr'), t('Sa'), t('Su')])

    const legend = computed(() => [
      { label: t('Driving'), activity: 'DRIVING', cls: ACTIVITY_CLS.DRIVING, icon: 'mdi-steering' },
      { label: t('Work'), activity: 'WORK', cls: ACTIVITY_CLS.WORK, icon: 'mdi-hammer-wrench' },
      { label: t('Availability'), activity: 'AVAILABILITY', cls: ACTIVITY_CLS.AVAILABILITY, icon: 'mdi-clock-outline' },
      { label: t('Break/Rest'), activity: 'BREAK/REST', cls: ACTIVITY_CLS['BREAK/REST'], icon: 'mdi-sleep' },
    ])

    function toggleActivity(activity) {
      const s = new Set(hidden.value)
      if (s.has(activity)) s.delete(activity)
      else s.add(activity)
      hidden.value = s
    }

    // Day timeline painted as one CSS gradient instead of one div per segment
    // (mirrors ActivityTable). Hidden activities become a transparent stop, so
    // segment positions stay put - toggling the legend leaves a gap rather than
    // collapsing the bar. Reads hidden.value so the :style binding re-evaluates.
    const ACT_VAR = {
      DRIVING: 'var(--act-driving)', WORK: 'var(--act-work)',
      AVAILABILITY: 'var(--act-availability)', 'BREAK/REST': 'var(--act-rest)',
    }
    function dayGradient(segments) {
      const parts = []
      for (const s of segments) {
        const col = hidden.value.has(s.activity) ? 'transparent' : (ACT_VAR[s.activity] || 'var(--act-rest)')
        parts.push(`${col} ${s.startPct.toFixed(3)}% ${(s.startPct + s.widthPct).toFixed(3)}%`)
      }
      return parts.length ? `linear-gradient(90deg, ${parts.join(', ')})` : 'none'
    }

    function scrollToDate(ts) {
      const d = new Date(ts * 1000)
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`
      const el = scrollRef.value?.querySelector(`[data-month="${key}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    expose({ scrollToDate })

    const dayMap = computed(() => {
      const map = {}
      const validRecords = props.records.filter((r) => r.activityChangeInfo?.length)
      const maxTs = validRecords.reduce((max, r) => Math.max(max, r.activityRecordDate), 0)
      for (const r of validRecords) {
        const isLastDay = r.activityRecordDate === maxTs
        map[r.activityRecordDate] = buildCalendarData(r.activityChangeInfo, isLastDay)
      }
      return map
    })

    const years = computed(() => {
      const timestamps = Object.keys(dayMap.value).map(Number)
      if (!timestamps.length) return []

      const minTs = Math.min(...timestamps)
      const maxTs = Math.max(...timestamps)
      const startDate = new Date(minTs * 1000)
      const endDate = new Date(maxTs * 1000)

      const yearGroups = []
      let currentYearMonths = []
      let currentYear = startDate.getUTCFullYear()

      let year = startDate.getUTCFullYear()
      let month = startDate.getUTCMonth()
      const endYear = endDate.getUTCFullYear()
      const endMonth = endDate.getUTCMonth()

      while (year < endYear || (year === endYear && month <= endMonth)) {
        if (year !== currentYear) {
          yearGroups.push({ year: currentYear, months: currentYearMonths })
          currentYearMonths = []
          currentYear = year
        }

        const firstDay = new Date(Date.UTC(year, month, 1))
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
        let startWeekday = firstDay.getUTCDay()
        startWeekday = startWeekday === 0 ? 6 : startWeekday - 1

        const cells = []
        for (let i = 0; i < startWeekday; i++) {
          cells.push({ day: null, hasData: false })
        }

        for (let d = 1; d <= daysInMonth; d++) {
          const ts = Date.UTC(year, month, d) / 1000
          const dayData = dayMap.value[ts]
          cells.push({
            day: d,
            ts,
            hasData: !!dayData,
            segments: dayData?.segments || [],
            totals: dayData?.totals || null,
          })
        }

        const hasAnyData = cells.some((c) => c.hasData)
        if (hasAnyData) {
          const label = formatDayParts(firstDay.getTime() / 1000, { month: 'short' })
          currentYearMonths.push({ key: `${year}-${month}`, label, cells })
        }

        month++
        if (month > 11) {
          month = 0
          year++
        }
      }

      if (currentYearMonths.length) {
        yearGroups.push({ year: currentYear, months: currentYearMonths })
      }

      return yearGroups.filter((yg) => yg.months.length)
    })

    return { scrollRef, hidden, toggleActivity, dayGradient, years, weekdays, legend, fmt: formatDuration }
  },
})
</script>

<style scoped>
.activity-calendar {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.calendar-legend {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.calendar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.legend-item.legend-hidden {
  opacity: 0.35;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  display: inline-block;
}

.calendar-year {
  margin-bottom: 20px;
}

.calendar-months {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.calendar-month {
  width: 100%;
}

@media (max-width: 767px) {
  .day-bar {
    position: absolute;
    bottom: 2px;
    width: 90%;
  }
}

.month-title {
  margin-bottom: 4px;
}

.month-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 2px;
}

.weekday-label {
  text-align: center;
  font-size: 10px;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.day-cell {
  aspect-ratio: 1;
  border-radius: 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  position: relative;
  overflow: hidden;
}

.day-cell.empty {
  background: transparent;
}

.day-cell.has-data {
  cursor: pointer;
}

.day-cell.has-data:hover {
  outline: 1px solid rgba(255, 255, 255, 0.3);
}

.day-number {
  font-size: 10px;
  line-height: 1;
  margin-bottom: 1px;
}

.day-bar {
  width: 80%;
  height: 4px;
  border-radius: 1px;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
</style>
