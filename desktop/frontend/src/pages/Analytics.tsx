import { useEffect, useMemo, useState } from 'react'
import { Skeleton, Table, Tag, Tooltip, message } from 'antd'
import PositionAdviceCard from '../components/PositionAdvice'
import { InfoCircleOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState, Kpi, StatLine } from '../components/ui'
import NetWorthChart from '../components/NetWorthChart'
import EChart from '../components/EChart'
import { fmt, trendClass, UP, DOWN } from '../utils'
import { useTheme } from '../ThemeContext'

export default function Analytics() {
  const [data, setData] = useState<any>(null)
  const [market, setMarket] = useState<any>(null)
  const [advice, setAdvice] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<any>('/api/portfolio/analytics'),
      api.get<any>('/api/market/state').catch(() => null),
      api.get<any>('/api/portfolio/advice').catch(() => null),
    ])
      .then(([a, m, adv]) => {
        setData(a)
        setMarket(m)
        setAdvice(adv)
      })
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const metrics = data?.metrics ?? {}
  const stats = data?.trade_stats ?? {}
  const monthly = data?.monthly ?? []
  const byStock = data?.by_stock ?? []

  const heatmap = useMemo(() => {
    const years: Record<string, Record<number, any>> = {}
    monthly.forEach((m: any) => {
      const [y, mo] = m.month.split('-')
      years[y] = years[y] ?? {}
      years[y][+mo] = m
    })
    return { years, yearList: Object.keys(years).sort() }
  }, [monthly])

  if (loading) return <div className="card card-pad"><Skeleton active paragraph={{ rows: 10 }} /></div>
  if (!data || data.empty) {
    return <Card><EmptyState text="还没有交易记录，先到持仓账簿记一笔买卖" icon="✦" /></Card>
  }

  return (
    <div>
      <div className="kpi-grid">
        <Kpi
          label="累计收益率"
          value={fmt.pct(metrics.total_return)}
          color={metrics.total_return >= 0 ? UP : DOWN}
          sub={<span className="muted">净值 {metrics.final_nav?.toFixed(3)} · {metrics.days} 天</span>}
        />
        <Kpi
          label="年化收益"
          value={fmt.pct(metrics.annual_return)}
          color={metrics.annual_return >= 0 ? UP : DOWN}
          sub={<span className="muted">基准 {fmt.pct(metrics.benchmark_return)}</span>}
        />
        <Kpi label="最大回撤" value={fmt.pct(metrics.max_drawdown)} color={DOWN} sub={<span className="muted">卡玛 {metrics.calmar ?? '--'}</span>} />
        <Kpi
          label="超额收益"
          value={fmt.pct(metrics.excess_return)}
          color={metrics.excess_return >= 0 ? UP : DOWN}
          sub={
            <span className="muted">
              {data.benchmarks?.length
                ? data.benchmarks.map((b: any, i: number) => (
                    <span key={b.code}>
                      {i > 0 ? ' · ' : ''}{b.name} {fmt.pct(b.excess)}
                    </span>
                  ))
                : `Beta ${metrics.beta ?? '--'} · Alpha ${fmt.pct(metrics.alpha)}`}
            </span>
          }
        />
      </div>

      <ReviewCard data={data} market={market} />

      <div style={{ marginTop: 14 }}>
        <PositionAdviceCard advice={advice} />
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Card title="趋势分析" desc="净值 vs 20/60 日均线">
          <TrendChart series={data.series} height={260} />
        </Card>
        <MarketVerdictCard market={market} />
      </div>

      <div style={{ marginTop: 14 }}>
        <MarketSituationCard market={market} />
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Card title="净值曲线" desc="累计收益率，与沪深 300 对比">
          <NetWorthChart series={data.series} benchmark={data.benchmark} height={280} />
        </Card>
        <Card title="仓位与现金" desc="持仓市值占比随时间变化">
          <PositionChart series={data.series} height={280} />
        </Card>
      </div>

      <div className="grid-2-even" style={{ marginTop: 14 }}>
        <Card
          title="回撤分析"
          desc="从历史高点的回撤幅度"
          extra={
            <Tooltip title="回撤 = 当前净值 / 历史最高净值 − 1。最大回撤衡量最坏情况下的浮亏幅度。">
              <InfoCircleOutlined style={{ color: 'var(--text-dim)' }} />
            </Tooltip>
          }
        >
          <DrawdownChart drawdown={data.drawdown} height={240} />
        </Card>
        <Card title="风险指标" desc="近 244 个交易日年化">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 26px' }}>
            <div>
              <StatLine k="夏普比率" v={metrics.sharpe ?? '--'} />
              <StatLine k="年化波动率" v={fmt.pct(metrics.volatility)} />
              <StatLine k="Beta" v={metrics.beta ?? '--'} />
              <StatLine k="平均仓位" v={metrics.avg_exposure !== undefined ? `${metrics.avg_exposure}%` : '--'} />
            </div>
            <div>
              <StatLine k="Alpha" v={fmt.pct(metrics.alpha)} />
              <StatLine k="卡玛比率" v={metrics.calmar ?? '--'} />
              <StatLine k="最大连胜" v={metrics.win_streak ?? '--'} />
              <StatLine k="最大连亏" v={metrics.lose_streak ?? '--'} />
            </div>
          </div>
          <div className="muted small" style={{ marginTop: 10, lineHeight: 1.7 }}>
            夏普 = 年化超额收益 / 年化波动率；卡玛 = 年化收益 / 最大回撤；Alpha/Beta 以沪深 300 为基准。
          </div>
        </Card>
      </div>

      <div className="grid-2-even" style={{ marginTop: 14 }}>
        <Card title="月度收益热力图" desc="点击查看收益与金额">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 3, fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ color: 'var(--text-dim)', fontWeight: 500, padding: '2px 4px' }}>年份</th>
                  {Array.from({ length: 12 }, (_, i) => `${i + 1}月`).map((m) => (
                    <th key={m} style={{ color: 'var(--text-dim)', fontWeight: 500, padding: '2px 4px' }}>{m}</th>
                  ))}
                  <th style={{ color: 'var(--text-dim)', fontWeight: 500, padding: '2px 4px' }}>全年</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.yearList.map((y) => {
                  const row = heatmap.years[y]
                  const yearPoints = data.series.filter((x: any) => x.date.startsWith(y))
                  const yFirst = yearPoints.length ? yearPoints[0].nav : 1
                  const yLast = yearPoints.length ? yearPoints[yearPoints.length - 1].nav : 1
                  const total = yLast / yFirst - 1
                  return (
                    <tr key={y}>
                      <td style={{ color: 'var(--text-sub)', padding: '2px 4px' }}>{y}</td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const item = row[m]
                        const v = item?.ret
                        return (
                          <td key={m} style={{ padding: 0 }}>
                            <Tooltip title={item ? `${y}-${String(m).padStart(2, '0')}：${fmt.pct(v)} · ${fmt.signed(item.pnl)}` : ''}>
                              <div
                                style={{
                                  height: 30,
                                  borderRadius: 5,
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  background:
                                    v === undefined
                                      ? 'var(--tag-bg)'
                                      : v >= 0
                                        ? `rgba(229, 72, 77, ${Math.min(0.95, 0.35 + Math.abs(v) / 12)})`
                                        : `rgba(24, 160, 88, ${Math.min(0.95, 0.35 + Math.abs(v) / 12)})`,
                                  color: v === undefined ? 'transparent' : '#fff',
                                }}
                              >
                                {v === undefined ? '' : v.toFixed(1)}
                              </div>
                            </Tooltip>
                          </td>
                        )
                      })}
                      <td style={{ padding: '0 4px' }} className={trendClass(total)}>
                        <span className="num small">{fmt.pct(total * 100)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="交易统计" desc="FIFO 平仓配对">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 26px' }}>
            <div>
              <StatLine k="平仓笔数" v={stats.closed_count ?? 0} />
              <StatLine k="胜率" v={stats.win_count ? `${stats.win_rate}%` : '--'} cls={(stats.win_rate ?? 0) >= 50 ? 'up' : 'down'} />
              <StatLine k="盈亏比" v={stats.profit_factor || '--'} />
              <StatLine k="平均持有" v={stats.avg_hold_days ? `${stats.avg_hold_days} 天` : '--'} />
            </div>
            <div>
              <StatLine k="平均盈利" v={fmt.signed(stats.avg_win)} cls="up" />
              <StatLine k="平均亏损" v={fmt.signed(stats.avg_loss)} cls="down" />
              <StatLine k="最大单笔盈利" v={stats.best ? fmt.signed(stats.best.pnl) : '--'} cls="up" />
              <StatLine k="最大单笔亏损" v={stats.worst ? fmt.signed(stats.worst.pnl) : '--'} cls="down" />
            </div>
          </div>
          <div className="muted small" style={{ marginTop: 10, lineHeight: 1.7 }}>
            胜率 = 盈利平仓次数 / 总平仓次数；盈亏比 = 总盈利 / 总亏损。收益统计基于账户净值（含现金）。
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="个股贡献" desc="已实现盈亏排行" pad={false}>
          {byStock.length ? (
            <Table
              size="small"
              pagination={false}
              dataSource={byStock}
              rowKey="code"
              columns={[
                { title: '股票', dataIndex: 'name', render: (v: string, r: any) => <span>{v} <span className="muted mono small">{r.code}</span></span> },
                { title: '平仓次数', dataIndex: 'count', align: 'right' },
                { title: '盈利次数', dataIndex: 'wins', align: 'right' },
                { title: '胜率', dataIndex: 'win_rate', align: 'right', render: (v: number) => <span className={`num ${v >= 50 ? 'up' : 'down'}`}>{v}%</span> },
                {
                  title: '已实现盈亏',
                  dataIndex: 'pnl',
                  align: 'right',
                  render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.signed(v)}</span>,
                  sorter: (a: any, b: any) => a.pnl - b.pnl,
                },
              ]}
            />
          ) : (
            <EmptyState text="还没有平仓记录" icon="○" />
          )}
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="平仓明细" desc="先进先出配对" pad={false}>
          <Table
            size="small"
            pagination={{ pageSize: 8, size: 'small', showSizeChanger: false }}
            dataSource={[...(stats.closed ?? [])].reverse()}
            rowKey={(r: any, i) => `${r.code}-${r.close_date}-${i}`}
            columns={[
              { title: '股票', dataIndex: 'name', render: (v: string, r: any) => <span>{v} <span className="muted mono small">{r.code}</span></span> },
              { title: '开仓', dataIndex: 'open_date' },
              { title: '平仓', dataIndex: 'close_date' },
              { title: '买入价', dataIndex: 'buy_price', align: 'right', render: (v: number) => <span className="num">{fmt.price(v)}</span> },
              { title: '卖出价', dataIndex: 'sell_price', align: 'right', render: (v: number) => <span className="num">{fmt.price(v)}</span> },
              { title: '数量', dataIndex: 'qty', align: 'right' },
              { title: '持有', dataIndex: 'hold_days', align: 'right', render: (v: number) => (v === null || v === undefined ? '--' : `${v} 天`) },
              { title: '收益率', dataIndex: 'ret', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
              { title: '盈亏', dataIndex: 'pnl', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.signed(v)}</span> },
            ]}
          />
        </Card>
      </div>
    </div>
  )
}

