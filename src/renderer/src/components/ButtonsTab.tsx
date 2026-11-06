import {
  ACTION_GROUPS,
  KEY_TYPE,
  KEYBOARD_KEYS,
  MODIFIERS,
  describeBinding,
  describePowerAction,
  keyboardBinding,
  powerKeyBinding,
  powerKeyOf,
  sameBinding
} from '../../../shared/keymap'
import { BUTTON_NAMES, KeyBinding, POWER_KEYS, PowerAction, PowerKey, PROGRAMMABLE_BUTTONS } from '../../../shared/types'
import { useState } from 'react'
import { MouseDiagram } from './MouseDiagram'
import { Card, Select } from './ui'

const CUSTOM = 'custom'
const CURRENT = 'current'

function selectionOf(b: KeyBinding): string {
  const power = powerKeyOf(b)
  if (power) return `power:${power}`
  for (const [gi, g] of ACTION_GROUPS.entries()) {
    const ai = g.actions.findIndex((a) => sameBinding(a.binding, b))
    if (ai >= 0) return `${gi}:${ai}`
  }
  return b.type === KEY_TYPE.KEYBOARD ? CUSTOM : CURRENT
}

type PowerActions = Record<PowerKey, PowerAction> | null

function ButtonRow({
  index,
  binding,
  onChange,
  disabled,
  powerActions,
  active,
  onHover
}: {
  index: number
  binding: KeyBinding
  onChange: (b: KeyBinding) => void
  disabled: boolean
  powerActions: PowerActions
  active: boolean
  onHover: (i: number | null) => void
}) {
  const sel = selectionOf(binding)
  const isLeft = index === 0
  const power = powerKeyOf(binding)

  const choose = (v: string) => {
    if (v === CUSTOM) return onChange(keyboardBinding(0, 0x04))
    if (v === CURRENT) return
    if (v.startsWith('power:')) return onChange(powerKeyBinding(v.slice(6) as PowerKey))
    const [gi, ai] = v.split(':').map(Number)
    onChange(ACTION_GROUPS[gi].actions[ai].binding)
  }

  return (
    <div
      id={`button-row-${index}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      className={`-mx-2 border-t border-line px-2 py-3 transition-colors first:border-t-0 ${active ? 'rounded-lg bg-accent-soft' : ''}`}
    >
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="text-[14px]">{BUTTON_NAMES[index]}</div>
          <div className="text-[12px] text-muted">
            {describeBinding(binding)}
            {power && powerActions && <span className="text-accent"> → {describePowerAction(powerActions[power])}</span>}
          </div>
        </div>
        {isLeft ? (
          <span className="w-64 text-right text-[12px] text-muted">Always left click (can't be changed)</span>
        ) : (
        <Select value={sel} disabled={disabled} onChange={choose} className="w-64">
          {sel === CURRENT && <option value={CURRENT}>{describeBinding(binding)}</option>}
          {ACTION_GROUPS.map((g, gi) => (
            <optgroup key={g.group} label={g.group}>
              {g.actions.map((a, ai) => (
                <option key={a.label} value={`${gi}:${ai}`}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Keyboard">
            <option value={CUSTOM}>Key or key combination…</option>
          </optgroup>
          <optgroup label="Power keys (action set in Shortcuts tab)">
            {POWER_KEYS.map((pk) => (
              <option key={pk} value={`power:${pk}`}>
                Power key {pk}
                {powerActions ? ` — ${describePowerAction(powerActions[pk])}` : ''}
              </option>
            ))}
          </optgroup>
        </Select>
        )}
      </div>

      {sel === CUSTOM && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-panel-2 px-3 py-2.5">
          {MODIFIERS.map((m) => {
            const on = (binding.code1 & m.bit) !== 0
            return (
              <button
                key={m.bit}
                disabled={disabled}
                onClick={() => onChange(keyboardBinding(on ? binding.code1 & ~m.bit : binding.code1 | m.bit, binding.code2))}
                className={`rounded-md border px-2.5 py-1 text-[12px] ${on ? 'border-accent bg-accent-soft text-text' : 'border-line text-muted'}`}
              >
                {m.label}
              </button>
            )
          })}
          <span className="text-muted">+</span>
          <Select value={binding.code2} disabled={disabled} onChange={(v) => onChange(keyboardBinding(binding.code1, Number(v)))}>
            {KEYBOARD_KEYS.map((k) => (
              <option key={k.usage} value={k.usage}>
                {k.label}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  )
}

export function ButtonsTab({
  buttons,
  fixed,
  update,
  disabled,
  powerActions
}: {
  buttons: KeyBinding[]
  fixed: KeyBinding[]
  update: (index: number, b: KeyBinding) => void
  disabled: boolean
  powerActions: PowerActions
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const highlight = hover ?? selected
  const select = (i: number) => {
    setSelected(i)
    const row = document.getElementById(`button-row-${i}`)
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    row?.querySelector('select')?.focus({ preventScroll: true })
  }

  return (
    <div className="space-y-5">
      <Card title="Your mouse" description="Click a button on the drawing to change it.">
        <MouseDiagram
          bindings={[...buttons, ...fixed]}
          powerActions={powerActions}
          highlight={highlight}
          onHover={setHover}
          onSelect={select}
        />
      </Card>
      <Card
        title="Programmable buttons"
        description="Assign an action to each button. Changes are stored on the mouse, so they work on any PC. Power keys only work while this app is running."
      >
        {buttons.map((b, i) => (
          <ButtonRow
            key={i}
            index={i}
            binding={b}
            disabled={disabled}
            powerActions={powerActions}
            active={highlight === i}
            onHover={setHover}
            onChange={(nb) => update(i, nb)}
          />
        ))}
      </Card>
      <Card title="Fixed controls" badge="read-only" description="These can't be reassigned on this mouse.">
        {fixed.map((b, i) => (
          <div
            key={i}
            id={`button-row-${PROGRAMMABLE_BUTTONS + i}`}
            onMouseEnter={() => setHover(PROGRAMMABLE_BUTTONS + i)}
            onMouseLeave={() => setHover(null)}
            className={`-mx-2 flex justify-between border-t border-line px-2 py-2.5 text-[13px] transition-colors first:border-t-0 ${
              highlight === PROGRAMMABLE_BUTTONS + i ? 'rounded-lg bg-accent-soft' : ''
            }`}
          >
            <span>{BUTTON_NAMES[PROGRAMMABLE_BUTTONS + i]}</span>
            <span className="text-muted">{describeBinding(b)}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}
