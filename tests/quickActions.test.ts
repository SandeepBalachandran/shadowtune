import { describe, expect, it } from 'vitest'
import { QuickActions } from '../src/main/quickActions'
import { DEFAULT_CONFIG, DEFAULT_SETTINGS, MouseConfig } from '../src/shared/types'
import { isAccelerator, validateSettings } from '../src/shared/validation'

function setup() {
  let config: MouseConfig = { ...DEFAULT_CONFIG, activeDpiStage: 0, lightMode: 2 }
  let clock = 0
  const writes: MouseConfig[] = []
  const quick = new QuickActions(
    {
      getConfig: () => config,
      applyConfig: async (c) => {
        writes.push(c)
        config = c
        return { ok: true, message: 'ok' }
      },
      applyProfile: async () => ({ ok: true, message: 'ok' })
    },
    400,
    () => clock
  )
  return { quick, writes, tick: (ms: number) => (clock += ms), config: () => config }
}

describe('QuickActions', () => {
  it('cycles DPI stages and wraps around', async () => {
    const t = setup()
    for (let i = 0; i < 5; i++) {
      await t.quick.nextDpiStage()
      t.tick(500)
    }
    expect(t.writes.map((w) => w.activeDpiStage)).toEqual([1, 2, 3, 4, 0])
  })

  it('throttles repeats from a held key to one write per 400 ms', async () => {
    const t = setup()
    const results = []
    for (let i = 0; i < 10; i++) {
      results.push(await t.quick.nextDpiStage())
      t.tick(30) // key auto-repeat
    }
    expect(t.writes).toHaveLength(1)
    expect(results.filter((r) => r.message.startsWith('Ignored'))).toHaveLength(9)
  })

  it('toggles lights off and back to the previous effect', async () => {
    const t = setup()
    await t.quick.toggleLights()
    expect(t.config().lightMode).toBe(6)
    t.tick(500)
    await t.quick.toggleLights()
    expect(t.config().lightMode).toBe(2)
  })

  it('rejects a DPI stage that is not enabled', async () => {
    const t = setup()
    expect((await t.quick.setDpiStage(7)).ok).toBe(false)
    expect(t.writes).toHaveLength(0)
  })
})

describe('keyboard shortcuts', () => {
  it('accepts modifier + key combinations only', () => {
    expect(isAccelerator('Ctrl+Alt+D')).toBe(true)
    expect(isAccelerator('Super+Shift+F5')).toBe(true)
    expect(isAccelerator('Ctrl+/')).toBe(true)
    expect(isAccelerator('D')).toBe(false) // no modifier
    expect(isAccelerator('Ctrl+Ctrl+D')).toBe(false)
    expect(isAccelerator('Ctrl+F13')).toBe(false) // F13–F24 are power keys
  })

  it('rejects duplicate shortcuts', () => {
    const h = (id: string) => ({ id, accelerator: 'Ctrl+Alt+D', action: { kind: 'cycleDpi' as const } })
    expect(validateSettings({ ...DEFAULT_SETTINGS, hotkeys: [h('1')] })).toEqual([])
    expect(validateSettings({ ...DEFAULT_SETTINGS, hotkeys: [h('1'), h('2')] })).not.toEqual([])
  })
})
