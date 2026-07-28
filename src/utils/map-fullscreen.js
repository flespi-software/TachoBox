import L from 'leaflet'

export function addFullscreenControl(map, container) {
  const control = L.control({ position: 'topleft' })

  control.onAdd = () => {
    const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-fullscreen-control')
    // &#9974; = U+26F6 SQUARE FOUR CORNERS, as an entity to keep the source ASCII
    btn.innerHTML = '<a href="#" title="Fullscreen">&#9974;</a>'
    btn.style.cursor = 'pointer'

    L.DomEvent.disableClickPropagation(btn)
    L.DomEvent.on(btn, 'click', (e) => {
      L.DomEvent.preventDefault(e)
      const el = container
      if (!el) return

      if (el.classList.contains('map-fullscreen')) {
        el.classList.remove('map-fullscreen')
        btn.querySelector('a').title = 'Fullscreen'
      } else {
        el.classList.add('map-fullscreen')
        btn.querySelector('a').title = 'Exit fullscreen'
      }

      setTimeout(() => map.invalidateSize(), 200)
    })

    return btn
  }

  control.addTo(map)
}
