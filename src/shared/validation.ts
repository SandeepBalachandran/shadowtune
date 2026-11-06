import {
  AppSettings,
  POWER_KEYS,
  PowerAction,
  WindowsPointerSettings,
  DEBOUNCE_LIMITS,
  DPI_LIMITS,
  KeyBinding,
  LIGHT_MODES,
  MouseConfig,
  POLLING_RATES,
  PROGRAMMABLE_BUTTONS,
  Profile,
  SLEEP_LIMITS
} from './types'

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const inRange = (v: unknown, min: number, max: number) => isInt(v) && v >= min && v <= max

/** Returns a list of human-readable problems; empty means the config is safe to send. */
export function validateConfig(c: unknown): string[] {
  const errors: string[] = []
  if (!c || typeof c !== 'object') return ['Configuration is missing.']
  const cfg = c as MouseConfig

  if (!inRange(cfg.lightMode, 0, LIGHT_MODES.length - 1)) errors.push('Light mode is out of range.')
  if (!inRange(cfg.pollingRate, 0, POLLING_RATES.length - 1)) errors.push('Polling rate is out of range.')
  if (!inRange(cfg.dpiCount, 1, DPI_LIMITS.maxStages)) errors.push(`DPI stage count must be 1–${DPI_LIMITS.maxStages}.`)
  if (!inRange(cfg.activeDpiStage, 0, Math.max(0, (cfg.dpiCount ?? 1) - 1))) errors.push('Active DPI stage must be one of the enabled stages.')

  if (!Array.isArray(cfg.dpiStages) || cfg.dpiStages.length !== 6) {
    errors.push('DPI stage list must contain 6 values.')
  } else {
    cfg.dpiStages.forEach((dpi, i) => {
      if (i < cfg.dpiCount) {
        if (!inRange(dpi, DPI_LIMITS.min, DPI_LIMITS.max)) {
          errors.push(`DPI stage ${i + 1} must be a whole number from ${DPI_LIMITS.min} to ${DPI_LIMITS.max}.`)
        }
      } else if (!inRange(dpi, 0, 0xffff)) {
        // Unused stages are written back exactly as read; they only need to fit in 16 bits.
        errors.push(`Unused DPI stage ${i + 1} is not a 16-bit value.`)
      }
    })
  }

  if (!inRange(cfg.scrollDirection, 0, 1)) errors.push('Scroll direction must be 0 or 1.')
  if (!inRange(cfg.liftOffDistance, 0, 2)) errors.push('Lift-off distance must be 0–2.')
  if (!inRange(cfg.sensorFlags, 0, 0xff)) errors.push('Sensor flags must be a byte.')
  if (!inRange(cfg.debounceMs, DEBOUNCE_LIMITS.min, DEBOUNCE_LIMITS.max)) errors.push(`Debounce must be ${DEBOUNCE_LIMITS.min}–${DEBOUNCE_LIMITS.max} ms.`)
  if (!inRange(cfg.sleepMinutes, SLEEP_LIMITS.min, SLEEP_LIMITS.max)) errors.push(`Sleep time must be ${SLEEP_LIMITS.min}–${SLEEP_LIMITS.max} minutes.`)
  if (!inRange(cfg.highspeedMode, 0, 0xff)) errors.push('High-speed mode must be a byte.')
  if (!inRange(cfg.wakeMode, 0, 0x0f)) errors.push('Wake mode must be 0–15.')
  if (!inRange(cfg.moveLightMode, 0, 0x0f)) errors.push('Move-light mode must be 0–15.')
  return errors
}

export function validateBinding(b: unknown): string[] {
  if (!b || typeof b !== 'object') return ['Binding is missing.']
  const k = b as KeyBinding
  const bad = (['type', 'code1', 'code2', 'code3'] as const).filter((f) => !inRange(k[f], 0, 0xff))
  return bad.length ? [`Binding fields must be bytes: ${bad.join(', ')}.`] : []
}

export function validateButtons(buttons: unknown): string[] {
  if (!Array.isArray(buttons) || buttons.length !== PROGRAMMABLE_BUTTONS) {
    return [`Exactly ${PROGRAMMABLE_BUTTONS} button bindings are required.`]
  }
  const errors = buttons.flatMap((b, i) => validateBinding(b).map((e) => `Button ${i + 1}: ${e}`))
  // Like the official app, the left button always stays a left click.
  const left = buttons[0] as KeyBinding
  if (!(left.type === 0x20 && left.code1 === 0x01)) errors.push('The left button must stay a left click.')
  return errors
}

export function validatePowerAction(a: unknown): string[] {
  if (!a || typeof a !== 'object') return ['Action is missing.']
  const act = a as PowerAction
  const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
  switch (act.kind) {
    case 'none':
    case 'cycleDpi':
    case 'toggleLights':
    case 'screenshot':
    case 'lock':
    case 'micMute':
      return []
    case 'open':
      return str(act.target, 1024) ? [] : ['Choose a program, file or folder to open.']
    case 'url':
      return typeof act.url === 'string' && /^https?:\/\/\S+$/i.test(act.url) ? [] : ['Website must start with http:// or https://.']
    case 'text':
      return str(act.text, 4000) ? [] : ['Text must be 1–4000 characters.']
    case 'profile':
      return str(act.profileId, 100) ? [] : ['Choose a profile.']
    default:
      return ['Unknown action.']
  }
}

