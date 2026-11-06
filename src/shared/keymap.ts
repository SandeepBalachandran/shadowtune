import { F13_USAGE, KeyBinding, POWER_KEYS, PowerAction, PowerKey } from './types'

// Action types used in key slots (from the official configurator's key tables).
export const KEY_TYPE = {
  KEYBOARD: 0x10, // code1 = modifier mask, code2 = HID keyboard usage
  MOUSE: 0x20, // code1 = button mask (0 = disabled)
  MOUSE_SPECIAL: 0x21, // DPI cycle / wheel
  CONSUMER: 0x30, // code1/code2 = 16-bit consumer usage, little-endian
  MACRO: 0x70 // code1 = macro index (macros are not editable in this version)
} as const

export const MODIFIERS = [
  { bit: 0x01, label: 'Ctrl' },
  { bit: 0x02, label: 'Shift' },
  { bit: 0x04, label: 'Alt' },
  { bit: 0x08, label: 'Win' }
] as const

export interface ActionDef {
  label: string
  binding: KeyBinding
}

export interface ActionGroup {
  group: string
  actions: ActionDef[]
}

const b = (type: number, code1: number, code2 = 0, code3 = 0): KeyBinding => ({ type, code1, code2, code3 })
const consumer = (usage: number) => b(KEY_TYPE.CONSUMER, usage & 0xff, usage >> 8)
const combo = (mods: number, key: number) => b(KEY_TYPE.KEYBOARD, mods, key)

export const ACTION_GROUPS: ActionGroup[] = [
  {
    group: 'Mouse',
    actions: [
      { label: 'Left click', binding: b(0x20, 0x01) },
      { label: 'Right click', binding: b(0x20, 0x02) },
      { label: 'Middle click', binding: b(0x20, 0x04) },
      { label: 'Back', binding: b(0x20, 0x08) },
      { label: 'Forward', binding: b(0x20, 0x10) },
      { label: 'Scroll up', binding: b(0x21, 0x38, 0x01) },
      { label: 'Scroll down', binding: b(0x21, 0x38, 0xff) },
      { label: 'DPI cycle', binding: b(0x21, 0x55) },
      { label: 'Disabled', binding: b(0x20, 0x00) }
    ]
  },
  {
    group: 'Media',
    actions: [
      { label: 'Play / pause', binding: consumer(0x00cd) },
      { label: 'Stop', binding: consumer(0x00b7) },
      { label: 'Previous track', binding: consumer(0x00b6) },
      { label: 'Next track', binding: consumer(0x00b5) },
      { label: 'Volume up', binding: consumer(0x00e9) },
      { label: 'Volume down', binding: consumer(0x00ea) },
      { label: 'Mute', binding: consumer(0x00e2) },
      { label: 'Media player', binding: consumer(0x0183) }
    ]
  },
  {
    group: 'System & browser',
    actions: [
      { label: 'Brightness up', binding: consumer(0x006f) },
      { label: 'Brightness down', binding: consumer(0x0070) },
      { label: 'Browser home', binding: consumer(0x0223) },
      { label: 'Browser back', binding: consumer(0x0224) },
      { label: 'Browser forward', binding: consumer(0x0225) },
      { label: 'Browser refresh', binding: consumer(0x0227) },
      { label: 'Browser search', binding: consumer(0x0221) },
      { label: 'Calculator', binding: consumer(0x0192) },
      { label: 'This PC', binding: consumer(0x0194) },
      { label: 'Mail', binding: consumer(0x018a) }
    ]
  },
  {
    group: 'Shortcuts',
    actions: [
      { label: 'Copy (Ctrl+C)', binding: combo(0x01, 0x06) },
      { label: 'Paste (Ctrl+V)', binding: combo(0x01, 0x19) },
      { label: 'Cut (Ctrl+X)', binding: combo(0x01, 0x1b) },
      { label: 'Undo (Ctrl+Z)', binding: combo(0x01, 0x1d) },
      { label: 'Redo (Ctrl+Y)', binding: combo(0x01, 0x1c) },
      { label: 'Select all (Ctrl+A)', binding: combo(0x01, 0x04) },
      { label: 'Save (Ctrl+S)', binding: combo(0x01, 0x16) },
      { label: 'New tab (Ctrl+T)', binding: combo(0x01, 0x17) },
      { label: 'Close tab (Ctrl+W)', binding: combo(0x01, 0x1a) },
      { label: 'Switch app (Alt+Tab)', binding: combo(0x04, 0x2b) },
      { label: 'Show desktop (Win+D)', binding: combo(0x08, 0x07) },
      { label: 'File Explorer (Win+E)', binding: combo(0x08, 0x08) },
      { label: 'Lock PC (Win+L)', binding: combo(0x08, 0x0f) },
      { label: 'Task view (Win+Tab)', binding: combo(0x08, 0x2b) },
      { label: 'Task Manager (Ctrl+Shift+Esc)', binding: combo(0x03, 0x29) }
    ]
  }
]

