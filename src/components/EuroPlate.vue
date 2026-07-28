<template>
  <span class="euro-plate" :class="{ 'euro-plate--eu': isEu }">
    <span v-if="isEu" class="euro-plate__band">
      <span class="euro-plate__stars"></span>
      <span class="euro-plate__country">{{ countryCode }}</span>
    </span>
    <span class="euro-plate__number">{{ number }}</span>
  </span>
</template>

<script>
import { defineComponent, computed } from 'vue'

// NationNumeric -> ISO 3166-1 alpha country code for EU plate band
const NATION_TO_CODE = {
  1: 'A', 2: 'AL', 3: 'AND', 4: 'AM', 5: 'AZ',
  6: 'B', 7: 'BG', 8: 'BIH', 9: 'BY', 10: 'CH',
  11: 'CY', 12: 'CZ', 13: 'D', 14: 'DK', 15: 'E',
  16: 'EST', 17: 'F', 18: 'FIN', 19: 'FL', 20: 'FO',
  21: 'GB', 22: 'GE', 23: 'GR', 24: 'H', 25: 'HR',
  26: 'I', 27: 'IRL', 28: 'IS', 29: 'KZ', 30: 'L',
  31: 'LT', 32: 'LV', 33: 'M', 34: 'MC', 35: 'MD',
  36: 'NMK', 37: 'N', 38: 'NL', 39: 'P', 40: 'PL',
  41: 'RO', 42: 'RSM', 43: 'RUS', 44: 'S', 45: 'SK',
  46: 'SLO', 47: 'TM', 48: 'TR', 49: 'UA', 50: 'V',
  52: 'MNE', 53: 'SRB',
}

// String country codes -> plate code (when nation comes as string instead of number)
const STR_TO_CODE = {
  A: 'A', AL: 'AL', AND: 'AND', AM: 'AM', AZ: 'AZ',
  B: 'B', BG: 'BG', BIH: 'BIH', BY: 'BY', CH: 'CH',
  CY: 'CY', CZ: 'CZ', D: 'D', DK: 'DK', E: 'E',
  EST: 'EST', F: 'F', FIN: 'FIN', FL: 'FL', FO: 'FO',
  GB: 'GB', GE: 'GE', GR: 'GR', H: 'H', HR: 'HR',
  I: 'I', IRL: 'IRL', IS: 'IS', KZ: 'KZ', L: 'L',
  LT: 'LT', LV: 'LV', M: 'M', MC: 'MC', MD: 'MD',
  NMK: 'NMK', N: 'N', NL: 'NL', P: 'P', PL: 'PL',
  RO: 'RO', RSM: 'RSM', RUS: 'RUS', S: 'S', SK: 'SK',
  SLO: 'SLO', TM: 'TM', TR: 'TR', UA: 'UA', V: 'V',
  MNE: 'MNE', SRB: 'SRB',
}

// EU/EEA member states that use the blue EU band
const EU_NATIONS = new Set([
  1, 6, 7, 11, 12, 13, 14, 15, 16, 17, 18,
  23, 24, 25, 26, 27, 30, 31, 32, 33, 38, 39, 40, 41,
  44, 45, 46, // EU members
  28, 37, 19, // EEA: Iceland, Norway, Liechtenstein
])

const EU_STR = new Set([
  'A', 'B', 'BG', 'CY', 'CZ', 'D', 'DK', 'E', 'EST', 'F', 'FIN',
  'GR', 'H', 'HR', 'I', 'IRL', 'L', 'LT', 'LV', 'M', 'NL', 'P', 'PL', 'RO',
  'S', 'SK', 'SLO', // EU
  'IS', 'N', 'FL', // EEA
])

export default defineComponent({
  name: 'EuroPlate',
  props: {
    number: { type: String, default: '' },
    nation: { type: [Number, String], default: null },
  },
  setup(props) {
    const isEu = computed(() => {
      const n = props.nation
      if (n === null || n === undefined || n === '') return false
      if (typeof n === 'string' && isNaN(n)) return EU_STR.has(n.toUpperCase())
      return EU_NATIONS.has(Number(n))
    })

    const countryCode = computed(() => {
      const n = props.nation
      if (n === null || n === undefined || n === '') return ''
      if (typeof n === 'string' && isNaN(n)) return STR_TO_CODE[n.toUpperCase()] || n.toUpperCase()
      return NATION_TO_CODE[Number(n)] || ''
    })

    return { isEu, countryCode }
  },
})
</script>

<style scoped>
.euro-plate {
  display: inline-flex;
  align-items: stretch;
  font-family: 'Arial Narrow', Arial, sans-serif;
  font-weight: bold;
  font-size: 13px;
  letter-spacing: 1px;
  border-radius: 3px;
  overflow: hidden;
  vertical-align: middle;
  line-height: 1;
}

.euro-plate--eu {
  border: 1.5px solid #222;
}

.euro-plate:not(.euro-plate--eu) {
  border: 1.5px solid #444;
}

.euro-plate__band {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #003399;
  color: #fff;
  padding: 1px 2px;
  min-width: 14px;
}

.euro-plate__stars {
  width: 8px;
  height: 8px;
  border: 1.5px dotted #fc0;
  border-radius: 50%;
}

.euro-plate__country {
  font-size: 7px;
  font-weight: normal;
  line-height: 1;
  color: #fff;
}

.euro-plate__number {
  padding: 2px 6px;
  background: #fff;
  color: #111;
  white-space: nowrap;
}
</style>
