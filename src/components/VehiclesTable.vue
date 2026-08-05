<template>
  <RecordTable :rows="rows" :columns="columns" :table-style="tableStyle">
    <template #body-cell-plate="cellProps">
      <q-td :props="cellProps">
        <EuroPlate v-if="cellProps.row.plateNumber" :number="cellProps.row.plateNumber" :nation="cellProps.row.nationCode" />
        <span v-else class="text-grey">—</span>
      </q-td>
    </template>
  </RecordTable>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { nationName } from 'src/reference'
import { formatDate, isUnsetOdometer, NOT_RECORDED } from 'src/utils/format'
import EuroPlate from 'src/components/EuroPlate.vue'
import RecordTable from './RecordTable.vue'

function validOdo(v) {
  return isUnsetOdometer(v) ? null : v
}

export default defineComponent({
  name: 'VehiclesTable',
  components: { EuroPlate, RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  setup(props) {
    const { t } = useI18n()

    const columns = computed(() => [
      { name: 'plate', label: t('Vehicle'), field: 'plateNumber', align: 'left' },
      { name: 'nation', label: t('Country'), field: 'nation', align: 'left' },
      { name: 'firstUse', label: t('First Use'), field: 'firstUseStr', align: 'left' },
      { name: 'lastUse', label: t('Last Use'), field: 'lastUseStr', align: 'left' },
      { name: 'odometerBegin', label: t('Odometer Begin (km)'), field: 'odometerBegin', align: 'center' },
      { name: 'odometerEnd', label: t('Odometer End (km)'), field: 'odometerEnd', align: 'center' },
      { name: 'distance', label: t('Distance (km)'), field: 'distance', align: 'center' },
      { name: 'blockCounter', label: t('Block Counter'), field: 'blockCounter', align: 'center' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => ({
          id: i,
          plateNumber: r.vehicleRegistration?.vehicleRegistrationNumber || '',
          nationCode: r.vehicleRegistration?.vehicleRegistrationNation,
          nation: nationName(r.vehicleRegistration?.vehicleRegistrationNation),
          firstUseTs: r.vehicleFirstUse,
          firstUseStr: formatDate(r.vehicleFirstUse),
          lastUseStr: formatDate(r.vehicleLastUse),
          odometerBegin: validOdo(r.vehicleOdometerBegin) ?? NOT_RECORDED,
          odometerEnd: validOdo(r.vehicleOdometerEnd) ?? NOT_RECORDED,
          distance: validOdo(r.vehicleOdometerBegin) !== null && validOdo(r.vehicleOdometerEnd) !== null
            ? r.vehicleOdometerEnd - r.vehicleOdometerBegin
            : NOT_RECORDED,
          blockCounter: r.vuDataBlockCounter || NOT_RECORDED,
        }))
        .sort((a, b) => a.firstUseTs - b.firstUseTs),
    )

    return { columns, rows }
  },
})
</script>
