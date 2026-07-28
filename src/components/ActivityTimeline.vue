<template>
  <div class="activity-timeline-view">
    <div class="timeline-body">
      <div class="time-axis">
        <div class="time-labels">
          <div v-for="h in 25" :key="h" class="time-label text-caption text-grey">
            {{ String(24 - (h - 1)).padStart(2, '0') }}
          </div>
        </div>
        <div class="time-axis-header" />
        <div class="time-axis-dist">
          <span v-for="dl in distLabels" :key="dl.value" class="dist-label text-caption text-grey" :style="{ top: dl.pct + '%' }">{{ dl.value }}</span>
        </div>
      </div>

      <div ref="scrollRef" class="timeline-scroll" @wheel="onWheel">
        <div class="timeline-columns">
          <template v-for="day in days" :key="day.ts">
          <div v-if="day.isMonthStart" class="month-separator">
            <div class="month-separator-label text-caption text-bold">{{ day.monthLabel }}</div>
          </div>
          <div
            class="timeline-day"
            @click="$emit('day-click', day.ts)"
          >
            <div class="day-column" @mousemove="onSegHover($event, day)" @mouseleave="$event.currentTarget.title = ''">
              <div class="day-fill" :style="{ background: dayGradient(day) }" />
              <div
                v-for="(seg, i) in cardOutSegs(day)"
                :key="'co' + i"
                class="day-card-out"
                :style="{ bottom: seg.topPct + '%', height: seg.heightPct + '%' }"
              />
            </div>
            <div class="day-header text-caption" :class="{ 'text-bold': day.isMonthStart }">
              {{ day.label }}
            </div>
            <div class="day-dist-area">
              <div v-if="day.distance" class="day-distance-bar" :style="{ height: day.distPct + '%' }">
                <q-tooltip>{{ day.distance }} km</q-tooltip>
              </div>
            </div>
          </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildDaySegments } from 'src/utils/activity'
import { formatDayParts } from 'src/utils/format'

// Activity colour CSS variables (theme-aware, defined in app.scss)
const ACT_VAR = {
  DRIVING: 'var(--act-driving)', WORK: 'var(--act-work)',
  AVAILABILITY: 'var(--act-availability)', 'BREAK/REST': 'var(--act-rest)',
}

function buildTimelineSegments(rawChanges, isLastDay) {
  const { segments } = buildDaySegments(rawChanges, { isLastDay })
  return segments.map((s) => ({
    cls: s.cls,
    activity: s.activity,
    cardOut: s.cardOut,
    topPct: s.startPct,
    heightPct: s.widthPct,
    startLabel: s.startLabel,
    endLabel: s.endLabel,
    ongoing: s.ongoing,
    bgStyle: s.bgStyle,
  }))
}

