import { DeviceState } from '../../../shared/types'
import { Button, Toggle } from './ui'

function statusInfo(s: DeviceState | null): { dot: string; text: string } {
  if (!s) return { dot: 'bg-muted', text: 'Starting…' }
  if (s.status === 'error') return { dot: 'bg-bad', text: 'Connection error' }
  if (s.status === 'searching') return { dot: 'bg-muted animate-pulse', text: 'Looking for your mouse…' }
  if (s.status === 'connecting') return { dot: 'bg-warn animate-pulse', text: 'Connecting…' }
  if (!s.mouseResponding) return { dot: 'bg-warn', text: 'Mouse asleep or off' }
  return { dot: 'bg-ok', text: 'Connected' }
}

function Battery({ percent, charging }: { percent: number; charging: boolean }) {
  const color = percent <= 15 ? 'bg-bad' : percent <= 35 ? 'bg-warn' : 'bg-ok'
  return (
    <div className="flex items-center gap-2" title={charging ? 'Charging' : 'On battery'}>
      <div className="relative h-3.5 w-7 rounded-[3px] border border-muted p-[2px]">
        <div className={`h-full rounded-[1px] ${color}`} style={{ width: `${Math.max(4, percent)}%` }} />
        <div className="absolute -right-[4px] top-[3px] h-1.5 w-[3px] rounded-r-sm bg-muted" />
      </div>
      <span className="tabular-nums text-[13px]">
        {percent}%{charging && <span className="text-ok"> ⚡</span>}
      </span>
    </div>
  )
}

export function Header({
  state,
  onRefresh,
  onToggleMock,
  busy
}: {
  state: DeviceState | null
  onRefresh: () => void
  onToggleMock: (v: boolean) => void
  busy: boolean
}) {
  const st = statusInfo(state)
  const id = state?.identity
  return (
    <header className="flex items-center gap-5 border-b border-line bg-panel px-6 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-[15px] font-bold text-white">S</div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">ShadowTune</div>
          <div className="text-[11px] text-muted">Shadow X Pro</div>
        </div>
      </div>

      <div className="mx-2 h-8 w-px bg-line" />

      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
          <span className="text-[13px]">{st.text}</span>
        </div>
        {id && (
          <div className="truncate text-[13px] text-muted">
            {id.source === 'mock' ? 'Demo device' : id.mode === 'wired' ? 'USB cable' : '2.4 GHz receiver'}
            {state?.firmware && ` · firmware ${state.firmware.version}`}
          </div>
        )}
        {state?.battery && state.mouseResponding && <Battery percent={state.battery.percent} charging={state.battery.charging} />}
      </div>

      <label className="flex items-center gap-2 text-[13px] text-muted">
        Demo device
        <Toggle label="Demo device" checked={!!state?.mockEnabled} onChange={onToggleMock} disabled={busy} />
      </label>
      <Button onClick={onRefresh} disabled={busy || state?.status !== 'connected'} title="Read all settings from the mouse again">
        Refresh
      </Button>
    </header>
  )
}
