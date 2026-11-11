import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Skeleton, Tag, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { fmt, trendClass } from '../utils'
import EChart from './EChart'

type Target = {
  key: string; name: string; kind: string; secid: string
  j5: number | null; j30: number | null; alert5: string | null; alert30: string | null
  alert: boolean; direction: string; price: number | null; pct: number | null
  series5: any[]; series30: any[]; zone5: any; zone30: any; error?: string
}

const UPPER = 118, LOWER = -14

function chartOption(t: Target, period: '5' | '30') {
  const series = (period === '5' ? t.series5 : t.series30) || []
  const zone = period === '5' ? t.zone5 : t.zone30
  const dates = series.map((x) => x.date)
  const vals = series.map((x) => [x.open ?? x.close, x.close, x.low, x.high])
  const j = series.map((x) => x.j)
  const zoneArea = zone && dates.length
    ? [[{ yAxis: zone.upper, itemStyle: { color: 'rgba(242,201,76,.10)' } }, { yAxis: zone.lower }]]
    : []
  return {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    grid: [
      { left: 42, right: 10, top: 8, height: '52%' },
      { left: 42, right: 10, top: '68%', height: '22%' },
    ],
    xAxis: [
      { type: 'category', data: dates, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#2b342e' } } },
      { type: 'category', gridIndex: 1, data: dates, axisLabel: { color: '#8e9a91', fontSize: 8 }, axisLine: { lineStyle: { color: '#2b342e' } } },
    ],
    yAxis: [
      { scale: true, axisLabel: { color: '#8e9a91', fontSize: 8 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } } },
      { gridIndex: 1, min: -40, max: 140, axisLabel: { color: '#8e9a91', fontSize: 8 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.04)' } } },
    ],
    series: [
      {
        type: 'candlestick', data: vals, xAxisIndex: 0, yAxisIndex: 0,
        itemStyle: { color: '#ff6b6b', color0: '#55d6a0', borderColor: '#ff6b6b', borderColor0: '#55d6a0' },
        markArea: zoneArea.length ? { silent: true, data: zoneArea, label: { show: true, position: 'insideTopLeft', color: '#b99a1f', fontSize: 8, formatter: '中枢' } } : undefined,
      },
      { name: 'J', type: 'line', data: j, xAxisIndex: 1, yAxisIndex: 1, showSymbol: false, lineStyle: { width: 1.2, color: '#e2c34a' }, itemStyle: { color: '#e2c34a' } },
      {
        name: '阈值', type: 'line', data: [], xAxisIndex: 1, yAxisIndex: 1, silent: true, showSymbol: false,
        markLine: { silent: true, symbol: 'none', label: { color: '#8e9a91', fontSize: 8 }, lineStyle: { color: 'rgba(242,201,76,.5)', type: 'dashed' }, data: [{ yAxis: UPPER }, { yAxis: LOWER }] },
      },
    ],
  }
}

function ChartCard({ title, period, target }: { title: string; period: '5' | '30'; target: Target }) {
  const option = useMemo(() => chartOption(target, period), [target, period])
  const j = period === '5' ? target.j5 : target.j30
  const alert = period === '5' ? target.alert5 : target.alert30
  const zone = period === '5' ? target.zone5 : target.zone30
  return (
    <div className="kdj-chart-card">
      <div className="kdj-chart-head">
        <div><b>{title}</b><span className="muted small"> J {j == null ? '--' : j.toFixed(2)}</span></div>
        <div>
          {alert && alert !== '正常' ? <Tag color={alert === '超买' ? 'red' : 'green'}>{alert}</Tag> : <Tag>正常</Tag>}
          {zone && <span className="muted small">中枢 {fmt.price(zone.lower)}–{fmt.price(zone.upper)}</span>}
        </div>
      </div>
      {target.series5.length ? <EChart option={option as any} height={250} /> : <div className="kdj-empty">该周期暂无行情数据</div>}
    </div>
  )
}

export default function KdjPanel() {
  const [data, setData] = useState<any>(null)
  const [sel, setSel] = useState('semi')
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    try { setData(await api.get<any>('/api/market/kdj-alerts')) }
    catch (e: any) { message.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const targets: Target[] = data?.targets ?? []
  const target = targets.find((t) => t.key === sel) ?? targets[0]
  const alerts = targets.filter((t) => t.alert)
  return (
    <div className="kdj-panel card">
      <div className="row-between kdj-top">
        <div>
          <div className="eyebrow">KDJ · 5M / 30M</div>
          <h3>极值预警</h3>
          <p className="muted small">J &gt; 118 超买，J &lt; -14 超卖；任一周期触发即提示。只预警，不是买卖指令。</p>
        </div>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button>
      </div>
      <div className="kdj-thresholds">
        <span>上轨 <b>J &gt; 118</b></span>
        <span>下轨 <b>J &lt; -14</b></span>
        <span>覆盖率 {targets.filter(t => t.alert).length}/{targets.length}</span>
      </div>
      {alerts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 10 }}
          message={`当前 ${alerts.length} 个标的触发极值：${alerts.map(t => `${t.name}${t.direction}`).join('、')}`}
          description="极值可能持续，建议先确认周期、方向、持续时间和价格位置，再决定是否操作。"
        />
      )}
      <div className="kdj-targets">
        {targets.map((t) => (
          <button key={t.key} className={t.key === sel ? 'active' : ''} onClick={() => setSel(t.key)}>
            <span>{t.name}</span><em>{t.kind}</em>
            {t.alert && <i className={t.direction === '超买' ? 'hot' : 'cold'} />}
          </button>
        ))}
      </div>
      {loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : target ? (
        <>
          <div className="kdj-quote">
            <b>{target.name}</b>
            <span className={`num ${trendClass(target.pct)}`}>{fmt.price(target.price)} {fmt.pct(target.pct)}</span>
            {target.error && <span className="muted small">{target.error}</span>}
          </div>
          <div className="kdj-charts">
            <ChartCard title="5 分钟" period="5" target={target} />
            <ChartCard title="30 分钟" period="30" target={target} />
          </div>
          <div className="muted small kdj-note">
            中枢为最近摆动高低点重叠区的近似值，用于看价格重心，不是严格缠论中枢。5 分钟偏即时，30 分钟偏质量；同向先后触发时参考权重更高。阈值按常规方向：上轨超买、下轨超卖。
          </div>
        </>
      ) : <div className="kdj-empty">暂无标的</div>}
      <style>{`
        .kdj-panel{margin-bottom:14px;padding:14px 16px}
        .kdj-top h3{font-size:18px;margin:2px 0 3px}
        .kdj-thresholds{display:flex;gap:18px;flex-wrap:wrap;margin:8px 0 10px;font-size:10px;color:var(--text-sub);font-family:'SF Mono',monospace}
        .kdj-thresholds b{color:var(--accent)}
        .kdj-targets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
        .kdj-targets button{display:flex;align-items:center;gap:5px;border:1px solid var(--border);background:transparent;color:var(--text-sub);padding:4px 8px;cursor:pointer;font-size:10px}
        .kdj-targets button.active{color:#171a19;background:var(--accent);border-color:var(--accent)}
        .kdj-targets em{font-style:normal;font-size:8px;opacity:.65}
        .kdj-targets i{width:5px;height:5px;border-radius:50%;display:block}
        .kdj-targets i.hot{background:#ff6b6b}.kdj-targets i.cold{background:#55d6a0}
        .kdj-quote{display:flex;align-items:baseline;gap:10px;padding:6px 0 8px;font-size:11px}
        .kdj-quote b{font-size:13px}
        .kdj-charts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .kdj-chart-card{border:1px solid var(--border-soft);padding:8px;background:rgba(255,255,255,.012)}
        .kdj-chart-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;margin-bottom:2px}
        .kdj-chart-head .muted{font-size:9px}
        .kdj-empty{padding:30px;text-align:center;color:var(--text-sub);font-size:11px}
        .kdj-note{margin-top:8px;line-height:1.7}
        @media(max-width:760px){.kdj-charts{grid-template-columns:1fr}}
      `}</style>
    </div>
  )
}
