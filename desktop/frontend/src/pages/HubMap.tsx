import { useEffect, useMemo, useState } from 'react'
import * as echarts from 'echarts'
import { Card, Kpi } from '../components/ui'
import EChart from '../components/EChart'
import { api } from '../api'
import { fmt, trendClass } from '../utils'
import chinaJson from '../assets/china.json'

let registered = false
function ensureMap() {
  if (registered) return
  // @ts-ignore DataV GeoJSON
  echarts.registerMap('china', chinaJson as any)
  registered = true
}

ensureMap()

export default function HubMap() {
  const [dist, setDist] = useState<any>(null)
  const [leaders, setLeaders] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    Promise.all([
      api.get<any>('/api/market/company-map').catch(() => null),
      api.get<any>('/api/market/province-leaders').catch(() => null),
    ]).then(([m, pl]) => { setDist(m); setSelected(m?.provinces?.[0] ?? null); setLeaders(pl?.provinces ?? []) })
  }, [])

  const option = useMemo<echarts.EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(8,12,11,0.96)',
      borderColor: 'rgba(242,201,76,0.35)',
      textStyle: { color: '#e8ece8', fontSize: 11 },
      formatter: (p: any) => {
        const d = (dist?.provinces ?? []).find((x: any) => x.name === p.name)
        if (!d) return p.name
        return `<b>${d.short}</b><br/>上市公司 ${d.count} 家<br/>涨 ${d.up} / 跌 ${d.down} / 平 ${d.flat}<br/>地域涨跌 ${fmt.pct(d.pct)}<br/>主力净流入 ${fmt.big(d.inflow)}`
      },
    },
    visualMap: {
      min: 0, max: Math.max(600, ...(dist?.provinces ?? []).map((x: any) => x.count)),
      left: 12, bottom: 12, itemWidth: 10, itemHeight: 100,
      inRange: { color: ['#18231d', '#4d5528', '#b8a63c', '#f2c94c'] },
      textStyle: { color: '#8d968f', fontSize: 9 },
    },
    series: [{
      type: 'map', map: 'china', roam: true, scaleLimit: { min: 0.8, max: 5 }, zoom: 1.08, top: 8, bottom: 4,
      itemStyle: { areaColor: '#121a16', borderColor: '#3c463d', borderWidth: 0.8 },
      emphasis: { itemStyle: { areaColor: '#f2c94c', borderColor: '#ffe98c' }, label: { color: '#111', fontSize: 10 } },
      select: { itemStyle: { areaColor: '#f2c94c' }, label: { color: '#111' } },
      label: { show: false },
      data: (dist?.provinces ?? []).map((p: any) => ({ name: p.name, value: p.count })),
    }],
  }), [dist])


  return (
    <div>
      <div className="hud-map-head">
        <div>
          <div className="hud-map-title">中国上市公司分布</div>
          <div className="muted small">按东方财富地域板块统计 · 沪深京 A 股 · 数据缓存 10 分钟</div>
        </div>
        <div className="hud-map-total">
          <span>上市公司总数</span>
          <b>{dist?.total ?? '--'}</b>
          <em>{dist?.provinces?.length ?? 0} 个地区</em>
        </div>
      </div>

      <Card title="地域分布地图" desc="颜色越亮 = 上市公司越多 · 滚轮缩放 / 拖拽平移 · 点击查看">
        <EChart option={option} height={500} notMerge onEvents={{ click: (p: any) => {
          const d = (dist?.provinces ?? []).find((x: any) => x.name === p.name)
          if (d) setSelected(d)
        } }} />
      </Card>

      {selected && (
        <div style={{ marginTop: 14 }}>
          <Card title={`${selected.short} · 地域概览`} desc={`${selected.count} 家上市公司`}>
            <div className="grid-2">
              <Kpi label="上涨 / 下跌" value={`${selected.up} / ${selected.down}`} />
              <Kpi label="地域涨跌" value={fmt.pct(selected.pct)} color={selected.pct >= 0 ? 'var(--up)' : 'var(--down)'} />
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>主力净流入 {fmt.big(selected.inflow)} · 平盘 {selected.flat} 家</div>
          </Card>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Card title="全部省份领涨公司" desc="滚动查看 · 点击省份展开/折叠">
          <div className="hud-leaders-scroll">
            {leaders.map((p: any) => (
              <details key={p.code} className="hud-province-details">
                <summary>
                  <b>{p.short}</b>
                  <span className="muted small">{p.count} 家 · {(p.industries ?? []).join(' / ')}</span>
                  <em>{p.leaders?.[0]?.name ?? '--'} {fmt.pct(p.leaders?.[0]?.pct)}</em>
                </summary>
                <div className="hud-leader-list">
                  {(p.leaders ?? []).map((s: any) => (
                    <div key={s.code} className="hud-leader-row">
                      <b>{s.name}</b><span className="mono muted">{s.code}</span><span className="muted small">{s.industry}</span>
                      <em className={trendClass(s.pct)}>{fmt.pct(s.pct)}</em>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            {!leaders.length && <div className="muted small">领涨公司加载中…</div>}
          </div>
        </Card>
      </div>

    </div>
  )
}
