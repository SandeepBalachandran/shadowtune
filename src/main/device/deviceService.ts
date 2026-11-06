// Owns the connection to the mouse. The UI never sends raw frames: it calls the typed,
// validated operations below over IPC. Every write is verified by reading the device back.

import { DEFAULT_CONFIG, DEFAULT_KEYS, DeviceState, KeyBinding, LogEntry, MouseConfig, OperationResult, PROGRAMMABLE_BUTTONS } from '../../shared/types'
import { validateButtons, validateConfig } from '../../shared/validation'
import {
  CMD,
  Frame,
  batteryRequest,
  configAckMatches,
  configRequest,
  configWrite,
  isReplyTo,
  keysRequest,
  keysWrite,
  parseBattery,
  parseConfig,
  parseEvent,
  parseKeys,
  parseVersion,
  toHex,
  versionRequest
} from './protocol'
import { DeviceBackend, HidTransport } from './transport'

export interface DeviceServiceOptions {
  pollMs: number
  batteryPollMs: number
  replyTimeoutMs: number
}

const DEFAULT_OPTIONS: DeviceServiceOptions = { pollMs: 2000, batteryPollMs: 60_000, replyTimeoutMs: 1000 }
const LOG_LIMIT = 500

type StateListener = (s: DeviceState) => void
type LogListener = (e: LogEntry) => void

interface Pending {
  cmd: number
  resolve: (f: Uint8Array | null) => void
}

const sameConfig = (a: MouseConfig, b: MouseConfig) => JSON.stringify(a) === JSON.stringify(b)
const sameKeys = (a: KeyBinding[], b: KeyBinding[]) => JSON.stringify(a) === JSON.stringify(b)

export class DeviceService {
  private state: DeviceState = {
    status: 'searching',
    identity: null,
    firmware: null,
    battery: null,
    config: null,
    keys: null,
    mouseResponding: false,
    busy: false,
    message: null,
    mockEnabled: false,
    lastUpdated: Date.now()
  }
  private log: LogEntry[] = []
  private stateListeners: StateListener[] = []
  private logListeners: LogListener[] = []
  private dpiListeners: ((config: MouseConfig) => void)[] = []
  private transport: HidTransport | null = null
  private pending: Pending | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private batteryTimer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  private readonly opts: DeviceServiceOptions

