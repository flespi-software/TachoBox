<template>
  <div class="gnss-panel column no-wrap">
    <div class="gnss-map" ref="mapContainer" />
    <div class="gnss-legend-bar row items-center q-px-xs q-gutter-x-sm" style="flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,0.1)">
      <span
        v-for="layer in layers"
        :key="layer.kind"
        class="legend-item"
        :class="{ 'legend-hidden': hiddenKinds.has(layer.kind) }"
        @click="toggleKind(layer.kind)"
      >
        <i class="legend-dot" :style="{ background: layer.color }" />
        {{ layer.label }}
        <q-badge v-if="layer.count" color="grey-8" class="q-ml-xs">{{ layer.count }}</q-badge>
      </span>
    </div>
    <div class="gnss-table">
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        :virtual-scroll="!printMode"
        :virtual-scroll-item-size="35"
        :rows-per-page-options="[0]"
        flat
        bordered
        dense
        class="sticky-header-table gnss-q-table"
      >
        <template #body="tableProps">
          <q-tr
            :props="tableProps"
            :class="{ 'highlighted-row': highlightId === tableProps.row.id }"
            @mouseenter="onRowHover(tableProps.row.id)"
            @mouseleave="onRowHover(-1)"
            @click="$emit('day-click', tableProps.row.dayTs)"
            class="cursor-pointer"
          >
            <q-td v-for="col in tableProps.cols" :key="col.name" :props="tableProps">
              <template v-if="col.name === 'detail'">
                <q-icon
                  :name="kindIcon(tableProps.row.kindLabel)"
                  :style="{ color: tableProps.row.dotColor }"
                  size="14px"
                  class="q-mr-xs"
                />{{ col.value }}
              </template>
              <template v-else>{{ col.value }}</template>
            </q-td>
          </q-tr>
        </template>
      </q-table>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addFullscreenControl } from 'src/utils/map-fullscreen'
import { isValidGeo, getTileUrl, TILE_ATTRIBUTION } from 'src/utils/geo'
import { formatDateTime } from 'src/utils/format'
import { useQuasar } from 'quasar'

