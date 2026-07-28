import { defineStore, acceptHMRUpdate } from 'pinia'
import { SessionStorage } from 'quasar'
import { useMiscStore } from './misc'

// MQTT CONNACK reason codes that mean the flespi token is no longer valid
// (not authorized / bad credentials / banned) - on these we log the user out.
const TOKEN_INVALID_CODES = [134, 135, 138]

export const useAuthStore = defineStore('auth', {
  /* this.$connector and this.$region is already attached by boot/flespi-io.js */

  state: () => ({
    // MQTT socket connected flag; initially undefined so the "Offline" badge doesn't flash on reload (F5)
    socketConnected: undefined,
    token: '',
  }),
  getters: {},
  actions: {
    setSocketConnected(connected) {
      this.socketConnected = connected
    },
    async setToken(token) {
      /* setup mqtt handlers */
      await this.$connector.socket.off('connect')
      await this.$connector.socket.on('connect', () => {
        this.setSocketConnected(true)
      })

      this.$connector.socket.off('error')
      this.$connector.socket.on('error', (e) => {
        if (e && TOKEN_INVALID_CODES.includes(e.code)) {
          this.clearToken()
        } else {
          this.setSocketConnected(false)
        }
      })
      this.$connector.socket.off('close')
      this.$connector.socket.on('close', () => {
        this.setSocketConnected(false)
      })
      this.$connector.socket.off('disconnect')
      this.$connector.socket.on('disconnect', () => {
        this.setSocketConnected(false)
      })
      this.$connector.socket.off('end')
      this.$connector.socket.on('end', () => {
        this.setSocketConnected()
      })

      /* check if the token is valid */
      if (!token || token.length === 0 || token === 'FlespiToken ') {
        this.clearToken()
        return
      }
      let tokenHash = token.replace('FlespiToken ', '')
      if (!tokenHash.match(/^[a-z0-9]+$/i)) {
        this.clearToken()
        return
      }

      /* set token to mqtt connector */
      this.$connector.token = `FlespiToken ${tokenHash}`
      /* store token for internal usage */
      this.token = tokenHash
      /* store token into session storage so that after F5 auto-login may occur */
      useMiscStore().setToStore({ store: SessionStorage, name: 'token', value: this.token })
    },

    clearToken() {
      /* clears flespi token and application stops connecting over MQTT */
      useMiscStore().setToStore({ store: SessionStorage, name: 'token', value: null })
      this.$connector.token = ''
      this.token = ''
      this.setSocketConnected()
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
}
