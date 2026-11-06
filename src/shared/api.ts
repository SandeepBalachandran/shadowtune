// The only surface the renderer can use. Implemented in src/preload/index.ts.

import {
  AppRuntimeState,
  AppSettings,
  BatteryReport,
  DeviceState,
  KeyBinding,
  LogEntry,
  MouseConfig,
  OperationResult,
  PowerKey,
  Profile,
  WindowsPointerSettings
} from './types'

export interface EvofoxApi {
  device: {
    getState(): Promise<DeviceState>
    getLog(): Promise<LogEntry[]>
    refresh(): Promise<OperationResult>
    applyConfig(config: MouseConfig): Promise<OperationResult>
    applyButtons(buttons: KeyBinding[]): Promise<OperationResult>
    restoreDefaults(): Promise<OperationResult>
    setMockEnabled(enabled: boolean): Promise<OperationResult>
    onState(listener: (state: DeviceState) => void): () => void
    onLog(listener: (entry: LogEntry) => void): () => void
  }
  profiles: {
    list(): Promise<Profile[]>
    save(name: string, config: MouseConfig, buttons: KeyBinding[], id?: string, windows?: WindowsPointerSettings): Promise<Profile>
    remove(id: string): Promise<void>
    apply(id: string): Promise<OperationResult>
    exportToFile(id: string): Promise<OperationResult>
    importFromFile(): Promise<OperationResult>
  }
  app: {
    getState(): Promise<AppRuntimeState>
    saveSettings(settings: AppSettings): Promise<OperationResult>
    /** Opens a file picker; resolves to the chosen path or null. */
    browseTarget(): Promise<string | null>
    testPowerKey(key: PowerKey): Promise<OperationResult>
    onState(listener: (state: AppRuntimeState) => void): () => void
    setWindowsPointer(settings: WindowsPointerSettings): Promise<OperationResult>
    /** Opens a folder picker; resolves to the chosen folder or null. */
    chooseProfilesDir(): Promise<string | null>
    openProfilesDir(): Promise<string>
    batteryReport(): Promise<BatteryReport>
  }
}

export const IPC = {
  deviceState: 'device:getState',
  deviceLog: 'device:getLog',
  deviceRefresh: 'device:refresh',
  deviceApplyConfig: 'device:applyConfig',
  deviceApplyButtons: 'device:applyButtons',
  deviceRestore: 'device:restoreDefaults',
  deviceSetMock: 'device:setMock',
  stateEvent: 'device:state',
  logEvent: 'device:log',
  profilesList: 'profiles:list',
  profilesSave: 'profiles:save',
  profilesRemove: 'profiles:remove',
  profilesApply: 'profiles:apply',
  profilesExport: 'profiles:export',
  profilesImport: 'profiles:import',
  appState: 'app:getState',
  appStateEvent: 'app:state',
  appSaveSettings: 'app:saveSettings',
  appBrowseTarget: 'app:browseTarget',
  appTestPowerKey: 'app:testPowerKey',
  appSetWindowsPointer: 'app:setWindowsPointer',
  appChooseProfilesDir: 'app:chooseProfilesDir',
  appOpenProfilesDir: 'app:openProfilesDir',
  batteryReport: 'battery:report'
} as const