export function validateSettings(s: unknown): string[] {
  if (!s || typeof s !== 'object') return ['Settings are missing.']
  const set = s as AppSettings
  const errors: string[] = []
  if (typeof set.launchAtStartup !== 'boolean') errors.push('launchAtStartup must be true/false.')
  const a = set.autoSwitch
  if (!a || typeof a.enabled !== 'boolean' || !Array.isArray(a.rules)) errors.push('Automatic switching settings are invalid.')
  else {
    if (a.rules.length > 100) errors.push('Too many app rules (max 100).')
    a.rules.forEach((r, i) => {
      if (!isExeName(r.exe)) errors.push(`Rule ${i + 1}: invalid program name.`)
      if (typeof r.profileId !== 'string' || !r.profileId) errors.push(`Rule ${i + 1}: choose a profile.`)
    })
    if (a.defaultProfileId !== null && typeof a.defaultProfileId !== 'string') errors.push('Default profile is invalid.')
  }
  if (!set.powerKeys || typeof set.powerKeys !== 'object') errors.push('Power keys are missing.')
  else POWER_KEYS.forEach((k) => validatePowerAction(set.powerKeys[k]).forEach((e) => errors.push(`${k}: ${e}`)))
  if (!Array.isArray(set.powerKeyOverrides) || set.powerKeyOverrides.length > 100) errors.push('Program-specific actions are invalid.')
  else
    set.powerKeyOverrides.forEach((o, i) => {
      if (!POWER_KEYS.includes(o.key)) errors.push(`Program action ${i + 1}: unknown key.`)
      if (!isExeName(o.exe)) errors.push(`Program action ${i + 1}: invalid program name.`)
      validatePowerAction(o.action).forEach((e) => errors.push(`Program action ${i + 1}: ${e}`))
    })
  if (!Array.isArray(set.hotkeys) || set.hotkeys.length > 30) errors.push('Keyboard shortcuts are invalid.')
  else {
    set.hotkeys.forEach((h, i) => {
      if (!isAccelerator(h.accelerator)) errors.push(`Shortcut ${i + 1}: use at least one of Ctrl/Alt/Shift/Win plus a key.`)
      validatePowerAction(h.action).forEach((e) => errors.push(`Shortcut ${i + 1}: ${e}`))
    })
    const seen = new Set<string>()
    set.hotkeys.forEach((h) => {
      if (seen.has(h.accelerator)) errors.push(`${h.accelerator} is used twice.`)
      seen.add(h.accelerator)
    })
  }
  for (const f of ['trayBatteryIcon', 'notifyFullyCharged', 'dpiPopup'] as const) {
    if (typeof set[f] !== 'boolean') errors.push(`${f} must be true/false.`)
  }
  if (set.profilesDir !== null && (typeof set.profilesDir !== 'string' || !set.profilesDir.trim() || set.profilesDir.length > 1024)) {
    errors.push('Profiles folder is invalid.')
  }
  return errors
}

const MODIFIER = '(?:Ctrl|Alt|Shift|Super)'
const KEY = "(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|Plus|-|=|,|\\.|/|;|'|\\[|\\]|\\\\|`)"
const ACCELERATOR = new RegExp(`^(?:${MODIFIER}\\+){1,4}${KEY}$`)

/** Modifier(s) + one key, in the form Electron's globalShortcut accepts (e.g. "Ctrl+Alt+D"). */
export function isAccelerator(v: unknown): v is string {
  if (typeof v !== 'string' || !ACCELERATOR.test(v)) return false
  const mods = v.split('+').slice(0, -1)
  return new Set(mods).size === mods.length
}

const isExeName = (v: unknown) => typeof v === 'string' && /^[^\\/:*?"<>|]{1,100}$/.test(v)

export function validateWindowsPointer(w: unknown): string[] {
  if (!w || typeof w !== 'object') return ['Windows pointer settings are missing.']
  const p = w as WindowsPointerSettings
  const errors: string[] = []
  if (!inRange(p.pointerSpeed, 1, 20)) errors.push('Pointer speed must be 1–20.')
  if (typeof p.enhancePrecision !== 'boolean') errors.push('Enhance pointer precision must be on or off.')
  if (!inRange(p.scrollLines, 1, 100)) errors.push('Scroll lines must be 1–100.')
  return errors
}

export function validateProfile(p: unknown): string[] {
  if (!p || typeof p !== 'object') return ['Profile is missing.']
  const prof = p as Profile
  const errors: string[] = []
  if (typeof prof.name !== 'string' || !prof.name.trim() || prof.name.length > 60) errors.push('Profile name must be 1–60 characters.')
  errors.push(...validateConfig(prof.config), ...validateButtons(prof.buttons))
  if (prof.windows !== undefined) errors.push(...validateWindowsPointer(prof.windows))
  return errors
}
