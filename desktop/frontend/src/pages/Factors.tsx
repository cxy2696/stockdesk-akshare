import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Segmented, Select, Skeleton, Table, Tag, message } from 'antd'
import { FilterOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState, Kpi } from '../components/ui'
import { fmt, trendClass } from '../utils'

const CATEGORY_ORDER = ['momentum', 'value', 'volatility', 'liquidity', 'flow', 'sentiment', 'size']

function fmtScore(v?: number | null) {
  return v === null || v === undefined || !Number.isFinite(v) ? '--' : Number(v).toFixed(1)
}

function fmtZ(v?: number | null) {
  return v === null || v === undefined || !Number.isFinite(v) ? '--' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}`
}

function coverageTone(v: number) {
  if (v >= 0.8) return 'green'
  if (v >= 0.5) return 'blue'
  return 'orange'
}

export default function Factors() {
  const nav = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [market, setMarket] = useState('全部')
  const [search, setSearch] = useState('')
  const [minScore, setMinScore] = useState(50)

  const load = async () => {
    setLoading(true)
    try {
      const d = await api.get<any>('/api/factors?limit=6000')
      setData(d)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  const factors = data?.factors ?? []
  const stocks = data?.stocks ?? []
  const screening = data?.screening ?? {}
  const classification = data?.classification ?? {}
  const selected = useMemo(() => factors.filter((f: any) => f.selected), [factors])
  const rejected = useMemo(() => factors.filter((f: any) => !f.selected), [factors])
  const selectedByCategory = useMemo(() => {
    const out: Record<string, number> = {}
    for (const f of selected) out[f.category] = (out[f.category] ?? 0) + 1
    return out
  }, [selected])
  const markets = useMemo(() => {
    const set = new Set<string>()
    for (const r of stocks) if (r.market) set.add(r.market)
    return ['全部', ...Array.from(set)]
  }, [stocks])
  const filteredStocks = useMemo(() => {
    const q = search.trim().toUpperCase()
    const base = stocks.filter((r: any) => {
      if (market !== '全部' && r.market !== market) return false
      if (q && !String(r.code).includes(q) && !String(r.name || '').toUpperCase().includes(q)) return false
      return true
    })
    if (minScore <= 0) return base
    const scores = base.map((r: any) => Number(r.score)).filter((v: number) => Number.isFinite(v)).sort((a: number, b: number) => a - b)
    if (!scores.length) return []
    const qtl = (p: number) => scores[Math.min(scores.length - 1, Math.max(0, Math.floor((scores.length - 1) * p)))]
    const threshold = minScore === 50 ? qtl(0.5) : qtl(0.8)
    return base.filter((r: any) => (r.score ?? -1) >= threshold)
  }, [stocks, market, minScore, search])

  if (loading && !data) return <Card><Skeleton active paragraph={{ rows: 12 }} /></Card>
  if (!data?.ready) {
    return <Card><EmptyState text="暂无全市场快照，无法计算因子" icon={<FilterOutlined />} /></Card>
  }

  const catGroups = classification.category ?? []

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <Kpi label="数据日期" value={data.date ?? '--'} sub={`${data.total?.toLocaleString?.() ?? data.total ?? '--'} 只快照`} small />
        <Kpi label="入选因子" value={`${screening.selected_count ?? selected.length} / ${screening.total ?? factors.length}`}
          sub={`覆盖 ${Object.keys(selectedByCategory).length} 个类别`} small icon={<FilterOutlined />} />
        <Kpi label="市场状态" value={data.state ?? '--'} sub={`权重：${Object.entries(data.weights || {}).map(([k, v]) => `${catGroups.find((g: any) => g.key === k)?.label ?? k} ${Math.round(Number(v) * 100)}%`).join(' · ')}`} small />
        <Kpi label="候选股票" value={data.scanned?.toLocaleString?.() ?? data.scanned ?? '--'} sub={`展示前 ${data.stocks?.length ?? 0} 只`} small />
      </div>

      <Card
        title="因子筛选与分类"
        desc="覆盖率筛选 → 类别配额 → 横截面标准化 → 状态权重合成分数"
        extra={<Tag color="blue">横截面因子</Tag>}
      >
        <div className="factor-explain">
          <div><b>1. 覆盖率</b><span>每个因子先看当前快照有多少股票有真实值；低于 50% 不进入评分。</span></div>
          <div><b>2. 类别配额</b><span>动量 / 价值 / 波动 / 流动性 / 资金 / 情绪 / 规模，每类最多 2 个，总因子最多 10 个。</span></div>
          <div><b>3. 标准化</b><span>每个因子在全市场做横截面排名，再转成正态分；方向为负的因子取反。</span></div>
          <div><b>4. 合成</b><span>类别内可用因子求均值，再按市场状态权重合成；缺失类别不补 0，只按可用类别重新归一。</span></div>
          <div><b>5. 分数含义</b><span>0–100 是横截面百分位，不是预期收益；历史 IC 需持久化每日快照，本页不伪造。</span></div>
          <div className="factor-trace muted mono">
            算法 {data.trace?.algorithm ?? '--'} · 快照 {data.trace?.snapshot_date ?? data.date ?? '--'} · {data.trace?.rows ?? data.total ?? '--'} 行 / {data.trace?.candidates ?? data.scanned ?? '--'} 只候选 · 来源 {data.source ?? '--'}
            {data.trace?.momentum_coverage === 0 ? ' · 当前快照源不提供 60 日动量，动量因子已明确剔除' : ''}
            {data.trace?.flow_coverage != null ? ` · 资金覆盖 ${(Number(data.trace.flow_coverage) * 100).toFixed(0)}%` : ''}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(7, Math.max(3, catGroups.length))}, minmax(0, 1fr))`, gap: 8, marginBottom: 12 }}>
          {CATEGORY_ORDER.filter((k) => catGroups.some((g: any) => g.key === k)).map((key) => {
            const g = catGroups.find((x: any) => x.key === key)
            return (
              <div key={key} className="card" style={{ padding: '9px 11px', boxShadow: 'none' }}>
                <div className="muted small">{g.label}</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{selectedByCategory[key] ?? 0}<span className="muted" style={{ fontSize: 11 }}> / {g.count}</span></div>
                <div className="muted" style={{ fontSize: 10 }}>{g.labels?.slice(0, 2).join(' · ')}</div>
              </div>
            )
          })}
        </div>

        <Table
          size="small"
          rowKey="name"
          dataSource={factors}
          pagination={{ pageSize: 12, size: 'small', showSizeChanger: false }}
          columns={[
            {
              title: '因子', dataIndex: 'label',
              render: (v: string, r: any) => (
                <div>
                  <b>{v}</b>
                  <div className="muted mono" style={{ fontSize: 10 }}>{r.name}</div>
                </div>
              ),
            },
            { title: '类别', dataIndex: 'category', render: (v: string) => <Tag>{catGroups.find((g: any) => g.key === v)?.label ?? v}</Tag> },
            { title: '周期', dataIndex: 'horizon', render: (v: string) => <span className="muted small">{v}</span> },
            { title: '来源', dataIndex: 'source', render: (v: string) => <span className="muted small">{v}</span> },
            { title: '方向', dataIndex: 'direction', render: (v: number) => <Tag color={v > 0 ? 'green' : 'orange'}>{v > 0 ? '正向' : '反向'}</Tag> },
            { title: '覆盖率', dataIndex: 'coverage', align: 'right', render: (v: number) => <Tag color={coverageTone(v)}>{`${((v ?? 0) * 100).toFixed(1)}%`}</Tag> },
            { title: '均值', dataIndex: ['stats', 'mean'], align: 'right', render: (v: number) => <span className="num">{fmtZ(v)}</span> },
            { title: '中位数', dataIndex: ['stats', 'median'], align: 'right', render: (v: number) => <span className="num">{fmtZ(v)}</span> },
            {
              title: '筛选结果',
              dataIndex: 'selected',
              render: (v: boolean, r: any) => (
                <div>
                  <Tag color={v ? 'green' : 'default'}>{v ? '入选' : '剔除'}</Tag>
                  <div className="muted" style={{ fontSize: 10 }}>{r.reason ?? '--'}</div>
                </div>
              ),
            },
          ]}
        />
        {rejected.length > 0 && (
          <div className="muted small" style={{ marginTop: 8 }}>
            剔除原因：{rejected.slice(0, 4).map((r: any) => `${r.label}（${r.reason}）`).join('；')}
            {rejected.length > 4 ? ` 等 ${rejected.length} 个` : ''}
          </div>
        )}
      </Card>

      <Card
        title="因子候选"
        desc="按状态权重合成的横截面分数；点击行进入个股详情"
        style={{ marginTop: 14 }}
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Segmented
              size="small"
              value={minScore}
              onChange={(v) => setMinScore(Number(v))}
              options={[{ label: '全部', value: 0 }, { label: '前 50%', value: 50 }, { label: '前 20%', value: 80 }]}
            />
            <Select size="small" value={market} onChange={setMarket} style={{ width: 110 }}
              options={markets.map((m) => ({ label: m, value: m }))} />
            <Input size="small" allowClear value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="代码 / 名称" style={{ width: 130 }} prefix={<ThunderboltOutlined />} />
            <ReloadOutlined style={{ cursor: 'pointer' }} onClick={load} />
          </div>
        }
        pad={false}
      >
        <Table
          size="small"
          rowKey="code"
          dataSource={filteredStocks}
          pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
          scroll={{ x: 1180 }}
          onRow={(r) => ({ onClick: () => nav(`/stock/${r.code}`), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: '股票', dataIndex: 'name',
              render: (v: string, r: any) => (
                <div><b>{v || '--'}</b> <span className="muted mono small">{r.code}</span>
                  <div className="muted" style={{ fontSize: 10 }}>{r.industry || r.market || '--'}</div>
                </div>
              ),
            },
            { title: '价格', dataIndex: 'price', align: 'right', render: (v: number) => <span className="num">{fmt.price(v)}</span> },
            { title: '涨跌', dataIndex: 'pct', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
            { title: '因子分', dataIndex: 'score', align: 'right', render: (v: number) => <b className="num" style={{ color: (v ?? 0) >= 80 ? 'var(--up)' : undefined }}>{fmtScore(v)}</b> },
            {
              title: '数据覆盖', dataIndex: 'coverage', align: 'right',
              render: (v: number, r: any) => (
                <div>
                  <Tag color={coverageTone(v)}>{`${Math.round((v ?? 0) * 100)}%`}</Tag>
                  <div className="muted" style={{ fontSize: 9 }}>{r.factor_hits}/{r.factor_total} 因子</div>
                </div>
              ),
            },
            ...CATEGORY_ORDER.map((key) => ({
              title: catGroups.find((g: any) => g.key === key)?.label ?? key,
              dataIndex: ['scores', key],
              align: 'right' as const,
              render: (v: number) => <span className="num muted" style={{ fontSize: 11 }}>{fmtZ(v)}</span>,
            })),
            { title: '60日动量', dataIndex: 'pct60', align: 'right', render: (v: number) => v == null ? <span className="muted small">源未提供</span> : <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
            { title: '资金占比', dataIndex: 'main_inflow_ratio', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{v == null ? '--' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`}</span> },
            { title: '成交额', dataIndex: 'amount', align: 'right', render: (v: number) => <span className="num muted">{fmt.big(v)}</span> },
            { title: 'PE / PB', render: (_: any, r: any) => <span className="num small">{fmt.price(r.pe, 1)} / {fmt.price(r.pb, 2)}</span>, align: 'right' },
            { title: '主力净流入', dataIndex: 'main_inflow', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.big(v)}</span> },
          ]}
        />
      </Card>
    </div>
  )
}
