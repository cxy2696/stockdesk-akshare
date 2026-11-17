import { useEffect, useMemo, useState } from 'react'
import { Tag } from 'antd'
import { Card } from '../components/ui'
import { api } from '../api'
import { fmt, trendClass } from '../utils'

export default function IndustryNews() {
  const [brief, setBrief] = useState<any>(null)
  const [state, setState] = useState<any>(null)
  useEffect(() => {
    Promise.all([
      api.get<any>('/api/market/daily').catch(() => null),
      api.get<any>('/api/market/state').catch(() => null),
    ]).then(([b, s]) => { setBrief(b); setState(s) })
  }, [])

  const trends = brief?.industry_trends ?? []
  const top = trends.slice(0, 6)
  const news = useMemo(() => {
    const names = new Set([...(brief?.sectors?.top ?? []), ...(brief?.sectors?.bottom ?? [])].map((x: any) => x.name))
    const all = brief?.news ?? []
    const hit = all.filter((n: any) => [...names].some((x: any) => (n.title ?? '').includes(x) || (n.summary ?? '').includes(x)))
    return (hit.length ? hit : all).slice(0, 10)
  }, [brief])

  return (
    <div>
      <div className="hud-map-head">
        <div>
          <div className="hud-map-title" style={{ fontSize: 20 }}>行业要闻 · 趋势</div>
          <div className="muted small">行业资金、多周期表现与消息面 · 仅作研究参考</div>
        </div>
        <div className="hud-map-total"><span>市场温度</span><b>{brief?.score ?? '--'}</b><em>{brief?.verdict?.label ?? '--'}</em></div>
      </div>

      <Card title="行业情况分析" desc="资金流入前列行业 · 5/20/60 日趋势">
        <div className="grid-2">
          {top.map((x: any) => (
            <div key={x.code} className="ind-row">
              <div className="row-between"><b>{x.name}</b><Tag color={x.trend === '多头' ? 'gold' : x.trend === '空头' ? 'green' : 'default'}>{x.trend}</Tag></div>
              <div className="row-between small" style={{ marginTop: 4 }}>
                <span className={trendClass(x.pct)}>今日 {fmt.pct(x.pct)}</span>
                <span className={trendClass(x.pct5)}>5日 {fmt.pct(x.pct5)}</span>
                <span className={trendClass(x.pct20)}>20日 {fmt.pct(x.pct20)}</span>
                <span className={trendClass(x.pct60)}>60日 {fmt.pct(x.pct60)}</span>
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>主力净流入 {fmt.big(x.inflow)}</div>
            </div>
          ))}
        </div>
        <div className="muted small" style={{ marginTop: 10, lineHeight: 1.8 }}>
          当前资金更偏向 {top.slice(0, 3).map((x: any) => x.name).join('、')}；其中{' '}
          {top.filter((x: any) => x.trend === '多头').length ? `${top.filter((x: any) => x.trend === '多头').map((x: any) => x.name).join('、')} 处于多头结构` : '多数行业尚未形成多头排列'}。
          若成交额不能持续放大，行业轮动会加快，避免追高单日涨幅过大的方向。
        </div>
      </Card>

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <Card title="投资趋势" desc="行业强弱与关注方向">
          {top.map((x: any) => (
            <div key={x.code} className="row-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span><b className="small">{x.name}</b> <Tag>{x.trend}</Tag></span>
              <span className="muted small">资金 {fmt.big(x.inflow)} · 20日 {fmt.pct(x.pct20)}</span>
            </div>
          ))}
          <div className="muted small" style={{ marginTop: 8, lineHeight: 1.8 }}>
            关注趋势与资金同向的行业；若行业指数跌破 MA20 且资金转为净流出，应降低该方向暴露。
          </div>
        </Card>
        <Card title="行业要闻" desc="消息面与行业相关快讯">
          {news.map((n: any, i: number) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="small">{n.title}</div>
              <div className="muted small">{n.time}{n.industries?.length ? ` · ${n.industries.join(' / ')}` : ''}</div>
            </div>
          ))}
          {!news.length && <div className="muted small">暂无行业要闻。</div>}
        </Card>
      </div>
    </div>
  )
}
