// Runs only with HW=1 and a real mouse attached:  HW=1 npx vitest run tests/hardware.test.ts
// Applies a harmless change through the real DeviceService, checks it, then restores the original.
import { describe, expect, it } from 'vitest'
import { DeviceService } from '../src/main/device/deviceService'
import { MockBackend } from '../src/main/device/mockBackend'
import { NodeHidBackend } from '../src/main/device/nodeHidBackend'

describe.runIf(process.env.HW === '1')('real hardware', () => {
  it('applies and restores a config change through DeviceService', async () => {
    const svc = new DeviceService(new NodeHidBackend(), new MockBackend())
    svc.onLog((e) => console.log(e.kind.padEnd(5), e.text))
    await svc.tick()
    const s = svc.getState()
    console.log('state', s.status, 'responding', s.mouseResponding, s.message)
    expect(s.mouseResponding).toBe(true)

    const original = s.config!
    const changed = { ...original, lightMode: original.lightMode === 1 ? 2 : 1 }
    const r1 = await svc.applyConfig(changed)
    console.log('apply', r1)
    const r2 = await svc.applyConfig(original)
    console.log('restore', r2)
    await svc.stop()
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
  }, 30_000)
})
