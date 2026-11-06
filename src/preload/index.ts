import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { EvofoxApi, IPC } from '../shared/api'
import { AppRuntimeState, DeviceState, LogEntry } from '../shared/types'

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, value: T) => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: EvofoxApi = {
  device: {
    getState: () => ipcRenderer.invoke(IPC.deviceState),
    getLog: () => ipcRenderer.invoke(IPC.deviceLog),
    refresh: () => ipcRenderer.invoke(IPC.deviceRefresh),
    applyConfig: (config) => ipcRenderer.invoke(IPC.deviceApplyConfig, config),
    applyButtons: (buttons) => ipcRenderer.invoke(IPC.deviceApplyButtons, buttons),
    restoreDefaults: () => ipcRenderer.invoke(IPC.deviceRestore),
    setMockEnabled: (enabled) => ipcRenderer.invoke(IPC.deviceSetMock, enabled),
    onState: (l) => subscribe<DeviceState>(IPC.stateEvent, l),
    onLog: (l) => subscribe<LogEntry>(IPC.logEvent, l)
  },
  profiles: {
    list: () => ipcRenderer.invoke(IPC.profilesList),
    save: (name, config, buttons, id, windows) => ipcRenderer.invoke(IPC.profilesSave, name, config, buttons, id, windows),
    remove: (id) => ipcRenderer.invoke(IPC.profilesRemove, id),
    apply: (id) => ipcRenderer.invoke(IPC.profilesApply, id),
    exportToFile: (id) => ipcRenderer.invoke(IPC.profilesExport, id),
    importFromFile: () => ipcRenderer.invoke(IPC.profilesImport)
  },
  app: {
    getState: () => ipcRenderer.invoke(IPC.appState),
    saveSettings: (settings) => ipcRenderer.invoke(IPC.appSaveSettings, settings),
    browseTarget: () => ipcRenderer.invoke(IPC.appBrowseTarget),
    testPowerKey: (key) => ipcRenderer.invoke(IPC.appTestPowerKey, key),
    onState: (l) => subscribe<AppRuntimeState>(IPC.appStateEvent, l),
    setWindowsPointer: (s) => ipcRenderer.invoke(IPC.appSetWindowsPointer, s),
    chooseProfilesDir: () => ipcRenderer.invoke(IPC.appChooseProfilesDir),
    openProfilesDir: () => ipcRenderer.invoke(IPC.appOpenProfilesDir),
    batteryReport: () => ipcRenderer.invoke(IPC.batteryReport)
  }
}

contextBridge.exposeInMainWorld('evofox', api)
