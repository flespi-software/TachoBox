<template>
  <div class="distance-chart" v-if="bars.length">
    <div class="chart-header">
      <div class="text-subtitle2">
        <q-icon name="mdi-road-variant" size="xs" class="q-mr-xs" />
        {{ $t('Daily Distance') }}
      </div>
      <span class="text-caption text-grey">{{ $t('Total:') }} {{ totalStr }}</span>
    </div>
    <div class="chart-body" ref="chartRef">
      <svg :viewBox="`0 0 ${chartWidth} ${VH}`" class="chart-svg">
        <!-- Grid lines -->
        <line
          v-for="g in gridLines"
          :key="g.y"
          :x1="0" :y1="g.y"
          :x2="chartWidth" :y2="g.y"
          class="chart-grid-line"
          stroke-width="0.5"
        />
        <text
          v-for="g in gridLines"
          :key="'t'+g.y"
          :x="chartWidth - 2"
          :y="g.y - 2"
          text-anchor="end"
          class="chart-label chart-label-grid"
        >{{ g.label }}</text>
        <!-- Week separators -->
        <template v-for="sep in weekSeparators" :key="'sep'+sep.x">
          <line :x1="sep.x" :y1="0" :x2="sep.x" :y2="VH" class="chart-separator" stroke-width="0.5" stroke-dasharray="3,3" />
          <text :x="sep.x + 3" :y="12" class="chart-label chart-label-week">{{ sep.label }}</text>
        </template>
        <!-- Bars -->
        <rect
          v-for="bar in bars"
          :key="bar.ts"
          :x="bar.x"
          :y="bar.y"
          :width="bar.w"
          :height="bar.h"
          :fill="bar.color"
          rx="1"
          class="chart-bar"
          @mouseenter="hovered = bar"
          @mouseleave="hovered = null"
          @click="$emit('day-click', bar.ts)"
        >
          <title>{{ bar.dateStr }}: {{ bar.distance }} km</title>
        </rect>
      </svg>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { formatDate, formatDayParts } from 'src/utils/format'

const VH = 120
const PAD = 4

export default defineComponent({
  name: 'DistanceChart',
  props: {
    records: { type: Array, required: true },
  },
  emits: ['day-click'],
  setup(props) {
    const hovered = ref(null)
    const chartRef = ref(null)
    const chartWidth = ref(1000)

    let resizeObserver = null
    onMounted(() => {
      if (chartRef.value) {
        chartWidth.value = chartRef.value.clientWidth || 1000
        resizeObserver = new ResizeObserver((entries) => {
          chartWidth.value = entries[0].contentRect.width || 1000
        })
        resizeObserver.observe(chartRef.value)
      }
    })
    onBeforeUnmount(() => { if (resizeObserver) resizeObserver.disconnect() })

    const data = computed(() =>
      props.records
        .filter((r) => r.activityDayDistance > 0 && r.activityRecordDate > 946684800)
        .map((r) => ({
          ts: r.activityRecordDate,
          distance: r.activityDayDistance,
          dateStr: formatDate(r.activityRecordDate),
        }))
        .sort((a, b) => a.ts - b.ts),
    )

    const totalStr = computed(() => {
      const total = data.value.reduce((s, d) => s + d.distance, 0)
      return total.toLocaleString() + ' km'
    })

    const maxDist = computed(() => {
      const m = Math.max(...data.value.map((d) => d.distance), 1)
      return Math.ceil(m / 100) * 100
    })

    const bars = computed(() => {
      const count = data.value.length
      if (!count) return []
      const cw = chartWidth.value
      const gap = Math.min(4, cw / count * 0.15)
      const weekGap = gap * 3
      // Count week boundaries
      let weekBreaks = 0
      for (let i = 1; i < count; i++) {
        const prevDow = new Date(data.value[i - 1].ts * 1000).getUTCDay()
        const curDow = new Date(data.value[i].ts * 1000).getUTCDay()
        if (curDow <= prevDow || (data.value[i].ts - data.value[i - 1].ts) > 6 * 86400) weekBreaks++
      }
      const totalGaps = (count - 1 - weekBreaks) * gap + weekBreaks * weekGap
      const barW = (cw - totalGaps) / count

      let x = 0
      return data.value.map((d, i) => {
        if (i > 0) {
          const prevDow = new Date(data.value[i - 1].ts * 1000).getUTCDay()
          const curDow = new Date(d.ts * 1000).getUTCDay()
          const isWeekBreak = curDow <= prevDow || (d.ts - data.value[i - 1].ts) > 6 * 86400
          x += isWeekBreak ? weekGap : gap
        }
        const h = Math.max(1, (d.distance / maxDist.value) * (VH - PAD))
        const bar = {
          ...d,
          x,
          y: VH - h,
          w: barW,
          h,
          color: d.distance > 500 ? '#39d353' : d.distance > 200 ? '#26a641' : '#006d32',
        }
        x += barW
        return bar
      })
    })

    const gridLines = computed(() => {
      const max = maxDist.value
      const step = max <= 200 ? 50 : max <= 500 ? 100 : max <= 1500 ? 250 : 500
      const lines = []
      for (let v = step; v < max; v += step) {
        lines.push({
          y: VH - (v / max) * (VH - PAD),
          label: v,
        })
      }
      return lines
    })

    const weekSeparators = computed(() => {
      const allSeps = []
      const b = bars.value
      for (let i = 1; i < b.length; i++) {
        const prevDow = new Date(data.value[i - 1].ts * 1000).getUTCDay()
        const curDow = new Date(data.value[i].ts * 1000).getUTCDay()
        if (curDow <= prevDow || (data.value[i].ts - data.value[i - 1].ts) > 6 * 86400) {
          const x = (b[i - 1].x + b[i - 1].w + b[i].x) / 2
          const label = formatDayParts(data.value[i].ts, { day: '2-digit', month: 'short' })
          allSeps.push({ x, label })
        }
      }
      const minLabelSpacing = 40
      const seps = []
      let lastX = -Infinity
      for (const sep of allSeps) {
        if (sep.x - lastX >= minLabelSpacing) {
          seps.push(sep)
          lastX = sep.x
        } else {
          seps.push({ x: sep.x, label: '' })
        }
      }
      return seps
    })

    return { bars, gridLines, weekSeparators, chartWidth, VH, totalStr, hovered, chartRef }
  },
})
</script>

<style scoped>
.distance-chart {
  padding: 8px;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.chart-body {
  position: relative;
}

.chart-svg {
  display: block;
  width: 100%;
  height: 100px;
}

.chart-grid-line {
  stroke: rgba(255, 255, 255, 0.06);
}

.chart-separator {
  stroke: rgba(255, 255, 255, 0.1);
}

.chart-label {
  fill: rgba(255, 255, 255, 0.25);
}

.body--light .chart-grid-line {
  stroke: rgba(0, 0, 0, 0.08);
}

.body--light .chart-separator {
  stroke: rgba(0, 0, 0, 0.12);
}

.body--light .chart-label {
  fill: rgba(0, 0, 0, 0.35);
}

.chart-label-grid {
  font-size: 10px;
}

.chart-label-week {
  font-size: 9px;
}

.chart-bar {
  cursor: pointer;
}

.chart-bar:hover {
  filter: brightness(1.3);
}
</style>
