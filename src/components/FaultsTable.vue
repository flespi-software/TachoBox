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
import { faultTypes as FAULT_TYPES } from 'src/reference'
import { formatDateTime, dayStart } from 'src/utils/format'
import RecordTable from './RecordTable.vue'

export default defineComponent({
  name: 'FaultsTable',
  components: { RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  emits: ['day-click'],
  setup(props) {
    const { t } = useI18n()

    const columns = computed(() => [
      { name: 'type', label: t('Fault Type'), field: 'typeStr', align: 'left' },
      { name: 'typeCode', label: t('Code'), field: 'typeCode', align: 'center' },
      { name: 'begin', label: t('Begin'), field: 'beginStr', align: 'left' },
      { name: 'end', label: t('End'), field: 'endStr', align: 'left' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => ({
          id: i,
          typeCode: r.faultType,
          typeStr: FAULT_TYPES[r.faultType] ? t(FAULT_TYPES[r.faultType]) : `${t('Unknown')} (${r.faultType})`,
          beginTs: r.faultBeginTime,
          dayTs: dayStart(r.faultBeginTime || 0),
          beginStr: formatDateTime(r.faultBeginTime),
          endStr: formatDateTime(r.faultEndTime),
        }))
        .sort((a, b) => a.beginTs - b.beginTs),
    )

    return { columns, rows }
  },
})
</script>
