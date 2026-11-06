import { LIGHT_MODES, MouseConfig } from '../../../shared/types'
import { Card, Row, Select } from './ui'

export function LightingTab({ config, update, disabled }: { config: MouseConfig; update: (p: Partial<MouseConfig>) => void; disabled: boolean }) {
  return (
    <div className="space-y-5">
      <Card title="Lighting">
        <Row label="Effect" hint={config.lightMode === 6 ? 'Lighting is switched off completely.' : 'Choose “Off” to switch the lighting off completely.'}>
          <Select value={config.lightMode} disabled={disabled} onChange={(v) => update({ lightMode: Number(v) })} className="w-56">
            {LIGHT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Row>
      </Card>
    </div>
  )
}
