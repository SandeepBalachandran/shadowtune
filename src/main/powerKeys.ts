// System-wide triggers:
//  - power keys: a mouse button mapped to F13–F24 (keys no keyboard has)
//  - keyboard shortcuts: e.g. Ctrl+Alt+D
// Both run a PowerAction. Keys are registered only while something is assigned to them.

import { clipboard, globalShortcut, shell } from 'electron'
import { AppSettings, OperationResult, POWER_KEYS, PowerAction, PowerKey } from '../shared/types'
import { QuickActions } from './quickActions'
import { win32 } from './win32'

export interface PowerKeyHost {
  foregroundExe(): string | null
  quick: QuickActions
  notify(message: string): void
  log(message: string): void
}

export interface RegisterResult {
  powerKeyConflicts: PowerKey[]
  hotkeyConflicts: string[]
}

export class PowerKeys {
  private registered: string[] = []
  private running = false

  constructor(private readonly host: PowerKeyHost) {}

  /** (Re)registers power keys and keyboard shortcuts. Reports keys Windows refused. */
  apply(settings: Pick<AppSettings, 'powerKeys' | 'powerKeyOverrides' | 'hotkeys'>): RegisterResult {
    this.dispose()
    const result: RegisterResult = { powerKeyConflicts: [], hotkeyConflicts: [] }

    for (const key of POWER_KEYS) {
      const used = settings.powerKeys[key].kind !== 'none' || settings.powerKeyOverrides.some((o) => o.key === key && o.action.kind !== 'none')
      if (!used) continue
      const ok = globalShortcut.register(key, () => {
        // A program-specific action wins over the general one.
        const exe = this.host.foregroundExe()
        const override = exe ? settings.powerKeyOverrides.find((o) => o.key === key && o.exe === exe) : undefined
        void this.run(key, override?.action ?? settings.powerKeys[key], override ? exe : null)
      })
      if (ok) this.registered.push(key)
      else result.powerKeyConflicts.push(key)
    }

    for (const h of settings.hotkeys) {
      if (h.action.kind === 'none') continue
      let ok = false
      try {
        ok = globalShortcut.register(h.accelerator, () => void this.run(h.accelerator, h.action))
      } catch {
        ok = false
      }
      if (ok) this.registered.push(h.accelerator)
      else result.hotkeyConflicts.push(h.accelerator)
    }
    return result
  }

  dispose() {
    this.registered.forEach((k) => globalShortcut.unregister(k))
    this.registered = []
  }

  async run(trigger: string, action: PowerAction, inProgram: string | null = null): Promise<OperationResult> {
    if (this.running) return { ok: false, message: 'Previous action still running.' }
    this.running = true
    try {
      const r = await this.perform(action)
      // Throttled repeats (key held down) are expected — don't log or notify those.
      if (r.message.startsWith('Ignored')) return r
      this.host.log(`${trigger}${inProgram ? ` (in ${inProgram})` : ''}: ${r.ok ? 'ok' : 'failed'} — ${r.message}`)
      if (!r.ok) this.host.notify(`${trigger}: ${r.message}`)
      return r
    } catch (err) {
      const message = (err as Error).message
      this.host.log(`${trigger}: error — ${message}`)
      return { ok: false, message }
    } finally {
      this.running = false
    }
  }

  private async perform(a: PowerAction): Promise<OperationResult> {
    switch (a.kind) {
      case 'none':
        return { ok: true, message: 'Nothing assigned.' }
      case 'open': {
        const err = await shell.openPath(a.target)
        return err ? { ok: false, message: `Couldn't open ${a.target}: ${err}` } : { ok: true, message: `Opened ${a.target}` }
      }
      case 'url':
        await shell.openExternal(a.url)
        return { ok: true, message: `Opened ${a.url}` }
      case 'text':
        return this.typeText(a.text)
      case 'profile':
        return this.host.quick.applyProfile(a.profileId)
      case 'screenshot':
        await shell.openExternal('ms-screenclip:')
        return { ok: true, message: 'Screenshot tool opened.' }
      case 'lock': {
        const w = win32()
        if (!w) return { ok: false, message: 'Locking is only available on Windows.' }
        w.lockWorkStation()
        return { ok: true, message: 'PC locked.' }
      }
      case 'micMute': {
        const w = win32()
        if (!w) return { ok: false, message: 'Microphone control is only available on Windows.' }
        const muted = w.toggleMicMute()
        this.host.notify(muted ? 'Microphone muted' : 'Microphone on')
        return { ok: true, message: muted ? 'Microphone muted.' : 'Microphone unmuted.' }
      }
      case 'cycleDpi':
        return this.host.quick.nextDpiStage()
      case 'toggleLights':
        return this.host.quick.toggleLights()
    }
  }

  /** Pastes text via the clipboard, then restores what was on the clipboard before. */
  private async typeText(text: string): Promise<OperationResult> {
    const w = win32()
    if (!w) return { ok: false, message: 'Typing text is only available on Windows.' }
    // A keyboard shortcut's Ctrl/Alt/Shift may still be held — wait (max 1.5 s) so the paste
    // isn't turned into e.g. Ctrl+Alt+V.
    for (let waited = 0; w.modifiersDown() && waited < 1500; waited += 30) await new Promise((r) => setTimeout(r, 30))
    const previous = clipboard.readText()
    clipboard.writeText(text)
    await new Promise((r) => setTimeout(r, 80))
    w.pressCtrlV()
    setTimeout(() => clipboard.writeText(previous), 600)
    return { ok: true, message: 'Text typed.' }
  }
}
