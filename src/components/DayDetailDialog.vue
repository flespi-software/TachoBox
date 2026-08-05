<template>
  <q-dialog v-model="show" @hide="$emit('hide')">
    <q-card class="day-detail-card" :dark="$q.dark.isActive">
      <q-card-section class="day-detail-header q-pb-none">
        <div class="row items-center no-wrap">
          <q-btn flat dense round icon="mdi-chevron-left" :disable="!hasPrevDay" @click="goDay(-1)">
            <q-tooltip>{{ $t('Previous day') }}</q-tooltip>
          </q-btn>
          <div class="col text-h6 text-center">
            {{ dateStr }}
            <q-badge v-if="isLastDay" color="orange" class="q-ml-sm text-caption">{{ $t('Incomplete') }}</q-badge>
          </div>
          <q-btn flat dense round icon="mdi-chevron-right" :disable="!hasNextDay" @click="goDay(1)">
            <q-tooltip>{{ $t('Next day') }}</q-tooltip>
          </q-btn>
          <q-btn icon="mdi-close" flat round dense v-close-popup />
        </div>
      </q-card-section>

      <q-card-section class="day-detail-top">
        <div class="disc-and-radar">
          <ActivityDisc :record="activityRecord" :isLastDay="isLastDay" :highlightIndex="highlightIndex" :highlightSpan="violationSpan" class="disc-area" />
          <ActivityRadar v-if="activityRecord" :records="[activityRecord]" class="radar-area" />
        </div>
      </q-card-section>

      <q-card-section class="day-detail-body">
        <!-- Daily limits -->
        <template v-if="dayLimits">
          <div class="text-subtitle2 q-mb-xs">
            <q-icon name="mdi-timer-sand" size="xs" class="q-mr-xs" />
            {{ $t('Daily Limits') }}
          </div>
          <div class="limits-grid q-mb-md">
            <div v-for="lim in dayLimits" :key="lim.label" class="limit-item">
              <div class="limit-bar-bg">
                <div class="limit-bar" :style="{ width: lim.pct + '%' }" :class="lim.barCls" />
              </div>
              <div class="limit-label text-caption">
                <span>{{ lim.label }}</span>
                <span :class="lim.textCls">{{ lim.valueStr }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Per-second speed, when the vehicle unit retained it for this day.
             Sits right after the limits so it reads against the day's driving. -->
        <template v-if="daySpeedBlocks.length">
          <div class="text-subtitle2 q-mb-xs">
            <q-icon name="mdi-speedometer" size="xs" class="q-mr-xs" />
            {{ $t('Speed') }}
          </div>
          <div class="q-mb-md">
            <SpeedChart
              :blocks="daySpeedBlocks"
              :authorised-speed="authorisedSpeed"
              :from="dayTs"
              :to="dayTs + 86400"
              :height="110"
              compact
            >
              <template #below>
                <ActivityBar v-if="segments.length" :segments="segments" :height="10" class="q-mt-xs" />
              </template>
            </SpeedChart>
          </div>
        </template>

        <!-- Violations -->
        <template v-if="settingsStore.showViolations && dayViolations.length">
          <div class="text-subtitle2 q-mb-xs">
            <q-icon name="mdi-shield-alert" size="xs" class="q-mr-xs" :class="dayStatusColor === 'red' ? 'sev-very-serious' : 'sev-minor'" />
            {{ $t('Violations') }}
          </div>
          <div class="detail-list q-mb-md">
            <div
              v-for="v in dayViolations"
              :key="v.type + '|' + (v.startMin != null ? v.startMin : v.dayTs) + '|' + (v.minutes != null ? v.minutes : '') + '|' + v.message"
              class="detail-row violation-hoverable"
              @mouseenter="hoverViolation(v)"
              @mouseleave="hoverViolation(null)"
              @click="openViolation(v)"
            >
              <q-icon :name="v.icon || 'mdi-alert'" size="xs" :class="v.severity === 'uncertain' ? 'sev-uncertain' : (v.severity === 'very-serious' || v.severity === 'serious' ? 'sev-very-serious' : 'sev-minor')" />
              <span class="text-caption">{{ $t(v.message, v.messageParams || {}) }}</span>
              <span v-if="v.startMin != null" class="text-caption text-grey q-ml-xs">{{ fmtMin(v.startMin) }}–{{ fmtMin(v.endMin) }}</span>
            </div>
          </div>
        </template>

        <!-- Activity changes list -->
        <div class="text-subtitle2 q-mb-xs">{{ $t('Activities') }}</div>
        <div class="detail-list q-mb-md">
          <div
            v-for="(seg, i) in segments"
            :key="i"
            :class="['detail-row', 'activity-row', { 'activity-row-active': highlightIndex === i, 'activity-row-continuous': segInContinuous(seg), 'activity-row-span': segInSpan(seg) }]"
            @mouseenter="highlightIndex = i"
            @mouseleave="highlightIndex = -1"
          >
            <span :class="['dot', seg.cls, { 'dot-card-out': seg.cardOut }]" />
            <span class="text-caption time-col">{{ seg.startLabel }} — {{ seg.endLabel }}</span>
            <span class="text-caption">{{ seg.activity }}</span>
            <q-icon v-if="seg.cardOut" name="mdi-card-off-outline" size="xs" class="text-grey q-ml-xs">
              <q-tooltip>{{ $t('card not inserted') }}</q-tooltip>
            </q-icon>
            <span class="text-caption text-grey q-ml-auto">{{ seg.durationStr }}</span>
          </div>
          <div v-if="!segments.length" class="text-caption text-grey">{{ $t('No activity data') }}</div>
        </div>

        <!-- Events -->
        <template v-if="dayEvents.length">
          <div class="text-subtitle2 q-mb-xs">{{ $t('Events') }}</div>
          <div class="detail-list q-mb-md">
            <div v-for="ev in dayEvents" :key="ev.id" class="detail-row">
              <q-icon name="mdi-alert-circle-outline" size="xs" class="text-orange q-mr-xs" />
              <span class="text-caption time-col">{{ ev.time }}</span>
              <span class="text-caption">{{ ev.type }}</span>
            </div>
          </div>
        </template>

        <!-- Faults -->
        <template v-if="dayFaults.length">
          <div class="text-subtitle2 q-mb-xs">{{ $t('Faults') }}</div>
          <div class="detail-list q-mb-md">
            <div v-for="f in dayFaults" :key="f.id" class="detail-row">
              <q-icon name="mdi-alert-octagon-outline" size="xs" class="text-red q-mr-xs" />
              <span class="text-caption time-col">{{ f.time }}</span>
              <span class="text-caption">{{ f.type }}</span>
            </div>
          </div>
        </template>

        <!-- Places -->
        <template v-if="dayPlaces.length">
          <div class="text-subtitle2 q-mb-xs">{{ $t('Places') }}</div>
          <div class="detail-list q-mb-md">
            <div v-for="p in dayPlaces" :key="p.id" class="detail-row">
              <q-icon name="mdi-map-marker" size="xs" class="text-green q-mr-xs" />
              <span class="text-caption time-col">{{ p.time }}</span>
              <span class="text-caption">{{ p.country }}{{ p.region ? ' / ' + p.region : '' }}</span>
              <span class="text-caption text-grey q-ml-auto">{{ p.type }}</span>
            </div>
          </div>
        </template>

        <!-- Special Conditions -->
        <template v-if="dayConditions.length">
          <div class="text-subtitle2 q-mb-xs">{{ $t('Special Conditions') }}</div>
          <div class="detail-list">
            <div v-for="c in dayConditions" :key="c.id" class="detail-row">
              <q-icon name="mdi-shield-check-outline" size="xs" class="text-purple q-mr-xs" />
              <span class="text-caption time-col">{{ c.time }}</span>
              <span class="text-caption">{{ c.type }}</span>
            </div>
          </div>
        </template>

        <!-- Border Crossings -->
        <template v-if="dayBorders.length">
          <div class="text-subtitle2 q-mb-xs">{{ $t('Border Crossings') }}</div>
          <div class="detail-list q-mb-md">
            <div v-for="b in dayBorders" :key="b.id" class="detail-row">
              <q-icon name="mdi-boom-gate-up" size="xs" class="text-purple q-mr-xs" />
              <span class="text-caption time-col">{{ b.time }}</span>
              <span class="text-caption">{{ b.from }} → {{ b.to }}</span>
              <q-icon v-if="b.badGeo" name="mdi-map-marker-off" size="xs" color="orange" class="q-ml-auto q-mr-xs">
                <q-tooltip>{{ $t('Invalid GPS coordinates') }}</q-tooltip>
              </q-icon>
              <span v-if="b.coords" class="text-caption" :class="b.badGeo ? 'text-grey-6' : 'text-grey q-ml-auto'">{{ b.coords }}</span>
            </div>
          </div>
        </template>

        <!-- Load/Unload Operations -->
        <template v-if="dayCargo.length">
          <div class="text-subtitle2 q-mb-xs">{{ $t('Cargo Operations') }}</div>
          <div class="detail-list q-mb-md">
            <div v-for="c in dayCargo" :key="c.id" class="detail-row">
              <q-icon :name="c.opType === 1 ? 'mdi-package-down' : 'mdi-package-up'" size="xs" :class="c.opType === 1 ? 'text-green' : 'text-red'" class="q-mr-xs" />
              <span class="text-caption time-col">{{ c.time }}</span>
              <span class="text-caption">{{ c.label }}</span>
              <q-icon v-if="c.badGeo" name="mdi-map-marker-off" size="xs" color="orange" class="q-ml-auto q-mr-xs">
                <q-tooltip>{{ $t('Invalid GPS coordinates') }}</q-tooltip>
              </q-icon>
              <span v-if="c.coords" class="text-caption" :class="c.badGeo ? 'text-grey-6' : 'text-grey q-ml-auto'">{{ c.coords }}</span>
            </div>
          </div>
        </template>

        <!-- Control Activity -->
        <template v-if="dayControls.length">
          <div class="text-subtitle2 q-mb-xs">{{ $t('Control Activity') }}</div>
          <div class="detail-list q-mb-md">
            <div v-for="c in dayControls" :key="c.id" class="detail-row">
              <q-icon name="mdi-police-badge-outline" size="xs" class="text-blue q-mr-xs" />
              <span class="text-caption time-col">{{ c.time }}</span>
              <span class="text-caption">{{ c.type }}</span>
            </div>
          </div>
        </template>

        <!-- Vehicle & Distance -->
        <template v-if="dayVehicle || dayDistance > 0">
          <div class="text-subtitle2 q-mb-xs q-mt-md">{{ $t('Vehicle') }}</div>
          <div class="detail-list">
            <div v-if="dayVehicle" class="detail-row">
              <q-icon name="mdi-truck" size="xs" class="text-blue-grey q-mr-xs" />
              <EuroPlate v-if="dayVehicle.plateNumber" :number="dayVehicle.plateNumber" :nation="dayVehicle.nationCode" />
              <span v-else class="text-caption">—</span>
              <span v-if="dayVehicle.odomStart || dayVehicle.odomEnd" class="text-caption text-grey q-ml-auto">
                {{ dayVehicle.odomStart?.toLocaleString() }} → {{ dayVehicle.odomEnd?.toLocaleString() }} km
                <span v-if="dayVehicle.odomDiff" class="text-bold"> ({{ dayVehicle.odomDiff.toLocaleString() }} km)</span>
              </span>
            </div>
            <div v-if="dayDistance > 0" class="detail-row">
              <q-icon name="mdi-road-variant" size="xs" class="text-grey q-mr-xs" />
              <span class="text-caption">{{ $t('Day distance') }}</span>
              <span class="text-caption text-bold q-ml-auto">{{ dayDistance }} km</span>
            </div>
          </div>
        </template>

        <!-- GNSS Map + Positions -->
        <template v-if="dayGnss.length">
          <div class="text-subtitle2 q-mb-xs q-mt-md">
            <q-icon name="mdi-map" size="xs" class="q-mr-xs" />
            {{ $t('GNSS Positions') }}
          </div>
          <div ref="dayMapRef" class="day-map q-mb-xs" />
          <div class="detail-list">
            <div v-for="(g, i) in dayGnss" :key="i" class="detail-row">
              <q-icon name="mdi-crosshairs-gps" size="xs" class="q-mr-xs" :class="g.valid ? 'text-green' : 'text-orange'" />
              <span class="text-caption time-col">{{ g.time }}</span>
              <span class="text-caption" :class="{ 'text-grey-6': !g.valid }">{{ g.lat?.toFixed(4) }}, {{ g.lon?.toFixed(4) }}</span>
              <q-icon v-if="!g.valid" name="mdi-map-marker-off" size="xs" color="orange" class="q-ml-xs">
                <q-tooltip>{{ $t('Invalid GPS coordinates') }}</q-tooltip>
              </q-icon>
              <span class="text-caption text-grey q-ml-auto">±{{ g.accuracy }}m</span>
            </div>
          </div>
        </template>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent, computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getTileUrl, TILE_ATTRIBUTION, isValidGeo } from 'src/utils/geo'