function buildReview(data: any, market: any) {
  const m = data?.metrics ?? {}
  const st = data?.trade_stats ?? {}
  const tr = data?.trend ?? {}
  const top = data?.by_stock?.[0]
  const worst = [...(data?.by_stock ?? [])].sort((a: any, b: any) => a.pnl - b.pnl)[0]
  const months = data?.monthly ?? []
  const bestMonth = [...months].sort((a: any, b: any) => b.ret - a.ret)[0]
  const worstMonth = [...months].sort((a: any, b: any) => a.ret - b.ret)[0]
  const verdict = market?.verdict?.label

  const benches = data?.benchmarks ?? []
  const hs = benches.find((b: any) => b.code === '000300')
  const sh = benches.find((b: any) => b.code === '000001')
  const beat = (m.excess_return ?? 0) >= 0
  const cmpText = benches.length
    ? benches.map((b: any) => `相对${b.name} ${b.excess >= 0 ? '跑赢' : '跑输'} ${Math.abs(b.excess).toFixed(2)} 个百分点`).join('、')
    : `${beat ? '跑赢' : '跑输'}沪深300 ${Math.abs(m.excess_return ?? 0).toFixed(2)} 个百分点`
  const headline = `账户累计 ${m.total_return?.toFixed(2)}%，${cmpText}；${tr.label ?? '趋势待观察'}。`

  const points: string[] = []
  points.push(`收益：年化 ${(m.annual_return ?? 0).toFixed(2)}%，最大回撤 ${(m.max_drawdown ?? 0).toFixed(2)}%，当前回撤 ${(tr.dd_now ?? 0).toFixed(2)}%。`)
  if (hs && sh) {
    points.push(`基准：沪深300 ${hs.return.toFixed(2)}%（超额 ${hs.excess >= 0 ? '+' : ''}${hs.excess.toFixed(2)}pp），上证指数 ${sh.return.toFixed(2)}%（超额 ${sh.excess >= 0 ? '+' : ''}${sh.excess.toFixed(2)}pp）。`)
  }
  if (st.closed_count) {
    points.push(`交易：平仓 ${st.closed_count} 笔，胜率 ${st.win_rate ?? '--'}%，盈亏比 ${st.profit_factor || '--'}，平均持有 ${st.avg_hold_days ?? '--'} 天。`)
  } else {
    points.push('交易：尚未产生平仓记录，胜率与盈亏比暂时无法评估。')
  }
  if (top || worst) {
    points.push(`个股：${top ? `${top.name} 贡献 ${top.pnl >= 0 ? '+' : ''}${top.pnl.toFixed(0)} 元` : '暂无盈利标的'}${worst && worst.pnl < 0 ? `，${worst.name} 拖累 ${worst.pnl.toFixed(0)} 元` : ''}。`)
  }
  points.push(`仓位：平均仓位 ${m.avg_exposure ?? '--'}%，当前仓位 ${(tr.pos_now ?? 0).toFixed(1)}%，现金 ${(100 - (tr.pos_now ?? 0)).toFixed(1)}%。`)
  if (bestMonth && worstMonth) {
    points.push(`月度：最好 ${bestMonth.month} ${bestMonth.ret.toFixed(1)}%，最差 ${worstMonth.month} ${worstMonth.ret.toFixed(1)}%。`)
  }
  if (verdict) {
    points.push(`市场：当前${verdict}（温度 ${market?.score ?? '--'}），${market?.verdict?.reasons?.[0] ?? ''}。`)
  }
  const advice = beat
    ? '策略整体跑赢基准，继续控制单笔回撤与仓位集中度；若市场转弱，优先降低高波动持仓。'
    : '当前跑输基准，建议复盘亏损交易的买点与止损纪律，并降低弱势环境下的仓位。'
  return { headline, points, advice, beat }
}