/** HID keyboard usages selectable in the custom key builder. */
export const KEYBOARD_KEYS: { label: string; usage: number }[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c, i) => ({ label: c, usage: 0x04 + i })),
  ...'1234567890'.split('').map((c, i) => ({ label: c, usage: 0x1e + i })),
  ...Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, usage: 0x3a + i })),
  { label: 'Enter', usage: 0x28 },
  { label: 'Esc', usage: 0x29 },
  { label: 'Backspace', usage: 0x2a },
  { label: 'Tab', usage: 0x2b },
  { label: 'Space', usage: 0x2c },
  { label: '-', usage: 0x2d },
  { label: '=', usage: 0x2e },
  { label: '[', usage: 0x2f },
  { label: ']', usage: 0x30 },
  { label: '\\', usage: 0x31 },
  { label: ';', usage: 0x33 },
  { label: "'", usage: 0x34 },
  { label: '`', usage: 0x35 },
  { label: ',', usage: 0x36 },
  { label: '.', usage: 0x37 },
  { label: '/', usage: 0x38 },
  { label: 'Caps Lock', usage: 0x39 },
  { label: 'Print Screen', usage: 0x46 },
  { label: 'Scroll Lock', usage: 0x47 },
  { label: 'Pause', usage: 0x48 },
  { label: 'Insert', usage: 0x49 },
  { label: 'Home', usage: 0x4a },
  { label: 'Page Up', usage: 0x4b },
  { label: 'Delete', usage: 0x4c },
  { label: 'End', usage: 0x4d },
  { label: 'Page Down', usage: 0x4e },
  { label: 'Right', usage: 0x4f },
  { label: 'Left', usage: 0x50 },
  { label: 'Down', usage: 0x51 },
  { label: 'Up', usage: 0x52 },
  ...POWER_KEYS.map((k, i) => ({ label: k, usage: F13_USAGE + i }))
]

/** Returns the power key (F13–F24) a binding sends without modifiers, or null. */
export function powerKeyOf(k: KeyBinding): PowerKey | null {
  if (k.type !== KEY_TYPE.KEYBOARD || k.code1 !== 0) return null
  const i = k.code2 - F13_USAGE
  return i >= 0 && i < POWER_KEYS.length ? POWER_KEYS[i] : null
}

export const powerKeyBinding = (key: PowerKey): KeyBinding => b(KEY_TYPE.KEYBOARD, 0, F13_USAGE + POWER_KEYS.indexOf(key))

export function describePowerAction(a: PowerAction, profileName?: (id: string) => string | undefined): string {
  switch (a.kind) {
    case 'none':
      return 'Nothing assigned'
    case 'open':
      return `Open ${a.target.split(/[\\/]/).pop() || a.target}`
    case 'url':
      return `Open ${a.url.replace(/^https?:\/\//i, '').replace(/\/$/, '')}`
    case 'text':
      return `Type “${a.text.length > 24 ? `${a.text.slice(0, 24)}…` : a.text}”`
    case 'profile':
      return `Switch to profile “${profileName?.(a.profileId) ?? 'deleted profile'}”`
    case 'cycleDpi':
      return 'Next DPI stage'
    case 'toggleLights':
      return 'Lights on / off'
    case 'screenshot':
      return 'Screenshot (Snipping Tool)'
    case 'lock':
      return 'Lock PC'
    case 'micMute':
      return 'Mute / unmute microphone'
  }
}

export const sameBinding = (a: KeyBinding, b2: KeyBinding) =>
  a.type === b2.type && a.code1 === b2.code1 && a.code2 === b2.code2 && a.code3 === b2.code3

export function keyboardBinding(modifiers: number, usage: number): KeyBinding {
  return combo(modifiers & 0x0f, usage & 0xff)
}

export function describeBinding(k: KeyBinding): string {
  for (const g of ACTION_GROUPS) {
    const hit = g.actions.find((a) => sameBinding(a.binding, k))
    if (hit) return hit.label
  }
  const power = powerKeyOf(k)
  if (power) return `Power key ${power}`
  if (k.type === KEY_TYPE.KEYBOARD) {
    const mods = MODIFIERS.filter((m) => k.code1 & m.bit).map((m) => m.label)
    const key = KEYBOARD_KEYS.find((x) => x.usage === k.code2)?.label ?? `Key 0x${k.code2.toString(16)}`
    return [...mods, key].join('+')
  }
  if (k.type === KEY_TYPE.MACRO) return `Macro #${k.code1 + 1} (set in official app)`
  if (k.type === 0 || k.type === 0xff) return 'Not set'
  return `Custom (type 0x${k.type.toString(16)})`
}
