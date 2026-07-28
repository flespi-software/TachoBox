<template>
  <q-dialog v-model="show" persistent>
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section class="row items-center no-wrap q-pb-none">
        <div class="text-subtitle1 text-bold col">{{ $t('Setup DDD Parser') }}</div>
        <q-btn icon="mdi-close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <q-stepper v-model="step" vertical animated flat>

          <!-- Step 1: Select or create device -->
          <q-step :name="1" :title="$t('Select Device')" icon="mdi-developer-board" :done="!!selectedDevice">
            <div class="text-caption text-grey q-mb-sm">
              {{ $t('Choose an existing device or create a new virtual device. This device will be used to upload and parse DDD files via the tacho-file-parse plugin.') }}
            </div>

            <q-tabs v-model="deviceTab" dense class="q-mb-sm" narrow-indicator>
              <q-tab name="existing" :label="$t('Existing')" />
              <q-tab name="create" :label="$t('Create new')" />
            </q-tabs>

            <template v-if="deviceTab === 'existing'">
              <q-input v-model="devFilter" dense outlined :placeholder="$t('Filter devices...')" class="q-mb-xs" clearable>
                <template #prepend><q-icon name="mdi-magnify" size="xs" /></template>
              </q-input>
              <div v-if="loadingDevices" class="flex flex-center q-pa-md"><q-spinner size="1.5em" /></div>
              <q-list v-else-if="filteredDevs.length" dense separator style="max-height: 200px; overflow-y: auto">
                <q-item v-for="d in filteredDevs" :key="d.id" clickable @click="pickDevice(d)" :active="selectedDevice?.id === d.id">
                  <q-item-section avatar style="min-width: 24px; padding-right: 8px">
                    <q-icon name="mdi-developer-board" size="xs" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ d.name }}</q-item-label>
                    <q-item-label caption>ID: {{ d.id }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-caption text-grey text-center q-pa-sm">{{ $t('No devices found') }}</div>
            </template>

            <template v-if="deviceTab === 'create'">
              <q-input v-model="newDeviceName" dense outlined :placeholder="$t('Device name')" class="q-mb-sm" />
              <q-checkbox v-model="consentDevice" dense class="text-caption">
                {{ $t('I agree to create a virtual device for DDD file parsing') }}
              </q-checkbox>
            </template>

            <q-stepper-navigation>
              <q-btn
                :label="deviceTab === 'create' ? $t('Create & Continue') : $t('Continue')"
                color="primary"
                :disable="deviceTab === 'create' ? (!consentDevice || !newDeviceName) : !selectedDevice"
                :loading="creatingDevice"
                @click="stepDevice"
                no-caps
              />
            </q-stepper-navigation>
          </q-step>

          <!-- Step 2: Check/create plugin -->
          <q-step :name="2" :title="$t('Plugin')" icon="mdi-puzzle" :done="!!pluginId">
            <div v-if="checkingPlugin" class="flex flex-center q-pa-md"><q-spinner size="1.5em" /> <span class="q-ml-sm text-caption">{{ $t('Checking plugin...') }}</span></div>
            <template v-else>
              <div v-if="pluginId" class="text-caption text-green q-mb-sm">
                <q-icon name="mdi-check-circle" size="xs" class="q-mr-xs" />
                {{ $t('tacho-file-parse plugin found') }} (ID: {{ pluginId }})
              </div>
              <template v-else>
                <div class="text-caption text-grey q-mb-sm">
                  {{ $t('The tacho-file-parse plugin is required to decode DDD files on the server. It will be created in your flespi account.') }}
                </div>
                <q-checkbox v-model="consentPlugin" dense class="text-caption">
                  {{ $t('I agree to create the tacho-file-parse plugin') }}
                </q-checkbox>
              </template>
            </template>
            <q-stepper-navigation>
              <q-btn
                :label="pluginId ? $t('Continue') : $t('Create & Continue')"
                color="primary"
                :disable="!pluginId && !consentPlugin"
                :loading="creatingPlugin"
                @click="stepPlugin"
                no-caps
              />
              <q-btn flat :label="$t('Back')" @click="step = 1" class="q-ml-sm" no-caps />
            </q-stepper-navigation>
          </q-step>

          <!-- Step 3: Assign plugin to device -->
          <q-step :name="3" :title="$t('Assign')" icon="mdi-link-variant" :done="assigned">
            <div v-if="checkingAssignment" class="flex flex-center q-pa-md"><q-spinner size="1.5em" /> <span class="q-ml-sm text-caption">{{ $t('Checking...') }}</span></div>
            <template v-else>
              <div v-if="assigned" class="text-caption text-green q-mb-sm">
                <q-icon name="mdi-check-circle" size="xs" class="q-mr-xs" />
                {{ $t('Plugin is already assigned to this device') }}
              </div>
              <template v-else>
                <div class="text-caption text-grey q-mb-sm">
                  {{ $t('The plugin needs to be assigned to the device to process uploaded DDD files.') }}
                </div>
                <q-checkbox v-model="consentAssign" dense class="text-caption">
                  {{ $t('I agree to assign the plugin to the selected device') }}
                </q-checkbox>
              </template>
            </template>
            <q-stepper-navigation>
              <q-btn
                :label="assigned ? $t('Finish') : $t('Assign & Finish')"
                color="primary"
                :disable="!assigned && !consentAssign"
                :loading="assigning"
                @click="stepAssign"
                no-caps
              />
              <q-btn flat :label="$t('Back')" @click="step = 2" class="q-ml-sm" no-caps />
            </q-stepper-navigation>
          </q-step>
        </q-stepper>
      </q-card-section>

      <q-card-section v-if="errorMsg" class="q-pt-none">
        <q-banner dense class="bg-negative text-white text-caption" rounded>{{ errorMsg }}</q-banner>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent, ref, computed } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { useParserStore } from 'src/stores/parser'

