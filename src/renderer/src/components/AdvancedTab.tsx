import { DEBOUNCE_LIMITS, MouseConfig, SENSOR_FLAGS, SLEEP_LIMITS } from '../../../shared/types'
import { Card, Row, Segmented, Slider, Toggle } from './ui'

// These fields exist in the mouse's settings block, but the official configurator only shows
// them for other EvoFox models (G7 Pro / G3 V2 Pro). The Shadow X Pro stores them; whether it
// acts on them is unverified.
export function AdvancedTab({
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
  const never = config.sleepMinutes === 0
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] leading-relaxed">
        <strong className="font-semibold">Unverified settings.</strong> The official EvoFox app doesn't offer these for the Shadow X Pro — they come
        from the settings of other EvoFox mice. Your mouse saves them, but it may ignore some of them. If something behaves oddly, use{' '}
        <em>Diagnostics → Restore factory settings</em>.
      </div>

      <Card
        title="Power"
        description={wired ? 'Applies when you use the mouse wirelessly; it does not sleep on the cable.' : 'Idle time before the mouse sleeps in 2.4 GHz or Bluetooth mode.'}
      >
        <Row label="Sleep after" hint={never ? 'The mouse never sleeps — battery drains faster.' : undefined}>
          <div className="flex items-center gap-4">
            <Slider
              value={never ? 0 : config.sleepMinutes}
              min={1}
              max={SLEEP_LIMITS.max}
              suffix="min"
              disabled={disabled || never}
              onChange={(v) => update({ sleepMinutes: v })}
            />
            <label className="flex items-center gap-2 text-[13px] text-muted">
              Never
              <Toggle label="Never sleep" checked={never} disabled={disabled} onChange={(v) => update({ sleepMinutes: v ? 0 : 10 })} />
            </label>
          </div>
        </Row>
        <Row label="Wake up by">
          <Segmented
            value={config.wakeMode}
            disabled={disabled}
            onChange={(v) => update({ wakeMode: v })}
            options={[
              { value: 0, label: 'Clicking' },
              { value: 1, label: 'Moving' }
            ]}
          />
        </Row>
        <Row label="Lights while the mouse is moving" hint="“Dim while moving” switches the lights off only during movement — they come back when you stop.">
          <Segmented
            value={config.moveLightMode}
            disabled={disabled || config.lightMode === 6}
            onChange={(v) => update({ moveLightMode: v })}
            options={[
              { value: 0, label: 'Stay on' },
              { value: 1, label: 'Dim while moving' }
            ]}
          />
        </Row>
      </Card>

      <Card title="Response & sensor">
        <Row label="Key debounce" hint="Lower is faster; too low can cause accidental double-clicks.">
          <Slider value={config.debounceMs} min={DEBOUNCE_LIMITS.min} max={DEBOUNCE_LIMITS.max} suffix="ms" disabled={disabled} onChange={(v) => update({ debounceMs: v })} />
        </Row>
        <Row label="eSports mode" hint="Keeps sensor and controller fully awake. Faster response, shorter battery life.">
          <Toggle
            label="eSports mode"
            checked={(config.highspeedMode & 1) === 1}
            disabled={disabled}
            onChange={(v) => update({ highspeedMode: v ? config.highspeedMode | 1 : config.highspeedMode & ~1 })}
          />
        </Row>
        <Row label="Lift-off distance" hint={config.liftOffDistance === 0 ? 'Currently the device default (raw value 0).' : 'Height at which tracking stops when you lift the mouse.'}>
          <Segmented
            value={config.liftOffDistance}
            disabled={disabled}
            onChange={(v) => update({ liftOffDistance: v })}
            options={[
              ...(config.liftOffDistance === 0 ? [{ value: 0, label: 'Default' }] : []),
              { value: 1, label: '1 mm' },
              { value: 2, label: '2 mm' }
            ]}
          />
        </Row>
        {SENSOR_FLAGS.map((f) => (
          <Row key={f.bit} label={f.label} hint={f.tip}>
            <Toggle
              label={f.label}
              checked={(config.sensorFlags & f.bit) !== 0}
              disabled={disabled}
              onChange={(v) => update({ sensorFlags: v ? config.sensorFlags | f.bit : config.sensorFlags & ~f.bit })}
            />
          </Row>
        ))}
      </Card>
    </div>
  )
}