export default defineComponent({
  name: 'ActivityTimeline',
  props: {
    records: { type: Array, required: true },
    hiddenActivities: { type: Set, default: () => new Set() },
  },
  emits: ['day-click'],
  setup(props, { expose }) {
    const { t } = useI18n()
    const scrollRef = ref(null)

    // Whole-day column painted as one vertical CSS gradient (bottom = 00:00),
    // instead of one div per segment - much lighter to render/scroll.
    function dayGradient(day) {
      const parts = []
      for (const s of day.segments) {
        const col = props.hiddenActivities.has(s.activity) ? 'transparent' : (ACT_VAR[s.activity] || 'var(--act-rest)')
        parts.push(`${col} ${s.topPct.toFixed(3)}% ${(s.topPct + s.heightPct).toFixed(3)}%`)
      }
      return parts.length ? `linear-gradient(to top, ${parts.join(', ')})` : 'transparent'
    }
    function cardOutSegs(day) {
      return day.segments.filter((s) => s.cardOut && !props.hiddenActivities.has(s.activity))
    }
    // Per-segment hover info without per-segment DOM: map cursor Y to a segment.
    function onSegHover(e, day) {
      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      const pct = (1 - (e.clientY - rect.top) / rect.height) * 100
      const seg = day.segments.find((s) => !props.hiddenActivities.has(s.activity) && pct >= s.topPct && pct < s.topPct + s.heightPct)
      const title = seg ? `${seg.activity}${seg.cardOut ? ' · ' + t('card not inserted') : ''}: ${seg.startLabel} — ${seg.endLabel}` : ''
      if (el.title !== title) el.title = title
    }

    const maxDistance = computed(() => {
      const filtered = props.records.filter((r) => r.activityChangeInfo?.length)
      return Math.max(...filtered.map((r) => r.activityDayDistance || 0), 1)
    })

    const distLabels = computed(() => {
      const max = maxDistance.value
      if (max <= 1) return []
      const step = max <= 200 ? 100 : max <= 500 ? 250 : max <= 1000 ? 500 : 1000
      const labels = []
      for (let v = step; v <= max; v += step) {
        labels.push({ value: v, pct: (v / max) * 100 })
      }
      return labels
    })

    const days = computed(() => {
      const filtered = props.records
        .filter((r) => r.activityChangeInfo && r.activityChangeInfo.length > 0)
        .sort((a, b) => a.activityRecordDate - b.activityRecordDate)

      const maxDist = maxDistance.value

      let prevMonth = -1
      return filtered.map((r, idx) => {
          const d = new Date(r.activityRecordDate * 1000)
          const day = d.getUTCDate()
          const month = d.getUTCMonth()
          const year = d.getUTCFullYear()
          const monthKey = year * 12 + month
          const isMonthStart = monthKey !== prevMonth
          prevMonth = monthKey
          const isLastDay = idx === filtered.length - 1
          return {
            ts: r.activityRecordDate,
            label: String(day),
            isMonthStart,
            monthLabel: formatDayParts(r.activityRecordDate, { month: 'short', year: 'numeric' }),
            segments: buildTimelineSegments(r.activityChangeInfo, isLastDay),
            distance: r.activityDayDistance || 0,
            distPct: r.activityDayDistance ? Math.max(3, (r.activityDayDistance / maxDist) * 100) : 0,
          }
        })
    })

    function scrollToDate(ts) {
      const idx = days.value.findIndex((d) => d.ts === ts)
      if (idx >= 0 && scrollRef.value) {
        const col = scrollRef.value.querySelectorAll('.timeline-day')[idx]
        if (col) {
          col.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
          col.getAnimations().forEach((a) => a.cancel())
          col.animate(
            [
              { background: 'rgba(25, 118, 210, 0.35)' },
              { background: 'transparent' },
            ],
            { duration: 2000, easing: 'ease-out' },
          )
        }
      }
    }

    function onWheel(e) {
      if (scrollRef.value && e.deltaY !== 0) {
        e.preventDefault()
        scrollRef.value.scrollLeft += e.deltaY
      }
    }

    expose({ scrollToDate })

    return { days, distLabels, scrollRef, onWheel, dayGradient, cardOutSegs, onSegHover }
  },
})
</script>

<style scoped>
.activity-timeline-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.timeline-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.time-axis {
  flex-shrink: 0;
  width: 28px;
  display: flex;
  flex-direction: column;
}

.time-labels {
  flex: 7;
  display: flex;
  flex-direction: column;
}

.time-axis-header {
  flex-shrink: 0;
  height: 20px;
}

.time-axis-dist {
  flex: 3;
  position: relative;
}

.dist-label {
  position: absolute;
  right: 4px;
  font-size: 8px;
  transform: translateY(-50%);
}

.time-label {
  flex: 1;
  font-size: 9px;
  text-align: right;
  padding-right: 4px;
  line-height: 1;
}

.timeline-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
}

.timeline-columns {
  display: flex;
  height: 100%;
}

.month-separator {
  flex-shrink: 0;
  width: 14px;
  position: relative;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.month-separator-label {
  position: absolute;
  top: 70%;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.timeline-day {
  flex-shrink: 0;
  width: 26px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.timeline-day:hover {
  background: rgba(255, 255, 255, 0.03);
}

.day-header {
  text-align: center;
  height: 20px;
  line-height: 20px;
  font-size: 9px;
  flex-shrink: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.day-dist-area {
  flex: 3;
  display: flex;
  align-items: flex-start;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.day-distance-bar {
  width: 100%;
  background: #26a641;
  border-radius: 0 0 1px 1px;
  margin: 0 3px;
  min-height: 1px;
}

.day-column {
  flex: 7;
  position: relative;
  min-height: 0;
}

.day-fill {
  position: absolute;
  left: 2px;
  right: 2px;
  top: 0;
  bottom: 0;
  border-radius: 1px;
  opacity: 0.85;
  pointer-events: none;
}

.day-card-out {
  position: absolute;
  left: 2px;
  right: 2px;
  pointer-events: none;
  background-image: linear-gradient(45deg, rgba(0, 0, 0, 0.18) 25%, transparent 25%, transparent 50%, rgba(0, 0, 0, 0.18) 50%, rgba(0, 0, 0, 0.18) 75%, transparent 75%);
  background-size: 6px 6px;
}

.day-block {
  position: absolute;
  left: 2px;
  right: 2px;
  min-height: 1px;
  border-radius: 1px;
  opacity: 0.85;
}
</style>
