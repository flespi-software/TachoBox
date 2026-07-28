<template>
  <div class="date-range-bar">
    <div class="date-range-row-top">
      <div class="mini-timeline" ref="timelineRef" @mousedown="onClick" @mousemove="onTimelineHover" @mouseleave="hoverDate = ''" @touchstart.prevent="onTouchStart" @touchmove.prevent="onTouchMove" @touchend.prevent="onTouchEnd">
        <div
          v-for="(bar, i) in dayData"
          :key="i"
          class="mini-bar"
          :style="{ left: bar.pct + '%', height: bar.height + '%' }"
          :class="[bar.statusCls, { 'mini-bar-active': isActive(bar.dayTs) }]"
        />
        <div
          v-for="(tick, ti) in monthTicks"
          :key="'t' + ti"
          class="month-tick"
          :style="{ left: tick.pct + '%' }"
        />
        <div v-if="hoverDate" class="hover-label" :style="{ left: hoverPct + '%' }">
          {{ hoverDate }}
          <span class="hover-hint">{{ $t('click: day · double: month · triple: all') }}</span>
        </div>
        <div
          v-if="brushPct"
          class="brush-selection"
          :style="{ left: brushPct.left + '%', width: brushPct.width + '%' }"
        >
          <div class="brush-handle brush-handle-l" @mousedown.stop="startResize('from', $event)" @touchstart.stop.prevent="startResizeTouch('from')" />
          <span class="brush-label">{{ selectedDaysLabel }}</span>
          <div class="brush-handle brush-handle-r" @mousedown.stop="startResize('to', $event)" @touchstart.stop.prevent="startResizeTouch('to')" />
        </div>
      </div>
    </div>
    <div class="date-range-row-bottom">
      <q-btn-toggle
        v-model="preset"
        flat
        dense
        no-caps
        toggle-color="primary"
        size="sm"
        :options="presets"
        class="presets"
      />
      <q-btn flat dense no-caps size="sm" class="date-label-btn">
        <span class="date-label-text">{{ rangeLabel }}</span>
        <q-popup-proxy transition-show="scale" transition-hide="scale" @before-show="onPopupShow">
          <q-card dark class="date-popup">
            <q-card-section class="row items-center q-gutter-sm q-pb-none">
              <q-input
                v-model="fromStr"
                dense
                outlined
                mask="##/##/####"
                placeholder="DD/MM/YYYY"
                :label="$t('From')"
                class="col"
                :class="{ 'field-active': activeField === 'from' }"
                @focus="activeField = 'from'"
                @update:model-value="onManualFrom"
              />
              <q-input
                v-model="toStr"
                dense
                outlined
                mask="##/##/####"
                placeholder="DD/MM/YYYY"
                :label="$t('To')"
                class="col"
                :class="{ 'field-active': activeField === 'to' }"
                @focus="activeField = 'to'"
                @update:model-value="onManualTo"
              />
            </q-card-section>
            <q-date
              v-model="calDay"
              mask="DD/MM/YYYY"
              minimal
              :options="calendarOptions"
              :default-year-month="defaultYearMonth"
              :navigation-min-year-month="navMin"
              :navigation-max-year-month="navMax"
              @update:model-value="onCalendarPick"
              class="full-width"
            />
          </q-card>
        </q-popup-proxy>
      </q-btn>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDddStore } from 'src/stores/ddd'
import { buildDaySegments } from 'src/utils/activity'
import { dayStatusMap } from 'src/compliance'
import { formatDayParts } from 'src/utils/format'

