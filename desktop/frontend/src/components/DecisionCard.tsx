import { Tag, Tooltip } from 'antd'
import { Card } from './ui'

const RATING_COLOR: Record<string, string> = { 好: 'red', 中: 'orange', 差: 'green' }
const TIER_COLOR: Record<string, string> = { 执行: 'red', 确认: 'orange', 预警: 'blue', 观察: 'default' }

export function RatingTag({ rating, action }: { rating?: string; action?: string }) {
  if (!rating) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Tag color={RATING_COLOR[rating] || 'default'} style={{ margin: 0, fontWeight: 600 }}>{rating}</Tag>
      {action && <span className="small" style={{ fontWeight: 550 }}>{action}</span>}
    </span>
  )
}

export function TierTag({ tier }: { tier?: string }) {
  if (!tier) return null
  return <Tag color={TIER_COLOR[tier] || 'default'} style={{ margin: 0 }}>{tier}</Tag>
}

export default function DecisionCard({ plan, compact = false }: { plan: any; compact?: boolean }) {
  if (!plan || !plan.rating) return null
  const zone = plan.buy_zone || []
  return (
    <Card
      title="交易决策 · 买卖点"
      desc="价格结构 + 均线 + 九转 + 资金 + 市场状态；不是下单指令"
      extra={<RatingTag rating={plan.rating} action={plan.action} />}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
        <div className="stat-line" style={{ display: 'block' }}>
          <div className="muted small">买入区间</div>
          <div className="num" style={{ fontWeight: 650 }}>{zone[0] ?? '--'} – {zone[1] ?? '--'}</div>
        </div>
        <div className="stat-line" style={{ display: 'block' }}>
          <div className="muted small">止损 / 目标</div>
          <div className="num" style={{ fontWeight: 650 }}>{plan.stop ?? '--'} / {plan.target ?? '--'}</div>
        </div>
        <div className="stat-line" style={{ display: 'block' }}>
          <div className="muted small">盈亏比</div>
          <div className="num" style={{ fontWeight: 650 }}>{plan.risk_reward ?? '--'}</div>
        </div>
        <div className="stat-line" style={{ display: 'block' }}>
          <div className="muted small">层级</div>
          <div style={{ fontWeight: 650 }}><TierTag tier={plan.tier} /> <span className="muted small">{plan.tier_text}</span></div>
        </div>
      </div>
      {!compact && (
        <div className="grid-2" style={{ gap: 14 }}>
          <div>
            <div className="muted small" style={{ marginBottom: 4 }}>为什么是这个判断</div>
            <div className="small" style={{ lineHeight: 1.8 }}>
              {(plan.reasons || []).map((x: string, i: number) => <div key={i}>· {x}</div>)}
            </div>
          </div>
          <div>
            <div className="muted small" style={{ marginBottom: 4 }}>需要盯住的风险</div>
            <div className="small" style={{ lineHeight: 1.8, color: 'var(--amber)' }}>
              {(plan.risk_notes || []).map((x: string, i: number) => <div key={i}>⚠ {x}</div>)}
            </div>
          </div>
        </div>
      )}
      <div className="muted small" style={{ marginTop: 10, lineHeight: 1.7 }}>
        评级“好/中/差”只代表当前结构与胜率倾向；先看市场状态，再看层级。跌破止损先执行，不补仓摊薄。
      </div>
    </Card>
  )
}
