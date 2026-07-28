<template>
  <q-dialog v-model="show">
    <q-card style="width: 440px; max-width: 95vw">
      <q-card-section class="row items-center no-wrap q-pb-none">
        <div class="text-subtitle1 text-bold col">{{ $t('Upload DDD file') }}</div>
        <q-btn icon="mdi-close" flat round dense v-close-popup :disable="parserStore.uploading || parserStore.processing" />
      </q-card-section>

      <q-card-section>
        <!-- Drop zone -->
        <div
          v-if="!parserStore.uploading && !parserStore.processing"
          class="drop-zone"
          :class="{ 'drop-zone-active': dragging }"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
          @click="triggerInput"
        >
          <q-icon name="mdi-file-upload-outline" size="3em" color="grey-6" />
          <div class="text-caption text-grey q-mt-sm">{{ $t('Drop DDD file here or click to select') }}</div>
          <div class="text-caption text-grey-6">.ddd, .c1b, .v1b, .c2b, .v2b</div>
        </div>
        <q-btn
          v-if="!parserStore.uploading && !parserStore.processing"
          flat dense no-caps
          icon="mdi-folder-open-outline"
          :label="$t('Browse parsed files')"
          class="full-width q-mt-xs"
          @click="onBrowse"
        />

        <!-- Uploading -->
        <div v-else-if="parserStore.uploading" class="flex flex-center column q-pa-lg">
          <q-spinner-dots size="2em" color="primary" />
          <div class="text-caption text-grey q-mt-sm">{{ $t('Uploading...') }}</div>
          <div class="text-caption text-grey-6">{{ fileName }}</div>
        </div>

        <!-- Processing -->
        <div v-else-if="parserStore.processing" class="flex flex-center column q-pa-lg">
          <q-spinner-gears size="2em" color="primary" />
          <div class="text-caption text-grey q-mt-sm">{{ $t('Processing...') }}</div>
          <div class="text-caption text-grey-6">{{ fileName }}</div>
        </div>

        <!-- Error -->
        <q-banner v-if="parserStore.error" dense class="bg-negative text-white text-caption q-mt-sm" rounded>
          {{ parserStore.error }}
        </q-banner>
      </q-card-section>

      <input ref="fileInput" type="file" accept=".ddd,.c1b,.v1b,.c2b,.v2b,.tgd,.esm" style="display: none" @change="onFileSelected" />
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useParserStore } from 'src/stores/parser'
import { useAuthStore } from 'src/stores/auth'
import { useDddStore } from 'src/stores/ddd'

export default defineComponent({
  name: 'UploadDddDialog',
  emits: ['browse'],
  setup(props, { emit }) {
    const { t } = useI18n()
    const $q = useQuasar()
    const parserStore = useParserStore()
    const authStore = useAuthStore()
    const dddStore = useDddStore()

    const show = ref(false)
    const dragging = ref(false)
    const fileInput = ref(null)
    const fileName = ref('')

    function triggerInput() {
      fileInput.value?.click()
    }

    function onFileSelected(e) {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      e.target.value = ''
    }

    function onDrop(e) {
      dragging.value = false
      const file = e.dataTransfer?.files?.[0]
      if (file) processFile(file)
    }

    async function processFile(file) {
      fileName.value = file.name

      let logTopic = null
      let handled = false
      const bufferedLogs = []

      const timeout = setTimeout(() => {
        if (handled) return
        handled = true
        parserStore.processing = false
        parserStore.error = t('Processing timeout — file may still be processing on the server')
        if (logTopic) parserStore.unsubscribeLog(logTopic)
      }, 60000)

      async function handleMatch(log) {
        if (handled) return
        handled = true
        clearTimeout(timeout)
        parserStore.processing = false
        if (logTopic) parserStore.unsubscribeLog(logTopic)

        try {
          const dataParam = JSON.stringify({ uuid: log.uuid, fields: 'uuid,name,meta,content' })
          const resp = await authStore.$connector.http.get(
            `/gw/devices/${parserStore.deviceId}/media?data=${encodeURIComponent(dataParam)}`,
          )
          const result = dddStore.addData(resp.data, file.name, { deviceId: parserStore.deviceId })
          if (result.error) {
            $q.notify({ type: 'negative', message: t(result.error) })
          } else {
            if (result.warning) $q.notify({ type: 'warning', message: t(result.warning) })
            show.value = false
          }
        } catch (e) {
          $q.notify({ type: 'negative', message: `Failed to load parsed file: ${e.message}` })
        }
      }

      logTopic = await parserStore.subscribeLog((log) => {
        if (parserStore.waitingUuid) {
          if (log.uuid === parserStore.waitingUuid) handleMatch(log)
        } else {
          bufferedLogs.push(log)
        }
      })

      const uploadResult = await parserStore.upload(file)
      if (uploadResult.error) {
        handled = true
        clearTimeout(timeout)
        if (logTopic) parserStore.unsubscribeLog(logTopic)
        return
      }

      const match = bufferedLogs.find((log) => log.uuid === parserStore.waitingUuid)
      if (match) handleMatch(match)
    }

    function open() {
      show.value = true
      dragging.value = false
      fileName.value = ''
      parserStore.uploading = false
      parserStore.processing = false
      parserStore.error = null
    }

    function onBrowse() {
      show.value = false
      emit('browse', parserStore.deviceId)
    }

    return { show, dragging, fileInput, fileName, parserStore, triggerInput, onFileSelected, onDrop, open, onBrowse }
  },
})
</script>

<style scoped>
.drop-zone {
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.drop-zone:hover,
.drop-zone-active {
  border-color: var(--q-primary);
  background: rgba(var(--q-primary-rgb), 0.05);
}

.body--light .drop-zone {
  border-color: rgba(0, 0, 0, 0.15);
}

.body--light .drop-zone:hover,
.body--light .drop-zone-active {
  border-color: var(--q-primary);
  background: rgba(var(--q-primary-rgb), 0.05);
}
</style>
