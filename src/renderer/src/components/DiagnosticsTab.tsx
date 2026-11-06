import { useEffect, useRef } from 'react'
import { DeviceState, LogEntry, OperationResult } from '../../../shared/types'
import { Button, Card } from './ui'

const KIND_STYLE: Record<LogEntry['kind'], string> = {
  tx: 'text-[#7aa7ff]',
  rx: 'text-ok',
  info: 'text-muted',
  warn: 'text-warn',
  error: 'text-bad'
}

const hex = (n: number) => `0x${n.toString(16).padStart(4, '0').toUpperCase()}`

export function DiagnosticsTab({
  state,
  log,
  canApply,
  run,
  notify
}: {
  state: DeviceState | null
  log: LogEntry[]
  canApply: boolean
  run: (op: () => Promise<OperationResult>) => Promise<OperationResult>
  notify: (r: OperationResult) => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [log.length])

  const copy = async () => {
    const text = log.map((e) => `${new Date(e.ts).toISOString()} ${e.kind.toUpperCase().padEnd(5)} ${e.text}`).join('\n')
    await navigator.clipboard.writeText(text)
    notify({ ok: true, message: 'Log copied to clipboard.' })
  }

  const restore = () => {
    if (window.confirm('Restore factory settings? DPI, polling, lighting, power options and all button assignments will be reset.')) {
      void run(() => window.evofox.device.restoreDefaults())
    }
  }

  const id = state?.identity
  const rows: [string, string][] = id
    ? [
        ['Product', id.product],
        ['Connection', id.mode === 'wired' ? 'USB cable' : '2.4 GHz receiver'],
        ['USB IDs', `VID ${hex(id.vendorId)} · PID ${hex(id.productId)}`],
        ['Source', id.source === 'mock' ? 'Demo device (no hardware)' : 'Hardware'],
        ['Firmware', state?.firmware ? `${state.firmware.version} (${state.firmware.build || 'build date unknown'})` : '—'],
        ['Firmware banner', state?.firmware?.banner || '—'],
        ['Mouse responding', state?.mouseResponding ? 'Yes' : 'No']
      ]
    : []

  return (
    <div className="space-y-5">
      <Card title="Device">
        {id ? (
          <dl className="selectable grid grid-cols-[160px_1fr] gap-y-2 text-[13px]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[13px] text-muted">No device connected.</p>
        )}
        <div className="mt-4 flex gap-2 border-t border-line pt-4">
          <Button kind="danger" disabled={!canApply} onClick={restore}>
            Restore factory settings
          </Button>
        </div>
      </Card>

      <Card title="Communication log" description="Every frame sent to (TX) and received from (RX) the mouse. Copy this when reporting a problem.">
        <div className="selectable h-80 overflow-auto rounded-lg bg-bg p-3 font-mono text-[11.5px] leading-relaxed">
          {log.length === 0 && <div className="text-muted">Nothing yet.</div>}
          {log.map((e, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              <span className="text-muted">{new Date(e.ts).toLocaleTimeString()} </span>
              <span className={KIND_STYLE[e.kind]}>{e.kind.toUpperCase().padEnd(5)}</span> {e.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="mt-3">
          <Button onClick={() => void copy()} disabled={log.length === 0}>
            Copy log
          </Button>
        </div>
      </Card>
    </div>
  )
}
