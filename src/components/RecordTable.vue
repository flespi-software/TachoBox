<template>
  <q-table
    :rows="rows"
    :columns="columns"
    :row-key="rowKey"
    :virtual-scroll="!printMode"
    :virtual-scroll-item-size="35"
    :rows-per-page-options="[0]"
    flat
    bordered
    dense
    class="sticky-header-table"
    :class="{ 'clickable-table': clickable }"
    :style="tableStyle"
    @row-click="onRowClick"
  >
    <!-- Forward any slots (e.g. a custom #body) to the underlying q-table -->
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </q-table>
</template>

<script setup>
import { inject, ref } from 'vue'

const props = defineProps({
  rows: { type: Array, required: true },
  columns: { type: Array, required: true },
  rowKey: { type: String, default: 'id' },
  tableStyle: { type: String, default: '' },
  // When true, rows are clickable and a click emits `day-click` with the row's
  // `dayTs` field (expected to be the UTC day-start timestamp).
  clickable: { type: Boolean, default: false },
})

const emit = defineEmits(['day-click'])

const printMode = inject('printMode', ref(false))

function onRowClick(evt, row) {
  if (props.clickable && row && row.dayTs != null) {
    emit('day-click', row.dayTs)
  }
}
</script>
