import type { CustomTabColor, Stored } from 'src/types'
import { translate } from 'src/dict'
import * as Utils from 'src/utils'
import * as Logs from 'src/services/logs'
import * as Info from 'src/services/info'
import * as IPC from 'src/services/ipc'
import * as Store from 'src/services/storage.fg'
import * as Settings from 'src/services/settings'
import * as Sync from 'src/services/sync.fg'
import * as Notifications from 'src/services/notifications.fg'
import * as Tabs from 'src/services/tabs.fg'

import * as TabColors from 'src/services/tab-colors'
export * from 'src/services/tab-colors'

let listenersReady = false

export async function load(): Promise<void> {
  if (!listenersReady) {
    Store.onKeyChange('customTabColors', onStoredPaletteChanged)
    listenersReady = true
  }

  let stored: Stored | undefined
  try {
    stored = await browser.storage.local.get<Stored>('customTabColors')
  } catch (err) {
    Logs.err('TabColors.load: Cannot load palette', err)
  }

  TabColors.setPalette(TabColors.sanitizePalette(stored?.customTabColors))
}

function onStoredPaletteChanged(newList?: CustomTabColor[] | null) {
  applyPalette(TabColors.sanitizePalette(newList))
}

/**
 * Apply new palette locally and clean up tabs that referenced removed colors.
 */
function applyPalette(newList: CustomTabColor[]) {
  const removed = TabColors.reactive.list.filter(c => !newList.some(n => n.id === c.id))
  TabColors.setPalette(newList)

  if (Info.isSidebar && removed.length) {
    const refs = new Set(removed.map(c => TabColors.makeCustomRef(c.id)))
    const ids: ID[] = []
    for (const tab of Tabs.list) {
      if (tab.customColor && refs.has(tab.customColor)) ids.push(tab.id)
    }
    if (ids.length) Tabs.setCustomColor(ids, 'toolbar')
  }
}

async function save(newList: CustomTabColor[]): Promise<void> {
  applyPalette(newList)

  const list = Utils.clone(newList)
  await Store.set({ customTabColors: list })

  if (Settings.state.syncSaveTabColors) saveToSyncDebounced(500)
}

export async function saveToSync(): Promise<void> {
  await Sync.save(Sync.SyncedEntryType.TabColors, Utils.clone(TabColors.reactive.list))
}
export const saveToSyncDebounced = Utils.debounce(saveToSync)

export async function add(hex: string, name?: string): Promise<CustomTabColor> {
  const color = TabColors.createColor(hex, name)
  await save([...TabColors.reactive.list, color])
  return color
}

export async function update(id: string, hex: string, name?: string): Promise<void> {
  const normHex = TabColors.normalizeHex(hex)
  if (!normHex) return
  const newList = TabColors.reactive.list.map(c => {
    if (c.id !== id) return c
    return { id, hex: normHex, name: TabColors.normalizeName(name) }
  })
  await save(newList)
}

export async function remove(id: string): Promise<void> {
  await save(TabColors.reactive.list.filter(c => c.id !== id))
}

export async function move(id: string, dir: -1 | 1): Promise<void> {
  const list = [...TabColors.reactive.list]
  const index = list.findIndex(c => c.id === id)
  const target = index + dir
  if (index === -1 || target < 0 || target >= list.length) return
  const [color] = list.splice(index, 1)
  list.splice(target, 0, color)
  await save(list)
}

/**
 * Get the number of open tabs (in all windows) that use the given color.
 */
export async function countTabsWithColor(id: string): Promise<number> {
  try {
    return await IPC.bg('countTabsWithColor', TabColors.makeCustomRef(id))
  } catch (err) {
    Logs.err('TabColors.countTabsWithColor', err)
    return 0
  }
}

/**
 * Merge imported palette (backup file or sync) into the current one.
 */
export async function importPalette(incoming: unknown): Promise<void> {
  // Re-read the palette: the caller's page might not have loaded it
  const current = await getStoredPalette()
  const merged = TabColors.mergePalettes(current, incoming)
  await save(merged)
}

async function getStoredPalette(): Promise<CustomTabColor[]> {
  const stored = await browser.storage.local.get<Stored>('customTabColors')
  return TabColors.sanitizePalette(stored?.customTabColors)
}

export async function importSynced(entry: Sync.SyncedEntry): Promise<void> {
  Logs.info('TabColors.importSynced(): entry:', entry.id)

  const prevList = await getStoredPalette()
  const data = await Sync.getData<CustomTabColor[]>(entry)
  if (!data) {
    Logs.err('TabColors.importSynced(): No data')
    return
  }

  await importPalette(data)

  Notifications.notify({
    icon: '#icon_sync',
    title: translate('sync.success.import_tab_colors'),
    ctrl: translate('notif.undo_ctrl'),
    callback: () => save(prevList),
  })
}
