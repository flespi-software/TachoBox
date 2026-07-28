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
  name: 'DownloadActivityTable',
  components: { RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  emits: ['day-click'],
  setup(props) {
    const { t } = useI18n()

    const columns = computed(() => [
      { name: 'company', label: t('Company / Workshop'), field: 'company', align: 'left' },
      { name: 'cardId', label: t('Card ID'), field: 'cardId', align: 'left' },
      { name: 'time', label: t('Download Time'), field: 'timeStr', align: 'left' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => ({
          id: i,
          company: r.companyOrWorkshopName || '—',
          cardId: r.FullCardNumberAndGeneration?.FullCardNumber?.driverIdentification || '—',
          timeTs: r.downloadingTime || 0,
          dayTs: dayStart(r.downloadingTime || 0),
          timeStr: formatDateTime(r.downloadingTime),
        }))
        .sort((a, b) => b.timeTs - a.timeTs),
    )

    return { columns, rows }
  },
})
</script>