export default defineComponent({
  name: 'GnssMap',
  inject: { printMode: { default: () => ref(false) } },
  props: {
    records: { type: Array, required: true },
    placeRecords: { type: Array, default: () => [] },
    borderCrossingRecords: { type: Array, default: () => [] },
    loadUnloadRecords: { type: Array, default: () => [] },
  },
  emits: ['day-click'],
  setup(props) {
    const { t } = useI18n()
    const $q = useQuasar()

    const LAYER_DEFS = computed(() => [
      { kind: 'gnss', label: t('GNSS'), color: '#90a4ae' },
      { kind: 'place', label: t('Places'), color: '#03a9f4' },
      { kind: 'border', label: t('Borders'), color: '#e040fb' },
      { kind: 'load', label: t('Load'), color: '#66bb6a' },
      { kind: 'unload', label: t('Unload'), color: '#ef5350' },
    ])

    const KIND_LABELS = computed(() => ({ gnss: t('GNSS'), place: t('Place'), border: t('Border'), load: t('Load'), unload: t('Unload') }))
    const mapContainer = ref(null)
    const highlightId = ref(-1)
    const hiddenKinds = ref(new Set())
    let map = null
    let tileLayer = null
    let routeLine = null
    let markersGroup = null
    let allMarkers = []
    let resizeObserver = null

    function toggleKind(kind) {
      const s = new Set(hiddenKinds.value)
      if (s.has(kind)) s.delete(kind)
      else s.add(kind)
      hiddenKinds.value = s
    }

    function collectAllPoints() {
      const all = []

      for (const r of props.records) {
        if (!isValidGeo(r.gnssPlaceRecord?.geoCoordinates)) continue
        const t = r.timeStamp || r.gnssPlaceRecord.timeStamp
        all.push({
          lat: r.gnssPlaceRecord.geoCoordinates.latitude,
          lng: r.gnssPlaceRecord.geoCoordinates.longitude,
          time: t,
          kind: 'gnss',
          color: '#90a4ae',
          radius: 5,
          info: '',
          odometer: r.vehicleOdometerValue,
          accuracy: r.gnssPlaceRecord.gnssAccuracy,
          popup: `GNSS — ${formatDateTime(t)}`,
        })
      }

      for (const r of props.placeRecords) {
        if (!isValidGeo(r.entryGNSSPlaceRecord?.geoCoordinates)) continue
        const isBegin = r.entryTypeDailyWorkPeriod?.includes('Begin')
        all.push({
          lat: r.entryGNSSPlaceRecord.geoCoordinates.latitude,
          lng: r.entryGNSSPlaceRecord.geoCoordinates.longitude,
          time: r.entryTime,
          kind: 'place',
          color: isBegin ? '#03a9f4' : '#ff9800',
          radius: 6,
          info: `${r.dailyWorkPeriodCountry || ''} ${isBegin ? t('Begin') : t('End')}`,
          odometer: r.vehicleOdometerValue,
          popup: `<b>${r.dailyWorkPeriodCountry || '—'}</b> ${isBegin ? t('Begin') : t('End')}<br>${formatDateTime(r.entryTime)}`,
        })
      }

      for (const r of props.borderCrossingRecords) {
        if (!isValidGeo(r.gnssPlaceAuthRecord?.geoCoordinates)) continue
        all.push({
          lat: r.gnssPlaceAuthRecord.geoCoordinates.latitude,
          lng: r.gnssPlaceAuthRecord.geoCoordinates.longitude,
          time: r.gnssPlaceAuthRecord.timeStamp,
          kind: 'border',
          color: '#e040fb',
          radius: 7,
          info: `${r.countryLeft} → ${r.countryEntered}`,
          odometer: r.vehicleOdometerValue,
          popup: `<b>${r.countryLeft} → ${r.countryEntered}</b><br>${formatDateTime(r.gnssPlaceAuthRecord.timeStamp)}`,
        })
      }

      for (const r of props.loadUnloadRecords) {
        if (!isValidGeo(r.GNSSPlaceAuthRecord?.geoCoordinates)) continue
        const isLoad = r.operationType === 1
        all.push({
          lat: r.GNSSPlaceAuthRecord.geoCoordinates.latitude,
          lng: r.GNSSPlaceAuthRecord.geoCoordinates.longitude,
          time: r.timeStamp,
          kind: isLoad ? 'load' : 'unload',
          color: isLoad ? '#66bb6a' : '#ef5350',
          radius: 6,
          info: isLoad ? t('Load') : t('Unload'),
          odometer: r.vehicleOdometerValue,
          popup: `<b>${isLoad ? t('Load') : t('Unload')}</b><br>${formatDateTime(r.timeStamp)}`,
        })
      }

      return all.sort((a, b) => (a.time || 0) - (b.time || 0))
    }

    const allPoints = computed(() => collectAllPoints())

    const layers = computed(() =>
      LAYER_DEFS.value.map((d) => ({
        ...d,
        count: allPoints.value.filter((p) => p.kind === d.kind).length,
      })).filter((d) => d.count > 0),
    )

    const columns = computed(() => [
      { name: 'idx', label: '#', field: 'idx', align: 'center', style: 'width: 40px' },
      { name: 'time', label: t('Time'), field: 'timeStr', align: 'left' },
      { name: 'detail', label: t('Details'), field: 'info', align: 'left' },
      { name: 'lat', label: t('Lat'), field: 'latStr', align: 'right' },
      { name: 'lon', label: t('Lon'), field: 'lonStr', align: 'right' },
      { name: 'odometer', label: t('Odometer'), field: 'odomStr', align: 'right' },
    ])

    const visiblePoints = computed(() =>
      allPoints.value.filter((p) => !hiddenKinds.value.has(p.kind)),
    )

    const rows = computed(() =>
      visiblePoints.value.map((p, i) => ({
        id: i,
        idx: i + 1,
        kindLabel: KIND_LABELS.value[p.kind] || p.kind,
        dotColor: p.color,
        timeStr: formatDateTime(p.time),
        info: p.info || '',
        latStr: p.lat.toFixed(4),
        lonStr: p.lng.toFixed(4),
        odomStr: p.odometer != null ? p.odometer.toLocaleString() : '—',
        dayTs: p.time ? p.time - (p.time % 86400) : 0,
      })),
    )

    function onRowHover(id) {
      highlightId.value = id
      // Restyle from the point stored on each marker, not visiblePoints[i] - the
      // markers may be mid-rebuild after a legend toggle, and re-indexing into the
      // new visiblePoints would mismatch or read undefined.
      allMarkers.forEach((m) => {
        if (m._id === id) {
          m.setRadius(9)
          m.setStyle({ fillColor: '#ffeb3b', color: '#ff5722', weight: 2 })
          m.bringToFront()
        } else {
          m.setRadius(m._pt.radius)
          m.setStyle({ fillColor: m._pt.color, color: '#fff', weight: 1.5 })
        }
      })
    }

    function updateMap() {
      if (!map) return

      if (routeLine) map.removeLayer(routeLine)
      if (markersGroup) map.removeLayer(markersGroup)
      allMarkers = []

      const pts = visiblePoints.value
      if (!pts.length) return

      const latlngs = pts.map((p) => [p.lat, p.lng])
      routeLine = L.polyline(latlngs, { color: '#90a4ae', weight: 2, opacity: 0.5, dashArray: '6, 8' }).addTo(map)

      markersGroup = L.layerGroup()
      pts.forEach((p, i) => {
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: p.radius,
          fillColor: p.color,
          color: '#fff',
          weight: 1.5,
          fillOpacity: 0.9,
        })
        marker.bindTooltip(p.popup, { direction: 'top', offset: [0, -6] })
        marker._pt = p // the point this marker renders, for hover restyle
        marker._id = i // matches the table row id (both built from visiblePoints)
        marker.on('mouseover', () => { highlightId.value = i })
        marker.on('mouseout', () => { highlightId.value = -1 })
        allMarkers.push(marker)
        markersGroup.addLayer(marker)
      })
      markersGroup.addTo(map)

      map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] })
    }

    onMounted(async () => {
      await nextTick()
      if (!mapContainer.value) return

      map = L.map(mapContainer.value, { center: [52, 10], zoom: 5 })
      tileLayer = L.tileLayer(getTileUrl($q.dark.isActive), { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(map)

      addFullscreenControl(map, mapContainer.value)
      updateMap()

      resizeObserver = new ResizeObserver(() => { if (map) map.invalidateSize() })
      resizeObserver.observe(mapContainer.value)
    })

    watch(visiblePoints, updateMap)
    watch(() => $q.dark.isActive, () => {
      if (tileLayer) tileLayer.setUrl(getTileUrl($q.dark.isActive))
    })

    onBeforeUnmount(() => {
      if (resizeObserver) resizeObserver.disconnect()
      if (map) { map.remove(); map = null }
    })

    const KIND_ICONS = { GNSS: 'mdi-crosshairs-gps', Place: 'mdi-map-marker', Border: 'mdi-boom-gate-up', Load: 'mdi-package-down', Unload: 'mdi-package-up' }
    function kindIcon(label) { return KIND_ICONS[label] || 'mdi-circle-small' }

    return { mapContainer, columns, rows, highlightId, onRowHover, layers, hiddenKinds, toggleKind, kindIcon }
  },
})
</script>

<style scoped>
.gnss-panel {
  height: 100%;
  overflow: hidden;
}

.gnss-map {
  flex: 1;
  min-height: 150px;
}

.gnss-legend-bar {
  height: 28px;
  font-size: 11px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}

.legend-item.legend-hidden {
  opacity: 0.35;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.gnss-table {
  flex: 1;
  min-height: 150px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.gnss-q-table {
  flex: 1;
  min-height: 0;
}

.highlighted-row td {
  background: rgba(255, 235, 59, 0.12) !important;
}
</style>
