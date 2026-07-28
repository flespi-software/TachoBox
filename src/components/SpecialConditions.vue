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
import { formatDateTime, dayStart } from 'src/utils/format'
import RecordTable from './RecordTable.vue'

export default defineComponent({
  name: 'SpecialConditions',
  components: { RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  emits: ['day-click'],
  setup(props) {
    const { t } = useI18n()

    const columns = computed(() => [
      { name: 'type', label: t('Condition'), field: 'type', align: 'left' },
      { name: 'time', label: t('Time'), field: 'timeStr', align: 'left' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => ({
          id: i,
          type: r.specificConditionType || '—',
          timeTs: r.entryTime,
          dayTs: dayStart(r.entryTime || 0),
          timeStr: formatDateTime(r.entryTime),
        }))
        .sort((a, b) => a.timeTs - b.timeTs),
    )

    return { columns, rows }
  },
})
</script>
