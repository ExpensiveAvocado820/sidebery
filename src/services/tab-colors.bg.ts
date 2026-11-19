import type { CustomTabColor, Stored } from 'src/types'
import * as Logs from 'src/services/logs'
import * as Store from 'src/services/storage.bg'
import * as Tabs from 'src/services/tabs.bg'
import * as Windows from 'src/services/windows.bg'

import * as TabColors from 'src/services/tab-colors'
export * from 'src/services/tab-colors'

export async function load(): Promise<void> {
  Store.onKeyChange('customTabColors', (newList?: CustomTabColor[] | null) => {
    TabColors.setPalette(TabColors.sanitizePalette(newList))
  })

  let stored: Stored | undefined
  try {
    stored = await browser.storage.local.get<Stored>('customTabColors')
  } catch (err) {
    Logs.err('TabColors.bg.load: Cannot load palette', err)
  }

  TabColors.setPalette(TabColors.sanitizePalette(stored?.customTabColors))
}

/**
 * Count open tabs (in all windows) that use the given tab color value.
 */
export async function countTabsWithColor(value: string): Promise<number> {
  await Tabs.updateBgTabsTreeData().catch(() => {})

  let count = 0
  for (const window of Windows.byId.values()) {
    if (!window.tabs) continue
    for (const tab of window.tabs) {
      if (tab.customColor === value) count++
    }
  }
  return count
}
