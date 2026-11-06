import { useCallback, useEffect, useState } from 'react'
import { KeyBinding, MouseConfig, OperationResult, Profile, WindowsPointerSettings } from '../../../shared/types'
import { Button, Card } from './ui'

export function ProfilesTab({
  config,
  buttons,
  canApply,
  dirty,
  run,
  notify,
  windowsPointer
}: {
  config: MouseConfig | null
  buttons: KeyBinding[] | null
  canApply: boolean
  dirty: boolean
  run: (op: () => Promise<OperationResult>) => Promise<OperationResult>
  notify: (r: OperationResult) => void
  windowsPointer: WindowsPointerSettings | null
}) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [name, setName] = useState('')
  const [includeWindows, setIncludeWindows] = useState(true)

  const reload = useCallback(() => void window.evofox.profiles.list().then(setProfiles), [])
  useEffect(reload, [reload])

  const save = async () => {
    if (!config || !buttons) return
    try {
      const p = await window.evofox.profiles.save(name, config, buttons, undefined, includeWindows && windowsPointer ? windowsPointer : undefined)
      notify({ ok: true, message: `Saved profile "${p.name}".` })
      setName('')
      reload()
    } catch (err) {
      notify({ ok: false, message: cleanIpcError(err) })
    }
  }

  const remove = async (p: Profile) => {
    if (!window.confirm(`Delete profile "${p.name}"?`)) return
    await window.evofox.profiles.remove(p.id)
    reload()
  }

  return (
    <div className="space-y-5">
      <Card
        title="Save current settings"
        description={dirty ? 'Includes your unapplied changes.' : 'Profiles are stored on this PC only. The mouse itself holds one active setup.'}
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            maxLength={60}
            placeholder="Profile name, e.g. FPS – low DPI"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && void save()}
            className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
          <Button kind="primary" disabled={!name.trim() || !config || !buttons} onClick={() => void save()}>
            Save profile
          </Button>
        </div>
        {windowsPointer && (
          <label className="mt-3 flex items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={includeWindows} onChange={(e) => setIncludeWindows(e.target.checked)} className="accent-[var(--color-accent)]" />
            Also save Windows pointer settings (speed {windowsPointer.pointerSpeed}, precision {windowsPointer.enhancePrecision ? 'on' : 'off'},{' '}
            {windowsPointer.scrollLines} scroll lines)
          </label>
        )}
      </Card>

      <Card title="Saved profiles">
        {profiles.length === 0 ? (
          <p className="text-[13px] text-muted">No profiles yet.</p>
        ) : (
          <ul>
            {profiles.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate text-[14px]">{p.name}</div>
                  <div className="text-[12px] text-muted">
                    {p.config.dpiStages.slice(0, p.config.dpiCount).join(' / ')} DPI
                    {p.windows ? ' · + Windows pointer settings' : ''} · updated {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button kind="primary" disabled={!canApply} onClick={() => void run(() => window.evofox.profiles.apply(p.id))}>
                    Apply to mouse
                  </Button>
                  <Button onClick={() => void window.evofox.profiles.exportToFile(p.id).then((r) => r.message !== 'Export cancelled.' && notify(r))}>Export</Button>
                  <Button kind="danger" onClick={() => void remove(p)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-line pt-4">
          <Button
            onClick={() =>
              void window.evofox.profiles.importFromFile().then((r) => {
                if (r.message !== 'Import cancelled.') notify(r)
                reload()
              })
            }
          >
            Import profile…
          </Button>
        </div>
      </Card>
    </div>
  )
}

function cleanIpcError(err: unknown): string {
  // Electron prefixes errors thrown in handlers: "Error invoking remote method 'x': Error: msg"
  return String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
