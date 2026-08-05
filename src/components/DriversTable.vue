<template>
  <RecordTable
    :rows="rows"
    :columns="columns"
    :table-style="tableStyle"
    clickable
    @day-click="$emit('day-click', $event)"
  >
    <template #body-cell-withdrawn="cellProps">
      <q-td :props="cellProps">
        <span
          v-if="cellProps.row.stillInserted"
          class="text-grey"
          :title="t('The card was still in the slot when this file was downloaded')"
        >
          <q-icon name="mdi-alert" size="14px" class="text-warning q-mr-xs" />{{ t('Still inserted') }}
        </span>
        <span v-else>{{ cellProps.row.withdrawnStr }}</span>
      </q-td>
    </template>

    <template #body-cell-distance="cellProps">
      <q-td :props="cellProps">
        <span v-if="cellProps.row.distanceStr">{{ cellProps.row.distanceStr }}</span>
        <span v-else class="text-grey" :title="t('Not recorded in the file')">{{ NOT_RECORDED }}</span>
      </q-td>
    </template>

    <template #body-cell-previous="cellProps">
      <q-td :props="cellProps">
        <EuroPlate
          v-if="cellProps.row.previousPlate"
          :number="cellProps.row.previousPlate"
          :nation="cellProps.row.previousNation"
        />
      </q-td>
    </template>
  </RecordTable>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime, dayStart, isUnsetTime, isUnsetOdometer, NOT_RECORDED } from 'src/utils/format'
import EuroPlate from 'src/components/EuroPlate.vue'
import RecordTable from './RecordTable.vue'

// Driver cards used in this vehicle unit, one row per insertion/withdrawal
// cycle. The mirror of VehiclesTable, which lists the vehicles a driver card
// was used in. Only vehicle unit files carry this.
export default defineComponent({
  name: 'DriversTable',
  components: { EuroPlate, RecordTable },
  props: {
    records: { type: Array, required: true },
    tableStyle: { type: String, default: '' },
  },
  emits: ['day-click'],
  setup(props) {
    const { t } = useI18n()

    const columns = computed(() => [
      { name: 'driver', label: t('Driver'), field: 'driver', align: 'left' },
      { name: 'cardId', label: t('Card ID'), field: 'cardId', align: 'left' },
      { name: 'slot', label: t('Slot'), field: 'slot', align: 'center' },
      { name: 'inserted', label: t('Inserted'), field: 'insertedStr', align: 'left' },
      { name: 'withdrawn', label: t('Withdrawn'), field: 'withdrawnStr', align: 'left' },
      { name: 'distance', label: t('Distance'), field: 'distanceStr', align: 'right' },
      { name: 'previous', label: t('Previous vehicle'), field: 'previous', align: 'left' },
    ])

    const rows = computed(() =>
      props.records
        .map((r, i) => {
          const card = r.FullCardNumberAndGeneration?.FullCardNumber || r.FullCardNumber || {}
          const name = [r.cardHolderName?.holderSurname, r.cardHolderName?.holderFirstNames]
            .filter(Boolean).join(' ')
          const prev = r.previousVehicleInfo || {}
          // Both readings are fillers when the card was still inserted at
          // download time, so the pair is usable only when neither is unset.
          const begin = r.vehicleOdometerValueAtInsertion
          const end = r.vehicleOdometerValueAtWithdrawal
          const hasDistance = !isUnsetOdometer(begin) && !isUnsetOdometer(end) && end >= begin
          const stillInserted = isUnsetTime(r.cardWithdrawalTime)
          return {
            id: i,
            driver: name || t('Unknown'),
            cardId: card.driverIdentification || '-',
            // 0 is the driver slot, 1 the co-driver slot (Reg. 2016/799).
            slot: r.cardSlotNumber === 1 ? t('Co-driver') : t('Driver'),
            insertedTs: r.cardInsertionTime || 0,
            dayTs: dayStart(r.cardInsertionTime || 0),
            insertedStr: formatDateTime(r.cardInsertionTime),
            // The withdrawal time is 0 or the "not set" filler when the card was
            // still in the slot at download time; rendered by the cell slot.
            stillInserted,
            withdrawnStr: stillInserted ? '' : formatDateTime(r.cardWithdrawalTime),
            distanceStr: hasDistance ? `${(end - begin).toLocaleString()} ${t('km')}` : '',
            // Rendered as a plate by the #body-cell-previous slot; the plain
            // string stays as the sort/filter value for the column.
            previous: prev.vehicleRegistrationNumber || '',
            previousPlate: prev.vehicleRegistrationNumber || '',
            previousNation: prev.vehicleRegistrationNation || '',
          }
        })
        .sort((a, b) => b.insertedTs - a.insertedTs),
    )

    return { columns, rows, t, NOT_RECORDED }
  },
})
</script>
