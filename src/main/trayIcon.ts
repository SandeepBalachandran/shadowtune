// Draws the battery percentage as a tray icon (pixel font, no image files needed).

import { nativeImage, NativeImage } from 'electron'

// 3×5 pixel digits, one string per row.
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111']
}

type RGB = [number, number, number]

export function batteryColor(percent: number, charging: boolean): RGB {
  if (charging) return [47, 179, 107] // green
  if (percent <= 15) return [229, 56, 59] // red
  if (percent <= 35) return [224, 160, 32] // amber
  return [255, 90, 31] // brand orange
}

/** Renders `text` (digits) in white on a rounded square, as a BGRA bitmap of size×size. */
export function renderBadge(size: number, text: string, bg: RGB): Buffer {
  const px = Buffer.alloc(size * size * 4) // transparent
  const radius = Math.round(size / 5)
  const set = (x: number, y: number, [r, g, b]: RGB) => {
    const i = (y * size + x) * 4
    px[i] = b
    px[i + 1] = g
    px[i + 2] = r
    px[i + 3] = 255
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0)
      const dy = Math.max(radius - y, y - (size - 1 - radius), 0)
      if (dx * dx + dy * dy <= radius * radius) set(x, y, bg)
    }
  }
  // Largest whole-pixel scale that fits the text with a 1-px gap per digit.
  const chars = text.split('').filter((c) => DIGITS[c])
  const scale = Math.max(1, Math.min(Math.floor((size - 2) / (chars.length * 4 - 1)), Math.floor((size * 0.7) / 5)))
  const w = chars.length * 3 * scale + (chars.length - 1) * scale
  const h = 5 * scale
  const ox = Math.floor((size - w) / 2)
  const oy = Math.floor((size - h) / 2)
  chars.forEach((c, ci) => {
    DIGITS[c].forEach((row, ry) =>
      row.split('').forEach((bit, rx) => {
        if (bit !== '1') return
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) set(ox + ci * 4 * scale + rx * scale + sx, oy + ry * scale + sy, [255, 255, 255])
      })
    )
  })
  return px
}

export function batteryTrayIcon(percent: number, charging: boolean): NativeImage {
  const text = String(Math.max(0, Math.min(100, Math.round(percent))))
  const bg = batteryColor(percent, charging)
  const img = nativeImage.createFromBitmap(renderBadge(16, text, bg), { width: 16, height: 16, scaleFactor: 1 })
  for (const scale of [1.5, 2]) {
    const size = 16 * scale
    img.addRepresentation({ scaleFactor: scale, width: size, height: size, buffer: renderBadge(size, text, bg) })
  }
  return img
}
