import { useEffect, useState } from 'react'
import { Card } from '../components/ui'
import { api } from '../api'
import { fmt, trendClass } from '../utils'

const CONDITIONS = [
  ['指数异动', '任一主要指数当日涨跌幅绝对值 ≥ 1.5%'],
  ['个股异动', '持仓个股当日涨跌幅绝对值 ≥ 5%'],
  ['跌破支撑', '现价低于近 20 日支撑位（筹码/均线支撑）'],
  ['亏损扩大', '持仓浮亏 ≤ -15%'],
  ['跌停偏多', '全市场跌停家数 ≥ 10 家'],
]

export default function Anomalies() {
  const [summary, setSummary] = useState<any>(null)
  const [state, setState] = useState<any>(null)
  useEffect(() => {
    Promise.all([
      api.get<any>('/api/portfolio/summary').catch(() => null),
      api.get<any>('/api/market/state').catch(() => null),
    ]).then(([s, st]) => { setSummary(s); setState(st) })
  }, [])

  const rows: { title: string; detail: string; tone: string }[] = []
  for (const i of state?.indices ?? []) {
    if (Math.abs(i.pct ?? 0) >= 1.5) rows.push({ title: `指数异动 · ${i.name}`, detail: `${fmt.price(i.price)}  ${fmt.pct(i.pct)}`, tone: (i.pct ?? 0) >= 0 ? 'up' : 'down' })
  }
  for (const p of summary?.positions ?? []) {
    if (Math.abs(p.pct ?? 0) >= 5) rows.push({ title: `个股异动 · ${p.name}`, detail: `今日 ${fmt.pct(p.pct)} · 持仓 ${p.qty} 股`, tone: (p.pct ?? 0) >= 0 ? 'up' : 'down' })
    if (p.price && p.support && p.price < p.support) rows.push({ title: `跌破支撑 · ${p.name}`, detail: `现价 ${fmt.price(p.price)} < 支撑 ${fmt.price(p.support)}`, tone: 'up' })
    if ((p.float_pct ?? 0) <= -15) rows.push({ title: `亏损扩大 · ${p.name}`, detail: `浮亏 ${fmt.pct(p.float_pct)}`, tone: 'up' })
  }
  if ((state?.breadth?.limit_down ?? 0) >= 10) rows.push({ title: '跌停家数偏多', detail: `当前跌停 ${state.breadth.limit_down} 家`, tone: 'down' })

  return (
    <div>
      <Card title="异常提醒" desc="触发条件与当前命中">
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div>
            {CONDITIONS.map(([t, d]) => (
              <div key={t} className="row-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <b className="small">{t}</b><span className="muted small" style={{ textAlign: 'right', maxWidth: 280 }}>{d}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="muted small" style={{ marginBottom: 6 }}>当前命中 {rows.length} 条</div>
            {rows.length === 0 && <div className="muted small">暂无异常，持仓与市场暂未触发条件。</div>}
            {rows.map((r, i) => (
              <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="small"><span className={r.tone}>●</span> {r.title}</div>
                <div className="muted small">{r.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
