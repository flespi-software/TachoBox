<template>
  <div class="disc-container">
    <svg :viewBox="`0 0 ${size} ${size}`" class="disc-svg">
      <!-- Background circle -->
      <circle :cx="cx" :cy="cy" :r="midR" fill="none" stroke="rgba(255,255,255,0.08)" :stroke-width="ringWidth" />

      <!-- Hour ticks -->
      <line
        v-for="h in 24"
        :key="'t' + h"
        :x1="tickStart(h - 1).x" :y1="tickStart(h - 1).y"
        :x2="tickEnd(h - 1, (h - 1) % 3 === 0).x" :y2="tickEnd(h - 1, (h - 1) % 3 === 0).y"
        stroke="rgba(255,255,255,0.2)" :stroke-width="(h - 1) % 3 === 0 ? 1.2 : 0.6"
      />

      <!-- Hour labels — every 3 hours -->
      <text
        v-for="h in hourLabels"
        :key="'l' + h"
        :x="labelPos(h).x" :y="labelPos(h).y"
        text-anchor="middle" dominant-baseline="central"
        fill="rgba(255,255,255,0.5)" font-size="9"
      >{{ String(h).padStart(2, '0') }}</text>

      <!-- Activity arcs -->
      <path
        v-for="(seg, i) in arcs"
        :key="i"
        :d="seg.d"
        :fill="seg.color"
        :opacity="arcOpacity(seg, i)"
        class="arc-segment"
      >
        <title>{{ seg.activity }}: {{ seg.startLabel }} — {{ seg.endLabel }}</title>
      </path>

      <!-- Curved range bracket for a highlighted span -->
      <template v-if="bracket">
        <path :d="bracket.arc" class="disc-bracket" />
        <path :d="bracket.cap0" class="disc-bracket" />
        <path :d="bracket.cap1" class="disc-bracket" />
      </template>

      <!-- Center label -->
      <text :x="cx" :y="cx - 5" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="12" font-weight="bold">
        {{ dateLabel }}
      </text>
      <text :x="cx" :y="cx + 9" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="9">
        {{ weekdayLabel }}
      </text>
    </svg>
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { buildDaySegments, ACTIVITY_COLORS } from 'src/utils/activity'
import { formatDayParts } from 'src/utils/format'

const PAD = 18
const LABEL_R_OFFSET = 14
const TICK_LONG = 5
const TICK_SHORT = 3
const RING_W = 26
const OUTER_R = 72
const INNER_R = OUTER_R - RING_W
const MID_R = INNER_R + RING_W / 2
const SIZE = (OUTER_R + LABEL_R_OFFSET + PAD) * 2
const CX = SIZE / 2
const LABEL_R = OUTER_R + LABEL_R_OFFSET

function polarToCart(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.99) endAngle = startAngle + 359.99
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  const oStart = polarToCart(cx, cy, outerR, startAngle)
  const oEnd = polarToCart(cx, cy, outerR, endAngle)
  const iStart = polarToCart(cx, cy, innerR, endAngle)
  const iEnd = polarToCart(cx, cy, innerR, startAngle)
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${iEnd.x} ${iEnd.y}`,
    'Z',
  ].join(' ')
}

const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21]

export default defineComponent({
  name: 'ActivityDisc',
  props: {
    record: { type: Object, default: null },
    isLastDay: { type: Boolean, default: false },
    highlightIndex: { type: Number, default: -1 },
    highlightSpan: { type: Object, default: null }, // { start, end } in minutes - emphasises a range
  },
  setup(props) {
    const arcs = computed(() => {
      if (!props.record?.activityChangeInfo?.length) return []
      const { segments } = buildDaySegments(props.record.activityChangeInfo, { isLastDay: props.isLastDay })
      return segments.map((s) => {
        const startAngle = (s.startMin / 1440) * 360
        const endAngle = s.ongoing ? startAngle + 30 : (s.endMin / 1440) * 360
        return {
          d: arcPath(CX, CX, INNER_R, OUTER_R, startAngle, endAngle),
          color: ACTIVITY_COLORS[s.activity] || '#616161',
          activity: s.activity,
          startLabel: s.startLabel,
          endLabel: s.endLabel,
          startMin: s.startMin,
          endMin: s.endMin == null ? 1440 : s.endMin,
        }
      })
    })

    const dateLabel = computed(() =>
      props.record ? formatDayParts(props.record.activityRecordDate, { day: '2-digit', month: 'short' }) : '',
    )

    const weekdayLabel = computed(() =>
      props.record ? formatDayParts(props.record.activityRecordDate, { weekday: 'short' }) : '',
    )

    // Curved range bracket just outside the ring, spanning the highlighted minutes,
    // with short radial end-caps - the round counterpart of the timeline bracket.
    const bracket = computed(() => {
      const hs = props.highlightSpan
      if (!hs || hs.end <= hs.start) return null
      const R = OUTER_R + 9
      const a0 = (hs.start / 1440) * 360
      const a1 = (hs.end / 1440) * 360
      const p0 = polarToCart(CX, CX, R, a0)
      const p1 = polarToCart(CX, CX, R, a1)
      const large = a1 - a0 > 180 ? 1 : 0
      const cap = (a) => {
        const i = polarToCart(CX, CX, R - 3, a)
        const o = polarToCart(CX, CX, R + 3, a)
        return `M ${i.x} ${i.y} L ${o.x} ${o.y}`
      }
      return { arc: `M ${p0.x} ${p0.y} A ${R} ${R} 0 ${large} 1 ${p1.x} ${p1.y}`, cap0: cap(a0), cap1: cap(a1) }
    })

    return {
      size: SIZE,
      cx: CX,
      cy: CX,
      midR: MID_R,
      ringWidth: RING_W,
      arcs,
      bracket,
      dateLabel,
      weekdayLabel,
      hourLabels: HOUR_LABELS,
      arcOpacity(seg, i) {
        return props.highlightIndex >= 0 ? (props.highlightIndex === i ? 1 : 0.25) : 0.85
      },
      tickStart(h) { return polarToCart(CX, CX, OUTER_R + 1, (h / 24) * 360) },
      tickEnd(h, long) { return polarToCart(CX, CX, OUTER_R + (long ? TICK_LONG : TICK_SHORT), (h / 24) * 360) },
      labelPos(h) { return polarToCart(CX, CX, LABEL_R, (h / 24) * 360) },
    }
  },
})
</script>

<style scoped>
.disc-container {
  display: flex;
  align-items: center;
  justify-content: center;
}

.disc-svg {
  width: 100%;
  max-width: 208px;
  height: auto;
}

.arc-segment {
  transition: opacity 0.15s ease;
}

/* Curved range bracket - theme-aware (white on dark, dark on light). */
.disc-bracket {
  fill: none;
  stroke: rgba(0, 0, 0, 0.7);
  stroke-width: 1.5;
  stroke-linecap: round;
}
body.body--dark .disc-bracket {
  stroke: rgba(255, 255, 255, 0.92);
}
</style>
