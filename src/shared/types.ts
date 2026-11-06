// Types shared by the main process (device service) and the renderer (UI).
// Field meanings and byte offsets are documented in docs/PROTOCOL.md.

export type ConnectionMode = 'wired' | 'wireless'
export type DeviceSource = 'hardware' | 'mock'

export interface DeviceIdentity {
  vendorId: number
  productId: number
  product: string
  mode: ConnectionMode
  source: DeviceSource
}

export interface FirmwareInfo {
  /** e.g. "2.1.3" — parsed exactly like the official configurator does. */
  version: string
  /** ASCII banner reported by the device, e.g. "YJX.co.dongl". */
  banner: string
  /** Build timestamp string reported by the device, e.g. "Mar 20 2026 15:00:17". */
  build: string
}

export interface BatteryInfo {
  percent: number
  charging: boolean
}

export interface MouseConfig {
  /** Lighting effect 0–6 (see LIGHT_MODES). */
  lightMode: number
  /** Index into POLLING_RATES (0 = 125 Hz … 3 = 1000 Hz). */
  pollingRate: number
  /** Number of enabled DPI stages. */
  dpiCount: number
  /** Zero-based active DPI stage. */
  activeDpiStage: number
  /** Always 6 values; stages beyond dpiCount are preserved untouched. */
  dpiStages: number[]
  /** 0 = normal, 1 = reversed. */
  scrollDirection: number
  /** Lift-off distance raw value (official UI: 1 = 1 mm, 2 = 2 mm). */
  liftOffDistance: number
  /** Sensor feature bit field (see SENSOR_FLAGS). */
  sensorFlags: number
  /** Key debounce in milliseconds (0–20). */
  debounceMs: number
  /** Idle minutes before sleep in 2.4 GHz / Bluetooth mode, 0 = never. */
  sleepMinutes: number
  /** Raw "high speed" byte; bit 0 = eSports mode. */
  highspeedMode: number
  /** 0 = wake on click, 1 = wake on move (high nibble of byte 54). */
  wakeMode: number
  /** 0 = keep lighting on while moving, 1 = turn lighting off while moving (low nibble). */
  moveLightMode: number
}

/** One button slot: action type + three code bytes, exactly as stored on the device. */
export interface KeyBinding {
  type: number
  code1: number
  code2: number
  code3: number
}

/** All 8 slots on the device: 5 programmable buttons + 3 fixed (DPI, wheel up, wheel down). */
export const PROGRAMMABLE_BUTTONS = 5
export const TOTAL_KEY_SLOTS = 8

export type DeviceStatus = 'searching' | 'connecting' | 'connected' | 'error'

export interface DeviceState {
  status: DeviceStatus
  identity: DeviceIdentity | null
  firmware: FirmwareInfo | null
  battery: BatteryInfo | null
  config: MouseConfig | null
  keys: KeyBinding[] | null
  /** False when the receiver is present but the mouse does not answer (asleep/off). */
  mouseResponding: boolean
  busy: boolean
  message: string | null
  mockEnabled: boolean
  lastUpdated: number
}

export interface LogEntry {
  ts: number
  kind: 'tx' | 'rx' | 'info' | 'warn' | 'error'
  text: string
}

export interface OperationResult {
  ok: boolean
  message: string
}

export interface Profile {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  config: MouseConfig
  /** The 5 programmable buttons only. */
  buttons: KeyBinding[]
  /** Optional Windows pointer settings applied together with the profile. */
  windows?: WindowsPointerSettings
}

// ---------------------------------------------------------------- app (PC-side) settings

/** F13–F24 exist on no keyboard, so a mouse button mapped to one can trigger app actions. */
export const POWER_KEYS = ['F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24'] as const
export type PowerKey = (typeof POWER_KEYS)[number]
/** HID keyboard usage for F13 (F14 = +1 … F24 = +11). */
export const F13_USAGE = 0x68

export type PowerAction =
  | { kind: 'none' }
  | { kind: 'open'; target: string } // program, file or folder
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string } // pasted into the active window
  | { kind: 'profile'; profileId: string }
  | { kind: 'cycleDpi' }
  | { kind: 'toggleLights' }
  | { kind: 'screenshot' }
  | { kind: 'lock' }
  | { kind: 'micMute' }

/** A power key that does something different while a specific program is in front. */
export interface PowerKeyOverride {
  id: string
  key: PowerKey
  /** Executable name, lower-case, e.g. "chrome.exe". */
  exe: string
  action: PowerAction
}

/** A system-wide keyboard shortcut, e.g. "Ctrl+Alt+D" → next DPI stage. */
export interface Hotkey {
  id: string
  /** Electron accelerator: modifiers + key, e.g. "Ctrl+Alt+D". */
  accelerator: string
  action: PowerAction
}

/** Mouse-changing quick actions (hotkeys, tray, power keys) are throttled to one per this many ms. */
export const QUICK_WRITE_INTERVAL_MS = 400

/** Windows' own pointer settings (Control Panel → Mouse), stored in profiles. */
export interface WindowsPointerSettings {
  /** 1–20, Windows default 10. */
  pointerSpeed: number
  /** "Enhance pointer precision" (mouse acceleration). */
  enhancePrecision: boolean
  /** Lines per wheel notch, 1–100 (Windows default 3). */
  scrollLines: number
}

export interface BatterySample {
  ts: number
  percent: number
  charging: boolean
}

