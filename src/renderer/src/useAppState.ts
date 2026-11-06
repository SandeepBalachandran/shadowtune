import { useCallback, useEffect, useState } from 'react'
import { AppRuntimeState, AppSettings, OperationResult } from '../../shared/types'

/** PC-side settings (startup, auto-switch, power keys). Changes are saved immediately. */
export function useAppState(notify: (r: OperationResult) => void) {
  const [app, setApp] = useState<AppRuntimeState | null>(null)

  useEffect(() => {
    void window.evofox.app.getState().then(setApp)
    return window.evofox.app.onState(setApp)
  }, [])

  const save = useCallback(
    async (next: AppSettings, quiet = true) => {
      const r = await window.evofox.app.saveSettings(next)
      if (!r.ok || !quiet) notify(r)
      return r.ok
    },
    [notify]
  )

  return { app, save, notify }
}

export type AppModel = ReturnType<typeof useAppState>