export default defineComponent({
  name: 'ParserWizardDialog',
  emits: ['done'],
  setup(props, { emit }) {
    const authStore = useAuthStore()
    const parserStore = useParserStore()

    const show = ref(false)
    const step = ref(1)
    const errorMsg = ref('')

    // Step 1
    const deviceTab = ref('existing')
    const devFilter = ref('')
    const allDevices = ref([])
    const loadingDevices = ref(false)
    const selectedDevice = ref(null)
    const newDeviceName = ref('TachoBox Parser')
    const consentDevice = ref(false)
    const creatingDevice = ref(false)

    const filteredDevs = computed(() => {
      const q = (devFilter.value || '').toLowerCase()
      return q ? allDevices.value.filter((d) => d.name.toLowerCase().includes(q) || String(d.id).includes(q)) : allDevices.value
    })

    async function loadDevices() {
      loadingDevices.value = true
      try {
        const resp = await authStore.$connector.http.get('/gw/devices/all?fields=id,name')
        allDevices.value = resp.data.result || []
      } catch { allDevices.value = [] }
      loadingDevices.value = false
    }

    function pickDevice(d) {
      selectedDevice.value = d
    }

    async function stepDevice() {
      errorMsg.value = ''
      if (deviceTab.value === 'create') {
        creatingDevice.value = true
        try {
          const resp = await authStore.$connector.http.post('/gw/devices', [{ name: newDeviceName.value, device_type_id: 171, configuration: { ident: `tachobox-${Date.now()}` } }])
          const created = resp.data.result?.[0]
          if (!created?.id) throw new Error('Device creation failed')
          selectedDevice.value = { id: created.id, name: created.name || newDeviceName.value }
        } catch (e) {
          errorMsg.value = e.message
          creatingDevice.value = false
          return
        }
        creatingDevice.value = false
      }
      step.value = 2
      checkPlugin()
    }

    // Step 2
    const pluginId = ref(null)
    const checkingPlugin = ref(false)
    const consentPlugin = ref(false)
    const creatingPlugin = ref(false)

    async function checkPlugin() {
      checkingPlugin.value = true
      pluginId.value = null
      try {
        const resp = await authStore.$connector.http.get('/gw/plugins/all?fields=id,name,item_type')
        const plugins = resp.data.result || []
        const found = plugins.find((p) => p.item_type === 'tacho-file-parse' || p.name?.toLowerCase().includes('tacho'))
        if (found) pluginId.value = found.id
      } catch {
        // Plugin lookup failed - leave pluginId null so the wizard offers to create one.
      } finally {
        checkingPlugin.value = false
      }
    }

    async function stepPlugin() {
      errorMsg.value = ''
      if (!pluginId.value) {
        creatingPlugin.value = true
        try {
          const resp = await authStore.$connector.http.post('/gw/plugins', [{ name: 'tacho-file-parse', item_type: 'tacho-file-parse' }])
          const created = resp.data.result?.[0]
          if (!created?.id) throw new Error('Plugin creation failed')
          pluginId.value = created.id
        } catch (e) {
          errorMsg.value = e.message
          creatingPlugin.value = false
          return
        }
        creatingPlugin.value = false
      }
      step.value = 3
      checkAssignment()
    }

    // Step 3
    const assigned = ref(false)
    const checkingAssignment = ref(false)
    const consentAssign = ref(false)
    const assigning = ref(false)

    async function checkAssignment() {
      checkingAssignment.value = true
      assigned.value = false
      try {
        const resp = await authStore.$connector.http.get(`/gw/plugins/${pluginId.value}/devices/${selectedDevice.value.id}`)
        assigned.value = !!(resp.data.result?.length)
      } catch { assigned.value = false }
      checkingAssignment.value = false
    }

    async function stepAssign() {
      errorMsg.value = ''
      if (!assigned.value) {
        assigning.value = true
        try {
          await authStore.$connector.http.post(`/gw/plugins/${pluginId.value}/devices/${selectedDevice.value.id}`)
          assigned.value = true
        } catch (e) {
          errorMsg.value = e.message
          assigning.value = false
          return
        }
        assigning.value = false
      }
      await parserStore.save(selectedDevice.value.id, selectedDevice.value.name)
      show.value = false
      emit('done')
    }

    function open() {
      step.value = 1
      errorMsg.value = ''
      selectedDevice.value = null
      consentDevice.value = false
      consentPlugin.value = false
      consentAssign.value = false
      pluginId.value = null
      assigned.value = false
      show.value = true
      loadDevices()
    }

    return {
      show, step, errorMsg,
      deviceTab, devFilter, filteredDevs, loadingDevices, selectedDevice, newDeviceName, consentDevice, creatingDevice,
      pluginId, checkingPlugin, consentPlugin, creatingPlugin,
      assigned, checkingAssignment, consentAssign, assigning,
      pickDevice, stepDevice, stepPlugin, stepAssign, open,
    }
  },
})
</script>
