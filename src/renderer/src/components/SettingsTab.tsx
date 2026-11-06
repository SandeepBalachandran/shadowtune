import { useEffect, useState } from 'react'
import { AUTO_SWITCH_LIMITS, AppRule, AppSettings, Profile, WindowsPointerSettings } from '../../../shared/types'
import { AppModel } from '../useAppState'
import { Button, Card, Row, Select, Slider, Toggle } from './ui'

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

/** Windows' own pointer settings — changes apply to the PC immediately, not to the mouse. */
function WindowsPointerCard({ appModel }: { appModel: AppModel }) {
  const w = appModel.app?.windowsPointer
  const [draft, setDraft] = useState<WindowsPointerSettings | null>(w ?? null)
  useEffect(() => setDraft(w ?? null), [w?.pointerSpeed, w?.enhancePrecision, w?.scrollLines])
  if (!draft) return null

  const apply = async (next: WindowsPointerSettings) => {
    setDraft(next)
    const r = await window.evofox.app.setWindowsPointer(next)
    if (!r.ok) appModel.notify(r)
  }

  return (
    <Card
      title="Windows pointer settings"
      description="The same options as Windows Settings → Mouse. They change this PC, not the mouse, and can be saved into profiles."
    >
      <Row label="Pointer speed" hint="Windows default is 10.">
        <Slider value={draft.pointerSpeed} min={1} max={20} onChange={(v) => setDraft({ ...draft, pointerSpeed: v })} onCommit={(v) => void apply({ ...draft, pointerSpeed: v })} />
      </Row>
      <Row label="Enhance pointer precision" hint="Mouse acceleration. Most gamers turn this off for consistent aim.">
        <Toggle label="Enhance pointer precision" checked={draft.enhancePrecision} onChange={(v) => void apply({ ...draft, enhancePrecision: v })} />
      </Row>
      <Row label="Lines per scroll" hint="Windows default is 3.">
        <Slider value={draft.scrollLines} min={1} max={20} onChange={(v) => setDraft({ ...draft, scrollLines: v })} onCommit={(v) => void apply({ ...draft, scrollLines: v })} />
      </Row>
    </Card>
  )
}

