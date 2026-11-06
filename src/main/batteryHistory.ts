// Battery history (read-only — never writes to the mouse). One sample every 10 minutes or
// whenever charging starts/stops, kept for 30 days in battery-history.json.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BatteryInfo, BatteryReport, BatterySample } from '../shared/types'

const SAMPLE_EVERY_MS = 10 * 60_000
const KEEP_MS = 30 * 24 * 3_600_000
/** Gaps longer than this (PC off, mouse asleep/unplugged) are not counted as drain time. */
const MAX_GAP_MS = 3 * 3_600_000
const HOUR = 3_600_000

/** Average drain (%/hour) over all unplugged stretches, or null without enough data. */
export function estimateDrain(samples: BatterySample[]): number | null {
  let drop = 0
  let ms = 0
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    const gap = b.ts - a.ts
    if (a.charging || b.charging || gap <= 0 || gap > MAX_GAP_MS || b.percent > a.percent) continue
    drop += a.percent - b.percent
    ms += gap
  }
  // Need at least 2 hours of unplugged use and a visible drop to say anything sensible.
  if (ms < 2 * HOUR || drop < 2) return null
  return drop / (ms / HOUR)
}

export function buildReport(samples: BatterySample[], current: BatteryInfo | null, now = Date.now()): BatteryReport {
  const recent = samples.filter((s) => s.ts >= now - 7 * 24 * HOUR)
  const drainPerHour = estimateDrain(samples)
  const hoursLeft = current && !current.charging && drainPerHour ? current.percent / drainPerHour : null
  return { samples: recent, drainPerHour, hoursLeft }
}

export class BatteryHistory {
  private samples: BatterySample[] = []
  private readonly file: string
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(dir: string) {
    this.file = path.join(dir, 'battery-history.json')
  }

  async load() {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'))
      if (Array.isArray(raw)) {
        this.samples = raw.filter(
          (s): s is BatterySample => typeof s?.ts === 'number' && typeof s?.percent === 'number' && typeof s?.charging === 'boolean'
        )
      }
    } catch {
      // no history yet
    }
  }

  record(b: BatteryInfo, now = Date.now()) {
    const last = this.samples[this.samples.length - 1]
    const due = !last || now - last.ts >= SAMPLE_EVERY_MS || last.charging !== b.charging
    if (!due) return
    this.samples.push({ ts: now, percent: b.percent, charging: b.charging })
    this.samples = this.samples.filter((s) => s.ts >= now - KEEP_MS)
    this.scheduleSave()
  }

  report(current: BatteryInfo | null): BatteryReport {
    return buildReport(this.samples, current)
  }

  private scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void fs.writeFile(this.file, JSON.stringify(this.samples), 'utf8').catch(() => undefined)
    }, 5000)
  }
}