  constructor(
    private readonly hardware: DeviceBackend,
    private readonly mock: DeviceBackend,
    opts: Partial<DeviceServiceOptions> = {}
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts }
  }

  // ------------------------------------------------------------ public API

  getState = (): DeviceState => this.state
  getLog = (): LogEntry[] => [...this.log]

  onState(l: StateListener) {
    this.stateListeners.push(l)
  }

  onLog(l: LogListener) {
    this.logListeners.push(l)
  }

  /** Called when the DPI stage was changed on the mouse itself (its DPI button). */
  onDpiButton(l: (config: MouseConfig) => void) {
    this.dpiListeners.push(l)
  }

  /** Lets other parts of the app (power keys, auto-switch) write to the Diagnostics log. */
  note(kind: LogEntry['kind'], text: string) {
    this.addLog(kind, text)
  }

  start() {
    void this.tick()
    this.pollTimer = setInterval(() => void this.tick(), this.opts.pollMs)
    this.batteryTimer = setInterval(() => void this.pollBattery(), this.opts.batteryPollMs)
  }

  async stop() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.batteryTimer) clearInterval(this.batteryTimer)
    await this.disconnect('stopped')
  }

  async setMockEnabled(enabled: boolean): Promise<OperationResult> {
    if (enabled === this.state.mockEnabled) return { ok: true, message: 'No change.' }
    await this.disconnect(enabled ? 'switching to demo device' : 'leaving demo mode')
    this.patch({ mockEnabled: enabled, status: 'searching', message: null })
    this.addLog('info', enabled ? 'Demo device enabled — no hardware will be touched.' : 'Demo device disabled.')
    await this.tick()
    return { ok: true, message: enabled ? 'Demo device enabled.' : 'Demo device disabled.' }
  }

  async refresh(): Promise<OperationResult> {
    if (!this.transport) return { ok: false, message: 'No mouse connected.' }
    return this.withBusy(async () => {
      const ok = await this.readAll()
      return ok ? { ok: true, message: 'Settings read from mouse.' } : { ok: false, message: this.state.message ?? 'Mouse did not answer.' }
    })
  }

  async applyConfig(config: MouseConfig): Promise<OperationResult> {
    const errors = validateConfig(config)
    if (errors.length) return { ok: false, message: errors.join(' ') }
    const ready = this.ensureReady()
    if (ready) return ready

    return this.withBusy(async () => {
      const frame = configWrite(config)
      const ack = await this.request(frame, CMD.CONFIG_WRITE)
      if (!ack) return { ok: false, message: 'The mouse did not acknowledge the change. Nothing was confirmed — try again.' }
      if (!configAckMatches(frame, ack)) {
        this.addLog('warn', 'Config acknowledgement differs from the request.')
      }
      const readBack = await this.readConfig()
      if (!readBack) return { ok: false, message: 'Change sent, but the mouse did not answer the verification read.' }
      if (!sameConfig(readBack, config)) {
        this.addLog('warn', `Verification mismatch. Sent ${JSON.stringify(config)} got ${JSON.stringify(readBack)}`)
        return { ok: false, message: 'The mouse stored different values than requested. Check the Diagnostics tab.' }
      }
      return { ok: true, message: 'Saved to mouse and verified.' }
    })
  }

  async applyButtons(buttons: KeyBinding[]): Promise<OperationResult> {
    const errors = validateButtons(buttons)
    if (errors.length) return { ok: false, message: errors.join(' ') }
    const ready = this.ensureReady()
    if (ready) return ready

    return this.withBusy(async () => {
      const current = this.state.keys ?? DEFAULT_KEYS
      // Slots 6–8 (DPI button, wheel up/down) are not user-editable; keep what the mouse has.
      const fixed = current.slice(PROGRAMMABLE_BUTTONS).map((k, i) => {
        const fallback = DEFAULT_KEYS[PROGRAMMABLE_BUTTONS + i]
        return k.type === 0 || k.type === 0xff ? fallback : k
      })
      const all = [...buttons.map((b) => ({ ...b })), ...fixed]
      // The device may or may not echo key writes; the read-back below is what counts.
      await this.request(keysWrite(all), CMD.KEYS_WRITE)
      const readBack = await this.readKeys()
      if (!readBack) return { ok: false, message: 'Buttons sent, but the mouse did not answer the verification read.' }
      if (!sameKeys(readBack, all)) {
        this.addLog('warn', `Button verification mismatch. Sent ${JSON.stringify(all)} got ${JSON.stringify(readBack)}`)
        return { ok: false, message: 'The mouse stored different button assignments than requested.' }
      }
      return { ok: true, message: 'Buttons saved to mouse and verified.' }
    })
  }

  async restoreDefaults(): Promise<OperationResult> {
    const cfg = await this.applyConfig({ ...DEFAULT_CONFIG, dpiStages: [...DEFAULT_CONFIG.dpiStages] })
    if (!cfg.ok) return cfg
    const keys = await this.applyButtons(DEFAULT_KEYS.slice(0, PROGRAMMABLE_BUTTONS))
    if (!keys.ok) return keys
    return { ok: true, message: 'Factory settings restored and verified.' }
  }

  /** Polls for the device; connects when found, retries reads while the mouse is asleep. */
  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      const backend = this.backend()
      if (!this.transport) {
        const identity = await backend.find()
        if (!identity) {
          if (this.state.status !== 'searching') this.patch({ status: 'searching', message: null })
          return
        }
        this.patch({ status: 'connecting', identity, message: null })
        this.addLog('info', `Found ${identity.product} (VID ${hex4(identity.vendorId)} PID ${hex4(identity.productId)}, ${identity.mode}).`)
        this.transport = await backend.open(identity)
        this.transport.onFrame((f) => this.handleFrame(f))
        this.transport.onClose((reason) => void this.disconnect(reason))
        this.patch({ status: 'connected' })
        await this.withBusy(() => this.readAll())
      } else if (!this.state.mouseResponding && !this.state.busy) {
        await this.withBusy(() => this.readAll(true))
      } else if (!(await backend.find())) {
        await this.disconnect('device no longer present')
      }
    } catch (err) {
      this.addLog('error', `Connection error: ${(err as Error).message}`)
      await this.disconnect('error')
      this.patch({ status: 'error', message: friendlyOpenError(err as Error) })
    } finally {
      this.ticking = false
    }
  }

  // ------------------------------------------------------------ internals

  private backend(): DeviceBackend {
    return this.state.mockEnabled ? this.mock : this.hardware
  }

  private ensureReady(): OperationResult | null {
    if (!this.transport || this.state.status !== 'connected') return { ok: false, message: 'No mouse connected.' }
    if (!this.state.mouseResponding) return { ok: false, message: 'The mouse is not responding. Move or click it to wake it, then try again.' }
    if (this.state.busy) return { ok: false, message: 'Another operation is still running.' }
    return null
  }

  private async withBusy<T>(fn: () => Promise<T>): Promise<T> {
    this.patch({ busy: true })
    try {
      return await fn()
    } finally {
      this.patch({ busy: false })
    }
  }

  /** Reads version, battery, config and buttons. Returns false if the mouse is not answering. */
  private async readAll(quiet = false): Promise<boolean> {
    const versionFrame = await this.request(versionRequest(), CMD.VERSION, quiet)
    const firmware = versionFrame ? parseVersion(versionFrame) : this.state.firmware
    const batteryFrame = await this.request(batteryRequest(), CMD.BATTERY, quiet)
    const battery = batteryFrame ? parseBattery(batteryFrame) : null
    const config = await this.readConfig(quiet)
    const keys = config ? await this.readKeys(quiet) : null

    if (!config || !keys) {
      const wireless = this.state.identity?.mode === 'wireless'
      this.patch({
        firmware,
        mouseResponding: false,
        message: wireless
          ? 'Receiver found, but the mouse is not answering. Move or click the mouse to wake it.'
          : 'The mouse is connected but did not answer. Try unplugging and reconnecting it.'
      })
      if (!quiet) this.addLog('warn', 'Mouse did not answer the configuration read.')
      return false
    }
    this.patch({ firmware, battery: battery ?? this.state.battery, mouseResponding: true, message: null })
    return true
  }

  private async readConfig(quiet = false): Promise<MouseConfig | null> {
    const f = await this.request(configRequest(), CMD.CONFIG_READ, quiet)
    if (!f) return null
    const config = parseConfig(f)
    if (!config) {
      this.addLog('warn', 'Mouse reported an uninitialised configuration block.')
      return null
    }
    this.patch({ config })
    return config
  }

  private async readKeys(quiet = false): Promise<KeyBinding[] | null> {
    const f = await this.request(keysRequest(), CMD.KEYS_READ, quiet)
    if (!f) return null
    const keys = parseKeys(f)
    this.patch({ keys })
    return keys
  }

  private async pollBattery() {
    if (!this.transport || !this.state.mouseResponding || this.state.busy) return
    const f = await this.request(batteryRequest(), CMD.BATTERY, true)
    const battery = f ? parseBattery(f) : null
    if (battery) this.patch({ battery })
  }

  /** Sends one frame and waits for the reply that echoes its command. Requests are serialized. */
  private request(frame: Frame, cmd: number, quiet = false): Promise<Uint8Array | null> {
    const run = async (): Promise<Uint8Array | null> => {
      const transport = this.transport
      if (!transport) return null
      const reply = new Promise<Uint8Array | null>((resolve) => {
        const timer = setTimeout(() => {
          this.pending = null
          if (!quiet) this.addLog('warn', `No reply to command 0x${cmd.toString(16)} within ${this.opts.replyTimeoutMs} ms.`)
          resolve(null)
        }, this.opts.replyTimeoutMs)
        this.pending = {
          cmd,
          resolve: (f) => {
            clearTimeout(timer)
            this.pending = null
            resolve(f)
          }
        }
      })
      if (!quiet) this.addLog('tx', toHex(frame))
      try {
        await transport.write(frame)
      } catch (err) {
        this.pending?.resolve(null)
        this.addLog('error', `Write failed: ${(err as Error).message}`)
        return null
      }
      return reply
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }

  private handleFrame(f: Uint8Array) {
    if (this.pending && isReplyTo(f, this.pending.cmd)) {
      this.addLog('rx', toHex(f))
      this.pending.resolve(f)
      return
    }
    // Write echoes we didn't ask for mean another program (usually the official web configurator
    // in a browser tab) is changing the mouse. Follow its changes and warn: it keeps its own copy
    // of the settings and will overwrite ours.
    if (isReplyTo(f, CMD.CONFIG_WRITE) || isReplyTo(f, CMD.KEYS_WRITE)) {
      const config = isReplyTo(f, CMD.CONFIG_WRITE) ? parseConfig(f) : null
      const keys = isReplyTo(f, CMD.KEYS_WRITE) ? parseKeys(f) : null
      this.addLog('warn', `Another program changed the mouse's ${config ? 'settings' : 'buttons'}: ${toHex(f, 16)} …`)
      this.patch({
        ...(config ? { config } : {}),
        ...(keys ? { keys } : {}),
        message: OTHER_APP_WARNING
      })
      return
    }
    const event = parseEvent(f)
    if (!event) return
    this.addLog('rx', `${toHex(f, 12)} … (${event.kind} event)`)
    if (event.kind === 'battery') this.patch({ battery: event.battery })
    if (event.kind === 'status' && this.state.config) {
      const config = { ...this.state.config, activeDpiStage: event.activeDpiStage, pollingRate: event.pollingRate }
      this.patch({ config })
      this.dpiListeners.forEach((l) => l(config))
    }
  }

  private async disconnect(reason: string) {
    const t = this.transport
    if (!t) return
    this.transport = null
    this.pending?.resolve(null)
    await t.close()
    this.addLog('info', `Disconnected (${reason}).`)
    this.patch({
      status: 'searching',
      identity: null,
      firmware: null,
      battery: null,
      config: null,
      keys: null,
      mouseResponding: false,
      busy: false
    })
  }

  private patch(p: Partial<DeviceState>) {
    this.state = { ...this.state, ...p, lastUpdated: Date.now() }
    this.stateListeners.forEach((l) => l(this.state))
  }

  private addLog(kind: LogEntry['kind'], text: string) {
    const entry: LogEntry = { ts: Date.now(), kind, text }
    this.log.push(entry)
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT)
    this.logListeners.forEach((l) => l(entry))
  }
}

export const OTHER_APP_WARNING =
  'Another program is changing this mouse — probably the official web configurator in a browser tab. Close it, or it will overwrite the changes you make here.'

const hex4 = (n: number) => `0x${n.toString(16).padStart(4, '0').toUpperCase()}`

function friendlyOpenError(err: Error): string {
  const m = err.message.toLowerCase()
  if (m.includes('cannot open') || m.includes('access')) {
    return 'Windows refused access to the mouse. Close the browser tab running the official configurator and try again.'
  }
  return `Could not talk to the mouse: ${err.message}`
}
