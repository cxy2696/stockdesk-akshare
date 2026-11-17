import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, InputNumber, Segmented, Skeleton, Table, Tag, Tooltip } from 'antd'
import { ArrowRightOutlined, CompassOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState } from '../components/ui'
import { RatingTag, TierTag } from '../components/DecisionCard'
import { fmt, trendClass } from '../utils'

type Filter = 'all' | 'good' | 'actionable'

export default function Decision() {
  const nav = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [scan, setScan] = useState(() => Number(localStorage.getItem('stockdesk.scanCount') || 300))
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api.get<any>(`/api/decision?scan=${scan}&seed=${seed}`))
    } catch (e: any) {
      setError(e?.message ?? '决策数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { localStorage.setItem('stockdesk.scanCount', String(scan)); load() }, [scan, seed])

  const rows = useMemo(() => {
    const all = data?.candidates ?? []
    if (filter === 'good') return all.filter((x: any) => x.rating === '好')
    if (filter === 'actionable') return all.filter((x: any) => x.tier === '执行' || x.tier === '确认')
    return all
  }, [data, filter])

  const counts = useMemo(() => {
    const all = data?.candidates ?? []
    return {
      good: all.filter((x: any) => x.rating === '好').length,
      mid: all.filter((x: any) => x.rating === '中').length,
      bad: all.filter((x: any) => x.rating === '差').length,
      execute: all.filter((x: any) => x.tier === '执行').length,
    }
  }, [data])
  if (loading && !data) return <div className="card card-pad"><Skeleton active paragraph={{ rows: 10 }} /><div className="muted small" style={{ marginTop: 8 }}>正在扫描全市场并计算买卖点，首次约十几秒。</div></div>
  if (!data) return <Card title="交易决策暂时不可用"><div className="muted small">{error || '请检查网络后重试。'}</div><Button icon={<ReloadOutlined />} onClick={load} style={{ marginTop: 10 }}>重试</Button></Card>

  const m = data.market ?? {}
  const f = data.forecast ?? {}
  const tone = m.label === '弱势' || m.label === '偏弱' ? 'var(--down)' : m.label === '强势' || m.label === '偏强' ? 'var(--up)' : 'var(--amber)'

  const columns = [
    {
      title: '股票',
      dataIndex: 'name',
      render: (_: any, r: any) => (
        <div className="table-stock" style={{ cursor: 'pointer' }} onClick={() => nav(`/stock/${r.code}`)}>
          <div className="stock-avatar">{(r.name || r.code || '?').slice(0, 1)}</div>
          <div>
            <div className="stock-name">{r.name || r.code}</div>
            <div className="stock-code mono">{r.code} · {r.industry || '--'}</div>
          </div>
        </div>
      ),
    },
    {
      title: '评级 / 操作',
      dataIndex: 'rating',
      width: 118,
      render: (_: any, r: any) => <RatingTag rating={r.rating} action={r.action} />,
      filters: [{ text: '好', value: '好' }, { text: '中', value: '中' }, { text: '差', value: '差' }],
      onFilter: (v: any, r: any) => r.rating === v,
    },
    {
      title: '层级',
      dataIndex: 'tier',
      width: 78,
      render: (v: string, r: any) => <Tooltip title={r.tier_text}><span><TierTag tier={v} /></span></Tooltip>,
    },
    { title: '现价', dataIndex: 'price', align: 'right' as const, width: 82, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    {
      title: '买入区间',
      dataIndex: 'buy_zone',
      width: 112,
      render: (z: number[]) => <span className="num small">{z?.[0] ?? '--'} – {z?.[1] ?? '--'}</span>,
    },
    {
      title: '止损 / 目标',
      width: 118,
      render: (_: any, r: any) => <span className="num small"><span className="down">{fmt.price(r.stop)}</span> / <span className="up">{fmt.price(r.target)}</span></span>,
    },
    {
      title: '盈亏比',
      dataIndex: 'risk_reward',
      align: 'right' as const,
      width: 70,
      sorter: (a: any, b: any) => (a.risk_reward || 0) - (b.risk_reward || 0),
      render: (v: number) => <span className={`num ${v >= 1.5 ? 'up' : 'muted'}`}>{v ?? '--'}</span>,
    },
    {
      title: '判断依据',
      dataIndex: 'reasons',
      render: (v: string[], r: any) => (
        <div className="small" style={{ lineHeight: 1.65, maxWidth: 430 }}>
          {(v || []).slice(0, 2).map((x, i) => <div key={i}>· {x}</div>)}
          {(r.risk_notes || []).length > 0 && <div style={{ color: 'var(--amber)' }}>⚠ {r.risk_notes[0]}</div>}
        </div>
      ),
    },
    {
      title: '',
      width: 36,
      render: (_: any, r: any) => <Button type="text" size="small" icon={<ArrowRightOutlined />} onClick={() => nav(`/stock/${r.code}`)} />,
    },
  ]

  return (
    <div>
      <Card
        title={<span>今日决策 <Tag color="blue" style={{ marginLeft: 8 }}><CompassOutlined /> {m.label ?? '--'}</Tag></span>}
        desc={`市场温度 ${m.score ?? '--'} · 扫描 ${data.scanned ?? '--'} 只 · 命中 ${data.matched ?? '--'} 只`}
        style={{ marginBottom: 14 }}
      >
        <div className="decision-brief">
          <div>
            <div className="muted small">候选分布</div>
            <div className="decision-counts">
              <span><b className="up">{counts.good}</b> 好</span>
              <span><b className="amber">{counts.mid}</b> 中</span>
              <span><b className="down">{counts.bad}</b> 差</span>
              <span className="muted">执行 {counts.execute}</span>
            </div>
          </div>
          <div>
            <div className="muted small">市场环境</div>
            <div className="small" style={{ marginTop: 3 }}>
              {f.state ?? m.label ?? '--'} · 5日 <b className={trendClass(f.expected_5d)}>{f.expected_5d == null ? '--' : fmt.pct(f.expected_5d * 100)}</b> · 上涨概率 <b>{f.prob_up == null ? '--' : `${Math.round(f.prob_up * 100)}%`}</b>
              <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => nav('/forecast')}>预测</Button>
            </div>
          </div>
          <div className="muted small decision-rule">
            {m.label === '弱势' ? '弱势环境：没有执行级就空仓等，别为了买而买。' : '只从好/中里挑；价格回到买区再动手，跌破止损先减。'}
          </div>
        </div>
      </Card>

      <Card
        title="今日候选：买卖点与好坏判断"
        desc="好→中→差排序；点击行看个股"
        extra={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented size="small" value={filter} onChange={(v) => setFilter(v as Filter)} options={[{ label: '全部', value: 'all' }, { label: '只看好', value: 'good' }, { label: '可执行/确认', value: 'actionable' }]} />
          <InputNumber size="small" min={30} max={data.universe_total || 6000} value={scan} style={{ width: 100 }}
            onChange={(v) => { if (v) setScan(Number(v)) }} onPressEnter={() => setSeed(Math.floor(Math.random() * 1_000_000_000))} />
          <Button size="small" onClick={() => setScan(data.universe_total || 6000)}>全部可扫描</Button>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => setSeed(Math.floor(Math.random() * 1_000_000_000))}>重新随机</Button>
        </div>}
        pad={false}
      >
        {rows.length ? (
          <Table rowKey="code" size="small" dataSource={rows} columns={columns as any} pagination={{ pageSize: 12, showSizeChanger: false }} />
        ) : <div className="card-pad"><EmptyState text={filter === 'good' ? '今天没有“好”级候选；弱势里空仓也是策略。' : '没有符合条件的候选，等下一次扫描。'} /></div>}
      </Card>

      <div className="muted small" style={{ marginTop: 10, lineHeight: 1.7 }}>
        好/中/差 = 值不值得做；执行/确认/预警/观察 = 是否已到买点。买区外不追，跌破止损先减。
        <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => nav('/guide')}>规则</Button>
      </div>
    </div>
  )
}
