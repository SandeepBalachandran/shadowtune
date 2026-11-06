import { ReactNode } from 'react'

export function Card({ title, description, children, badge }: { title: string; description?: string; children: ReactNode; badge?: string }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {badge && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-muted">{badge}</span>}
        </div>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </header>
      {children}
    </section>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[14px]">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-[13px] transition-colors disabled:opacity-50 ${
            o.value === value ? 'bg-accent font-medium text-white' : 'text-muted hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  suffix,
  disabled,
  width = 'w-56'
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** Called once when the user lets go of the slider (or uses the keyboard). */
  onCommit?: (v: number) => void
  suffix?: string
  disabled?: boolean
  width?: string
}) {
  const commit = (e: { currentTarget: HTMLInputElement }) => onCommit?.(Number(e.currentTarget.value))
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className={width}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span className="w-16 text-right tabular-nums text-[13px]">
        {value}
        {suffix && <span className="text-muted"> {suffix}</span>}
      </span>
    </div>
  )
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Button({
  kind = 'secondary',
  children,
  onClick,
  disabled,
  title
}: {
  kind?: ButtonKind
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
}) {
  const styles: Record<ButtonKind, string> = {
    primary: 'bg-accent text-white hover:brightness-110',
    secondary: 'border border-line bg-panel-2 hover:border-muted',
    danger: 'border border-bad/50 text-bad hover:bg-bad/10',
    ghost: 'text-muted hover:text-text'
  }
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[kind]}`}
    >
      {children}
    </button>
  )
}

export function Select({
  value,
  onChange,
  children,
  disabled,
  className = ''
}: {
  value: string | number
  onChange: (v: string) => void
  children: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] outline-none focus:border-accent disabled:opacity-50 ${className}`}
    >
      {children}
    </select>
  )
}
