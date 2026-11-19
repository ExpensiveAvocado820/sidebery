<template lang="pug">
.TabColorsField
  .field-header
    .label {{translate('settings.tabs.custom_colors')}}
    .btn.add-btn(@click="addColor")
      svg: use(href="#icon_plus")
      span {{translate('settings.tabs.custom_colors_add')}}
  .color-list(v-if="TabColors.reactive.list.length")
    .color-item(
      v-for="(color, i) in TabColors.reactive.list"
      :key="color.id"
      :title="tooltip(color)"
      @click="editColor(color)")
      .swatch(:style="{ '--swatch-color': color.hex }")
      .name {{TabColors.getDisplayName(color)}}
      .hex(v-if="color.name") {{color.hex}}
      .ctrl-btn.-up(
        :data-inactive="i === 0"
        :title="translate('settings.tabs.custom_colors_up')"
        @click.stop="TabColors.move(color.id, -1)")
        svg: use(href="#icon_expand")
      .ctrl-btn.-down(
        :data-inactive="i === TabColors.reactive.list.length - 1"
        :title="translate('settings.tabs.custom_colors_down')"
        @click.stop="TabColors.move(color.id, 1)")
        svg: use(href="#icon_expand")
      .ctrl-btn.-rm(
        :title="translate('settings.tabs.custom_colors_rm')"
        @click.stop="removeColor(color)")
        svg: use(href="#icon_trash")
  .note(v-else) {{translate('settings.tabs.custom_colors_empty')}}
</template>

<script lang="ts" setup>
import type { CustomTabColor } from 'src/types'
import { translate } from 'src/dict'
import * as TabColors from 'src/services/tab-colors.fg'
import * as Popups from 'src/services/popups.fg'

function tooltip(color: CustomTabColor): string {
  return color.name ? `${color.name} (${color.hex})` : color.hex
}

async function addColor() {
  const result = await Popups.openColorPicker({ hex: TabColors.randomHex() })
  if (!result) return
  await TabColors.add(result.hex, result.name)
}

async function editColor(color: CustomTabColor) {
  const result = await Popups.openColorPicker({
    hex: color.hex,
    name: color.name,
    editing: true,
  })
  if (!result) return

  if (result.remove) await removeColor(color)
  else await TabColors.update(color.id, result.hex, result.name)
}

async function removeColor(color: CustomTabColor) {
  const count = await TabColors.countTabsWithColor(color.id)
  if (count > 0) {
    const answer = await Popups.ask({
      title: translate('settings.tabs.custom_colors_rm_title'),
      note: translate('settings.tabs.custom_colors_rm_note', count),
      buttonsInline: true,
      buttonsCentered: true,
      buttons: [
        { label: translate('settings.tabs.custom_colors_rm'), value: 'rm', warn: true },
        { label: translate('btn.cancel'), value: '-' },
      ],
      buttonsDefaultFocus: '-',
    })
    if (answer !== 'rm') return
  }

  await TabColors.remove(color.id)
}
</script>
