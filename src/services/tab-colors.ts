import type { CustomTabColor, Reactivator, TabColorsReactiveState } from 'src/types'
import { RGB_COLORS, TAB_BOOKMARK_COLOR, BOOKMARK_TAB_COLOR } from 'src/defaults'
import * as Utils from 'src/utils'

/**
 * Tab color values (tab.customColor) can take one of three forms:
 *  - built-in color name: 'blue', 'red', ...
 *  - reference to a custom color from the palette: 'custom:<id>'
 *  - plain hex color '#rrggbb' (fallback for colors that came from outside
 *    and don't match any palette entry)
 */

export const CUSTOM_PREFIX = 'custom:'
export const MAX_NAME_LEN = 64

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i
const NORM_HEX_RE = /^#[0-9a-f]{6}$/

export let reactive: TabColorsReactiveState = {
  list: [],
  byId: {},
}

export function reactivate(r: Reactivator<TabColorsReactiveState>) {
  reactive = r(reactive)
}

// ---
// -- Hex & color math
// -

/**
 * Parse user input ('abc', '#abc', 'aabbcc', '#aabbcc') into '#rrggbb'.
 */
export function normalizeHex(input?: string | null): string | null {
  if (typeof input !== 'string') return null
  const match = HEX_RE.exec(input.trim())
  if (!match) return null
  let hex = match[1].toLowerCase()
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  return '#' + hex
}

export function isNormHex(value?: string | null): value is string {
  return typeof value === 'string' && NORM_HEX_RE.test(value)
}

export interface HSV {
  /** 0-360 */
  h: number
  /** 0-1 */
  s: number
  /** 0-1 */
  v: number
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => {
    const v = Math.max(0, Math.min(255, Math.round(x)))
    return v.toString(16).padStart(2, '0')
  }
  return '#' + c(r) + c(g) + c(b)
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

export function hsvToHex(hsv: HSV): string {
  const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v)
  return rgbToHex(r, g, b)
}

export function hexToHsv(hex: string): HSV {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHsv(r, g, b)
}

export function randomHex(): string {
  // Pleasant random color: random hue, mid-high saturation and value
  const h = Math.random() * 360
  const s = 0.55 + Math.random() * 0.35
  const v = 0.75 + Math.random() * 0.2
  return hsvToHex({ h, s, v })
}

// ---
// -- Palette helpers
// -

export function isCustomRef(value?: string | null): value is string {
  return typeof value === 'string' && value.startsWith(CUSTOM_PREFIX)
}

export function getCustomRefId(value: string): string {
  return value.slice(CUSTOM_PREFIX.length)
}

export function makeCustomRef(id: string): string {
  return CUSTOM_PREFIX + id
}

export function isBuiltIn(value?: string | null): value is string {
  return typeof value === 'string' && value !== 'gray' && RGB_COLORS[value] !== undefined
}

export function getDisplayName(color: CustomTabColor): string {
  return color.name || color.hex
}

export function normalizeName(name?: string | null): string {
  if (typeof name !== 'string') return ''
  return name.trim().slice(0, MAX_NAME_LEN)
}

/**
 * Validate and clean up the palette loaded from storage/sync/backup.
 */
export function sanitizePalette(raw: unknown): CustomTabColor[] {
  if (!Array.isArray(raw)) return []
  const result: CustomTabColor[] = []
  const ids = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id = (item as CustomTabColor).id
    if (typeof id !== 'string' || !id || ids.has(id)) continue
    const hex = normalizeHex((item as CustomTabColor).hex)
    if (!hex) continue
    ids.add(id)
    result.push({ id, name: normalizeName((item as CustomTabColor).name), hex })
  }
  return result
}

export function indexPalette(list: CustomTabColor[]): Record<string, CustomTabColor> {
  const byId: Record<string, CustomTabColor> = {}
  for (const c of list) byId[c.id] = c
  return byId
}

/**
 * Merge imported palette into the current one: entries with known ids are
 * updated in place, new ones are appended, nothing is removed.
 */
export function mergePalettes(current: CustomTabColor[], incoming: unknown): CustomTabColor[] {
  const result = current.map(c => ({ ...c }))
  const indexById = new Map<string, number>()
  result.forEach((c, i) => indexById.set(c.id, i))
  for (const color of sanitizePalette(incoming)) {
    const index = indexById.get(color.id)
    if (index !== undefined) result[index] = color
    else {
      indexById.set(color.id, result.length)
      result.push(color)
    }
  }
  return result
}

export function createColor(hex: string, name?: string): CustomTabColor {
  return { id: Utils.uid(), name: normalizeName(name), hex: normalizeHex(hex) ?? '#686868' }
}

// ---
// -- Color value resolution
// -

/**
 * Get css color code for the given tab color value.
 */
export function getColorCode(
  value?: string | null,
  byId: Record<string, CustomTabColor> = reactive.byId
): string | undefined {
  if (!value) return
  if (isCustomRef(value)) return byId[getCustomRefId(value)]?.hex
  const builtIn = RGB_COLORS[value]
  if (builtIn) return builtIn
  return normalizeHex(value) ?? undefined
}

/**
 * Convert tab color value to the form that is safe to store outside of
 * the current profile (bookmarks, snapshots, sync): custom references
 * are replaced with their hex values.
 */
export function toPortable(
  value?: string | null,
  byId: Record<string, CustomTabColor> = reactive.byId
): string | undefined {
  if (!value) return
  if (isCustomRef(value)) return byId[getCustomRefId(value)]?.hex
  if (isBuiltIn(value)) return value
  return normalizeHex(value) ?? undefined
}

/**
 * Convert tab color value that came from outside back to the local form:
 * hex values that match palette entries become references to them.
 */
export function fromPortable(
  value?: string | null,
  list: CustomTabColor[] = reactive.list
): string | undefined {
  if (!value) return
  if (isBuiltIn(value)) return value
  if (isCustomRef(value)) return value
  const hex = normalizeHex(value)
  if (!hex) return
  const match = list.find(c => c.hex === hex)
  if (match) return makeCustomRef(match.id)
  return hex
}

// ---
// -- Bookmarks title marker
// -

/**
 * Get marker for bookmark title: 'c1'..'c8' for built-in colors, '#rrggbb' for others.
 */
export function getBookmarkMarker(
  value?: string | null,
  byId: Record<string, CustomTabColor> = reactive.byId
): string | undefined {
  const portable = toPortable(value, byId)
  if (!portable) return
  const builtInMarker = TAB_BOOKMARK_COLOR[portable]
  if (builtInMarker) return builtInMarker
  if (isNormHex(portable)) return portable
}

/**
 * Parse marker from bookmark title. Returns color value in local form.
 */
export function parseBookmarkMarker(
  marker: string,
  list: CustomTabColor[] = reactive.list
): string | undefined {
  const builtIn = BOOKMARK_TAB_COLOR[marker]
  if (builtIn) return builtIn
  if (marker.startsWith('#')) return fromPortable(marker, list)
}

// ---
// -- State
// -

export function setPalette(list: CustomTabColor[]) {
  reactive.list = list
  reactive.byId = indexPalette(list)
}
