// Tiny Windows API layer (via koffi, which ships prebuilt binaries — no compiler needed).
// Loaded lazily so tests and non-Windows platforms never touch it.

import path from 'node:path'
import { WindowsPointerSettings } from '../shared/types'

interface Win32 {
  foregroundExe(): string | null
  lockWorkStation(): void
  /** Presses Ctrl+V in the active window. */
  pressCtrlV(): void
  /** True while Ctrl, Alt, Shift or a Windows key is physically held. */
  modifiersDown(): boolean
  /** Toggles mute on the default microphone; returns the new state (true = muted). */
  toggleMicMute(): boolean
  getPointerSettings(): WindowsPointerSettings | null
  setPointerSettings(s: WindowsPointerSettings): void
}

let api: Win32 | null | undefined

export function win32(): Win32 | null {
  if (api !== undefined) return api
  if (process.platform !== 'win32') return (api = null)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const ole32 = koffi.load('ole32.dll')

  const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()')
  const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)')
  const LockWorkStation = user32.func('bool __stdcall LockWorkStation()')
  const keybd_event = user32.func('void __stdcall keybd_event(uint8 vk, uint8 scan, uint32 flags, uintptr extra)')
  const GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int vk)')
  // SystemParametersInfo is declared three ways for its three parameter shapes.
  const SpiGetInt = user32.func('bool __stdcall SystemParametersInfoW(uint32 action, uint32 ui, _Out_ int32* pv, uint32 winIni)')
  const SpiInts = user32.func('SystemParametersInfoW', 'bool', ['uint32', 'uint32', koffi.inout(koffi.pointer(koffi.array('int32', 3))), 'uint32'])
  const SpiSetValue = user32.func('SystemParametersInfoW', 'bool', ['uint32', 'uint32', 'uintptr', 'uint32'])
  const OpenProcess = kernel32.func('void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)')
  const QueryFullProcessImageNameW = kernel32.func(
    'bool __stdcall QueryFullProcessImageNameW(void* h, uint32 flags, _Out_ uint16* name, _Inout_ uint32* size)'
  )
  const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void* h)')

  // --- COM (Windows Core Audio) for microphone mute
  const GUID = koffi.struct('GUID', { d1: 'uint32', d2: 'uint16', d3: 'uint16', d4: koffi.array('uint8', 8) })
  const guid = (s: string) => {
    const h = s.replace(/-/g, '')
    return {
      d1: parseInt(h.slice(0, 8), 16),
      d2: parseInt(h.slice(8, 12), 16),
      d3: parseInt(h.slice(12, 16), 16),
      d4: Array.from({ length: 8 }, (_, i) => parseInt(h.slice(16 + i * 2, 18 + i * 2), 16))
    }
  }
  const CoInitializeEx = ole32.func('int __stdcall CoInitializeEx(void* reserved, uint32 coinit)')
  const CoCreateInstance = ole32.func('int __stdcall CoCreateInstance(GUID* clsid, void* outer, uint32 ctx, GUID* iid, _Out_ void** out)')
  const P = {
    release: koffi.proto('uint32 __stdcall ComRelease(void* self)'),
    getDefault: koffi.proto('int __stdcall GetDefaultAudioEndpoint(void* self, int flow, int role, _Out_ void** dev)'),
    activate: koffi.proto('int __stdcall Activate(void* self, GUID* iid, uint32 ctx, void* params, _Out_ void** out)'),
    setMute: koffi.proto('int __stdcall SetMute(void* self, int mute, void* ctx)'),
    getMute: koffi.proto('int __stdcall GetMute(void* self, _Out_ int* mute)')
  }
  /** Calls method #index of a COM object's vtable. */
  const com = (obj: unknown, index: number, proto: unknown, ...args: unknown[]) => {
    const fn = koffi.decode(koffi.decode(obj, 'void *'), 'void *', index + 1)[index]
    return koffi.call(fn, proto, obj, ...args)
  }
  const CLSID_MMDeviceEnumerator = guid('BCDE0395-E52F-467C-8E3D-C4579291692E')
  const IID_IMMDeviceEnumerator = guid('A95664D2-9614-4F35-A746-DE8DB63617E6')
  const IID_IAudioEndpointVolume = guid('5CDF2C82-841E-4546-9722-0CF74078229A')
  const CLSCTX_ALL = 0x17
  const eCapture = 1
  const roles = [0 /* eConsole */, 2 /* eCommunications */]

  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
  const VK_CONTROL = 0x11
  const VK_V = 0x56
  const KEYEVENTF_KEYUP = 0x2
  const SPI = { GETMOUSE: 0x03, SETMOUSE: 0x04, GETWHEELSCROLLLINES: 0x68, SETWHEELSCROLLLINES: 0x69, GETMOUSESPEED: 0x70, SETMOUSESPEED: 0x71 }
  const SPIF_SAVE_AND_BROADCAST = 0x01 | 0x02

  api = {
    foregroundExe() {
      const hwnd = GetForegroundWindow()
      if (!hwnd) return null
      const pid = [0]
      GetWindowThreadProcessId(hwnd, pid)
      if (!pid[0]) return null
      const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0])
      if (!h) return null
      try {
        const buf = Buffer.alloc(2048)
        const size = [1024]
        if (!QueryFullProcessImageNameW(h, 0, buf, size)) return null
        return path.win32.basename(buf.toString('utf16le', 0, size[0] * 2)).toLowerCase()
      } finally {
        CloseHandle(h)
      }
    },

    lockWorkStation() {
      LockWorkStation()
    },

    pressCtrlV() {
      keybd_event(VK_CONTROL, 0, 0, 0)
      keybd_event(VK_V, 0, 0, 0)
      keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0)
      keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
    },

    modifiersDown() {
      // Shift, Ctrl, Alt, left/right Windows key; the high bit means "currently down".
      return [0x10, 0x11, 0x12, 0x5b, 0x5c].some((vk) => (GetAsyncKeyState(vk) & 0x8000) !== 0)
    },

    toggleMicMute() {
      CoInitializeEx(null, 0) // fine if COM is already initialised on this thread
      const enumerator = [null]
      if (CoCreateInstance(CLSID_MMDeviceEnumerator, null, CLSCTX_ALL, IID_IMMDeviceEnumerator, enumerator) !== 0) {
        throw new Error('Windows audio service is not available.')
      }
      let target: boolean | null = null
      try {
        // Apply the same state to the default and the default communications microphone.
        for (const role of roles) {
          const device = [null]
          if (com(enumerator[0], 4, P.getDefault, eCapture, role, device) !== 0) continue
          const volume = [null]
          try {
            if (com(device[0], 3, P.activate, IID_IAudioEndpointVolume, CLSCTX_ALL, null, volume) !== 0) continue
            try {
              if (target === null) {
                const muted = [0]
                com(volume[0], 15, P.getMute, muted)
                target = !muted[0]
              }
              com(volume[0], 14, P.setMute, target ? 1 : 0, null)
            } finally {
              com(volume[0], 2, P.release)
            }
          } finally {
            com(device[0], 2, P.release)
          }
        }
      } finally {
        com(enumerator[0], 2, P.release)
      }
      if (target === null) throw new Error('No microphone found.')
      return target
    },

    getPointerSettings() {
      const speed = [0]
      const lines = [0]
      const mouse = [[0, 0, 0]]
      if (!SpiGetInt(SPI.GETMOUSESPEED, 0, speed, 0) || !SpiGetInt(SPI.GETWHEELSCROLLLINES, 0, lines, 0) || !SpiInts(SPI.GETMOUSE, 0, mouse, 0)) {
        return null
      }
      return {
        pointerSpeed: speed[0],
        enhancePrecision: mouse[0][2] !== 0,
        // "One screen at a time" is stored as a huge number; show it as the maximum.
        scrollLines: lines[0] < 1 || lines[0] > 100 ? 100 : lines[0]
      }
    },

    setPointerSettings(s) {
      SpiSetValue(SPI.SETMOUSESPEED, 0, s.pointerSpeed, SPIF_SAVE_AND_BROADCAST)
      SpiSetValue(SPI.SETWHEELSCROLLLINES, s.scrollLines, 0, SPIF_SAVE_AND_BROADCAST)
      // Windows' defaults for "Enhance pointer precision": thresholds 6 and 10, acceleration 1.
      SpiInts(SPI.SETMOUSE, 0, [s.enhancePrecision ? [6, 10, 1] : [0, 0, 0]], SPIF_SAVE_AND_BROADCAST)
    }
  }
  return api
}