export interface BatteryReport {
  samples: BatterySample[]
  /** Average drain while unplugged, % per hour; null until there is enough history. */
  drainPerHour: number | null
  /** Estimated hours left on battery; null if unknown or charging. */
  hoursLeft: number | null
}

export interface AppRule {
  id: string
  /** Executable name, lower-case, e.g. "chrome.exe". */
  exe: string
  profileId: string
}

export interface AppSettings {
  version: 1
  launchAtStartup: boolean
  autoSwitch: {
    enabled: boolean
    rules: AppRule[]
    /** Profile for apps without a rule; null = leave the mouse as it is. */
    defaultProfileId: string | null
  }
  powerKeys: Record<PowerKey, PowerAction>
  powerKeyOverrides: PowerKeyOverride[]
  hotkeys: Hotkey[]
  /** Draw the battery percentage on the tray icon. */
  trayBatteryIcon: boolean
  /** Notify when the mouse is fully charged. */
  notifyFullyCharged: boolean
  /** Show "DPI 1600" near the cursor when the mouse's DPI button is pressed. */
  dpiPopup: boolean
  /** Folder for profiles.json (e.g. inside OneDrive); null = the app's own data folder. */
  profilesDir: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  launchAtStartup: false,
  autoSwitch: { enabled: false, rules: [], defaultProfileId: null },
  powerKeys: Object.fromEntries(POWER_KEYS.map((k) => [k, { kind: 'none' }])) as Record<PowerKey, PowerAction>,
  powerKeyOverrides: [],
  hotkeys: [],
  trayBatteryIcon: true,
  notifyFullyCharged: true,
  dpiPopup: true,
  profilesDir: null
}

/** Safeguards against wearing out the mouse's memory with automatic writes. */
export const AUTO_SWITCH_LIMITS = { dwellMs: 3000, maxWritesPerDay: 200 } as const

export interface AppRuntimeState {
  settings: AppSettings
  isPackaged: boolean
  foregroundExe: string | null
  /** Recently focused apps, most recent first — offered when adding a rule. */
  recentApps: string[]
  autoSwitch: {
    activeProfileName: string | null
    /** Automatic writes sent to the mouse today. */
    writesToday: number
    paused: boolean
    note: string | null
  }
  /** Power keys Windows refused to register (another app already uses them). */
  powerKeyConflicts: PowerKey[]
  /** Hotkey accelerators Windows refused to register. */
  hotkeyConflicts: string[]
  /** Current Windows pointer settings, or null where unavailable. */
  windowsPointer: WindowsPointerSettings | null
  /** Folder that actually holds profiles.json. */
  profilesPath: string
}

export const POLLING_RATES = [125, 250, 500, 1000] as const

export const LIGHT_MODES = [
  { value: 0, label: 'Wave' },
  { value: 1, label: 'Neon' },
  { value: 2, label: 'Touring flash' },
  { value: 3, label: 'Yo-yo ball' },
  { value: 4, label: 'Unidirectional flashing' },
  { value: 5, label: 'Circular breathing' },
  { value: 6, label: 'Off (no lighting)' }
] as const

// The official configurator's Shadow X Pro panel defines only bit 0x10, as "line correction".
// (Bits 0x01/0x20 are ripple control / motion sync on other models and are left untouched.)
export const SENSOR_FLAGS = [{ bit: 0x10, label: 'Angle snapping', tip: 'Straightens near-linear movement ("line correction").' }] as const

// The official app accepts any whole number in range; the slider just moves in steps of 50.
export const DPI_LIMITS = { min: 200, max: 6400, sliderStep: 50, maxStages: 5 } as const
export const DEBOUNCE_LIMITS = { min: 0, max: 20 } as const
export const SLEEP_LIMITS = { min: 0, max: 100 } as const

/** Factory defaults for the Shadow X Pro ("P6") as published in the official configurator. */
export const DEFAULT_CONFIG: MouseConfig = {
  lightMode: 0,
  pollingRate: 2,
  dpiCount: 5,
  activeDpiStage: 1,
  dpiStages: [800, 1200, 1600, 3200, 6400, 8000],
  scrollDirection: 0,
  liftOffDistance: 1,
  sensorFlags: 0,
  debounceMs: 8,
  sleepMinutes: 10,
  highspeedMode: 0,
  wakeMode: 0,
  moveLightMode: 0
}

export const DEFAULT_KEYS: KeyBinding[] = [
  { type: 0x20, code1: 0x01, code2: 0, code3: 0 }, // left
  { type: 0x20, code1: 0x02, code2: 0, code3: 0 }, // right
  { type: 0x20, code1: 0x04, code2: 0, code3: 0 }, // middle
  { type: 0x20, code1: 0x08, code2: 0, code3: 0 }, // back
  { type: 0x20, code1: 0x10, code2: 0, code3: 0 }, // forward
  { type: 0x21, code1: 0x55, code2: 0, code3: 0 }, // fixed: DPI cycle
  { type: 0x21, code1: 0x38, code2: 0x01, code3: 0 }, // fixed: wheel up
  { type: 0x21, code1: 0x38, code2: 0xff, code3: 0 } // fixed: wheel down
]

export const BUTTON_NAMES = ['Left button', 'Right button', 'Middle button', 'Back (side)', 'Forward (side)', 'DPI button', 'Wheel up', 'Wheel down']
