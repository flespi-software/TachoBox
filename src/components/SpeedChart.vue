<template>
  <div class="speed-chart">
    <div class="chart-header" :class="{ 'chart-header--compact': compact }">
      <div :class="compact ? 'text-caption' : 'text-subtitle2'">
        <q-icon v-if="!compact" name="mdi-speedometer" size="xs" class="q-mr-xs" />
        {{ label || $t('Speed') }}
      </div>
      <span class="text-caption text-grey">{{ statsLabel }}</span>
    </div>

    <div class="chart-body" ref="chartRef">
      <svg
        :viewBox="`0 0 ${chartWidth} ${height}`"
        class="chart-svg"
        :style="{ height: `${height}px` }"
        @mousemove="onMove"
        @mouseleave="hovered = null"
      >
        <template v-for="g in gridLines" :key="g.y">
          <line :x1="0" :y1="g.y" :x2="chartWidth" :y2="g.y" class="chart-grid-line" stroke-width="0.5" />
          <text :x="chartWidth - 2" :y="g.y - 2" text-anchor="end" class="chart-label">{{ g.label }}</text>
        </template>

        <!-- The speed the vehicle unit was calibrated to. Reading the trace
             against it is the point of the chart, so it sits above the grid. -->
        <template v-if="limitY != null">
          <line :x1="0" :y1="limitY" :x2="chartWidth" :y2="limitY" class="chart-limit" stroke-width="0.8" stroke-dasharray="4,3" />
          <text :x="2" :y="limitY - 2" class="chart-label chart-label-limit">{{ authorisedSpeed }}</text>
        </template>

        <template v-for="tick in ticks" :key="'t' + tick.x">
          <line :x1="tick.x" :y1="0" :x2="tick.x" :y2="height" class="chart-separator" stroke-width="0.5" stroke-dasharray="3,3" />
          <text :x="tick.x + 3" :y="17" class="chart-label">{{ tick.label }}</text>
        </template>

        <!-- One path per contiguous run of blocks, so a recording gap is not
             bridged by a straight line that never happened. -->
        <path v-for="(d, i) in segments" :key="i" :d="d" class="speed-line" fill="none" stroke-width="1" />

        <!-- Excursions above the calibrated limit. Marked in a strip along the
             top rather than on the trace: exceeding by 1 km/h is a single pixel
             that disappears into the line. The strip says *when*, the limit line
             says where the threshold is, and the header says by how much. -->
        <path v-if="overPath" :d="overPath" class="speed-over" fill="none" stroke-width="2" />

        <line v-if="hovered" :x1="hovered.x" :y1="0" :x2="hovered.x" :y2="height" class="chart-cursor" stroke-width="0.5" />
      </svg>
      <!-- Anything sharing the axis goes here - the activity band, in practice.
           Inside chart-body so it lines up with the plot by construction. -->
      <slot name="below" />
      <div v-if="hovered" class="chart-tooltip" :style="{ left: hovered.left }">
        {{ hovered.speed }} {{ $t('km/h') }} · {{ hovered.timeStr }}
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime, formatTimeOfDay, formatDayParts } from 'src/utils/format'

const PAD_TOP = 20
// Height of the over-limit tick strip, in viewBox units.
const OVER_MARK_H = 7

