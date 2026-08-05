<template>
  <div class="speed-panel q-pa-sm">
    <!-- Without this the empty stretches read as missing data. The buffer holds
         24h of movement (Annex IC), so on a vehicle that stands still between
         trips it reaches back weeks. -->
    <div class="text-caption text-grey-6 q-mb-sm">
      {{ $t('The tachograph stores 24 hours of movement, so this window can span many days:') }}
      {{ windowLabel }}
    </div>

    <div v-for="day in days" :key="day.ts" class="speed-day">
      <SpeedChart
        :blocks="day.blocks"
        :authorised-speed="authorisedSpeed"
        :from="day.ts"
        :to="day.ts + 86400"
        :label="day.label"
        :height="90"
        compact
      >
        <template #below>
          <ActivityBar v-if="day.segments.length" :segments="day.segments" :height="8" class="q-mt-xs" />
        </template>
      </SpeedChart>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { formatDate, formatWeekdayLong, dayStart } from 'src/utils/format'
import { buildDaySegments } from 'src/utils/activity'
import SpeedChart from './SpeedChart.vue'
import ActivityBar from './ActivityBar.vue'

// One row per day that actually has speed data, each on its own 00:00-24:00
// axis. A single linear axis across the whole download is unreadable: the
// retained movement covers a few percent of it, so the traces collapse into
// slivers separated by empty weeks.
export default defineComponent({
  name: 'SpeedPanel',
  components: { SpeedChart, ActivityBar },
  props: {
    blocks: { type: Array, required: true },
    authorisedSpeed: { type: Number, default: null },
    // Activity records for the same dataset; the band under each trace is built
    // from the one matching that day.
    activityRecords: { type: Array, default: () => [] },
  },
  setup(props) {
    const days = computed(() => {
      const byDay = new Map()
      for (const b of props.blocks) {
        if (!b.speedBlockBeginDate) continue
        const ts = dayStart(b.speedBlockBeginDate)
        if (!byDay.has(ts)) byDay.set(ts, [])
        byDay.get(ts).push(b)
      }
      return [...byDay.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([ts, blocks]) => {
          const record = props.activityRecords.find((r) => r.activityRecordDate === ts)
          return {
            ts,
            blocks,
            segments: record?.activityChangeInfo?.length
              ? buildDaySegments(record.activityChangeInfo).segments
              : [],
            label: `${formatDate(ts)}, ${formatWeekdayLong(ts)}`,
          }
        })
    })

    const windowLabel = computed(() => {
      const d = days.value
      if (!d.length) return ''
      const first = formatDate(d[d.length - 1].ts)
      const last = formatDate(d[0].ts)
      return first === last ? first : `${first} - ${last}`
    })

    return { days, windowLabel }
  },
})
</script>

<style scoped>
.speed-panel {
  overflow-y: auto;
  height: 100%;
}

.speed-day + .speed-day {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 4px;
  padding-top: 4px;
}

.body--light .speed-day + .speed-day {
  border-top-color: rgba(0, 0, 0, 0.08);
}
</style>
