<template>
  <q-item dense class="source-item" :class="{ 'q-pl-lg': indent }">
    <q-item-section avatar style="min-width: 24px; padding-right: 4px">
      <q-checkbox dense :model-value="src.enabled" @update:model-value="$emit('toggle', src.index)" />
    </q-item-section>
    <!-- Native title rather than QTooltip: the drawer list is dense and a popup
         following the pointer down the rows is more noise than help. -->
    <q-item-section :title="tooltip">
      <q-item-label class="ellipsis text-caption">
        <q-icon :name="src.type === 'driver-card' ? 'mdi-card-account-details' : 'mdi-truck'" size="xs" class="q-mr-xs" />
        {{ label }}
      </q-item-label>
      <q-item-label caption>{{ caption }}</q-item-label>
    </q-item-section>
    <q-item-section v-if="src.meta?.plate_number && settingsStore.fileDisplayMode === 'meta'" side>
      <EuroPlate :number="src.meta.plate_number" :nation="src.meta.region" />
    </q-item-section>
    <q-item-section side class="source-actions">
      <!-- Only device-sourced files carry a uuid, i.e. still exist in flespi
           media storage and can be fetched back as the original binary. -->
      <q-btn v-if="src.uuid && src.deviceId" flat dense round size="xs" icon="mdi-download" :title="t('Save DDD')" @click.stop="$emit('download', src)" />
      <q-btn flat dense round size="xs" icon="mdi-code-json" :title="t('Save JSON')" @click.stop="$emit('save', src)" />
      <q-btn flat dense round size="xs" icon="mdi-close" :title="t('Remove')" @click.stop="$emit('remove', src.index)" />
    </q-item-section>
  </q-item>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from 'src/stores/settings'
import EuroPlate from 'src/components/EuroPlate.vue'

const props = defineProps({
  src: { type: Object, required: true },
  // Indent nested sources (those belonging to a device/parser) under their parent.
  indent: { type: Boolean, default: false },
})

defineEmits(['toggle', 'save', 'download', 'remove'])

const { t } = useI18n()
const settingsStore = useSettingsStore()

function driverName(meta) {
  return [meta.driver_first_name, meta.driver_last_name].filter(Boolean).join(' ')
}

const label = computed(() => {
  const src = props.src
  if (settingsStore.fileDisplayMode === 'filename') return src.name || t('Unknown')
  const meta = src.meta || {}
  return driverName(meta) || meta.vin || src.name || t('Unknown')
})

const caption = computed(() => {
  const typePart = props.src.type === 'driver-card' ? t('Driver Card') : t('VU Daily')
  // A vehicle unit file states its generation outright; a card is labelled by
  // which applications it actually carries.
  const by = props.src.byGeneration || {}
  const genPart = by.g1 && by.g2 ? 'G1+G2' : (props.src.generation || 'g1').toUpperCase()
  return `${typePart} · ${genPart}`
})

const tooltip = computed(() => {
  const src = props.src
  const meta = src.meta || {}
  const lines = []
  if (src.name) lines.push(src.name)
  const name = driverName(meta)
  if (name) lines.push(`${t('Driver:')} ${name}`)
  if (meta.driver_id) lines.push(`${t('Driver ID:')} ${meta.driver_id}`)
  if (meta.vin) lines.push(`${t('VIN:')} ${meta.vin}`)
  if (meta.plate_number) lines.push(`${t('Plate:')} ${meta.plate_number}${meta.region ? ` (${meta.region})` : ''}`)
  lines.push(src.type === 'driver-card' ? t('Driver Card') : t('VU Daily'))
  return lines.join('\n')
})
</script>

<style scoped>
/* QItemSection lays its content out as a column, and the `row` utility class
   only sets wrapping - it does not set the direction, so it cannot override
   that. Without an explicit direction the action icons stack vertically. */
.source-actions {
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  padding-right: 0;
}

/* The icons are revealed on hover so the file name gets the full row width in
   the narrow drawer. Gated on a real hover capability: on touch there is no
   hover, so there the icons stay permanently visible. */
@media (hover: hover) {
  .source-item .source-actions {
    display: none;
  }

  .source-item:hover .source-actions,
  .source-item:focus-within .source-actions {
    display: flex;
  }
}

/* Sources are rendered straight into the drawer list (no QList separator), so
   with several icons per row the boundary between files needs its own rule. */
.source-item + .source-item {
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}

.body--dark .source-item + .source-item {
  border-top-color: rgba(255, 255, 255, 0.15);
}
</style>
