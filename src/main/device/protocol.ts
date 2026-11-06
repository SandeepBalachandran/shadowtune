// EvoFox Shadow X Pro vendor protocol — pure encode/decode, no I/O.
//
// Frames are 64-byte arrays INCLUDING the HID report ID at index 0 (node-hid convention).
// Requests and replies both use report ID 0xF0 on the vendor collection
// (usage page 0xFF01, usage 0x10). Replies echo the command at index 1.
// Offsets were taken from the official web configurator and confirmed against
// a real device on 2026-10-19 — see docs/PROTOCOL.md.

import { BatteryInfo, FirmwareInfo, KeyBinding, MouseConfig, TOTAL_KEY_SLOTS } from '../../shared/types'

export const FRAME_LENGTH = 64
export const REPORT_ID = 0xf0

export const CMD = {
  VERSION: 0x03,
  KEYS_READ: 0x08,
  KEYS_WRITE: 0x09,
  CONFIG_READ: 0x0e,
  CONFIG_WRITE: 0x0f,
  BATTERY: 0x30,
  /** Unsolicited: DPI stage / polling rate changed from the mouse itself. */
  STATUS_EVENT: 0xfa
} as const

export const VENDOR_IDS = { WIRED: 0xa8a4, RECEIVER: 0xa8a5 } as const
export const VENDOR_USAGE_PAGE = 0xff01
export const VENDOR_USAGE = 0x10

export type Frame = number[]

function frame(prefix: number[]): Frame {
  const f = new Array<number>(FRAME_LENGTH).fill(0)
  prefix.forEach((b, i) => (f[i] = b & 0xff))
  return f
}

const u16 = (f: ArrayLike<number>, i: number) => f[i] | (f[i + 1] << 8)
const ascii = (f: ArrayLike<number>, from: number, to: number) =>
  Array.from(f)
    .slice(from, to)
    .filter((c) => c >= 0x20 && c < 0x7f)
    .map((c) => String.fromCharCode(c))
    .join('')

export const isReplyTo = (f: ArrayLike<number>, cmd: number) => f.length >= 2 && f[0] === REPORT_ID && f[1] === cmd

// ---------------------------------------------------------------- requests

export const versionRequest = (): Frame => frame([REPORT_ID, CMD.VERSION])
export const batteryRequest = (): Frame => frame([REPORT_ID, CMD.BATTERY, 0xa5, 0x0b, 0x2e, 0x01, 0x01, 0x01])
export const configRequest = (): Frame => frame([REPORT_ID, CMD.CONFIG_READ, 0xa5, 0x0b, 0x2e, 0x01, 0x01, 0x01])
export const keysRequest = (): Frame => frame([REPORT_ID, CMD.KEYS_READ, 0xa5, 0x0b, 0x2c, 0x00, 0x00, 0x00])

// Byte positions of the config block. Identical in the read reply and the write request.
const CFG = {
  lightMode: 9,
  pollingRate: 10, // stored as index + 1
  dpiCount: 11,
  activeStage: 12, // stored as index + 1
  dpiStages: 13, // 6 × u16 little-endian
  scroll: 48,
  lod: 49,
  sensor: 50,
  debounce: 51,
  sleep: 52,
  highspeed: 53,
  wakeAndMoveLight: 54 // high nibble = wake mode, low nibble = move-light mode
} as const

export function configWrite(c: MouseConfig): Frame {
  const f = frame([REPORT_ID, CMD.CONFIG_WRITE, 0xae, 0x0a, 0x2f, 0x01, 0x01, 0x01, 0x00])
  f[CFG.lightMode] = c.lightMode
  f[CFG.pollingRate] = c.pollingRate + 1
  f[CFG.dpiCount] = c.dpiCount
  f[CFG.activeStage] = c.activeDpiStage + 1
  c.dpiStages.forEach((dpi, i) => {
    f[CFG.dpiStages + i * 2] = dpi & 0xff
    f[CFG.dpiStages + i * 2 + 1] = (dpi >> 8) & 0xff
  })
  f[CFG.scroll] = c.scrollDirection
  f[CFG.lod] = c.liftOffDistance
  f[CFG.sensor] = c.sensorFlags
  f[CFG.debounce] = c.debounceMs
  f[CFG.sleep] = c.sleepMinutes
  f[CFG.highspeed] = c.highspeedMode
  f[CFG.wakeAndMoveLight] = ((c.wakeMode & 0x0f) << 4) | (c.moveLightMode & 0x0f)
  return f
}

