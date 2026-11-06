import * as HID from 'node-hid'
import { DeviceIdentity } from '../../shared/types'
import { Frame, VENDOR_IDS, VENDOR_USAGE, VENDOR_USAGE_PAGE } from './protocol'
import { DeviceBackend, HidTransport } from './transport'

interface FoundDevice extends DeviceIdentity {
  path: string
}

function toIdentity(d: HID.Device): FoundDevice | null {
  if (!d.path) return null
  if (d.vendorId !== VENDOR_IDS.WIRED && d.vendorId !== VENDOR_IDS.RECEIVER) return null
  if (d.usagePage !== VENDOR_USAGE_PAGE || d.usage !== VENDOR_USAGE) return null
  return {
    vendorId: d.vendorId,
    productId: d.productId,
    product: d.product ?? 'EvoFox mouse',
    mode: d.vendorId === VENDOR_IDS.WIRED ? 'wired' : 'wireless',
    source: 'hardware',
    path: d.path
  }
}

class NodeHidTransport implements HidTransport {
  private closeListeners: ((reason: string) => void)[] = []
  private closed = false

  constructor(
    readonly identity: DeviceIdentity,
    private readonly device: HID.HIDAsync
  ) {
    device.on('error', (err: Error) => this.finish(err?.message ?? 'device error'))
  }

  async write(frame: Frame): Promise<void> {
    if (this.closed) throw new Error('Device is closed')
    await this.device.write(frame)
  }

  onFrame(listener: (frame: Uint8Array) => void): void {
    this.device.on('data', (data: Buffer) => listener(new Uint8Array(data)))
  }

  onClose(listener: (reason: string) => void): void {
    this.closeListeners.push(listener)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      await this.device.close()
    } catch {
      // already gone
    }
  }

  private finish(reason: string) {
    if (this.closed) return
    void this.close()
    this.closeListeners.forEach((l) => l(reason))
  }
}

export class NodeHidBackend implements DeviceBackend {
  async find(): Promise<FoundDevice | null> {
    const devices = await HID.devicesAsync()
    const found = devices.map(toIdentity).filter((d): d is FoundDevice => d !== null)
    // Prefer the wired connection when both cable and receiver are attached.
    return found.find((d) => d.mode === 'wired') ?? found[0] ?? null
  }

  async open(identity: DeviceIdentity): Promise<HidTransport> {
    const path = (identity as FoundDevice).path
    if (!path) throw new Error('Device path unknown')
    const device = await HID.HIDAsync.open(path)
    return new NodeHidTransport(identity, device)
  }
}