// Per-second speed from a vehicle unit. One block covers one minute of movement.
// The axis can be pinned with `from`/`to` - a single day, say - or left to span
// whatever the data covers.
export default defineComponent({
  name: 'SpeedChart',
  props: {
    blocks: { type: Array, required: true },
    // Speed the unit was calibrated to; drawn as a reference line.
    authorisedSpeed: { type: Number, default: null },
    // Pin the axis. Without them it spans the data.
    from: { type: Number, default: null },
    to: { type: Number, default: null },
    label: { type: String, default: '' },
    height: { type: Number, default: 160 },
    compact: { type: Boolean, default: false },
  },
  setup(props) {
    const { t } = useI18n()
    const chartRef = ref(null)
    const chartWidth = ref(1000)
    const hovered = ref(null)
    let resizeObserver = null

    // The observer must be attached to an element that exists at mount, and the
    // first measurement has to happen right away: a stale viewBox width makes
    // the SVG scale to fit, which centres the drawing and puts everything except
    // the middle out of step with the pointer.
    onMounted(() => {
      if (!chartRef.value) return
      const measure = (w) => { if (w) chartWidth.value = w }
      measure(chartRef.value.getBoundingClientRect().width)
      resizeObserver = new ResizeObserver((entries) => measure(entries[0].contentRect.width))
      resizeObserver.observe(chartRef.value)
    })
    onBeforeUnmount(() => resizeObserver?.disconnect())

    const sorted = computed(() =>
      [...props.blocks]
        .filter((b) => b.speedBlockBeginDate && Array.isArray(b.speedsPerSecond))
        .sort((a, b) => a.speedBlockBeginDate - b.speedBlockBeginDate),
    )

    // Blocks are recorded only while the vehicle moves, so consecutive blocks
    // are one minute apart and anything larger is a gap. Group into runs.
    const runs = computed(() => {
      const out = []
      let current = null
      for (const b of sorted.value) {
        if (!current || b.speedBlockBeginDate !== current.end + 60) {
          current = { end: b.speedBlockBeginDate, blocks: [b] }
          out.push(current)
        } else {
          current.end = b.speedBlockBeginDate
          current.blocks.push(b)
        }
      }
      return out
    })

    const range = computed(() => {
      if (props.from != null && props.to != null) return { from: props.from, to: props.to }
      const s = sorted.value
      if (!s.length) return null
      return { from: s[0].speedBlockBeginDate, to: s[s.length - 1].speedBlockBeginDate + 60 }
    })

    // Thinning, step one: a second whose speed matches both neighbours adds
    // nothing to the shape, so only the ends of each constant run are kept.
    // Lossless for the drawn line and typically removes two thirds of the points.
    function collapse(run) {
      const pts = []
      for (const b of run.blocks) {
        for (let i = 0; i < b.speedsPerSecond.length; i++) {
          pts.push([b.speedBlockBeginDate + i, b.speedsPerSecond[i]])
        }
      }
      const kept = []
      for (let i = 0; i < pts.length; i++) {
        const s = pts[i][1]
        if (s !== pts[i - 1]?.[1] || s !== pts[i + 1]?.[1]) kept.push(pts[i])
      }
      return kept
    }

    const stats = computed(() => {
      let max = 0
      let movingSeconds = 0
      let sum = 0
      let overSeconds = 0
      const limit = props.authorisedSpeed
      for (const b of sorted.value) {
        for (const s of b.speedsPerSecond) {
          if (s > max) max = s
          if (s > 0) { movingSeconds++; sum += s }
          if (limit && s > limit) overSeconds++
        }
      }
      return { max, avg: movingSeconds ? Math.round(sum / movingSeconds) : 0, movingSeconds, overSeconds }
    })

    // Seconds matter here: a few seconds over the calibrated limit is a real
    // reading, and rounding it to "0m" would say the opposite of the truth.
    const durationStr = (seconds) => {
      if (seconds < 60) return `${seconds}s`
      const h = Math.floor(seconds / 3600)
      const m = Math.round((seconds % 3600) / 60)
      return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
    }

    const statsLabel = computed(() => {
      const st = stats.value
      if (!st.movingSeconds) return ''
      const parts = [`${t('Max:')} ${st.max} ${t('km/h')}`]
      if (st.avg) parts.push(`${t('Avg:')} ${st.avg}`)
      parts.push(`${t('Moving:')} ${durationStr(st.movingSeconds)}`)
      if (st.overSeconds) parts.push(`${t('Over limit:')} ${durationStr(st.overSeconds)}`)
      return parts.join(' · ')
    })

    const scaleMax = computed(() =>
      Math.max(10, Math.ceil(Math.max(stats.value.max, props.authorisedSpeed || 0) / 20) * 20),
    )
    const xOf = (ts) => {
      const r = range.value
      return ((ts - r.from) / (r.to - r.from)) * chartWidth.value
    }
    const yOf = (speed) => PAD_TOP + (1 - speed / scaleMax.value) * (props.height - PAD_TOP)

    const limitY = computed(() => (props.authorisedSpeed && range.value ? yOf(props.authorisedSpeed) : null))

    // Thinning, step two: with a wide range there are still far more points than
    // pixels, so each pixel column is reduced to its min and max. That keeps
    // peaks visible - a plain "every Nth point" would drop them.
    const chartData = computed(() => {
      const r = range.value
      if (!r) return { paths: [], total: 0, over: '' }
      const paths = []
      const over = []
      const limit = props.authorisedSpeed
      let total = 0
      for (const run of runs.value) {
        const pts = collapse(run).filter(([ts]) => ts >= r.from && ts < r.to)
        if (!pts.length) continue
        const columns = new Map()
        for (const [ts, speed] of pts) {
          const col = Math.round(xOf(ts))
          const c = columns.get(col)
          if (!c) columns.set(col, { min: speed, max: speed, first: speed, last: speed })
          else {
            if (speed < c.min) c.min = speed
            if (speed > c.max) c.max = speed
            c.last = speed
          }
        }
        const cols = [...columns.entries()].sort((a, b) => a[0] - b[0])
        total += cols.length
        // A column whose peak sits above the limit gets a tick in the top strip.
        if (limit) {
          for (const [x, c] of cols) {
            if (c.max > limit) over.push(`M${x},0L${x},${OVER_MARK_H}`)
          }
        }
        // Enter the column at its first value, sweep to the extremes, leave at
        // the last - one continuous line that still shows the column's range.
        const d = cols.map(([x, c], i) => {
          const parts = i === 0 ? [`M${x},${yOf(c.first)}`] : [`L${x},${yOf(c.first)}`]
          if (c.max !== c.first) parts.push(`L${x},${yOf(c.max)}`)
          if (c.min !== c.max) parts.push(`L${x},${yOf(c.min)}`)
          if (c.last !== c.min) parts.push(`L${x},${yOf(c.last)}`)
          return parts.join('')
        }).join('')
        paths.push(d)
      }
      return { paths, total, over: over.join('') }
    })

    const segments = computed(() => chartData.value.paths)
    const overPath = computed(() => chartData.value.over)

    const gridLines = computed(() => {
      const step = scaleMax.value / 2
      return [0, step, scaleMax.value].map((v) => ({ y: yOf(v), label: `${v}` }))
    })

    // Hours within a pinned day, calendar days across a longer span.
    const ticks = computed(() => {
      const r = range.value
      if (!r) return []
      const span = r.to - r.from
      const out = []
      if (span <= 2 * 86400) {
        const step = span <= 6 * 3600 ? 3600 : 4 * 3600
        for (let ts = Math.ceil(r.from / step) * step; ts < r.to; ts += step) {
          out.push({ x: xOf(ts), label: formatTimeOfDay(ts) })
        }
      } else {
        for (let ts = Math.ceil(r.from / 86400) * 86400; ts < r.to; ts += 86400) {
          const x = xOf(ts)
          if (out.length && x - out[out.length - 1].x < 60) continue
          out.push({ x, label: formatDayParts(ts, { day: '2-digit', month: 'short' }) })
        }
      }
      return out
    })

    function onMove(e) {
      const r = range.value
      if (!r) return
      // Convert through the SVG's own matrix rather than the bounding box, so
      // the reading stays correct whatever scaling the viewBox ends up with.
      const ctm = e.currentTarget.getScreenCTM()
      if (!ctm) return
      const x = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()).x
      const ts = Math.round(r.from + (x / chartWidth.value) * (r.to - r.from))
      const block = sorted.value.find((b) => ts >= b.speedBlockBeginDate && ts < b.speedBlockBeginDate + 60)
      if (!block) { hovered.value = null; return }
      hovered.value = {
        x,
        left: `${Math.max(0, Math.min(100, (x / chartWidth.value) * 100))}%`,
        speed: block.speedsPerSecond[ts - block.speedBlockBeginDate] ?? 0,
        timeStr: formatDateTime(ts),
      }
    }

    return { chartRef, chartWidth, segments, overPath, gridLines, ticks, limitY, statsLabel, hovered, onMove }
  },
})
</script>

<style scoped>
.speed-chart {
  padding: 4px 8px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.chart-header--compact {
  margin-bottom: 0;
}

.chart-body {
  position: relative;
  width: 100%;
}

.chart-svg {
  width: 100%;
  display: block;
}

.speed-line {
  stroke: #26a641;
}

.chart-limit {
  stroke: #e05252;
}

.speed-over {
  stroke: #e05252;
}

.chart-label-limit {
  fill: #e05252;
}

.chart-grid-line {
  stroke: rgba(255, 255, 255, 0.12);
}

.chart-separator {
  stroke: rgba(255, 255, 255, 0.2);
}

.chart-cursor {
  stroke: rgba(255, 255, 255, 0.5);
}

.chart-label {
  font-size: 9px;
  fill: rgba(255, 255, 255, 0.5);
}

.body--light .chart-grid-line {
  stroke: rgba(0, 0, 0, 0.12);
}

.body--light .chart-separator {
  stroke: rgba(0, 0, 0, 0.2);
}

.body--light .chart-cursor {
  stroke: rgba(0, 0, 0, 0.5);
}

.body--light .chart-label {
  fill: rgba(0, 0, 0, 0.6);
}

.chart-tooltip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  pointer-events: none;
  white-space: nowrap;
}
</style>
