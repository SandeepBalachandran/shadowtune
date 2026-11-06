import { useEffect, useState } from 'react'
import { BUTTON_NAMES, Hotkey, KeyBinding, OperationResult, POWER_KEYS, PowerAction, PowerKey, PowerKeyOverride, Profile } from '../../../shared/types'
import { powerKeyOf } from '../../../shared/keymap'
import { isAccelerator, validatePowerAction } from '../../../shared/validation'
import { AppModel } from '../useAppState'
import { Button, Card, Select } from './ui'

const KINDS: { kind: PowerAction['kind']; label: string }[] = [
  { kind: 'none', label: 'Nothing' },
  { kind: 'open', label: 'Open a program, file or folder' },
  { kind: 'url', label: 'Open a website' },
  { kind: 'text', label: 'Type text' },
  { kind: 'micMute', label: 'Mute / unmute microphone' },
  { kind: 'profile', label: 'Switch to a profile' },
  { kind: 'cycleDpi', label: 'Next DPI stage' },
  { kind: 'toggleLights', label: 'Lights on / off' },
  { kind: 'screenshot', label: 'Take a screenshot' },
  { kind: 'lock', label: 'Lock the PC' }
]

function blank(kind: PowerAction['kind'], profiles: Profile[]): PowerAction {
  switch (kind) {
    case 'open':
      return { kind, target: '' }
    case 'url':
      return { kind, url: 'https://' }
    case 'text':
      return { kind, text: '' }
    case 'profile':
      return { kind, profileId: profiles[0]?.id ?? '' }
    default:
      return { kind } as PowerAction
  }
}

