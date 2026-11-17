import { useEffect, useState } from 'react'
import { Card, StatLine } from '../components/ui'
import { api } from '../api'
import { fmt } from '../utils'

export default function AdviceCenter() {
  const [brief, setBrief] = useState<any>(null)
  const [picks, setPicks] = useState<any>(null)
  useEffect(() => {
    Promise.all([api.get<any>('/api/market/daily'), api.get<any>('/api/market/picks').catch(() => null)])
      .then(([b, p]) => { setBrief(b); setPicks(p) })
  }, [])
  const adv = brief?.advice ?? {}
  const state = brief?.verdict ?? {}
  const above = (brief?.indices ?? []).filter((i: any) => (i.price ?? 0) > (i.ma20 ?? Infinity)).length
  const news = (brief?.news ?? []).slice(0, 5)

  return (
    <div>
      <Card title="市场历史总结" desc={brief?.date}>
        <div className="small" style={{ lineHeight: 1.9 }}>{brief?.summary ?? '加载中…'}</div>
        <div className="grid-2" style={{ marginTop: 10 }}>
          {(brief?.sectors?.top ?? []).slice(0, 5).map((x: any) => (
            <div key={x.code} className="row-between"><span className="muted small">{x.name}</span><b className="up">{fmt.pct(x.pct)}</b></div>
          ))}
        </div>
      </Card>
      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <Card title="未来趋势" desc="基于温度、均线与资金">
          <StatLine k="市场温度" v={`${brief?.score ?? '--'} / ${state.label ?? '--'}`} />
          <StatLine k="站上 MA20" v={`${above} / ${(brief?.indices ?? []).length} 个指数`} />
          <StatLine k="建议仓位" v={`${adv.target_low ?? '--'}%–${adv.target_high ?? '--'}%`} />
          <StatLine k="当前仓位" v={`${(adv.current_pct ?? 0).toFixed(1)}%`} />
          <div className="muted small" style={{ marginTop: 8, lineHeight: 1.8 }}>
            {above >= 3 ? '多数指数在 MA20 上方，趋势偏强；若成交额同步放大，可维持偏积极仓位。' : '多数指数未站上 MA20，趋势偏弱；优先控制回撤，等待放量转强。'}
          </div>
        </Card>
        <Card title="要闻与风险" desc="影响市场的主要信息">
          {news.map((n: any, i: number) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="small">{n.title}</div>
              <div className="muted small">{n.time}</div>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <Card title="标的推荐" desc={picks ? `扫描 ${picks.scanned} 只 · 命中 ${picks.matched} 只` : '形态 + 量价 + 资金'}>
          <div className="grid-2">
            {(picks?.hits ?? []).slice(0, 8).map((h: any) => (
              <div key={h.code} className="row-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div><b className="small">{h.name}</b> <span className="muted small mono">{h.code}</span></div>
                <div className="small"><b className="up">{h.score}</b> <span className="muted small">分 · {h.reasons?.[0] ?? ''}</span></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
