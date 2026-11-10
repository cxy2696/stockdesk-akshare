import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Skeleton, Tag, message } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ReloadOutlined,
  RiseOutlined,
  ThunderboltOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState, Kpi, StatLine } from '../components/ui'
import Sparkline from '../components/Sparkline'
import NetWorthChart from '../components/NetWorthChart'
import { fmt, trendClass, UP, DOWN } from '../utils'
import HudHome from './HudHome'
import { useTheme } from '../ThemeContext'

interface Props {
  overview: any
}

export default function Dashboard({ overview }: Props) {
  const nav = useNavigate()
  const { mode } = useTheme()
  const [summary, setSummary] = useState<any>(null)
  const [curve, setCurve] = useState<any>(null)
  const [watch, setWatch] = useState<any[]>([])
  const [ranking, setRanking] = useState<any[]>([])
  const [inflow, setInflow] = useState<any[]>([])
  const [account, setAccount] = useState<any>(null)
  const [market, setMarket] = useState<any>(null)
  const [hot, setHot] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [s, c, w, r, f, a, m, h] = await Promise.all([
        api.get<any>('/api/portfolio/summary'),
        api.get<any>('/api/portfolio/analytics').catch(() => null),
        api.get<any[]>('/api/watchlist'),
        api.get<any[]>('/api/market/ranking?by=pct&limit=6'),
        api.get<any[]>('/api/market/ranking?by=inflow&limit=5'),
        api.get<any>('/api/portfolio/account'),
        api.get<any>('/api/market/state').catch(() => null),
        api.get<any>('/api/market/hot').catch(() => null),
      ])
      setSummary(s)
      setCurve(c)
      setWatch(w)
      setRanking(r)
      setInflow(f)
      setAccount(a)
      setMarket(m)
      setHot(h)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  const positions = summary?.positions ?? []
  const dayPnl = useMemo(() => {
    return positions.reduce((acc: number, p: any) => {
      if (!p.price || !p.pct) return acc
      const prev = p.price / (1 + p.pct / 100)
      return acc + (p.price - prev) * p.qty
    }, 0)
  }, [positions])

  const winRate = curve?.trade_stats?.win_rate

  if (loading && !summary) {
    return (
      <div className="card card-pad" style={{ marginTop: 4 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  if (mode === 'hud') return <HudHome overview={overview} />

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 14 }}>
        <div className="hero">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="hero-label">总资产 · 股票账户</div>
              <div className="hero-value num">¥ {fmt.money(summary?.total)}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={`num ${trendClass(summary?.total_pnl)}`} style={{ fontSize: 14, fontWeight: 600 }}>
                  {summary?.total_pnl >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {fmt.signed(summary?.total_pnl)}
                </span>
                <span className={`chip ${trendClass(summary?.total_pct)}`}>{fmt.pct(summary?.total_pct)}</span>
                <span className="muted small">累计收益 · 初始资产 {fmt.money(summary?.assets ?? summary?.start_capital)}</span>
              </div>
            </div>
            <Tag color="blue" style={{ borderRadius: 8, margin: 0 }}>
              <ThunderboltOutlined /> 实时行情
            </Tag>
          </div>
          <div className="hero-row">
            <div className="hero-stat">
              <div className="k">持仓市值</div>
              <div className="v num">¥{fmt.money(summary?.market_value)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">可用现金</div>
              <div className="v num">¥{fmt.money(summary?.cash)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">今日盈亏</div>
              <div className={`v num ${trendClass(dayPnl)}`}>{fmt.signed(dayPnl)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">持仓数量</div>
              <div className="v num">{positions.length} <span className="muted small">只</span></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card
            title="账户净值"
            desc={curve?.empty ? '暂无交易' : `${curve?.start ?? ''} 至今`}
            extra={<span className={`chip ${trendClass(curve?.metrics?.total_return)}`}>{fmt.pct(curve?.metrics?.total_return)}</span>}
          >
            {curve && !curve.empty ? (
              <NetWorthChart series={curve.series} benchmark={curve.benchmark} height={158} compact />
            ) : (
              <EmptyState text="记录第一笔交易后即可看到净值曲线" icon="📈" />
            )}
          </Card>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginTop: 14 }}>
        <Kpi
          label="浮动盈亏"
          value={fmt.signed(summary?.float_pnl)}
          color={summary?.float_pnl >= 0 ? UP : DOWN}
          sub={<><span className="muted">成本</span> <span className="num">¥{fmt.money(summary?.cost)}</span> <span className={`chip ${trendClass(summary?.float_pct)}`}>{fmt.pct(summary?.float_pct)}</span></>}
          icon={<WalletOutlined />}
        />
        <Kpi
          label="已实现盈亏"
          value={fmt.signed(summary?.realized)}
          color={summary?.realized >= 0 ? UP : DOWN}
          sub={<span className="muted">卖出落地收益（含手续费）</span>}
          icon={<RiseOutlined />}
        />
        <Kpi
          label="交易胜率"
          value={winRate === null || winRate === undefined || !curve?.trade_stats?.win_count ? '--' : `${winRate}%`}
          sub={<span className="muted">共 {curve?.trade_stats?.closed_count ?? 0} 笔平仓 · 盈亏比 {curve?.trade_stats?.profit_factor ?? '--'}</span>}
          icon={<ThunderboltOutlined />}
        />
        <Kpi
          label="现金仓位"
          value={summary?.total ? `${((summary.cash / summary.total) * 100).toFixed(1)}%` : '--'}
          sub={<span className="muted">可用 ¥{fmt.money(summary?.cash)}</span>}
          icon={<WalletOutlined />}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <Card
          title="市场情况"
          desc={market ? `全市场 ${market.breadth?.total ?? 0} 只 · ${new Date((market.ts ?? 0) * 1000).toLocaleTimeString('zh-CN', { hour12: false })}` : '加载中…'}
          extra={
            market && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`chip ${market.verdict?.tone === 'up' ? 'up' : market.verdict?.tone === 'down' ? 'down' : ''}`}>
                  {market.verdict?.label}
                </span>
                <span className="muted small">温度 {market.score}</span>
                <span className="link small" onClick={() => nav('/analytics')}>行情判断 →</span>
              </div>
            )
          }
        >
          {market ? (
            <div className="dash-market">
              <div style={{ flex: 1.2 }}>
                <div className="breadth-bar">
                  <span style={{ width: `${((market.breadth?.up ?? 0) / Math.max(market.breadth?.total ?? 1, 1)) * 100}%`, background: 'var(--up)' }} />
                  <span style={{ width: `${((market.breadth?.flat ?? 0) / Math.max(market.breadth?.total ?? 1, 1)) * 100}%`, background: 'var(--text-dim)' }} />
                  <span style={{ width: `${((market.breadth?.down ?? 0) / Math.max(market.breadth?.total ?? 1, 1)) * 100}%`, background: 'var(--down)' }} />
                </div>
                <div className="breadth-labels">
                  <span className="up">涨 {market.breadth?.up ?? 0}</span>
                  <span>涨停 {market.breadth?.limit_up ?? 0} · 跌停 {market.breadth?.limit_down ?? 0}</span>
                  <span className="down">跌 {market.breadth?.down ?? 0}</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="muted small">领涨行业</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(market.sectors?.top ?? []).slice(0, 4).map((x: any) => (
                    <span key={x.code} className="chip">{x.name} <b className="up">{fmt.pct(x.pct)}</b></span>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="muted small">指数趋势</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(market.indices ?? []).map((i: any) => (
                    <span key={i.code} className={`chip ${i.trend === '多头' ? 'up' : i.trend === '空头' ? 'down' : ''}`}>
                      {i.short} {i.trend} <span className="num">{fmt.pct(i.pct)}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted small">成交额</div>
                <div className="num" style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{fmt.big(market.turnover)}</div>
              </div>
            </div>
          ) : (
            <Skeleton active paragraph={{ rows: 1 }} />
          )}
        </Card>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Card
          title="净值走势"
          desc="含基准对比（沪深300）"
          extra={<Button size="small" type="text" icon={<ReloadOutlined />} onClick={load} />}
        >
          {curve && !curve.empty ? (
            <NetWorthChart series={curve.series} benchmark={curve.benchmark} height={230} />
          ) : (
            <EmptyState text="尚无净值数据" icon="✦" />
          )}
        </Card>

        <Card title="自选观察" desc={`${watch.length} 只`} extra={<span className="link small" onClick={() => nav('/watchlist')}>全部 →</span>} pad={false}>
          <div style={{ maxHeight: 268, overflowY: 'auto' }}>
            {watch.slice(0, 6).map((w) => (
              <div
                key={w.code}
                className="row-between"
                style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.035)', cursor: 'pointer' }}
                onClick={() => nav(`/stock/${w.code}`)}
              >
                <div className="table-stock">
                  <div className="stock-avatar">{(w.name || w.code).slice(0, 1)}</div>
                  <div>
                    <div className="stock-name">{w.name}</div>
                    <div className="stock-code mono">{w.code}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                    {fmt.price(w.price)}
                  </div>
                  <div className={`num small ${trendClass(w.pct)}`}>{fmt.pct(w.pct)}</div>
                </div>
              </div>
            ))}
            {!watch.length && <EmptyState text="还没有自选股，去行情页添加" icon="★" />}
          </div>
        </Card>
      </div>

      <div className="grid-3" style={{ marginTop: 14 }}>
        <Card title="持仓分布" desc="按市值权重">
          {positions.length ? (
            <div>
              {positions.map((p: any, i: number) => {
                const colors = ['#2563EB', '#7C3AED', '#0891B2', '#D97706', '#18A058', '#E5484D']
                return (
                  <div key={p.code} style={{ marginBottom: 12 }}>
                    <div className="row-between" style={{ fontSize: 12 }}>
                      <span>
                        {p.name} <span className="muted mono small">{p.code}</span>
                      </span>
                      <span className="num">
                        {(p.weight ?? 0).toFixed(1)}% <span className={`${trendClass(p.float_pnl)} small`}>{fmt.pct(p.float_pct)}</span>
                      </span>
                    </div>
                    <div className="progress-track" style={{ marginTop: 5 }}>
                      <div className="progress-fill" style={{ width: `${Math.min(100, p.weight ?? 0)}%`, background: colors[i % colors.length] }} />
                    </div>
                  </div>
                )
              })}
              <StatLine k="现金占比" v={`${((summary.cash / summary.total) * 100).toFixed(1)}%`} />
            </div>
          ) : (
            <EmptyState text="暂无持仓" icon="◎" />
          )}
        </Card>

        <Card title="今日涨幅榜" desc="全市场" extra={<span className="link small" onClick={() => nav('/screener')}>选股 →</span>}>
          {ranking.map((r) => (
            <div key={r.code} className="row-between" style={{ padding: '6px 0', cursor: 'pointer' }} onClick={() => nav(`/stock/${r.code}`)}>
              <span style={{ fontSize: 12.5 }}>
                {r.name} <span className="muted mono small">{r.code}</span>
              </span>
              <span className={`num ${trendClass(r.pct)}`} style={{ fontWeight: 600 }}>
                {fmt.pct(r.pct)}
              </span>
            </div>
          ))}
          {!ranking.length && <EmptyState text="行情加载中…" icon="◌" />}
        </Card>

        <Card title="资金净流入" desc="主力净额">
          {inflow.map((r) => (
            <div key={r.code} className="row-between" style={{ padding: '6px 0', cursor: 'pointer' }} onClick={() => nav(`/stock/${r.code}`)}>
              <span style={{ fontSize: 12.5 }}>
                {r.name} <span className="muted small">{r.market}</span>
              </span>
              <span className={`num small ${r.main_inflow >= 0 ? 'up' : 'down'}`}>{fmt.big(r.main_inflow)}</span>
            </div>
          ))}
          {!inflow.length && <EmptyState text="资金数据加载中…" icon="◌" />}
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="热点榜" desc="涨跌最多的 10 只股票" extra={<span className="link small" onClick={() => nav('/daily')}>每日策略 →</span>}>
          {hot ? (
            <div className="hot-grid">
              <div>
                <div className="muted small" style={{ marginBottom: 4 }}>涨幅榜</div>
                {(hot.gainers ?? []).map((x: any, i: number) => (
                  <div key={x.code} className="hot-row" onClick={() => nav(`/stock/${x.code}`)}>
                    <span className="hot-rank">{i + 1}</span>
                    <span className="hot-name">{x.name}</span>
                    <span className="muted mono small">{x.code}</span>
                    <span className="num small">{fmt.price(x.price)}</span>
                    <b className="up num small">{fmt.pct(x.pct)}</b>
                  </div>
                ))}
              </div>
              <div>
                <div className="muted small" style={{ marginBottom: 4 }}>跌幅榜</div>
                {(hot.losers ?? []).map((x: any, i: number) => (
                  <div key={x.code} className="hot-row" onClick={() => nav(`/stock/${x.code}`)}>
                    <span className="hot-rank">{i + 1}</span>
                    <span className="hot-name">{x.name}</span>
                    <span className="muted mono small">{x.code}</span>
                    <span className="num small">{fmt.price(x.price)}</span>
                    <b className="down num small">{fmt.pct(x.pct)}</b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState text="热点数据加载中…" icon="◌" />
          )}
        </Card>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Card title="持仓明细" extra={<span className="link small" onClick={() => nav('/portfolio')}>管理 →</span>} pad={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                <th style={{ textAlign: 'left', padding: '8px 18px', fontWeight: 500 }}>股票</th>
                <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 500 }}>持仓</th>
                <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 500 }}>成本</th>
                <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 500 }}>现价</th>
                <th style={{ textAlign: 'right', padding: '8px 18px 8px 8px', fontWeight: 500 }}>浮动盈亏</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p: any) => (
                <tr key={p.code} style={{ borderTop: '1px solid rgba(255,255,255,0.035)', cursor: 'pointer' }} onClick={() => nav(`/stock/${p.code}`)}>
                  <td style={{ padding: '9px 18px' }}>
                    <div className="stock-name">{p.name}</div>
                    <div className="stock-code mono">{p.code}</div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '9px 8px' }} className="num">
                    {p.qty}
                  </td>
                  <td style={{ textAlign: 'right', padding: '9px 8px' }} className="num">
                    {fmt.price(p.avg_cost)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '9px 8px' }} className="num">
                    {fmt.price(p.price)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '9px 18px 9px 8px' }} className="num">
                    <div className={trendClass(p.float_pnl)}>{fmt.signed(p.float_pnl)}</div>
                    <div className={`small ${trendClass(p.float_pct)}`}>{fmt.pct(p.float_pct)}</div>
                  </td>
                </tr>
              ))}
              {!positions.length && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState text="还没有持仓，先去持仓账簿记一笔买入" icon="◎" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="交易台账" desc="最近 5 笔" extra={<span className="link small" onClick={() => nav('/portfolio')}>全部 →</span>} pad={false}>
          <RecentTrades />
        </Card>
      </div>
    </div>
  )
}

function RecentTrades() {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => {
    api.get<any[]>('/api/portfolio/trades').then((r) => setRows(r.slice(-5).reverse())).catch(() => {})
  }, [])
  const nav = useNavigate()
  if (!rows.length) return <EmptyState text="暂无交易记录" icon="▤" />
  return (
    <div>
      {rows.map((t) => (
        <div key={t.id} className="row-between" style={{ padding: '9px 18px', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>
          <div>
            <span style={{ fontSize: 12.5 }}>{t.name || t.code}</span>
            <span className={`chip ${t.side === 'buy' ? 'up' : 'down'}`} style={{ marginLeft: 8 }}>
              {t.side === 'buy' ? '买入' : '卖出'}
            </span>
            <div className="muted small mono">
              {t.trade_date} · {t.qty}股 @ {fmt.price(t.price)}
            </div>
          </div>
          <div className="num" style={{ fontSize: 12.5 }}>
            ¥{fmt.money(t.price * t.qty)}
            <div className="muted small">费 {fmt.price(t.fee)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
