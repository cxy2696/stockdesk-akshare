import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Skeleton, Table, Tag, Tooltip, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api'
import { Card, EmptyState, Kpi, StatLine } from '../components/ui'
import AccountAssetsModal from '../components/AccountAssetsModal'
import PositionAdviceCard from '../components/PositionAdvice'
import { fmt, trendClass, UP, DOWN } from '../utils'

type TabKey = 'overview' | 'analysis' | 'advice' | 'trades'

const TABS: { label: string; value: TabKey }[] = [
  { label: '持仓总览', value: 'overview' },
  { label: '资产分析', value: 'analysis' },
  { label: '投资建议', value: 'advice' },
  { label: '交易流水', value: 'trades' },
]

const TAB_HINT: Record<TabKey, string> = {
  overview: '总资产 = 可用现金 + 持仓市值，随行情变动',
  analysis: '净值、回撤和交易习惯，回头看一眼再决定下一笔',
  advice: '先看市场温度，再定账户仓位，最后才是买什么',
  trades: '点股票进详情；改或删一笔，现金和成本会重新算',
}

const ALLOC_COLORS = ['#2563EB', '#7C3AED', '#0891B2', '#D97706', '#DB2777', '#0EA5E9', '#65A30D', '#9333EA']

function readTab(raw: string | null): TabKey {
  if (raw === 'analysis' || raw === 'advice' || raw === 'trades') return raw
  return 'overview'
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`请求超时（${Math.round(ms / 1000)} 秒）`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

function errText(e: any) {
  return (e && e.message) || '请求失败'
}

/** 卡内加载 / 失败 / 空数据的统一兜底，避免任何一块白屏。 */
function renderFallback({
  busy,
  error,
  emptyText,
  onRetry,
  busyText,
  icon = '✦',
}: {
  busy?: boolean
  error?: string
  emptyText: string
  onRetry?: () => void
  busyText?: string
  icon?: string
}) {
  if (busy) {
    return (
      <div>
        <Skeleton active title={false} paragraph={{ rows: 4 }} />
        <div className="muted small">{busyText ?? '正在取数，稍等…'}</div>
      </div>
    )
  }
  if (error) {
    return (
      <div>
        <EmptyState text={`${error}。这块暂时拿不到数据，稍后重试。`} icon="!" />
        {onRetry && (
          <div style={{ textAlign: 'center', marginTop: -8 }}>
            <Button size="small" onClick={onRetry}>重试</Button>
          </div>
        )}
      </div>
    )
  }
  return <EmptyState text={emptyText} icon={icon} />
}

function buildPositionColumns(openStock: (code: string) => void) {
  return [
    {
      title: '股票',
      dataIndex: 'name',
      render: (_: any, r: any) => (
        <div className="table-stock" style={{ cursor: 'pointer' }} onClick={() => openStock(r.code)}>
          <div className="stock-avatar">{(r.name || r.code || '?').slice(0, 1)}</div>
          <div>
            <div className="stock-name">{r.name || r.code}</div>
            <div className="stock-code mono">{r.code}</div>
          </div>
        </div>
      ),
    },
    { title: '持仓', dataIndex: 'qty', align: 'right' as const, render: (v: number) => <span className="num">{v}</span> },
    { title: '成本价', dataIndex: 'avg_cost', align: 'right' as const, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    { title: '现价', dataIndex: 'price', align: 'right' as const, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    {
      title: '今日盈亏',
      dataIndex: 'today_pnl',
      align: 'right' as const,
      render: (v: number | null, r: any) => (
        <div>
          <div className={`num ${trendClass(v)}`}>{v === null ? '--' : fmt.signed(v)}</div>
          <div className={`num small ${trendClass(r.pct)}`}>{fmt.pct(r.pct)}</div>
        </div>
      ),
    },
    { title: '市值', dataIndex: 'market_value', align: 'right' as const, render: (v: number) => <span className="num">{fmt.money(v)}</span> },
    {
      title: '浮动盈亏',
      dataIndex: 'float_pnl',
      align: 'right' as const,
      render: (v: number, r: any) => (
        <div style={{ textAlign: 'right' }}>
          <div className={`num ${trendClass(v)}`}>{fmt.signed(v)}</div>
          <div className={`num small ${trendClass(r.float_pct)}`}>{fmt.pct(r.float_pct)}</div>
        </div>
      ),
    },
    {
      title: '累计盈亏',
      dataIndex: 'total_pnl',
      align: 'right' as const,
      render: (v: number, r: any) => (
        <Tooltip title={`浮动 ${fmt.signed(r.float_pnl)} + 已实现 ${fmt.signed(r.realized)}`}>
          <div style={{ textAlign: 'right' }}>
            <div className={`num ${trendClass(v)}`}>{fmt.signed(v)}</div>
            <div className={`num small ${trendClass(r.total_pct)}`}>{fmt.pct(r.total_pct)}</div>
          </div>
        </Tooltip>
      ),
    },
    { title: '仓位', dataIndex: 'weight', align: 'right' as const, render: (v: number) => <span className="num">{v?.toFixed(1)}%</span> },
    {
      title: '支撑 / 压力',
      align: 'center' as const,
      render: (_: any, r: any) =>
        r.support || r.resistance ? (
          <Tooltip title="基于筹码密集区与黄金分割位计算的最近支撑/压力">
            <div className="support-resistance">
              <span className="sr sr-support">
                撑 {fmt.price(r.support)} <em>{r.support_dist === null || r.support_dist === undefined ? '' : fmt.pct(r.support_dist)}</em>
              </span>
              <span className="sr sr-resistance">
                压 {fmt.price(r.resistance)} <em>{r.resistance_dist === null || r.resistance_dist === undefined ? '' : fmt.pct(r.resistance_dist)}</em>
              </span>
            </div>
          </Tooltip>
        ) : (
          <span className="muted">--</span>
        ),
    },
    { title: '持有', dataIndex: 'hold_days', align: 'right' as const, render: (v: number) => <span className="num muted">{v === null || v === undefined ? '--' : `${v} 天`}</span> },
  ]
}

function buildTradeColumns({
  openStock,
  onEdit,
  onDelete,
}: {
  openStock: (code: string) => void
  onEdit: (row: any) => void
  onDelete: (id: number) => void
}) {
  return [
    { title: '日期', dataIndex: 'trade_date', width: 96, sorter: (a: any, b: any) => a.trade_date.localeCompare(b.trade_date) },
    {
      title: '股票',
      dataIndex: 'name',
      render: (_: any, r: any) => (
        <div className="table-stock" style={{ cursor: 'pointer' }} onClick={() => openStock(r.code)}>
          <div className="stock-avatar">{(r.name || r.code || '?').slice(0, 1)}</div>
          <div>
            <div className="stock-name">{r.name || r.code}</div>
            <div className="stock-code mono">{r.code}</div>
          </div>
        </div>
      ),
    },
    {
      title: '方向',
      dataIndex: 'side',
      width: 64,
      render: (v: string) => <Tag color={v === 'buy' ? 'red' : 'green'} style={{ margin: 0 }}>{v === 'buy' ? '买入' : '卖出'}</Tag>,
    },
    { title: '成交价', dataIndex: 'price', align: 'right' as const, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    { title: '数量', dataIndex: 'qty', align: 'right' as const, render: (v: number) => <span className="num">{v}</span> },
    {
      title: '成交金额',
      align: 'right' as const,
      render: (_: any, r: any) => <span className="num">{fmt.money(r.price * r.qty)}</span>,
    },
    { title: '费用', dataIndex: 'fee', align: 'right' as const, width: 70, render: (v: number) => <span className="num muted">{fmt.price(v)}</span> },
    {
      title: '已实现盈亏',
      dataIndex: 'realized',
      align: 'right' as const,
      render: (v: number | null, r: any) => {
        if (v === null || v === undefined) return <span className="muted">--</span>
        const pct = r.price > 0 ? (v / (r.price * r.qty)) * 100 : 0
        return (
          <Tooltip
            title={
              (r.matched || []).length ? (
                <div style={{ fontSize: 11 }}>
                  {(r.matched || []).map((m: any, i: number) => (
                    <div key={i}>
                      {m.open_date} 买入 {m.qty} 股 @ {fmt.price(m.buy_price)} → 盈亏 {fmt.signed(m.pnl)}
                    </div>
                  ))}
                </div>
              ) : 'FIFO 配对'
            }
          >
            <div>
              <div className={`num ${trendClass(v)}`}>{fmt.signed(v)}</div>
              <div className={`num small ${trendClass(v)}`}>{fmt.pct(pct)}</div>
            </div>
          </Tooltip>
        )
      },
    },
    { title: '备注', dataIndex: 'note', ellipsis: true, render: (v: string) => <span className="muted small">{v || '--'}</span> },
    {
      title: '',
      width: 70,
      render: (_: any, r: any) => (
        <div style={{ display: 'flex', gap: 2 }}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(r)} />
          <Popconfirm title="删除这笔交易？" description="删除后账户资产与可用现金会重新计算" onConfirm={() => onDelete(r.id)} okText="删除" cancelText="取消">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ]
}

export default function Portfolio() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = readTab(params.get('tab'))

  const [summary, setSummary] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [tradesError, setTradesError] = useState('')

  const [open, setOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [side, setSide] = useState('all')
  const [keyword, setKeyword] = useState('')

  const [analytics, setAnalytics] = useState<any>(null)
  const [analyticsBusy, setAnalyticsBusy] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')

  const [advice, setAdvice] = useState<any>(null)
  const [adviceBusy, setAdviceBusy] = useState(false)
  const [adviceError, setAdviceError] = useState('')

  const [market, setMarket] = useState<any>(null)
  const [marketBusy, setMarketBusy] = useState(false)
  const [marketError, setMarketError] = useState('')

  const [picks, setPicks] = useState<any>(null)
  const [picksBusy, setPicksBusy] = useState(false)
  const [picksError, setPicksError] = useState('')

  // StrictMode 下 effect 会跑两遍，重接口用 ref 挡住重复请求
  const inFlight = useRef<Record<string, boolean>>({})
  const booted = useRef(false)

  const load = async () => {
    setLoading(true)
    try {
      const [s, t] = await Promise.all([
        api.get<any>('/api/portfolio/summary').catch((e: any) => ({ __error: errText(e) })),
        api.get<any[]>('/api/portfolio/trades').catch((e: any) => ({ __error: errText(e) })),
      ])
      if (s && (s as any).__error) {
        setSummaryError((s as any).__error)
      } else {
        setSummary(s)
        setSummaryError('')
      }
      if (Array.isArray(t)) {
        setTrades(t)
        setTradesError('')
      } else {
        setTradesError((t as any)?.__error || '交易流水没取到')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadAnalytics = async () => {
    if (inFlight.current.analytics) return
    inFlight.current.analytics = true
    setAnalyticsBusy(true)
    setAnalyticsError('')
    try {
      const d = await withTimeout(api.get<any>('/api/portfolio/analytics'), 45000)
      setAnalytics(d ?? {})
    } catch (e: any) {
      setAnalyticsError(errText(e))
    } finally {
      inFlight.current.analytics = false
      setAnalyticsBusy(false)
    }
  }

  const loadAdvice = async () => {
    if (inFlight.current.advice) return
    inFlight.current.advice = true
    setAdviceBusy(true)
    setAdviceError('')
    try {
      const d = await withTimeout(api.get<any>('/api/portfolio/advice'), 30000)
      setAdvice(d ?? null)
    } catch (e: any) {
      setAdviceError(errText(e))
    } finally {
      inFlight.current.advice = false
      setAdviceBusy(false)
    }
  }

  const loadMarket = async () => {
    if (inFlight.current.market) return
    inFlight.current.market = true
    setMarketBusy(true)
    setMarketError('')
    try {
      const d = await withTimeout(api.get<any>('/api/market/daily'), 120000)
      setMarket(d ?? null)
    } catch (e: any) {
      setMarketError(errText(e))
    } finally {
      inFlight.current.market = false
      setMarketBusy(false)
    }
  }

  const loadPicks = async () => {
    if (inFlight.current.picks) return
    inFlight.current.picks = true
    setPicksBusy(true)
    setPicksError('')
    try {
      const d = await withTimeout(api.get<any>('/api/market/picks?limit=150&top=8'), 150000)
      setPicks(d ?? null)
    } catch (e: any) {
      setPicksError(errText(e))
    } finally {
      inFlight.current.picks = false
      setPicksBusy(false)
    }
  }

  useEffect(() => {
    if (!booted.current) {
      booted.current = true
      load()
    }
    const timer = setInterval(load, 45000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 重接口只在真正进入对应视图时才拉，切回来复用上次结果
  useEffect(() => {
    if (tab === 'analysis' && !analytics && !analyticsBusy) loadAnalytics()
    if (tab === 'advice') {
      if (!advice && !adviceBusy) loadAdvice()
      if (!market && !marketBusy) loadMarket()
      if (!picks && !picksBusy) loadPicks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const changeTab = (v: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', v)
        return next
      },
      { replace: true },
    )
  }

  const refresh = async () => {
    setRefreshing(true)
    await load()
    if (tab === 'analysis') await loadAnalytics()
    if (tab === 'advice') await Promise.all([loadAdvice(), loadMarket(), loadPicks()])
    setRefreshing(false)
  }

  /** 交易/初始资产变化后，账户数据与依赖账户的建议都要重算。 */
  const onDataChanged = async () => {
    setAnalytics(null)
    setAdvice(null)
    await load()
    if (tab === 'analysis') loadAnalytics()
    if (tab === 'advice') {
      loadAdvice()
      loadMarket()
    }
  }

  const del = async (id: number) => {
    try {
      await api.del(`/api/portfolio/trades/${id}`)
      message.success('已删除，账户资产与现金已重算')
      onDataChanged()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  // 后端按录入顺序返回；这里统一按日期 + id 倒序，最新的一笔永远在最上面
  const orderedTrades = useMemo(
    () =>
      [...trades].sort(
        (a, b) => String(b.trade_date || '').localeCompare(String(a.trade_date || '')) || (b.id ?? 0) - (a.id ?? 0),
      ),
    [trades],
  )

  const filtered = useMemo(() => {
    const kw = keyword.trim().toUpperCase()
    return orderedTrades
      .filter((t) => side === 'all' || t.side === side)
      .filter((t) => !kw || t.code.includes(kw) || (t.name || '').toUpperCase().includes(kw))
  }, [orderedTrades, side, keyword])

  const openStock = (code: string) => nav(`/stock/${code}`)
  const posColumns = buildPositionColumns(openStock)
  const tradeColumns = buildTradeColumns({
    openStock,
    onEdit: (row) => {
      setEditing(row)
      setOpen(true)
    },
    onDelete: del,
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Segmented value={tab} onChange={(v) => changeTab(String(v))} options={TABS} />
        <div className="muted small" style={{ flex: '1 1 200px', minWidth: 0 }}>
          {TAB_HINT[tab]}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<SettingOutlined />} onClick={() => setAccountOpen(true)}>初始资产</Button>
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={refresh}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setOpen(true) }}>记录交易</Button>
        </div>
      </div>

      {summaryError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            padding: '8px 12px',
            marginBottom: 12,
            borderRadius: 8,
            background: 'rgba(229,72,77,0.08)',
            border: '1px solid rgba(229,72,77,0.18)',
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--up)' }}>账户汇总没取到：{summaryError}</span>
          <Button size="small" type="text" onClick={load} style={{ color: 'var(--accent)' }}>重试</Button>
        </div>
      )}

      {loading && !summary ? (
        <div className="card card-pad"><Skeleton active paragraph={{ rows: 6 }} /></div>
      ) : tab === 'overview' ? (
        <OverviewView
          summary={summary}
          trades={orderedTrades}
          tradesError={tradesError}
          nav={openStock}
          posColumns={posColumns}
          onOpenTrades={() => changeTab('trades')}
        />
      ) : tab === 'analysis' ? (
        <AnalysisView
          summary={summary}
          summaryError={summaryError}
          analytics={analytics}
          busy={analyticsBusy}
          error={analyticsError}
          onRetry={loadAnalytics}
        />
      ) : tab === 'advice' ? (
        <AdviceView
          advice={advice}
          adviceBusy={adviceBusy}
          adviceError={adviceError}
          onRetryAdvice={loadAdvice}
          market={market}
          marketBusy={marketBusy}
          marketError={marketError}
          onRetryMarket={loadMarket}
          picks={picks}
          picksBusy={picksBusy}
          picksError={picksError}
          onRetryPicks={loadPicks}
          nav={openStock}
        />
      ) : (
        <TradesView
          trades={trades}
          filtered={filtered}
          side={side}
          setSide={setSide}
          keyword={keyword}
          setKeyword={setKeyword}
          columns={tradeColumns}
          error={tradesError}
          onRetry={load}
        />
      )}

      <TradeEditor open={open} editing={editing} onClose={() => setOpen(false)} onDone={onDataChanged} />
      <AccountAssetsModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onDone={onDataChanged}
        assets={summary?.assets ?? 0}
        total={summary?.total ?? 0}
        cash={summary?.cash ?? 0}
        marketValue={summary?.market_value ?? 0}
      />
    </div>
  )
}

/* ------------------------------------------------------------- 持仓总览 */

function OverviewView({
  summary,
  trades,
  tradesError,
  nav,
  posColumns,
  onOpenTrades,
}: {
  summary: any
  trades: any[]
  tradesError: string
  nav: (code: string) => void
  posColumns: any[]
  onOpenTrades: () => void
}) {
  const positions = summary?.positions ?? []
  const recent = trades.slice(0, 5)

  return (
    <>
      <div className="kpi-grid">
        <Kpi
          label="总资产"
          value={`¥${fmt.money(summary?.total)}`}
          sub={<span className="muted">初始资产 ¥{fmt.money(summary?.assets)} · 累计 {fmt.pct(summary?.total_pct)}</span>}
        />
        <Kpi
          label="持仓市值"
          value={`¥${fmt.money(summary?.market_value)}`}
          sub={<span className="muted">仓位 {summary?.position_pct ?? 0}% · {positions.length} 只</span>}
        />
        <Kpi
          label="可用现金"
          value={`¥${fmt.money(summary?.cash)}`}
          color={summary?.cash < 0 ? UP : undefined}
          sub={<span className="muted">现金占比 {summary?.cash_pct ?? 0}%</span>}
        />
        <Kpi
          label="累计盈亏"
          value={fmt.signed(summary?.total_pnl)}
          color={summary?.total_pnl > 0 ? UP : summary?.total_pnl < 0 ? DOWN : undefined}
          sub={<span className="muted">浮盈 {fmt.signed(summary?.float_pnl)} · 已实现 {fmt.signed(summary?.realized)}</span>}
        />
      </div>

      <div className="grid-3" style={{ marginTop: 12 }}>
        <Card title="资金流水" desc="自动汇总">
          <StatLine k="累计买入" v={`¥${fmt.money(summary?.buy_total)}`} />
          <StatLine k="累计卖出" v={`¥${fmt.money(summary?.sell_total)}`} />
          <StatLine k="净投入" v={`¥${fmt.money(summary?.net_invested)}`} />
          <StatLine k="交易费用" v={`¥${fmt.money(summary?.fees)}`} />
        </Card>
        <Card title="盈亏结构" desc="浮动 + 已实现">
          <StatLine k="浮动盈亏" v={fmt.signed(summary?.float_pnl)} cls={trendClass(summary?.float_pnl)} />
          <StatLine k="已实现盈亏" v={fmt.signed(summary?.realized)} cls={trendClass(summary?.realized)} />
          <StatLine k="持仓成本" v={`¥${fmt.money(summary?.cost)}`} />
          <StatLine k="成本收益率" v={fmt.pct(summary?.float_pct)} cls={trendClass(summary?.float_pct)} />
        </Card>
        <Card title="仓位结构" desc="按市值权重">
          {positions.slice(0, 4).map((p: any, i: number) => (
            <div key={p.code} style={{ marginBottom: 8 }}>
              <div className="row-between" style={{ fontSize: 12, gap: 8 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name} <span className="muted mono small">{p.code}</span>
                </span>
                <span className="num" style={{ flex: '0 0 auto' }}>{p.weight?.toFixed(1)}%</span>
              </div>
              <div className="progress-track" style={{ marginTop: 4 }}>
                <div className="progress-fill" style={{ width: `${Math.min(100, p.weight ?? 0)}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
              </div>
            </div>
          ))}
          {!positions.length && <div className="muted small" style={{ marginBottom: 8 }}>还没有持仓，现金占全部资产。</div>}
          <div className="stat-line"><span className="k">现金</span><span className="num">{summary?.cash_pct ?? 0}%</span></div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="当前持仓" desc={`${positions.length} 只 · 市值 ¥${fmt.money(summary?.market_value)}`} pad={false}>
          {positions.length ? (
            <Table
              dataSource={positions}
              columns={posColumns as any}
              rowKey="code"
              size="small"
              pagination={false}
              scroll={{ x: 1040 }}
            />
          ) : (
            <EmptyState text="暂无持仓，点右上角「记录交易」记一笔买入" icon="◎" />
          )}
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card
          title="最近交易"
          desc={recent.length ? `最近 ${recent.length} 笔` : '记一笔后这里会显示'}
          extra={<Button type="link" size="small" onClick={onOpenTrades}>查看全部</Button>}
        >
          {tradesError && (
            <div className="small" style={{ color: 'var(--up)', paddingBottom: 6 }}>
              交易流水没取到：{tradesError}。下面可能不是最新的几笔。
            </div>
          )}
          {recent.length ? (
            recent.map((r: any) => (
              <div
                key={r.id}
                onClick={() => nav(r.code)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 4px',
                  margin: '0 -4px',
                  borderRadius: 6,
                  borderBottom: '1px solid var(--border-soft)',
                  cursor: 'pointer',
                }}
              >
                <span className="muted mono small" style={{ flex: '0 0 64px' }}>{r.trade_date?.slice(5)}</span>
                <Tag color={r.side === 'buy' ? 'red' : 'green'} style={{ margin: 0, flex: '0 0 auto' }}>
                  {r.side === 'buy' ? '买入' : '卖出'}
                </Tag>
                <span
                  className="small"
                  style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {r.name || r.code} <span className="muted mono small">{r.code}</span>
                </span>
                <span className="num small" style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
                  {r.qty} 股 @ {fmt.price(r.price)}
                </span>
                <span className="num small" style={{ flex: '0 0 96px', textAlign: 'right' }}>¥{fmt.money(r.price * r.qty)}</span>
                <span
                  className={`num small ${trendClass(r.realized)}`}
                  style={{ flex: '0 0 92px', textAlign: 'right' }}
                >
                  {r.realized === null || r.realized === undefined ? '--' : fmt.signed(r.realized)}
                </span>
              </div>
            ))
          ) : (
            <div className="muted small" style={{ padding: '6px 0' }}>
              {tradesError
                ? '交易流水没取到，最近交易暂时空着；账户汇总不受影响。'
                : '还没有交易记录，记下第一笔后这里会显示最近 5 笔。点「记录交易」开始。'}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- 资产分析 */

function AnalysisView({
  summary,
  summaryError,
  analytics,
  busy,
  error,
  onRetry,
}: {
  summary: any
  summaryError: string
  analytics: any
  busy: boolean
  error: string
  onRetry: () => void
}) {
  // 汇总接口挂了就别拿 0 去编习惯和仓位，宁可空着
  if (!summary) {
    return (
      <>
        <div className="kpi-grid">
          <Kpi label="总资产" value="¥--" sub={<span className="muted">账户汇总没取到</span>} />
          <Kpi label="现金占比" value="--" sub={<span className="muted">等汇总接口恢复</span>} />
          <Kpi label="累计收益" value="--" sub={<span className="muted">盈亏 --</span>} />
          <Kpi label="最大回撤" value="--" sub={<span className="muted">从第一笔交易起算</span>} />
        </div>
        <div style={{ marginTop: 14 }}>
          <Card title="资产分析" desc="等账户数据">
            <EmptyState
              icon="!"
              text={summaryError ? `账户汇总没取到：${summaryError}。点顶部「重试」或右上角刷新。` : '账户数据还没回来，这一页先空着。'}
            />
          </Card>
        </div>
      </>
    )
  }

  const positions = summary?.positions ?? []
  const total = summary?.total ?? 0
  const cash = summary?.cash ?? 0
  const cashPct = summary?.cash_pct ?? (total > 0 ? (cash / total) * 100 : 0)
  const positionPct = summary?.position_pct ?? Math.max(0, 100 - cashPct)
  const metrics = analytics?.metrics ?? {}
  const stats = analytics?.trade_stats ?? {}
  const monthly = analytics?.monthly ?? []
  const hasSeries = !!analytics && !analytics.empty

  const sorted = [...positions].sort((a: any, b: any) => (b.weight ?? 0) - (a.weight ?? 0))
  const maxWeight = sorted[0]?.weight ?? 0
  const top3 = sorted.slice(0, 3)
  const top3Sum = top3.reduce((a: number, p: any) => a + (p.weight ?? 0), 0)
  const concLabel =
    positions.length === 0 ? '空仓' : top3Sum >= 70 ? '高度集中' : top3Sum >= 50 ? '偏集中' : top3Sum >= 30 ? '适中' : '分散'
  const concColor =
    positions.length === 0
      ? 'var(--text-sub)'
      : top3Sum >= 70
        ? UP
        : top3Sum >= 50
          ? '#D97706'
          : top3Sum >= 30
            ? 'var(--accent)'
            : 'var(--text-sub)'
  const concText =
    positions.length === 0
      ? '还没有持仓，集中度无从谈起。建仓后这里会显示前三大权重和评价。'
      : top3Sum >= 70
        ? `前三大合计 ${top3Sum.toFixed(1)}%，最重的一只 ${maxWeight.toFixed(1)}%。仓位压在少数几只上，单票大跌会直接砸到账户，减仓优先于补仓。`
        : top3Sum >= 50
          ? `前三大合计 ${top3Sum.toFixed(1)}%，最重 ${maxWeight.toFixed(1)}%。偏集中，但还没到押注单一方向；最重的那只别再往上加。`
          : top3Sum >= 30
            ? `前三大合计 ${top3Sum.toFixed(1)}%，最重 ${maxWeight.toFixed(1)}%。分散度够用，注意别让同一行业占掉两三个仓位。`
            : `前三大合计 ${top3Sum.toFixed(1)}%，最重 ${maxWeight.toFixed(1)}%。持仓很散，单票影响有限，也很难靠一只票拉动整体收益。`

  const allocRows = [
    { key: 'cash', name: '现金', code: '', weight: cashPct, color: 'var(--text-dim)', value: cash },
    ...sorted.map((p: any, i: number) => ({
      key: p.code,
      name: p.name || p.code,
      code: p.code,
      weight: p.weight ?? 0,
      color: ALLOC_COLORS[i % ALLOC_COLORS.length],
      value: p.market_value ?? 0,
    })),
  ]
  const colorOf = new Map<string, string>(allocRows.map((r) => [r.key, r.color]))
  const shownAlloc = allocRows.slice(0, 8)
  const restWeight = allocRows.slice(8).reduce((a, r) => a + r.weight, 0)

  const closedCount = stats.closed_count ?? 0
  const winRate: number | null = stats.win_rate ?? null
  const profitFactor: number | null = stats.profit_factor ?? null
  const holdDays: number | null = stats.avg_hold_days ?? metrics.avg_hold_days ?? null
  const fee = summary?.fees ?? 0
  const feePct = summary?.assets ? (fee / summary.assets) * 100 : 0
  const tradeCount = summary?.trade_count ?? 0

  const habits: { k: string; v: string }[] = []

  habits.push({
    k: '仓位',
    v:
      cashPct >= 99.5
        ? `现金 ${cashPct.toFixed(1)}%（¥${fmt.money(cash)}），账户空着。空仓不会亏，但也拿不到上涨；第一步是定好单票上限再开仓。`
        : cashPct >= 50
          ? `现金 ${cashPct.toFixed(1)}%，仓位 ${positionPct.toFixed(1)}%。防守为主，手里还有子弹，等指数重新站上 MA20 再分批补。`
          : cashPct >= 20
            ? `现金 ${cashPct.toFixed(1)}%，仓位 ${positionPct.toFixed(1)}%。攻守都留了余地，回撤时还有一次补仓机会。`
            : `现金只剩 ${cashPct.toFixed(1)}%，仓位 ${positionPct.toFixed(1)}%。没有腾挪空间，先想清楚回调 10% 时减哪只。`,
  })

  habits.push({
    k: '集中度',
    v:
      positions.length === 0
        ? '没有持仓，资金全在现金里，集中度暂时为空。'
        : `第一大持仓 ${sorted[0]?.name || sorted[0]?.code} 占 ${maxWeight.toFixed(1)}%，前三大合计 ${top3Sum.toFixed(1)}%。${
            maxWeight >= 30
              ? '单票偏重，一次跌停就是账户 3 个点左右的回撤，别再加。'
              : maxWeight >= 15
                ? '单票还在常规上限内，先别往上加。'
                : '单票都不重，收益要靠组合整体。'
          }`,
  })

  habits.push({
    k: '节奏',
    v:
      closedCount > 0 && holdDays !== null
        ? `已平仓 ${closedCount} 笔，平均持股 ${holdDays.toFixed(1)} 天，${
            holdDays <= 5 ? '偏短线，手续费和滑点会吃掉一部分收益。' : holdDays <= 20 ? '偏波段，节奏正常。' : '拿得住，适合趋势票；别把赚的单拖成亏的。'
          }`
        : tradeCount > 0
          ? `累计 ${tradeCount} 笔买卖，还没有完整平仓记录，持股周期要等卖出后才算得出来。`
          : '还没有交易记录。第一笔之前，先把单票上限和止损线写下来。',
  })

  habits.push({
    k: '胜率',
    v:
      closedCount > 0 && winRate !== null
        ? `胜率 ${winRate.toFixed(1)}%，盈亏比 ${profitFactor !== null ? profitFactor.toFixed(2) : '--'}，平均赚 ${fmt.signed(stats.avg_win)} / 平均亏 ${fmt.signed(stats.avg_loss)}。${
            winRate >= 55 ? '胜率不低，重点是拿住盈利单，别赚一点就跑。' : winRate >= 40 ? '胜率一般，靠盈亏比补；把亏损单压在 5% 以内。' : '胜率偏低，先减少试错次数，只做最有把握的形态。'
          }`
        : '还没有平仓记录，胜率和盈亏比暂时算不出来。',
  })

  habits.push({
    k: '成本',
    v:
      fee > 0
        ? `累计手续费 ¥${fmt.money(fee)}，占初始资产 ${feePct.toFixed(2)}%。${feePct > 1 ? '这个比例不算小，减少无效交易比提高胜率更直接。' : '成本可控。'}`
        : '还没有产生交易费用。',
  })

  if (metrics.avg_exposure !== null && metrics.avg_exposure !== undefined) {
    habits.push({
      k: '平均仓位',
      v: `有持仓的交易日平均仓位 ${Number(metrics.avg_exposure).toFixed(1)}%，${
        metrics.avg_exposure >= 80 ? '基本满仓在跑，回撤会直接体现在总资产上。' : metrics.avg_exposure >= 40 ? '中等仓位，节奏正常。' : '低于四成，多数时间在观察。'
      }`,
    })
  }

  const months = monthly.slice(-8).reverse()
  const maxAbsRet = Math.max(0.01, ...months.map((m: any) => Math.abs(m.ret ?? 0)))
  const upMonths = months.filter((m: any) => (m.ret ?? 0) > 0).length
  const downMonths = months.filter((m: any) => (m.ret ?? 0) < 0).length
  const analyticsEmptyText = '还没有净值序列。第一笔交易之后，这里会按日算出累计、年化和回撤。'

  return (
    <>
      <div className="kpi-grid">
        <Kpi
          label="总资产"
          value={`¥${fmt.money(summary?.total)}`}
          sub={<span className="muted">初始资产 ¥{fmt.money(summary?.assets)}</span>}
        />
        <Kpi
          label="现金占比"
          value={`${cashPct.toFixed(1)}%`}
          sub={<span className="muted">¥{fmt.money(cash)} 现金 · 仓位 {positionPct.toFixed(1)}%</span>}
        />
        <Kpi
          label="累计收益"
          value={fmt.pct(summary?.total_pct)}
          color={summary?.total_pct > 0 ? UP : summary?.total_pct < 0 ? DOWN : undefined}
          sub={<span className="muted">盈亏 {fmt.signed(summary?.total_pnl)}</span>}
        />
        <Kpi
          label="最大回撤"
          value={hasSeries ? fmt.pct(metrics.max_drawdown) : '--'}
          color={hasSeries ? DOWN : undefined}
          sub={<span className="muted">{hasSeries ? `卡玛 ${metrics.calmar !== null && metrics.calmar !== undefined ? metrics.calmar.toFixed(2) : '--'} · 波动 ${fmt.price(metrics.volatility)}%` : '从第一笔交易起算'}</span>}
        />
      </div>

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <Card title="资金分配" desc="现金 + 持仓权重">
          <div
            style={{
              display: 'flex',
              height: 12,
              borderRadius: 6,
              overflow: 'hidden',
              background: 'var(--tag-bg)',
              marginBottom: 12,
            }}
          >
            {allocRows.map((r) => (
              <div
                key={r.key}
                title={`${r.name} ${r.weight.toFixed(1)}%`}
                style={{ width: `${Math.max(0, Math.min(100, r.weight))}%`, height: '100%', background: r.color }}
              />
            ))}
          </div>
          {shownAlloc.map((r) => (
            <div key={r.key} className="row-between" style={{ padding: '4px 0', fontSize: 12, gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flex: '0 0 8px' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                {r.code && <span className="muted mono small">{r.code}</span>}
              </span>
              <span style={{ display: 'flex', gap: 10, flex: '0 0 auto' }}>
                <span className="num">{r.weight.toFixed(1)}%</span>
                <span className="muted num small" style={{ width: 76, textAlign: 'right' }}>¥{fmt.big(r.value)}</span>
              </span>
            </div>
          ))}
          {allocRows.length > 8 && (
            <div className="muted small" style={{ paddingTop: 6 }}>
              另有 {allocRows.length - 8} 只持仓，合计 {restWeight.toFixed(1)}%，未逐条列出。
            </div>
          )}
          {positions.length === 0 && <div className="muted small">还没有持仓，资金 100% 在现金里。</div>}
        </Card>

        <Card title="仓位集中度" desc="前三大持仓">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 28, fontWeight: 700, color: concColor }}>{top3Sum.toFixed(1)}%</span>
            <span className="muted small">前三大合计 · {concLabel}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            {top3.map((p: any) => (
              <div key={p.code} style={{ marginBottom: 8 }}>
                <div className="row-between" style={{ fontSize: 12, gap: 8 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name} <span className="muted mono small">{p.code}</span>
                  </span>
                  <span className="num" style={{ flex: '0 0 auto' }}>{(p.weight ?? 0).toFixed(1)}%</span>
                </div>
                <div className="progress-track" style={{ marginTop: 4 }}>
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(100, p.weight ?? 0)}%`, background: colorOf.get(p.code) || 'var(--accent)' }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="small" style={{ marginTop: 10, color: 'var(--text-sub)', lineHeight: 1.8 }}>{concText}</div>
        </Card>
      </div>

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <Card title="收益趋势" desc="净值化 · 沪深300 为基准">
          {hasSeries ? (
            <>
              <StatLine k="累计收益" v={fmt.pct(metrics.total_return)} cls={trendClass(metrics.total_return)} />
              <StatLine k="年化收益" v={fmt.pct(metrics.annual_return)} cls={trendClass(metrics.annual_return)} />
              <StatLine k="夏普比率" v={metrics.sharpe !== null && metrics.sharpe !== undefined ? Number(metrics.sharpe).toFixed(2) : '--'} />
              <StatLine k="卡玛比率" v={metrics.calmar !== null && metrics.calmar !== undefined ? Number(metrics.calmar).toFixed(2) : '--'} />
              <StatLine k="超额收益" v={fmt.pct(metrics.excess_return)} cls={trendClass(metrics.excess_return)} />
              <div className="muted small" style={{ marginTop: 8, lineHeight: 1.8 }}>
                净值 {metrics.final_nav !== null && metrics.final_nav !== undefined ? Number(metrics.final_nav).toFixed(3) : '--'} · {metrics.days ?? '--'} 个交易日 · 波动{' '}
                {fmt.price(metrics.volatility)}% · Beta {metrics.beta !== null && metrics.beta !== undefined ? Number(metrics.beta).toFixed(2) : '--'}
                <br />
                基准收益 {fmt.pct(metrics.benchmark_return)}，超额就是从基准手里多拿的那部分。
              </div>
            </>
          ) : (
            renderFallback({
              busy: busy || (!analytics && !error),
              error,
              emptyText: analyticsEmptyText,
              onRetry,
              busyText: '正在按日重算净值、回撤和风险指标…',
            })
          )}
        </Card>

        <Card title="月度收益" desc="近 8 个月 · 红涨绿跌">
          {months.length ? (
            <>
              {months.map((m: any) => (
                <div key={m.month} style={{ display: 'flex', alignItems: 'center', padding: '3px 0' }} title={`当月盈亏 ${fmt.signed(m.pnl)} 元`}>
                  <span className="muted mono small" style={{ flex: '0 0 58px' }}>{m.month}</span>
                  <div style={{ position: 'relative', flex: 1, height: 8, background: 'var(--tag-bg)', borderRadius: 4, margin: '0 8px' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        height: '100%',
                        borderRadius: 4,
                        background: (m.ret ?? 0) >= 0 ? 'var(--up)' : 'var(--down)',
                        width: `${(Math.abs(m.ret ?? 0) / maxAbsRet) * 50}%`,
                        ...((m.ret ?? 0) >= 0 ? { left: '50%' } : { right: '50%' }),
                      }}
                    />
                    <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 12, background: 'var(--border)' }} />
                  </div>
                  <span className={`num small ${trendClass(m.ret)}`} style={{ flex: '0 0 62px', textAlign: 'right' }}>
                    {fmt.pct(m.ret)}
                  </span>
                </div>
              ))}
              <div className="muted small" style={{ marginTop: 8 }}>
                这 8 个月里 {upMonths} 个月为正、{downMonths} 个月为负。
              </div>
            </>
          ) : (
            renderFallback({
              busy: busy || (!analytics && !error),
              error,
              emptyText: analytics?.empty ? '账户还没有交易，月度收益要等第一笔之后。' : '净值序列太短，月度收益还排不出来。',
              onRetry,
              busyText: '正在按月归集净值…',
            })
          )}
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="交易偏好与习惯" desc="从流水里看出来的，不是评价">
          {habits.map((h, i) => (
            <div
              key={h.k}
              style={{
                display: 'grid',
                gridTemplateColumns: '62px minmax(0, 1fr)',
                gap: 10,
                padding: '7px 0',
                borderBottom: i < habits.length - 1 ? '1px solid var(--border-soft)' : 'none',
              }}
            >
              <span className="muted small" style={{ fontWeight: 600 }}>{h.k}</span>
              <span className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.85 }}>{h.v}</span>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- 投资建议 */

function AdviceView({
  advice,
  adviceBusy,
  adviceError,
  onRetryAdvice,
  market,
  marketBusy,
  marketError,
  onRetryMarket,
  picks,
  picksBusy,
  picksError,
  onRetryPicks,
  nav,
}: {
  advice: any
  adviceBusy: boolean
  adviceError: string
  onRetryAdvice: () => void
  market: any
  marketBusy: boolean
  marketError: string
  onRetryMarket: () => void
  picks: any
  picksBusy: boolean
  picksError: string
  onRetryPicks: () => void
  nav: (code: string) => void
}) {
  const indices = market?.indices ?? []
  const above = indices.filter((i: any) => i.above20).length
  const topSectors = (market?.sectors?.top ?? []).slice(0, 5)
  const inflow = (market?.hot?.industries_in ?? []).slice(0, 5)
  const verdict = market?.verdict ?? {}
  const adv = market?.advice ?? {}
  const breadth = market?.breadth ?? {}
  const score: number | null = typeof market?.score === 'number' ? market.score : null
  const tone = verdict?.tone === 'up' ? UP : verdict?.tone === 'down' ? DOWN : 'var(--text-sub)'
  const pickList: any[] = picks?.picks ?? picks?.hits ?? []
  const marketBusyNow = marketBusy || (!market && !marketError)
  const picksBusyNow = picksBusy || (!picks && !picksError)

  const weeksNote = !market
    ? '行情数据没回来，指数位置和资金流向下周再说。'
    : indices.length === 0
      ? '指数行情没返回，等下一次刷新再看结构。'
      : above === indices.length
      ? `${indices.length} 个指数全部站在 MA20 上方，趋势一致。回踩 20 日线是观察点，追高要等量能配合。`
      : above === 0 && indices.length > 0
        ? `${indices.length} 个指数全在 MA20 下方。未来两周先看能不能重新站回去；站不回之前，反弹只用来减仓。`
        : above / Math.max(1, indices.length) >= 0.5
          ? `${indices.length} 个指数里有 ${above} 个在 MA20 上方，结构分化。盯住领涨行业能不能带量扩散，否则只当结构性行情做。`
          : `${indices.length} 个指数只有 ${above} 个在 MA20 上方，趋势偏弱。先看修复力度，别急着把仓位打满。`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {advice ? (
          <PositionAdviceCard advice={advice} title="账户仓位建议" />
        ) : (
          <Card title="账户仓位建议" desc="温度 × 回撤 × 集中度">
            {renderFallback({
              busy: adviceBusy || (!advice && !adviceError),
              error: adviceError,
              emptyText: '仓位建议还没算出来，点重试再看。',
              onRetry: onRetryAdvice,
              busyText: '正在按当前仓位和市场温度算建议区间…',
            })}
          </Card>
        )}

        <Card title="市场温度与仓位" desc={market?.date ? `${market.date} 收盘` : '涨跌家数 · 均线 · 成交额'}>
          {market ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div className="muted small">温度</div>
                  <div className="num" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15, color: tone }}>
                    {score !== null ? score.toFixed(1) : '--'}
                    <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> / 100</span>
                  </div>
                </div>
                <div>
                  <div className="muted small">状态</div>
                  <div style={{ fontSize: 16, fontWeight: 650, color: tone }}>{verdict.label ?? '--'}</div>
                </div>
                <div>
                  <div className="muted small">建议仓位</div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 650 }}>
                    {adv.target_low ?? '--'}%–{adv.target_high ?? '--'}%
                  </div>
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--tag-bg)', overflow: 'hidden', marginTop: 12 }}>
                <div
                  style={{
                    width: `${score === null ? 0 : Math.max(2, Math.min(100, score))}%`,
                    height: '100%',
                    background: tone,
                    borderRadius: 4,
                  }}
                />
              </div>
              <div className="muted small" style={{ marginTop: 8, lineHeight: 1.8 }}>
                上涨 {breadth.up ?? '--'} 家 · 下跌 {breadth.down ?? '--'} 家 · 涨停 {breadth.limit_up ?? '--'} / 跌停 {breadth.limit_down ?? '--'} · 成交{' '}
                {fmt.big(market.turnover)}
              </div>
              {adv.headline && (
                <div className="small" style={{ marginTop: 10, lineHeight: 1.8 }}>{adv.headline}</div>
              )}
              <div style={{ marginTop: 8 }}>
                {(verdict.reasons ?? []).slice(0, 4).map((r: string, i: number) => (
                  <div key={i} className="muted small" style={{ lineHeight: 1.85 }}>· {r}</div>
                ))}
              </div>
            </>
          ) : (
            renderFallback({
              busy: marketBusyNow,
              error: marketError,
              emptyText: '今天没有行情数据，温度和仓位建议都算不出来。',
              onRetry: onRetryMarket,
              busyText: '全市场行情要合成温度、均线和资金，第一次要 20–60 秒。',
            })
          )}
        </Card>
      </div>

      <Card
        title="未来 1–2 周关注"
        desc={market && indices.length ? `${above} / ${indices.length} 个指数站上 MA20` : '先看趋势，再看资金'}
      >
        {market ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '4px 20px' }}>
              <div>
                <div className="muted small" style={{ fontWeight: 600, marginBottom: 4 }}>指数与 MA20 · {above}/{indices.length}</div>
                {indices.length ? (
                  indices.map((i: any) => {
                    const dist = i.ma20 ? (((i.price ?? 0) / i.ma20) - 1) * 100 : null
                    return (
                      <div
                        key={i.code}
                        className="row-between"
                        style={{ padding: '4px 0', borderBottom: '1px solid var(--border-soft)', gap: 8, fontSize: 12 }}
                      >
                        <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {i.short || i.name}
                        </span>
                        <span className={`num small ${trendClass(i.pct)}`} style={{ flex: '0 0 auto' }}>{fmt.pct(i.pct)}</span>
                        <span style={{ flex: '0 0 auto', color: i.above20 ? 'var(--up)' : 'var(--down)' }} className="small">
                          {i.above20 ? 'MA20 上方' : `MA20 下方${dist !== null ? ` ${Math.abs(dist).toFixed(1)}%` : ''}`}
                        </span>
                      </div>
                    )
                  })
                ) : (
                  <div className="muted small">指数行情没返回。</div>
                )}
              </div>

              <div>
                <div className="muted small" style={{ fontWeight: 600, marginBottom: 4 }}>领涨行业</div>
                {topSectors.length ? (
                  topSectors.map((x: any, idx: number) => (
                    <div
                      key={x.code ?? idx}
                      className="row-between"
                      style={{ padding: '4px 0', borderBottom: '1px solid var(--border-soft)', gap: 8, fontSize: 12 }}
                    >
                      <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                      <span
                        className="muted small"
                        style={{ flex: '0 1 auto', maxWidth: '42%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {x.leader || '--'}
                      </span>
                      <b className={`num small ${trendClass(x.pct)}`} style={{ flex: '0 0 auto' }}>{fmt.pct(x.pct)}</b>
                    </div>
                  ))
                ) : (
                  <div className="muted small">没有行业数据。</div>
                )}
              </div>

              <div>
                <div className="muted small" style={{ fontWeight: 600, marginBottom: 4 }}>资金流入行业</div>
                {inflow.length ? (
                  inflow.map((x: any, idx: number) => (
                    <div
                      key={x.code ?? idx}
                      className="row-between"
                      style={{ padding: '4px 0', borderBottom: '1px solid var(--border-soft)', gap: 8, fontSize: 12 }}
                    >
                      <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                      <span className={`num small ${(x.inflow ?? 0) >= 0 ? 'up' : 'down'}`} style={{ flex: '0 0 auto' }}>
                        {(x.inflow ?? 0) >= 0 ? '+' : ''}{fmt.big(x.inflow)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="muted small">没有资金流向数据。</div>
                )}
              </div>
            </div>
            <div
              className="small"
              style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)', color: 'var(--text-sub)', lineHeight: 1.85 }}
            >
              {weeksNote}
            </div>
          </>
        ) : (
          renderFallback({
            busy: marketBusyNow,
            error: marketError,
            emptyText: '行情没回来，指数、行业和资金都还看不到。',
            onRetry: onRetryMarket,
            busyText: '正在拉全市场行情，稍等…',
          })
        )}
      </Card>

      <Card
        title="今日标的"
        desc={
          picks
            ? `扫描 ${picks.scanned ?? '--'} 只 · 命中 ${picks.matched ?? pickList.length} 只`
            : picksBusyNow
              ? '正在扫描…'
              : '形态 + 量价 + 资金'
        }
        extra={
          <Button size="small" icon={<ReloadOutlined />} loading={picksBusy} onClick={onRetryPicks}>
            重扫
          </Button>
        }
      >
        {picksError && pickList.length > 0 && (
          <div className="small" style={{ color: 'var(--up)', marginBottom: 6 }}>重扫失败：{picksError}。下面是上一次的结果。</div>
        )}
        {pickList.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0 20px' }}>
            {pickList.map((h: any) => (
              <div
                key={h.code}
                onClick={() => nav(h.code)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '9px 6px',
                  margin: '0 -6px',
                  borderRadius: 8,
                  borderBottom: '1px solid var(--border-soft)',
                  cursor: 'pointer',
                }}
              >
                <div className="stock-avatar" style={{ marginTop: 1 }}>{(h.name || h.code || '?').slice(0, 1)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-between" style={{ gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                      <b className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.name || h.code}
                      </b>
                      <span className="muted mono small">{h.code}</span>
                    </span>
                    <span className="chip" style={{ flex: '0 0 auto' }}>{h.score ?? '--'} 分</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{h.industry || '行业未知'}</span>
                    <span className="num">{fmt.price(h.price)}</span>
                    <span className={`num ${trendClass(h.pct)}`}>{fmt.pct(h.pct)}</span>
                    {h.main_inflow !== null && h.main_inflow !== undefined && (
                      <span className={`num ${trendClass(h.main_inflow)}`}>主力 {fmt.big(h.main_inflow)}</span>
                    )}
                  </div>
                  <div
                    className="small"
                    style={{
                      marginTop: 3,
                      color: 'var(--text-sub)',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {(h.signals ?? []).map((s: any) => s.reason).filter(Boolean).join('；') || '形态命中，细节等开盘后再看'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '6px 0' }}>
            <EmptyState
              icon={picksBusyNow ? '◌' : '✦'}
              text={
                picksBusyNow
                  ? '正在扫最近 150 只活跃股的日线，通常要 30–90 秒，先别关页面。'
                  : picksError
                    ? `标的扫描没返回：${picksError}。这个接口要逐只拉 K 线，慢是常态，点「重扫」再试。`
                    : `扫描 ${picks?.scanned ?? 150} 只，0 只同时满足形态和量价。今天不出手也是仓位，别为了交易而交易。`
              }
            />
          </div>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- 交易流水 */

function TradesView({
  trades,
  filtered,
  side,
  setSide,
  keyword,
  setKeyword,
  columns,
  error,
  onRetry,
}: {
  trades: any[]
  filtered: any[]
  side: string
  setSide: (v: string) => void
  keyword: string
  setKeyword: (v: string) => void
  columns: any[]
  error: string
  onRetry: () => void
}) {
  const totals = useMemo(() => {
    let buy = 0
    let sell = 0
    let fee = 0
    let realized = 0
    let buyCount = 0
    let sellCount = 0
    for (const t of trades) {
      const amount = (t.price ?? 0) * (t.qty ?? 0)
      if (t.side === 'buy') {
        buy += amount
        buyCount += 1
      } else {
        sell += amount
        sellCount += 1
      }
      fee += t.fee ?? 0
      realized += t.realized ?? 0
    }
    return { buy, sell, fee, realized, buyCount, sellCount }
  }, [trades])

  const noData = !!error && trades.length === 0

  return (
    <>
      <div className="kpi-grid">
        <Kpi
          label="交易笔数"
          value={noData ? '--' : `${trades.length}`}
          sub={noData ? <span className="muted">流水没取到</span> : <span className="muted">买入 {totals.buyCount} 笔 · 卖出 {totals.sellCount} 笔</span>}
        />
        <Kpi
          label="累计买入"
          value={noData ? '--' : `¥${fmt.money(totals.buy)}`}
          sub={<span className="muted">按成交价 × 数量</span>}
        />
        <Kpi
          label="累计卖出"
          value={noData ? '--' : `¥${fmt.money(totals.sell)}`}
          sub={<span className="muted">不含手续费</span>}
        />
        <Kpi
          label="已实现盈亏"
          value={noData ? '--' : fmt.signed(totals.realized)}
          color={!noData && totals.realized > 0 ? UP : !noData && totals.realized < 0 ? DOWN : undefined}
          sub={<span className="muted">FIFO 配对 · 费用 {noData ? '--' : `¥${fmt.money(totals.fee)}`}</span>}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <Card
          title="交易流水"
          desc={error ? '流水没取到' : `${trades.length} 笔 · 可编辑`}
          extra={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Segmented
                size="small"
                value={side}
                onChange={(v) => setSide(String(v))}
                options={[{ label: '全部', value: 'all' }, { label: '买入', value: 'buy' }, { label: '卖出', value: 'sell' }]}
              />
              <Input
                size="small"
                allowClear
                prefix={<SearchOutlined style={{ color: 'var(--text-dim)' }} />}
                placeholder="代码 / 名称"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 150 }}
              />
            </div>
          }
          pad={false}
        >
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 16px', fontSize: 12, color: 'var(--up)' }}>
              交易流水没取到：{error}
              <Button size="small" type="text" onClick={onRetry} style={{ color: 'var(--accent)' }}>重试</Button>
            </div>
          )}
          {filtered.length ? (
            <Table
              dataSource={filtered}
              columns={columns as any}
              rowKey="id"
              size="small"
              scroll={{ x: 1040 }}
              pagination={{ pageSize: 12, size: 'small', showSizeChanger: false }}
              summary={(rows) => {
                const buy = rows.reduce((a, r) => a + (r.side === 'buy' ? r.price * r.qty : 0), 0)
                const sell = rows.reduce((a, r) => a + (r.side === 'sell' ? r.price * r.qty : 0), 0)
                const fee = rows.reduce((a, r) => a + (r.fee || 0), 0)
                const realized = rows.reduce((a, r) => a + (r.realized || 0), 0)
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={5}><span className="muted small">本页合计</span></Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right"><span className="num small">买 {fmt.money(buy)} / 卖 {fmt.money(sell)}</span></Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right"><span className="num small muted">{fmt.price(fee)}</span></Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right"><span className={`num small ${trendClass(realized)}`}>{fmt.signed(realized)}</span></Table.Summary.Cell>
                    <Table.Summary.Cell index={8} colSpan={2} />
                  </Table.Summary.Row>
                )
              }}
            />
          ) : (
            <EmptyState
              text={trades.length ? '没有符合条件的交易，换个关键词或方向试试。' : '还没有交易记录，点右上角「记录交易」记下第一笔。'}
              icon="▤"
            />
          )}
        </Card>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- 交易编辑 */

function TradeEditor({ open, editing, onClose, onDone }: { open: boolean; editing: any; onClose: () => void; onDone: () => void }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState('')
  const code = Form.useWatch('code', form)
  const side = Form.useWatch('side', form)
  const price = Form.useWatch('price', form)
  const qty = Form.useWatch('qty', form)

  useEffect(() => {
    if (!open) return
    if (editing) {
      form.setFieldsValue({ ...editing, trade_date: dayjs(editing.trade_date) })
    } else {
      form.resetFields()
      form.setFieldsValue({ side: 'buy', qty: 100, fee: 5, trade_date: dayjs() })
    }
  }, [open, editing])

  useEffect(() => {
    if (side && price && qty) {
      setPreview(`${side === 'buy' ? '买入' : '卖出'} ${qty} 股 × ${price} = ¥${fmt.money(price * qty)}`)
    } else setPreview('')
  }, [side, price, qty])

  const submit = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      const payload = { ...v, code: v.code || code, trade_date: v.trade_date.format('YYYY-MM-DD') }
      if (editing) await api.put(`/api/portfolio/trades/${editing.id}`, payload)
      else await api.post('/api/portfolio/trades', payload)
      message.success(editing ? '已更新' : '已记录，现金与资产已重算')
      onClose()
      onDone()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? '编辑交易' : '记录交易'} open={open} onCancel={onClose} onOk={submit} okText="保存" cancelText="取消" confirmLoading={saving}>
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="code" label="股票代码" rules={[{ required: true, pattern: /^\d{6}$/, message: '6 位数字' }]}>
            <Input maxLength={6} placeholder="600519" />
          </Form.Item>
          <Form.Item name="side" label="方向" rules={[{ required: true }]}>
            <Select options={[{ label: '买入', value: 'buy' }, { label: '卖出', value: 'sell' }]} />
          </Form.Item>
          <Form.Item name="price" label="成交价" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} precision={3} />
          </Form.Item>
          <Form.Item name="qty" label="数量（股）" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={100} step={100} />
          </Form.Item>
          <Form.Item name="trade_date" label="交易日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fee" label="手续费合计">
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
          </Form.Item>
        </div>
        <Form.Item name="name" label="股票名称（可选）">
          <Input placeholder="自动获取" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input placeholder="交易理由 / 复盘备注" />
        </Form.Item>
        {preview && <div className="muted small" style={{ marginTop: -6 }}>{preview}</div>}
      </Form>
    </Modal>
  )
}