export function SettingsTab({ appModel }: { appModel: AppModel }) {
  const { app, save } = appModel
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [exe, setExe] = useState('')
  useEffect(() => void window.evofox.profiles.list().then(setProfiles), [])
  if (!app) return null

  const s = app.settings
  const auto = s.autoSwitch
  const setAuto = (patch: Partial<AppSettings['autoSwitch']>) => save({ ...s, autoSwitch: { ...auto, ...patch } })
  const setRule = (id: string, patch: Partial<AppRule>) => setAuto({ rules: auto.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  const addRule = (name: string) => {
    const clean = name.trim().toLowerCase()
    if (!clean || !profiles[0]) return
    const exeName = clean.endsWith('.exe') ? clean : `${clean}.exe`
    if (auto.rules.some((r) => r.exe === exeName)) return
    void setAuto({ rules: [...auto.rules, { id: newId(), exe: exeName, profileId: profiles[0].id }] })
    setExe('')
  }

  const st = app.autoSwitch
  const suggestions = app.recentApps.filter((a) => !auto.rules.some((r) => r.exe === a))

  return (
    <div className="space-y-5">
      <Card title="Startup">
        <Row
          label="Start with Windows"
          hint={
            app.isPackaged
              ? 'Starts quietly in the tray when you sign in, so power keys and battery alerts always work.'
              : 'Available in the installed app (not in development mode).'
          }
        >
          <Toggle
            label="Start with Windows"
            checked={s.launchAtStartup}
            disabled={!app.isPackaged}
            onChange={(v) => void save({ ...s, launchAtStartup: v }, false)}
          />
        </Row>
      </Card>

      <Card title="Tray & alerts" description="These only read from the mouse.">
        <Row label="Battery % on the tray icon" hint="Shows the number next to the clock; colour turns amber at 35 % and red at 15 %.">
          <Toggle label="Battery % on the tray icon" checked={s.trayBatteryIcon} onChange={(v) => void save({ ...s, trayBatteryIcon: v })} />
        </Row>
        <Row label="Tell me when fully charged" hint="A notification when the mouse reaches 100 % on the cable.">
          <Toggle label="Fully charged alert" checked={s.notifyFullyCharged} onChange={(v) => void save({ ...s, notifyFullyCharged: v })} />
        </Row>
        <Row label="DPI popup" hint="Shows the new DPI near the cursor when you press the DPI button on the mouse.">
          <Toggle label="DPI popup" checked={s.dpiPopup} onChange={(v) => void save({ ...s, dpiPopup: v })} />
        </Row>
      </Card>

      <WindowsPointerCard appModel={appModel} />

      <Card
        title="Profiles folder"
        description="Put your profiles in a folder that syncs (OneDrive, Dropbox, Google Drive) and they follow you to other PCs — point the app there on the new PC too."
      >
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-panel-2 px-3 py-2 text-[12px]" title={app.profilesPath}>
            {app.profilesPath}
          </code>
          <Button onClick={() => void window.evofox.app.openProfilesDir()}>Open</Button>
          <Button
            kind="primary"
            onClick={async () => {
              const dir = await window.evofox.app.chooseProfilesDir()
              if (dir) await save({ ...s, profilesDir: dir }, false)
            }}
          >
            Choose folder…
          </Button>
          {s.profilesDir && (
            <Button kind="ghost" onClick={() => void save({ ...s, profilesDir: null }, false)}>
              Use default
            </Button>
          )}
        </div>
        <p className="mt-2 text-[12px] text-muted">Changing the folder copies your profiles there and merges them with any already in it.</p>
      </Card>

      <Card
        title="Automatic profile switching"
        badge="off by default"
        description="Applies a saved profile when a program comes to the front — e.g. a game gets your gaming profile, everything else your work profile."
      >
        <Row label="Enable automatic switching">
          <Toggle label="Enable automatic switching" checked={auto.enabled} onChange={(v) => void setAuto({ enabled: v })} />
        </Row>

        <div className="mt-3 rounded-lg bg-panel-2 px-4 py-3 text-[12.5px] leading-relaxed text-muted">
          Each switch saves settings to the mouse's memory, which allows a limited number of writes. To protect it: nothing is written if the mouse
          already has the profile, a program must stay in front for {AUTO_SWITCH_LIMITS.dwellMs / 1000} s, and switching pauses after{' '}
          {AUTO_SWITCH_LIMITS.maxWritesPerDay} automatic changes per day.
          {auto.enabled && (
            <div className="mt-2 text-text">
              {st.activeProfileName ? `Active profile: ${st.activeProfileName}` : 'No profile applied yet'} · {st.writesToday} automatic change
              {st.writesToday === 1 ? '' : 's'} today
              {app.foregroundExe && <span className="text-muted"> · in front now: {app.foregroundExe}</span>}
            </div>
          )}
          {st.note && <div className={`mt-2 ${st.paused ? 'text-bad' : 'text-warn'}`}>{st.note}</div>}
        </div>

        {auto.enabled && (
          <div className="mt-4 space-y-4">
            {profiles.length === 0 ? (
              <p className="text-[13px] text-warn">Save at least one profile in the Profiles tab first.</p>
            ) : (
              <>
                <Row label="Other programs" hint="Profile for programs without a rule.">
                  <Select value={auto.defaultProfileId ?? ''} onChange={(v) => void setAuto({ defaultProfileId: v || null })} className="w-56">
                    <option value="">Leave the mouse as it is</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Row>

                <div>
                  <div className="mb-2 text-[14px]">Program rules</div>
                  {auto.rules.length === 0 && <p className="text-[13px] text-muted">No rules yet.</p>}
                  {auto.rules.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                      <span className="flex-1 truncate font-mono text-[13px]">{r.exe}</span>
                      <span className="text-muted">→</span>
                      <Select value={r.profileId} onChange={(v) => void setRule(r.id, { profileId: v })} className="w-56">
                        {!profiles.some((p) => p.id === r.profileId) && <option value={r.profileId}>(deleted profile)</option>}
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                      <Button kind="ghost" onClick={() => void setAuto({ rules: auto.rules.filter((x) => x.id !== r.id) })}>
                        Remove
                      </Button>
                    </div>
                  ))}

                  <div className="mt-3 flex gap-2">
                    <input
                      list="recent-apps"
                      value={exe}
                      onChange={(e) => setExe(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRule(exe)}
                      placeholder="Program, e.g. chrome.exe"
                      className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] outline-none focus:border-accent"
                    />
                    <datalist id="recent-apps">
                      {suggestions.map((a) => (
                        <option key={a} value={a} />
                      ))}
                    </datalist>
                    <Button kind="primary" disabled={!exe.trim()} onClick={() => addRule(exe)}>
                      Add rule
                    </Button>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="text-[12px] text-muted">Recently used:</span>
                      {suggestions.slice(0, 8).map((a) => (
                        <button key={a} onClick={() => addRule(a)} className="rounded-md border border-line px-2 py-0.5 font-mono text-[11.5px] text-muted hover:border-accent hover:text-text">
                          + {a}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
