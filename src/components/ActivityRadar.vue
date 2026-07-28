<template>
  <div class="activity-radar">
    <div class="radar-chart">
      <svg :viewBox="`0 0 ${size} ${size}`" class="radar-svg">
        <!-- Grid rings -->
        <polygon
          v-for="level in gridLevels"
          :key="level"
          :points="gridPoints(level)"
          class="grid-ring"
        />

        <!-- Axes -->
        <line
          v-for="(axis, i) in visibleAxes"
          :key="'axis-' + i"
          :x1="cx" :y1="cy"
          :x2="axisEnd(i).x" :y2="axisEnd(i).y"
          class="axis-line"
        />

        <!-- Data polygon -->
        <polygon v-if="visibleAxes.length >= 3" :points="dataPoints" class="data-polygon" />

        <!-- Data dots -->
        <circle
          v-for="(pt, i) in dataCoords"
          :key="'dot-' + i"
          :cx="pt.x" :cy="pt.y"
          r="3.5"
          :class="['data-dot', visibleAxes[i].cls]"
        />

        <!-- Axis labels -->
        <text
          v-for="(axis, i) in visibleAxes"
          :key="'label-' + i"
          :x="labelPos(i).x"
          :y="labelPos(i).y"
          :text-anchor="labelAnchor(i)"
          :dominant-baseline="labelBaseline(i)"
          class="axis-label"
        >{{ axis.label }}</text>
      </svg>
    </div>

    <div class="radar-stats">
      <div
        v-for="stat in allStats"
        :key="stat.activity"
        :class="['stat-row', { 'stat-hidden': hidden.has(stat.activity) }]"
        @click="toggleAxis(stat.activity)"
      >
        <q-icon :name="stat.mdiIcon" size="xs" :class="stat.textCls" />
        <span class="stat-label">{{ stat.label }}</span>
        <span class="stat-value">{{ stat.durationStr }}</span>
        <span class="stat-pct text-grey">{{ stat.pctStr }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildDaySegments, formatDuration } from 'src/utils/activity'

