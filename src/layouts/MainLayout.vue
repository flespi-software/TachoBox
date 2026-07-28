<template>
  <q-layout view="lHh Lpr lFf">
    <q-header v-if="!hidePanels" elevated>
      <q-toolbar>
        <q-btn flat dense round icon="mdi-menu" aria-label="Menu" @click="toggleLeftDrawer" />
        <q-toolbar-title v-if="!whiteLabel">
          {{ product }} <sup>{{ version }}</sup>
        </q-toolbar-title>
        <q-space v-else />

        <q-btn flat dense round :icon="$q.dark.isActive ? 'mdi-weather-night' : 'mdi-weather-sunny'" @click="toggleDark">
          <q-tooltip>{{ $q.dark.isActive ? $t('Light mode') : $t('Dark mode') }}</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-if="!hidePanels" v-model="leftDrawerOpen" show-if-above bordered>
      <div class="drawer-login">
        <LoginButton />
      </div>
      <q-list>
        <q-item-label header>{{ $t('Data Sources') }}</q-item-label>

        <q-item v-if="authStore.token" clickable @click="openApiDialog">
          <q-item-section avatar><q-icon name="mdi-cloud-download-outline" /></q-item-section>
          <q-item-section>{{ $t('Add device') }}</q-item-section>
        </q-item>

        <!-- Selected devices with loaded files -->
        <template v-for="dev in selectedDevices" :key="dev.id">
          <q-separator class="q-my-xs" />
          <q-item dense clickable @click="openDeviceFiles(dev)">
            <q-item-section avatar style="min-width: 24px; padding-right: 8px">
              <q-icon name="mdi-developer-board" size="xs" class="text-green" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-caption ellipsis text-bold">{{ dev.name }}</q-item-label>
              <q-item-label caption>{{ dev.ident || 'ID: ' + dev.id }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn flat dense round size="xs" icon="mdi-close" @click.stop="removeDevice(dev.id)">
                <q-tooltip>{{ $t('Remove') }}</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
          <!-- Files loaded from this device -->
          <SourceListItem
            v-for="(src, i) in deviceSources(dev.id)"
            :key="'d' + dev.id + 's' + i"
            :src="src"
            indent
            @toggle="onToggleSource"
            @save="saveSourceJson"
            @download="saveSourceDdd"
            @remove="dddStore.removeSource"
          />
        </template>

        <!-- Upload DDD -->
        <template v-if="authStore.token && !noUpload">
          <q-separator class="q-my-sm" />
          <q-item clickable @click="onUploadDddClick">
            <q-item-section avatar><q-icon name="mdi-file-upload-outline" /></q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('Upload DDD file') }}</q-item-label>
              <q-item-label v-if="parserStore.deviceName" caption>{{ parserStore.deviceName }}</q-item-label>
            </q-item-section>
            <q-item-section v-if="parserStore.deviceId" side>
              <q-btn flat dense round size="xs" icon="mdi-close" @click.stop="parserStore.clear()">
                <q-tooltip>{{ $t('Remove') }}</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
          <SourceListItem
            v-for="src in parserSources"
            :key="'p' + src.index"
            :src="src"
            indent
            @toggle="onToggleSource"
            @save="saveSourceJson"
            @download="saveSourceDdd"
            @remove="dddStore.removeSource"
          />
        </template>

        <!-- Local files -->
        <q-separator class="q-my-sm" />
        <q-item clickable @click="triggerFileInput">
          <q-item-section avatar><q-icon name="mdi-code-json" /></q-item-section>
          <q-item-section>{{ $t('Load JSON files') }}</q-item-section>
        </q-item>
        <q-expansion-item
          icon="mdi-flask-outline"
          :label="$t('Demo data')"
          dense
          header-class="text-grey"
        >
          <q-item clickable dense @click="loadExample" class="q-pl-lg">
            <q-item-section avatar><q-icon name="mdi-card-account-details-outline" size="sm" /></q-item-section>
            <q-item-section>{{ $t('Driver card') }}</q-item-section>
          </q-item>
          <q-item clickable dense @click="loadExampleVu" class="q-pl-lg">
            <q-item-section avatar><q-icon name="mdi-chip" size="sm" /></q-item-section>
            <q-item-section>{{ $t('Vehicle unit') }}</q-item-section>
          </q-item>
        </q-expansion-item>
        <template v-if="localSources.length">
          <q-item-label header class="row items-center justify-between">
            <span>{{ $t('Local Files') }}</span>
            <q-btn flat dense size="sm" icon="mdi-delete-outline" @click="clearLocalSources">
              <q-tooltip>{{ $t('Clear local files') }}</q-tooltip>
            </q-btn>
          </q-item-label>

          <SourceListItem
            v-for="src in localSources"
            :key="'l' + src.index"
            :src="src"
            @toggle="onToggleSource"
            @save="saveSourceJson"
            @download="saveSourceDdd"
            @remove="dddStore.removeSource"
          />
        </template>


      </q-list>

      <div class="drawer-bottom">
        <q-separator />
        <q-item clickable @click="settingsDialog = true">
          <q-item-section avatar><q-icon name="mdi-cog-outline" /></q-item-section>
          <q-item-section>{{ $t('Settings') }}</q-item-section>
        </q-item>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept=".json"
        multiple
        style="display: none"
        @change="onFilesSelected"
      />
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- API Browser Dialog -->
    <q-dialog v-model="apiDialog" position="standard" :persistent="hidePanels" :no-esc-dismiss="hidePanels" :no-backdrop-dismiss="hidePanels">
      <q-card class="api-browser-card">
        <q-card-section class="row items-center no-wrap q-pb-none">
          <q-btn v-if="apiStep !== 'devices' && apiFromDeviceList && !hidePanels" flat dense round icon="mdi-arrow-left" @click="goBackToDevices" class="q-mr-xs flex-shrink-0" :disable="parserStore.uploading || parserStore.processing" />
          <div class="text-subtitle1 text-bold ellipsis col">{{ apiStep === 'devices' ? $t('Select Device') : selectedDeviceName }}</div>
          <q-btn v-if="!hidePanels" icon="mdi-close" flat round dense v-close-popup class="flex-shrink-0" :disable="parserStore.uploading || parserStore.processing" />
        </q-card-section>
        <q-tabs
          v-if="apiStep !== 'devices' && !noUpload"
          v-model="apiStep"
          dense no-caps
          class="text-grey-7"
          active-color="orange"
          indicator-color="orange"
          narrow-indicator
          :disable="parserStore.uploading || parserStore.processing"
          @update:model-value="onApiStepChange"
        >
          <q-tab name="files" icon="mdi-folder-open-outline" :label="$t('Files')" />
          <q-tab name="upload" icon="mdi-file-upload-outline" :label="$t('Upload')" />
        </q-tabs>

        <q-card-section class="api-browser-body">
          <!-- Step 1: Devices -->
          <template v-if="apiStep === 'devices'">
            <q-input
              v-model="deviceFilter"
              dense
              outlined
              :placeholder="$t('Filter devices...')"
              class="q-mb-sm"
              clearable
            >
              <template #prepend><q-icon name="mdi-magnify" size="xs" /></template>
            </q-input>
            <div v-if="devicesLoading" class="flex flex-center q-pa-lg">
              <q-spinner size="2em" />
            </div>
            <q-list v-else-if="filteredDevices.length" dense separator>
              <q-item
                v-for="dev in filteredDevices"
                :key="dev.id"
                clickable
                @click="selectDevice(dev)"
              >
                <q-item-section avatar style="min-width: 24px; padding-right: 8px">
                  <q-icon name="mdi-developer-board" size="xs" :class="dev.connected ? 'text-green' : 'text-grey'" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ dev.name }}</q-item-label>
                  <q-item-label caption>ID: {{ dev.id }} · {{ dev.ident || $t('no ident') }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-icon name="mdi-chevron-right" size="xs" />
                </q-item-section>
              </q-item>
            </q-list>
            <div v-else class="text-caption text-grey text-center q-pa-md">{{ $t('No devices found') }}</div>
          </template>

          <!-- Step 2: Files -->
          <template v-if="apiStep === 'files'">
            <q-input
              v-if="deviceFiles.length"
              v-model="fileFilter"
              dense
              outlined
              :placeholder="$t('Filter files...')"
              class="q-mb-sm"
              clearable
            >
              <template #prepend><q-icon name="mdi-magnify" size="xs" /></template>
            </q-input>
            <div v-if="filesLoading" class="flex flex-center q-pa-lg">
              <q-spinner size="2em" />
            </div>
            <!-- Virtualized: a device can accumulate hundreds of files, and the
                 whole list arrives in one response (the media API has no paging). -->
            <q-virtual-scroll
              v-else-if="filteredFiles.length"
              :items="filteredFiles"
              scroll-target=".api-browser-body"
              separator
              v-slot="{ item: file }"
            >
              <q-item
                :key="file.uuid"
                dense
                clickable
                class="file-item"
                @click="loadFile(file)"
                :disable="file.loading"
              >
                <q-item-section avatar style="min-width: 24px; padding-right: 8px">
                  <q-icon :name="file.icon" size="xs" :class="file.typeColor" />
                </q-item-section>
                <!-- Native title rather than QTooltip: a popup following the
                     pointer down a long file list is more noise than help. -->
                <q-item-section :title="file.tooltip">
                  <q-item-label class="ellipsis">{{ fileLabel(file) }}</q-item-label>
                  <q-item-label v-if="file.idCaption" caption class="ellipsis">{{ file.idCaption }}</q-item-label>
                </q-item-section>
                <q-item-section v-if="file.meta?.plate_number && settingsStore.fileDisplayMode === 'meta'" side>
                  <EuroPlate :number="file.meta.plate_number" :nation="file.meta.region" />
                </q-item-section>
                <q-item-section side class="items-end file-added">
                  <div v-if="file.createdStr" class="text-caption text-grey">{{ file.createdStr }}</div>
                  <div v-if="file.sizeStr" class="text-caption text-grey-6">{{ file.sizeStr }}</div>
                </q-item-section>
                <q-item-section side class="file-actions q-gutter-x-xs">
                  <q-btn
                    flat dense round size="sm"
                    class="file-download"
                    icon="mdi-download"
                    :title="$t('Download original file')"
                    :loading="file.downloading"
                    @click.stop="downloadDdd(file)"
                  />
                  <q-spinner v-if="file.loading" size="xs" />
                  <q-icon v-else-if="file.loaded" name="mdi-check" size="xs" class="text-green" />
                  <q-icon v-else name="mdi-file-import-outline" size="xs" />
                </q-item-section>
              </q-item>
            </q-virtual-scroll>
            <div v-else class="text-caption text-grey text-center q-pa-md">
              {{ deviceFiles.length ? $t('No files match the filter') : $t('No DDD files found for this device') }}
            </div>
          </template>

          <!-- Step 3: Upload -->
          <template v-if="apiStep === 'upload'">
            <div
              v-if="!parserStore.uploading && !parserStore.processing"
              class="drop-zone"
              :class="{ 'drop-zone-active': uploadDragging }"
              @dragover.prevent="uploadDragging = true"
              @dragleave.prevent="uploadDragging = false"
              @drop.prevent="onUploadDrop"
              @click="uploadInputRef?.click()"
            >
              <q-icon name="mdi-file-upload-outline" size="3em" color="grey-6" />
              <div class="text-caption text-grey q-mt-sm">{{ $t('Drop DDD file here or click to select') }}</div>
              <div class="text-caption text-grey-6">.ddd, .c1b, .v1b, .c2b, .v2b</div>
            </div>
            <div v-else-if="parserStore.uploading" class="flex flex-center column q-pa-lg">
              <q-spinner-dots size="2em" color="primary" />
              <div class="text-caption text-grey q-mt-sm">{{ $t('Uploading...') }}</div>
              <div class="text-caption text-grey-6">{{ uploadFileName }}</div>
            </div>
            <div v-else-if="parserStore.processing" class="flex flex-center column q-pa-lg">
              <q-spinner-gears size="2em" color="primary" />
              <div class="text-caption text-grey q-mt-sm">{{ $t('Processing...') }}</div>
              <div class="text-caption text-grey-6">{{ uploadFileName }}</div>
            </div>
            <q-banner v-if="parserStore.error" dense class="bg-negative text-white text-caption q-mt-sm" rounded>
              {{ parserStore.error }}
            </q-banner>
          </template>
        </q-card-section>
      </q-card>
    </q-dialog>
    <input ref="uploadInputRef" type="file" accept=".ddd,.c1b,.v1b,.c2b,.v2b,.tgd,.esm" style="display: none" @change="onUploadFileSelected" />

    <!-- Parser Wizard Dialog -->
    <ParserWizardDialog ref="wizardRef" @done="onWizardDone" />

    <!-- Settings Dialog -->
    <q-dialog v-model="settingsDialog">
      <q-card style="width: 360px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-bold">{{ $t('Settings') }}</div>
          <q-space />
          <q-btn icon="mdi-close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section>
          <q-list>
            <q-item dense>
              <q-item-section avatar>
                <q-icon name="mdi-shield-check" size="xs" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-caption">{{ $t('EU 561/2006 Violations') }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-toggle v-model="settingsStore.showViolations" dense size="sm" />
              </q-item-section>
            </q-item>
            <q-item dense>
              <q-item-section avatar>
                <q-icon name="mdi-file-document-outline" size="xs" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-caption">{{ $t('File display') }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn-toggle
                  v-model="settingsStore.fileDisplayMode"
                  flat
                  dense
                  no-caps
                  size="sm"
                  toggle-color="primary"
                  :options="[
                    { label: $t('Meta'), value: 'meta' },
                    { label: $t('Filename'), value: 'filename' },
                  ]"
                />
              </q-item-section>
            </q-item>
            <q-item dense>
              <q-item-section avatar>
                <q-icon name="mdi-calendar" size="xs" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-caption">{{ $t('Date format') }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-select
                  v-model="settingsStore.dateFormat"
                  :options="dateFormatOptions"
                  dense
                  outlined
                  emit-value
                  map-options
                  options-dense
                  style="min-width: 130px"
                />
              </q-item-section>
            </q-item>
            <q-item dense>
              <q-item-section avatar>
                <q-icon name="mdi-clock-outline" size="xs" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-caption">{{ $t('Time format') }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn-toggle
                  v-model="settingsStore.timeFormat"
                  flat
                  dense
                  no-caps
                  size="sm"
                  toggle-color="primary"
                  :options="timeFormatOptions"
                />
              </q-item-section>
            </q-item>
            <q-item dense>
              <q-item-section avatar>
                <q-icon name="mdi-translate" size="xs" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-caption">{{ $t('Language') }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-select
                  v-model="currentLocale"
                  :options="localeOptions"
                  dense
                  outlined
                  emit-value
                  map-options
                  options-dense
                  style="min-width: 160px"
                >
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps" dense>
                      <q-item-section>{{ scope.opt.label }}</q-item-section>
                      <q-item-section side class="text-caption text-grey">{{ scope.opt.value }}</q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-layout>
