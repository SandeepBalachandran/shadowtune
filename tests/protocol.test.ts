import { describe, expect, it } from 'vitest'
import {
  configAckMatches,
  configRequest,
  configWrite,
  keysWrite,
  parseBattery,
  parseConfig,
  parseEvent,
  parseKeys,
  parseVersion
} from '../src/main/device/protocol'
import { DEFAULT_KEYS } from '../src/shared/types'

// Real frames captured from a Shadow X Pro receiver on 2026-10-19 (docs/PROTOCOL.md §5).
const h = (s: string) => {
  const bytes = s.trim().split(/\s+/).map((x) => parseInt(x, 16))
  return [...bytes, ...new Array(64 - bytes.length).fill(0)]
}
const z = (n: number) => new Array(n).fill('00').join(' ')

const VERSION_RX = h(
  'f0 03 00 16 38 00 00 00 59 4a 58 2e 63 6f 2e 64 6f 6e 67 6c aa 02 03 32 31 33 4d 61 72 20 32 30 20 32 30 32 36 31 35 3a 30 30 3a 31 37 4d 61 72 20 32 30 20 32 30 32 36 31 35 3a 30 30 3a 31 37'
)
const BATTERY_RX = h('f0 30 a5 95 2e 01 01 01 64 00')
const CONFIG_RX = h(`f0 0e a5 74 2e 01 01 01 00 06 03 05 05 20 03 b0 04 40 06 80 0c 00 19 40 1f ${z(27)} 0f 00 11`)
const CONFIG_WRITE_TX = h(`f0 0f ae 0a 2f 01 01 01 00 06 03 05 05 20 03 b0 04 40 06 80 0c 00 19 40 1f ${z(27)} 0f 00 11`)
const CONFIG_ACK_RX = h(`f0 0f ae 86 2f 01 01 01 00 06 03 05 05 20 03 b0 04 40 06 80 0c 00 19 40 1f ${z(27)} 0f 00 11`)
const KEYS_RX = h('f0 08 a5 07 20 00 00 00 20 01 00 00 20 02 00 00 20 04 00 00 20 08 00 00 20 10 00 00 21 55 00 00 21 38 01 00 21 38 ff 00')

describe('protocol — real device captures', () => {
  it('decodes the firmware version reply', () => {
    expect(parseVersion(VERSION_RX)).toEqual({ version: '2.1.3', banner: 'YJX.co.dongl', build: 'Mar 20 2026 15:00:17' })
  })

  it('decodes battery', () => {
    expect(parseBattery(BATTERY_RX)).toEqual({ percent: 100, charging: false })
    expect(parseBattery(h('f0 30 a5 95 2e 01 01 01 c8 00'))).toBeNull()
  })

  it('decodes the config block', () => {
    expect(parseConfig(CONFIG_RX)).toEqual({
      lightMode: 6,
      pollingRate: 2,
      dpiCount: 5,
      activeDpiStage: 4,
      dpiStages: [800, 1200, 1600, 3200, 6400, 8000],
      scrollDirection: 0,
      liftOffDistance: 0,
      sensorFlags: 0,
      debounceMs: 0,
      sleepMinutes: 15,
      highspeedMode: 0,
      wakeMode: 1,
      moveLightMode: 1
    })
  })

  it('treats an all-zero config block as uninitialised', () => {
    expect(parseConfig(h('f0 0e a5 74 2e 01 01 01'))).toBeNull()
  })

  it('encodes a config write byte-for-byte like the frame accepted by the mouse', () => {
    const cfg = parseConfig(CONFIG_RX)!
    expect(configWrite(cfg)).toEqual(CONFIG_WRITE_TX)
  })

  it('matches the acknowledgement while ignoring byte 3', () => {
    expect(configAckMatches(CONFIG_WRITE_TX, CONFIG_ACK_RX)).toBe(true)
    const bad = [...CONFIG_ACK_RX]
    bad[13] = 0x21
    expect(configAckMatches(CONFIG_WRITE_TX, bad)).toBe(false)
  })

  it('decodes the key map and round-trips it through keysWrite', () => {
    const keys = parseKeys(KEYS_RX)
    expect(keys).toEqual(DEFAULT_KEYS)
    const tx = keysWrite(keys)
    expect(tx.slice(0, 8)).toEqual([0xf0, 0x09, 0xa5, 0x22, 0x2c, 0, 0, 0])
    expect(tx.slice(8, 40)).toEqual(KEYS_RX.slice(8, 40))
  })

  it('builds read requests with the vendor header', () => {
    expect(configRequest().slice(0, 8)).toEqual([0xf0, 0x0e, 0xa5, 0x0b, 0x2e, 1, 1, 1])
    expect(configRequest()).toHaveLength(64)
  })

  it('splits wake and move-light nibbles independently', () => {
    const cfg = { ...parseConfig(CONFIG_RX)!, wakeMode: 0, moveLightMode: 1 }
    expect(configWrite(cfg)[54]).toBe(0x01)
    expect(parseConfig(configWrite(cfg))).toMatchObject({ wakeMode: 0, moveLightMode: 1 })
  })

  it('decodes unsolicited DPI and battery events', () => {
    expect(parseEvent(h('f0 fa 00 00 00 00 00 00 00 03 04'))).toEqual({ kind: 'status', activeDpiStage: 2, pollingRate: 3 })
    expect(parseEvent(h('f0 fa 00 00 00 00 00 00 00 d0 04'))).toBeNull()
    expect(parseEvent(BATTERY_RX)).toEqual({ kind: 'battery', battery: { percent: 100, charging: false } })
    expect(parseEvent(CONFIG_RX)).toBeNull()
  })
})
