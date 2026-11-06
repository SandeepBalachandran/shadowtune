import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IPC } from '../shared/api'
import {
  AppRuntimeState,
  AppSettings,
  KeyBinding,
  MouseConfig,
  OperationResult,
  POWER_KEYS,
  PowerKey,
  Profile,
  WindowsPointerSettings
} from '../shared/types'
import { validateWindowsPointer } from '../shared/validation'
import { AutoSwitcher } from './autoSwitch'
import { BatteryHistory } from './batteryHistory'
import { DeviceService } from './device/deviceService'
import { DpiPopup } from './dpiPopup'
import { migrateFromOldName } from './migrate'
import { MockBackend } from './device/mockBackend'
import { NodeHidBackend } from './device/nodeHidBackend'
import { PowerKeys } from './powerKeys'
import { QuickActions } from './quickActions'
import { ProfileStore } from './profiles'
import { SettingsStore } from './settings'
import { AppTray } from './tray'
import { win32 } from './win32'
import iconPath from '../../resources/icon.ico?asset'

let window: BrowserWindow | null = null
let tray: AppTray | null = null
let quitting = false
const startHidden = process.argv.includes('--hidden')
// This app's own exe (current and pre-rename names) — not a "recent program" for auto-switch rules.
const IGNORED_SELF = new Set(['shadowtune.exe', 'evofox control.exe', 'electron.exe'])
const service = new DeviceService(new NodeHidBackend(), new MockBackend())

// PC-side features (set up in whenReady)
let profiles: ProfileStore
let settings: SettingsStore
let autoSwitch: AutoSwitcher
let powerKeys: PowerKeys
let foregroundExe: string | null = null
let recentApps: string[] = []
let powerKeyConflicts: PowerKey[] = []
let hotkeyConflicts: string[] = []
/** Profiles for the tray menu (kept in memory so the menu builds instantly). */
let cachedProfiles: Profile[] = []
let batteryHistory: BatteryHistory
const dpiPopup = new DpiPopup()

/** Applies a profile's Windows pointer settings (PC only — never touches the mouse). */
function applyPcSettings(p: Profile) {
  if (!p.windows) return
  try {
    win32()?.setPointerSettings(p.windows)
  } catch (err) {
    service.note('warn', `Couldn't apply Windows pointer settings: ${(err as Error).message}`)
  }
}

async function applyProfile(id: string): Promise<OperationResult> {
  const p = await profiles.get(String(id))
  if (!p) return { ok: false, message: 'Profile not found.' }
  applyPcSettings(p)
  const cfg = await service.applyConfig(p.config)
  if (!cfg.ok) return cfg
  const keys = await service.applyButtons(p.buttons)
  return keys.ok ? { ok: true, message: `Profile "${p.name}" applied and verified.` } : keys
}

function appState(): AppRuntimeState {
  return {
    settings: settings.get(),
    isPackaged: app.isPackaged,
    foregroundExe,
    recentApps,
    autoSwitch: autoSwitch.getStatus(),
    powerKeyConflicts,
    hotkeyConflicts,
    windowsPointer: readPointer(),
    profilesPath: profiles.folder
  }
}

function readPointer(): WindowsPointerSettings | null {
  try {
    return win32()?.getPointerSettings() ?? null
  } catch {
    return null
  }
}

const pushAppState = () => send(IPC.appStateEvent, appState())

/** Applies saved settings to Windows (startup entry), shortcuts and the switcher. */
async function applySettings(s: AppSettings) {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: s.launchAtStartup, args: ['--hidden'] })
  }
  const registered = powerKeys.apply(s)
  powerKeyConflicts = registered.powerKeyConflicts
  hotkeyConflicts = registered.hotkeyConflicts
  tray?.setOptions({ batteryIcon: s.trayBatteryIcon, notifyFullyCharged: s.notifyFullyCharged })
  try {
    await profiles.setDir(s.profilesDir)
  } catch (err) {
    service.note('error', `Couldn't use profiles folder ${s.profilesDir}: ${(err as Error).message}`)
  }
  cachedProfiles = await profiles.list()
  autoSwitch.configure(s.autoSwitch, cachedProfiles)
  tray?.refreshMenu()
  pushAppState()
}

/** Watches which program is in front (once a second; a cheap Windows API call). */
function startForegroundWatch() {
  const w = win32()
  if (!w) return
  setInterval(() => {
    let exe: string | null = null
    try {
      exe = w.foregroundExe()
    } catch {
      return
    }
    if (!exe || exe === foregroundExe) return
    foregroundExe = exe
    if (!IGNORED_SELF.has(exe)) {
      recentApps = [exe, ...recentApps.filter((x) => x !== exe)].slice(0, 15)
    }
    autoSwitch.foregroundChanged(exe)
    pushAppState()
  }, 1000)
}

