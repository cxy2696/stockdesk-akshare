import { useEffect, useMemo, useState } from 'react'
import { Tag } from 'antd'
import { Card } from '../components/ui'
import { api } from '../api'
import { fmt, trendClass } from '../utils'

function biasColor(b: string) {
  return b === '偏多' ? 'gold' : b === '偏空' ? 'green' : 'default'
}

export default function IndexAnalysis() {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { api.get<any[]>('/api/market/index-analysis').then(setRows).catch(() => {}) }, [])

  const { aRows, usRows, summary } = useMemo(() => {
    const a = rows.filter((x) => x.region === 'A股')
    const u = rows.filter((x) => x.region !== 'A股')
    const bull = a.filter((x) => x.bias === '偏多').length
    const bear = a.filter((x) => x.bias === '偏空').length
    const neutral = a.length - bull - bear
    const avg = a.length ? a.reduce((s, x) => s + (x.score ?? 50), 0) / a.length : 0
    const text = bull >= 6 ? '多数 A 股指数转多，可逐步提高仓位，但仍以 MA20 为防守。' : bear >= 6 ? '多数 A 股指数偏空，优先控制回撤，等待指数重新站上 MA20。' : 'A 股指数分化，保持中性仓位，关注强势宽基与防守风格的相对强弱。'
    return { aRows: a, usRows: u, summary: { bull, bear, neutral, avg, text } }
  }, [rows])

  const card = (x: any) => (
    <Card key={x.code} title={`${x.name} · ${x.style || x.region}`} desc={`${x.code} · ${x.date ?? ''}`} extra={<Tag color={biasColor(x.bias)}>{x.bias} · {x.score}分</Tag>}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <b className="num" style={{ fontSize: 24 }}>{fmt.price(x.price)}</b>
        <b className={trendClass(x.pct)}>{fmt.pct(x.pct)}</b>
      </div>
      <div className="idx-metric-grid">
        <span>趋势 <b>{x.trend}</b></span>
        <span>1日 <b className={trendClass(x.pct1)}>{fmt.pct(x.pct1)}</b></span>
        <span>5日 <b className={trendClass(x.pct5)}>{fmt.pct(x.pct5)}</b></span>
        <span>20日 <b className={trendClass(x.pct20)}>{fmt.pct(x.pct20)}</b></span>
        <span>60日 <b className={trendClass(x.pct60)}>{fmt.pct(x.pct60)}</b></span>
        <span>120日 <b className={trendClass(x.pct120)}>{fmt.pct(x.pct120)}</b></span>
        <span>MA20 <b>{fmt.price(x.ma20)}</b></span>
        <span>MA60 <b>{fmt.price(x.ma60)}</b></span>
        <span>MA120 <b>{fmt.price(x.ma120)}</b></span>
        <span>RSI14 <b>{x.rsi ?? '--'}</b></span>
        <span>MACD <b className={(x.macd_hist ?? 0) >= 0 ? 'up' : 'down'}>{x.macd_hist ?? '--'}</b></span>
        <span>20日波动 <b>{(x.vol20 ?? 0).toFixed(2)}%</b></span>
        <span>支撑 <b className="up">{fmt.price(x.support)}</b></span>
        <span>压力 <b className="down">{fmt.price(x.resistance)}</b></span>
        <span>52周高 <b className="down">{fmt.price(x.high52)}</b></span>
        <span>52周低 <b className="up">{fmt.price(x.low52)}</b></span>
      </div>
      <div className="idx-desc">{x.desc}</div>
      <div className="idx-conclusion">
        <b>{x.conclusion}</b>
        <span>注意：{x.note}</span>
      </div>
    </Card>
  )

  return (
    <div>
      <div className="idx-summary">
        <div>
          <div className="muted small">A 股主要宽基 · 综合结论</div>
          <div className="idx-summary-main">{summary.text}</div>
          <div className="muted small" style={{ marginTop: 5 }}>偏多 {summary.bull} · 中性 {summary.neutral} · 偏空 {summary.bear} · 平均评分 {summary.avg.toFixed(1)}</div>
        </div>
        <div className="idx-summary-score">{summary.avg.toFixed(0)}<span>/100</span></div>
      </div>

      <div className="muted small" style={{ margin: '14px 0 8px' }}>A股指数 · 共 {aRows.length} 个</div>
      <div className="grid-2" style={{ alignItems: 'start' }}>{aRows.map(card)}</div>

      <div className="muted small" style={{ margin: '18px 0 8px' }}>海外指数 · 供隔夜参考</div>
      <div className="grid-2" style={{ alignItems: 'start' }}>{usRows.map(card)}</div>
    </div>
  )
}
