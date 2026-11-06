import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoSwitcher, ProfileTarget } from '../src/main/autoSwitch'
import { describeBinding, describePowerAction, powerKeyBinding, powerKeyOf } from '../src/shared/keymap'
import { DEFAULT_CONFIG, DEFAULT_KEYS, DEFAULT_SETTINGS, KeyBinding, MouseConfig, Profile } from '../src/shared/types'
import { validateSettings } from '../src/shared/validation'

const buttons = () => DEFAULT_KEYS.slice(0, 5).map((k) => ({ ...k }))
const profile = (id: string, dpi: number): Profile => ({
  id,
  name: id,
  createdAt: 0,
  updatedAt: 0,
  config: { ...DEFAULT_CONFIG, dpiStages: [dpi, 1200, 1600, 3200, 6400, 8000] },
  buttons: buttons()
})

/** Fake mouse that records writes. */
function fakeTarget() {
  let config: MouseConfig = { ...DEFAULT_CONFIG }
  let keys: KeyBinding[] = DEFAULT_KEYS.map((k) => ({ ...k }))
  const writes: string[] = []
  const target: ProfileTarget = {
    getState: () => ({ status: 'connected', mouseResponding: true, busy: false, config, keys }),
    applyConfig: async (c) => {
      writes.push(`config:${c.dpiStages[0]}`)
      config = c
      return { ok: true, message: '' }
    },
    applyButtons: async (b) => {
      writes.push('buttons')
      keys = [...b, ...keys.slice(5)]
      return { ok: true, message: '' }
    }
  }
  return { target, writes, setConfig: (c: MouseConfig) => (config = c) }
}

const settings = (patch: Partial<typeof DEFAULT_SETTINGS.autoSwitch>) => ({ ...DEFAULT_SETTINGS.autoSwitch, ...patch })
const gaming = profile('gaming', 400)
const work = profile('work', 1600)
const rules = [{ id: 'r1', exe: 'game.exe', profileId: 'gaming' }]

describe('AutoSwitcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is off by default and never writes', async () => {
    const f = fakeTarget()
    const sw = new AutoSwitcher(f.target, DEFAULT_SETTINGS.autoSwitch, 100)
    sw.configure(DEFAULT_SETTINGS.autoSwitch, [gaming])
    sw.foregroundChanged('game.exe')
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.writes).toEqual([])
  })

  it('applies the matching profile after the dwell time', async () => {
    const f = fakeTarget()
    const sw = new AutoSwitcher(f.target, settings({ enabled: true, rules }), 100)
    sw.configure(settings({ enabled: true, rules }), [gaming, work])
    sw.foregroundChanged('game.exe')
    await vi.advanceTimersByTimeAsync(50)
    expect(f.writes).toEqual([])
    await vi.advanceTimersByTimeAsync(100)
    expect(f.writes).toEqual(['config:400'])
    expect(sw.getStatus()).toMatchObject({ activeProfileName: 'gaming', writesToday: 1 })
  })

  it('ignores quick alt-tabbing (no write until a program stays in front)', async () => {
    const f = fakeTarget()
    const s = settings({ enabled: true, rules, defaultProfileId: 'work' })
    const sw = new AutoSwitcher(f.target, s, 100)
    sw.configure(s, [gaming, work])
    sw.foregroundChanged('game.exe')
    await vi.advanceTimersByTimeAsync(50)
    sw.foregroundChanged('notepad.exe')
    await vi.advanceTimersByTimeAsync(50)
    sw.foregroundChanged('game.exe')
    await vi.advanceTimersByTimeAsync(150)
    expect(f.writes).toEqual(['config:400'])
  })

  it('does not write when the mouse already has the profile', async () => {
    const f = fakeTarget()
    f.setConfig({ ...gaming.config })
    const sw = new AutoSwitcher(f.target, settings({ enabled: true, rules }), 10)
    sw.configure(settings({ enabled: true, rules }), [gaming])
    sw.foregroundChanged('game.exe')
    await vi.advanceTimersByTimeAsync(50)
    expect(f.writes).toEqual([])
    expect(sw.getStatus().activeProfileName).toBe('gaming')
  })

  it('leaves the mouse alone for programs without a rule and no default', async () => {
    const f = fakeTarget()
    const sw = new AutoSwitcher(f.target, settings({ enabled: true, rules }), 10)
    sw.configure(settings({ enabled: true, rules }), [gaming])
    sw.foregroundChanged('chrome.exe')
    await vi.advanceTimersByTimeAsync(50)
    expect(f.writes).toEqual([])
  })

  it('keeps on-the-fly changes when switching between programs with the same profile', async () => {
    const f = fakeTarget()
    const s = settings({ enabled: true, rules: [...rules, { id: 'r2', exe: 'game2.exe', profileId: 'gaming' }] })
    const sw = new AutoSwitcher(f.target, s, 10)
    sw.configure(s, [gaming])
    sw.foregroundChanged('game.exe')
    await vi.advanceTimersByTimeAsync(50)
    f.setConfig({ ...gaming.config, activeDpiStage: 3 }) // user pressed the DPI button
    sw.foregroundChanged('game2.exe')
    await vi.advanceTimersByTimeAsync(50)
    expect(f.writes).toEqual(['config:400'])
  })

  it('pauses after the daily write limit', async () => {
    const f = fakeTarget()
    const s = settings({ enabled: true, rules, defaultProfileId: 'work' })
    const sw = new AutoSwitcher(f.target, s, 10, 3)
    sw.configure(s, [gaming, work])
    for (const exe of ['game.exe', 'notepad.exe', 'game.exe', 'notepad.exe', 'game.exe']) {
      sw.foregroundChanged(exe)
      await vi.advanceTimersByTimeAsync(50)
    }
    expect(f.writes).toHaveLength(3)
    expect(sw.getStatus().paused).toBe(true)
    expect(sw.getStatus().note).toContain('paused')
  })
})

describe('power keys', () => {
  it('maps F13–F24 to bindings and back', () => {
    const b = powerKeyBinding('F15')
    expect(b).toEqual({ type: 0x10, code1: 0, code2: 0x6a, code3: 0 })
    expect(powerKeyOf(b)).toBe('F15')
    expect(describeBinding(b)).toBe('Power key F15')
    expect(powerKeyOf({ ...b, code1: 0x01 })).toBeNull() // Ctrl+F15 is a normal combo
  })

  it('describes actions', () => {
    expect(describePowerAction({ kind: 'open', target: 'C:\\Apps\\Spotify.exe' })).toBe('Open Spotify.exe')
    expect(describePowerAction({ kind: 'url', url: 'https://github.com/' })).toBe('Open github.com')
    expect(describePowerAction({ kind: 'profile', profileId: 'x' }, () => 'Gaming')).toBe('Switch to profile “Gaming”')
  })

  it('validates settings', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([])
    const bad = { ...DEFAULT_SETTINGS, powerKeys: { ...DEFAULT_SETTINGS.powerKeys, F13: { kind: 'url', url: 'javascript:alert(1)' } } }
    expect(validateSettings(bad)).not.toEqual([])
    const badRule = { ...DEFAULT_SETTINGS, autoSwitch: { ...DEFAULT_SETTINGS.autoSwitch, rules: [{ id: '1', exe: '..\\x.exe', profileId: 'p' }] } }
    expect(validateSettings(badRule)).not.toEqual([])
  })
})