</template>

<script>
import { defineComponent, ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import LoginButton from 'src/components/widgets/LoginButton.vue'
import EuroPlate from 'src/components/EuroPlate.vue'
import ParserWizardDialog from 'src/components/ParserWizardDialog.vue'
import SourceListItem from 'src/components/SourceListItem.vue'
import { useDddStore } from 'src/stores/ddd'
import { useAuthStore } from 'src/stores/auth'
import { useSettingsStore } from 'src/stores/settings'
import { useParserStore } from 'src/stores/parser'
import { formatDateTime, DATE_FORMATS, TIME_FORMATS } from 'src/utils/format'
import { downloadMediaFile } from 'src/utils/media'

const dateFormatOptions = DATE_FORMATS.map((f) => ({ label: f.sample, value: f.key }))
const timeFormatOptions = TIME_FORMATS.map((f) => ({ label: f.sample, value: f.key }))

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default defineComponent({
  name: 'MainLayout',

  components: {
    LoginButton,
    ParserWizardDialog,
    EuroPlate,
    SourceListItem,
  },

  setup() {
    const { t, locale } = useI18n()

    const localeOptions = [
      { label: 'English', value: 'en-US' },
      { label: 'Български', value: 'bg-BG' },
      { label: 'Čeština', value: 'cs-CZ' },
      { label: 'Deutsch', value: 'de-DE' },
      { label: 'Español', value: 'es-ES' },
      { label: 'Français', value: 'fr-FR' },
      { label: 'Italiano', value: 'it-IT' },
      { label: 'Latviešu', value: 'lv-LV' },
      { label: 'Lietuvių', value: 'lt-LT' },
      { label: 'Nederlands', value: 'nl-NL' },
      { label: 'Polski', value: 'pl-PL' },
      { label: 'Română', value: 'ro-RO' },
      { label: 'Suomi', value: 'fi-FI' },
      { label: 'Svenska', value: 'sv-SE' },
    ]

    const currentLocale = computed({
      get: () => locale.value,
      set: (val) => { locale.value = val },
    })
    const $q = useQuasar()
    const route = useRoute()
    const router = useRouter()
    const leftDrawerOpen = ref(false)
    const fileInputRef = ref(null)
    const dddStore = useDddStore()
    const authStore = useAuthStore()
    const parserStore = useParserStore()
    const wizardRef = ref(null)
    const uploadInputRef = ref(null)
    const uploadDragging = ref(false)
    const uploadFileName = ref('')
    const settingsStore = useSettingsStore()

    const hidePanels = computed(() => route.query.hidepanels === '1' || route.query.hidepanels === 'true')
    const whiteLabel = computed(() => route.query.whitelabel === '1' || route.query.whitelabel === 'true')
    const noUpload = computed(() => route.query.noupload === '1' || route.query.noupload === 'true')

    // Theme
    if (route.query.theme === 'light') $q.dark.set(false)
    else if (route.query.theme === 'dark') $q.dark.set(true)

    function toggleDark() {
      $q.dark.toggle()
    }

    const settingsDialog = ref(false)

    // API browser state
    const apiDialog = ref(false)
    const apiStep = ref('devices')
    const apiFromDeviceList = ref(false)
    const devicesLoading = ref(false)
    const devices = ref([])
    const deviceFilter = ref('')
    const selectedDevices = ref([])
    const activeDeviceId = ref(null)
    const filesLoading = ref(false)
    const deviceFiles = ref([])
    const fileFilter = ref('')

    const selectedDeviceName = computed(() => {
      if (activeDeviceId.value === parserStore.deviceId && parserStore.deviceName) {
        return parserStore.deviceName
      }
      const dev = selectedDevices.value.find((d) => d.id === activeDeviceId.value)
        || devices.value.find((d) => d.id === activeDeviceId.value)
      return dev?.name || `Device ${activeDeviceId.value || ''}`
    })

    const filteredDevices = computed(() => {
      const q = (deviceFilter.value || '').toLowerCase()
      if (!q) return devices.value
      return devices.value.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        String(d.id).includes(q) ||
        (d.ident || '').toLowerCase().includes(q),
      )
    })

    const filteredFiles = computed(() => {
      const q = (fileFilter.value || '').toLowerCase()
      if (!q) return deviceFiles.value
      return deviceFiles.value.filter((f) => f.search.includes(q))
    })

    async function loadExample() {
      const resp = await fetch('example.json')
      const json = await resp.json()
      dddStore.setData(json, 'example.json')
    }

    async function loadExampleVu() {
      const resp = await fetch('example-vu.json')
      const json = await resp.json()
      dddStore.setData(json, 'example-vu.json')
    }

    function onUploadDddClick() {
      if (parserStore.deviceId) {
        activeDeviceId.value = parserStore.deviceId
        apiStep.value = 'upload'
        apiFromDeviceList.value = false
        resetUploadState()
        apiDialog.value = true
      } else {
        wizardRef.value?.open()
      }
    }

    function onWizardDone() {
      activeDeviceId.value = parserStore.deviceId
      apiStep.value = 'upload'
      apiFromDeviceList.value = false
      resetUploadState()
      apiDialog.value = true
    }

    function onApiStepChange(step) {
      if (step === 'files') {
        loadDeviceFileList(activeDeviceId.value)
      } else if (step === 'upload') {
        resetUploadState()
      }
    }

    function resetUploadState() {
      uploadDragging.value = false
      uploadFileName.value = ''
      parserStore.uploading = false
      parserStore.processing = false
      parserStore.error = null
    }

    function onUploadFileSelected(e) {
      const file = e.target.files?.[0]
      if (file) processUploadFile(file)
      e.target.value = ''
    }

    function onUploadDrop(e) {
      uploadDragging.value = false
      const file = e.dataTransfer?.files?.[0]
      if (file) processUploadFile(file)
    }

    async function processUploadFile(file) {
      uploadFileName.value = file.name
      const deviceId = activeDeviceId.value

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
            `/gw/devices/${deviceId}/media?data=${encodeURIComponent(dataParam)}`,
          )
          const result = dddStore.addData(resp.data, file.name, { deviceId })
          if (result.error) {
            $q.notify({ type: 'negative', message: t(result.error) })
          } else {
            if (result.warning) $q.notify({ type: 'warning', message: t(result.warning) })
            if (result.conflict) handleConflict(result)
            apiDialog.value = false
          }
        } catch (e) {
          $q.notify({ type: 'negative', message: t('Failed to load parsed file', { error: e.message }) })
        }
      }

      logTopic = await parserStore.subscribeLog((log) => {
        if (parserStore.waitingUuid) {
          if (log.uuid === parserStore.waitingUuid) handleMatch(log)
        } else {
          bufferedLogs.push(log)
        }
      }, deviceId)

      const uploadResult = await parserStore.upload(file, deviceId)
      if (uploadResult.error) {
        handled = true
        clearTimeout(timeout)
        if (logTopic) parserStore.unsubscribeLog(logTopic)
        return
      }

      const match = bufferedLogs.find((log) => log.uuid === parserStore.waitingUuid)
      if (match) handleMatch(match)
    }

    function triggerFileInput() {
      fileInputRef.value?.click()
    }

    function onToggleSource(index) {
      const err = dddStore.toggleSource(index)
      if (err) {
        $q.dialog({
          title: t('Incompatible file'),
          message: t('This file conflicts with the currently active file. Switch to this file instead?'),
          cancel: t('Keep current'),
          ok: t('Switch'),
        }).onOk(() => {
          dddStore.enableOnly(index)
        })
      }
    }

    function handleConflict(result) {
      if (result.conflict) {
        $q.dialog({
          title: t('Incompatible file'),
          message: t('The loaded file conflicts with the currently active file. Switch to the new file?'),
          cancel: t('Keep current'),
          ok: t('Switch'),
        }).onOk(() => {
          dddStore.enableOnly(result.newIndex)
        })
      }
    }

    function onFilesSelected(event) {
      const files = event.target.files
      if (!files?.length) return
      for (const file of files) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const json = JSON.parse(e.target.result)
            const result = dddStore.addData(json, file.name)
            if (result.error) $q.notify({ type: 'negative', message: t(result.error) })
            if (result.warning) $q.notify({ type: 'warning', message: t(result.warning) })
            if (result.conflict) handleConflict(result)
          } catch {
            $q.notify({ type: 'negative', message: `${t('Invalid JSON:')} ${file.name}` })
          }
        }
        reader.readAsText(file)
      }
      event.target.value = ''
    }

    async function openApiDialog() {
      if (!authStore.token) {
        $q.notify({ type: 'warning', message: t('Please log in first') })
        return
      }
      apiStep.value = 'devices'
      apiFromDeviceList.value = true
      deviceFilter.value = ''
      apiDialog.value = true
      if (!devices.value.length) loadDeviceList()
    }

    function openDeviceFiles(dev) {
      apiFromDeviceList.value = true
      activeDeviceId.value = dev.id
      apiStep.value = 'files'
      apiDialog.value = true
      loadDeviceFileList(dev.id)
    }

    async function loadDeviceList() {
      devices.value = []
      devicesLoading.value = true
      try {
        const resp = await authStore.$connector.http.get('/gw/devices/{exists("configuration.tacho")&&plugins_count>0}?fields=id,name,configuration.ident,connected,device_type_id')
        devices.value = (resp.data.result || []).map((d) => ({
          id: d.id,
          name: d.name || `Device ${d.id}`,
          ident: d['configuration.ident'] || d.configuration?.ident || '',
          connected: d.connected,
        }))
      } catch (err) {
        $q.notify({ type: 'negative', message: t('Failed to load devices', { error: err.message }) })
      } finally {
        devicesLoading.value = false
      }
    }

    async function loadDeviceFileList(deviceId) {
      deviceFiles.value = []
      filesLoading.value = true
      try {
        // `created` is when the file entered flespi media storage (`uploaded` is
        // the same for a plain upload, and the fallback when created is absent).
        // It is NOT the tachograph download date, which only exists inside the
        // file content and is shown per loaded source instead.
        const listParam = JSON.stringify({ fields: 'uuid,name,meta,size,created,uploaded', filter: 'exists("content")' })
        const resp = await authStore.$connector.http.get(
          `/gw/devices/${deviceId}/media?data=${encodeURIComponent(listParam)}`,
        )
        const items = resp.data.result || []
        const loadedUuids = new Set(dddStore.sources.map((s) => s.uuid).filter(Boolean))
        deviceFiles.value = items.map((item) => {
          const meta = item.meta || {}
          const isDriver = !!meta.driver_id
          const fileName = item.name || item.uuid || t('Unknown')
          const icon = isDriver ? 'mdi-card-account-details' : 'mdi-truck'
          const typeColor = isDriver ? 'text-blue' : 'text-orange'
          const createdTs = item.created || item.uploaded || 0
          const createdStr = createdTs ? formatDateTime(createdTs) : ''
          const sizeStr = item.size ? formatSize(item.size) : ''
          const driverName = [meta.driver_first_name, meta.driver_last_name].filter(Boolean).join(' ')
          // tooltip lines
          const tipLines = []
          if (fileName) tipLines.push(fileName)
          if (driverName) tipLines.push(`${t('Driver:')} ${driverName}`)
          if (meta.driver_id) tipLines.push(`${t('Driver ID:')} ${meta.driver_id}`)
          if (meta.vin) tipLines.push(`${t('VIN:')} ${meta.vin}`)
          if (meta.plate_number) tipLines.push(`${t('Plate:')} ${meta.plate_number}${meta.region ? ` (${meta.region})` : ''}`)
          if (createdStr) tipLines.push(`${t('Added:')} ${createdStr}`)
          if (sizeStr) tipLines.push(sizeStr)
          // Lower-cased haystack for the filter box below the list.
          const search = [fileName, driverName, meta.driver_id, meta.vin, meta.plate_number]
            .filter(Boolean).join(' ').toLowerCase()
          return {
            uuid: item.uuid, fileName, meta, icon, typeColor, createdTs, createdStr, sizeStr, search,
            idCaption: meta.driver_id ? `ID: ${meta.driver_id}` : '',
            tooltip: tipLines.join('\n'),
            loading: false, downloading: false, loaded: loadedUuids.has(item.uuid),
          }
        })
        // Newest first: the API sorts oldest-first, and with many files the
        // recent downloads are the ones being looked for.
        deviceFiles.value.sort((a, b) => b.createdTs - a.createdTs)
      } catch (err) {
        $q.notify({ type: 'negative', message: t('Failed to load files', { error: err.message }) })
      } finally {
        filesLoading.value = false
      }
    }

    async function selectDevice(dev) {
      // Add to selectedDevices if not already there
      if (!selectedDevices.value.find((d) => d.id === dev.id)) {
        selectedDevices.value.push({ id: dev.id, name: dev.name, ident: dev.ident })
      }
      // Switch to files view for this device
      activeDeviceId.value = dev.id
      apiStep.value = 'files'
      fileFilter.value = ''
      loadDeviceFileList(dev.id)
    }

    function goBackToDevices() {
      apiStep.value = 'devices'
      deviceFilter.value = ''
      if (!devices.value.length) loadDeviceList()
    }

    function removeDevice(deviceId) {
      selectedDevices.value = selectedDevices.value.filter((d) => d.id !== deviceId)
    }

    async function loadFile(file) {
      if (file.loaded || file.loading) return
      file.loading = true
      try {
        const dataParam = JSON.stringify({ uuid: file.uuid, fields: 'uuid,name,meta,content' })
        const resp = await authStore.$connector.http.get(
          `/gw/devices/${activeDeviceId.value}/media?data=${encodeURIComponent(dataParam)}`,
        )
        const result = dddStore.addData(resp.data, file.fileName, { deviceId: activeDeviceId.value })
        if (result.error) {
          $q.notify({ type: 'negative', message: t(result.error) })
        } else {
          file.loaded = true
          if (result.warning) $q.notify({ type: 'warning', message: t(result.warning) })
          if (result.conflict) handleConflict(result)
          if (hidePanels.value) apiDialog.value = false
        }
      } catch (err) {
        $q.notify({ type: 'negative', message: t('Failed to load', { error: err.message }) })
      } finally {
        file.loading = false
      }
    }

    function metaLabel(meta, fallbackName) {
      if (meta.driver_id) {
        const name = [meta.driver_first_name, meta.driver_last_name].filter(Boolean).join(' ')
        if (name) return name
      }
      if (meta.vin) return meta.vin
      return fallbackName || t('Unknown')
    }

    function fileLabel(file) {
      if (settingsStore.fileDisplayMode === 'filename') return file.fileName
      return metaLabel(file.meta, file.fileName)
    }

    // Downloads the original (unparsed) file from flespi media storage, as
    // opposed to clicking the row, which loads the parsed content into the app.
    async function downloadDdd(file) {
      if (file.downloading) return
      file.downloading = true
      try {
        await downloadMediaFile(file.uuid, file.fileName, authStore.token)
      } catch (err) {
        $q.notify({ type: 'negative', message: t('Download failed', { error: err.message }) })
      } finally {
        file.downloading = false
      }
    }

    // Same, for a source already loaded into the app. Only files that came from
    // a device carry the uuid needed to reach media storage.
    async function saveSourceDdd(src) {
      try {
        await downloadMediaFile(src.uuid, src.name, authStore.token)
      } catch (err) {
        $q.notify({ type: 'negative', message: t('Download failed', { error: err.message }) })
      }
    }

    function deviceSources(deviceId) {
      return dddStore.sources
        .map((s, i) => ({ ...s, index: i }))
        .filter((s) => s.deviceId === deviceId)
    }

    const parserSources = computed(() =>
      parserStore.deviceId
        ? dddStore.sources
            .map((s, i) => ({ ...s, index: i }))
            .filter((s) => s.deviceId === parserStore.deviceId)
        : [],
    )

    const localSources = computed(() =>
      dddStore.sources
        .map((s, i) => ({ ...s, index: i }))
        .filter((s) => !s.deviceId),
    )

    function clearLocalSources() {
      for (let i = dddStore.sources.length - 1; i >= 0; i--) {
        if (!dddStore.sources[i].deviceId) dddStore.removeSource(i)
      }
    }

    function saveSourceJson(src) {
      const json = JSON.stringify(src.rawJson, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (src.name || 'data').replace(/\.[^.]+$/, '') + '.json'
      a.click()
      URL.revokeObjectURL(url)
    }

    // Route-based auto-loading: /#/device/:deviceId/file/:fileUuid?token=xxx

    async function autoLoadFromRoute() {
      const deviceId = route.params.deviceId
      if (!deviceId) return

      dddStore.loading = true

      const token = route.query.token
      if (token && !authStore.token) {
        await authStore.setToken(token)
      }

      if (!authStore.token) return

      // Add device to list
      const devId = Number(deviceId)
      if (!selectedDevices.value.find((d) => d.id === devId)) {
        try {
          const resp = await authStore.$connector.http.get(`/gw/devices/${devId}?fields=id,name,configuration.ident`)
          const d = resp.data.result?.[0]
          if (d) {
            selectedDevices.value.push({
              id: d.id,
              name: d.name || `Device ${d.id}`,
              ident: d['configuration.ident'] || d.configuration?.ident || '',
            })
          }
        } catch {
          selectedDevices.value.push({ id: devId, name: `Device ${devId}`, ident: '' })
        }
      }

      activeDeviceId.value = devId

      const fileUuid = route.params.fileUuid
      if (fileUuid) {
        // Load specific file
        try {
          const dataParam = JSON.stringify({ uuid: fileUuid, fields: 'uuid,name,meta,content' })
          const resp = await authStore.$connector.http.get(
            `/gw/devices/${devId}/media?data=${encodeURIComponent(dataParam)}`,
          )
          const item = resp.data.result?.[0]
          const name = item?.name || fileUuid
          if (!item) {
            $q.notify({ type: 'negative', message: t('File not found') })
          } else if (!item.content) {
            dddStore.clearData()
            dddStore.setLoadError({
              kind: 'not-parsed',
              deviceId: devId,
              fileUuid,
              fileName: name,
            })
          } else {
            const result = hidePanels.value
              ? dddStore.setData(resp.data, name)
              : dddStore.addData(resp.data, name, { deviceId: devId })
            if (result?.error) {
              $q.notify({ type: 'negative', message: t(result.error) })
            } else {
              if (result?.warning) $q.notify({ type: 'warning', message: t(result.warning) })
              if (result?.conflict) handleConflict(result)
            }
          }
        } catch (err) {
          $q.notify({ type: 'negative', message: `Failed to load file: ${err.message}` })
        }
      } else {
        // Open files dialog for this device
        apiStep.value = 'files'
        apiDialog.value = true
        loadDeviceFileList(devId)
      }

      dddStore.loading = false

      // Clean URL only if not hidePanels
      if (!hidePanels.value) router.replace('/')
    }

    watch(() => authStore.socketConnected, (connected) => {
      if (connected) {
        parserStore.subscribe()
      }
    })
    watch(() => authStore.token, (token) => {
      if (token) {
        if (route.params.deviceId) autoLoadFromRoute()
      } else {
        parserStore.unsubscribe()
      }
    })

    // Watch route changes for hidePanels mode - reload when URL changes
    watch(
      () => [route.params.deviceId, route.params.fileUuid],
      ([newDevId, newFileUuid], [oldDevId, oldFileUuid]) => {
        if (newDevId && (newDevId !== oldDevId || newFileUuid !== oldFileUuid) && authStore.token) {
          autoLoadFromRoute()
        }
      },
    )

    async function loadFromJsonUrl(url) {
      dddStore.loading = true
      try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const json = await resp.json()
        const name = url.split('/').pop() || 'remote.json'
        const result = hidePanels.value
          ? dddStore.setData(json, name)
          : dddStore.addData(json, name)
        if (result?.error) $q.notify({ type: 'negative', message: t(result.error) })
        if (result?.warning) $q.notify({ type: 'warning', message: t(result.warning) })
      } catch (err) {
        $q.notify({ type: 'negative', message: `${t('Failed to load JSON:')} ${err.message}` })
      } finally {
        dddStore.loading = false
      }
    }

    onMounted(() => {
      if (authStore.socketConnected) parserStore.subscribe()

      const demo = route.query.demo
      if (demo === '1' || demo === 'true') {
        loadExample()
      } else if (route.query.jsonurl) {
        loadFromJsonUrl(route.query.jsonurl)
      } else if (route.params.deviceId) {
        if (route.query.token) {
          autoLoadFromRoute()
        } else if (authStore.token) {
          autoLoadFromRoute()
        }
      }
    })

    return {
      product: __APP_PRODUCT__,
      version: __APP_VERSION__,
      hidePanels,
      whiteLabel,
      noUpload,
      leftDrawerOpen,
      fileInputRef,
      dddStore,
      authStore,
      settingsStore,
      settingsDialog,
      dateFormatOptions,
      timeFormatOptions,
      parserStore,
      wizardRef,
      uploadInputRef,
      uploadDragging,
      uploadFileName,
      onUploadDddClick,
      onWizardDone,
      onApiStepChange,
      onUploadFileSelected,
      onUploadDrop,
      currentLocale,
      localeOptions,
      apiDialog,
      apiStep,
      apiFromDeviceList,
      devicesLoading,
      filteredDevices,
      deviceFilter,
      selectedDeviceName,
      filesLoading,
      deviceFiles,
      fileFilter,
      filteredFiles,
      toggleDark,
      toggleLeftDrawer() {
        leftDrawerOpen.value = !leftDrawerOpen.value
      },
      saveSourceJson,
      saveSourceDdd,
      loadExample,
      loadExampleVu,
      triggerFileInput,
      onFilesSelected,
      onToggleSource,
      selectedDevices,
      deviceSources,
      fileLabel,
      downloadDdd,
      parserSources,
      localSources,
      clearLocalSources,
      openApiDialog,
      openDeviceFiles,
      removeDevice,
      goBackToDevices,
      selectDevice,
      loadFile,
    }
  },
})
</script>

<style scoped>
.drawer-login {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--q-primary);
  flex-shrink: 0;
}

.drawer-login :deep(.q-btn) {
  width: 100%;
  height: 100%;
  border-radius: 0;
}

.api-browser-card {
  width: 500px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.api-browser-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* Storage date + size, right-aligned, so the dates line up down the list. */
.file-added {
  padding-left: 8px;
  text-align: right;
  white-space: nowrap;
}

/* QItemSection lays out as a column; the direction has to be set explicitly or
   the download button and the loaded indicator stack on top of each other. */
.file-actions {
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
}

/* Revealed on hover so the name/meta columns get the width by default. The
   loaded/not-loaded indicator next to it stays visible - it carries state, not
   an action. Touch devices have no hover, so there the button always shows. */
@media (hover: hover) {
  .file-item .file-download {
    display: none;
  }

  .file-item:hover .file-download,
  .file-item:focus-within .file-download {
    display: inline-flex;
  }
}

.drawer-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}

.flex-shrink-0 {
  flex-shrink: 0;
}

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
