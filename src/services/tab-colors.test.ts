import { describe, expect, test } from 'vitest'
import type { CustomTabColor } from 'src/types'
import { COLOR_IN_BOOKMARK_RE } from 'src/defaults'
import * as TabColors from 'src/services/tab-colors'

const palette: CustomTabColor[] = [
  { id: 'aaa', name: 'Work', hex: '#3fa7d6' },
  { id: 'bbb', name: '', hex: '#112233' },
]
const byId = TabColors.indexPalette(palette)

describe('TabColors.normalizeHex', () => {
  test('accepts 3 and 6 digit values with or without #', () => {
    expect(TabColors.normalizeHex('abc')).toBe('#aabbcc')
    expect(TabColors.normalizeHex('#abc')).toBe('#aabbcc')
    expect(TabColors.normalizeHex('aabbcc')).toBe('#aabbcc')
    expect(TabColors.normalizeHex('#AABBCC')).toBe('#aabbcc')
    expect(TabColors.normalizeHex('  #3FA7D6 ')).toBe('#3fa7d6')
  })

  test('rejects invalid values', () => {
    expect(TabColors.normalizeHex('')).toBeNull()
    expect(TabColors.normalizeHex('#ab')).toBeNull()
    expect(TabColors.normalizeHex('#abcd')).toBeNull()
    expect(TabColors.normalizeHex('#aabbccdd')).toBeNull()
    expect(TabColors.normalizeHex('ggg')).toBeNull()
    expect(TabColors.normalizeHex('blue')).toBeNull()
    expect(TabColors.normalizeHex(undefined)).toBeNull()
  })
})

describe('TabColors hsv <-> hex', () => {
  test('round trip', () => {
    for (const hex of [
      '#3fa7d6',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#000000',
      '#ffffff',
      '#808080',
    ]) {
      expect(TabColors.hsvToHex(TabColors.hexToHsv(hex))).toBe(hex)
    }
  })

  test('known values', () => {
    expect(TabColors.hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000')
    expect(TabColors.hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00')
    expect(TabColors.hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff')
    expect(TabColors.hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000')
    expect(TabColors.hsvToHex({ h: 200, s: 0, v: 1 })).toBe('#ffffff')
  })

  test('random color is valid', () => {
    expect(TabColors.isNormHex(TabColors.randomHex())).toBe(true)
  })
})

describe('TabColors.getColorCode', () => {
  test('built-in names', () => {
    expect(TabColors.getColorCode('blue', byId)).toBe('#37adff')
  })

  test('custom references', () => {
    expect(TabColors.getColorCode('custom:aaa', byId)).toBe('#3fa7d6')
    expect(TabColors.getColorCode('custom:missing', byId)).toBeUndefined()
  })

  test('plain hex values', () => {
    expect(TabColors.getColorCode('#ABCDEF', byId)).toBe('#abcdef')
  })

  test('empty and unknown values', () => {
    expect(TabColors.getColorCode(undefined, byId)).toBeUndefined()
    expect(TabColors.getColorCode('', byId)).toBeUndefined()
    expect(TabColors.getColorCode('nope', byId)).toBeUndefined()
  })
})

describe('TabColors.toPortable / fromPortable', () => {
  test('custom references become hex and come back', () => {
    const portable = TabColors.toPortable('custom:aaa', byId)
    expect(portable).toBe('#3fa7d6')
    expect(TabColors.fromPortable(portable, palette)).toBe('custom:aaa')
  })

  test('built-in names stay as they are', () => {
    expect(TabColors.toPortable('red', byId)).toBe('red')
    expect(TabColors.fromPortable('red', palette)).toBe('red')
  })

  test('unknown hex stays plain hex', () => {
    expect(TabColors.fromPortable('#ABCDEF', palette)).toBe('#abcdef')
  })

  test('missing custom reference is dropped on export', () => {
    expect(TabColors.toPortable('custom:missing', byId)).toBeUndefined()
  })
})

describe('TabColors bookmark marker', () => {
  function roundTrip(value: string): string | undefined {
    const marker = TabColors.getBookmarkMarker(value, byId)
    if (!marker) return
    const title = `Page title [${marker}]`
    const match = COLOR_IN_BOOKMARK_RE.exec(title)
    if (!match) return
    return TabColors.parseBookmarkMarker(match[1], palette)
  }

  test('built-in colors keep the old cN markers', () => {
    expect(TabColors.getBookmarkMarker('blue', byId)).toBe('c1')
    expect(roundTrip('purple')).toBe('purple')
  })

  test('custom colors are written as hex', () => {
    expect(TabColors.getBookmarkMarker('custom:aaa', byId)).toBe('#3fa7d6')
    expect(roundTrip('custom:aaa')).toBe('custom:aaa')
  })

  test('plain hex colors round trip', () => {
    expect(roundTrip('#abcdef')).toBe('#abcdef')
  })

  test('old markers still parse', () => {
    const match = COLOR_IN_BOOKMARK_RE.exec('Old bookmark [c6]')
    expect(match?.[1]).toBe('c6')
    expect(TabColors.parseBookmarkMarker('c6', palette)).toBe('red')
  })

  test('unknown markers are ignored', () => {
    expect(TabColors.parseBookmarkMarker('c9', palette)).toBeUndefined()
    expect(COLOR_IN_BOOKMARK_RE.test('Title [#abc]')).toBe(false)
  })
})

describe('TabColors.mergePalettes', () => {
  test('updates known ids, appends new ones, removes nothing', () => {
    const incoming = [
      { id: 'bbb', name: 'Renamed', hex: '#FFFFFF' },
      { id: 'ccc', name: 'New', hex: 'f00' },
    ]
    const merged = TabColors.mergePalettes(palette, incoming)
    expect(merged).toEqual([
      { id: 'aaa', name: 'Work', hex: '#3fa7d6' },
      { id: 'bbb', name: 'Renamed', hex: '#ffffff' },
      { id: 'ccc', name: 'New', hex: '#ff0000' },
    ])
    // Source is not mutated
    expect(palette[1].name).toBe('')
  })

  test('ignores invalid entries', () => {
    const incoming = [
      null,
      'str',
      { id: '', name: 'x', hex: '#fff' },
      { id: 'ddd', name: 'x', hex: 'nope' },
      { id: 'eee', name: 'y'.repeat(100), hex: '#fff' },
      { id: 'eee', name: 'dup', hex: '#000' },
    ]
    const merged = TabColors.mergePalettes([], incoming)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('eee')
    expect(merged[0].name).toHaveLength(TabColors.MAX_NAME_LEN)
  })

  test('non-array input keeps the current palette', () => {
    expect(TabColors.mergePalettes(palette, undefined)).toEqual(palette)
    expect(TabColors.mergePalettes(palette, { a: 1 })).toEqual(palette)
  })
})
