import type { ReactNode } from 'react'

export function Card({
  title,
  desc,
  extra,
  children,
  pad = true,
  className = '',
  style,
}: {
  title?: ReactNode
  desc?: ReactNode
  extra?: ReactNode
  children?: ReactNode
  pad?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || extra) && (
        <div className="card-head">
          <div className="card-title">{title}</div>
          {desc && <div className="card-desc">{desc}</div>}
          {extra && <div style={{ marginLeft: 'auto' }}>{extra}</div>}
        </div>
      )}
      {pad ? <div className="card-body">{children}</div> : children}
    </div>
  )
}

export function Kpi({
  label,
  value,
  sub,
  color,
  icon,
  small,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  color?: string
  icon?: ReactNode
  small?: boolean
}) {
  return (
    <div className="card kpi">
      <div className="kpi-label">
        {icon}
        {label}
      </div>
      <div className={`kpi-value num ${small ? 'small' : ''}`} style={{ color }}>
        {value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function StatLine({ k, v, cls }: { k: ReactNode; v: ReactNode; cls?: string }) {
  return (
    <div className="stat-line">
      <span className="k">{k}</span>
      <span className={cls} style={{ fontWeight: 550 }}>
        {v}
      </span>
    </div>
  )
}

export function EmptyState({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div className="empty-box">
      <div style={{ fontSize: 30, opacity: 0.5 }}>{icon ?? '✦'}</div>
      <div>{text}</div>
    </div>
  )
}
