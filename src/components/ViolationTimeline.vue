<template>
  <div class="violation-timeline">
    <!-- One full-width 24h row per day; the bracket marks the violation span -->
    <div
      v-for="day in days" :key="day.ts"
      class="vt-day" :class="{ 'vt-day-context': !day.hl }"
      @click="$emit('day-click', day.ts)"
    >
      <span class="vt-day-label text-caption">{{ day.label }}</span>
      <div class="vt-track">
        <div class="vt-bracket-strip">
          <div v-if="day.hl" class="vt-bracket" :style="{ left: day.hl.left + '%', width: day.hl.width + '%' }" />
        </div>
        <div class="vt-bar">
          <div class="vt-fill" :style="{ background: day.gradient }" />
          <div
            v-for="(co, i) in day.cardOut" :key="'co' + i"
            class="vt-cardout" :style="{ left: co.startPct + '%', width: co.widthPct + '%' }"
          />
        </div>
      </div>
    </div>
    <div class="vt-axis">
      <span v-for="h in axisHours" :key="h" class="vt-tick text-caption" :style="{ left: (h / 24 * 100) + '%' }">{{ String(h).padStart(2, '0') }}</span>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { buildDaySegments } from 'src/utils/activity'
import { formatDayParts } from 'src/utils/format'

const ACT_VAR = {
  DRIVING: 'var(--act-driving)', WORK: 'var(--act-work)',
  AVAILABILITY: 'var(--act-availability)', 'BREAK/REST': 'var(--act-rest)',
}
const DAY = 86400

function gradient(segments) {
  const parts = segments.map((s) => `${ACT_VAR[s.activity] || 'var(--act-rest)'} ${s.startPct.toFixed(2)}% ${(s.startPct + s.widthPct).toFixed(2)}%`)
  return parts.length ? `linear-gradient(to right, ${parts.join(', ')})` : 'transparent'
}

export default defineComponent({
  name: 'ViolationTimeline',
  props: {
    records: { type: Array, default: () => [] },
    fromTs: { type: Number, required: true }, // display window start (unix s, day-aligned)
    toTs: { type: Number, required: true }, // display window end (unix s, day-aligned, inclusive day)
    hlFrom: { type: Number, default: null }, // highlight window (absolute unix s)
    hlTo: { type: Number, default: null },
  },
  emits: ['day-click'],
  setup(props) {
    const byTs = computed(() => {
      const m = new Map()
      for (const r of props.records) if (r.activityChangeInfo?.length) m.set(r.activityRecordDate, r)
      return m
    })

    const days = computed(() => {
      const out = []
      const start = props.fromTs - (props.fromTs % DAY)
      for (let ts = start; ts <= props.toTs; ts += DAY) {
        const rec = byTs.value.get(ts)
        const segs = (rec ? buildDaySegments(rec.activityChangeInfo, {}) : { segments: [] }).segments
        // highlighted portion of this day (the part of [hlFrom,hlTo] inside the day)
        let hl = null
        if (props.hlFrom != null && props.hlTo != null) {
          const s = Math.max(0, (props.hlFrom - ts) / 60)
          const e = Math.min(1440, (props.hlTo - ts) / 60)
          if (e > s + 0.5) hl = { left: (s / 1440) * 100, width: ((e - s) / 1440) * 100 }
        }
        out.push({
          ts,
          label: formatDayParts(ts, { weekday: 'short', day: '2-digit', month: '2-digit' }),
          gradient: gradient(segs),
          cardOut: segs.filter((s) => s.cardOut),
          hl,
        })
      }
      return out
    })

    return { days, axisHours: [0, 3, 6, 9, 12, 15, 18, 21, 24] }
  },
})
</script>

<style scoped>
.violation-timeline {
  width: 100%;
}

.vt-day {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 3px;
  cursor: pointer;
}
.vt-day:hover .vt-bar {
  outline: 1px solid rgba(128, 128, 128, 0.4);
}
/* days shown only for context (outside the violation span) are dimmed */
.vt-day-context .vt-bar {
  opacity: 0.4;
}

.vt-day-label {
  flex-shrink: 0;
  width: 92px;
  font-size: 11px;
  opacity: 0.7;
  text-align: right;
  line-height: 20px;
}
.vt-track {
  flex: 1;
}
/* Thin range bracket above the bar:  |_____| (white on dark, dark on light) */
.vt-bracket-strip {
  position: relative;
  height: 10px;
  margin-bottom: 1px;
}
.vt-bracket {
  position: absolute;
  bottom: 0;
  height: 8px;
  border: 1px solid rgba(0, 0, 0, 0.7);
  border-bottom: none;
  border-radius: 2px 2px 0 0;
  box-sizing: border-box;
}
body.body--dark .vt-bracket {
  border-color: rgba(255, 255, 255, 0.92);
}
.vt-bar {
  position: relative;
  height: 20px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(128, 128, 128, 0.12);
}
.vt-fill {
  position: absolute;
  inset: 0;
  opacity: 0.9;
}
.vt-cardout {
  position: absolute;
  top: 0;
  bottom: 0;
  background-image: linear-gradient(45deg, rgba(0, 0, 0, 0.18) 25%, transparent 25%, transparent 50%, rgba(0, 0, 0, 0.18) 50%, rgba(0, 0, 0, 0.18) 75%, transparent 75%);
  background-size: 6px 6px;
}
.vt-axis {
  position: relative;
  height: 14px;
  margin-left: 100px;
}
.vt-tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: 9px;
  opacity: 0.6;
}
</style>
