// PC-side app settings (startup, automatic switching, power keys) in settings.json.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AppSettings, DEFAULT_SETTINGS, POWER_KEYS } from '../shared/types'
import { validateSettings } from '../shared/validation'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export class SettingsStore {
  private readonly file: string
  private current: AppSettings = clone(DEFAULT_SETTINGS)

  constructor(dir: string) {
    this.file = path.join(dir, 'settings.json')
  }

  get(): AppSettings {
    return clone(this.current)
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<AppSettings>
      // Merge onto defaults so settings saved by older versions gain new fields.
      const merged: AppSettings = {
        ...clone(DEFAULT_SETTINGS),
        ...raw,
        autoSwitch: { ...DEFAULT_SETTINGS.autoSwitch, ...raw.autoSwitch },
        powerKeys: { ...clone(DEFAULT_SETTINGS.powerKeys), ...raw.powerKeys }
      }
      // Drop anything invalid rather than refusing to start.
      merged.powerKeyOverrides = (Array.isArray(raw.powerKeyOverrides) ? raw.powerKeyOverrides : []).filter(
        (o) => validateSettings({ ...clone(DEFAULT_SETTINGS), powerKeyOverrides: [o] }).length === 0
      )
      merged.hotkeys = (Array.isArray(raw.hotkeys) ? raw.hotkeys : []).filter(
        (h) => validateSettings({ ...clone(DEFAULT_SETTINGS), hotkeys: [h] }).length === 0
      )
      POWER_KEYS.forEach((k) => {
        if (validateSettings({ ...clone(DEFAULT_SETTINGS), powerKeys: { ...DEFAULT_SETTINGS.powerKeys, [k]: merged.powerKeys[k] } }).length) {
          merged.powerKeys[k] = { kind: 'none' }
        }
      })
      if (validateSettings(merged).length === 0) this.current = merged
    } catch {
      // first run or unreadable file → defaults
    }
    return this.get()
  }

  async save(next: AppSettings): Promise<AppSettings> {
    const errors = validateSettings(next)
    if (errors.length) throw new Error(errors.join(' '))
    this.current = clone(next)
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.current, null, 2), 'utf8')
    await fs.rename(tmp, this.file)
    return this.get()
  }
}