import { addFullscreenControl } from 'src/utils/map-fullscreen'
import { buildDaySegments, formatDuration } from 'src/utils/activity'
import { analyzeDayViolations, analyzeDailyDriving, analyzeDailyRest, analyzeWeeklyRest, getDayStatus, maxContinuousDriving } from 'src/compliance'
import { useViolationDialog } from 'src/composables/violationDialog'
import { useQuasar } from 'quasar'
import { useSettingsStore } from 'src/stores/settings'
import { useDddStore } from 'src/stores/ddd'
import ActivityDisc from 'src/components/ActivityDisc.vue'
import SpeedChart from 'src/components/SpeedChart.vue'
import ActivityBar from 'src/components/ActivityBar.vue'
import ActivityRadar from 'src/components/ActivityRadar.vue'
import EuroPlate from 'src/components/EuroPlate.vue'
import { eventTypes as EVENT_TYPES, faultTypes as FAULT_TYPES } from 'src/reference'
import { formatDate, formatTimeOfDay, formatWeekdayLong, isUnsetOdometer } from 'src/utils/format'

export default defineComponent({
  name: 'DayDetailDialog',
  components: { ActivityDisc, ActivityRadar, EuroPlate, SpeedChart, ActivityBar },
  props: {
    dayTs: { type: Number, default: null },
  },
  emits: ['hide', 'navigate'],
  setup(props, { emit }) {
    const { t } = useI18n()
    const $q = useQuasar()
    const show = ref(false)
    const highlightIndex = ref(-1)
    const dayMapRef = ref(null)
    let dayMap = null
    const dddStore = useDddStore()
    const settingsStore = useSettingsStore()

    watch(() => props.dayTs, (ts) => {
      show.value = ts !== null
    })

    const dayStart = computed(() => props.dayTs || 0)
    const dayEnd = computed(() => dayStart.value + 86400)

    const dateStr = computed(() =>
      props.dayTs ? `${formatWeekdayLong(props.dayTs)}, ${formatDate(props.dayTs)}` : '',
    )

    const activityRecord = computed(() =>
      dddStore.activityRecords.find((r) => r.activityRecordDate === props.dayTs),
    )

    const authorisedSpeed = computed(() => dddStore.authorisedSpeed)

    // Blocks whose minute starts within this day. The vehicle unit keeps only
    // about 24h of movement, so most days have none.
    const daySpeedBlocks = computed(() =>
      dddStore.speedBlocks.filter(
        (b) => b.speedBlockBeginDate >= props.dayTs && b.speedBlockBeginDate < props.dayTs + 86400,
      ),
    )

    const dayData = computed(() => {
      if (!activityRecord.value?.activityChangeInfo?.length) return { segments: [], totals: {} }
      const allRecords = dddStore.activityRecords.filter((r) => r.activityChangeInfo?.length)
      const maxTs = allRecords.reduce((max, r) => Math.max(max, r.activityRecordDate), 0)
      const isLastDay = activityRecord.value.activityRecordDate === maxTs
      return buildDaySegments(activityRecord.value.activityChangeInfo, { isLastDay })
    })

    const segments = computed(() =>
      dayData.value.segments.map((s) => ({
        ...s,
        durationStr: s.ongoing ? '...' : formatDuration(s.duration),
      })),
    )


    const isLastDay = computed(() => {
      if (!activityRecord.value) return false
      const allRecords = dddStore.activityRecords.filter((r) => r.activityChangeInfo?.length)
      const maxTs = allRecords.reduce((max, r) => Math.max(max, r.activityRecordDate), 0)
      return activityRecord.value.activityRecordDate === maxTs
    })

    function limBar(label, used, limit) {
      const pct = Math.min(100, (used / limit) * 100)
      const remaining = Math.max(0, limit - used)
      const ratio = remaining / limit
      const barCls = ratio > 0.3 ? 'bg-green-7' : ratio > 0.15 ? 'bg-amber-8' : 'bg-red'
      const textCls = ratio > 0.3 ? 'text-green' : ratio > 0.15 ? 'text-amber' : 'text-red'
      return { label, pct, barCls, textCls, valueStr: `${formatDuration(used)} / ${formatDuration(limit)}` }
    }

    const dayLimits = computed(() => {
      const totals = dayData.value.totals
      if (!totals || !totals.DRIVING) return null

      const driving = totals.DRIVING || 0
      const bars = [limBar(t('Daily driving'), driving, 9 * 60)]

      // Longest continuous driving - same Art.7 engine as the violation, so the
      // bar and the "Continuous driving ... exceeds 4h30" violation always agree.
      const maxCont = maxContinuousDriving(activityRecord.value)
      if (maxCont > 0) bars.push(limBar(t('Continuous driving'), maxCont, 270))

      // Weekly driving (Mon-Sun containing this day)
      if (props.dayTs) {
        const d = new Date(props.dayTs * 1000)
        const dow = d.getUTCDay()
        const monday = props.dayTs - ((dow === 0 ? 6 : dow - 1) * 86400)
        const sunday = monday + 7 * 86400
        const weekRecords = dddStore.activityRecords.filter(
          (r) => r.activityRecordDate >= monday && r.activityRecordDate < sunday && r.activityChangeInfo?.length,
        )
        let weekDriving = 0
        for (const r of weekRecords) {
          const { totals: rt } = buildDaySegments(r.activityChangeInfo)
          weekDriving += rt.DRIVING || 0
        }
        if (weekDriving > 0) bars.push(limBar(t('Weekly driving'), weekDriving, 56 * 60))
      }

      return bars
    })

    const dayViolations = computed(() => {
      if (!settingsStore.showViolations || !activityRecord.value) return []
      const dayV = analyzeDayViolations(activityRecord.value, { isLastDay: isLastDay.value })
      // Daily driving (weekly allowance) + daily/weekly rest are computed across
      // days/midnight - pull this day's findings out by dayTs.
      const dayTs = activityRecord.value.activityRecordDate
      const spanning = [
        ...analyzeDailyDriving(dddStore.activityRecords),
        ...analyzeDailyRest(dddStore.activityRecords),
        ...analyzeWeeklyRest(dddStore.activityRecords),
      ].filter((v) => v.dayTs === dayTs)
      return [...dayV, ...spanning]
    })

    const dayStatusColor = computed(() => getDayStatus(dayViolations.value))

    // Clock spans of this day's continuous-driving violations - drives the period
    // label on the violation and the highlight on the activity timeline below.
    const continuousSpans = computed(() =>
      dayViolations.value
        .filter((v) => v.type === 'continuous-driving' && v.startMin != null)
        .map((v) => ({ start: v.startMin, end: v.endMin })),
    )
    const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    const segInContinuous = (seg) => {
      const e = seg.endMin == null ? 1440 : seg.endMin
      return continuousSpans.value.some((s) => seg.startMin < s.end && e > s.start)
    }

    // Hovering a violation with a clock span highlights that span on the timeline
    // (activity rows + the disc).
    const violationSpan = ref(null)
    const hoverViolation = (v) => {
      violationSpan.value = v && v.startMin != null ? { start: v.startMin, end: v.endMin } : null
    }
    const segInSpan = (seg) => {
      if (!violationSpan.value) return false
      const e = seg.endMin == null ? 1440 : seg.endMin
      return seg.startMin < violationSpan.value.end && e > violationSpan.value.start
    }
    const { openViolation } = useViolationDialog()


    const dayEvents = computed(() =>
      dddStore.eventRecords
        .filter((r) => r.eventBeginTime >= dayStart.value && r.eventBeginTime < dayEnd.value)
        .map((r, i) => ({
          id: i,
          ts: r.eventBeginTime,
          time: formatTimeOfDay(r.eventBeginTime),
          type: EVENT_TYPES[r.eventType] ? t(EVENT_TYPES[r.eventType]) : `${t('Unknown')} (${r.eventType})`,
        }))
        .sort((a, b) => a.ts - b.ts),
    )

    const dayFaults = computed(() =>
      dddStore.faultRecords
        .filter((r) => r.faultBeginTime >= dayStart.value && r.faultBeginTime < dayEnd.value)
        .map((r, i) => ({
          id: i,
          ts: r.faultBeginTime,
          time: formatTimeOfDay(r.faultBeginTime),
          type: FAULT_TYPES[r.faultType] ? t(FAULT_TYPES[r.faultType]) : `${t('Unknown')} (${r.faultType})`,
        }))
        .sort((a, b) => a.ts - b.ts),
    )

    const dayPlaces = computed(() =>
      dddStore.placeRecords
        .filter((r) => r.entryTime >= dayStart.value && r.entryTime < dayEnd.value)
        .map((r, i) => ({
          id: i,
          ts: r.entryTime,
          time: formatTimeOfDay(r.entryTime),
          country: r.dailyWorkPeriodCountry || '—',
          region: r.dailyWorkPeriodRegion || '',
          type: r.entryTypeDailyWorkPeriod || '',
        }))
        .sort((a, b) => a.ts - b.ts),
    )

    const dayConditions = computed(() =>
      dddStore.conditionRecords
        .filter((r) => r.entryTime >= dayStart.value && r.entryTime < dayEnd.value)
        .map((r, i) => ({
          id: i,
          ts: r.entryTime,
          time: formatTimeOfDay(r.entryTime),
          type: r.specificConditionType || '—',
        }))
        .sort((a, b) => a.ts - b.ts),
    )

    const dayBorders = computed(() =>
      dddStore.borderCrossingRecords
        .filter((r) => {
          const t = r.gnssPlaceAuthRecord?.timeStamp
          return t && t >= dayStart.value && t < dayEnd.value
        })
        .map((r, i) => {
          const geo = r.gnssPlaceAuthRecord?.geoCoordinates
          return {
            id: i,
            time: formatTimeOfDay(r.gnssPlaceAuthRecord.timeStamp),
            from: r.countryLeft || '—',
            to: r.countryEntered || '—',

            coords: geo ? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}` : '',
            badGeo: !!geo && !isValidGeo(geo),
          }
        }),
    )

    const dayCargo = computed(() =>
      dddStore.loadUnloadRecords
        .filter((r) => r.timeStamp >= dayStart.value && r.timeStamp < dayEnd.value)
        .map((r, i) => {
          const geo = r.gnssPlaceAuthRecord?.geoCoordinates
          return {
            id: i,
            time: formatTimeOfDay(r.timeStamp),
            opType: r.operationType,
            label: r.operationType === 1 ? t('Load') : t('Unload'),
            coords: geo ? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}` : '',
            badGeo: !!geo && !isValidGeo(geo),
          }
        }),
    )

    const dayControls = computed(() =>
      dddStore.controlActivityRecords
        .filter((r) => r.controlTime >= dayStart.value && r.controlTime < dayEnd.value)
        .map((r, i) => {
          const types = Object.entries(r.controlType || {}).filter(([, v]) => v).map(([k]) => k).join(', ')
          return {
            id: i,
            time: formatTimeOfDay(r.controlTime),
            type: types || '—',
          }
        }),
    )

    const dayDistance = computed(() => activityRecord.value?.activityDayDistance || 0)

    const dayGnss = computed(() =>
      dddStore.gnssRecords
        .filter((r) => {
          const t = r.gnssPlaceRecord?.timeStamp || r.timeStamp
          return t >= dayStart.value && t < dayEnd.value
        })
        .map((r) => {
          const geo = r.gnssPlaceRecord?.geoCoordinates
          return {
            lat: geo?.latitude,
            lon: geo?.longitude,
            valid: isValidGeo(geo), // out-of-range coords (parser overflow): kept in the list but not mapped
            time: formatTimeOfDay(r.gnssPlaceRecord?.timeStamp || r.timeStamp),
            accuracy: r.gnssPlaceRecord?.gnssAccuracy,
          }
        }),
    )

    // Prev/next day navigation
    const sortedDays = computed(() =>
      dddStore.activityRecords
        .filter((r) => r.activityChangeInfo?.length)
        .map((r) => r.activityRecordDate)
        .sort((a, b) => a - b),
    )

    const currentDayIndex = computed(() =>
      sortedDays.value.indexOf(props.dayTs),
    )

    const hasPrevDay = computed(() => currentDayIndex.value > 0)
    const hasNextDay = computed(() => currentDayIndex.value >= 0 && currentDayIndex.value < sortedDays.value.length - 1)

    const dayVehicle = computed(() => {
      const v = dddStore.vehicleRecords.find(
        (r) => r.vehicleFirstUse <= dayEnd.value && r.vehicleLastUse >= dayStart.value,
      )
      if (!v) return null
      const reg = v.vehicleRegistration
      const odomStart = isUnsetOdometer(v.vehicleOdometerBegin) ? null : v.vehicleOdometerBegin || null
      const odomEnd = isUnsetOdometer(v.vehicleOdometerEnd) ? null : v.vehicleOdometerEnd || null
      return {
        plateNumber: reg?.vehicleRegistrationNumber || '',
        nationCode: reg?.vehicleRegistrationNation ?? null,
        odomStart,
        odomEnd,
        odomDiff: odomStart != null && odomEnd != null && odomEnd > odomStart ? odomEnd - odomStart : null,
      }
    })

    function initDayMap() {
      if (dayMap) { dayMap.remove(); dayMap = null }
      if (!dayMapRef.value || !dayGnss.value.length) return

      dayMap = L.map(dayMapRef.value, { zoomControl: false, attributionControl: false })
      L.tileLayer(getTileUrl($q.dark.isActive), { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(dayMap)
      L.control.zoom({ position: 'topright' }).addTo(dayMap)
      addFullscreenControl(dayMap, dayMapRef.value)

      const points = dayGnss.value.filter((g) => g.valid)
      if (!points.length) return

      const latlngs = points.map((g) => [g.lat, g.lon])

      if (latlngs.length > 1) {
        L.polyline(latlngs, { color: '#ff5722', weight: 2, dashArray: '6,4', opacity: 0.7 }).addTo(dayMap)
      }

      points.forEach((g, i) => {
        const isFirst = i === 0
        const isLast = i === points.length - 1
        const color = isFirst ? '#4caf50' : isLast ? '#ff5722' : '#03a9f4'
        L.circleMarker([g.lat, g.lon], { radius: isFirst || isLast ? 6 : 4, color, fillColor: color, fillOpacity: 0.9, weight: 1 })
          .bindTooltip(`${g.time}`, { direction: 'top', offset: [0, -6] })
          .addTo(dayMap)
      })

      if (latlngs.length === 1) {
        dayMap.setView(latlngs[0], 8)
      } else {
        dayMap.fitBounds(L.latLngBounds(latlngs).pad(0.15), { maxZoom: 10 })
      }
    }

    watch([() => props.dayTs, show], async ([ts, visible]) => {
      if (ts && visible) {
        await nextTick()
        await nextTick()
        initDayMap()
      } else if (dayMap) {
        dayMap.remove()
        dayMap = null
      }
    })

    onBeforeUnmount(() => {
      if (dayMap) { dayMap.remove(); dayMap = null }
    })

    function goDay(delta) {
      const idx = currentDayIndex.value + delta
      if (idx >= 0 && idx < sortedDays.value.length) {
        emit('navigate', sortedDays.value[idx])
      }
    }

    return {
      daySpeedBlocks,
      authorisedSpeed,
      show,
      highlightIndex,
      dayMapRef,
      dateStr,
      segments,
      dayLimits,
      dayEvents,
      dayFaults,
      dayPlaces,
      dayConditions,
      dayBorders,
      dayCargo,
      dayControls,
      dayVehicle,
      dayDistance,
      dayGnss,
      hasPrevDay,
      hasNextDay,
      goDay,
      activityRecord,
      isLastDay,
      dayViolations,
      dayStatusColor,
      fmtMin,
      segInContinuous,
      violationSpan,
      hoverViolation,
      segInSpan,
      openViolation,
      settingsStore,
    }
  },
})
</script>

<style scoped>
.day-map {
  height: 200px;
  border-radius: 4px;
  border: 1px solid var(--dd-border);
}

.limits-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.limit-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.limit-bar-bg {
  height: 6px;
  background: var(--dd-border);
  border-radius: 3px;
  overflow: hidden;
}

.limit-bar {
  height: 100%;
  border-radius: 3px;
}

.limit-label {
  display: flex;
  justify-content: space-between;
}

.disc-and-radar {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.disc-area {
  flex-shrink: 0;
  width: 180px;
}

.radar-area {
  flex-shrink: 0;
  width: 160px;
  padding: 0;
}

@media (max-width: 500px) {
  .disc-and-radar {
    flex-direction: column;
    align-items: center;
  }
  .disc-area {
    width: 160px;
  }
}

.day-detail-card {
  --dd-border: rgba(255, 255, 255, 0.08);
  --dd-border-light: rgba(255, 255, 255, 0.05);
  --dd-hover: rgba(255, 255, 255, 0.08);
  --dd-muted: rgba(255, 255, 255, 0.7);
  width: 580px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.body--light .day-detail-card {
  --dd-border: rgba(0, 0, 0, 0.12);
  --dd-border-light: rgba(0, 0, 0, 0.06);
  --dd-hover: rgba(0, 0, 0, 0.06);
  --dd-muted: rgba(0, 0, 0, 0.54);
}

.day-detail-header {
  flex-shrink: 0;
}

.day-detail-top {
  flex-shrink: 0;
  border-bottom: 1px solid var(--dd-border);
}

.day-detail-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.detail-list {
  border: 1px solid var(--dd-border);
  border-radius: 4px;
  overflow: hidden;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--dd-border-light);
}

.detail-row:last-child {
  border-bottom: none;
}

.activity-row {
  cursor: default;
  transition: background 0.15s ease;
}

.activity-row:hover,
.activity-row-active {
  background: var(--dd-hover);
}

/* Segments inside a continuous-driving (Art.7) violation stretch. */
.activity-row-continuous {
  box-shadow: inset 3px 0 0 var(--sev-very-serious);
  background: color-mix(in srgb, var(--sev-very-serious) 8%, transparent);
}

/* Stronger highlight while hovering the corresponding violation. */
.activity-row-span {
  background: color-mix(in srgb, var(--sev-very-serious) 22%, transparent);
}

.violation-hoverable {
  cursor: pointer;
}
.violation-hoverable:hover {
  background: var(--dd-hover);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

.dot.dot-card-out {
  opacity: 0.45;
  outline: 1px dashed rgba(128, 128, 128, 0.8);
  outline-offset: 1px;
}

.time-col {
  min-width: 95px;
  flex-shrink: 0;
  color: var(--dd-muted);
}
</style>
