import { defineStore } from 'pinia'

const TOPIC = 'xflespifront/tachobox/deviceparser'

export const useParserStore = defineStore('parser', {
  state: () => ({
    deviceId: null,
    deviceName: '',
    uploading: false,
    processing: false,
    waitingUuid: null,
    error: null,
  }),
  actions: {
    async subscribe() {
      const that = this
      await this.$connector.socket.subscribe({
        name: TOPIC,
        handler(message) {
          try {
            const data = JSON.parse(message)
            if (data.deviceId) {
              that.deviceId = data.deviceId
              that.deviceName = data.deviceName || ''
            }
          } catch { /* ignore invalid payload */ }
        },
      })
    },

    async unsubscribe() {
      await this.$connector.socket.unsubscribe(TOPIC)
      this.deviceId = null
      this.deviceName = ''
    },

    async save(deviceId, deviceName) {
      this.deviceId = deviceId
      this.deviceName = deviceName
      await this.$connector.socket.publish(TOPIC, JSON.stringify({ deviceId, deviceName }), { retain: true })
    },

    async clear() {
      this.deviceId = null
      this.deviceName = ''
      await this.$connector.socket.publish(TOPIC, '', { retain: true })
    },

    async upload(file, deviceId) {
      const devId = deviceId || this.deviceId
      if (!devId) return { error: 'No parser device configured' }
      this.uploading = true
      this.processing = false
      this.error = null
      this.waitingUuid = null

      try {
        const formData = new FormData()
        formData.append('file', file, file.name)
        formData.append('data', JSON.stringify({ type: 'tacho' }))
        const resp = await this.$connector.http.post(
          `/gw/devices/${devId}/media`,
          formData,
        )
        const uploaded = resp.data?.result?.[0]
        if (!uploaded?.uuid) throw new Error('Upload failed — no UUID returned')
        this.waitingUuid = uploaded.uuid
        this.uploading = false
        this.processing = true
        return { uuid: uploaded.uuid }
      } catch (e) {
        this.uploading = false
        this.error = e.message
        return { error: e.message }
      }
    },

    async subscribeLog(callback, deviceId) {
      const devId = deviceId || this.deviceId
      const topic = `flespi/log/gw/devices/${devId}/media_file_updated`
      await this.$connector.socket.subscribe({
        name: topic,
        handler(message) {
          try {
            const log = JSON.parse(message)
            if (log.event_code === 25 && log.uuid) {
              callback(log)
            }
          } catch { /* ignore */ }
        },
      })
      return topic
    },

    async unsubscribeLog(topic) {
      await this.$connector.socket.unsubscribe(topic)
    },
  },
})
