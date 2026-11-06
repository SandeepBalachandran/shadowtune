// Top-down drawing of the mouse with callouts showing what each button does.
// Our own illustration (the official configurator shows a static product photo) — every part
// is clickable and lights up together with its row in the list below.

import { describeBinding, describePowerAction, powerKeyOf } from '../../../shared/keymap'
import { BUTTON_NAMES, KeyBinding, PowerAction, PowerKey, PROGRAMMABLE_BUTTONS } from '../../../shared/types'

const OX = 240 // mouse drawing offset inside the 680×340 canvas
const OY = 10
const BODY = 'M100 8 C150 8 172 40 176 110 C180 200 170 312 100 312 C30 312 20 200 24 110 C28 40 50 8 100 8 Z'

type Side = 'left' | 'right'
interface Callout {
  index: number
  anchor: [number, number] // in mouse coordinates
  side: Side
  y: number // label row in canvas coordinates
}

const CALLOUTS: Callout[] = [
  { index: 0, anchor: [55, 70], side: 'left', y: 50 },
  { index: 4, anchor: [17, 157], side: 'left', y: 150 },
  { index: 3, anchor: [17, 197], side: 'left', y: 235 },
  { index: 1, anchor: [145, 70], side: 'right', y: 50 },
  { index: 2, anchor: [100, 62], side: 'right', y: 125 },
  { index: 5, anchor: [100, 113], side: 'right', y: 200 }
]

function clip(s: string, n = 30) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function MouseDiagram({
  bindings,
  powerActions,
  highlight,
  onHover,
  onSelect
}: {
  bindings: KeyBinding[] // all 8 slots (programmable + fixed)
  powerActions: Record<PowerKey, PowerAction> | null
  highlight: number | null
  onHover: (i: number | null) => void
  onSelect: (i: number) => void
}) {
  const label = (i: number) => {
    const b = bindings[i]
    if (!b) return '—'
    const pk = powerKeyOf(b)
    if (pk && powerActions) return clip(describePowerAction(powerActions[pk]))
    return clip(describeBinding(b))
  }
  const on = (i: number) => highlight === i
  const part = (i: number) => ({
    className: 'cursor-pointer transition-colors',
    fill: on(i) ? 'var(--color-accent-soft)' : 'transparent',
    stroke: on(i) ? 'var(--color-accent)' : 'none',
    strokeWidth: 1.5,
    onMouseEnter: () => onHover(i),
    onMouseLeave: () => onHover(null),
    onClick: () => onSelect(i)
  })

  return (
    <svg viewBox="0 0 680 340" className="w-full select-none" role="img" aria-label="Mouse buttons and their actions">
      <defs>
        <linearGradient id="md-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-panel-2)" />
          <stop offset="1" stopColor="var(--color-bg)" />
        </linearGradient>
        <clipPath id="md-clip">
          <path d={BODY} />
        </clipPath>
      </defs>

      {/* leader lines and labels */}
      {CALLOUTS.map((c) => {
        const ax = OX + c.anchor[0]
        const ay = OY + c.anchor[1]
        const edge = c.side === 'left' ? 205 : 475
        const elbow = c.side === 'left' ? edge + 14 : edge - 14
        const color = on(c.index) ? 'var(--color-accent)' : 'var(--color-line)'
        const fixed = c.index >= PROGRAMMABLE_BUTTONS
        return (
          <g
            key={c.index}
            className="cursor-pointer"
            onMouseEnter={() => onHover(c.index)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(c.index)}
          >
            <polyline points={`${ax},${ay} ${elbow},${c.y} ${edge},${c.y}`} fill="none" stroke={color} strokeWidth={1.5} />
            <text
              x={c.side === 'left' ? edge - 8 : edge + 8}
              y={c.y - 6}
              textAnchor={c.side === 'left' ? 'end' : 'start'}
              fontSize={11}
              fill="var(--color-muted)"
            >
              {BUTTON_NAMES[c.index]}
              {fixed ? ' · fixed' : ''}
            </text>
            <text
              x={c.side === 'left' ? edge - 8 : edge + 8}
              y={c.y + 11}
              textAnchor={c.side === 'left' ? 'end' : 'start'}
              fontSize={13}
              fontWeight={on(c.index) ? 600 : 400}
              fill={on(c.index) ? 'var(--color-accent)' : 'var(--color-text)'}
            >
              {label(c.index)}
            </text>
          </g>
        )
      })}

      <g transform={`translate(${OX} ${OY})`}>
        {/* side buttons sit on the thumb (left) side */}
        <rect x={10} y={140} width={16} height={34} rx={7} fill="var(--color-panel-2)" stroke="var(--color-line)" />
        <rect x={10} y={180} width={16} height={34} rx={7} fill="var(--color-panel-2)" stroke="var(--color-line)" />

        <path d={BODY} fill="url(#md-body)" stroke="var(--color-line)" strokeWidth={1.5} />

        <g clipPath="url(#md-clip)">
          {/* left / right buttons */}
          <rect x={0} y={0} width={99} height={136} {...part(0)} />
          <rect x={101} y={0} width={99} height={136} {...part(1)} />
          <line x1={100} y1={8} x2={100} y2={136} stroke="var(--color-line)" strokeWidth={1.5} />
          <path d="M20 136 Q100 150 180 136" fill="none" stroke="var(--color-line)" strokeWidth={1.5} />
          {/* palm accent stripe */}
          <path d="M70 250 Q100 262 130 250" fill="none" stroke="var(--color-accent)" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />
        </g>

        {/* scroll wheel */}
        <rect x={90} y={36} width={20} height={52} rx={9} fill="var(--color-bg)" stroke="var(--color-line)" />
        {[46, 54, 62, 70, 78].map((y) => (
          <line key={y} x1={94} y1={y} x2={106} y2={y} stroke="var(--color-line)" strokeWidth={1.5} />
        ))}
        <rect x={90} y={36} width={20} height={52} rx={9} {...part(2)} />

        {/* DPI button */}
        <rect x={91} y={104} width={18} height={18} rx={5} fill="var(--color-bg)" stroke="var(--color-line)" />
        <rect x={91} y={104} width={18} height={18} rx={5} {...part(5)} />

        {/* side button hit areas on top so they stay clickable */}
        <rect x={10} y={140} width={16} height={34} rx={7} {...part(4)} />
        <rect x={10} y={180} width={16} height={34} rx={7} {...part(3)} />
      </g>

      {/* anchor dots on top of the drawing */}
      {CALLOUTS.map((c) => (
        <circle
          key={c.index}
          cx={OX + c.anchor[0]}
          cy={OY + c.anchor[1]}
          r={3.5}
          pointerEvents="none"
          fill={on(c.index) ? 'var(--color-accent)' : 'var(--color-muted)'}
        />
      ))}
    </svg>
  )
}
