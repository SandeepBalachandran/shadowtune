import { useEffect, useMemo, useRef, useState } from 'react'
import { BatteryReport, BatterySample, DeviceState } from '../../../shared/types'
import { Card } from './ui'

const W = 680
const H = 220
const PAD = { l: 36, r: 12, t: 12, b: 26 }
const GAP_MS = 3 * 3_600_000
const DAY = 24 * 3_600_000

function formatLeft(hours: number): string {
  if (hours >= 48) return `about ${Math.round(hours / 24)} days`
  if (hours >= 1) return `about ${Math.round(hours)} hours`
  return 'less than an hour'
}

/** Splits samples into continuous runs (gaps over 3 h break the line). */
function runs(samples: BatterySample[]): BatterySample[][] {
  const out: BatterySample[][] = []
  for (const s of samples) {
    const cur = out[out.length - 1]
    if (cur && s.ts - cur[cur.length - 1].ts <= GAP_MS) cur.push(s)
    else out.push([s])
  }
  return out
}

function Chart({ samples }: { samples: BatterySample[] }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<BatterySample | null>(null)
  const now = Date.now()
  const t0 = Math.min(samples[0]?.ts ?? now, now - DAY)
  const x = (ts: number) => PAD.l + ((ts - t0) / (now - t0)) * (W - PAD.l - PAD.r)
  const y = (p: number) => PAD.t + (1 - p / 100) * (H - PAD.t - PAD.b)

  const segments = useMemo(() => runs(samples), [samples])
  const charging = useMemo(() => {
    const bands: [number, number][] = []
    samples.forEach((s, i) => {
      if (!s.charging) return
      const next = samples[i + 1]
      const end = next && next.ts - s.ts <= GAP_MS ? next.ts : s.ts + 10 * 60_000
      const last = bands[bands.length - 1]
      if (last && s.ts - last[1] < 60_000) last[1] = end
      else bands.push([s.ts, end])
    })
    return bands
  }, [samples])

  const days = Math.ceil((now - t0) / DAY)
  const ticks = Array.from({ length: days + 1 }, (_, i) => now - i * DAY).filter((t) => t >= t0)

  const onMove = (e: React.MouseEvent) => {
    const svg = ref.current
    if (!svg || !samples.length) return
    const r = svg.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const ts = t0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (now - t0)
    let best = samples[0]
    for (const s of samples) if (Math.abs(s.ts - ts) < Math.abs(best.ts - ts)) best = s
    setHover(best)
  }

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Battery level over the last days"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 50, 100].map((p) => (
          <g key={p}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(p)} y2={y(p)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(p) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">
              {p}%
            </text>
          </g>
        ))}
        {charging.map(([a, b], i) => (
          <rect key={i} x={x(a)} y={PAD.t} width={Math.max(2, x(b) - x(a))} height={H - PAD.t - PAD.b} fill="var(--color-text)" opacity={0.06} />
        ))}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
            {t >= now - 60_000 ? 'now' : new Date(t).toLocaleDateString(undefined, { weekday: 'short' })}
          </text>
        ))}
        {segments.map((seg, i) =>
          seg.length === 1 ? (
            <circle key={i} cx={x(seg[0].ts)} cy={y(seg[0].percent)} r={2.5} fill="var(--color-accent)" />
          ) : (
            <polyline
              key={i}
              points={seg.map((s) => `${x(s.ts)},${y(s.percent)}`).join(' ')}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        )}
        {hover && (
          <g pointerEvents="none">
            <line x1={x(hover.ts)} x2={x(hover.ts)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-muted)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover.ts)} cy={y(hover.percent)} r={4.5} fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-[12px] shadow-lg"
          style={{ left: `min(calc(${(x(hover.ts) / W) * 100}% + 10px), calc(100% - 150px))` }}
        >
          <div className="font-medium tabular-nums">{hover.percent}%{hover.charging ? ' · charging' : ''}</div>
          <div className="text-muted">{new Date(hover.ts).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      )}
      <div className="mt-1 flex items-center gap-4 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm bg-text/10" /> charging
        </span>
        <span>Gaps = PC off or mouse asleep</span>
      </div>
    </div>
  )
}

export function BatteryTab({ state }: { state: DeviceState | null }) {
  const [report, setReport] = useState<BatteryReport | null>(null)
  useEffect(() => {
    const load = () => void window.evofox.app.batteryReport().then(setReport)
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [state?.battery?.percent, state?.battery?.charging])

  const b = state?.mouseResponding ? state.battery : null
  const left = report?.hoursLeft
  return (
    <div className="space-y-5">
      <Card title="Battery">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[12px] text-muted">Now</div>
            <div className="text-[28px] font-semibold tabular-nums">{b ? `${b.percent}%` : '—'}</div>
            <div className="text-[12px] text-muted">{b ? (b.charging ? 'Charging' : 'On battery') : 'Mouse not connected'}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Time left</div>
            <div className="text-[20px] font-semibold">{b?.charging ? 'Charging' : left != null ? formatLeft(left) : 'Learning…'}</div>
            <div className="text-[12px] text-muted">{left == null && !b?.charging ? 'Needs a few hours of use on battery' : 'Estimated from your recent use'}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Average use</div>
            <div className="text-[20px] font-semibold tabular-nums">
              {report?.drainPerHour != null ? `${report.drainPerHour < 1 ? report.drainPerHour.toFixed(1) : Math.round(report.drainPerHour)}% / hour` : '—'}
            </div>
            <div className="text-[12px] text-muted">while unplugged and awake</div>
          </div>
        </div>
      </Card>

      <Card title="Last 7 days" description="Recorded every 10 minutes while the app runs. Only read from the mouse — never written.">
        {report && report.samples.length > 0 ? (
          <Chart samples={report.samples} />
        ) : (
          <p className="text-[13px] text-muted">No history yet. Keep the app running (it lives in the tray) and check back later.</p>
        )}
      </Card>
    </div>
  )
}
