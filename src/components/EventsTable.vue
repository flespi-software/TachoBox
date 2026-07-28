<template>
  <RecordTable
    :rows="rows"
    :columns="columns"
    :table-style="tableStyle"
    clickable
    @day-click="$emit('day-click', $event)"
  />
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventTypes as EVENT_TYPES } from 'src/reference'
import { formatDateTime, dayStart } from 'src/utils/format'
import RecordTable from './RecordTable.vue'

export default defineComponent({
  name: 'EventsTable',
  components: { RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  emits: ['day-click'],
  setup(props) {
    const { t } = useI18n()

    const columns = computed(() => [
      { name: 'type', label: t('Event Type'), field: 'typeStr', align: 'left' },
      { name: 'typeCode', label: t('Code'), field: 'typeCode', align: 'center' },
      { name: 'begin', label: t('Begin'), field: 'beginStr', align: 'left' },
      { name: 'end', label: t('End'), field: 'endStr', align: 'left' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => ({
          id: i,
          typeCode: r.eventType,
          typeStr: EVENT_TYPES[r.eventType] ? t(EVENT_TYPES[r.eventType]) : `${t('Unknown')} (${r.eventType})`,
          beginTs: r.eventBeginTime,
          dayTs: dayStart(r.eventBeginTime || 0),
          beginStr: formatDateTime(r.eventBeginTime),
          endStr: formatDateTime(r.eventEndTime),
        }))
        .sort((a, b) => a.beginTs - b.beginTs),
    )

    return { columns, rows }
  },
})
</script>
