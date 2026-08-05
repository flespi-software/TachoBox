<template>
  <q-page class="index-page">
    <template v-if="dddStore.raw">
      <div class="page-layout">
        <div class="main-panel">
          <q-banner
            v-for="(warn, i) in dddStore.warnings"
            :key="i"
            dense
            inline-actions
            class="bg-warning text-dark text-caption q-mb-xs warning-banner"
          >
            <template #avatar><q-icon name="mdi-alert" color="dark" /></template>
            {{ typeof warn === 'string' ? warn : $t(warn.key, warn.params) }}
          </q-banner>

          <div
            v-if="driverInfoOpen"
            ref="driverInfoRef"
            class="driver-info-wrapper"
            :style="driverInfoStyle"
          >
            <DriverInfo :data="dddStore.raw" />
          </div>

          <q-card flat bordered class="data-card column no-wrap">
            <div class="row no-wrap items-center no-print">
              <q-tabs
                ref="tabsRef"
                v-model="tab"
                dense
                align="left"
                active-color="primary"
                indicator-color="primary"
                class="col"
              >
                <q-tab v-if="isTabVisible('overview')" name="overview" icon="mdi-chart-box-outline">
                  <span>{{ $t('Overview') }}</span>
                  <q-tooltip>{{ $t('Activity heatmap and driver profile radar') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="isTabVisible('activities')" name="activities" icon="mdi-chart-timeline">
                  <span
                    >{{ $t('Activities') }}
                    <q-badge v-if="dddStore.activityRecords.length" color="primary" floating>{{
                      dddStore.activityRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Daily driving, work, rest and availability records') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="isTabVisible('vehicles')" name="vehicles" icon="mdi-truck">
                  <span
                    >{{ $t('Vehicles') }}
                    <q-badge v-if="dddStore.vehicleRecords.length" color="primary" floating>{{
                      dddStore.vehicleRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Vehicles used by the driver with odometer readings') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="isTabVisible('places')" name="places" icon="mdi-map-marker">
                  <span
                    >{{ $t('Places') }}
                    <q-badge v-if="dddStore.placeRecords.length" color="primary" floating>{{
                      dddStore.placeRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Work period start/end locations by country') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="isTabVisible('events')" name="events" icon="mdi-alert-circle-outline">
                  <span
                    >{{ $t('Events') }}
                    <q-badge v-if="dddStore.eventRecords.length" color="primary" floating>{{
                      dddStore.eventRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Card insertions, power interruptions, security breaches') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="isTabVisible('faults')" name="faults" icon="mdi-alert-octagon-outline">
                  <span
                    >{{ $t('Faults') }}
                    <q-badge v-if="dddStore.faultRecords.length" color="primary" floating>{{
                      dddStore.faultRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Recording equipment and sensor faults') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="isTabVisible('conditions')" name="conditions" icon="mdi-shield-check-outline">
                  <span
                    >{{ $t('Conditions') }}
                    <q-badge v-if="dddStore.conditionRecords.length" color="primary" floating>{{
                      dddStore.conditionRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip
                    >{{ $t('Out of scope, ferry/train crossings and other special conditions') }}</q-tooltip
                  >
                </q-tab>
                <q-tab v-if="isTabVisible('compliance')" name="compliance" icon="mdi-shield-check">
                  <span>{{ $t('Compliance') }}
                    <q-badge v-if="complianceTotal" :color="overviewAlerts.violations ? 'red' : 'orange'" floating>{{ complianceTotal }}</q-badge>
                  </span>
                  <q-tooltip>{{ $t('EU 561/2006 violations, remaining hours, anomalies') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.companyLocks && isTabVisible('locks')" name="locks" icon="mdi-domain">
                  <span
                    >{{ $t('Companies') }}
                    <q-badge color="primary" floating>{{
                      dddStore.companyLocksRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Company lock/unlock history for the vehicle unit') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.downloads && isTabVisible('downloads')" name="downloads" icon="mdi-download">
                  <span
                    >{{ $t('Downloads') }}
                    <q-badge color="primary" floating>{{
                      dddStore.downloadActivityRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('VU data download history') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.borders && isTabVisible('borders')" name="borders" icon="mdi-boom-gate-up">
                  <span
                    >{{ $t('Borders') }}
                    <q-badge color="primary" floating>{{
                      dddStore.borderCrossingRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Border crossing records with GPS coordinates') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.cargo && isTabVisible('cargo')" name="cargo" icon="mdi-package-variant">
                  <span
                    >{{ $t('Cargo') }}
                    <q-badge color="primary" floating>{{
                      dddStore.loadUnloadRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Load/unload operations with GPS coordinates') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.controls && isTabVisible('controls')" name="controls" icon="mdi-police-badge-outline">
                  <span
                    >{{ $t('Controls') }}
                    <q-badge color="primary" floating>{{
                      dddStore.controlActivityRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Roadside inspection and control records') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.drivers && isTabVisible('drivers')" name="drivers" icon="mdi-account-multiple">
                  <span
                    >{{ $t('Drivers') }}
                    <q-badge color="primary" floating>{{
                      dddStore.driverRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('Driver cards used in this vehicle unit') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.speed && isTabVisible('speed')" name="speed" icon="mdi-speedometer">
                  <span>{{ $t('Speed') }}</span>
                  <q-tooltip>{{ $t('Per-second speed recorded by the vehicle unit') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.technical && isTabVisible('technical')" name="technical" icon="mdi-cog-outline">
                  <span>{{ $t('Technical') }}</span>
                  <q-tooltip>{{ $t('Vehicle unit identification, calibrations and paired sensors') }}</q-tooltip>
                </q-tab>
                <q-tab v-if="dddStore.unfilteredCounts.mapPoints && isTabVisible('map')" name="map" icon="mdi-map">
                  <span
                    >{{ $t('Map') }}
                    <q-badge color="primary" floating>{{
                      dddStore.gnssRecords.length + dddStore.borderCrossingRecords.length + dddStore.loadUnloadRecords.length
                    }}</q-badge></span
                  >
                  <q-tooltip>{{ $t('GNSS waypoints and work period locations on map') }}</q-tooltip>
                </q-tab>
              </q-tabs>
              <q-btn-toggle
                v-if="dddStore.hasG1 && dddStore.hasG2"
                v-model="dddStore.activeGen"
                flat
                dense
                no-caps
                toggle-color="primary"
                :options="[
                  { label: $t('G1'), value: 'g1' },
                  { label: $t('G2'), value: 'g2' },
                ]"
                class="q-mr-xs"
              />
              <q-btn
                flat
                dense
                round
                :icon="driverInfoOpen ? (dddStore.sourceType === 'vu-daily' ? 'mdi-truck-check' : 'mdi-account-check') : (dddStore.sourceType === 'vu-daily' ? 'mdi-truck-outline' : 'mdi-account-outline')"
                @click="driverInfoOpen = !driverInfoOpen"
              >
                <q-tooltip>{{ dddStore.sourceType === 'vu-daily' ? $t('Toggle Vehicle Info') : $t('Toggle Driver Info') }}</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                :icon="calendarOpen ? 'mdi-calendar-check' : 'mdi-calendar-month'"
                @click="calendarOpen = !calendarOpen"
              >
                <q-tooltip>{{ $t('Toggle Sidebar') }}</q-tooltip>
              </q-btn>
              <q-btn
                v-if="!noPrint"
                flat
                dense
                round
                icon="mdi-printer"
                @click="printPage"
                class="q-mr-xs no-print"
              >
                <q-tooltip>{{ $t('Print / PDF') }}</q-tooltip>
              </q-btn>
            </div>

            <q-separator />

            <q-tab-panels v-model="tab" animated class="col data-panels no-print">
              <q-tab-panel name="overview" class="q-pa-none" style="overflow-y: auto">
                <div class="overview-content">
                  <div v-if="overviewAlerts.violations || overviewAlerts.usage || overviewAlerts.anomalies || overviewAlerts.uncertain" class="overview-alerts q-px-sm q-pt-sm">
                    <span v-if="overviewAlerts.violations" class="alert-chip" :class="overviewAlerts.violationColor" @click="tab = 'compliance'">
                      <q-icon name="mdi-shield-alert" size="xs" />
                      {{ overviewAlerts.violations }} {{ overviewAlerts.violations !== 1 ? $t('violations') : $t('violation') }}
                    </span>
                    <span v-if="overviewAlerts.usage" class="alert-chip sev-serious" @click="tab = 'compliance'">
                      <q-icon name="mdi-card-account-details-outline" size="xs" />
                      {{ overviewAlerts.usage }} {{ $t('Usage errors') }}
                    </span>
                    <span v-if="overviewAlerts.uncertain" class="alert-chip sev-uncertain" @click="tab = 'compliance'">
                      <q-icon name="mdi-help-circle-outline" size="xs" />
                      {{ overviewAlerts.uncertain }} {{ $t('uncertain') }}
                    </span>
                    <span v-if="overviewAlerts.anomalies" class="alert-chip sev-warning" @click="tab = 'compliance'">
                      <q-icon name="mdi-magnify-scan" size="xs" />
                      {{ overviewAlerts.anomalies }} {{ overviewAlerts.anomalies !== 1 ? $t('anomalies') : $t('anomaly') }}
                    </span>
                  </div>
                  <div v-if="vehicleSummary.length" class="vehicle-summary">
                    <div class="text-subtitle2 q-mb-xs">
                      <q-icon name="mdi-truck" size="xs" class="q-mr-xs" />
                      {{ $t('Vehicles') }}
                    </div>
                    <div class="vehicle-list">
                      <div v-for="v in vehicleSummary" :key="v.plate" class="vehicle-item">
                        <EuroPlate v-if="v.plate" :number="v.plate" :nation="v.nation" />
                        <span v-else class="text-caption text-grey">{{ $t('Unknown') }}</span>
                        <span class="text-caption text-grey">{{ v.period }}</span>
                        <span class="text-caption text-bold">{{ v.distance }}</span>
                      </div>
                    </div>
                  </div>
                  <DistanceChart
                    v-if="dddStore.activityRecords.length"
                    :records="dddStore.activityRecords"
                    @day-click="onDayClick"
                  />
                  <div class="overview-layout">
                    <ActivityHeatmap
                      v-if="dddStore.activityRecords.length"
                      :records="dddStore.activityRecords"
                      @day-click="onDayClick"
                      class="overview-heatmap"
                    />
                    <ActivityRadar
                      v-if="dddStore.activityRecords.length"
                      :records="dddStore.activityRecords"
                      class="overview-radar"
                    />
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name="activities" class="q-pa-none column no-wrap">
                <div class="row no-wrap items-center q-px-xs q-gutter-x-sm" style="flex-shrink: 0">
                  <span
                    v-for="item in activityLegend"
                    :key="item.activity"
                    class="activity-legend-item"
                    :class="{ 'legend-hidden': hiddenActivities.has(item.activity) }"
                    @click="toggleActivity(item.activity)"
                  >
                    <span class="legend-dot" :class="item.cls" />
                    <q-icon :name="item.icon" size="xs" />
                    {{ item.label }}
                  </span>
                  <span class="activity-legend-item legend-static">
                    <span class="legend-dot legend-dot-card-out" />
                    {{ $t('card not inserted') }}
                  </span>
                  <q-space />
                  <q-btn-toggle
                    v-model="activityView"
                    flat
                    dense
                    no-caps
                    toggle-color="primary"
                    :options="[
                      { icon: 'mdi-table', value: 'table', slot: 'table' },
                      { icon: 'mdi-chart-gantt', value: 'timeline', slot: 'timeline' },
                    ]"
                    size="sm"
                  >
                    <template #table><q-tooltip>{{ $t('Table view') }}</q-tooltip></template>
                    <template #timeline><q-tooltip>{{ $t('Timeline view') }}</q-tooltip></template>
                  </q-btn-toggle>
                </div>
                <ActivityTable
                  v-if="activityView === 'table'"
                  ref="activityTableRef"
                  :records="dddStore.activityRecords"
                  :tableStyle="activityTableStyle"
                  :hiddenActivities="hiddenActivities"
                  :dayAlerts="dayAlerts"
                  :dayEvents="dayEvents"
                  @visible-date="onVisibleDate"
                  @day-click="onDayClick"
                  class="col"
                />
                <ActivityTimeline
                  v-else
                  ref="timelineRef"
                  :records="dddStore.activityRecords"
                  :hiddenActivities="hiddenActivities"
                  @day-click="onDayClick"
                  class="col"
                />
              </q-tab-panel>

              <q-tab-panel name="vehicles" class="q-pa-none column no-wrap">
                <div
                  v-if="vuSummary.length"
                  class="q-pa-xs row items-center q-gutter-x-md text-caption"
                  style="flex-shrink: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.1)"
                >
                  <span v-for="(vu, i) in vuSummary" :key="i" class="no-wrap">
                    <q-icon name="mdi-chip" size="xs" class="q-mr-xs text-grey" />
                    {{ $t('VU #') }}{{ vu.deviceID }}
                    <span class="text-grey q-mx-xs">|</span>
                    {{ $t('Manufacturer:') }} {{ vu.manufacturer }}
                    <span class="text-grey q-mx-xs">|</span>
                    {{ $t('Software:') }} {{ vu.software }}
                    <span class="text-grey q-mx-xs">|</span>
                    {{ vu.period }}
                    <q-tooltip v-if="vu.details.length > 1" anchor="bottom middle" self="top middle">
                      <div v-for="(d, j) in vu.details" :key="j" class="no-wrap">
                        {{ $t('Software:') }} {{ d.version }} — {{ d.date }}
                      </div>
                    </q-tooltip>
                  </span>
                </div>
                <VehiclesTable
                  :records="dddStore.vehicleRecords"
                  :tableStyle="tableStyle"
                  class="col"
                />
              </q-tab-panel>

              <q-tab-panel name="places" class="q-pa-none column no-wrap">
                <PlacesMap
                  v-if="placeCountries.length"
                  :countries="placeCountries"
                  :highlightCountry="hoveredCountry"
                  style="height: 40%; min-height: 150px; flex-shrink: 0"
                />
                <PlacesTable
                  :records="dddStore.placeRecords"
                  :authRecords="dddStore.placesAuthRecords"
                  tableStyle="height: 100%"
                  @day-click="onDayClick"
                  @row-hover="hoveredCountry = $event"
                  class="col"
                />
              </q-tab-panel>

              <q-tab-panel name="events" class="q-pa-none">
                <EventsTable
                  :records="dddStore.eventRecords"
                  :tableStyle="tableStyle"
                  @day-click="onDayClick"
                />
              </q-tab-panel>

              <q-tab-panel name="faults" class="q-pa-none">
                <FaultsTable
                  :records="dddStore.faultRecords"
                  :tableStyle="tableStyle"
                  @day-click="onDayClick"
                />
              </q-tab-panel>

              <q-tab-panel name="conditions" class="q-pa-none">
                <SpecialConditions
                  :records="dddStore.conditionRecords"
                  :tableStyle="tableStyle"
                  @day-click="onDayClick"
                />
              </q-tab-panel>

              <q-tab-panel name="compliance" class="q-pa-none" style="overflow-y: auto">
                <CompliancePanel @day-click="onDayClick" />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.companyLocks" name="locks" class="q-pa-none">
                <CompanyLocksTable
                  :records="dddStore.companyLocksRecords"
                  :tableStyle="tableStyle"
                />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.downloads" name="downloads" class="q-pa-none">
                <DownloadActivityTable
                  :records="dddStore.downloadActivityRecords"
                  :tableStyle="tableStyle"
                />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.borders" name="borders" class="q-pa-none column no-wrap">
                <PointsMap
                  :points="borderMapPoints"
                  :highlightIndex="borderHover"
                  style="height: 40%; min-height: 150px; flex-shrink: 0"
                />
                <BorderCrossingsTable
                  :records="dddStore.borderCrossingRecords"
                  tableStyle="height: 100%"
                  @day-click="onDayClick"
                  @row-hover="borderHover = $event"
                  class="col"
                />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.cargo" name="cargo" class="q-pa-none column no-wrap">
                <PointsMap
                  :points="cargoMapPoints"
                  :highlightIndex="cargoHover"
                  style="height: 40%; min-height: 150px; flex-shrink: 0"
                />
                <LoadUnloadTable
                  :records="dddStore.loadUnloadRecords"
                  tableStyle="height: 100%"
                  @day-click="onDayClick"
                  @row-hover="cargoHover = $event"
                  class="col"
                />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.controls" name="controls" class="q-pa-none">
                <ControlActivityTable
                  :records="dddStore.controlActivityRecords"
                  :tableStyle="tableStyle"
                />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.drivers" name="drivers" class="q-pa-none">
                <DriversTable
                  :records="dddStore.driverRecords"
                  :tableStyle="tableStyle"
                  @day-click="onDayClick"
                />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.speed" name="speed" class="q-pa-none">
                <SpeedPanel :blocks="dddStore.speedBlocks" :authorised-speed="dddStore.authorisedSpeed" :activity-records="dddStore.activityRecords" />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.technical" name="technical" class="q-pa-none">
                <TechnicalDataPanel :data="dddStore.technicalData" />
              </q-tab-panel>

              <q-tab-panel v-if="dddStore.unfilteredCounts.mapPoints" name="map" class="q-pa-none">
                <GnssMap
                  :records="dddStore.gnssRecords"
                  :placeRecords="dddStore.placeRecords"
                  :borderCrossingRecords="dddStore.borderCrossingRecords"
                  :loadUnloadRecords="dddStore.loadUnloadRecords"
                  @day-click="onDayClick"
                />
              </q-tab-panel>
            </q-tab-panels>

            <!-- Print-only: all sections rendered at once -->
            <div v-if="printMode" class="print-all-sections">
              <div class="print-section">
                <div class="print-title">{{ $t('Overview') }}</div>
                <div v-if="vehicleSummary.length" class="vehicle-summary">
                  <div class="vehicle-list">
                    <div v-for="v in vehicleSummary" :key="v.plate" class="vehicle-item">
                      <EuroPlate v-if="v.plate" :number="v.plate" :nation="v.nation" />
                      <span v-else class="text-caption text-grey">{{ $t('Unknown') }}</span>
                      <span class="text-caption text-grey">{{ v.period }}</span>
                      <span class="text-caption text-bold">{{ v.distance }}</span>
                    </div>
                  </div>
                </div>
                <DistanceChart v-if="dddStore.activityRecords.length" :records="dddStore.activityRecords" />
                <div v-if="dddStore.activityRecords.length" class="overview-layout">
                  <ActivityHeatmap :records="dddStore.activityRecords" class="overview-heatmap" />
                  <ActivityRadar :records="dddStore.activityRecords" class="overview-radar" />
                </div>
              </div>

              <div v-if="dddStore.activityRecords.length" class="print-section">
                <div class="print-title">{{ $t('Activities') }}</div>
                <ActivityTable
                  :records="dddStore.activityRecords"
                  :hiddenActivities="hiddenActivities"
                  :dayAlerts="dayAlerts"
                  :dayEvents="dayEvents"
                />
              </div>

              <div v-if="dddStore.vehicleRecords.length" class="print-section">
                <div class="print-title">{{ $t('Vehicles') }}</div>
                <VehiclesTable :records="dddStore.vehicleRecords" />
              </div>

              <div v-if="dddStore.placeRecords.length" class="print-section">
                <div class="print-title">{{ $t('Places') }}</div>
                <PlacesTable :records="dddStore.placeRecords" :authRecords="dddStore.placesAuthRecords" />
              </div>

              <div v-if="dddStore.eventRecords.length" class="print-section">
                <div class="print-title">{{ $t('Events') }}</div>
                <EventsTable :records="dddStore.eventRecords" />
              </div>

              <div v-if="dddStore.faultRecords.length" class="print-section">
                <div class="print-title">{{ $t('Faults') }}</div>
                <FaultsTable :records="dddStore.faultRecords" />
              </div>

              <div v-if="dddStore.conditionRecords.length" class="print-section">
                <div class="print-title">{{ $t('Conditions') }}</div>
                <SpecialConditions :records="dddStore.conditionRecords" />
              </div>

              <div class="print-section">
                <div class="print-title">{{ $t('Compliance') }}</div>
                <CompliancePanel />
              </div>

              <div v-if="dddStore.unfilteredCounts.companyLocks" class="print-section">
                <div class="print-title">{{ $t('Companies') }}</div>
                <CompanyLocksTable :records="dddStore.companyLocksRecords" />
              </div>

              <div v-if="dddStore.unfilteredCounts.downloads" class="print-section">
                <div class="print-title">{{ $t('Downloads') }}</div>
                <DownloadActivityTable :records="dddStore.downloadActivityRecords" />
              </div>

              <div v-if="dddStore.unfilteredCounts.borders" class="print-section">
                <div class="print-title">{{ $t('Borders') }}</div>
                <BorderCrossingsTable :records="dddStore.borderCrossingRecords" />
              </div>

              <div v-if="dddStore.unfilteredCounts.cargo" class="print-section">
                <div class="print-title">{{ $t('Cargo') }}</div>
                <LoadUnloadTable :records="dddStore.loadUnloadRecords" />
              </div>

              <div v-if="dddStore.unfilteredCounts.controls" class="print-section">
                <div class="print-title">{{ $t('Controls') }}</div>
                <ControlActivityTable :records="dddStore.controlActivityRecords" />
              </div>

              <div v-if="dddStore.unfilteredCounts.drivers" class="print-section">
                <div class="print-title">{{ $t('Drivers') }}</div>
                <DriversTable :records="dddStore.driverRecords" />
              </div>

              <div v-if="dddStore.unfilteredCounts.speed" class="print-section">
                <div class="print-title">{{ $t('Speed') }}</div>
                <SpeedPanel :blocks="dddStore.speedBlocks" :authorised-speed="dddStore.authorisedSpeed" :activity-records="dddStore.activityRecords" />
              </div>

              <div v-if="dddStore.unfilteredCounts.technical" class="print-section">
                <div class="print-title">{{ $t('Technical') }}</div>
                <TechnicalDataPanel :data="dddStore.technicalData" />
              </div>
            </div>
          </q-card>
        </div>

        <q-card v-if="calendarOpen && !hideCalendar" flat bordered class="calendar-panel">
          <ActivityCalendar
            v-if="dddStore.activityRecords.length"
            ref="calendarRef"
            :records="dddStore.activityRecords"
            @day-click="onDayClick"
          />
        </q-card>
      </div>
      <DateRangeBar />
    </template>

    <div v-else class="flex flex-center column q-pt-xl" style="height: 100%">
      <template v-if="dddStore.loadError?.kind === 'not-parsed'">
        <q-icon name="mdi-file-clock-outline" size="4em" color="grey-7" />
        <div class="text-h6 text-grey-7 q-mt-md">{{ $t('File not processed') }}</div>
        <div
          v-if="whiteLabel"
          class="text-caption text-grey q-mt-sm q-mb-md text-center"
          style="max-width: 520px; line-height: 1.5"
          v-html="$t('File {name} exists on the device but has not been parsed yet. Download the raw file to inspect it elsewhere.', { name: '<span class=&quot;text-bold&quot;>' + dddStore.loadError.fileName + '</span>' })"
        ></div>
        <div
          v-else
          class="text-caption text-grey q-mt-sm q-mb-md text-center"
          style="max-width: 520px; line-height: 1.5"
          v-html="$t('File {name} exists on the device but has not been parsed by the <a href=&quot;https://flespi.com/kb/tacho-file-parse-plugin&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot; class=&quot;text-primary&quot;>tacho-file-parse plugin</a>. Configure the plugin on the device to view its contents here, or download the raw file to inspect it elsewhere.', { name: '<span class=&quot;text-bold&quot;>' + dddStore.loadError.fileName + '</span>' })"
        ></div>
        <div class="row q-gutter-sm">
          <q-btn
            color="primary"
            icon="mdi-download"
            :label="$t('Download raw file')"
            no-caps
            unelevated
            @click="downloadRawFile"
          />
          <q-btn flat no-caps :label="$t('Dismiss')" @click="dddStore.clearLoadError()" />
        </div>
      </template>
      <template v-else-if="dddStore.loading">
        <q-spinner-dots size="3em" color="grey-7" />
        <div class="text-caption text-grey q-mt-md">{{ $t('Loading...') }}</div>
      </template>
      <template v-else>
        <q-icon name="mdi-file-document-outline" size="4em" color="grey-7" />
        <div class="text-h6 text-grey-7 q-mt-md">{{ $t('No data loaded') }}</div>
        <div v-if="!hidePanels" class="text-caption text-grey q-mb-lg">
          {{ $t('Use the menu to load a DDD JSON file or try the demo data') }}
        </div>
        <q-banner v-if="!hideDisclaimer && !whiteLabel" class="bg-orange-9 text-white q-mx-lg" rounded dense style="max-width: 520px">
          <template #avatar>
            <q-icon name="mdi-alert-circle" color="white" />
          </template>
          {{ $t('This is not an official DDD file viewer. It is just a way to explore and evaluate the contents of a tachograph file. The data displayed should not be used for legal or regulatory purposes.') }}
        </q-banner>
      </template>
    </div>
    <DayDetailDialog
      :dayTs="detailDayTs"
      @hide="detailDayTs = null"
      @navigate="detailDayTs = $event"
    />
    <ViolationDetailDialog @open-day="onDayClick" />
  </q-page>
</template>

<script>
import { defineComponent, ref, computed, provide, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import DriverInfo from 'src/components/DriverInfo.vue'
import ActivityTable from 'src/components/ActivityTable.vue'
import VehiclesTable from 'src/components/VehiclesTable.vue'
import PlacesTable from 'src/components/PlacesTable.vue'
import EventsTable from 'src/components/EventsTable.vue'
import FaultsTable from 'src/components/FaultsTable.vue'
import SpecialConditions from 'src/components/SpecialConditions.vue'
import ActivityCalendar from 'src/components/ActivityCalendar.vue'
import ActivityTimeline from 'src/components/ActivityTimeline.vue'
import PlacesMap from 'src/components/PlacesMap.vue'
import GnssMap from 'src/components/GnssMap.vue'
import CompanyLocksTable from 'src/components/CompanyLocksTable.vue'
import DownloadActivityTable from 'src/components/DownloadActivityTable.vue'
import BorderCrossingsTable from 'src/components/BorderCrossingsTable.vue'
import LoadUnloadTable from 'src/components/LoadUnloadTable.vue'
import ControlActivityTable from 'src/components/ControlActivityTable.vue'
import DriversTable from 'src/components/DriversTable.vue'
import TechnicalDataPanel from 'src/components/TechnicalDataPanel.vue'
import SpeedPanel from 'src/components/SpeedPanel.vue'
import PointsMap from 'src/components/PointsMap.vue'
import DateRangeBar from 'src/components/DateRangeBar.vue'
import DayDetailDialog from 'src/components/DayDetailDialog.vue'
import ViolationDetailDialog from 'src/components/ViolationDetailDialog.vue'
import CompliancePanel from 'src/components/CompliancePanel.vue'
import ActivityHeatmap from 'src/components/ActivityHeatmap.vue'
import ActivityRadar from 'src/components/ActivityRadar.vue'
import DistanceChart from 'src/components/DistanceChart.vue'
import EuroPlate from 'src/components/EuroPlate.vue'
import { useDddStore } from 'src/stores/ddd'
import { useAuthStore } from 'src/stores/auth'
import { ACTIVITY_CLS } from 'src/utils/activity'
import { isValidGeo } from 'src/utils/geo'
import { downloadMediaFile } from 'src/utils/media'
import { formatDate, formatDateTime, dayStart, MAX_TS, MAX_ODO } from 'src/utils/format'
import { analyzeDayViolations, analyzeDailyDriving, analyzeDailyRest, analyzeWeeklyRest, detectAnomalies, detectUsageErrors } from 'src/compliance'

const GAP = 8
const SEPARATOR = 1
const CARD_BORDER = 2
const PAGE_PADDING = 8

export default defineComponent({
  name: 'IndexPage',
  components: {
    DriverInfo,
    ActivityTable,
    VehiclesTable,
    PlacesTable,
    EventsTable,
    FaultsTable,
    SpecialConditions,
    ActivityCalendar,
    ActivityTimeline,
    PlacesMap,
    GnssMap,
    CompanyLocksTable,
    DownloadActivityTable,
    BorderCrossingsTable,
    LoadUnloadTable,
    ControlActivityTable,
    DriversTable,
    TechnicalDataPanel,
    SpeedPanel,
    PointsMap,
    DateRangeBar,
    DayDetailDialog,
    ViolationDetailDialog,
    CompliancePanel,
    ActivityHeatmap,
    ActivityRadar,
    DistanceChart,
    EuroPlate,
  },
  setup() {
    const { t } = useI18n()
    const dddStore = useDddStore()
    const authStore = useAuthStore()
    const route = useRoute()
    const $q = useQuasar()

    const activityLegend = computed(() => [
      { label: t('Driving'), activity: 'DRIVING', cls: ACTIVITY_CLS.DRIVING, icon: 'mdi-steering' },
      { label: t('Work'), activity: 'WORK', cls: ACTIVITY_CLS.WORK, icon: 'mdi-hammer-wrench' },
      { label: t('Availability'), activity: 'AVAILABILITY', cls: ACTIVITY_CLS.AVAILABILITY, icon: 'mdi-clock-outline' },
      { label: t('Rest'), activity: 'BREAK/REST', cls: ACTIVITY_CLS['BREAK/REST'], icon: 'mdi-sleep' },
    ])

    async function downloadRawFile() {
      const err = dddStore.loadError
      if (!err) return
      try {
        await downloadMediaFile(err.fileUuid, err.fileName, authStore.token)
      } catch (e) {
        $q.notify({ type: 'negative', message: t('Download failed', { error: e.message }) })
      }
    }

    // Query params
    const allowedTabs = computed(() => {
      const t = route.query.tabs
      return t ? new Set(t.split(',')) : null
    })
    const hideCalendar = computed(() => route.query.hidecalendar === '1' || route.query.hidecalendar === 'true')
    const hideDisclaimer = computed(() => route.query.hidedisclaimer === '1' || route.query.hidedisclaimer === 'true')
    const hidePanels = computed(() => route.query.hidepanels === '1' || route.query.hidepanels === 'true')
    const whiteLabel = computed(() => route.query.whitelabel === '1' || route.query.whitelabel === 'true')
    const noPrint = computed(() => route.query.noprint === '1' || route.query.noprint === 'true')
    const initialDay = computed(() => {
      const d = route.query.day
      return d ? Number(d) : null
    })

    const ALL_TABS = ['overview', 'activities', 'vehicles', 'places', 'events', 'faults', 'conditions', 'compliance', 'locks', 'downloads', 'borders', 'cargo', 'controls', 'drivers', 'speed', 'technical', 'map']
    function isTabVisible(name) {
      return !allowedTabs.value || allowedTabs.value.has(name)
    }

    const defaultTab = computed(() => {
      const qTab = route.query.tab
      if (qTab && ALL_TABS.includes(qTab)) return qTab
      if (allowedTabs.value) {
        for (const t of ALL_TABS) { if (allowedTabs.value.has(t)) return t }
      }
      return 'overview'
    })

    const tab = ref(defaultTab.value)
    const activityView = ref('table')
    const hiddenActivities = ref(new Set())

    function toggleActivity(activity) {
      const s = new Set(hiddenActivities.value)
      if (s.has(activity)) s.delete(activity)
      else s.add(activity)
      hiddenActivities.value = s
    }
    const MIN_VALID_TS = 946684800 // 2000-01-01 - drop sentinel "epoch" first-use dates
    const vehicleSummary = computed(() => {
      const records = dddStore.vehicleRecords
      if (!records.length) return []
      const grouped = {}
      for (const r of records) {
        if (r.vehicleFirstUse < MIN_VALID_TS) continue
        const plate = r.vehicleRegistration?.vehicleRegistrationNumber || ''
        const nation = r.vehicleRegistration?.vehicleRegistrationNation || ''
        const key = plate || 'unknown'
        if (!grouped[key])
          grouped[key] = { plate, nation, minTs: Infinity, maxTs: 0, minOdom: Infinity, maxOdom: 0 }
        const g = grouped[key]
        g.minTs = Math.min(g.minTs, r.vehicleFirstUse)
        if (r.vehicleLastUse < MAX_TS) g.maxTs = Math.max(g.maxTs, r.vehicleLastUse)
        const odomBegin =
          r.vehicleOdometerBegin && r.vehicleOdometerBegin < MAX_ODO ? r.vehicleOdometerBegin : 0
        const odomEnd =
          r.vehicleOdometerEnd && r.vehicleOdometerEnd < MAX_ODO ? r.vehicleOdometerEnd : 0
        if (odomBegin) g.minOdom = Math.min(g.minOdom, odomBegin)
        if (odomEnd) g.maxOdom = Math.max(g.maxOdom, odomEnd)
      }
      return Object.values(grouped)
        .sort((a, b) => b.maxTs - a.maxTs)
        .map((g) => {
          const diff = g.maxOdom > g.minOdom && g.minOdom < Infinity ? g.maxOdom - g.minOdom : null
          return {
            plate: g.plate,
            nation: g.nation,
            period: g.maxTs > 0 ? `${formatDate(g.minTs)} — ${formatDate(g.maxTs)}` : formatDate(g.minTs),
            distance: diff != null ? `${diff.toLocaleString()} km` : '—',
          }
        })
    })

    const overviewAlerts = computed(() => {
      let violations = 0
      let uncertain = 0
      let anomalies = 0
      for (const day of dayAlerts.value.values()) {
        for (const v of day.violations) {
          if (v.uncertain) uncertain++
          else violations++
        }
        anomalies += day.anomalies.length
      }
      // EU165 usage errors (34.x) are shown in the compliance panel too - count them.
      const usage = detectUsageErrors(dddStore.activityRecords, dddStore.placeRecords, dddStore.eventRecords, { placesTruncatedBefore: dddStore.placesTruncatedBefore }).length
      const violationColor = violations ? 'sev-very-serious' : ''
      return { violations, uncertain, anomalies, usage, violationColor }
    })

    const complianceTotal = computed(() =>
      overviewAlerts.value.violations + overviewAlerts.value.uncertain + overviewAlerts.value.anomalies + overviewAlerts.value.usage,
    )

    const dayAlerts = computed(() => {
      const map = new Map()
      const records = dddStore.activityRecords.filter((r) => r.activityChangeInfo?.length)
      const maxTs = records.reduce((max, r) => Math.max(max, r.activityRecordDate), 0)
      for (const r of records) {
        const dayTs = r.activityRecordDate
        const vs = analyzeDayViolations(r, { isLastDay: dayTs === maxTs })
        if (vs.length) {
          if (!map.has(dayTs)) map.set(dayTs, { violations: [], anomalies: [] })
          for (const v of vs) map.get(dayTs).violations.push(v)
        }
      }
      // Daily driving (weekly extension allowance) + daily/weekly rest are computed
      // across days / midnight rather than per calendar day.
      for (const v of [...analyzeDailyDriving(records), ...analyzeDailyRest(records), ...analyzeWeeklyRest(records)]) {
        const dayTs = v.dayTs
        if (!map.has(dayTs)) map.set(dayTs, { violations: [], anomalies: [] })
        map.get(dayTs).violations.push(v)
      }
      const anomalies = detectAnomalies(records, dddStore.eventRecords)
      for (const a of anomalies) {
        if (!a.ts) continue
        const dayTs = dayStart(a.ts)
        if (!map.has(dayTs)) map.set(dayTs, { violations: [], anomalies: [] })
        map.get(dayTs).anomalies.push(a)
      }
      return map
    })

    const dayEvents = computed(() => {
      const map = new Map()
      function add(dayTs, ts, icon, color, label) {
        if (!map.has(dayTs)) map.set(dayTs, [])
        const arr = map.get(dayTs)
        const minute = Math.floor((ts - dayTs) / 60)
        if (!arr.some((e) => e.icon === icon && e.label === label)) arr.push({ icon, color, label, minute })
      }
      for (const r of dddStore.borderCrossingRecords) {
        const ts = r.gnssPlaceAuthRecord?.timeStamp
        if (!ts) continue
        const dayTs = dayStart(ts)
        add(dayTs, ts, 'mdi-boom-gate-up', 'purple-4', `${r.countryLeft} → ${r.countryEntered}`)
      }
      for (const r of dddStore.loadUnloadRecords) {
        const ts = r.timeStamp
        if (!ts) continue
        const dayTs = dayStart(ts)
        const isLoad = r.operationType === 1
        add(dayTs, ts, isLoad ? 'mdi-package-down' : 'mdi-package-up', isLoad ? 'green' : 'red', isLoad ? t('Load') : t('Unload'))
      }
      for (const r of dddStore.controlActivityRecords) {
        const ts = r.controlTime
        if (!ts) continue
        const dayTs = dayStart(ts)
        add(dayTs, ts, 'mdi-police-badge-outline', 'blue-4', t('Control'))
      }
      return map
    })

    const borderMapPoints = computed(() =>
      dddStore.borderCrossingRecords
        .filter((r) => isValidGeo(r.gnssPlaceAuthRecord?.geoCoordinates))
        .map((r) => ({
          lat: r.gnssPlaceAuthRecord.geoCoordinates.latitude,
          lng: r.gnssPlaceAuthRecord.geoCoordinates.longitude,
          time: r.gnssPlaceAuthRecord.timeStamp,
          color: '#e040fb',
          popup: `<b>${r.countryLeft} → ${r.countryEntered}</b><br>${formatDateTime(r.gnssPlaceAuthRecord.timeStamp)}`,
        })),
    )

    const cargoMapPoints = computed(() =>
      dddStore.loadUnloadRecords
        .filter((r) => isValidGeo(r.gnssPlaceAuthRecord?.geoCoordinates))
        .map((r) => ({
          lat: r.gnssPlaceAuthRecord.geoCoordinates.latitude,
          lng: r.gnssPlaceAuthRecord.geoCoordinates.longitude,
          time: r.timeStamp,
          color: r.operationType === 1 ? '#66bb6a' : '#ef5350',
          popup: `<b>${r.operationType === 1 ? t('Load') : t('Unload')}</b><br>${formatDateTime(r.timeStamp)}`,
        })),
    )

    const placeCountries = computed(() =>
      dddStore.placeRecords
        .map((r) => r.dailyWorkPeriodCountry)
        .filter(Boolean),
    )

    const vuSummary = computed(() => {
      const records = dddStore.vehicleUnitsUsed
      if (!records.length) return []
      const grouped = {}
      for (const r of records) {
        const id = r.deviceID || 1
        const mfr = r.manufacturerCode || '—'
        const key = `${id}:${mfr}`
        if (!grouped[key]) grouped[key] = { deviceID: id, manufacturer: mfr, versions: new Set(), minTs: Infinity, maxTs: 0, entries: [] }
        const g = grouped[key]
        if (r.vuSoftwareVersion) g.versions.add(r.vuSoftwareVersion)
        if (r.timeStamp) {
          g.minTs = Math.min(g.minTs, r.timeStamp)
          g.maxTs = Math.max(g.maxTs, r.timeStamp)
          g.entries.push({ version: r.vuSoftwareVersion || '—', ts: r.timeStamp })
        }
      }
      return Object.values(grouped).map((g) => ({
        deviceID: g.deviceID,
        manufacturer: g.manufacturer,
        software: [...g.versions].join(', ') || '—',
        period: g.minTs === g.maxTs ? formatDate(g.minTs) : `${formatDate(g.minTs)} — ${formatDate(g.maxTs)}`,
        details: g.entries.sort((a, b) => a.ts - b.ts).map((e) => ({ version: e.version, date: formatDate(e.ts) })),
      }))
    })

    const calendarOpen = ref(true)
    const driverInfoOpen = ref(true)
    const driverInfoRef = ref(null)
    const tabsRef = ref(null)
    const activityTableRef = ref(null)
    const calendarRef = ref(null)
    const timelineRef = ref(null)
    const detailDayTs = ref(null)
    const hoveredCountry = ref(null)
    const borderHover = ref(-1)
    const cargoHover = ref(-1)
    const pageHeight = ref(window.innerHeight)
    const pageWidth = ref(window.innerWidth)
    const headerHeight = ref(0)
    const driverInfoNaturalHeight = ref(0)
    const tabsHeight = ref(0)

    const isVertical = computed(() => pageWidth.value < 768)

    const mainHeight = computed(() => {
      const total = pageHeight.value - headerHeight.value - PAGE_PADDING * 2
      return isVertical.value && calendarOpen.value ? Math.floor(total / 2) : total
    })

    const maxDriverInfoHeight = computed(() => Math.floor(mainHeight.value * 0.5))

    const driverInfoCapped = computed(() =>
      driverInfoOpen.value ? Math.min(driverInfoNaturalHeight.value, maxDriverInfoHeight.value) : 0,
    )

    const driverInfoOverflows = computed(
      () => driverInfoNaturalHeight.value > maxDriverInfoHeight.value,
    )

    const driverInfoStyle = computed(() => {
      if (!driverInfoNaturalHeight.value) return {}
      return driverInfoOverflows.value
        ? { maxHeight: maxDriverInfoHeight.value + 'px', overflowY: 'auto' }
        : {}
    })

    const ACTIVITY_TOGGLE_HEIGHT = 32

    const tableStyle = computed(() => {
      const used = driverInfoCapped.value + GAP + CARD_BORDER + tabsHeight.value + SEPARATOR
      const h = mainHeight.value - used
      return `height: ${h}px`
    })

    const activityTableStyle = computed(() => {
      const used =
        driverInfoCapped.value +
        GAP +
        CARD_BORDER +
        tabsHeight.value +
        SEPARATOR +
        ACTIVITY_TOGGLE_HEIGHT
      const h = mainHeight.value - used
      return `height: ${h}px`
    })

    function measure() {
      pageHeight.value = window.innerHeight
      pageWidth.value = window.innerWidth

      const header = document.querySelector('.q-header')
      if (header) {
        headerHeight.value = header.offsetHeight
        document.documentElement.style.setProperty('--page-top', headerHeight.value + 'px')
      } else {
        headerHeight.value = 0
        document.documentElement.style.setProperty('--page-top', '0px')
      }

      const tabsEl = tabsRef.value?.$el
      if (tabsEl) tabsHeight.value = tabsEl.offsetHeight

      if (driverInfoRef.value) {
        const el = driverInfoRef.value
        el.style.maxHeight = 'none'
        el.style.overflowY = 'visible'
        driverInfoNaturalHeight.value = el.scrollHeight
        el.style.maxHeight = ''
        el.style.overflowY = ''
      }
    }

    const printMode = ref(false)
    provide('printMode', printMode)

    const defaultTitle = document.title
    watch(() => dddStore.printTitle, (title) => {
      document.title = title
        ? (whiteLabel.value ? title : `${title} — ${defaultTitle}`)
        : defaultTitle
    })

    let printInitiatedByUs = false

    async function printPage() {
      printMode.value = true
      printInitiatedByUs = true
      await nextTick()
      await new Promise((r) => setTimeout(r, 300))
      window.print()
    }

    function onBeforePrint() {
      if (!printInitiatedByUs && dddStore.raw && !noPrint.value) {
        $q.notify({ type: 'warning', message: t('Use the print button in the app toolbar for best results') })
      }
    }

    function onAfterPrint() {
      // Reset synchronously: window.print() blocks until the dialog closes and
      // afterprint fires after the job is captured, so there's no need to keep the
      // heavy print-all-sections DOM (every table + panel + map) mounted - and a
      // lingering printInitiatedByUs flag would mis-handle a quick second print.
      printMode.value = false
      printInitiatedByUs = false
    }

    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && dddStore.raw && !noPrint.value) {
        e.preventDefault()
        printPage()
      }
    }

    function onDayClick(ts) {
      detailDayTs.value = ts
    }

    function onVisibleDate(ts) {
      calendarRef.value?.scrollToDate(ts)
    }

    watch(
      () => dddStore.raw,
      async (val) => {
        await nextTick()
        measure()
        // Open day from query param when data first loads
        if (val && initialDay.value && !detailDayTs.value) {
          detailDayTs.value = initialDay.value
        }
      },
    )

    watch([calendarOpen, driverInfoOpen], async () => {
      await nextTick()
      measure()
    })

    onMounted(() => {
      measure()
      window.addEventListener('resize', measure)
      window.addEventListener('beforeprint', onBeforePrint)
      window.addEventListener('afterprint', onAfterPrint)
      window.addEventListener('keydown', onKeyDown)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
      window.removeEventListener('keydown', onKeyDown)
    })

    return {
      dddStore,
      downloadRawFile,
      isTabVisible,
      hideCalendar,
      hideDisclaimer,
      hidePanels,
      whiteLabel,
      noPrint,
      tab,
      activityView,
      hiddenActivities,
      toggleActivity,
      vehicleSummary,
      vuSummary,
      overviewAlerts,
      complianceTotal,
      dayAlerts,
      dayEvents,
      borderMapPoints,
      cargoMapPoints,
      placeCountries,
      hoveredCountry,
      borderHover,
      cargoHover,
      activityLegend,
      calendarOpen,
      driverInfoOpen,
      driverInfoRef,
      tabsRef,
      activityTableRef,
      calendarRef,
      timelineRef,
      driverInfoStyle,
      printMode,
      printPage,
      onDayClick,
      onVisibleDate,
      detailDayTs,
      tableStyle,
      activityTableStyle,
    }
  },
})
</script>

<style scoped>
.index-page {
  overflow: hidden;
}

.page-layout {
  display: flex;
  /* last term MUST match the DateRangeBar height (.date-range-bar) below it */
  height: calc(100vh - var(--page-top, 50px) - 50px);
  padding: 8px;
  gap: 8px;
}

.main-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.calendar-panel {
  width: 280px;
  flex-shrink: 0;
  overflow: hidden;
}

.warning-banner {
  flex-shrink: 0;
  border-radius: 4px;
}

.driver-info-wrapper {
  flex-shrink: 0;
}

.data-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.data-panels {
  min-height: 0;
  overflow: hidden;
}

.overview-layout {
  display: flex;
  gap: 16px;
  padding: 8px;
  height: 100%;
}

.overview-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.overview-alerts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.alert-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.06);
  cursor: pointer;
}

.alert-chip:hover {
  background: rgba(0, 0, 0, 0.12);
}

body.body--dark .alert-chip {
  background: rgba(255, 255, 255, 0.08);
}

body.body--dark .alert-chip:hover {
  background: rgba(255, 255, 255, 0.15);
}

.vehicle-summary {
  flex-shrink: 0;
  padding: 8px 8px 0;
}

.overview-heatmap {
  flex: 1;
  min-width: 0;
  min-height: 200px;
}

.overview-radar {
  width: 240px;
  flex-shrink: 0;
}

.vehicle-list {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
}

.vehicle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.vehicle-item:last-child {
  border-bottom: none;
}

@media (max-width: 900px) {
  .overview-layout {
    flex-direction: column;
    height: auto;
  }
  .overview-radar {
    width: 100%;
  }
}

.activity-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
}

.activity-legend-item.legend-hidden {
  opacity: 0.35;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.legend-static {
  cursor: default;
}

.legend-dot-card-out {
  background-color: #bdbdbd;
  background-image: linear-gradient(45deg, rgba(0, 0, 0, 0.5) 25%, transparent 25%, transparent 50%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.5) 75%, transparent 75%);
  background-size: 4px 4px;
}

@media (max-width: 767px) {
  .page-layout {
    flex-direction: column;
    /* mobile DateRangeBar is taller (stacked timeline + presets row) */
    height: calc(100vh - var(--page-top, 50px) - 74px);
  }

  .calendar-panel {
    width: 100%;
    flex: 1;
    min-height: 0;
  }

  .main-panel {
    flex: 1;
    min-height: 0;
  }
}
</style>
