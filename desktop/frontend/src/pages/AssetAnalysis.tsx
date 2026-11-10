import { useEffect, useState } from 'react'
import { Card, Kpi, StatLine } from '../components/ui'
import { api } from '../api'
import { fmt } from '../utils'

export default function AssetAnalysis() {
  const [summary, setSummary] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    Promise.all([api.get<any>('/api/portfolio/summary'), api.get<any>('/api/portfolio/analytics').catch(() => null)])
      .then(([s, a]) => { setSummary(s); setData(a) })
  }, [])

  const total = Math.max(summary?.total ?? 1, 1)
  const positions = summary?.positions ?? []
  const cashPct = (summary?.cash ?? 0) / total * 100
  const maxWeight = Math.max(0, ...positions.map((p: any) => p.weight ?? 0))
  const metrics = data?.metrics ?? {}
  const stats = data?.trade_stats ?? {}
  const top = [...positions].sort((a: any, b: any) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 5)

  const habits: string[] = []
  habits.push(cashPct > 40 ? `现金占比 ${cashPct.toFixed(1)}%，偏防御，等待更明确的机会。` : cashPct < 10 ? `现金仅 ${cashPct.toFixed(1)}%，仓位偏满，需保留应对波动的余地。` : `现金占比 ${cashPct.toFixed(1)}%，仓位中性。`)
  habits.push(maxWeight > 40 ? `第一大持仓权重 ${maxWeight.toFixed(1)}%，集中度偏高，单票波动会显著影响账户。` : `第一大持仓权重 ${maxWeight.toFixed(1)}%，集中度可控。`)
  if (stats.win_rate != null) habits.push(`已平仓胜率 ${(stats.win_rate * 100).toFixed(1)}%，盈亏比 ${stats.profit_factor ? stats.profit_factor.toFixed(2) : '--'}，${stats.win_rate >= 0.5 ? '胜率尚可，重点控制单笔亏损。' : '胜率偏低，减少追高与频繁试错。'}`)
  if ((summary?.trade_count ?? 0) > 30) habits.push(`累计 ${summary.trade_count} 笔交易，频率偏高；可把操作集中到少数高确定性机会。`)
  else habits.push(`累计 ${summary?.trade_count ?? 0} 笔交易，节奏偏克制。`)

  return (
    <div>
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Kpi label="总资产" value={`¥${fmt.money(summary?.total)}`} />
        <Kpi label="可用现金占比" value={`${cashPct.toFixed(1)}%`} />
        <Kpi label="最大回撤" value={fmt.pct(metrics.max_drawdown)} color="var(--down)" />
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="资金分配" desc="现金 / 持仓权重">
          <div className="alloc-bar">
            <i style={{ width: `${cashPct}%`, background: '#8d968f' }} />
            {positions.map((p: any, i: number) => (
              <i key={p.code} style={{ width: `${p.weight ?? 0}%`, background: ['#F2C94C', '#55D6C2', '#B08CFF', '#FF8A5C', '#6EA8FF'][i % 5] }} />
            ))}
          </div>
          <StatLine k="现金" v={`¥${fmt.money(summary?.cash)} · ${cashPct.toFixed(1)}%`} />
          {top.map((p: any) => <StatLine key={p.code} k={`${p.name} ${p.code}`} v={`${(p.weight ?? 0).toFixed(1)}%`} />)}
        </Card>
        <Card title="交易偏好与习惯" desc="自动总结，不构成投资建议">
          {habits.map((h, i) => <div key={i} className="small" style={{ lineHeight: 1.9, color: 'var(--text-sub)' }}>· {h}</div>)}
        </Card>
      </div>
      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <Card title="收益趋势" desc="净值化 · 双基准">
          <StatLine k="累计收益" v={fmt.pct(metrics.total_return)} />
          <StatLine k="年化收益" v={fmt.pct(metrics.annual_return)} />
          <StatLine k="夏普比率" v={metrics.sharpe?.toFixed(2) ?? '--'} />
          <StatLine k="卡玛比率" v={metrics.calmar?.toFixed(2) ?? '--'} />
          <StatLine k="超额收益" v={fmt.pct(metrics.excess_return)} />
        </Card>
        <Card title="月度收益" desc="按自然月">
          {(data?.monthly ?? []).slice(-8).reverse().map((m: any) => (
            <div key={m.month} className="row-between" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="muted small">{m.month}</span><b className={m.ret >= 0 ? 'up' : 'down'}>{fmt.pct(m.ret)}</b>
            </div>
          ))}
          {!(data?.monthly ?? []).length && <div className="muted small">暂无月度数据。</div>}
        </Card>
      </div>
    </div>
  )
}
