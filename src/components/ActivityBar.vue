<template>
  <div
    class="activity-bar"
    :style="{ height: height + 'px', minWidth: minWidth }"
    @mousemove="onHover"
    @mouseleave="clearTitle"
  >
    <div class="activity-fill" :style="{ background: gradient }" />
    <!-- Card-out periods: the stored activity there is stale, so it is hatched
         rather than presented as a plain recorded activity. -->
    <div
      v-for="(seg, i) in cardOutSegs"
      :key="'co' + i"
      class="card-out-hatch"
      :style="{ left: seg.startPct + '%', width: seg.widthPct + '%' }"
    />
    <div
      v-for="(m, mi) in markers"
      :key="'m' + mi"
      class="timeline-marker"
      :style="{ left: m.pct + '%' }"
    />
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'

// One day of driver activity as a horizontal band: a single CSS gradient rather
// than one node per segment, plus the card-out hatch, optional markers and a
// hover readout. Shared by the activity table and the speed views so the same
// visual carries the same behaviour everywhere.
//
// Positions come from the segments' own day percentages, so whatever renders
// this must span exactly one day (00:00-24:00).
export default defineComponent({
  name: 'ActivityBar',
  props: {
    // Output of buildDaySegments().segments
    segments: { type: Array, required: true },
    // Activities toggled off in the legend; hidden ones leave a gap rather than
    // collapsing the bar, so segment positions stay put.
    hiddenActivities: { type: Set, default: () => new Set() },
    // [{ pct }] - vertical marks, e.g. the hovered minute elsewhere in the UI.
    markers: { type: Array, default: () => [] },
    height: { type: Number, default: 18 },
    minWidth: { type: String, default: '0' },
  },
  setup(props) {
    const { t } = useI18n()

    const ACT_VAR = {
      DRIVING: 'var(--act-driving)', WORK: 'var(--act-work)',
      AVAILABILITY: 'var(--act-availability)', 'BREAK/REST': 'var(--act-rest)',
    }

    const gradient = computed(() => {
      const parts = []
      for (const s of props.segments) {
        const col = props.hiddenActivities.has(s.activity) ? 'transparent' : (ACT_VAR[s.activity] || 'var(--act-rest)')
        parts.push(`${col} ${s.startPct.toFixed(3)}% ${(s.startPct + s.widthPct).toFixed(3)}%`)
      }
      return parts.length ? `linear-gradient(90deg, ${parts.join(', ')})` : 'transparent'
    })

    const cardOutSegs = computed(() =>
      props.segments.filter((s) => s.cardOut && !props.hiddenActivities.has(s.activity)),
    )

    // Per-segment hover without per-segment DOM: find the segment under the
    // pointer and put it in the native title.
    function onHover(e) {
      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      const seg = props.segments.find(
        (s) => !props.hiddenActivities.has(s.activity) && pct >= s.startPct && pct < s.startPct + s.widthPct,
      )
      const title = seg
        ? `${seg.activity}${seg.cardOut ? ' · ' + t('card not inserted') : ''}: ${seg.startLabel} - ${seg.endLabel}`
        : ''
      if (el.title !== title) el.title = title
    }

    function clearTitle(e) {
      e.currentTarget.title = ''
    }

    return { gradient, cardOutSegs, onHover, clearTitle }
  },
})
</script>

<style scoped>
.activity-bar {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.activity-fill {
  position: absolute;
  inset: 0;
  opacity: 0.85;
}

.card-out-hatch {
  position: absolute;
  top: 0;
  height: 100%;
  pointer-events: none;
  background-image: linear-gradient(45deg, rgba(0, 0, 0, 0.18) 25%, transparent 25%, transparent 50%, rgba(0, 0, 0, 0.18) 50%, rgba(0, 0, 0, 0.18) 75%, transparent 75%);
  background-size: 6px 6px;
}

.timeline-marker {
  position: absolute;
  top: -2px;
  height: calc(100% + 4px);
  width: 0;
  border-left: 2px solid #fff;
  z-index: 2;
  pointer-events: none;
}
</style>
