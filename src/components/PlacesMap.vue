<template>
  <div class="places-map" ref="mapContainer" />
</template>

<script>
import { defineComponent, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import * as topojson from 'topojson-client'
import worldTopo from 'world-atlas/countries-110m.json'
import { getTileUrl, TILE_ATTRIBUTION } from 'src/utils/geo'
import { useQuasar } from 'quasar'

// ISO 3166-1 alpha-2 -> numeric for European / tachograph-relevant countries
const A2_TO_NUM = {
  AL: '008', AD: '020', AT: '040', AZ: '031', AM: '051',
  BY: '112', BE: '056', BA: '070', BG: '100', HR: '191',
  CY: '196', CZ: '203', DK: '208', EE: '233', FI: '246',
  FR: '250', GE: '268', DE: '276', GR: '300', HU: '348',
  IS: '352', IE: '372', IT: '380', KZ: '398', KG: '417',
  LV: '428', LI: '438', LT: '440', LU: '442', MT: '470',
  MD: '498', MC: '492', ME: '499', MK: '807', NL: '528',
  NO: '578', PL: '616', PT: '620', RO: '642', RU: '643',
  SM: '674', RS: '688', SK: '703', SI: '705', ES: '724',
  SE: '752', CH: '756', TJ: '762', TM: '795', TR: '792',
  UA: '804', GB: '826', UZ: '860', VA: '336', IL: '376',
  FO: '234',
}

// Vehicle registration distinguishing signs -> ISO alpha-2
const SIGN_TO_A2 = {
  A: 'AT', AL: 'AL', AND: 'AD', AM: 'AM', AZ: 'AZ',
  B: 'BE', BG: 'BG', BIH: 'BA', BY: 'BY',
  CH: 'CH', CY: 'CY', CZ: 'CZ',
  D: 'DE', DK: 'DK',
  E: 'ES', EST: 'EE',
  F: 'FR', FIN: 'FI', FL: 'LI', FO: 'FO',
  GB: 'GB', GE: 'GE', GR: 'GR',
  H: 'HU', HR: 'HR',
  I: 'IT', IL: 'IL', IRL: 'IE', IS: 'IS',
  KS: 'XK', KZ: 'KZ',
  L: 'LU', LT: 'LT', LV: 'LV',
  M: 'MT', MD: 'MD', MK: 'MK', MNE: 'ME', MC: 'MC',
  N: 'NO', NL: 'NL',
  P: 'PT', PL: 'PL',
  RO: 'RO', RSM: 'SM', RUS: 'RU',
  S: 'SE', SK: 'SK', SLO: 'SI', SRB: 'RS',
  TR: 'TR', TJ: 'TJ', TM: 'TM',
  UA: 'UA', UK: 'GB', UZ: 'UZ',
  V: 'VA',
}

function toAlpha2(code) {
  if (!code) return null
  if (A2_TO_NUM[code]) return code
  return SIGN_TO_A2[code] || null
}

const NUM_TO_A2 = {}
for (const [a2, num] of Object.entries(A2_TO_NUM)) { NUM_TO_A2[num] = a2 }

const allGeo = topojson.feature(worldTopo, worldTopo.objects.countries)

const EUROPE_BOUNDS = [[25, -30], [75, 60]]

export default defineComponent({
  name: 'PlacesMap',
  props: {
    countries: { type: Array, required: true },
    highlightCountry: { type: String, default: null },
  },
  setup(props) {
    const $q = useQuasar()
    const mapContainer = ref(null)
    let map = null
    let tileLayer = null
    let geoLayer = null
    const layerById = {}

    function getVisitedIds() {
      const ids = new Set()
      for (const code of props.countries) {
        const a2 = toAlpha2(code)
        const num = a2 && A2_TO_NUM[a2]
        if (num) ids.add(num)
      }
      return ids
    }

    function countByA2() {
      const counts = {}
      for (const code of props.countries) {
        const a2 = toAlpha2(code)
        if (a2) counts[a2] = (counts[a2] || 0) + 1
      }
      return counts
    }

    function visitedGeo() {
      const ids = getVisitedIds()
      return {
        type: 'FeatureCollection',
        features: allGeo.features.filter((f) => ids.has(f.id)),
      }
    }

    function style() {
      return {
        fillColor: '#1976d2',
        fillOpacity: 0.5,
        color: '#90caf9',
        weight: 1,
      }
    }

    function onEachFeature(feature, layer) {
      layerById[feature.id] = layer
      const counts = countByA2()
      const a2 = NUM_TO_A2[feature.id] || ''
      const count = counts[a2] || 0
      const name = feature.properties?.name || a2
      layer.bindTooltip(`${name}: ${count} record${count !== 1 ? 's' : ''}`, { sticky: true })
      layer.on('mouseover', () => {
        layer.setStyle({ fillOpacity: 0.7, weight: 2, color: '#fff' })
      })
      layer.on('mouseout', () => {
        const ha2 = toAlpha2(props.highlightCountry)
        if (!ha2 || A2_TO_NUM[ha2] !== feature.id) {
          geoLayer?.resetStyle(layer)
        }
      })
    }

    function render() {
      if (!mapContainer.value) return
      if (map) {
        map.remove()
        map = null
      }
      map = L.map(mapContainer.value, {
        center: [50, 10],
        zoom: 4,
        minZoom: 3,
        maxBounds: EUROPE_BOUNDS,
        maxBoundsViscosity: 0.8,
        zoomControl: true,
        attributionControl: false,
      })
      tileLayer = L.tileLayer(getTileUrl($q.dark.isActive).replace('_all', '_nolabels'), {
        maxZoom: 8, attribution: TILE_ATTRIBUTION,
      }).addTo(map)
      const geo = visitedGeo()
      geoLayer = L.geoJSON(geo, { style, onEachFeature }).addTo(map)

      if (geo.features.length) {
        map.fitBounds(geoLayer.getBounds().pad(0.5), { maxZoom: 5 })
      }
    }

    function update() {
      if (!geoLayer || !map) return
      Object.keys(layerById).forEach((k) => delete layerById[k])
      geoLayer.remove()
      const geo = visitedGeo()
      geoLayer = L.geoJSON(geo, { style, onEachFeature }).addTo(map)
    }

    watch(() => $q.dark.isActive, () => {
      if (tileLayer) tileLayer.setUrl(getTileUrl($q.dark.isActive).replace('_all', '_nolabels'))
    })

    watch(() => props.countries, () => {
      if (map) update()
    })

    watch(() => props.highlightCountry, (code, prev) => {
      if (!geoLayer) return
      if (prev) {
        const pa2 = toAlpha2(prev)
        const prevId = pa2 && A2_TO_NUM[pa2]
        const prevLayer = prevId && layerById[prevId]
        if (prevLayer) geoLayer.resetStyle(prevLayer)
      }
      if (code) {
        const a2 = toAlpha2(code)
        const numId = a2 && A2_TO_NUM[a2]
        const layer = numId && layerById[numId]
        if (layer) layer.setStyle({ fillOpacity: 0.7, weight: 2, color: '#fff' })
      }
    })

    onMounted(async () => {
      await nextTick()
      render()
    })

    onBeforeUnmount(() => {
      if (map) {
        map.remove()
        map = null
      }
    })

    return { mapContainer }
  },
})
</script>

<style scoped>
.places-map {
  width: 100%;
  height: 100%;
  min-height: 180px;
}
</style>