export function keysWrite(keys: KeyBinding[]): Frame {
  if (keys.length !== TOTAL_KEY_SLOTS) throw new Error(`keysWrite needs ${TOTAL_KEY_SLOTS} slots`)
  const f = frame([REPORT_ID, CMD.KEYS_WRITE, 0xa5, 0x22, 0x2c, 0x00, 0x00, 0x00])
  keys.forEach((k, i) => {
    const o = 8 + i * 4
    f[o] = k.type
    f[o + 1] = k.code1
    f[o + 2] = k.code2
    f[o + 3] = k.code3
  })
  return f
}

// ---------------------------------------------------------------- replies

export function parseVersion(f: ArrayLike<number>): FirmwareInfo {
  const digit = (c: number) => (c >= 0x30 && c <= 0x39 ? String.fromCharCode(c) : '0')
  return {
    version: `${digit(f[23])}.${digit(f[24])}.${digit(f[25])}`,
    banner: ascii(f, 8, 20),
    build: `${ascii(f, 26, 37)} ${ascii(f, 37, 45)}`.trim()
  }
}

export function parseBattery(f: ArrayLike<number>): BatteryInfo | null {
  const percent = f[8]
  if (percent > 100) return null
  return { percent, charging: f[9] !== 0 }
}

/** Returns null when the device reports an uninitialised config block (all 0x00 / 0xFF). */
export function parseConfig(f: ArrayLike<number>): MouseConfig | null {
  const probe = [f[14], f[15], f[16]]
  if (probe.every((b) => b === 0) || probe.every((b) => b === 0xff)) return null
  return {
    lightMode: f[CFG.lightMode],
    pollingRate: Math.max(0, f[CFG.pollingRate] - 1),
    dpiCount: f[CFG.dpiCount],
    activeDpiStage: Math.max(0, f[CFG.activeStage] - 1),
    dpiStages: Array.from({ length: 6 }, (_, i) => u16(f, CFG.dpiStages + i * 2)),
    scrollDirection: f[CFG.scroll],
    liftOffDistance: f[CFG.lod],
    sensorFlags: f[CFG.sensor],
    debounceMs: f[CFG.debounce],
    sleepMinutes: f[CFG.sleep],
    highspeedMode: f[CFG.highspeed],
    // The official configurator reads both from the high nibble (a bug); we split them properly.
    wakeMode: (f[CFG.wakeAndMoveLight] >> 4) & 0x0f,
    moveLightMode: f[CFG.wakeAndMoveLight] & 0x0f
  }
}

export function parseKeys(f: ArrayLike<number>): KeyBinding[] {
  return Array.from({ length: TOTAL_KEY_SLOTS }, (_, i) => {
    const o = 8 + i * 4
    return { type: f[o], code1: f[o + 1], code2: f[o + 2], code3: f[o + 3] }
  })
}

/** Bytes that a config-write acknowledgement must echo back (everything except the header byte 3). */
export function configAckMatches(sent: Frame, ack: ArrayLike<number>): boolean {
  for (let i = 0; i < FRAME_LENGTH; i++) {
    if (i === 3) continue
    if (sent[i] !== ack[i]) return false
  }
  return true
}

export type DeviceEvent =
  | { kind: 'status'; activeDpiStage: number; pollingRate: number }
  | { kind: 'battery'; battery: BatteryInfo }

/** Decodes frames the mouse sends on its own (button presses, battery updates). */
// The configurator matches these on the byte after the report ID without checking the
// report ID itself, so neither do we.
export function parseEvent(f: ArrayLike<number>): DeviceEvent | null {
  if (f[1] === CMD.STATUS_EVENT && f[9] !== 0xd0) {
    return { kind: 'status', activeDpiStage: Math.max(0, f[9] - 1), pollingRate: Math.max(0, f[10] - 1) }
  }
  if (f[1] === CMD.BATTERY) {
    const battery = parseBattery(f)
    return battery ? { kind: 'battery', battery } : null
  }
  return null
}

export const toHex = (f: ArrayLike<number>, len = FRAME_LENGTH) =>
  Array.from(f)
    .slice(0, len)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
