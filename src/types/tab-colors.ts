/**
 * User-defined tab color.
 */
export interface CustomTabColor {
  /** Unique id, referenced by tabs as `custom:<id>` */
  id: string
  /** Optional display name (falls back to the hex value) */
  name: string
  /** Lowercase `#rrggbb` */
  hex: string
}

export interface TabColorsReactiveState {
  list: CustomTabColor[]
  byId: Record<string, CustomTabColor>
}
