<template>
  <q-card flat bordered class="driver-info">
    <q-card-section class="q-py-xs q-px-sm row items-center wrap q-gutter-x-md">
      <!-- VU Daily -->
      <template v-if="isVu">
        <div class="text-subtitle1 no-wrap row items-center">
          <q-icon name="mdi-truck" class="q-mr-xs" />
          <EuroPlate v-if="vu.plate" :number="vu.plate" :nation="vu.nation" />
          <span v-else class="text-bold">{{ $t('Vehicle Unit') }}</span>
        </div>
        <q-separator vertical />
        <div v-if="vu.vin" class="field no-wrap">
          <q-icon name="mdi-barcode" size="xs" class="q-mr-xs text-grey" />
          <span class="text-grey">{{ $t('VIN:') }}</span> {{ vu.vin }}
        </div>
        <div v-if="vu.country" class="field no-wrap">
          <q-icon name="mdi-flag" size="xs" class="q-mr-xs text-grey" />
          <span class="text-grey">{{ $t('Country:') }}</span> {{ vu.country }}
        </div>
        <div v-if="vu.odometer" class="field no-wrap">
          <q-icon name="mdi-counter" size="xs" class="q-mr-xs text-grey" />
          <span class="text-grey">{{ $t('Odometer:') }}</span> {{ vu.odometer }} km
        </div>
        <div v-if="vu.period" class="field no-wrap">
          <q-icon name="mdi-calendar-range" size="xs" class="q-mr-xs text-grey" />
          <span class="text-grey">{{ $t('Period:') }}</span> {{ vu.period }}
        </div>
      </template>

      <!-- Driver Card -->
      <template v-else>
        <div class="text-subtitle1 text-bold no-wrap">
          <q-icon name="mdi-account" class="q-mr-xs" />{{ fullName }}
        </div>
        <q-separator vertical />
        <div
          v-for="field in fields"
          :key="field.label"
          class="field no-wrap"
        >
          <q-icon :name="field.icon" size="xs" class="q-mr-xs text-grey" />
          <span class="text-grey">{{ field.label }}:</span>
          {{ field.value }}
        </div>
      </template>
    </q-card-section>
  </q-card>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { nationName } from 'src/reference'
import { useDddStore } from 'src/stores/ddd'
import { formatDate, formatDateTime, MAX_ODO } from 'src/utils/format'
import EuroPlate from 'src/components/EuroPlate.vue'

export default defineComponent({
  name: 'DriverInfo',
  components: { EuroPlate },
  props: {
    data: { type: Object, required: true },
  },
  setup(props) {
    const { t } = useI18n()
    const dddStore = useDddStore()
    const isVu = computed(() => dddStore.sourceType === 'vu-daily')

    // --- VU Daily ---
    const vu = computed(() => {
      if (!isVu.value) return {}
      const vehicles = props.data?.EF_Vehicles_Used?.cardVehicleRecords || []
      const first = vehicles[0]
      const reg = first?.vehicleRegistration || {}
      const plate = reg.vehicleRegistrationNumber || ''
      const nation = reg.vehicleRegistrationNation ?? null
      const meta = dddStore.enabledSources.find((s) => s.type === 'vu-daily')?.meta || {}
      const vin = meta.vin || ''

      let odometer = null
      if (first) {
        const odo = first.vehicleOdometerEnd || first.vehicleOdometerBegin
        if (odo && odo < MAX_ODO) odometer = odo
      }

      let period = ''
      if (vehicles.length) {
        const sorted = [...vehicles].sort((a, b) => a.vehicleFirstUse - b.vehicleFirstUse)
        const from = formatDate(sorted[0].vehicleFirstUse)
        const to = formatDate(sorted[sorted.length - 1].vehicleLastUse)
        period = to === '—' ? from : `${from} — ${to}`
      }

      return {
        plate,
        nation,
        vin,
        country: nation !== null ? nationName(nation) : '',
        odometer,
        period,
      }
    })

    // --- Driver Card ---
    const identification = computed(() => props.data?.EF_Identification?.CardIdentification || {})
    const holder = computed(() => props.data?.EF_Identification?.DriverCardHolderIdentification || {})
    const licence = computed(() => props.data?.EF_Driving_Licence_Info?.CardDrivingLicenceInformation || {})
    const lastDownload = computed(() => props.data?.EF_Card_Download?.LastCardDownload)
    const currentUsage = computed(() => props.data?.EF_Current_Usage?.CardCurrentUse || null)

    const fullName = computed(() => {
      const name = holder.value?.cardHolderName || {}
      return [name.holderSurname, name.holderFirstNames].filter(Boolean).join(' ')
    })

    const fields = computed(() => {
      const list = [
        { icon: 'mdi-card-account-details', label: t('Card'), value: identification.value.cardNumber || '—' },
        { icon: 'mdi-flag', label: t('Country'), value: nationName(identification.value.cardIssuingMemberState) },
        { icon: 'mdi-calendar-range', label: t('Valid'), value: formatDate(identification.value.cardValidityBegin) + ' — ' + formatDate(identification.value.cardExpiryDate) },
        { icon: 'mdi-cake-variant', label: t('Born'), value: formatDate(holder.value.cardHolderBirthDate) },
        { icon: 'mdi-card-text', label: t('Licence'), value: [licence.value.drivingLicenceNumber, licence.value.drivingLicenceIssuingAuthority].filter(Boolean).join(' / ') || '—' },
      ]
      if (lastDownload.value) {
        list.push({ icon: 'mdi-download', label: t('Last download'), value: formatDateTime(lastDownload.value) })
      }
      if (currentUsage.value?.sessionOpenTime) {
        const veh = currentUsage.value.sessionOpenVehicle?.vehicleRegistrationNumber || ''
        list.push({ icon: 'mdi-login', label: t('Session'), value: formatDateTime(currentUsage.value.sessionOpenTime) + (veh ? ` (${veh})` : '') })
      }
      return list
    })

    return { isVu, vu, fullName, fields }
  },
})
</script>

<style scoped>
.driver-info .field {
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
