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
          <template v-if="col.name === 'coordinates' && tableProps.row.badGeo">
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
  name: 'BorderCrossingsTable',
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
      { name: 'from', label: t('From'), field: 'from', align: 'center' },
      { name: 'to', label: t('To'), field: 'to', align: 'center' },
      { name: 'coordinates', label: t('Coordinates'), field: 'coordinates', align: 'left' },
      { name: 'odometer', label: t('Odometer'), field: 'odometer', align: 'right' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => {
          const ts = r.gnssPlaceAuthRecord?.timeStamp || 0
          const geo = r.gnssPlaceAuthRecord?.geoCoordinates
          const valid = isValidGeo(geo)
          return {
            id: i,
            ts,
            dayTs: dayStart(ts),
            timeStr: formatDateTime(ts),
            from: r.countryLeft || '—',
            to: r.countryEntered || '—',
            coordinates: geo
              ? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}`
              : '—',
            odometer: r.vehicleOdometerValue ?? '—',
            badGeo: !valid,
          }
        })
        .sort((a, b) => a.ts - b.ts),
    )

    return { columns, rows }
  },
})
</script>
