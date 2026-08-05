<template>
  <div class="technical-panel q-pa-sm">
    <template v-if="data">
      <div class="section-title">{{ t('Vehicle unit') }}</div>
      <div class="kv-grid">
        <template v-for="row in identification" :key="row.label">
          <div class="kv-key">{{ row.label }}</div>
          <div class="kv-value">{{ row.value }}</div>
        </template>
      </div>

      <template v-if="calibrations.length">
        <div class="section-title">{{ t('Calibrations') }}</div>
        <RecordTable :rows="calibrations" :columns="calibrationColumns" />
      </template>

      <template v-if="sensors.length">
        <div class="section-title">{{ t('Paired sensors') }}</div>
        <RecordTable :rows="sensors" :columns="sensorColumns" />
      </template>

      <template v-if="cards.length">
        <div class="section-title">{{ t('Cards known to the vehicle unit') }}</div>
        <RecordTable :rows="cards" :columns="cardColumns" />
      </template>
    </template>
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate, formatDateTime, formatOdometer, isUnsetOdometer, isUnsetTime, MAX_SERIAL } from 'src/utils/format'
import RecordTable from './RecordTable.vue'

// Equipment data from a vehicle unit download: what the recorder is, how it was
// calibrated, which sensors are paired and which cards it has seen. Driver card
// files carry none of this, so the tab only appears for VU files.
export default defineComponent({
  name: 'TechnicalDataPanel',
  components: { RecordTable },
  props: {
    data: { type: Object, default: null },
  },
  setup(props) {
    const { t } = useI18n()

    // Serial numbers arrive as an object; monthYear is a BCD MMYY string.
    const serial = (s) => {
      if (!s || s.serialNumber == null || s.serialNumber === MAX_SERIAL) return ''
      const my = s.monthYear && s.monthYear !== 'FFFF' ? ` (${s.monthYear.slice(0, 2)}/${s.monthYear.slice(2)})` : ''
      return `${s.serialNumber}${my}`
    }
    const odo = (v) => (isUnsetOdometer(v) ? '' : `${formatOdometer(v)} ${t('km')}`)
    const time = (v) => (isUnsetTime(v) ? '' : formatDateTime(v))

    const identification = computed(() => {
      const id = props.data?.identification
      if (!id) return []
      const sw = id.vuSoftwareIdentification || {}
      return [
        { label: t('Manufacturer'), value: id.vuManufacturerName || '' },
        { label: t('Address'), value: id.vuManufacturerAddress || '' },
        { label: t('Part number'), value: id.vuPartNumber || '' },
        { label: t('Serial number'), value: serial(id.vuSerialNumber) },
        { label: t('Software version'), value: sw.vuSoftwareVersion || '' },
        { label: t('Software installed'), value: time(sw.vuSoftInstallationDate) },
        { label: t('Manufactured'), value: formatDate(id.vuManufacturingDate) },
        { label: t('Approval number'), value: id.vuApprovalNumber || '' },
        { label: t('Generation'), value: id.vuGeneration != null ? String(id.vuGeneration) : '' },
        { label: t('Digital map'), value: id.vuDigitalMapVersion || '' },
      ].filter((r) => r.value)
    })

    const calibrationColumns = computed(() => [
      { name: 'time', label: t('Date'), field: 'timeStr', align: 'left' },
      { name: 'workshop', label: t('Workshop'), field: 'workshop', align: 'left' },
      { name: 'card', label: t('Card ID'), field: 'card', align: 'left' },
      { name: 'country', label: t('Country'), field: 'country', align: 'center' },
      { name: 'odometer', label: t('Odometer'), field: 'odometer', align: 'right' },
      { name: 'tyre', label: t('Tyre size'), field: 'tyre', align: 'left' },
      { name: 'speed', label: t('Authorised speed'), field: 'speed', align: 'right' },
      { name: 'next', label: t('Next calibration'), field: 'nextStr', align: 'left' },
    ])

    const calibrations = computed(() =>
      (props.data?.calibrations || [])
        .map((c, i) => ({
          id: i,
          ts: c.oldTimeValue || 0,
          timeStr: time(c.oldTimeValue) || time(c.calibrationCountryTimestamp),
          workshop: c.workshopName || '',
          card: c.workshopCardNumber || '',
          country: c.calibrationCountry || '',
          // Both readings are present only when the odometer was actually reset.
          odometer: [odo(c.oldOdometerValue), odo(c.newOdometerValue)].filter(Boolean).join(' -> '),
          tyre: c.tyreSize || '',
          speed: c.authorisedSpeed ? `${c.authorisedSpeed} ${t('km/h')}` : '',
          nextStr: formatDate(c.nextCalibrationDate),
        }))
        .sort((a, b) => b.ts - a.ts),
    )

    const sensorColumns = computed(() => [
      { name: 'serial', label: t('Serial number'), field: 'serial', align: 'left' },
      { name: 'approval', label: t('Approval number'), field: 'approval', align: 'left' },
      { name: 'paired', label: t('Paired'), field: 'pairedStr', align: 'left' },
    ])

    const sensors = computed(() =>
      (props.data?.sensors || []).map((s, i) => ({
        id: i,
        serial: serial(s.sensorSerialNumber),
        approval: s.sensorApprovalNumber || '',
        pairedStr: time(s.sensorPairingDate ?? s.sensorPairingDateFirst),
      })),
    )

    const cardColumns = computed(() => [
      { name: 'number', label: t('Card ID'), field: 'number', align: 'left' },
      { name: 'type', label: t('Type'), field: 'type', align: 'left' },
      { name: 'state', label: t('Country'), field: 'state', align: 'center' },
      { name: 'consent', label: t('ITS consent'), field: 'consent', align: 'center' },
    ])

    // ITS consent is recorded per card, in a separate list keyed by card number.
    const cards = computed(() => {
      const consentByCard = new Map(
        (props.data?.itsConsent || []).map((r) => [
          r.FullCardNumberAndGeneration?.FullCardNumber?.driverIdentification,
          r.consent,
        ]),
      )
      return (props.data?.cards || []).map((c, i) => {
        const full = c.FullCardNumberAndGeneration?.FullCardNumber || {}
        const number = c.cardNumber || full.driverIdentification || ''
        const consent = consentByCard.get(number)
        return {
          id: i,
          number,
          type: full.cardTypeDescription || '',
          state: full.cardIssuingMemberState || '',
          consent: consent === undefined ? '' : consent ? t('Yes') : t('No'),
        }
      })
    })

    return { t, identification, calibrations, calibrationColumns, sensors, sensorColumns, cards, cardColumns }
  },
})
</script>

<style scoped>
.technical-panel {
  overflow-y: auto;
  height: 100%;
}

.section-title {
  font-weight: 600;
  margin: 12px 0 6px;
}

.section-title:first-child {
  margin-top: 0;
}

/* Label/value pairs, label column sized to its content. */
.kv-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 16px;
  margin-bottom: 4px;
}

.kv-key {
  opacity: 0.7;
}

.kv-value {
  word-break: break-word;
}
</style>
