import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildReport, estimateDrain } from '../src/main/batteryHistory'
import { ProfileStore } from '../src/main/profiles'
import { batteryColor, renderBadge } from '../src/main/trayIcon'
import { DEFAULT_CONFIG, DEFAULT_KEYS, DEFAULT_SETTINGS } from '../src/shared/types'
import { validateSettings, validateWindowsPointer } from '../src/shared/validation'

const H = 3_600_000
const buttons = () => DEFAULT_KEYS.slice(0, 5).map((k) => ({ ...k }))

describe('battery history', () => {
  it('needs enough unplugged history before estimating', () => {
    expect(estimateDrain([{ ts: 0, percent: 100, charging: false }, { ts: H, percent: 99, charging: false }])).toBeNull()
  })

  it('estimates drain and time left, ignoring charging and long gaps', () => {
    const s = [
      { ts: 0, percent: 100, charging: false },
      { ts: 2 * H, percent: 96, charging: false }, // 2 %/h
      { ts: 4 * H, percent: 92, charging: false },
      { ts: 20 * H, percent: 90, charging: false }, // 16 h gap → ignored
      { ts: 21 * H, percent: 95, charging: true }, // charging → ignored
      { ts: 22 * H, percent: 99, charging: true }
    ]
    expect(estimateDrain(s)).toBeCloseTo(2)
    const r = buildReport(s, { percent: 50, charging: false }, 22 * H)
    expect(r.hoursLeft).toBeCloseTo(25)
    expect(buildReport(s, { percent: 50, charging: true }, 22 * H).hoursLeft).toBeNull()
  })
})

describe('tray battery icon', () => {
  it('draws white digits on a coloured rounded square', () => {
    const size = 32
    const px = renderBadge(size, '87', batteryColor(87, false))
    const at = (x: number, y: number) => Array.from(px.subarray((y * size + x) * 4, (y * size + x) * 4 + 4))
    expect(at(0, 0)[3]).toBe(0) // rounded corner is transparent
    expect(at(16, 2)).toEqual([31, 90, 255, 255]) // orange background (BGRA)
    const white = Array.from({ length: size * size }, (_, i) => i).filter((i) => px[i * 4] === 255 && px[i * 4 + 1] === 255 && px[i * 4 + 2] === 255)
    expect(white.length).toBeGreaterThan(40)
  })

  it('uses status colours', () => {
    expect(batteryColor(10, false)).toEqual([229, 56, 59])
    expect(batteryColor(10, true)).toEqual([47, 179, 107])
  })
})

describe('profiles folder & Windows pointer settings', () => {
  let a: string
  let b: string
  beforeEach(async () => {
    a = await mkdtemp(path.join(tmpdir(), 'evofox-a-'))
    b = await mkdtemp(path.join(tmpdir(), 'evofox-b-'))
  })
  afterEach(async () => {
    await rm(a, { recursive: true, force: true })
    await rm(b, { recursive: true, force: true })
  })

  it('stores Windows pointer settings with a profile', async () => {
    const store = new ProfileStore(a)
    const p = await store.save('Work', DEFAULT_CONFIG, buttons(), undefined, { pointerSpeed: 12, enhancePrecision: true, scrollLines: 3 })
    expect((await store.get(p.id))?.windows).toEqual({ pointerSpeed: 12, enhancePrecision: true, scrollLines: 3 })
    await expect(store.save('Bad', DEFAULT_CONFIG, buttons(), undefined, { pointerSpeed: 30, enhancePrecision: true, scrollLines: 3 })).rejects.toThrow()
  })

  it('moves profiles to a new folder and merges with what is there', async () => {
    const synced = new ProfileStore(b)
    await synced.save('From other PC', DEFAULT_CONFIG, buttons())
    const store = new ProfileStore(a)
    await store.save('Local', DEFAULT_CONFIG, buttons())
    await store.setDir(b)
    expect(store.folder).toBe(b)
    expect((await store.list()).map((p) => p.name).sort()).toEqual(['From other PC', 'Local'])
    const file = JSON.parse(await readFile(path.join(b, 'profiles.json'), 'utf8'))
    expect(file.profiles).toHaveLength(2)
    await store.setDir(null)
    expect(store.folder).toBe(a)
  })

  it('validates pointer settings and program-specific actions', () => {
    expect(validateWindowsPointer({ pointerSpeed: 10, enhancePrecision: false, scrollLines: 3 })).toEqual([])
    expect(validateWindowsPointer({ pointerSpeed: 0, enhancePrecision: false, scrollLines: 3 })).not.toEqual([])
    const ok = { ...DEFAULT_SETTINGS, powerKeyOverrides: [{ id: '1', key: 'F13', exe: 'chrome.exe', action: { kind: 'micMute' } }] }
    expect(validateSettings(ok)).toEqual([])
    const bad = { ...DEFAULT_SETTINGS, powerKeyOverrides: [{ id: '1', key: 'F99', exe: 'chrome.exe', action: { kind: 'none' } }] }
    expect(validateSettings(bad)).not.toEqual([])
  })
})
