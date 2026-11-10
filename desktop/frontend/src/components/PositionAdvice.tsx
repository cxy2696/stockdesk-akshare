import { Tag } from 'antd'
import { Card } from './ui'

export default function PositionAdviceCard({ advice, title = '仓位管理推荐' }: { advice: any; title?: string }) {
  if (!advice) return null
  const cur = advice.current_pct ?? 0
  const low = advice.target_low ?? 0
  const high = advice.target_high ?? 0
  const tone = advice.action === '减仓' ? 'var(--up)' : advice.action === '加仓' ? 'var(--down)' : 'var(--accent)'
  return (
    <Card
      title={title}
      desc="市场温度 × 账户回撤 × 持仓集中度"
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={advice.action === '减仓' ? 'orange' : advice.action === '加仓' ? 'red' : 'blue'} style={{ margin: 0 }}>
            {advice.action} · {advice.urgency}
          </Tag>
          <span className="muted small">温度 {advice.score}</span>
        </div>
      }
    >
      <div className="pos-advice-top">
        <div className="pos-big">
          <span>当前仓位</span>
          <b style={{ color: tone }}>{cur.toFixed(1)}%</b>
        </div>
        <div className="pos-bar-wrap">
          <div className="pos-bar">
            <div className="pos-zone" style={{ left: `${low}%`, width: `${Math.max(high - low, 1)}%` }} />
            <div className="pos-marker" style={{ left: `${Math.min(99, Math.max(1, cur))}%` }} />
          </div>
          <div className="pos-labels">
            <span>0%</span>
            <span style={{ left: `${low}%` }}>{low}%</span>
            <span style={{ left: `${high}%` }}>{high}%</span>
            <span style={{ right: 0 }}>100%</span>
          </div>
        </div>
        <div className="pos-big">
          <span>建议仓位</span>
          <b>{low}%–{high}%</b>
        </div>
      </div>

      <div className="pos-metrics">
        <span>单票上限 <b>{advice.single_cap}%</b></span>
        <span>现金下限 <b>{advice.cash_floor}%</b></span>
        <span>仓位缺口 <b style={{ color: tone }}>{advice.gap > 0 ? '+' : ''}{advice.gap.toFixed(1)}pp</b></span>
        <span>市场状态 <b>{advice.regime}</b></span>
      </div>

      <div className="pos-reasons">
        {(advice.reasons ?? []).map((r: string, i: number) => <div key={i}>· {r}</div>)}
      </div>

      {(advice.warnings ?? []).length > 0 && (
        <div className="pos-warnings">
          {(advice.warnings ?? []).map((w: string, i: number) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      <div className="pos-actions">
        {(advice.actions ?? []).map((a: string, i: number) => (
          <div key={i} className="pos-action">{i + 1}. {a}</div>
        ))}
      </div>
    </Card>
  )
}
