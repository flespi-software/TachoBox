import L from 'leaflet'

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// OSM tiles repainted to grayscale on a canvas before display; the dark theme
// inverts the luminance. Drawing into the tile canvas (instead of swapping the
// img src for a data URL) avoids a flash of the original colors.
const GrayTileLayer = L.TileLayer.extend({
  options: {
    dark: false,
    quotaRed: 3,
    quotaGreen: 4,
    quotaBlue: 3,
    quotaDividerTune: 1,
  },

  createTile(coords, done) {
    const tile = document.createElement('canvas')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this._paint(tile, img)
      done(null, tile)
    }
    img.onerror = (err) => done(err, tile)
    img.src = this.getTileUrl(coords)
    return tile
  },

  _paint(canvas, img) {
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const imgd = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const pix = imgd.data
    const { quotaRed: r, quotaGreen: g, quotaBlue: b, quotaDividerTune, dark } = this.options
    const divider = r + g + b + quotaDividerTune
    for (let i = 0, n = pix.length; i < n; i += 4) {
      const gray = (r * pix[i] + g * pix[i + 1] + b * pix[i + 2]) / divider
      pix[i] = pix[i + 1] = pix[i + 2] = dark ? 0xff - gray : gray
    }
    ctx.putImageData(imgd, 0, 0)
  },

  // setUrl() does not redraw for an unchanged url, so the theme needs its own
  setDark(dark) {
    if (this.options.dark === dark) return this
    this.options.dark = dark
    return this.redraw()
  },
})

export function createTileLayer(dark, options = {}) {
  return new GrayTileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION, ...options, dark })
}
