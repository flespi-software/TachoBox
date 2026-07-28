<template>
  <RecordTable :rows="rows" :columns="columns" :table-style="tableStyle" />
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from 'src/utils/format'
import RecordTable from './RecordTable.vue'

export default defineComponent({
  name: 'ControlActivityTable',
  components: { RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  setup(props) {
    const { t } = useI18n()

    function formatControlType(ct) {
      if (!ct) return '—'
      const labels = []
      if (ct.display) labels.push(t('Display'))
      if (ct.printing) labels.push(t('Printing'))
      if (ct.cardDownloading) labels.push(t('Card download'))
      if (ct.vuDownloading) labels.push(t('VU download'))
      return labels.length ? labels.join(', ') : '—'
    }

    const columns = computed(() => [
      { name: 'time', label: t('Time'), field: 'timeStr', align: 'left' },
      { name: 'type', label: t('Type'), field: 'type', align: 'left' },
      { name: 'vehicle', label: t('Vehicle'), field: 'vehicle', align: 'left' },
      { name: 'card', label: t('Card'), field: 'card', align: 'left' },
      { name: 'periodBegin', label: t('Period Begin'), field: 'periodBeginStr', align: 'left' },
      { name: 'periodEnd', label: t('Period End'), field: 'periodEndStr', align: 'left' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => {
          const ts = r.controlTime || 0
          return {
            id: i,
            ts,
            timeStr: formatDateTime(ts),
            type: formatControlType(r.controlType),
            vehicle: r.controlVehicleRegistration?.vehicleRegistrationNumber || '—',
            card: r.controlCardNumber?.driverIdentification || '—',
            periodBeginStr: formatDateTime(r.controlDownloadPeriodBegin),
            periodEndStr: formatDateTime(r.controlDownloadPeriodEnd),
          }
        })
        .sort((a, b) => a.ts - b.ts),
    )

    return { columns, rows }
  },
})
</script>
