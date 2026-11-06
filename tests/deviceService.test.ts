import { describe, expect, it } from 'vitest'
import { DeviceService } from '../src/main/device/deviceService'
import { MockBackend } from '../src/main/device/mockBackend'
import { DeviceBackend } from '../src/main/device/transport'
import { DEFAULT_CONFIG, DEFAULT_KEYS, KeyBinding } from '../src/shared/types'

const noHardware: DeviceBackend = {
  find: async () => null,
  open: async () => {
    throw new Error('no hardware in tests')
  }
}

async function connected(mock = new MockBackend(undefined, 2)) {
  const svc = new DeviceService(noHardware, mock, { replyTimeoutMs: 100 })
  await svc.setMockEnabled(true)
  return { svc, mock }
}

describe('DeviceService with the mock device', () => {
  it('stays searching when no device is present', async () => {
    const svc = new DeviceService(noHardware, new MockBackend(), { replyTimeoutMs: 50 })
    await svc.tick()
    expect(svc.getState().status).toBe('searching')
  })

  it('connects and reads firmware, battery, config and keys', async () => {
    const { svc, mock } = await connected()
    const s = svc.getState()
    expect(s.status).toBe('connected')
    expect(s.mouseResponding).toBe(true)
    expect(s.identity?.source).toBe('mock')
    expect(s.firmware?.version).toBe('2.1.3')
    expect(s.battery).toEqual({ percent: 87, charging: false })
    expect(s.config).toEqual(mock.state.config)
    expect(s.keys).toEqual(DEFAULT_KEYS)
  })

  it('writes config and verifies it by reading back', async () => {
    const { svc, mock } = await connected()
    const next = { ...svc.getState().config!, dpiStages: [400, 800, 1600, 3200, 6400, 8000], pollingRate: 3, lightMode: 1 }
    const r = await svc.applyConfig(next)
    expect(r.ok).toBe(true)
    expect(mock.state.config).toEqual(next)
    expect(svc.getState().config).toEqual(next)
  })

  it('rejects invalid config without sending anything', async () => {
    const { svc, mock } = await connected()
    const before = JSON.stringify(mock.state.config)
    const r = await svc.applyConfig({ ...svc.getState().config!, dpiStages: [100, 800, 1600, 3200, 6400, 8000] })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(mock.state.config)).toBe(before)
    expect(svc.getLog().some((e) => e.text.startsWith('f0 0f'))).toBe(false)
  })

  it('writes buttons while preserving the fixed slots', async () => {
    const { svc, mock } = await connected()
    const buttons: KeyBinding[] = DEFAULT_KEYS.slice(0, 5).map((k) => ({ ...k }))
    buttons[4] = { type: 0x30, code1: 0xcd, code2: 0, code3: 0 } // forward → play/pause
    const r = await svc.applyButtons(buttons)
    expect(r.ok).toBe(true)
    expect(mock.state.keys.slice(0, 5)).toEqual(buttons)
    expect(mock.state.keys.slice(5)).toEqual(DEFAULT_KEYS.slice(5))
  })

  it('refuses to disable the left button', async () => {
    const { svc } = await connected()
    const buttons = DEFAULT_KEYS.slice(0, 5).map((k) => ({ ...k }))
    buttons[0] = { type: 0x20, code1: 0, code2: 0, code3: 0 }
    expect((await svc.applyButtons(buttons)).ok).toBe(false)
  })

  it('restores factory defaults', async () => {
    const { svc, mock } = await connected()
    const r = await svc.restoreDefaults()
    expect(r.ok).toBe(true)
    expect(mock.state.config).toEqual(DEFAULT_CONFIG)
    expect(mock.state.keys).toEqual(DEFAULT_KEYS)
  })

  it('reports a sleeping mouse and recovers when it wakes', async () => {
    const mock = new MockBackend(undefined, 2)
    mock.state.awake = false
    const { svc } = await connected(mock)
    expect(svc.getState().status).toBe('connected')
    expect(svc.getState().mouseResponding).toBe(false)
    expect((await svc.applyConfig(DEFAULT_CONFIG)).ok).toBe(false)

    mock.state.awake = true
    await svc.tick()
    expect(svc.getState().mouseResponding).toBe(true)
  })

  it('follows DPI button presses on the mouse', async () => {
    const { svc, mock } = await connected()
    const before = svc.getState().config!.activeDpiStage
    mock.transport!.pressDpiButton()
    expect(svc.getState().config!.activeDpiStage).toBe((before + 1) % mock.state.config.dpiCount)
  })

  it('notices another program changing the mouse and follows its values', async () => {
    const { svc, mock } = await connected()
    const theirs = { ...svc.getState().config!, lightMode: 3 }
    mock.transport!.externalConfigWrite(theirs)
    expect(svc.getState().config).toEqual(theirs)
    expect(svc.getState().message).toContain('Another program')
    expect(svc.getLog().some((e) => e.kind === 'warn' && e.text.startsWith('Another program'))).toBe(true)
  })

  it('goes back to searching when the device is unplugged', async () => {
    const { svc, mock } = await connected()
    mock.present = false
    mock.transport!.unplug()
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.getState().status).toBe('searching')
    expect(svc.getState().config).toBeNull()
  })
})
