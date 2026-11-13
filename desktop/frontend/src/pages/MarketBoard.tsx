import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Drawer, Input, Segmented, Select, Skeleton, Table, Tag, Tooltip, message } from 'antd'
import { ReloadOutlined, RiseOutlined, FallOutlined, FireOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState } from '../components/ui'
import HeatmapChart, { filterHeatmapGroups } from '../components/HeatmapChart'
import type { HeatDirection, HeatGroup, HeatStock } from '../components/HeatmapChart'
import { fmt, trendClass } from '../utils'
import { useTheme } from '../ThemeContext'

const TABS = [
  { label: '板块跟踪', value: 'boards' },
  { label: '市场情绪', value: 'mood' },
  { label: '个股热图', value: 'heatmap' },
  { label: '形态选股', value: 'patterns' },
]

export default function MarketBoard() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const initial = params.get('tab')
  const [tab, setTab] = useState(['mood', 'heatmap', 'patterns'].includes(initial ?? '') ? (initial as string) : 'boards')

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <Segmented value={tab} onChange={(v) => setTab(v as string)} options={TABS} />
        <span className="muted small">行业 / 概念 · 市场情绪 · 个股热图 · 形态选股</span>
      </div>
      {tab === 'boards' && <BoardsTab nav={nav} />}
      {tab === 'mood' && <MoodTab nav={nav} />}
      {tab === 'heatmap' && <HeatmapTab nav={nav} />}
      {tab === 'patterns' && <PatternsTab nav={nav} />}
    </div>
  )
}

