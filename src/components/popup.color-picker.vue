<template lang="pug">
.ColorPickerPopup.popup-container(@mousedown.stop.self="onCancel" @mouseup.stop)
  .popup(v-if="popup" @keydown="onKeyDown")
    h2 {{translate(popup.editing ? 'popup.color_picker.title_edit' : 'popup.color_picker.title_new')}}

    .wheel-box
      canvas.wheel(
        ref="wheelEl"
        :width="WHEEL_SIZE * dpr"
        :height="WHEEL_SIZE * dpr"
        :style="{ width: WHEEL_SIZE + 'px', height: WHEEL_SIZE + 'px' }"
        @pointerdown="onWheelPointerDown"
        @pointermove="onWheelPointerMove"
        @pointerup="onWheelPointerUp"
        @pointercancel="onWheelPointerUp")
      .marker(:style="markerStyle")

    .brightness(:title="translate('popup.color_picker.brightness')")
      input.brightness-input(
        type="range"
        min="0"
        max="1000"
        :value="Math.round(state.v * 1000)"
        :style="{ '--track-color': fullBrightHex }"
        :aria-label="translate('popup.color_picker.brightness')"
        @input="onBrightnessInput")

    .field
      .field-label {{translate('popup.color_picker.hex_label')}}
      .field-row
        .preview(:style="{ '--preview-color': previewHex }")
        TextInput.hex-input(
          ref="hexInputEl"
          :value="state.hexInput"
          :valid="hexValid ? undefined : 'invalid'"
          :line="true"
          or="#rrggbb"
          @update:value="onHexInput")

    .field
      .field-label {{translate('popup.color_picker.name_label')}}
      TextInput.name-input(
        :value="state.name"
        :line="true"
        :filter="nameFilter"
        :or="translate('popup.color_picker.name_placeholder')"
        @update:value="onNameInput")

    .ctrls
      .btn(:class="{ '-inactive': !hexValid }" @click="onSave") {{translate('btn.save')}}
      .btn.-warn(v-if="popup.editing" @click="onRemove") {{translate('popup.color_picker.delete')}}
      .btn(@click="onCancel") {{translate('btn.cancel')}}
</template>

<script lang="ts" setup>
import { reactive, computed, onMounted, watch, useTemplateRef } from 'vue'
import type { TextInputComponent } from 'src/types'
import { translate } from 'src/dict'
import * as Popups from 'src/services/popups.fg'
import * as TabColors from 'src/services/tab-colors'
import TextInput from './text-input.vue'

const WHEEL_SIZE = 176
const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))

const popup = computed(() => Popups.reactive.colorPickerPopup)
const wheelEl = useTemplateRef<HTMLCanvasElement>('wheelEl')
const hexInputEl = useTemplateRef<TextInputComponent>('hexInputEl')

const initialHex = TabColors.normalizeHex(popup.value?.hex) ?? TabColors.randomHex()
const initialHsv = TabColors.hexToHsv(initialHex)

const state = reactive({
  h: initialHsv.h,
  s: initialHsv.s,
  v: initialHsv.v,
  hexInput: initialHex,
  name: popup.value?.name ?? '',
})

const hexValid = computed(() => TabColors.normalizeHex(state.hexInput) !== null)
const previewHex = computed(() => {
  return TabColors.normalizeHex(state.hexInput) ?? TabColors.hsvToHex(state)
})
const fullBrightHex = computed(() => TabColors.hsvToHex({ h: state.h, s: state.s, v: 1 }))

const markerStyle = computed(() => {
  const radius = WHEEL_SIZE / 2
  const angle = (state.h * Math.PI) / 180
  const x = radius + Math.cos(angle) * state.s * radius
  const y = radius + Math.sin(angle) * state.s * radius
  return {
    left: `${x}px`,
    top: `${y}px`,
    '--marker-color': TabColors.hsvToHex(state),
  }
})

onMounted(() => {
  drawWheel()
  hexInputEl.value?.focus()
  hexInputEl.value?.selectAll()
})

watch(
  () => state.v,
  () => drawWheel()
)

// ---
// -- Wheel
// -

function drawWheel() {
  const canvas = wheelEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const size = canvas.width
  const radius = size / 2
  const image = ctx.createImageData(size, size)
  const data = image.data
  const v = state.v

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - radius
      const dy = y + 0.5 - radius
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > radius) continue

      let h = (Math.atan2(dy, dx) * 180) / Math.PI
      if (h < 0) h += 360
      const [r, g, b] = TabColors.hsvToRgb(h, dist / radius, v)

      const i = (y * size + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      // Antialiased edge
      data[i + 3] = Math.max(0, Math.min(1, radius - dist)) * 255
    }
  }

  ctx.putImageData(image, 0, 0)
}

let dragging = false
function onWheelPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  dragging = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  pickFromWheel(e)
}

function onWheelPointerMove(e: PointerEvent) {
  if (dragging) pickFromWheel(e)
}

function onWheelPointerUp(e: PointerEvent) {
  dragging = false
  ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
}

function pickFromWheel(e: PointerEvent) {
  const canvas = wheelEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const radius = rect.width / 2
  const dx = e.clientX - rect.left - radius
  const dy = e.clientY - rect.top - radius
  let h = (Math.atan2(dy, dx) * 180) / Math.PI
  if (h < 0) h += 360
  state.h = h
  state.s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius)
  // Picking a color on a black wheel is pointless, bring some light
  if (state.v < 0.05) state.v = 1
  syncHexFromHsv()
}

function onBrightnessInput(e: Event) {
  state.v = Number((e.target as HTMLInputElement).value) / 1000
  syncHexFromHsv()
}

function syncHexFromHsv() {
  state.hexInput = TabColors.hsvToHex(state)
}

// ---
// -- Fields
// -

function onHexInput(value: string) {
  state.hexInput = value
  const hex = TabColors.normalizeHex(value)
  if (!hex) return
  const hsv = TabColors.hexToHsv(hex)
  // Keep hue/saturation for grayscale and black colors
  if (hsv.v > 0 && hsv.s > 0) state.h = hsv.h
  if (hsv.v > 0) state.s = hsv.s
  state.v = hsv.v
}

function nameFilter(e: Event): string {
  const value = (e.target as HTMLInputElement).value
  return value.slice(0, TabColors.MAX_NAME_LEN)
}

function onNameInput(value: string) {
  state.name = value
}

// ---
// -- Controls
// -

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    onSave()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    onCancel()
  }
}

function onSave() {
  const hex = TabColors.normalizeHex(state.hexInput)
  if (!hex) {
    hexInputEl.value?.error()
    return
  }
  popup.value?.done({ hex, name: TabColors.normalizeName(state.name) })
}

function onRemove() {
  const hex = TabColors.normalizeHex(state.hexInput) ?? ''
  popup.value?.done({ hex, name: TabColors.normalizeName(state.name), remove: true })
}

function onCancel() {
  Popups.closeColorPicker()
}
</script>
