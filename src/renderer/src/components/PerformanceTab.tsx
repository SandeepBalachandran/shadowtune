import { DPI_LIMITS, MouseConfig, POLLING_RATES } from '../../../shared/types'
import { Card, Row, Segmented } from './ui'

const STAGE_COLORS = ['#ff3b3b', '#3ccf7e', '#3d7bff', '#f2d23d', '#e8eaef']

const clampDpi = (v: number) => Math.min(DPI_LIMITS.max, Math.max(DPI_LIMITS.min, Math.round(v)))

export function PerformanceTab({
  config,
  update,
  wired,
  disabled
}: {
  config: MouseConfig
  update: (p: Partial<MouseConfig>) => void
  wired: boolean
  disabled: boolean
}) {
  const setStage = (i: number, dpi: number) => update({ dpiStages: config.dpiStages.map((d, j) => (j === i ? dpi : d)) })

  const setCount = (count: number) => {
    // Newly enabled stages may hold out-of-range leftovers; give them a sensible value.
    const stages = config.dpiStages.map((d, i) => (i < count && (d < DPI_LIMITS.min || d > DPI_LIMITS.max) ? DPI_LIMITS.max : d))
    update({ dpiCount: count, dpiStages: stages, activeDpiStage: Math.min(config.activeDpiStage, count - 1) })
  }

  return (
    <div className="space-y-5">
      <Card title="DPI stages" description="The DPI button on the mouse cycles through the enabled stages. Click a stage's dot to make it active now.">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-[13px] text-muted">Stages</span>
          <Segmented
            value={config.dpiCount}
            disabled={disabled}
            onChange={setCount}
            options={Array.from({ length: DPI_LIMITS.maxStages }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
          />
        </div>
        <div className="space-y-2">
          {config.dpiStages.slice(0, config.dpiCount).map((dpi, i) => {
            const active = i === config.activeDpiStage
            return (
              <div key={i} className={`flex items-center gap-4 rounded-lg border px-3 py-2.5 ${active ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                <button
                  aria-label={`Make stage ${i + 1} active`}
                  disabled={disabled}
                  onClick={() => update({ activeDpiStage: i })}
                  className="flex items-center gap-2"
                >
                  <span className="h-3 w-3 rounded-full ring-2 ring-offset-2 ring-offset-panel" style={{ background: STAGE_COLORS[i], ['--tw-ring-color' as string]: active ? STAGE_COLORS[i] : 'transparent' }} />
                  <span className="w-14 text-left text-[13px] text-muted">Stage {i + 1}</span>
                </button>
                <input
                  type="range"
                  className="flex-1"
                  min={DPI_LIMITS.min}
                  max={DPI_LIMITS.max}
                  step={DPI_LIMITS.sliderStep}
                  value={clampDpi(dpi)}
                  disabled={disabled}
                  onChange={(e) => setStage(i, Number(e.target.value))}
                />
                <input
                  type="number"
                  className="w-20 rounded-md border border-line bg-panel-2 px-2 py-1 text-right tabular-nums outline-none focus:border-accent"
                  min={DPI_LIMITS.min}
                  max={DPI_LIMITS.max}
                  step={1}
                  value={dpi}
                  disabled={disabled}
                  onChange={(e) => setStage(i, Number(e.target.value) || 0)}
                  onBlur={(e) => setStage(i, clampDpi(Number(e.target.value) || DPI_LIMITS.min))}
                />
                <span className="w-14 text-[12px] text-accent">{active ? 'active' : ''}</span>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="Responsiveness">
        <Row
          label="Polling rate"
          hint={wired ? 'Fixed at 1000 Hz while the mouse is on the cable.' : 'How often the mouse reports to the PC. Higher uses more battery.'}
        >
          {wired ? (
            <Segmented value={0} disabled onChange={() => undefined} options={[{ value: 0, label: '1000 Hz' }]} />
          ) : (
            <Segmented
              value={config.pollingRate}
              disabled={disabled}
              onChange={(v) => update({ pollingRate: v })}
              options={POLLING_RATES.map((hz, i) => ({ value: i, label: `${hz} Hz` }))}
            />
          )}
        </Row>
        <Row label="Scroll direction">
          <Segmented
            value={config.scrollDirection}
            disabled={disabled}
            onChange={(v) => update({ scrollDirection: v })}
            options={[
              { value: 0, label: 'Normal' },
              { value: 1, label: 'Reversed' }
            ]}
          />
        </Row>
      </Card>
    </div>
  )
}