function showWindow() {
  if (!window) return createWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function quitApp() {
  quitting = true
  app.quit()
}

function createWindow(show = true) {
  window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: 'ShadowTune',
    icon: iconPath,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (show) window.once('ready-to-show', () => window?.show())

  // The UI is local-only: block navigation and open external links in the default browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  // Closing the window keeps the app in the tray (battery watch); Quit from the tray exits.
  window.on('close', (e) => {
    if (quitting || !tray) return
    e.preventDefault()
    window?.hide()
    tray.showBackgroundHint()
  })
  window.on('closed', () => (window = null))
}

function send(channel: string, value: unknown) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value)
}

function registerIpc() {
  const fail = (err: unknown): OperationResult => ({ ok: false, message: (err as Error).message })

  ipcMain.handle(IPC.deviceState, () => service.getState())
  ipcMain.handle(IPC.deviceLog, () => service.getLog())
  ipcMain.handle(IPC.deviceRefresh, () => service.refresh())
  ipcMain.handle(IPC.deviceApplyConfig, (_e, config: MouseConfig) => service.applyConfig(config))
  ipcMain.handle(IPC.deviceApplyButtons, (_e, buttons: KeyBinding[]) => service.applyButtons(buttons))
  ipcMain.handle(IPC.deviceRestore, () => service.restoreDefaults())
  ipcMain.handle(IPC.deviceSetMock, (_e, enabled: boolean) => service.setMockEnabled(Boolean(enabled)))

  // Profile changes also refresh the auto-switcher's copy of the profiles.
  const profilesChanged = async () => {
    cachedProfiles = await profiles.list()
    autoSwitch.configure(settings.get().autoSwitch, cachedProfiles)
    tray?.refreshMenu()
  }

  ipcMain.handle(IPC.profilesList, () => profiles.list())
  ipcMain.handle(
    IPC.profilesSave,
    async (_e, name: string, config: MouseConfig, buttons: KeyBinding[], id?: string, windows?: WindowsPointerSettings) => {
    const p = await profiles.save(String(name ?? ''), config, buttons, id, windows)
    await profilesChanged()
    return p
  }
  )
  ipcMain.handle(IPC.profilesRemove, async (_e, id: string) => {
    await profiles.remove(String(id))
    await profilesChanged()
  })
  ipcMain.handle(IPC.profilesApply, (_e, id: string) => applyProfile(id))

  ipcMain.handle(IPC.appState, () => appState())
  ipcMain.handle(IPC.appSaveSettings, async (_e, next: AppSettings): Promise<OperationResult> => {
    try {
      await applySettings(await settings.save(next))
      return { ok: true, message: 'Settings saved.' }
    } catch (err) {
      return fail(err)
    }
  })
  ipcMain.handle(IPC.appBrowseTarget, async (): Promise<string | null> => {
    if (!window) return null
    const res = await dialog.showOpenDialog(window, {
      title: 'Choose a program, file or folder to open',
      properties: ['openFile'],
      filters: [
        { name: 'Programs', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC.appSetWindowsPointer, (_e, w: WindowsPointerSettings): OperationResult => {
    const errors = validateWindowsPointer(w)
    if (errors.length) return { ok: false, message: errors.join(' ') }
    const api = win32()
    if (!api) return { ok: false, message: 'Only available on Windows.' }
    try {
      api.setPointerSettings(w)
      pushAppState()
      return { ok: true, message: 'Windows pointer settings changed.' }
    } catch (err) {
      return fail(err)
    }
  })
  ipcMain.handle(IPC.appChooseProfilesDir, async (): Promise<string | null> => {
    if (!window) return null
    const res = await dialog.showOpenDialog(window, {
      title: 'Choose a folder for your profiles (e.g. inside OneDrive)',
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC.appOpenProfilesDir, () => shell.openPath(profiles.folder))
  ipcMain.handle(IPC.batteryReport, () => batteryHistory.report(service.getState().battery))

  ipcMain.handle(IPC.appTestPowerKey, async (_e, key: PowerKey): Promise<OperationResult> => {
    if (!POWER_KEYS.includes(key)) return { ok: false, message: 'Unknown key.' }
    return powerKeys.run(key, settings.get().powerKeys[key])
  })

  ipcMain.handle(IPC.profilesExport, async (_e, id: string): Promise<OperationResult> => {
    try {
      const p = await profiles.get(String(id))
      if (!p || !window) return { ok: false, message: 'Profile not found.' }
      const res = await dialog.showSaveDialog(window, {
        title: 'Export profile',
        defaultPath: `${p.name.replace(/[^\w\- ]+/g, '_')}.evofox.json`,
        filters: [{ name: 'EvoFox profile', extensions: ['json'] }]
      })
      if (res.canceled || !res.filePath) return { ok: false, message: 'Export cancelled.' }
      await fs.writeFile(res.filePath, JSON.stringify(p, null, 2), 'utf8')
      return { ok: true, message: `Exported to ${res.filePath}` }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.profilesImport, async (): Promise<OperationResult> => {
    try {
      if (!window) return { ok: false, message: 'No window.' }
      const res = await dialog.showOpenDialog(window, {
        title: 'Import profile',
        properties: ['openFile'],
        filters: [{ name: 'EvoFox profile', extensions: ['json'] }]
      })
      if (res.canceled || !res.filePaths[0]) return { ok: false, message: 'Import cancelled.' }
      const stat = await fs.stat(res.filePaths[0])
      if (stat.size > 256 * 1024) return { ok: false, message: 'File is too large to be a profile.' }
      const p = await profiles.importFrom(await fs.readFile(res.filePaths[0], 'utf8'))
      return { ok: true, message: `Imported "${p.name}".` }
    } catch (err) {
      return fail(err)
    }
  })
}

if (!app.requestSingleInstanceLock()) {
  // Only one process may hold the mouse's HID handle.
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.shadowtune.app')
    const dataDir = app.getPath('userData')
    await migrateFromOldName((m) => service.note('info', m))
    profiles = new ProfileStore(dataDir)
    settings = new SettingsStore(dataDir)
    const loaded = await settings.load()

    batteryHistory = new BatteryHistory(dataDir)
    await batteryHistory.load()
    autoSwitch = new AutoSwitcher(
      {
        getState: () => service.getState(),
        applyConfig: (c) => service.applyConfig(c),
        applyButtons: (b) => service.applyButtons(b),
        applyPcSettings
      },
      loaded.autoSwitch
    )
    let lastNote: string | null = null
    autoSwitch.onStatus((st) => {
      if (st.note && st.note !== lastNote) service.note('info', `Auto-switch: ${st.note}`)
      lastNote = st.note
      pushAppState()
    })
    const quick = new QuickActions({
      getConfig: () => service.getState().config,
      applyConfig: (c) => service.applyConfig(c),
      applyProfile
    })
    powerKeys = new PowerKeys({
      foregroundExe: () => {
        try {
          return win32()?.foregroundExe() ?? null
        } catch {
          return null
        }
      },
      quick,
      notify: (message) => {
        if (Notification.isSupported()) new Notification({ title: 'ShadowTune', body: message }).show()
      },
      log: (message) => service.note('info', `Shortcut ${message}`)
    })

    registerIpc()
    cachedProfiles = await profiles.list()
    tray = new AppTray(iconPath, showWindow, quitApp, {
      profiles: () => cachedProfiles.map((p) => ({ id: p.id, name: p.name })),
      applyProfile: (id) => quick.applyProfile(id),
      setDpiStage: (i) => quick.setDpiStage(i),
      toggleLights: () => quick.toggleLights()
    })

    let wasReady = false
    service.onState((s) => {
      send(IPC.stateEvent, s)
      tray?.update(s)
      const ready = s.status === 'connected' && s.mouseResponding
      if (ready && !wasReady) autoSwitch.deviceReady()
      wasReady = ready
      if (ready && s.battery && s.identity?.source === 'hardware') batteryHistory.record(s.battery)
    })
    service.onDpiButton((c) => {
      if (settings.get().dpiPopup) void dpiPopup.show(c.dpiStages[c.activeDpiStage], c.activeDpiStage, c.dpiCount).catch(() => undefined)
    })
    service.onLog((e) => send(IPC.logEvent, e))
    if (process.env.EVOFOX_MOCK === '1') void service.setMockEnabled(true)

    await applySettings(loaded)
    service.start()
    startForegroundWatch()
    // Started by Windows at login → stay in the tray until the user opens the window.
    createWindow(!startHidden)
  })

  app.on('will-quit', () => {
    powerKeys?.dispose()
    dpiPopup.dispose()
  })

  app.on('before-quit', () => {
    quitting = true
  })

  // Only reached when quitting (the window hides to the tray otherwise).
  app.on('window-all-closed', async () => {
    await service.stop()
    tray?.destroy()
    app.quit()
  })
}
