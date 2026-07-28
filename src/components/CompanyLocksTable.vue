<template>
  <RecordTable :rows="rows" :columns="columns" :table-style="tableStyle" />
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime, MAX_TS } from 'src/utils/format'
import RecordTable from './RecordTable.vue'

export default defineComponent({
  name: 'CompanyLocksTable',
  components: { RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  setup(props) {
    const { t } = useI18n()

    const columns = computed(() => [
      { name: 'company', label: t('Company'), field: 'company', align: 'left' },
      { name: 'address', label: t('Address'), field: 'address', align: 'left' },
      { name: 'cardId', label: t('Card ID'), field: 'cardId', align: 'left' },
      { name: 'lockIn', label: t('Lock In'), field: 'lockInStr', align: 'left' },
      { name: 'lockOut', label: t('Lock Out'), field: 'lockOutStr', align: 'left' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => ({
          id: i,
          company: r.companyName || '—',
          address: r.companyAddress || '—',
          cardId: r.FullCardNumberAndGeneration?.FullCardNumber?.driverIdentification || '—',
          lockInTs: r.lockInTime || 0,
          lockInStr: formatDateTime(r.lockInTime),
          lockOutStr: r.lockOutTime >= MAX_TS ? t('Active') : formatDateTime(r.lockOutTime),
        }))
        .sort((a, b) => b.lockInTs - a.lockInTs),
    )

    return { columns, rows }
  },
})
</script>
