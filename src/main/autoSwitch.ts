// Applies a profile automatically when a matching program comes to the front.
//
// Safeguards (the mouse stores settings in flash memory, which tolerates a limited number of writes):
//  - nothing is written if the mouse already has the profile's settings
//  - a program must stay in front for AUTO_SWITCH_LIMITS.dwellMs before switching
//  - at most AUTO_SWITCH_LIMITS.maxWritesPerDay automatic writes per day, then switching pauses

import { AUTO_SWITCH_LIMITS, AppSettings, KeyBinding, MouseConfig, OperationResult, PROGRAMMABLE_BUTTONS, Profile } from '../shared/types'

/** The parts of DeviceService the switcher needs (kept small for testing). */
export interface ProfileTarget {
  getState(): { status: string; mouseResponding: boolean; busy: boolean; config: MouseConfig | null; keys: KeyBinding[] | null }
  applyConfig(c: MouseConfig): Promise<OperationResult>
  applyButtons(b: KeyBinding[]): Promise<OperationResult>
  applyPcSettings?(p: Profile): void
}

export interface AutoSwitchStatus {
  activeProfileName: string | null
  writesToday: number
  paused: boolean
  note: string | null
}

const IGNORED = new Set(['shadowtune.exe', 'evofox control.exe', 'electron.exe', 'explorer.exe', 'searchhost.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe', 'lockapp.exe'])
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const today = () => new Date().toDateString()

export class AutoSwitcher {
  private settings: AppSettings['autoSwitch']
  private profiles: Profile[] = []
  private pendingExe: string | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private lastExe: string | null = null
  private wantedProfileId: string | null = null
  private appliedProfileId: string | null = null
  private writesDay = today()
  private status: AutoSwitchStatus = { activeProfileName: null, writesToday: 0, paused: false, note: null }
  private listeners: ((s: AutoSwitchStatus) => void)[] = []

  constructor(
    private readonly target: ProfileTarget,
    settings: AppSettings['autoSwitch'],
    private readonly dwellMs: number = AUTO_SWITCH_LIMITS.dwellMs,
    private readonly maxWrites: number = AUTO_SWITCH_LIMITS.maxWritesPerDay
  ) {
    this.settings = settings
  }

  getStatus = () => ({ ...this.status })

  onStatus(l: (s: AutoSwitchStatus) => void) {
    this.listeners.push(l)
  }

  configure(settings: AppSettings['autoSwitch'], profiles: Profile[]) {
    const wasEnabled = this.settings.enabled
    this.settings = settings
    this.profiles = profiles
    if (!settings.enabled) {
      this.cancelPending()
      this.patch({ activeProfileName: null, note: null, paused: false })
      return
    }
    // Turning it (back) on resumes after a pause and re-evaluates the current program.
    if (!wasEnabled || this.status.paused) {
      this.appliedProfileId = null
      this.patch({ paused: false, note: null, ...(this.status.paused ? { writesToday: 0 } : {}) })
    }
    if (this.lastExe) this.schedule(this.lastExe, 0)
  }

  /** Feed the name of the program that is now in front (lower-case exe name). */
  foregroundChanged(exe: string | null) {
    if (!exe || IGNORED.has(exe)) return
    this.lastExe = exe
    if (this.settings.enabled) this.schedule(exe, this.dwellMs)
  }

  /** Call when the mouse (re)connects so a pending profile is applied. */
  deviceReady() {
    this.appliedProfileId = null
    if (this.settings.enabled && this.lastExe) this.schedule(this.lastExe, 0)
  }

  private profileFor(exe: string): Profile | null | undefined {
    const rule = this.settings.rules.find((r) => r.exe.toLowerCase() === exe)
    const id = rule?.profileId ?? this.settings.defaultProfileId
    if (!id) return undefined // no rule and no default → leave the mouse alone
    return this.profiles.find((p) => p.id === id) ?? null
  }

  private schedule(exe: string, delay: number) {
    this.cancelPending()
    this.pendingExe = exe
    this.pendingTimer = setTimeout(() => void this.run(exe), delay)
  }

  private cancelPending() {
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = null
    this.pendingExe = null
  }

  private async run(exe: string) {
    if (this.pendingExe !== exe) return
    this.pendingExe = null
    const profile = this.profileFor(exe)
    if (profile === undefined) return
    if (profile === null) return this.patch({ note: `The profile for ${exe} no longer exists.` })
    // Same profile as last time → leave the mouse alone (keeps on-the-fly DPI button changes).
    if (profile.id === this.appliedProfileId) return
    this.wantedProfileId = profile.id
    // Windows pointer settings live on the PC — applying them never touches the mouse.
    if (profile.windows) this.target.applyPcSettings?.(profile)

    const s = this.target.getState()
    if (s.status !== 'connected' || !s.mouseResponding || !s.config || !s.keys) {
      return this.patch({ note: `Will apply “${profile.name}” when the mouse is available.` })
    }
    if (s.busy) return this.schedule(exe, 1000)

    const configDiffers = !same(s.config, profile.config)
    const buttonsDiffer = !same(s.keys.slice(0, PROGRAMMABLE_BUTTONS), profile.buttons)
    if (!configDiffers && !buttonsDiffer) {
      this.appliedProfileId = profile.id
      return this.patch({ activeProfileName: profile.name, note: null }) // already on the mouse: no write
    }

    this.rollDay()
    const writes = (configDiffers ? 1 : 0) + (buttonsDiffer ? 1 : 0)
    if (this.status.paused || this.status.writesToday + writes > this.maxWrites) {
      return this.patch({
        paused: true,
        note: `Automatic switching paused: ${this.maxWrites} automatic changes today (protects the mouse's memory). Turn it off and on to resume.`
      })
    }

    if (configDiffers) {
      const r = await this.target.applyConfig(profile.config)
      this.patch({ writesToday: this.status.writesToday + 1 })
      if (!r.ok) return this.patch({ note: `Couldn't apply “${profile.name}”: ${r.message}` })
    }
    if (buttonsDiffer) {
      const r = await this.target.applyButtons(profile.buttons)
      this.patch({ writesToday: this.status.writesToday + 1 })
      if (!r.ok) return this.patch({ note: `Couldn't apply “${profile.name}” buttons: ${r.message}` })
    }
    this.appliedProfileId = profile.id
    if (this.wantedProfileId === profile.id) this.patch({ activeProfileName: profile.name, note: null })
  }

  /** Forget which profile was applied (e.g. the user changed settings by hand), so the next switch re-checks. */
  reset() {
    this.appliedProfileId = null
  }

  private rollDay() {
    if (this.writesDay !== today()) {
      this.writesDay = today()
      this.patch({ writesToday: 0, paused: false })
    }
  }

  private patch(p: Partial<AutoSwitchStatus>) {
    this.status = { ...this.status, ...p }
    this.listeners.forEach((l) => l(this.getStatus()))
  }
}