function ReviewCard({ data, market }: { data: any; market: any }) {
  const r = buildReview(data, market)
  const tr = data?.trend ?? {}
  return (
    <Card
      title="复盘总结"
      desc="按账户净值、交易记录与大盘数据汇总"
      extra={<Tag color={r.beat ? 'red' : 'green'}>{r.beat ? '跑赢基准' : '跑输基准'}</Tag>}
    >
      <div className="review-headline">{r.headline}</div>
      <div className="review-grid">
        {r.points.map((p, i) => (
          <div key={i} className="review-point">{p}</div>
        ))}
      </div>
      <div className="review-advice">{r.advice}</div>
      <div className="review-tags">
        <span className="chip">净值 {(tr.last_nav ?? 1).toFixed(3)}</span>
        <span className="chip">20日线 {tr.nav_ma20?.toFixed(3) ?? '--'}</span>
        <span className="chip">60日线 {tr.nav_ma60?.toFixed(3) ?? '--'}</span>
        <span className={`chip ${tr.above60 ? 'up' : 'down'}`}>{tr.above60 ? '站上60日线' : '低于60日线'}</span>
      </div>
      {(data.benchmarks ?? []).length > 0 && (
        <div className="bench-table">
          <div className="bench-head">
            <span>基准</span><span>区间收益</span><span>超额</span><span>近20日</span>
          </div>
          {(data.benchmarks ?? []).map((b: any) => (
            <div key={b.code} className="bench-row">
              <span>{b.name}</span>
              <span className={b.return >= 0 ? 'up' : 'down'}>{fmt.pct(b.return)}</span>
              <span className={b.excess >= 0 ? 'up' : 'down'}>{b.excess >= 0 ? '+' : ''}{b.excess.toFixed(2)} pp</span>
              <span className={b.pct20 >= 0 ? 'up' : 'down'}>{fmt.pct(b.pct20)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function TrendChart({ series, height }: { series: any[]; height: number }) {
  const { colors } = useTheme()
  const rows = Array.isArray(series) ? series : []
  const option = useMemo<any>(() => {
    const dates = rows.map((s) => s.date)
    const nav = rows.map((s) => {
      const v = Number(s.nav)
      return Number.isFinite(v) ? +((v - 1) * 100).toFixed(2) : null
    })
    const movingAvg = (n: number) => {
      let sum = 0
      return rows.map((s: any, i: number) => {
        const v = Number(s.nav)
        if (!Number.isFinite(v)) return null
        sum += v
        if (i >= n) sum -= Number(rows[i - n].nav)
        if (i < n - 1) return null
        return +((sum / n - 1) * 100).toFixed(2)
      })
    }
    const ma20 = movingAvg(20)
    const ma60 = movingAvg(60)

    const plotted = [...nav, ...ma20, ...ma60].filter((v): v is number => v !== null && Number.isFinite(v))
    const dataLow = plotted.length ? Math.min(...plotted) : 0
    const dataHigh = plotted.length ? Math.max(...plotted) : 0
    let yMin: number
    let yMax: number
    if (dataHigh - dataLow < 0.05) {
      // 单点或全平的曲线：给点留出空间，同时保留 0% 参考线。
      if (Math.abs(dataLow) < 0.001 && Math.abs(dataHigh) < 0.001) {
        yMin = -0.5
        yMax = 0.5
      } else {
        const span = Math.max(0.5, Math.abs(dataHigh) * 0.25, Math.abs(dataLow) * 0.25)
        yMin = dataLow >= 0 ? -0.05 : +(dataLow - span).toFixed(2)
        yMax = dataHigh <= 0 ? 0.05 : +(dataHigh + span).toFixed(2)
      }
    } else {
      const pad = Math.max((dataHigh - dataLow) * 0.18, 0.35)
      const tiny = +(pad * 0.06).toFixed(2)
      yMin = dataLow >= 0 ? -tiny : +(dataLow - pad).toFixed(2)
      yMax = dataHigh <= 0 ? tiny : +(dataHigh + pad).toFixed(2)
    }
    const fewPoints = dates.length <= 2

    const pct = (v: number | null) => (v === null ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`)

    return {
      animation: false,
      grid: { left: 44, right: 16, top: 32, bottom: 28 },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 14,
        itemHeight: 3,
        icon: 'roundRect',
        selectedMode: true,
        inactiveColor: colors.axis,
        textStyle: { color: colors.textSub, fontSize: 10.5 },
        data: ['净值', 'MA20', 'MA60'],
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        axisPointer: { type: 'line', lineStyle: { color: colors.axis, opacity: 0.35 } },
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params]
          const pick = (name: string) => {
            const p = list.find((x: any) => x.seriesName === name)
            if (!p) return null
            const n = Number(p.value)
            return Number.isFinite(n) ? n : null
          }
          const base = `<div style="font-size:10px;color:${colors.axis};margin-bottom:4px">${list[0]?.axisValue ?? ''}</div>`
          const navLine = `<div style="display:flex;gap:18px;justify-content:space-between"><span>相对净值</span><b style="color:${colors.accent}">${pct(pick('净值'))}</b></div>`
          const lines = [base, navLine]
          if (rows.length >= 20) {
            lines.push(`<div style="display:flex;gap:18px;justify-content:space-between"><span>MA20</span><b style="color:#2EC4B6">${pct(pick('MA20'))}</b></div>`)
          }
          if (rows.length >= 60) {
            lines.push(`<div style="display:flex;gap:18px;justify-content:space-between"><span>MA60</span><b style="color:#B08CFF">${pct(pick('MA60'))}</b></div>`)
          }
          return lines.join('')
        },
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: fewPoints,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.axis, fontSize: 9.5, hideOverlap: true },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        axisLabel: { color: colors.axis, fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      series: [
        {
          name: '净值',
          type: 'line',
          data: nav,
          symbol: fewPoints ? 'circle' : 'none',
          symbolSize: 5,
          showSymbol: fewPoints,
          itemStyle: { color: colors.accent, borderColor: colors.card, borderWidth: 1 },
          lineStyle: { width: 2.2, color: colors.accent },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colors.accent + '26' },
                { offset: 1, color: colors.accent + '00' },
              ],
            },
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: colors.axis, width: 1, type: 'dashed', opacity: 0.55 },
            label: { show: true, position: 'insideEndTop', formatter: '0%', color: colors.axis, fontSize: 9 },
            data: [{ yAxis: 0 }],
          },
          z: 3,
        },
        {
          name: 'MA20',
          type: 'line',
          data: ma20,
          symbol: 'none',
          smooth: true,
          connectNulls: false,
          itemStyle: { color: '#2EC4B6' },
          lineStyle: { width: 1.4, color: '#2EC4B6' },
          z: 2,
        },
        {
          name: 'MA60',
          type: 'line',
          data: ma60,
          symbol: 'none',
          smooth: true,
          connectNulls: false,
          itemStyle: { color: '#B08CFF' },
          lineStyle: { width: 1.2, color: '#B08CFF', type: 'dashed' },
          z: 2,
        },
      ],
    }
  }, [rows, colors])
  if (!rows.length) {
    return <ChartEmpty height={height} text="暂无净值数据，记一笔交易后开始计算" color={colors.axis} border={colors.grid} />
  }
  return (
    <div>
      <EChart option={option} height={height} />
      {rows.length === 1 && (
        <ChartNote text="只有 1 个交易日的数据，曲线会在第二个交易日后展开；MA20 / MA60 需要至少 20 / 60 个交易日才会出现。" color={colors.textSub} />
      )}
    </div>
  )
}

function MarketVerdictCard({ market }: { market: any }) {
  const score = market?.score ?? 0
  const v = market?.verdict ?? {}
  const tone = v.tone === 'up' ? 'var(--up)' : v.tone === 'down' ? 'var(--down)' : 'var(--text-sub)'
  return (
    <Card title="行情判断" desc="指数趋势 + 涨跌家数 + 涨停 + 成交额">
      {market ? (
        <div>
          <div className="verdict-row">
            <div className="score-ring" style={{ background: `conic-gradient(${tone} ${score * 3.6}deg, var(--tag-bg) 0deg)` }}>
              <div className="score-inner">
                <b style={{ color: tone }}>{score}</b>
                <span>市场温度</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="verdict-label" style={{ color: tone }}>{v.label}</div>
              <div className="muted small" style={{ marginTop: 4 }}>{v.reasons?.[1]}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(market.indices ?? []).map((i: any) => (
                  <span key={i.code} className={`chip ${i.trend === '多头' ? 'up' : i.trend === '空头' ? 'down' : ''}`}>
                    {i.short} {i.trend}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {(v.reasons ?? []).map((r: string, i: number) => (
              <div key={i} className="reason-line">· {r}</div>
            ))}
          </div>
        </div>
      ) : (
        <ProgressView />
      )}
    </Card>
  )
}

function MarketSituationCard({ market }: { market: any }) {
  if (!market) return <Card title="市场情况"><ProgressView /></Card>
  const b = market.breadth ?? {}
  const up = b.up ?? 0
  const down = b.down ?? 0
  const flat = b.flat ?? 0
  const total = Math.max(up + down + flat, 1)
  const s = market.sectors ?? {}
  return (
    <Card title="市场情况" desc={`全市场 ${b.total ?? 0} 只 · ${new Date((market.ts ?? 0) * 1000).toLocaleTimeString('zh-CN', { hour12: false })}`}>
      <div className="market-grid">
        <div>
          <div className="muted small">涨跌分布</div>
          <div className="breadth-bar" style={{ marginTop: 6 }}>
            <span style={{ width: `${(up / total) * 100}%`, background: 'var(--up)' }} />
            <span style={{ width: `${(flat / total) * 100}%`, background: 'var(--text-dim)' }} />
            <span style={{ width: `${(down / total) * 100}%`, background: 'var(--down)' }} />
          </div>
          <div className="breadth-labels">
            <span className="up">涨 {up}</span>
            <span>平 {flat}</span>
            <span className="down">跌 {down}</span>
          </div>
          <div className="market-mini">
            <div><span>涨停</span><b className="up">{b.limit_up ?? 0}</b></div>
            <div><span>跌停</span><b className="down">{b.limit_down ?? 0}</b></div>
            <div><span>成交额</span><b>{shortMoney(market.turnover)}</b></div>
          </div>
        </div>
        <div>
          <div className="muted small">领涨行业</div>
          <div className="sector-list">
            {(s.top ?? []).slice(0, 5).map((x: any) => (
              <div key={x.code} className="sector-row">
                <span>{x.name}</span>
                <b className="up">{fmt.pct(x.pct)}</b>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="muted small">领涨概念</div>
          <div className="sector-list">
            {(s.concepts ?? []).slice(0, 5).map((x: any) => (
              <div key={x.code} className="sector-row">
                <span>{x.name}</span>
                <b className="up">{fmt.pct(x.pct)}</b>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="muted small">指数趋势</div>
          <div className="sector-list">
            {(market.indices ?? []).map((i: any) => (
              <div key={i.code} className="sector-row">
                <span>{i.short}</span>
                <span className="small">
                  <b className={i.pct >= 0 ? 'up' : 'down'}>{fmt.pct(i.pct)}</b>
                  <span className="muted"> · {i.trend} · RSI {i.rsi ?? '--'}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function ProgressView() {
  return <div style={{ padding: 30, textAlign: 'center' }}><Skeleton active paragraph={{ rows: 3 }} /></div>
}

function shortMoney(v?: number | null) {
  if (!v) return '--'
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} 万亿`
  if (v >= 1e8) return `${(v / 1e8).toFixed(0)} 亿`
  return `${v.toFixed(0)}`
}

function PositionChart({ series, height }: { series: any[]; height: number }) {
  const { colors } = useTheme()
  const rows = Array.isArray(series) ? series : []
  const option = useMemo<any>(() => {
    const dates = rows.map((s) => s.date)
    const pos = rows.map((s) => (s.total ? +((s.mv / s.total) * 100).toFixed(2) : 0))
    const cash = rows.map((s) => (s.total ? +((s.cash / s.total) * 100).toFixed(2) : 0))
    const fewPoints = dates.length <= 2
    return {
      animation: false,
      grid: { left: 44, right: 16, top: 32, bottom: 28 },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 14,
        itemHeight: 3,
        icon: 'roundRect',
        selectedMode: true,
        inactiveColor: colors.axis,
        textStyle: { color: colors.textSub, fontSize: 10.5 },
        data: ['持仓', '现金'],
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        axisPointer: { type: 'line', lineStyle: { color: colors.axis, opacity: 0.35 } },
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params]
          const val = (name: string) => {
            const p = list.find((x: any) => x.seriesName === name)
            const n = p ? Number(p.value) : NaN
            return Number.isFinite(n) ? `${n.toFixed(2)}%` : '--'
          }
          return `<div style="font-size:10px;color:${colors.axis};margin-bottom:4px">${list[0]?.axisValue ?? ''}</div>
            <div style="display:flex;gap:18px;justify-content:space-between"><span>持仓</span><b style="color:${colors.accent}">${val('持仓')}</b></div>
            <div style="display:flex;gap:18px;justify-content:space-between"><span>现金</span><b style="color:${colors.amber}">${val('现金')}</b></div>`
        },
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: fewPoints,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.axis, fontSize: 9.5, hideOverlap: true },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: colors.axis, fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      series: [
        {
          name: '持仓',
          type: 'line',
          data: pos,
          symbol: fewPoints ? 'circle' : 'none',
          symbolSize: 5,
          showSymbol: fewPoints,
          smooth: fewPoints ? false : 0.1,
          itemStyle: { color: colors.accent, borderColor: colors.card, borderWidth: 1 },
          lineStyle: { width: 2.2, color: colors.accent },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colors.accent + '33' },
                { offset: 1, color: colors.accent + '00' },
              ],
            },
          },
          z: 3,
        },
        {
          name: '现金',
          type: 'line',
          data: cash,
          symbol: fewPoints ? 'circle' : 'none',
          symbolSize: 4,
          showSymbol: fewPoints,
          smooth: fewPoints ? false : 0.1,
          itemStyle: { color: colors.amber },
          lineStyle: { width: 1.4, color: colors.amber, type: 'dashed' },
          z: 2,
        },
      ],
    }
  }, [rows, colors])
  if (!rows.length) {
    return <ChartEmpty height={height} text="暂无仓位数据，记一笔交易后开始计算" color={colors.axis} border={colors.grid} />
  }
  return (
    <div>
      <EChart option={option} height={height} />
      {rows.length === 1 && (
        <ChartNote text="只有 1 个交易日的数据，仓位曲线会在第二个交易日后展开。" color={colors.textSub} />
      )}
    </div>
  )
}

function DrawdownChart({ drawdown, height }: { drawdown: any[]; height: number }) {
  const { colors } = useTheme()
  const rows = Array.isArray(drawdown) ? drawdown : []
  const option = useMemo<any>(() => {
    const dates = rows.map((d) => d.date)
    const vals = rows.map((d) => {
      const v = Number(d.dd)
      return Number.isFinite(v) ? v : 0
    })
    const minVal = vals.length ? Math.min(...vals) : 0
    const fewPoints = dates.length <= 2
    const yMin = minVal < 0 ? +(minVal * 1.18).toFixed(2) : -1
    return {
      animation: false,
      grid: { left: 44, right: 14, top: 24, bottom: 26 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        axisPointer: { type: 'line', lineStyle: { color: colors.axis, opacity: 0.35 } },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params
          const n = Number(p?.value)
          return `<div style="font-size:10px;color:${colors.axis};margin-bottom:4px">${p?.axisValue ?? ''}</div>
            <div style="display:flex;gap:18px;justify-content:space-between"><span>回撤</span><b style="color:${colors.down}">${Number.isFinite(n) ? `${n.toFixed(2)}%` : '--'}</b></div>`
        },
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: fewPoints,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.axis, fontSize: 9.5, hideOverlap: true },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        max: 0,
        min: yMin,
        axisLabel: { color: colors.axis, fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      series: [
        {
          name: '回撤',
          type: 'line',
          data: vals,
          symbol: fewPoints ? 'circle' : 'none',
          symbolSize: 5,
          showSymbol: fewPoints,
          smooth: fewPoints ? false : 0.15,
          itemStyle: { color: colors.down, borderColor: colors.card, borderWidth: 1 },
          lineStyle: { color: colors.down, width: 1.8 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: colors.down + '0D' },
                { offset: 1, color: colors.down + '5C' },
              ],
            },
          },
          markLine: vals.length
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: colors.up + 'B3', type: 'dashed', width: 1 },
                label: {
                  show: true,
                  position: 'insideEndTop',
                  color: colors.up,
                  fontSize: 10,
                  formatter: `最大回撤 ${minVal.toFixed(2)}%`,
                },
                data: [{ yAxis: minVal }],
              }
            : undefined,
        },
      ],
    }
  }, [rows, colors])
  if (!rows.length) {
    return <ChartEmpty height={height} text="暂无回撤数据，记一笔交易后开始计算" color={colors.axis} border={colors.grid} />
  }
  return (
    <div>
      <EChart option={option} height={height} />
      {rows.length === 1 && (
        <ChartNote text="只有 1 个交易日的数据，回撤曲线会在第二个交易日后展开。" color={colors.textSub} />
      )}
    </div>
  )
}

function ChartEmpty({
  height,
  text,
  color,
  border,
}: {
  height: number
  text: string
  color: string
  border: string
}) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        border: `1px dashed ${border}`,
        borderRadius: 10,
        color,
        fontSize: 12,
      }}
    >
      <span style={{ fontSize: 22, opacity: 0.55 }}>◌</span>
      <span>{text}</span>
    </div>
  )
}

function ChartNote({ text, color }: { text: string; color: string }) {
  return <div style={{ marginTop: 6, fontSize: 11.5, color, lineHeight: 1.6 }}>{text}</div>
}
