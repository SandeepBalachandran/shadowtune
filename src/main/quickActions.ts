// Mouse-changing quick actions shared by power keys, keyboard shortcuts and the tray menu.
// Each one is a single write (like clicking Apply). Writes are throttled: holding a hotkey
// auto-repeats many times a second, which must not turn into a stream of writes.

import { MouseConfig, OperationResult, QUICK_WRITE_INTERVAL_MS } from '../shared/types'

export interface QuickActionHost {
  getConfig(): MouseConfig | null
  applyConfig(c: MouseConfig): Promise<OperationResult>
  applyProfile(id: string): Promise<OperationResult>
}

const LIGHTS_OFF = 6

export class QuickActions {
  private lastWrite = Number.NEGATIVE_INFINITY
  private busy = false
  private lastLightMode = 0

  constructor(
    private readonly host: QuickActionHost,
    private readonly intervalMs = QUICK_WRITE_INTERVAL_MS,
    private readonly now: () => number = Date.now
  ) {}

  nextDpiStage(): Promise<OperationResult> {
    return this.write((c) => ({ ...c, activeDpiStage: (c.activeDpiStage + 1) % c.dpiCount }))
  }

  setDpiStage(stage: number): Promise<OperationResult> {
    return this.write((c) => (stage >= 0 && stage < c.dpiCount ? { ...c, activeDpiStage: stage } : null))
  }

  toggleLights(): Promise<OperationResult> {
    return this.write((c) => {
      if (c.lightMode !== LIGHTS_OFF) this.lastLightMode = c.lightMode
      return { ...c, lightMode: c.lightMode === LIGHTS_OFF ? this.lastLightMode : LIGHTS_OFF }
    })
  }

  applyProfile(id: string): Promise<OperationResult> {
    return this.guard(() => this.host.applyProfile(id))
  }

  private write(change: (c: MouseConfig) => MouseConfig | null): Promise<OperationResult> {
    return this.guard(async () => {
      const c = this.host.getConfig()
      if (!c) return { ok: false, message: 'Mouse not available.' }
      const next = change(c)
      if (!next) return { ok: false, message: 'Not possible with the current settings.' }
      return this.host.applyConfig(next)
    })
  }

  private async guard(fn: () => Promise<OperationResult>): Promise<OperationResult> {
    if (this.busy || this.now() - this.lastWrite < this.intervalMs) {
      return { ok: false, message: 'Ignored — too soon after the last change.' }
    }
    this.busy = true
    try {
      return await fn()
    } finally {
      this.busy = false
      this.lastWrite = this.now()
    }
  }
}
