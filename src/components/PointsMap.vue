<template>
  <div class="points-map" ref="mapContainer" />
</template>

<script>
import { defineComponent, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getTileUrl, TILE_ATTRIBUTION } from 'src/utils/geo'
import { formatDateTime } from 'src/utils/format'
import { useQuasar } from 'quasar'

export default defineComponent({
  name: 'PointsMap',
  props: {
    points: { type: Array, required: true },
    highlightIndex: { type: Number, default: -1 },
  },
  setup(props) {
    const $q = useQuasar()
    const mapContainer = ref(null)
    let map = null
    let tileLayer = null
    let markersGroup = null
    let routeLine = null
    let markers = []
    let resizeObserver = null

    function updateMap() {
      if (!map) return
      if (markersGroup) map.removeLayer(markersGroup)
      if (routeLine) map.removeLayer(routeLine)
      markers = []

      const pts = props.points.filter((p) => p.lat && p.lng && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
      if (!pts.length) return

      const latlngs = pts.map((p) => [p.lat, p.lng])
      routeLine = L.polyline(latlngs, { color: '#90a4ae', weight: 2, opacity: 0.5, dashArray: '4, 6' }).addTo(map)

      markersGroup = L.layerGroup()
      pts.forEach((p) => {
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: 6,
          fillColor: p.color || '#1976d2',
          color: '#fff',
          weight: 2,
          fillOpacity: 0.9,
        })
        marker.bindPopup(p.popup || formatDateTime(p.time))
        markers.push(marker)
        markersGroup.addLayer(marker)
      })
      markersGroup.addTo(map)
      map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] })
    }

    // `points` is rebuilt as a fresh array on every change, so a shallow ref
    // watch already fires - a deep watch would just re-traverse every point.
    watch(() => props.points, updateMap)
    watch(() => $q.dark.isActive, () => {
      if (tileLayer) tileLayer.setUrl(getTileUrl($q.dark.isActive))
    })
    watch(() => props.highlightIndex, (idx) => {
      markers.forEach((m, i) => {
        if (i === idx) {
          m.setRadius(9)
          m.setStyle({ fillColor: '#ffeb3b', color: '#ff5722', weight: 2 })
          m.bringToFront()
        } else {
          const p = props.points[i]
          m.setRadius(6)
          m.setStyle({ fillColor: p?.color || '#1976d2', color: '#fff', weight: 2 })
        }
      })
    })

    onMounted(async () => {
      await nextTick()
      if (!mapContainer.value) return
      map = L.map(mapContainer.value, { center: [50, 10], zoom: 5, attributionControl: false })
      tileLayer = L.tileLayer(getTileUrl($q.dark.isActive), { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(map)
      updateMap()
      resizeObserver = new ResizeObserver(() => { if (map) map.invalidateSize() })
      resizeObserver.observe(mapContainer.value)
    })

    onBeforeUnmount(() => {
      if (resizeObserver) resizeObserver.disconnect()
      if (map) { map.remove(); map = null }
    })

    return { mapContainer }
  },
})
</script>

<style scoped>
.points-map {
  width: 100%;
  height: 100%;
  min-height: 150px;
}
</style>
