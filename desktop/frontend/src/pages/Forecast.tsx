import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Skeleton, Table } from 'antd'
import { ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState, Kpi } from '../components/ui'
import { fmt, trendClass } from '../utils'

export default function Forecast() {
  const nav = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      // Forecast only needs the regime and the P^5 distribution.  It must not
      // wait for the decision page's 300-stock K-line scan.
      setData(await api.get<any>('/api/market/forecast'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  if (loading && !data) return <div className="card card-pad"><Skeleton active paragraph={{ rows: 8 }} /></div>
  if (!data) return <Card title="市场预测暂时不可用"><EmptyState text="模型或行情尚未就绪。" /><Button onClick={load} icon={<ReloadOutlined />}>重试</Button></Card>

  const f = data.forecast ?? {}
  const m = data.market ?? {}
  const b = m.breadth ?? {}
  const stateCols = [
    { title: '状态', dataIndex: 'label', render: (v: string) => <b>{v}</b> },
    { title: '5 日估算', dataIndex: 'mean_5d', align: 'right' as const, render: (v: number) => <span className={`num ${trendClass(v)}`}>{v == null ? '--' : fmt.pct(v * 100)}</span> },
    { title: '历史上涨比例', dataIndex: 'win_rate', align: 'right' as const, render: (v: number) => v == null ? '--' : `${v.toFixed(0)}%` },
    { title: '历史天数', dataIndex: 'days', align: 'right' as const, render: (v: number) => v ?? '--' },
    { title: '未来 5 日概率', dataIndex: 'next_prob', align: 'right' as const, render: (v: number) => `${((v || 0) * 100).toFixed(1)}%` },
  ]

  return (
    <div>
      <Card
        title="市场预测 · 未来 5 日"
        desc="HMM 状态转移 × 同状态历史收益；概率不是点位承诺"
        extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button>}
      >
        <div className="grid-3" style={{ marginBottom: 12 }}>
          <Kpi label="5 日状态条件收益" value={f.expected_5d == null ? '--' : fmt.pct(f.expected_5d * 100)} color={f.expected_5d == null ? undefined : f.expected_5d >= 0 ? 'var(--up)' : 'var(--down)'} sub="同状态历史均值" />
          <Kpi label="上涨概率" value={f.prob_up == null ? '--' : `${Math.round(f.prob_up * 100)}%`} sub="由收益/波动近似" />
          <Kpi label="当前市场" value={m.label ?? f.state ?? '--'} sub={`温度 ${m.score ?? '--'} · 置信度 ${f.confidence == null ? '--' : fmt.pct(f.confidence * 100, 0)}`} />
        </div>
        <div className="small" style={{ lineHeight: 1.9, marginBottom: 12 }}>
          全市场 <b className="up">{b.up ?? '--'}</b> 家上涨 / <b className="down">{b.down ?? '--'}</b> 家下跌
          {b.limit_up != null && <> · 涨停 {b.limit_up} 家 / 跌停 {b.limit_down ?? '--'} 家</>}。
          状态分裂或收益接近 0 时，优先降仓，不频繁换股；候选评级请到「交易决策」查看。
        </div>
        <Table rowKey="label" size="small" pagination={false} dataSource={f.states ?? []} columns={stateCols as any} />
        <div className="muted small" style={{ marginTop: 10 }}>{f.caveat} 方法：{f.method}。</div>
      </Card>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Card title="未来 5 日状态概率" desc="由 HMM 转移矩阵连续推 5 步">
          {(f.next_probs ?? []).map((x: any) => (
            <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 48 }} className="small">{x.label}</span>
              <div style={{ flex: 1, height: 9, background: 'var(--card-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, (x.p || 0) * 100)}%`, height: '100%', background: x.label === '强势' ? 'var(--up)' : x.label === '弱势' ? 'var(--down)' : 'var(--amber)' }} />
              </div>
              <span className="num small" style={{ width: 48, textAlign: 'right' }}>{`${((x.p || 0) * 100).toFixed(1)}%`}</span>
            </div>
          ))}
          <div className="muted small" style={{ marginTop: 8 }}>概率高不等于一定发生；它只说明模型认为哪种环境更可能延续。</div>
        </Card>
        <Card title="怎么用这个预测" desc="先定仓位，再选标的">
          <div className="small" style={{ lineHeight: 1.9 }}>
            <div>1. 5 日收益为正、概率 &gt; 55%：可以按每日策略的中上仓位执行。</div>
            <div>2. 收益在 0 附近、概率 45%-55%：只做结构性机会，别追高。</div>
            <div>3. 收益为负或概率 &lt; 45%：降低总仓位，保留现金，等状态改善。</div>
            <div className="muted" style={{ marginTop: 6 }}>预测不替代止损；个股买卖点看「交易决策」。</div>
            <Button type="primary" size="small" icon={<ArrowRightOutlined />} style={{ marginTop: 10 }} onClick={() => nav('/decision')}>进入交易决策</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
