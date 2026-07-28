<template>
  <RecordTable :rows="rows" :columns="columns" :table-style="tableStyle" clickable>
    <template #body="tableProps">
      <q-tr
        :props="tableProps"
        @mouseenter="$emit('row-hover', tableProps.row.id)"
        @mouseleave="$emit('row-hover', -1)"
        @click="$emit('day-click', tableProps.row.dayTs)"
        class="cursor-pointer"
      >
        <q-td v-for="col in tableProps.cols" :key="col.name" :props="tableProps" :class="{ 'text-grey-6': tableProps.row.badGeo && col.name === 'coordinates' }">
          <template v-if="col.name === 'operation'">
            <q-icon
              :name="tableProps.row.opType === 1 ? 'mdi-package-down' : 'mdi-package-up'"
              :color="tableProps.row.opType === 1 ? 'green' : 'red'"
              size="14px"
              class="q-mr-xs"
            />{{ col.value }}
          </template>
          <template v-else-if="col.name === 'coordinates' && tableProps.row.badGeo">
            <q-icon name="mdi-map-marker-off" size="xs" color="orange" class="q-mr-xs" />
            <q-tooltip>{{ $t('Invalid GPS coordinates') }}</q-tooltip>
            {{ col.value }}
          </template>
          <template v-else>{{ col.value }}</template>
        </q-td>
      </q-tr>
    </template>
  </RecordTable>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isValidGeo } from 'src/utils/geo'
import { formatDateTime, dayStart } from 'src/utils/format'
import RecordTable from './RecordTable.vue'

export default defineComponent({
  name: 'LoadUnloadTable',
  components: { RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  emits: ['day-click', 'row-hover'],
  setup(props) {
    const { t } = useI18n()

    const columns = computed(() => [
      { name: 'time', label: t('Time'), field: 'timeStr', align: 'left' },
      { name: 'operation', label: t('Operation'), field: 'operation', align: 'left' },
      { name: 'coordinates', label: t('Coordinates'), field: 'coordinates', align: 'left' },
      { name: 'odometer', label: t('Odometer'), field: 'odometer', align: 'right' },
    ])

    const rows = computed(() => {
      const opLabels = { 1: t('Load'), 2: t('Unload') }
      return props.records
        .map((r, i) => {
          const ts = r.timeStamp || 0
          const geo = r.GNSSPlaceAuthRecord?.geoCoordinates
          const valid = isValidGeo(geo)
          return {
            id: i,
            ts,
            dayTs: dayStart(ts),
            timeStr: formatDateTime(ts),
            opType: r.operationType,
            operation: opLabels[r.operationType] || t('Unknown'),
            coordinates: geo
              ? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}`
              : '—',
            odometer: r.vehicleOdometerValue ?? '—',
            badGeo: !valid,
          }
        })
        .sort((a, b) => a.ts - b.ts)
    })

    return { columns, rows }
  },
})
</script>
