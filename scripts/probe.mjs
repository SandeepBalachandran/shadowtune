// Read-only diagnostic: lists the mouse's HID interfaces and prints version, battery, config and
// button map. Sends only the same read commands the official configurator sends on connect.
// Usage: npm run probe
import HID from 'node-hid'

const hex = (a, n = 64) => Array.from(a).slice(0, n).map((b) => b.toString(16).padStart(2, '0')).join(' ')
const ours = HID.devices().filter((d) => d.vendorId === 0xa8a4 || d.vendorId === 0xa8a5)

if (!ours.length) {
  console.log('No EvoFox Shadow X Pro receiver or cable found.')
  process.exit(1)
}
for (const d of ours) {
  console.log(`VID ${d.vendorId.toString(16)} PID ${d.productId.toString(16)} "${d.product}" iface ${d.interface} usage ${d.usagePage?.toString(16)}:${d.usage?.toString(16)}`)
}

const info = ours.find((d) => d.usagePage === 0xff01 && d.usage === 0x10)
if (!info) {
  console.log('Vendor configuration interface (FF01:10) not found.')
  process.exit(1)
}

const dev = new HID.HID(info.path)
const request = (bytes) => {
  while (dev.readTimeout(30).length) {} // drop stale frames
  const buf = new Array(64).fill(0)
  bytes.forEach((b, i) => (buf[i] = b))
  dev.write(buf)
  const start = Date.now()
  while (Date.now() - start < 800) {
    const r = dev.readTimeout(100)
    if (r.length && r[0] === 0xf0 && r[1] === bytes[1]) return r
  }
  return null
}

const reads = {
  version: [0xf0, 0x03],
  battery: [0xf0, 0x30, 0xa5, 0x0b, 0x2e, 1, 1, 1],
  config: [0xf0, 0x0e, 0xa5, 0x0b, 0x2e, 1, 1, 1],
  buttons: [0xf0, 0x08, 0xa5, 0x0b, 0x2c, 0, 0, 0]
}
for (const [name, bytes] of Object.entries(reads)) {
  const r = request(bytes)
  console.log(`\n${name}:`, r ? hex(r) : 'no reply (mouse asleep or off?)')
}
dev.close()
