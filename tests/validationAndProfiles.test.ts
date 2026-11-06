import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profiles'
import { describeBinding, keyboardBinding } from '../src/shared/keymap'
import { DEFAULT_CONFIG, DEFAULT_KEYS } from '../src/shared/types'
import { validateButtons, validateConfig } from '../src/shared/validation'

const buttons = () => DEFAULT_KEYS.slice(0, 5).map((k) => ({ ...k }))

describe('validation', () => {
  it('accepts factory defaults', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([])
    expect(validateButtons(buttons())).toEqual([])
  })

  it('accepts any whole DPI in range, like the official app', () => {
    expect(validateConfig({ ...DEFAULT_CONFIG, dpiStages: [1234, 1200, 1600, 3200, 6400, 8000] })).toEqual([])
  })

  it('keeps the left button as left click', () => {
    const b = buttons()
    b[0] = { type: 0x30, code1: 0xcd, code2: 0, code3: 0 }
    expect(validateButtons(b)).not.toEqual([])
  })

  it('rejects out-of-range values', () => {
    expect(validateConfig({ ...DEFAULT_CONFIG, dpiStages: [150, 1200, 1600, 3200, 6400, 8000] })).not.toEqual([])
    expect(validateConfig({ ...DEFAULT_CONFIG, dpiStages: [800.5, 1200, 1600, 3200, 6400, 8000] })).not.toEqual([])
    expect(validateConfig({ ...DEFAULT_CONFIG, pollingRate: 4 })).not.toEqual([])
    expect(validateConfig({ ...DEFAULT_CONFIG, sleepMinutes: 101 })).not.toEqual([])
    expect(validateConfig({ ...DEFAULT_CONFIG, activeDpiStage: 5 })).not.toEqual([])
    expect(validateConfig({ ...DEFAULT_CONFIG, debounceMs: 1.5 })).not.toEqual([])
  })

  it('lets unused DPI stages hold any 16-bit value', () => {
    expect(validateConfig({ ...DEFAULT_CONFIG, dpiCount: 2, activeDpiStage: 0, dpiStages: [800, 1600, 0, 12000, 50, 8000] })).toEqual([])
  })

  it('describes bindings', () => {
    expect(describeBinding(DEFAULT_KEYS[0])).toBe('Left click')
    expect(describeBinding(keyboardBinding(0x01 | 0x02, 0x04))).toBe('Ctrl+Shift+A')
    expect(describeBinding({ type: 0x70, code1: 2, code2: 0, code3: 0 })).toContain('Macro #3')
  })
})

describe('ProfileStore', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'evofox-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('saves, lists, updates and removes profiles', async () => {
    const store = new ProfileStore(dir)
    const p = await store.save('  FPS  ', DEFAULT_CONFIG, buttons())
    expect(p.name).toBe('FPS')
    expect(await store.list()).toHaveLength(1)

    await store.save('FPS low', { ...DEFAULT_CONFIG, lightMode: 6 }, buttons(), p.id)
    const [updated] = await store.list()
    expect(updated.name).toBe('FPS low')
    expect(updated.createdAt).toBe(p.createdAt)

    await store.remove(p.id)
    expect(await store.list()).toEqual([])
  })

  it('refuses invalid profiles and malformed imports', async () => {
    const store = new ProfileStore(dir)
    await expect(store.save('', DEFAULT_CONFIG, buttons())).rejects.toThrow()
    await expect(store.importFrom('not json')).rejects.toThrow('not valid JSON')
    await expect(store.importFrom(JSON.stringify({ name: 'x', config: { lightMode: 99 }, buttons: [] }))).rejects.toThrow('Not a valid')
  })

  it('round-trips an exported profile through import', async () => {
    const store = new ProfileStore(dir)
    const p = await store.save('Work', { ...DEFAULT_CONFIG, sleepMinutes: 30 }, buttons())
    const imported = await store.importFrom(JSON.stringify(p))
    expect(imported.id).not.toBe(p.id)
    expect(imported.config).toEqual(p.config)
    expect(await store.list()).toHaveLength(2)
  })
})