function tsToDateStr(ts) {
  if (!ts) return ''
  return formatDayParts(ts, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function dateStrToTs(str) {
  if (!str || str.length < 10) return null
  const [d, m, y] = str.split('/')
  const date = Date.UTC(Number(y), Number(m) - 1, Number(d))
  if (isNaN(date)) return null
  return date / 1000
}

export default defineComponent({
  name: 'DateRangeBar',
  setup() {
    const { t } = useI18n()
    const dddStore = useDddStore()
    const timelineRef = ref(null)
    const preset = ref('all')
    const fromStr = ref('')
    const toStr = ref('')
    const hoverDate = ref('')
    const hoverPct = ref(0)

    const dataRange = computed(() => {
      const recs = dddStore.allActivityRecords
      if (!recs.length) return null
      const sorted = recs.map((r) => r.activityRecordDate).filter(Boolean).sort((a, b) => a - b)
      return { min: sorted[0], max: sorted[sorted.length - 1] }
    })

    const totalDays = computed(() => {
      if (!dataRange.value) return 0
      return Math.ceil((dataRange.value.max - dataRange.value.min) / 86400) + 1
    })

    // Per-day bar geometry + compliance status. Depends ONLY on the full data set
    // (not the selected range), so dragging/resizing the brush does NOT recompute
    // the (expensive) compliance pass. The in-range emphasis is applied cheaply at
    // render via isActive().
    const dayData = computed(() => {
      if (!dataRange.value) return []
      const { min } = dataRange.value
      const days = totalDays.value
      if (!days) return []
      const recByDay = new Map()
      for (const r of dddStore.allActivityRecords) {
        if (r.activityChangeInfo?.length) recByDay.set(r.activityRecordDate, r)
      }
      const status = dayStatusMap(dddStore.allActivityRecords)
      let maxDrive = 1
      const drive = new Map()
      for (const [ts, r] of recByDay) {
        const m = buildDaySegments(r.activityChangeInfo, {}).totals?.DRIVING || 0
        drive.set(ts, m)
        if (m > maxDrive) maxDrive = m
      }
      const out = []
      for (let i = 0; i < days; i++) {
        const dayTs = min + i * 86400
        const hasData = recByDay.has(dayTs)
        const m = drive.get(dayTs) || 0
        const st = status.get(dayTs) || (hasData ? 'green' : 'none')
        out.push({
          dayTs,
          pct: (i / days) * 100,
          height: hasData ? Math.max(12, (m / maxDrive) * 100) : 4,
          statusCls: 'status-' + st,
        })
      }
      return out
    })

    function isActive(dayTs) {
      const from = dddStore.dateFrom
      const to = dddStore.dateTo
      return (!from || dayTs >= from) && (!to || dayTs <= to)
    }

    const brushPct = computed(() => {
      if (!dddStore.dateFrom && !dddStore.dateTo) return null
      if (!dataRange.value) return null
      const { min, max } = dataRange.value
      const span = max - min || 1
      const from = dddStore.dateFrom || min
      const to = dddStore.dateTo || max
      const left = Math.max(0, ((from - min) / span) * 100)
      const right = Math.min(100, ((to - min) / span) * 100 + (1 / totalDays.value) * 100)
      return { left, width: right - left }
    })

    const monthTicks = computed(() => {
      if (!dataRange.value || totalDays.value < 14) return []
      const { min, max } = dataRange.value
      const span = max - min || 1
      const ticks = []
      const d = new Date(min * 1000)
      d.setUTCDate(1)
      d.setUTCMonth(d.getUTCMonth() + 1)
      d.setUTCHours(0, 0, 0, 0)
      while (d.getTime() / 1000 <= max) {
        const ts = d.getTime() / 1000
        ticks.push({ pct: ((ts - min) / span) * 100 })
        d.setUTCMonth(d.getUTCMonth() + 1)
      }
      return ticks
    })

    const selectedDaysLabel = computed(() => {
      if (!dddStore.dateFrom && !dddStore.dateTo) return ''
      const from = dddStore.dateFrom || dataRange.value?.min
      const to = dddStore.dateTo || dataRange.value?.max
      if (!from || !to) return ''
      const days = Math.max(1, Math.round((to - from) / 86400) + 1)
      return `${days}d`
    })

    const presets = computed(() => {
      const list = [{ label: t('All'), value: 'all' }]
      if (totalDays.value > 7) list.push({ label: '7d', value: '7' })
      if (totalDays.value > 14) list.push({ label: '14d', value: '14' })
      if (totalDays.value > 30) list.push({ label: '30d', value: '30' })
      return list
    })

    function applyPreset(val) {
      // val is null when a preset is just cleared (e.g. after manual/calendar edits) -
      // do nothing then. Guarding also avoids Number(null)=0 -> to = from - 1 day.
      if (!val || !dataRange.value) return
      if (val === 'all') {
        dddStore.clearDateRange()
        fromStr.value = ''
        toStr.value = ''
        return
      }
      const days = Number(val)
      let from = dddStore.dateFrom || dataRange.value.min
      let to = from + (days - 1) * 86400
      if (to > dataRange.value.max) {
        to = dataRange.value.max
        from = Math.max(dataRange.value.min, to - (days - 1) * 86400)
      }
      dddStore.setDateRange(from, to)
      fromStr.value = tsToDateStr(from)
      toStr.value = tsToDateStr(to)
    }

    watch(preset, applyPreset)

    const rangeLabel = computed(() => {
      const f = fromStr.value || (dataRange.value ? tsToDateStr(dataRange.value.min) : '')
      const t = toStr.value || (dataRange.value ? tsToDateStr(dataRange.value.max) : '')
      if (!f && !t) return '—'
      if (f === t) return f
      return `${f} — ${t}`
    })

    // Two-click range selection on a SINGLE-date q-date. Quasar's native `range`
    // mode treats a click on a day inside the already-selected range as
    // "unset/split" (removeFromModel) rather than starting a new range, which
    // produced a broken {clicked, clicked-1} result on the first click (the popup
    // always opens with a range selected). We track the two clicks ourselves.
    const calDay = ref(null)
    // The endpoint the next calendar click fills. Auto-advances From -> To, and
    // the user can switch it by clicking (focusing) the From / To field.
    const activeField = ref('from')
    function onPopupShow() {
      // Always show a populated range: the current filter, or the full data span.
      const from = dddStore.dateFrom || dataRange.value?.min
      const to = dddStore.dateTo || dataRange.value?.max
      fromStr.value = from ? tsToDateStr(from) : ''
      toStr.value = to ? tsToDateStr(to) : ''
      activeField.value = 'from'
      calDay.value = fromStr.value || null // open the calendar on the From month
    }
    function onCalendarPick(val) {
      // val is null when the user clicks the already-selected day (q-date unsets it).
      // We treat that as "confirm the current value" and still advance to the next
      // field, so clicking the same date works too.
      if (activeField.value === 'from') {
        if (val) {
          fromStr.value = val
          onManualFrom(val)
          // keep the range valid
          if (!toStr.value || dateStrToTs(toStr.value) < dateStrToTs(val)) {
            toStr.value = val
            onManualTo(val)
          }
        }
        activeField.value = 'to'
        calDay.value = toStr.value // jump the calendar to the To date
      } else {
        if (val) {
          // setting the end; if it lands before the start, move the start instead
          if (fromStr.value && dateStrToTs(val) < dateStrToTs(fromStr.value)) {
            fromStr.value = val
            onManualFrom(val)
          }
          toStr.value = val
          onManualTo(val)
        }
        activeField.value = 'from'
        calDay.value = fromStr.value // jump the calendar back to the From date
      }
    }

    function calendarOptions(date) {
      if (!dataRange.value) return true
      const [y, m, d] = date.split('/')
      const ts = Date.UTC(Number(y), Number(m) - 1, Number(d)) / 1000
      return ts >= dataRange.value.min && ts <= dataRange.value.max
    }

    const navMin = computed(() => {
      if (!dataRange.value) return undefined
      const d = new Date(dataRange.value.min * 1000)
      return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })

    const defaultYearMonth = computed(() => {
      const ts = dddStore.dateFrom || dataRange.value?.max
      if (!ts) return undefined
      const d = new Date(ts * 1000)
      return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })

    const navMax = computed(() => {
      if (!dataRange.value) return undefined
      const d = new Date(dataRange.value.max * 1000)
      return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })

    function onManualFrom(val) {
      const ts = dateStrToTs(val)
      if (ts) {
        dddStore.setDateRange(ts, dddStore.dateTo)
        preset.value = null
      }
    }

    function onManualTo(val) {
      const ts = dateStrToTs(val)
      if (ts) {
        dddStore.setDateRange(dddStore.dateFrom, ts)
        preset.value = null
      }
    }


    function onTimelineHover(e) {
      if (!timelineRef.value || !dataRange.value) return
      const rect = timelineRef.value.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const { min, max } = dataRange.value
      const ts = min + pct * (max - min)
      hoverDate.value = tsToDateStr(ts - (ts % 86400))
      // Position label using px relative to container, clamped to stay visible
      const labelWidth = 220
      const px = e.clientX - rect.left
      const clamped = Math.max(labelWidth / 2, Math.min(rect.width - labelWidth / 2, px))
      hoverPct.value = (clamped / rect.width) * 100
    }

    function pctToTs(clientX) {
      if (!timelineRef.value || !dataRange.value) return 0
      const rect = timelineRef.value.getBoundingClientRect()
      const { min, max } = dataRange.value
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const ts = min + pct * (max - min)
      return ts - (ts % 86400)
    }

    function applyRange(from, to) {
      const f = Math.min(from, to)
      const t = Math.max(from, to)
      dddStore.setDateRange(f, t)
      fromStr.value = tsToDateStr(f)
      toStr.value = tsToDateStr(t)
      preset.value = null
    }

    // Active drag teardown, so a drag whose mouseup/touchend is missed (pointer
    // released outside the window - common when embedded in an iframe) is still
    // cleaned up on unmount instead of leaking a window listener for the page life.
    let activeDragTeardown = null
    onBeforeUnmount(() => { if (activeDragTeardown) activeDragTeardown() })

    // Drag a brush edge to extend/shrink the range. applyRange normalises order,
    // so dragging one handle past the other simply swaps which edge it is.
    function startResize(edge, e) {
      if (!dataRange.value) return
      e.preventDefault()
      const move = (ev) => {
        const ts = pctToTs(ev.clientX)
        const from = dddStore.dateFrom ?? dataRange.value.min
        const to = dddStore.dateTo ?? dataRange.value.max
        if (edge === 'from') applyRange(ts, to)
        else applyRange(from, ts)
      }
      const up = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        activeDragTeardown = null
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
      activeDragTeardown = up
    }

    function startResizeTouch(edge) {
      if (!dataRange.value) return
      const move = (ev) => {
        const x = ev.touches?.[0]?.clientX
        if (x == null) return
        const ts = pctToTs(x)
        const from = dddStore.dateFrom ?? dataRange.value.min
        const to = dddStore.dateTo ?? dataRange.value.max
        if (edge === 'from') applyRange(ts, to)
        else applyRange(from, ts)
      }
      const end = () => {
        window.removeEventListener('touchmove', move)
        window.removeEventListener('touchend', end)
        activeDragTeardown = null
      }
      window.addEventListener('touchmove', move, { passive: false })
      window.addEventListener('touchend', end)
      activeDragTeardown = end
    }

    function onClick(e) {
      if (!timelineRef.value || !dataRange.value) return
      const ts = pctToTs(e.clientX)
      const clickType = ((e.detail - 1) % 3) + 1

      if (clickType === 3) {
        preset.value = 'all'
        applyPreset('all')
        return
      }

      if (clickType === 2) {
        const d = new Date(ts * 1000)
        const monthStart = Math.max(dataRange.value.min, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000)
        const monthEnd = Math.min(dataRange.value.max, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / 1000)
        applyRange(monthStart, monthEnd)
        return
      }

      // Single click - immediate day select + drag support
      const from = dddStore.dateFrom
      const to = dddStore.dateTo
      const insideSelection = from && to && ts >= from && ts <= to

      if (insideSelection) {
        const span = to - from
        const offset = ts - from
        function onMove(ev) {
          const cur = pctToTs(ev.clientX)
          const newFrom = cur - offset
          const { min, max } = dataRange.value
          const clamped = Math.max(min, Math.min(max - span, newFrom))
          applyRange(clamped, clamped + span)
        }
        function onUp() {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          activeDragTeardown = null
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        activeDragTeardown = onUp
      } else {
        applyRange(ts, ts)
        const startTs = ts
        function onMove(ev) {
          const endTs = pctToTs(ev.clientX)
          applyRange(Math.min(startTs, endTs), Math.max(startTs, endTs))
        }
        function onUp() {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          activeDragTeardown = null
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        activeDragTeardown = onUp
      }
    }

    // Touch support
    let tapTimer = null
    let tapCount = 0
    let touchDragged = false
    let touchStartX = 0
    let touchStartTs = 0
    let touchInsideSelection = false
    let touchSelSpan = 0
    let touchSelOffset = 0

    function touchClientX(e) {
      return e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? 0
    }

    function onTouchStart(e) {
      if (!timelineRef.value || !dataRange.value) return
      touchDragged = false
      touchStartX = touchClientX(e)
      touchStartTs = pctToTs(touchStartX)

      const from = dddStore.dateFrom
      const to = dddStore.dateTo
      touchInsideSelection = from && to && touchStartTs >= from && touchStartTs <= to
      if (touchInsideSelection) {
        touchSelSpan = to - from
        touchSelOffset = touchStartTs - from
      }

      tapCount++
      if (tapTimer) clearTimeout(tapTimer)
    }

    function onTouchMove(e) {
      if (!timelineRef.value || !dataRange.value) return
      touchDragged = true
      const x = touchClientX(e)

      if (touchInsideSelection) {
        const cur = pctToTs(x)
        const newFrom = cur - touchSelOffset
        const { min, max } = dataRange.value
        const clamped = Math.max(min, Math.min(max - touchSelSpan, newFrom))
        applyRange(clamped, clamped + touchSelSpan)
      } else {
        const endTs = pctToTs(x)
        applyRange(Math.min(touchStartTs, endTs), Math.max(touchStartTs, endTs))
      }
    }

    function onTouchEnd() {
      if (touchDragged) {
        tapCount = 0
        return
      }

      tapTimer = setTimeout(() => {
        if (tapCount === 1) {
          applyRange(touchStartTs, touchStartTs)
        } else if (tapCount === 2) {
          const d = new Date(touchStartTs * 1000)
          const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000
          const monthEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / 1000
          applyRange(monthStart, monthEnd)
        }
        tapCount = 0
      }, 300)

      if (tapCount >= 3) {
        clearTimeout(tapTimer)
        tapCount = 0
        preset.value = 'all'
        applyPreset('all')
      }
    }

    watch(() => dddStore.allActivityRecords.length, () => {
      if (preset.value === 'all') {
        dddStore.clearDateRange()
        fromStr.value = ''
        toStr.value = ''
      }
    })

    return { timelineRef, dayData, isActive, brushPct, selectedDaysLabel, monthTicks, preset, presets, fromStr, toStr, rangeLabel, calDay, activeField, calendarOptions, defaultYearMonth, navMin, navMax, onPopupShow, onManualFrom, onManualTo, onCalendarPick, onClick, onTimelineHover, hoverDate, hoverPct, onTouchStart, onTouchMove, onTouchEnd, startResize, startResizeTouch }
  },
})
</script>

<style scoped>
.date-range-bar {
  padding: 4px 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 50px;
}

.date-range-row-top {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.date-range-row-bottom {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .date-range-bar {
    flex-direction: column;
    height: auto;
    gap: 2px;
    padding: 3px 8px;
  }

  .date-range-row-top {
    width: 100%;
  }

  .date-range-row-bottom {
    width: 100%;
    justify-content: center;
  }
}

.mini-timeline {
  flex: 1;
  height: 42px;
  min-width: 100px;
  position: relative;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  cursor: crosshair;
  user-select: none;
}

.mini-bar {
  position: absolute;
  bottom: 0;
  width: 2px;
  border-radius: 1px 1px 0 0;
  opacity: 0.32; /* dimmed outside the selected range */
}

/* In the selected range - full opacity. */
.mini-bar-active {
  opacity: 1;
}

/* Bar colour = day compliance status (height = driving hours). */
.mini-bar.status-red { background: #e53935; }
.mini-bar.status-amber { background: #fb8c00; }
.mini-bar.status-grey { background: #78909c; }
.mini-bar.status-green { background: #43a047; }
.mini-bar.status-none { background: rgba(128, 128, 128, 0.55); }

.brush-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 9px;
  cursor: ew-resize;
  z-index: 2;
}
.brush-handle-l { left: -5px; }
.brush-handle-r { right: -5px; }
.brush-handle::after {
  content: '';
  position: absolute;
  top: 18%;
  bottom: 18%;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 1px;
}

.brush-selection {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(25, 118, 210, 0.2);
  border-left: 2px solid rgba(25, 118, 210, 0.8);
  border-right: 2px solid rgba(25, 118, 210, 0.8);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brush-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
}

.month-tick {
  position: absolute;
  top: 0;
  height: 100%;
  width: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.35);
  pointer-events: none;
}

.hover-label {
  position: absolute;
  top: -22px;
  transform: translateX(-50%);
  font-size: 10px;
  color: #eee;
  background: rgba(30, 30, 30, 0.95);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 5;
  display: flex;
  gap: 6px;
  align-items: center;
}

.hover-hint {
  color: rgba(255, 255, 255, 0.4);
  font-size: 9px;
}

.presets {
  flex-shrink: 0;
}

.date-label-btn {
  flex-shrink: 0;
  min-width: 220px;
  text-align: center;
}

.date-label-text {
  font-size: 12px;
  white-space: nowrap;
}


</style>

<style>
/* q-popup-proxy content is teleported to <body>, so these must be unscoped. */
.date-popup {
  width: 300px;
  max-width: 92vw;
}
.date-popup .q-date {
  box-shadow: none;
  width: 100%;
}
/* highlight the field the next calendar click will fill */
.date-popup .field-active .q-field__control:before {
  border-color: #ff9800;
}
.date-popup .field-active .q-field__control {
  box-shadow: 0 0 0 1px #ff9800;
  border-radius: 4px;
  background: rgba(255, 152, 0, 0.1);
}
.date-popup .field-active .q-field__label {
  color: #ff9800;
}

.body--light .mini-timeline {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.15);
}
.body--light .mini-bar.status-none {
  background: rgba(0, 0, 0, 0.25);
}
.body--light .brush-handle::after {
  background: rgba(0, 0, 0, 0.75);
}
.body--light .month-tick {
  border-color: rgba(0, 0, 0, 0.2);
}
.body--light .brush-selection {
  background: rgba(25, 118, 210, 0.12);
}
.body--light .date-range-bar {
  border-top-color: rgba(0, 0, 0, 0.1);
}
</style>
