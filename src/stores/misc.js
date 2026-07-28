import { defineStore, acceptHMRUpdate } from 'pinia'

export const useMiscStore = defineStore('misc', {
  state: () => ({
    // application-wide namespace for browser storage (session/local)
    storageNamespace: 'flespi-' + __APP_NAME__,
  }),
  actions: {
    getFromStore({ store, name }) {
      const data = store.getItem(this.storageNamespace)
      return data && data[name]
    },
    setToStore({ store, name, value }) {
      let data = store.getItem(this.storageNamespace)
      if (!data) {
        data = {}
      }
      if (value) {
        data[name] = value
      } else {
        delete data[name]
      }
      store.set(this.storageNamespace, data)
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMiscStore, import.meta.hot))
}