function BoardsTab({ nav }: { nav: (p: string) => void }) {
  const [kind, setKind] = useState('industry')
  const [sort, setSort] = useState('pct')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get<any[]>(`/api/market/boards?kind=${kind}&sort=${sort}&limit=120`)
      setRows(r)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [kind, sort])

  const openBoard = async (b: any) => {
    setDetail({ meta: b, stocks: [] })
    setOpen(true)
    setDetailLoading(true)
    try {
      const d = await api.get<any>(`/api/market/board/${b.code}`)
      setDetail(d)
    } catch {
      /* keep the board header visible */
    } finally {
      setDetailLoading(false)
    }
  }

  const upCount = rows.filter((r) => (r.pct ?? 0) > 0).length
  const leader = rows[0]
  const inflow = [...rows].sort((a, b) => (b.inflow ?? 0) - (a.inflow ?? 0))[0]

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="card kpi">
          <div className="kpi-label"><RiseOutlined /> 领涨板块</div>
          <div className="kpi-value small">{leader?.name ?? '--'}</div>
          <div className="kpi-sub up">{leader ? fmt.pct(leader.pct) : '--'} · 领涨 {leader?.leader ?? '--'}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><FireOutlined /> 资金净流入</div>
          <div className="kpi-value small">{inflow?.name ?? '--'}</div>
          <div className="kpi-sub up">{fmt.big(inflow?.inflow)}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><FallOutlined /> 上涨板块</div>
          <div className="kpi-value num small">{upCount} <span className="muted" style={{ fontSize: 13 }}>/ {rows.length}</span></div>
          <div className="kpi-sub muted">按当前排序统计</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">板块广度</div>
          <div className="progress-track" style={{ marginTop: 14 }}>
            <div className="progress-fill" style={{ width: `${rows.length ? (upCount / rows.length) * 100 : 0}%`, background: 'var(--up)' }} />
          </div>
          <div className="kpi-sub muted">上涨占比 {rows.length ? ((upCount / rows.length) * 100).toFixed(0) : 0}%</div>
        </div>
      </div>

      <Card
        title="板块一览"
        desc={kind === 'industry' ? '行业板块' : '概念板块'}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Segmented size="small" value={kind} onChange={(v) => setKind(v as string)} options={[{ label: '行业', value: 'industry' }, { label: '概念', value: 'concept' }]} />
            <Select size="small" value={sort} onChange={setSort} style={{ width: 110 }} options={[{ label: '按涨幅', value: 'pct' }, { label: '按资金流入', value: 'inflow' }]} />
            <Button size="small" icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          </div>
        }
        pad={false}
      >
        {loading && !rows.length ? (
          <div className="card-pad"><Skeleton active paragraph={{ rows: 8 }} /></div>
        ) : (
          <Table
            size="small"
            rowKey="code"
            dataSource={rows}
            pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
            onRow={(r) => ({ onClick: () => openBoard(r), style: { cursor: 'pointer' } })}
            columns={[
              { title: '板块', dataIndex: 'name', render: (v: string, r: any) => <span><b>{v}</b> <span className="muted mono small">{r.code}</span></span> },
              { title: '涨跌幅', dataIndex: 'pct', align: 'right', sorter: (a: any, b: any) => (a.pct ?? 0) - (b.pct ?? 0), render: (v: number) => <span className={`num ${trendClass(v)}`} style={{ fontWeight: 600 }}>{fmt.pct(v)}</span> },
              { title: '主力净流入', dataIndex: 'inflow', align: 'right', sorter: (a: any, b: any) => (a.inflow ?? 0) - (b.inflow ?? 0), render: (v: number) => <span className={`num ${(v ?? 0) >= 0 ? 'up' : 'down'}`}>{fmt.big(v)}</span> },
              { title: '上涨/下跌', render: (_: any, r: any) => <span className="num small"><span className="up">{r.up ?? '--'}</span> / <span className="down">{r.down ?? '--'}</span></span> },
              {
                title: '领涨股',
                render: (_: any, r: any) => (
                  <span className="small">
                    <span
                      className="link"
                      onClick={(e) => { e.stopPropagation(); if (r.leader_code) nav(`/stock/${r.leader_code}`) }}
                    >
                      {r.leader ?? '--'}
                    </span>
                    {r.leader_pct !== null && r.leader_pct !== undefined && <span className={`num small ${trendClass(r.leader_pct)}`} style={{ marginLeft: 6 }}>{fmt.pct(r.leader_pct)}</span>}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer title={detail?.meta?.name ? `${detail.meta.name} · 成分股` : '板块成分股'} open={open} onClose={() => setOpen(false)} width={640}>
        {detail?.meta && (
          <div className="row-between" style={{ marginBottom: 12 }}>
            <div>
              <span className={`num ${trendClass(detail.meta.pct)}`} style={{ fontSize: 24, fontWeight: 700 }}>{fmt.pct(detail.meta.pct)}</span>
              <span className="muted small" style={{ marginLeft: 10 }}>主力净流入 {fmt.big(detail.meta.inflow)}</span>
            </div>
            <span className="muted small">上涨 {detail.meta.up ?? '--'} · 下跌 {detail.meta.down ?? '--'}</span>
          </div>
        )}
        <Table
          size="small"
          rowKey="code"
          loading={detailLoading}
          dataSource={detail?.stocks ?? []}
          locale={{ emptyText: <EmptyState text="当前数据源未提供该板块的成分股明细；东方财富板块接口恢复后会自动补全。" /> }}
          pagination={{ pageSize: 20, size: 'small', showSizeChanger: false }}
          onRow={(r) => ({ onClick: () => { setOpen(false); nav(`/stock/${r.code}`) }, style: { cursor: 'pointer' } })}
          columns={[
            { title: '股票', dataIndex: 'name', render: (v: string, r: any) => <span><b>{v}</b> <span className="muted mono small">{r.code}</span></span> },
            { title: '现价', dataIndex: 'price', align: 'right', render: (v: number) => <span className="num">{fmt.price(v)}</span> },
            { title: '涨跌幅', dataIndex: 'pct', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
            { title: '总市值', dataIndex: 'mcap', align: 'right', render: (v: number) => <span className="num">{fmt.big(v)}</span> },
          ]}
        />
      </Drawer>
    </div>
  )
}

function MoodTab({ nav }: { nav: (p: string) => void }) {
  const [market, setMarket] = useState<any>(null)
  const [limitUp, setLimitUp] = useState<any[]>([])
  const [limitDown, setLimitDown] = useState<any[]>([])
  const [ranking, setRanking] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [m, up, down, rank] = await Promise.all([
        api.get<any>('/api/market/state'),
        api.get<any[]>('/api/market/limitpool?direction=up&limit=20'),
        api.get<any[]>('/api/market/limitpool?direction=down&limit=10'),
        api.get<any[]>('/api/market/ranking?by=pct&limit=8'),
      ])
      setMarket(m)
      setLimitUp(up)
      setLimitDown(down)
      setRanking(rank)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading && !market) return <div className="card card-pad"><Skeleton active paragraph={{ rows: 8 }} /></div>
  if (!market) return <Card><EmptyState text="市场情绪加载失败" icon="◌" /></Card>

  const b = market.breadth ?? {}
  const total = Math.max((b.up ?? 0) + (b.down ?? 0) + (b.flat ?? 0), 1)
  const tone = market.verdict?.tone === 'up' ? 'var(--up)' : market.verdict?.tone === 'down' ? 'var(--down)' : 'var(--text-sub)'

  return (
    <div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="市场温度" desc={market.verdict?.label}>
          <div className="verdict-row">
            <div className="score-ring" style={{ width: 120, height: 120, flex: '0 0 120px', background: `conic-gradient(${tone} ${(market.score ?? 0) * 3.6}deg, var(--tag-bg) 0deg)` }}>
              <div className="score-inner" style={{ width: 98, height: 98 }}>
                <b style={{ color: tone, fontSize: 30 }}>{market.score}</b>
                <span>市场温度</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: tone }}>{market.verdict?.label}</div>
              <div className="muted small" style={{ marginTop: 6 }}>涨跌比 {(b.up ?? 0)} : {(b.down ?? 0)}，赚钱效应{(b.up ?? 0) > (b.down ?? 0) ? '偏强' : '偏弱'}</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(market.indices ?? []).map((i: any) => (
                  <span key={i.code} className={`chip ${i.trend === '多头' ? 'up' : i.trend === '空头' ? 'down' : ''}`}>{i.short} {i.trend}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="breadth-bar">
              <span style={{ width: `${((b.up ?? 0) / total) * 100}%`, background: 'var(--up)' }} />
              <span style={{ width: `${((b.flat ?? 0) / total) * 100}%`, background: 'var(--text-dim)' }} />
              <span style={{ width: `${((b.down ?? 0) / total) * 100}%`, background: 'var(--down)' }} />
            </div>
            <div className="breadth-labels">
              <span className="up">涨 {b.up ?? 0}</span>
              <span>平 {b.flat ?? 0}</span>
              <span className="down">跌 {b.down ?? 0}</span>
            </div>
            <div className="market-mini" style={{ marginTop: 12 }}>
              <div><span>涨停</span><b className="up">{b.limit_up ?? 0}</b></div>
              <div><span>跌停</span><b className="down">{b.limit_down ?? 0}</b></div>
              <div><span>成交额</span><b>{fmt.big(market.turnover)}</b></div>
              <div><span>上涨占比</span><b>{b.up_ratio ?? 0}%</b></div>
            </div>
          </div>
        </Card>

        <Card title="涨停池" desc={`${limitUp.length} 只 · 点击查看个股`}>
          <div style={{ maxHeight: 330, overflowY: 'auto' }}>
            {limitUp.map((x) => (
              <div key={x.code} className="row-between" style={{ padding: '6px 0', borderBottom: '1px dashed var(--border-soft)', cursor: 'pointer' }} onClick={() => nav(`/stock/${x.code}`)}>
                <span className="small"><b>{x.name}</b> <span className="muted mono small">{x.code}</span> <span className="muted small">{x.industry}</span></span>
                <span className="num up" style={{ fontWeight: 600 }}>{fmt.pct(x.pct)}</span>
              </div>
            ))}
            {!limitUp.length && <EmptyState text="暂无涨停股" icon="○" />}
          </div>
          {limitDown.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="muted small" style={{ marginBottom: 4 }}>跌停 {limitDown.length} 只</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {limitDown.map((x) => (
                  <span key={x.code} className="chip down">{x.name} {fmt.pct(x.pct)}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid-2-even" style={{ marginTop: 14 }}>
        <Card title="今日强势股" desc="涨幅榜" pad={false}>
          <Table
            size="small"
            rowKey="code"
            dataSource={ranking}
            pagination={false}
            onRow={(r) => ({ onClick: () => nav(`/stock/${r.code}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: '股票', dataIndex: 'name', render: (v: string, r: any) => <span><b>{v}</b> <span className="muted mono small">{r.code}</span></span> },
              { title: '现价', dataIndex: 'price', align: 'right', render: (v: number) => <span className="num">{fmt.price(v)}</span> },
              { title: '涨跌幅', dataIndex: 'pct', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
              { title: '成交额', dataIndex: 'amount', align: 'right', render: (v: number) => <span className="num small">{fmt.big(v)}</span> },
            ]}
          />
        </Card>
        <Card title="指数趋势" desc="20/60 日均线 + RSI">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(market.indices ?? []).map((i: any) => (
              <div key={i.code} className="row-between" style={{ padding: '6px 0', borderBottom: '1px dashed var(--border-soft)' }}>
                <span className="small"><b>{i.name}</b></span>
                <span className="small">
                  <span className={`num ${trendClass(i.pct)}`} style={{ marginRight: 8 }}>{fmt.pct(i.pct)}</span>
                  <Tag color={i.trend === '多头' ? 'red' : i.trend === '空头' ? 'green' : 'default'} style={{ margin: 0 }}>{i.trend}</Tag>
                  <span className="muted" style={{ marginLeft: 6 }}>RSI {i.rsi ?? '--'} · 20日线 {i.above20 ? '上' : '下'}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function PatternsTab({ nav }: { nav: (p: string) => void }) {
  const [catalog, setCatalog] = useState<any[]>([])
  const [pattern, setPattern] = useState('ma_bull')
  const [universe, setUniverse] = useState('amount')
  const [limit, setLimit] = useState(200)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get<any[]>('/api/market/patterns').then(setCatalog).catch(() => {})
  }, [])

  const scan = async (pat = pattern, uni = universe, lim = limit) => {
    setLoading(true)
    try {
      const r = await api.get<any>(`/api/market/patterns/scan?pattern=${pat}&universe=${uni}&limit=${lim}`)
      setResult(r)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (catalog.length) scan()
  }, [catalog.length])

  const active = catalog.find((p) => p.id === pattern)

  return (
    <div>
      <Card title="形态选股" desc="扫描成交额/市值靠前的股票，识别经典技术形态与九转序列">
        <div className="pattern-list">
          {catalog.map((p) => (
            <button
              key={p.id}
              className={`pattern-chip ${pattern === p.id ? 'active' : ''}`}
              onClick={() => { setPattern(p.id); scan(p.id, universe, limit) }}
            >
              <span className="pattern-name">{p.name}</span>
              <span className="pattern-tag">{p.tag}</span>
            </button>
          ))}
        </div>
        <div className="row-between" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
          <div className="muted small" style={{ flex: 1, minWidth: 260 }}>
            {active?.desc ?? '选择一种形态开始扫描'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select
              size="small"
              value={universe}
              onChange={(v) => { setUniverse(v); scan(pattern, v, limit) }}
              options={[{ label: '成交额前列', value: 'amount' }, { label: '市值前列', value: 'mcap' }]}
              style={{ width: 110 }}
            />
            <Select
              size="small"
              value={limit}
              onChange={(v) => { setLimit(v); scan(pattern, universe, v) }}
              options={[{ label: '前 100 只', value: 100 }, { label: '前 200 只', value: 200 }, { label: '前 300 只', value: 300 }]}
              style={{ width: 100 }}
            />
            <Button size="small" type="primary" loading={loading} onClick={() => scan()}>开始扫描</Button>
          </div>
        </div>
        {result && (
          <div className="muted small" style={{ marginTop: 8 }}>
            已扫描 {result.scanned} 只，命中 {result.matches.length} 只 · 耗时 {result.elapsed}s
          </div>
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Card title={active ? `${active.name} · 命中` : '扫描结果'} desc="点击查看个股详情" pad={false}>
          {loading && !result ? (
            <div className="card-pad"><Skeleton active paragraph={{ rows: 6 }} /></div>
          ) : (
            <Table
              size="small"
              rowKey="code"
              dataSource={result?.matches ?? []}
              pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
              onRow={(r) => ({ onClick: () => nav(`/stock/${r.code}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: '股票', dataIndex: 'name', render: (v: string, r: any) => <span><b>{v}</b> <span className="muted mono small">{r.code}</span></span> },
                { title: '现价', dataIndex: 'price', align: 'right', render: (v: number) => <span className="num">{fmt.price(v)}</span> },
                { title: '涨跌幅', dataIndex: 'pct', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                { title: '行业', dataIndex: 'industry', render: (v: string) => <span className="muted small">{v || '--'}</span> },
                { title: '形态说明', dataIndex: 'reason', render: (v: string) => <span className="small">{v}</span> },
                { title: '评分', dataIndex: 'score', align: 'right', sorter: (a: any, b: any) => a.score - b.score, render: (v: number) => <span className="num" style={{ fontWeight: 600 }}>{v}</span> },
              ]}
            />
          )}
        </Card>
      </div>
    </div>
  )
}

function HeatmapTab({ nav }: { nav: (p: string) => void }) {
  const { colors } = useTheme()
  const [groups, setGroups] = useState<HeatGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [dimension, setDimension] = useState<'industry' | 'market'>('industry')
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState<HeatDirection>('all')

  const load = async () => {
    setLoading(true)
    try {
      const d = await api.get<any>('/api/market/heatmap?groups=100&per_group=2000')
      setGroups(Array.isArray(d?.groups) ? d.groups : [])
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 后端当前可能按行业分组，也可能在行业字段缺失时退回市场分组。
  // 市场维度可以稳定地从前缀重排；行业维度在没有 industry 字段时保留原分组并给出说明。
  const processed = useMemo(() => {
    if (dimension === 'market') return { groups: regroupByMarket(groups), fallback: false }
    return regroupByIndustry(groups)
  }, [groups, dimension])

  const displayGroups = processed.groups
  const industryFallback = dimension === 'industry' && processed.fallback
  const rootLabel = dimension === 'industry' && !industryFallback ? '行业' : '市场'

  const filtered = useMemo(
    () => filterHeatmapGroups(displayGroups, query, direction),
    [displayGroups, query, direction],
  )
  const stocks = useMemo(() => filtered.flatMap((g) => g.children), [filtered])
  const totalStocks = useMemo(() => groups.reduce((n, g) => n + (g.children?.length ?? 0), 0), [groups])
  const upCount = stocks.filter((s) => (Number(s.pct) || 0) > 0).length
  const downCount = stocks.filter((s) => (Number(s.pct) || 0) < 0).length
  const avgPct = stocks.length
    ? stocks.reduce((sum, s) => sum + (Number.isFinite(Number(s.pct)) ? Number(s.pct) : 0), 0) / stocks.length
    : 0

  const reset = () => {
    setQuery('')
    setDirection('all')
    setDimension('industry')
  }

  const handleSelect = useCallback((code: string) => nav(`/stock/${code}`), [nav])

  const groupText = dimension === 'market'
    ? '按市场分组'
    : industryFallback
      ? '按市场分组（行业字段暂缺）'
      : '按行业分组'

  return (
    <Card
      title="个股热图"
      desc={`${groupText} · 面积=总市值 · 颜色=涨跌幅`}
      extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button>}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <Segmented
          size="small"
          value={dimension}
          onChange={(v) => setDimension(v as 'industry' | 'market')}
          options={[{ label: '行业', value: 'industry' }, { label: '市场', value: 'market' }]}
        />
        <Input
          allowClear
          size="small"
          placeholder="搜索代码 / 名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 190 }}
        />
        <Segmented
          size="small"
          value={direction}
          onChange={(v) => setDirection(v as HeatDirection)}
          options={[
            { label: '全部', value: 'all' },
            { label: '只看上涨', value: 'up' },
            { label: '只看下跌', value: 'down' },
          ]}
        />
        <Button size="small" onClick={reset}>重置</Button>
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          单击板块下钻 · 单击个股查看详情
        </span>
      </div>

      {industryFallback && (
        <div
          className="muted small"
          style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--tag-bg)', lineHeight: 1.6 }}
        >
          数据源当前未返回个股行业字段，行业分组暂按市场分组展示；接口补齐后会按行业拆开。
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 10,
          padding: '8px 10px',
          border: '1px solid var(--border-soft)',
          borderRadius: 8,
        }}
      >
        <span className="small"><b className="up">{upCount}</b> 上涨</span>
        <span className="small"><b className="down">{downCount}</b> 下跌</span>
        <span className="small">
          平均涨跌 <b className={(Number(avgPct) || 0) >= 0 ? 'up' : 'down'}>{fmt.pct(avgPct)}</b>
        </span>
        <span className="muted small">筛选后 {stocks.length} 只 / 全量 {totalStocks} 只</span>
        <div className="heat-legend" style={{ marginLeft: 'auto', marginTop: 0 }}>
          <span className="down">-10%</span>
          <div
            style={{
              width: 180,
              height: 8,
              borderRadius: 99,
              background: `linear-gradient(90deg, ${colors.down}, ${colors.axis}, ${colors.up})`,
            }}
          />
          <span className="up">+10%</span>
        </div>
      </div>

      {loading && !groups.length ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : groups.length ? (
        <HeatmapChart
          groups={displayGroups}
          query={query}
          direction={direction}
          rootLabel={rootLabel}
          onSelect={handleSelect}
        />
      ) : (
        <EmptyState text="热图数据暂未返回，点右上角刷新重试" icon="▦" />
      )}
    </Card>
  )
}

const MARKET_NAMES = new Set(['沪市主板', '深市主板', '科创板', '创业板', '北交所', '其他'])

function marketOfStock(stock: HeatStock) {
  if (stock.market && MARKET_NAMES.has(stock.market)) return stock.market
  const code = String(stock.code ?? '')
  if (code.startsWith('688') || code.startsWith('689')) return '科创板'
  if (code.startsWith('300') || code.startsWith('301') || code.startsWith('302')) return '创业板'
  if (code.startsWith('600') || code.startsWith('601') || code.startsWith('603') || code.startsWith('605')) return '沪市主板'
  if (code.startsWith('000') || code.startsWith('001') || code.startsWith('002') || code.startsWith('003')) return '深市主板'
  if (code.startsWith('920') || code.startsWith('4') || code.startsWith('8')) return '北交所'
  return '其他'
}

function makeGroup(name: string, items: HeatStock[]): HeatGroup {
  const sorted = [...items].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
  const value = sorted.reduce((sum, s) => sum + (Number(s.value) || 0), 0)
  const pct = value > 0
    ? sorted.reduce((sum, s) => sum + (Number(s.pct) || 0) * (Number(s.value) || 0), 0) / value
    : 0
  return { name, value: +value.toFixed(2), pct: +pct.toFixed(2), children: sorted }
}

function sortGroups(map: Map<string, HeatStock[]>): HeatGroup[] {
  return [...map.entries()]
    .map(([name, items]) => makeGroup(name, items))
    .filter((g) => g.children.length)
    .sort((a, b) => b.value - a.value)
}

function regroupByMarket(groups: HeatGroup[]): HeatGroup[] {
  const buckets = new Map<string, HeatStock[]>()
  groups.forEach((g) => {
    (g.children ?? []).forEach((c) => {
      const key = marketOfStock(c)
      const list = buckets.get(key) ?? []
      list.push(c)
      buckets.set(key, list)
    })
  })
  return sortGroups(buckets)
}

function regroupByIndustry(groups: HeatGroup[]): { groups: HeatGroup[]; fallback: boolean } {
  const hasIndustry = groups.some((g) => (g.children ?? []).some((c) => !!c.industry))
  if (!hasIndustry) {
    const fallback = groups.length > 0 && groups.every((g) => MARKET_NAMES.has(g.name))
    return { groups, fallback }
  }
  const buckets = new Map<string, HeatStock[]>()
  groups.forEach((g) => {
    (g.children ?? []).forEach((c) => {
      const key = (c.industry || g.name || '其他').trim() || '其他'
      const list = buckets.get(key) ?? []
      list.push(c)
      buckets.set(key, list)
    })
  })
  return { groups: sortGroups(buckets), fallback: false }
}
