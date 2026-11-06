import { useState } from 'react'
import { PROGRAMMABLE_BUTTONS } from '../../shared/types'
import { AdvancedTab } from './components/AdvancedTab'
import { BatteryTab } from './components/BatteryTab'
import { ButtonsTab } from './components/ButtonsTab'
import { DiagnosticsTab } from './components/DiagnosticsTab'
import { Header } from './components/Header'
import { LightingTab } from './components/LightingTab'
import { PerformanceTab } from './components/PerformanceTab'
import { ProfilesTab } from './components/ProfilesTab'
import { SettingsTab } from './components/SettingsTab'
import { ShortcutsTab } from './components/ShortcutsTab'
import { Button } from './components/ui'
import { useAppState } from './useAppState'
import { useDevice } from './useDevice'

const TABS = [
  { id: 'performance', label: 'Performance' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'battery', label: 'Battery' },
  { id: 'settings', label: 'Settings' },
  { id: 'diagnostics', label: 'Diagnostics' }
] as const
type TabId = (typeof TABS)[number]['id']

export default function App() {
  const d = useDevice()
  const appModel = useAppState(d.notify)
  const [tab, setTab] = useState<TabId>('performance')
  const s = d.state
  const ready = s?.status === 'connected' && s.mouseResponding && !!d.draftConfig && !!d.draftButtons
  const locked = !ready || d.applying || !!s?.busy
  const wired = s?.identity?.mode === 'wired'
  const needsDevice = tab === 'performance' || tab === 'buttons' || tab === 'lighting' || tab === 'advanced'

  return (
    <div className="flex h-full flex-col">
      <Header
        state={s}
        busy={d.applying || !!s?.busy}
        onRefresh={() => void d.run(() => window.evofox.device.refresh())}
        onToggleMock={(v) => void d.run(() => window.evofox.device.setMockEnabled(v))}
      />

      <div className="flex min-h-0 flex-1">
        <nav className="w-52 shrink-0 border-r border-line bg-panel px-3 py-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${
                tab === t.id ? 'bg-panel-2 font-medium text-text' : 'text-muted hover:text-text'
              }`}
            >
              {t.label}
              {((t.id === 'buttons' && d.buttonsDirty) || ((t.id === 'performance' || t.id === 'lighting' || t.id === 'advanced') && d.configDirty)) && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Unsaved changes" />
              )}
            </button>
          ))}
          <p className="mt-6 px-3 text-[11px] leading-relaxed text-muted">Unofficial tool. Not affiliated with Amkette or EvoFox.</p>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-6 pb-28">
            {s?.message && (
              <div className={`mb-5 rounded-lg border px-4 py-3 text-[13px] ${s.status === 'error' ? 'border-bad/40 bg-bad/10' : 'border-warn/40 bg-warn/10'}`}>
                {s.message}
              </div>
            )}

            {needsDevice && !ready ? (
              <EmptyState status={s?.status} responding={!!s?.mouseResponding} />
            ) : (
              <>
                {tab === 'performance' && d.draftConfig && (
                  <PerformanceTab config={d.draftConfig} update={d.updateConfig} wired={wired} disabled={locked} />
                )}
                {tab === 'lighting' && d.draftConfig && <LightingTab config={d.draftConfig} update={d.updateConfig} disabled={locked} />}
                {tab === 'advanced' && d.draftConfig && <AdvancedTab config={d.draftConfig} update={d.updateConfig} wired={wired} disabled={locked} />}
                {tab === 'buttons' && d.draftButtons && (
                  <ButtonsTab
                    buttons={d.draftButtons}
                    fixed={s?.keys?.slice(PROGRAMMABLE_BUTTONS) ?? []}
                    update={d.updateButton}
                    disabled={locked}
                    powerActions={appModel.app?.settings.powerKeys ?? null}
                  />
                )}
                {tab === 'shortcuts' && <ShortcutsTab appModel={appModel} keys={d.draftButtons} notify={d.notify} />}
                {tab === 'settings' && <SettingsTab appModel={appModel} />}
                {tab === 'battery' && <BatteryTab state={s} />}
                {tab === 'profiles' && (
                  <ProfilesTab
                    config={d.draftConfig}
                    buttons={d.draftButtons}
                    canApply={!locked}
                    dirty={d.dirty}
                    run={d.run}
                    notify={d.notify}
                    windowsPointer={appModel.app?.windowsPointer ?? null}
                  />
                )}
                {tab === 'diagnostics' && <DiagnosticsTab state={s} log={d.log} canApply={!locked} run={d.run} notify={d.notify} />}
              </>
            )}
          </div>
        </main>
      </div>

      {d.dirty && ready && (
        <div className="fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-line bg-panel-2 px-5 py-3 shadow-2xl shadow-black/50">
          <div className="text-[13px]">
            {d.errors.length ? <span className="text-bad">{d.errors[0]}</span> : <span>You have changes that aren't on the mouse yet.</span>}
          </div>
          <Button kind="ghost" onClick={d.discard} disabled={d.applying}>
            Discard
          </Button>
          <Button kind="primary" onClick={() => void d.apply()} disabled={d.applying || d.errors.length > 0}>
            {d.applying ? 'Applying…' : 'Apply to mouse'}
          </Button>
        </div>
      )}

      <div className="pointer-events-none fixed right-5 top-20 z-20 flex w-96 flex-col gap-2">
        {d.toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`rounded-lg border px-4 py-3 text-[13px] shadow-xl shadow-black/40 ${t.ok ? 'border-ok/40 bg-panel-2' : 'border-bad/50 bg-panel-2'}`}
          >
            <span className={t.ok ? 'text-ok' : 'text-bad'}>{t.ok ? '✓ ' : '✕ '}</span>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ status, responding }: { status?: string; responding: boolean }) {
  const [title, body] =
    status === 'connected' && !responding
      ? ['Waiting for the mouse', 'The receiver is plugged in but the mouse is not answering. Move or click it to wake it up.']
      : status === 'connecting'
        ? ['Connecting…', 'Reading settings from the mouse.']
        : status === 'error'
          ? ['Could not open the mouse', 'See the message above. You can also try the demo device from the top bar.']
          : ['Plug in your EvoFox Shadow X Pro', 'Connect the USB receiver or the charging cable. The mouse is detected automatically. No receiver handy? Turn on “Demo device” in the top bar.']
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line px-8 py-20 text-center">
      <div className="mb-4 h-14 w-9 rounded-full border-2 border-muted/60" />
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-[13px] text-muted">{body}</p>
    </div>
  )
}
