<template>
  <RecordTable :rows="rows" :columns="columns" :table-style="tableStyle" clickable>
    <template #body="tableProps">
      <q-tr
        :props="tableProps"
        @mouseenter="$emit('row-hover', tableProps.row.countryCode)"
        @mouseleave="$emit('row-hover', null)"
        @click="$emit('day-click', tableProps.row.dayTs)"
        class="cursor-pointer"
      >
        <q-td v-for="col in tableProps.cols" :key="col.name" :props="tableProps">
          {{ col.value }}
        </q-td>
      </q-tr>
    </template>
  </RecordTable>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime, dayStart } from 'src/utils/format'
import RecordTable from './RecordTable.vue'

export default defineComponent({
  name: 'PlacesTable',
  components: { RecordTable },
  props: {
    records: { type: Array, required: true },
    authRecords: { type: Array, default: () => [] },
    tableStyle: { type: String, default: '' },
  },
  emits: ['day-click', 'row-hover'],
  setup(props) {
    const { t } = useI18n()

    const authMap = computed(() => {
      const m = new Map()
      for (const a of props.authRecords) m.set(a.entryTime, a.authenticationStatus)
      return m
    })

    const columns = computed(() => {
      const cols = [
        { name: 'country', label: t('Country'), field: 'country', align: 'left' },
        { name: 'region', label: t('Region'), field: 'region', align: 'left' },
        { name: 'time', label: t('Time'), field: 'timeStr', align: 'left' },
        { name: 'type', label: t('Type'), field: 'type', align: 'left' },
        { name: 'odometer', label: t('Odometer (km)'), field: 'odometer', align: 'center' },
      ]
      if (props.authRecords.length) {
        cols.push({ name: 'auth', label: t('GPS Auth'), field: 'authStr', align: 'center' })
      }
      return cols
    })

    const rows = computed(() =>
      props.records
        .map((r, i) => {
          const authStatus = authMap.value.get(r.entryTime)
          return {
            id: i,
            countryCode: r.dailyWorkPeriodCountry || '',
            country: r.dailyWorkPeriodCountry || '—',
            region: r.dailyWorkPeriodRegion || '—',
            timeTs: r.entryTime,
            dayTs: dayStart(r.entryTime || 0),
            timeStr: formatDateTime(r.entryTime),
            type: r.entryTypeDailyWorkPeriod || '—',
            odometer: r.vehicleOdometerValue ?? '—',
            authStr: authStatus === 1 ? '✓' : authStatus === 0 ? '✗' : authStatus != null ? String(authStatus) : '',
          }
        })
        .sort((a, b) => a.timeTs - b.timeTs),
    )

    return { columns, rows }
  },
})
</script>