// KeyboardEvent.code → accelerator key name.
const CODE_KEYS: Record<string, string> = {
  Space: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`'
}

function acceleratorFrom(e: React.KeyboardEvent): string | null {
  const key = /^Key[A-Z]$/.test(e.code)
    ? e.code.slice(3)
    : /^Digit[0-9]$/.test(e.code)
      ? e.code.slice(5)
      : /^F([1-9]|1[0-2])$/.test(e.code)
        ? e.code
        : CODE_KEYS[e.code]
  if (!key) return null
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean)
  const acc = [...mods, key].join('+')
  return isAccelerator(acc) ? acc : null
}

/** Click, then press a key combination. Esc cancels. */
function HotkeyRecorder({ value, onChange }: { value: string; onChange: (accelerator: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  return (
    <button
      onClick={() => {
        setRecording(true)
        setHint(null)
      }}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return
        e.preventDefault()
        if (e.key === 'Escape') return setRecording(false)
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return
        const acc = acceleratorFrom(e)
        if (!acc) return setHint('Use Ctrl, Alt, Shift or Win plus a key')
        setRecording(false)
        onChange(acc)
      }}
      className={`w-full rounded-lg border px-3 py-2 text-left font-mono text-[13px] ${recording ? 'border-accent bg-accent-soft' : 'border-line bg-panel-2 hover:border-muted'}`}
      title="Click, then press the keys"
    >
      {recording ? <span className="text-muted">{hint ?? 'Press keys…'}</span> : value.replace('Super', 'Win')}
    </button>
  )
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))
const inputClass = 'flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] outline-none focus:border-accent'

/** Action picker + its parameter field. Saves only complete, valid actions. */
function ActionEditor({
  action,
  profiles,
  onSave,
  onTest
}: {
  action: PowerAction
  profiles: Profile[]
  onSave: (a: PowerAction) => void | Promise<unknown>
  onTest?: () => void
}) {
  const [draft, setDraft] = useState<PowerAction>(action)
  useEffect(() => setDraft(action), [action])

  const commit = async (a: PowerAction) => {
    setDraft(a)
    if (validatePowerAction(a).length === 0 && JSON.stringify(a) !== JSON.stringify(action)) await onSave(a)
  }
  const invalid = draft.kind !== 'none' && validatePowerAction(draft).length > 0

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <Select value={draft.kind} onChange={(k) => void commit(blank(k as PowerAction['kind'], profiles))} className="w-60 shrink-0">
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </Select>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {draft.kind === 'open' && (
            <>
              <input
                className={inputClass}
                placeholder="C:\Path\to\program.exe"
                value={draft.target}
                onChange={(e) => setDraft({ kind: 'open', target: e.target.value })}
                onBlur={() => void commit(draft)}
              />
              <Button
                onClick={async () => {
                  const path = await window.evofox.app.browseTarget()
                  if (path) await commit({ kind: 'open', target: path })
                }}
              >
                Browse…
              </Button>
            </>
          )}
          {draft.kind === 'url' && (
            <input className={inputClass} value={draft.url} onChange={(e) => setDraft({ kind: 'url', url: e.target.value })} onBlur={() => void commit(draft)} />
          )}
          {draft.kind === 'text' && (
            <input
              className={inputClass}
              placeholder="Text to type, e.g. your e-mail address"
              maxLength={4000}
              value={draft.text}
              onChange={(e) => setDraft({ kind: 'text', text: e.target.value })}
              onBlur={() => void commit(draft)}
            />
          )}
          {draft.kind === 'profile' &&
            (profiles.length ? (
              <Select value={draft.profileId} onChange={(id) => void commit({ kind: 'profile', profileId: id })} className="min-w-0 flex-1">
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-[12px] text-muted">Save a profile first (Profiles tab).</span>
            ))}
        </div>
        {onTest && (
          <Button kind="ghost" disabled={action.kind === 'none' || invalid} title="Run this action now" onClick={onTest}>
            Test
          </Button>
        )}
      </div>
      {invalid && <div className="mt-1.5 text-[12px] text-warn">{validatePowerAction(draft)[0]}</div>}
    </div>
  )
}

export function ShortcutsTab({ appModel, keys, notify }: { appModel: AppModel; keys: KeyBinding[] | null; notify: (r: OperationResult) => void }) {
  const { app, save } = appModel
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [newKey, setNewKey] = useState<PowerKey>('F13')
  const [newExe, setNewExe] = useState('')
  useEffect(() => void window.evofox.profiles.list().then(setProfiles), [])
  if (!app) return null

  const s = app.settings
  const usedBy = (pk: PowerKey) => (keys ?? []).flatMap((k, i) => (powerKeyOf(k) === pk ? [BUTTON_NAMES[i]] : []))
  const setOverrides = (list: PowerKeyOverride[]) => save({ ...s, powerKeyOverrides: list })
  const setHotkeys = (list: Hotkey[]) => save({ ...s, hotkeys: list })
  const freeAccelerator = (preferred: string) => {
    if (!s.hotkeys.some((h) => h.accelerator === preferred)) return preferred
    for (const c of 'ABCEFGHIJKNOPQRSUVWXYZ') {
      const acc = `Ctrl+Alt+${c}`
      if (!s.hotkeys.some((h) => h.accelerator === acc)) return acc
    }
    return preferred
  }
  const addHotkey = (accelerator: string, action: PowerAction) => void setHotkeys([...s.hotkeys, { id: newId(), accelerator, action }])

  const addOverride = () => {
    const raw = newExe.trim().toLowerCase()
    if (!raw) return
    const exe = raw.endsWith('.exe') ? raw : `${raw}.exe`
    if (s.powerKeyOverrides.some((o) => o.key === newKey && o.exe === exe)) {
      return notify({ ok: false, message: `${newKey} already has an action for ${exe}.` })
    }
    // Starts as "Nothing" — which also lets this key do nothing inside that program.
    void setOverrides([...s.powerKeyOverrides, { id: newId(), key: newKey, exe, action: { kind: 'none' } }])
    setNewExe('')
  }

  return (
    <div className="space-y-5">
      <Card
        title="Power keys"
        description="Make a mouse button do anything on your PC. Your mouse can send the keys F13–F24, which no keyboard has — this app catches them and runs the action you pick."
      >
        <ol className="mb-1 list-decimal space-y-1 pl-5 text-[13px] text-muted">
          <li>Pick an action for a key below (e.g. F13 → mute microphone).</li>
          <li>
            In the <strong className="text-text">Buttons</strong> tab, set a side button to <strong className="text-text">Power key F13</strong> and apply.
          </li>
          <li>Keep ShadowTune running (it lives in the tray). Actions run on the PC; only DPI and lights change the mouse.</li>
        </ol>
      </Card>

      <Card title="Actions">
        {POWER_KEYS.map((pk) => {
          const buttons = usedBy(pk)
          return (
            <div key={pk} className="border-t border-line py-3 first:border-t-0 first:pt-0">
              <div className="flex items-start gap-4">
                <div className="w-32 shrink-0 pt-1.5">
                  <div className="font-mono text-[14px]">{pk}</div>
                  <div className={`text-[11.5px] ${buttons.length ? 'text-ok' : 'text-muted'}`}>{buttons.length ? `on ${buttons.join(', ')}` : 'no button uses it'}</div>
                </div>
                <ActionEditor
                  action={s.powerKeys[pk]}
                  profiles={profiles}
                  onSave={(a) => save({ ...s, powerKeys: { ...s.powerKeys, [pk]: a } })}
                  onTest={async () => notify(await window.evofox.app.testPowerKey(pk))}
                />
              </div>
              {app.powerKeyConflicts.includes(pk) && <div className="mt-1.5 text-[12px] text-bad">Another program already uses {pk}; this action won't trigger.</div>}
            </div>
          )
        })}
      </Card>

      <Card
        title="Keyboard shortcuts"
        description="System-wide key combinations, e.g. Ctrl+Alt+D for the next DPI stage. They work in any program while ShadowTune is running."
      >
        {s.hotkeys.length === 0 && <p className="mb-3 text-[13px] text-muted">None yet.</p>}
        {s.hotkeys.map((h) => (
          <div key={h.id} className="border-t border-line py-3 first:border-t-0 first:pt-0">
            <div className="flex items-start gap-3">
              <div className="w-40 shrink-0">
                <HotkeyRecorder
                  value={h.accelerator}
                  onChange={(acc) => {
                    if (s.hotkeys.some((x) => x.id !== h.id && x.accelerator === acc)) return notify({ ok: false, message: `${acc} is already used.` })
                    void setHotkeys(s.hotkeys.map((x) => (x.id === h.id ? { ...x, accelerator: acc } : x)))
                  }}
                />
              </div>
              <ActionEditor
                action={h.action}
                profiles={profiles}
                onSave={(a) => setHotkeys(s.hotkeys.map((x) => (x.id === h.id ? { ...x, action: a } : x)))}
              />
              <Button kind="ghost" onClick={() => void setHotkeys(s.hotkeys.filter((x) => x.id !== h.id))}>
                Remove
              </Button>
            </div>
            {app.hotkeyConflicts.includes(h.accelerator) && (
              <div className="mt-1.5 text-[12px] text-bad">Windows or another program already uses {h.accelerator}. Pick a different combination.</div>
            )}
          </div>
        ))}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button kind="primary" onClick={() => addHotkey(freeAccelerator('Ctrl+Alt+D'), { kind: 'cycleDpi' })}>
            Add shortcut
          </Button>
          <span className="text-[12px] text-muted">Quick add:</span>
          {[
            { acc: 'Ctrl+Alt+D', action: { kind: 'cycleDpi' } as PowerAction, label: 'Next DPI' },
            { acc: 'Ctrl+Alt+L', action: { kind: 'toggleLights' } as PowerAction, label: 'Lights' },
            { acc: 'Ctrl+Alt+M', action: { kind: 'micMute' } as PowerAction, label: 'Mute mic' }
          ]
            .filter((q) => !s.hotkeys.some((h) => h.accelerator === q.acc))
            .map((q) => (
              <button
                key={q.acc}
                onClick={() => addHotkey(q.acc, q.action)}
                className="rounded-md border border-line px-2 py-0.5 text-[12px] text-muted hover:border-accent hover:text-text"
              >
                + {q.acc} → {q.label}
              </button>
            ))}
        </div>
      </Card>

      <Card
        title="Different action in specific programs"
        description="While the chosen program is in front, the key does this instead. Example: F13 mutes the mic everywhere, but in Chrome it opens a new tab."
      >
        {s.powerKeyOverrides.length === 0 && <p className="mb-3 text-[13px] text-muted">None yet.</p>}
        {s.powerKeyOverrides.map((o) => (
          <div key={o.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
            <div className="w-32 shrink-0 pt-1.5">
              <div className="font-mono text-[14px]">{o.key}</div>
              <div className="truncate font-mono text-[11.5px] text-muted" title={o.exe}>
                in {o.exe}
              </div>
            </div>
            <ActionEditor
              action={o.action}
              profiles={profiles}
              onSave={(a) => setOverrides(s.powerKeyOverrides.map((x) => (x.id === o.id ? { ...x, action: a } : x)))}
            />
            <Button kind="ghost" onClick={() => void setOverrides(s.powerKeyOverrides.filter((x) => x.id !== o.id))}>
              Remove
            </Button>
          </div>
        ))}
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <Select value={newKey} onChange={(v) => setNewKey(v as PowerKey)} className="w-24">
            {POWER_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
          <span className="text-[13px] text-muted">in</span>
          <input
            list="override-apps"
            value={newExe}
            onChange={(e) => setNewExe(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOverride()}
            placeholder="Program, e.g. chrome.exe"
            className={inputClass}
          />
          <datalist id="override-apps">
            {app.recentApps.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <Button kind="primary" disabled={!newExe.trim()} onClick={addOverride}>
            Add
          </Button>
        </div>
      </Card>
    </div>
  )
}
