import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DeviceState, KeyBinding, LogEntry, MouseConfig, OperationResult, PROGRAMMABLE_BUTTONS } from '../../shared/types'
import { validateButtons, validateConfig } from '../../shared/validation'

export interface Toast {
  id: number
  ok: boolean
  message: string
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const buttonsOf = (s: DeviceState | null) => s?.keys?.slice(0, PROGRAMMABLE_BUTTONS) ?? null

/** Device state from the main process plus a local, editable draft that is only written on Apply. */
export function useDevice() {
  const [state, setState] = useState<DeviceState | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [draftConfig, setDraftConfig] = useState<MouseConfig | null>(null)
  const [draftButtons, setDraftButtons] = useState<KeyBinding[] | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [applying, setApplying] = useState(false)
  // True once the user has touched the draft; until then the draft follows the device.
  const editedConfig = useRef(false)
  const editedButtons = useRef(false)
  const stateRef = useRef<DeviceState | null>(null)
  stateRef.current = state

  useEffect(() => {
    void window.evofox.device.getState().then(setState)
    void window.evofox.device.getLog().then(setLog)
    const offState = window.evofox.device.onState(setState)
    const offLog = window.evofox.device.onLog((e) => setLog((l) => [...l.slice(-499), e]))
    return () => {
      offState()
      offLog()
    }
  }, [])

  const deviceConfig = state?.config ?? null
  const deviceButtons = useMemo(() => buttonsOf(state), [state?.keys])

  useEffect(() => {
    if (!deviceConfig) {
      editedConfig.current = false
      setDraftConfig(null)
    } else if (!editedConfig.current) setDraftConfig(clone(deviceConfig))
  }, [deviceConfig])

  useEffect(() => {
    if (!deviceButtons) {
      editedButtons.current = false
      setDraftButtons(null)
    } else if (!editedButtons.current) setDraftButtons(clone(deviceButtons))
  }, [deviceButtons])

  const configDirty = !!draftConfig && !!deviceConfig && !equal(draftConfig, deviceConfig)
  const buttonsDirty = !!draftButtons && !!deviceButtons && !equal(draftButtons, deviceButtons)

  const notify = useCallback((r: OperationResult) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, ok: r.ok, message: r.message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), r.ok ? 3500 : 8000)
  }, [])

  const updateConfig = useCallback((patch: Partial<MouseConfig>) => {
    editedConfig.current = true
    setDraftConfig((d) => (d ? { ...d, ...patch } : d))
  }, [])

  const updateButton = useCallback((index: number, binding: KeyBinding) => {
    editedButtons.current = true
    setDraftButtons((d) => (d ? d.map((b, i) => (i === index ? { ...binding } : b)) : d))
  }, [])

  /** Drops local edits and re-syncs the draft with what the mouse reports. */
  const resync = useCallback(() => {
    const s = stateRef.current
    editedConfig.current = false
    editedButtons.current = false
    setDraftConfig(s?.config ? clone(s.config) : null)
    const b = buttonsOf(s)
    setDraftButtons(b ? clone(b) : null)
  }, [])

  const errors = useMemo(
    () => [...(draftConfig && configDirty ? validateConfig(draftConfig) : []), ...(draftButtons && buttonsDirty ? validateButtons(draftButtons) : [])],
    [draftConfig, draftButtons, configDirty, buttonsDirty]
  )

  const apply = useCallback(async () => {
    setApplying(true)
    try {
      if (configDirty && draftConfig) {
        const r = await window.evofox.device.applyConfig(draftConfig)
        notify(r)
        if (!r.ok) return
      }
      if (buttonsDirty && draftButtons) {
        const r = await window.evofox.device.applyButtons(draftButtons)
        notify(r)
        if (!r.ok) return
      }
      resync()
    } finally {
      setApplying(false)
    }
  }, [configDirty, buttonsDirty, draftConfig, draftButtons, notify, resync])

  /** Runs a device/profile operation, shows its result and re-syncs the draft. */
  const run = useCallback(
    async (op: () => Promise<OperationResult>) => {
      setApplying(true)
      try {
        const r = await op()
        notify(r)
        if (r.ok) resync()
        return r
      } finally {
        setApplying(false)
      }
    },
    [notify, resync]
  )

  return {
    state,
    log,
    draftConfig,
    draftButtons,
    configDirty,
    buttonsDirty,
    dirty: configDirty || buttonsDirty,
    errors,
    applying,
    toasts,
    updateConfig,
    updateButton,
    discard: resync,
    apply,
    run,
    notify
  }
}

export type DeviceModel = ReturnType<typeof useDevice>
