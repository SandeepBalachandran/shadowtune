// Simulated Shadow X Pro. Answers the same frames as the real device so the UI and the
// device service can be developed and tested without hardware. Initial state mirrors a
// real unit captured on 2026-10-19.

import { DEFAULT_KEYS, DeviceIdentity, KeyBinding, MouseConfig } from '../../shared/types'
import { CMD, Frame, FRAME_LENGTH, REPORT_ID, VENDOR_IDS, configWrite, keysWrite, parseConfig, parseKeys } from './protocol'
import { DeviceBackend, HidTransport } from './transport'

const MOCK_IDENTITY: DeviceIdentity = {
  vendorId: VENDOR_IDS.RECEIVER,
  productId: 0x2255,
  product: 'USB Receiver (demo)',
  mode: 'wireless',
  source: 'mock'
}

export interface MockDeviceState {
  config: MouseConfig
  keys: KeyBinding[]
  battery: number
  charging: boolean
  /** When false the mouse "sleeps": the receiver stays enumerated but stops answering. */
  awake: boolean
}

export function initialMockState(): MockDeviceState {
  return {
    config: {
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
    },
    keys: DEFAULT_KEYS.map((k) => ({ ...k })),
    battery: 87,
    charging: false,
    awake: true
  }
}

class MockTransport implements HidTransport {
  private frameListeners: ((f: Uint8Array) => void)[] = []
  private closeListeners: ((reason: string) => void)[] = []
  private closed = false

  constructor(
    readonly identity: DeviceIdentity,
    private readonly state: MockDeviceState,
    private readonly latencyMs: number
  ) {}

  async write(frame: Frame): Promise<void> {
    if (this.closed) throw new Error('Device is closed')
    if (frame[0] !== REPORT_ID || !this.state.awake) return
    const reply = this.handle(frame)
    if (reply) setTimeout(() => this.emit(reply), this.latencyMs)
  }

  onFrame(listener: (f: Uint8Array) => void): void {
    this.frameListeners.push(listener)
  }

  onClose(listener: (reason: string) => void): void {
    this.closeListeners.push(listener)
  }

  async close(): Promise<void> {
    this.closed = true
  }

  /** Test helper: simulate the user pressing the DPI button on the mouse. */
  pressDpiButton() {
    const c = this.state.config
    c.activeDpiStage = (c.activeDpiStage + 1) % c.dpiCount
    const f = new Uint8Array(FRAME_LENGTH)
    f[0] = REPORT_ID
    f[1] = CMD.STATUS_EVENT
    f[9] = c.activeDpiStage + 1
    f[10] = c.pollingRate + 1
    this.emit(f)
  }

  /** Test helper: simulate another program (e.g. the web configurator) writing a config. */
  externalConfigWrite(config: MouseConfig) {
    this.state.config = config
    const echo = configWrite(config)
    echo[3] = 0x86
    this.emit(echo)
  }

  unplug() {
    this.closed = true
    this.closeListeners.forEach((l) => l('unplugged'))
  }

  private emit(f: Uint8Array | number[]) {
    if (this.closed) return
    const data = f instanceof Uint8Array ? f : Uint8Array.from(f)
    this.frameListeners.forEach((l) => l(data))
  }

  private handle(req: Frame): number[] | null {
    const s = this.state
    switch (req[1]) {
      case CMD.VERSION: {
        const r = new Array<number>(FRAME_LENGTH).fill(0)
        const text = 'YJX.co.dongl'
        r[0] = REPORT_ID
        r[1] = CMD.VERSION
        r[3] = 0x16
        r[4] = 0x38
        ;[...text].forEach((ch, i) => (r[8 + i] = ch.charCodeAt(0)))
        ;[...'213Mar 20 202615:00:17'].forEach((ch, i) => (r[23 + i] = ch.charCodeAt(0)))
        return r
      }
      case CMD.BATTERY: {
        const r = [...req]
        r[3] = 0x95
        r[8] = s.battery
        r[9] = s.charging ? 1 : 0
        return r
      }
      case CMD.CONFIG_READ: {
        const r = configWrite(s.config)
        ;[r[1], r[2], r[3], r[4]] = [CMD.CONFIG_READ, 0xa5, 0x74, 0x2e]
        return r
      }
      case CMD.CONFIG_WRITE: {
        const parsed = parseConfig(req)
        if (parsed) s.config = parsed
        const ack = [...req]
        ack[3] = 0x86
        return ack
      }
      case CMD.KEYS_READ: {
        const r = keysWrite(s.keys)
        ;[r[1], r[3], r[4]] = [CMD.KEYS_READ, 0x07, 0x20]
        return r
      }
      case CMD.KEYS_WRITE: {
        s.keys = parseKeys(req)
        return [...req]
      }
      default:
        return null
    }
  }
}

export class MockBackend implements DeviceBackend {
  readonly state: MockDeviceState
  transport: MockTransport | null = null
  present = true

  constructor(
    state: MockDeviceState = initialMockState(),
    private readonly latencyMs = 20
  ) {
    this.state = state
  }

  async find(): Promise<DeviceIdentity | null> {
    return this.present ? MOCK_IDENTITY : null
  }

  async open(identity: DeviceIdentity): Promise<HidTransport> {
    this.transport = new MockTransport(identity, this.state, this.latencyMs)
    return this.transport
  }
}
