import { DeviceIdentity } from '../../shared/types'
import { Frame } from './protocol'

/** An open channel to the mouse's vendor HID collection. Replaceable for tests and other OS backends. */
export interface HidTransport {
  readonly identity: DeviceIdentity
  write(frame: Frame): Promise<void>
  /** Called for every input report, with the report ID at index 0. */
  onFrame(listener: (frame: Uint8Array) => void): void
  /** Called once when the device is unplugged or the handle fails. */
  onClose(listener: (reason: string) => void): void
  close(): Promise<void>
}

export interface DeviceBackend {
  /** Returns the identity of an attached supported mouse, or null. Must not open the device. */
  find(): Promise<DeviceIdentity | null>
  open(identity: DeviceIdentity): Promise<HidTransport>
}
