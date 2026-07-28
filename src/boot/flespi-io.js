import ConnectionPlugin from 'flespi-io-js/dist/vue3-plugin'
import { boot } from 'quasar/wrappers'
import axios from 'axios'

async function fetchRegions() {
  const host =
    window.location.hostname.indexOf('flespi.io') > -1
      ? window.location.hostname
      : window.location.hostname + ':9005'
  try {
    return await axios.get(`https://${host}/auth/regions`, {})
  } catch {
    return await axios.get('https://flespi.io/auth/regions', {})
  }
}

async function getRegion() {
  let api, attempts = 0
  while (!api) {
    try {
      api = await fetchRegions()
    } catch {
      if (++attempts >= 5) throw new Error('Failed to fetch flespi regions')
      await new Promise((r) => setTimeout(r, 2000 * attempts))
    }
  }
  const list = []
  let region = ''
  const regions =
    api.data.result &&
    api.data.result.reduce((a, b) => {
      a[b.name || b.region] = b
      list.push({ label: b.name || b.region, value: b.name || b.region, sublabel: b.rest })
      if (b.default && !region) {
        region = b.name || b.region
      }
      return a
    }, {})
  if (!region) {
    region = list[0] && list[0].value
  }
  return regions[region]
}

export default boot(async ({ app, store }) => {
  const path = window.location.hash.split('/')
  let pkgname = __APP_NAME__
  if (path[path.length - 1] === 'support') {
    pkgname = 'support-' + pkgname
  }
  const appident = `${pkgname}-${__APP_VERSION__}${window.location.hostname === 'localhost' ? 'test' : ''}-${Math.random().toString(16).substring(2, 10)}`
  const currentRegion = await getRegion()
  const connectionConfig = {
    httpConfig: { server: currentRegion.rest, headers: { 'x-flespi-app': appident } },
    socketConfig: {
      server: `wss://${currentRegion['mqtt-ws']}`,
      clientId: appident,
      mqttSettings: {
        protocolVersion: 5,
        clean: true,
        wsOptions: { objectMode: false, perMessageDeflate: true },
        resubscribe: false,
        keepalive: 240,
      },
    },
  }
  // properties: { sessionExpiryInterval: 300 },

  app.use(ConnectionPlugin, connectionConfig)
  store.use(() => ({ $connector: app.config.globalProperties.$connector, $region: currentRegion }))

  if (window) {
    window.addEventListener('beforeunload', () => {
      app.config.globalProperties.$connector.socket.close(true)
    })
  }
})