export default defineComponent({
  name: 'ActivityRadar',
  props: {
    records: { type: Array, required: true },
    compact: { type: Boolean, default: false },
  },
  setup(props) {
    const { t } = useI18n()
    const size = 220
    const cx = size / 2
    const cy = size / 2
    const radius = 70
    const gridLevels = [1, 2, 3, 4]

    const hidden = ref(new Set(['BREAK/REST']))

    const AXES_DEF = computed(() => [
      { activity: 'DRIVING', label: t('Driving'), mdiIcon: 'mdi-steering', cls: 'dot-driving', textCls: 'text-deep-orange-4' },
      { activity: 'WORK', label: t('Work'), mdiIcon: 'mdi-hammer-wrench', cls: 'dot-work', textCls: 'text-light-blue-5' },
      { activity: 'AVAILABILITY', label: t('Avail.'), mdiIcon: 'mdi-clock-outline', cls: 'dot-availability', textCls: 'text-amber-5' },
      { activity: 'BREAK/REST', label: t('Rest'), mdiIcon: 'mdi-sleep', cls: 'dot-rest', textCls: 'text-grey-5' },
    ])

    function toggleAxis(activity) {
      const s = new Set(hidden.value)
      if (s.has(activity)) {
        s.delete(activity)
      } else {
        // Don't allow hiding all - keep at least 3 visible
        const visibleCount = AXES_DEF.value.length - s.size
        if (visibleCount <= 3) return
        s.add(activity)
      }
      hidden.value = s
    }

    const rawTotals = computed(() => {
      const sums = { DRIVING: 0, WORK: 0, AVAILABILITY: 0, 'BREAK/REST': 0 }
      const validRecords = props.records.filter((r) => r.activityChangeInfo?.length)
      for (const r of validRecords) {
        // Never pass isLastDay - radar needs actual durations, not "ongoing" behavior
        const { totals: dayTotals } = buildDaySegments(r.activityChangeInfo)
        for (const key of Object.keys(sums)) {
          sums[key] += dayTotals[key] || 0
        }
      }
      return sums
    })

    const allStats = computed(() => {
      const rt = rawTotals.value
      const total = rt.DRIVING + rt.WORK + rt.AVAILABILITY + rt['BREAK/REST']
      return AXES_DEF.value.map((a) => {
        const val = rt[a.activity] || 0
        return {
          ...a,
          pct: total ? val / total : 0,
          pctStr: total ? Math.round(val / total * 100) + '%' : '0%',
          durationStr: formatDuration(val),
        }
      })
    })

    const visibleAxes = computed(() => {
      const visible = allStats.value.filter((a) => !hidden.value.has(a.activity))
      if (visible.length < 3) return allStats.value
      // Recalculate pct relative to visible total only
      const visibleTotal = visible.reduce((sum, a) => sum + (rawTotals.value[a.activity] || 0), 0)
      return visible.map((a) => {
        const val = rawTotals.value[a.activity] || 0
        return {
          ...a,
          pct: visibleTotal ? val / visibleTotal : 0,
          pctStr: visibleTotal ? Math.round(val / visibleTotal * 100) + '%' : '0%',
        }
      })
    })

    function angleFor(i) {
      return (Math.PI * 2 * i) / visibleAxes.value.length - Math.PI / 2
    }

    function pointAt(i, r) {
      const angle = angleFor(i)
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    }

    function axisEnd(i) {
      return pointAt(i, radius)
    }

    function gridPoints(level) {
      const count = visibleAxes.value.length
      const r = radius * (level / gridLevels.length)
      return Array.from({ length: count }, (_, i) => {
        const pt = pointAt(i, r)
        return `${pt.x},${pt.y}`
      }).join(' ')
    }

    const dataCoords = computed(() =>
      visibleAxes.value.map((a, i) => pointAt(i, radius * a.pct)),
    )

    const dataPoints = computed(() =>
      dataCoords.value.map((pt) => `${pt.x},${pt.y}`).join(' '),
    )

    function labelPos(i) {
      return pointAt(i, radius + 16)
    }

    function labelAnchor(i) {
      const angle = angleFor(i)
      const cos = Math.cos(angle)
      if (cos > 0.1) return 'start'
      if (cos < -0.1) return 'end'
      return 'middle'
    }

    function labelBaseline(i) {
      const angle = angleFor(i)
      const sin = Math.sin(angle)
      if (sin < -0.3) return 'auto'
      if (sin > 0.3) return 'hanging'
      return 'middle'
    }

    return {
      size, cx, cy, radius,
      gridLevels, hidden,
      allStats, visibleAxes,
      toggleAxis,
      axisEnd, gridPoints,
      dataCoords, dataPoints,
      labelPos, labelAnchor, labelBaseline,
    }
  },
})
</script>

<style scoped>
.activity-radar {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 8px;
}

.radar-chart {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.radar-svg {
  width: 100%;
  max-width: 220px;
}

.grid-ring {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
}

.body--light .grid-ring {
  stroke: rgba(0, 0, 0, 0.12);
}

.axis-line {
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 1;
}

.body--light .axis-line {
  stroke: rgba(0, 0, 0, 0.15);
}

.data-polygon {
  fill: rgba(57, 211, 83, 0.2);
  stroke: #39d353;
  stroke-width: 2;
}

.data-dot {
  stroke: none;
}

.dot-driving { fill: #ff5722; }
.dot-work { fill: #03a9f4; }
.dot-availability { fill: #ffa000; }
.dot-rest { fill: #616161; }

.axis-label {
  fill: rgba(255, 255, 255, 0.7);
  font-size: 11px;
}

.body--light .axis-label {
  fill: rgba(0, 0, 0, 0.7);
}

.radar-stats {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 10px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.stat-row:hover {
  opacity: 0.8;
}

.stat-row.stat-hidden {
  opacity: 0.35;
}

.stat-label {
  flex: 1;
}

.stat-value {
  font-weight: 500;
}

.stat-pct {
  width: 36px;
  text-align: right;
}
</style>
