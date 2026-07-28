<template>
  <q-btn
    v-if="!$route.params.token && !token"
    icon="mdi-account-circle"
    label="login"
    color="red-7"
    no-caps
    class="login-btn"
    @click="openLoginRegisterWindow(`${host}/login/#/providers`)"
  />
  <q-btn
    v-else-if="!$route.params.token && token"
    no-caps
    color="green-8"
    icon-right="mdi-logout"
    label="Logout"
    class="login-btn"
    @click="logout"
  />
  <q-circular-progress v-else indeterminate color="positive" class="login-btn" />
</template>

<script>
import { defineComponent } from 'vue'
import { mapActions, mapState } from 'pinia'
import { useAuthStore } from '../../stores/auth'
import { useMiscStore } from '../../stores/misc'

export default defineComponent({
  name: 'LoginButton',
  data() {
    return {}
  },
  computed: {
    ...mapState(useAuthStore, {
      host: function (store) {
        if (store.$region && store.$region.rest) {
          /* store.$region is to be already set in boot/flespi-io.js */
          return store.$region.rest
        } else {
          return window.location.hostname === 'localhost'
            ? 'https://localhost:9005'
            : 'https://flespi.io'
        }
      },
      token: (store) => store.token,
    }),
  },
  methods: {
    ...mapActions(useAuthStore, ['clearToken', 'setToken']),
    ...mapActions(useMiscStore, ['getFromStore']),
    logout() {
      this.clearToken()
    },
    openLoginRegisterWindow(url, title) {
      title = title || 'auth'
      const w = 500,
        h = 600
      const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : screen.left
      const dualScreenTop = window.screenTop !== undefined ? window.screenTop : screen.top

      const width = window.innerWidth
        ? window.innerWidth
        : document.documentElement.clientWidth
          ? document.documentElement.clientWidth
          : screen.width
      const height = window.innerHeight
        ? window.innerHeight
        : document.documentElement.clientHeight
          ? document.documentElement.clientHeight
          : screen.height

      const left = width / 2 - w / 2 + dualScreenLeft
      const top = height / 2 - h / 2 + dualScreenTop
      const newWindow = window.open(
        url,
        title,
        'toolbar=no,location=no,status=yes,resizable=yes,scrollbars=yes, width=' +
          w +
          ', height=' +
          h +
          ', top=' +
          top +
          ', left=' +
          left,
      )

      // Puts focus on the newWindow
      if (window.focus) {
        newWindow.focus()
      }
    },
  },
  watch: {
    $route(route) {
      if (route.params && route.params.token) {
        this.setToken(this.$route.params.token).then(() => {
          this.$nextTick(() => {
            this.$router.push('/')
          })
        })
      }
    },
  },
  created() {
    // Always listen for a token posted from the login/register popup - this must
    // be attached on every mount, independent of the auto-login paths below.
    // (Previously it sat after early returns, so after an auto-login from URL or
    // session storage the listener was never added and re-login via the popup
    // silently did nothing.)
    /*
    event.data format:
    FlespiLogin|token:{"token":"...","region":{...}}
    */
    this._tokenHandler = (event) => {
      if (typeof event.data === 'string' && ~event.data.indexOf('FlespiLogin|token:')) {
        const payload = JSON.parse(event.data.replace('FlespiLogin|token:', ''))
        this.setToken(payload.token).then(() => {
          this.$nextTick(() => {
            this.$router.push('/')
          })
        })
      }
    }
    window.addEventListener('message', this._tokenHandler)

    // first try to login with the token that is passed in URL, if any
    if (this.$route.params && this.$route.params.token) {
      const nextPath = this.$route.params.devices ? '/devices/' + this.$route.params.devices : '/'
      this.setToken(this.$route.params.token).then(() => {
        this.$nextTick(() => {
          this.$router.push(nextPath)
        })
      })
      return
    }
    // second try to login with the token stored in session storage, if any
    const sessionStorageToken = this.getFromStore({ store: this.$q.sessionStorage, name: 'token' })
    if (sessionStorageToken) {
      this.setToken(sessionStorageToken).then(() => {
        this.$nextTick(() => {
          this.$router.push('/')
        })
      })
    }
  },
  beforeUnmount() {
    if (this._tokenHandler) window.removeEventListener('message', this._tokenHandler)
  },
})
</script>

<style lang="sass">
.login-btn
  width: 100%
  height: 100%
  border-radius: 0 !important
  text-transform: uppercase

.row__wrapper
  height: 80px
.login-page
  .login-github-link
    position: absolute
    top: 0
    right: 0
    border: 0
    width: 149px
    height: 149px
  .login-back
    width: 100%
    height: 50vh
    overflow: hidden
    font-size: 8vmax
    background-position: center 100px
    background-size: contain
    background-repeat: no-repeat
    background-color: #333
    color: rgba(255,255,255,0.9)
    .login-code
      height: 50vh
      width: 80vw
      max-width: 600px
      background-position: center
      background-size: contain
      background-repeat: no-repeat
      opacity: .8
      padding-top: 20vh
      font-size: 80%
  .login-card
    border-radius: 2px
    margin-top: -50px
    width: 80vw
    max-width: 600px
    padding: 25px
    > i
      font-size: 5rem
</style>
