import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Collapse, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select, Skeleton, Switch, Table, Tag, Tooltip, message } from 'antd'
import {
  ExperimentOutlined,
  InfoCircleOutlined,
  StarFilled,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api'
import { Card, EmptyState, Kpi, StatLine } from '../components/ui'
import KLineChart from '../components/KLineChart'
import ChipsChart from '../components/ChipsChart'
import { fmt, trendClass } from '../utils'

const METRIC_TIPS: Record<string, string> = {
  成交额: '当日成交的金额总和，反映资金参与度。成交额越大，流动性通常越好。',
  换手率: '当日成交量 / 流通股本。换手率高说明筹码交换活跃，但也可能意味着分歧加大。',
  '市盈率 TTM': '股价 / 最近 12 个月每股收益。数值越低通常越便宜，但需结合行业与成长性判断；亏损公司为负值。',
  市净率: '股价 / 每股净资产。适合银行、地产等重资产行业估值；轻资产公司参考意义较弱。',
  总市值: '股价 × 总股本，代表市场给公司的整体定价。',
  量比: '当日每分钟成交量 / 过去 5 日每分钟成交量。量比 > 1 表示当日放量。',
  振幅: '（最高价 − 最低价）/ 昨收，衡量当日价格波动幅度。',
  'ROE（最新报告）': '净利润 / 净资产，衡量股东资金的赚钱效率。长期 ROE > 15% 通常代表优质生意。',
  毛利率: '（营收 − 营业成本）/ 营收，反映产品竞争力与定价权。',
  资产负债率: '总负债 / 总资产，衡量财务杠杆；过高意味着偿债压力。',
  '每股净资产': '净资产 / 总股本，是 PB 的分母。',
  净利率: '净利润 / 营收，反映最终盈利能力。',
  营收同比: '本期营业收入相对去年同期的增速。',
  净利同比: '本期归母净利润相对去年同期的增速。',
}

function Tip({ text }: { text: string }) {
  return (
    <Tooltip title={text}>
      <InfoCircleOutlined style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 4, cursor: 'help' }} />
    </Tooltip>
  )
}

export default function StockDetail() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<any>(null)
  const [kline, setKline] = useState<any>(null)
  const [period, setPeriod] = useState('daily')
  const [adjust, setAdjust] = useState('qfq')
  const [loading, setLoading] = useState(true)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [showFib, setShowFib] = useState(true)
  const [showMACD, setShowMACD] = useState(true)
  const [showTD, setShowTD] = useState(true)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [d, k] = await Promise.all([
        api.get<any>(`/api/market/stock/${code}`),
        api.get<any>(`/api/market/kline/${code}?period=${period}&limit=320&adjust=${adjust}`),
      ])
      setData(d)
      setKline(k)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [code])

  useEffect(() => {
    if (!data) return
    api
      .get<any>(`/api/market/kline/${code}?period=${period}&limit=320&adjust=${adjust}`)
      .then(setKline)
      .catch(() => {})
  }, [period, adjust])

  const q = data ?? {}
  const fins = data?.financials ?? []
  const prof = data?.profile ?? {}
  const concepts = data?.concepts ?? []
  const tech = data?.technical ?? {}
  const chips = tech.chips ?? {}
  const fib = tech.fib ?? {}
  const levels = fib.levels ?? []

  const toggleWatch = async () => {
    try {
      if (data?.watch) {
        await api.del(`/api/watchlist/${code}`)
        setData({ ...data, watch: false })
        message.success('已移出自选')
      } else {
        await api.post('/api/watchlist', { code, name: q.name })
        setData({ ...data, watch: true })
        message.success('已加入自选')
      }
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const levelColumns = useMemo(
    () => [
      {
        title: '位置',
        dataIndex: 'name',
        render: (v: string, r: any) => (
          <span>
            <b>{v}</b> <span className="muted small">回撤 {(r.ratio * 100).toFixed(1)}%</span>
          </span>
        ),
      },
      { title: '价格', dataIndex: 'price', align: 'right' as const, render: (v: number) => <span className="num" style={{ fontWeight: 600 }}>{fmt.price(v)}</span> },
      {
        title: '距现价',
        dataIndex: 'distance',
        align: 'right' as const,
        render: (v: number) => <span className={`num ${v >= 0 ? 'up' : 'down'}`}>{fmt.pct(v)}</span>,
      },
      {
        title: '属性',
        dataIndex: 'kind',
        align: 'center' as const,
        render: (v: string) => <Tag color={v === '支撑' ? 'red' : 'blue'} style={{ margin: 0 }}>{v}</Tag>,
      },
      {
        title: '操作参考',
        dataIndex: 'action',
        align: 'center' as const,
        render: (v: string) => (
          <Tag color={v.includes('买入') || v.includes('低吸') ? 'blue' : v.includes('止损') || v.includes('减仓') ? 'green' : 'default'} style={{ margin: 0 }}>
            {v}
          </Tag>
        ),
      },
      { title: '说明', dataIndex: 'note', render: (v: string) => <span className="small muted">{v}</span> },
    ],
    [],
  )

  if (loading && !data) return <div className="card card-pad"><Skeleton active paragraph={{ rows: 10 }} /></div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{q.name}</span>
            <span className="mono muted">{code}</span>
            <Tag color="blue">{q.market || 'A股'}</Tag>
            {q.industry && <Tag color="purple">{q.industry}</Tag>}
            {q.watch && <Tag color="gold">自选</Tag>}
          </div>
          {concepts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxWidth: 900 }}>
              {concepts.slice(0, 10).map((c: string) => (
                <span key={c} className="chip" style={{ cursor: 'default' }}>{c}</span>
              ))}
              {concepts.length > 10 && <span className="chip">+{concepts.length - 10}</span>}
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <span className={`num ${trendClass(q.pct)}`} style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>
              {fmt.price(q.price)}
            </span>
            <span className={`num ${trendClass(q.chg)}`} style={{ fontSize: 16 }}>
              {q.chg === null || q.chg === undefined ? '--' : fmt.signed(q.chg)}
            </span>
            <span className={`chip ${trendClass(q.pct)}`} style={{ fontSize: 13 }}>{fmt.pct(q.pct)}</span>
            <span className="muted small">
              昨收 {fmt.price(q.prev_close)} · 今开 {fmt.price(q.open)} · 最高 {fmt.price(q.high)} · 最低 {fmt.price(q.low)} · 振幅 {fmt.pct(q.amplitude)}
            </span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button icon={q.watch ? <StarFilled style={{ color: '#F59E0B' }} /> : <StarOutlined />} onClick={toggleWatch}>
            {q.watch ? '已自选' : '加自选'}
          </Button>
          <Button icon={<ExperimentOutlined />} onClick={() => nav(`/backtest?code=${code}`)}>回测</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => setTradeOpen(true)}>记一笔交易</Button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label={<>成交额<Tip text={METRIC_TIPS['成交额']} /></>} value={fmt.big(q.amount)} sub={<span className="muted">成交量 {fmt.lots(q.volume)}</span>} />
        <Kpi label={<>换手率<Tip text={METRIC_TIPS['换手率']} /></>} value={q.turnover ? `${q.turnover.toFixed(2)}%` : '--'} sub={<span className="muted">量比 {q.volume_ratio ?? '--'}</span>} />
        <Kpi label={<>市盈率 TTM<Tip text={METRIC_TIPS['市盈率 TTM']} /></>} value={q.pe ? q.pe.toFixed(2) : '--'} sub={<span className="muted">动态 PE</span>} />
        <Kpi label={<>总市值<Tip text={METRIC_TIPS['总市值']} /></>} value={fmt.big(q.mcap)} sub={<span className="muted">流通 {fmt.big(q.fcap)}</span>} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <Card
          title="K 线走势"
          desc="前复权 · 拖动下方滑块缩放"
          extra={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                黄金分割
                <Switch size="small" checked={showFib} onChange={setShowFib} disabled={!levels.length} />
              </span>
              <span className="chart-switch" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span className="muted small">MACD</span>
                <Switch size="small" checked={showMACD} onChange={setShowMACD} />
              </span>
              <span className="chart-switch" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span className="muted small">九转</span>
                <Switch size="small" checked={showTD} onChange={setShowTD} />
              </span>
              <Segmented
                size="small"
                value={period}
                onChange={(v) => setPeriod(v as string)}
                options={[
                  { label: '日K', value: 'daily' },
                  { label: '周K', value: 'weekly' },
                  { label: '月K', value: 'monthly' },
                ]}
              />
              <Select
                size="small"
                value={adjust}
                onChange={setAdjust}
                style={{ width: 82 }}
                options={[
                  { label: '前复权', value: 'qfq' },
                  { label: '后复权', value: 'hfq' },
                  { label: '不复权', value: '' },
                ]}
              />
            </div>
          }
          pad={false}
        >
          <div style={{ padding: '4px 10px 10px' }}>
            {kline?.rows?.length ? (
              <KLineChart rows={kline.rows} height={500} fib={levels} showFib={showFib} showMACD={showMACD} showTD={showTD} />
            ) : (
              <EmptyState text="行情加载中" icon="◌" />
            )}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="估值与交易" desc="实时快照">
            <StatLine k={<>市净率 PB<Tip text={METRIC_TIPS['市净率']} /></>} v={q.pb ? q.pb.toFixed(2) : '--'} />
            <StatLine k={<>每股净资产<Tip text={METRIC_TIPS['每股净资产']} /></>} v={fins[0]?.bps ? fins[0].bps.toFixed(2) : '--'} />
            <StatLine k={<>ROE（最新报告）<Tip text={METRIC_TIPS['ROE（最新报告）']} /></>} v={fins[0]?.roe ? `${fins[0].roe.toFixed(2)}%` : '--'} />
            <StatLine k={<>毛利率<Tip text={METRIC_TIPS['毛利率']} /></>} v={fins[0]?.gross_margin ? `${fins[0].gross_margin.toFixed(1)}%` : '--'} />
            <StatLine k={<>资产负债率<Tip text={METRIC_TIPS['资产负债率']} /></>} v={fins[0]?.debt_ratio ? `${fins[0].debt_ratio.toFixed(1)}%` : '--'} />
            <StatLine k={<>量比<Tip text={METRIC_TIPS['量比']} /></>} v={q.volume_ratio ?? '--'} />
            <StatLine k={<>振幅<Tip text={METRIC_TIPS['振幅']} /></>} v={fmt.pct(q.amplitude)} />
            <StatLine k="60 日涨跌" v={fmt.pct(q.pct60)} cls={trendClass(q.pct60)} />
            <StatLine k="年初至今" v={fmt.pct(q.pct_ytd)} cls={trendClass(q.pct_ytd)} />
          </Card>

          <Collapse
            size="small"
            items={[
              {
                key: 'glossary',
                label: '估值与交易指标说明',
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {Object.entries(METRIC_TIPS).slice(0, 9).map(([k, v]) => (
                      <div key={k} className="small">
                        <b>{k}</b>
                        <div className="muted" style={{ lineHeight: 1.6 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      <div className="grid-2-even" style={{ marginTop: 14 }}>
        <Card
          title="筹码分布"
          desc={`近 ${chips.days ?? 120} 个交易日 · 成交量按价格分布（越新权重越高）`}
          extra={<Tip text="筹码分布把历史成交量按成交价格区间累计，用来观察套牢盘与获利盘的集中位置；红色为获利筹码，绿色为套牢筹码。" />}
        >
          {chips.buckets?.length ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                <div className="mini-stat"><span>平均成本</span><b>{fmt.price(chips.avg_cost)}</b></div>
                <div className="mini-stat"><span>获利比例</span><b className={chips.profit_ratio >= 50 ? 'up' : 'down'}>{chips.profit_ratio}%</b></div>
                <div className="mini-stat"><span>90% 成本区间</span><b>{fmt.price(chips.cost_low)} ~ {fmt.price(chips.cost_high)}</b></div>
                <div className="mini-stat"><span>集中度</span><b>{chips.concentration}%</b></div>
              </div>
              <ChipsChart chips={chips} height={250} />
              <div className="muted small" style={{ marginTop: 6 }}>
                主要支撑 <b className="up">{fmt.price(chips.support)}</b> · 主要压力 <b className="down">{fmt.price(chips.resistance)}</b>
              </div>
              {chips.analysis && (
                <div className="chip-analysis">
                  <div className="row-between">
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>筹码分析</span>
                    <span className="row-between" style={{ gap: 8 }}>
                      <Tag color={chips.analysis.tone === 'up' ? 'red' : chips.analysis.tone === 'down' ? 'green' : 'default'} style={{ margin: 0 }}>
                        {chips.analysis.verdict}
                      </Tag>
                      <span className="num small" style={{ color: 'var(--text-sub)' }}>评分 {chips.analysis.score}</span>
                    </span>
                  </div>
                  <div className="chip-comments">
                    {chips.analysis.comments.map((c: string, i: number) => (
                      <div key={i}>· {c}</div>
                    ))}
                  </div>
                  <div className="row-between" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                    <span className="chip">筹码峰 {fmt.price(chips.analysis.peak)}</span>
                    <span className="chip">成本偏离 {fmt.pct(chips.analysis.premium)}</span>
                    <span className="chip">集中度 {chips.concentration}%（{chips.analysis.concentration_label}）</span>
                    <span className={`chip ${chips.analysis.migration >= 0 ? 'up' : 'down'}`}>60日筹码{chips.analysis.migration >= 0 ? '上移' : '下移'} {fmt.pct(chips.analysis.migration)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState text="筹码数据加载中" icon="◌" />
          )}
        </Card>

        <Card
          title="黄金分割位"
          desc={`${fib.zone ?? ''} · 区间 ${fmt.price(fib.low)} ~ ${fmt.price(fib.high)}`}
          extra={<Tip text="黄金分割用一段行情的最高价与最低价画出 0.236 / 0.382 / 0.5 / 0.618 / 0.786 回撤位，常被用作支撑与压力的参考，不代表必然反转。" />}
        >
          {levels.length ? (
            <div>
              <div className="fib-advice">
                <div>
                  <span className="muted small">当前位置</span>
                  <b style={{ marginLeft: 6 }}>{fib.position}%</b>
                  <span className="chip" style={{ marginLeft: 8 }}>{fib.zone}</span>
                  <span className="chip" style={{ marginLeft: 6 }}>{fib.trend}</span>
                </div>
                <div className="small" style={{ marginTop: 6, lineHeight: 1.7 }}>{fib.advice}</div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  现价 {fmt.price(fib.current)} · MA20 {fmt.price(fib.ma20)} · MA60 {fmt.price(fib.ma60)} · RSI14 {fib.rsi}
                </div>
              </div>
              <Table
                size="small"
                pagination={false}
                rowKey="name"
                dataSource={[...levels].sort((a: any, b: any) => b.price - a.price)}
                columns={levelColumns as any}
              />
              <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>{fib.disclaimer}</div>
            </div>
          ) : (
            <EmptyState text="黄金分割数据加载中" icon="◌" />
          )}
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="公司概况" desc="东方财富 F10" pad={false}>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0 26px' }}>
            <StatLine k="公司全称" v={prof.org_name || '--'} />
            <StatLine k="所属行业" v={prof.industry || '--'} />
            <StatLine k="董事长" v={prof.chairman || '--'} />
            <StatLine k="董事会秘书" v={prof.secretary || '--'} />
            <StatLine k="法人代表" v={prof.legal_person || '--'} />
            <StatLine k="统一社会信用代码" v={prof.reg_number || '--'} />
            <StatLine k="成立日期" v={prof.found_date || '--'} />
            <StatLine k="上市日期" v={prof.listing_date || '--'} />
            <StatLine k="注册资本" v={prof.reg_capital ? `${(prof.reg_capital / 1e4).toFixed(2)} 亿` : '--'} />
            <StatLine k="员工人数" v={prof.employees ? `${prof.employees} 人` : '--'} />
            <StatLine k="注册地址" v={prof.address || '--'} />
            <StatLine k="公司网址" v={prof.website || '--'} />
            <StatLine k="电子邮箱" v={prof.email || '--'} />
            <StatLine k="联系电话" v={prof.phone || '--'} />
            <StatLine k="总股本" v={q.mcap && q.price ? `${(q.mcap / q.price / 1e8).toFixed(2)} 亿股` : '--'} />
          </div>
          {prof.main_business && (
            <div style={{ padding: '0 16px 12px' }}>
              <div className="muted small" style={{ marginBottom: 4 }}>主营业务</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>{prof.main_business}</div>
            </div>
          )}
          {prof.scope && (
            <div style={{ padding: '0 16px 12px' }}>
              <div className="muted small" style={{ marginBottom: 4 }}>经营范围</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>{prof.scope}</div>
            </div>
          )}
          {prof.profile && (
            <div style={{ padding: '0 16px 16px' }}>
              <div className="muted small" style={{ marginBottom: 4 }}>公司简介</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>{prof.profile}</div>
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="财务指标" desc="近 8 个报告期" pad={false}>
          {fins.length ? (
            <Table
              size="small"
              pagination={false}
              rowKey={(r: any) => r.period}
              dataSource={fins}
              columns={[
                { title: '报告期', dataIndex: 'period' },
                { title: '每股收益', dataIndex: 'eps', align: 'right', render: (v: number) => <span className="num">{v?.toFixed(3) ?? '--'}</span> },
                { title: '每股净资产', dataIndex: 'bps', align: 'right', render: (v: number) => <span className="num">{v?.toFixed(2) ?? '--'}</span> },
                {
                  title: 'ROE',
                  dataIndex: 'roe',
                  align: 'right',
                  render: (v: number) => <span className="num" style={{ color: (v ?? 0) >= 10 ? 'var(--up)' : undefined }}>{v?.toFixed(2) ?? '--'}%</span>,
                },
                { title: '营收同比', dataIndex: 'revenue_yoy', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                { title: '净利同比', dataIndex: 'profit_yoy', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                { title: '毛利率', dataIndex: 'gross_margin', align: 'right', render: (v: number) => <span className="num">{v ? `${v.toFixed(1)}%` : '--'}</span> },
                { title: '净利率', dataIndex: 'net_margin', align: 'right', render: (v: number) => <span className="num">{v ? `${v.toFixed(1)}%` : '--'}</span> },
                { title: '资产负债率', dataIndex: 'debt_ratio', align: 'right', render: (v: number) => <span className="num">{v ? `${v.toFixed(1)}%` : '--'}</span> },
              ]}
            />
          ) : (
            <EmptyState text="暂无财务数据" icon="▤" />
          )}
        </Card>
      </div>

      <TradeModal open={tradeOpen} onClose={() => setTradeOpen(false)} code={code} name={q.name} price={q.price} />
    </div>
  )
}

function TradeModal({
  open,
  onClose,
  code,
  name,
  price,
  onDone,
}: {
  open: boolean
  onClose: () => void
  code: string
  name?: string
  price?: number
  onDone?: () => void
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) {
      form.setFieldsValue({ code, side: 'buy', price: price ?? undefined, qty: 100, trade_date: dayjs(), fee: 5 })
    }
  }, [open])

  const submit = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      await api.post('/api/portfolio/trades', {
        code: v.code,
        side: v.side,
        price: v.price,
        qty: v.qty,
        fee: v.fee ?? 0,
        trade_date: v.trade_date.format('YYYY-MM-DD'),
        name: name ?? '',
        note: v.note ?? '',
      })
      message.success('交易已记录，账户资产与现金已重算')
      form.resetFields()
      onClose()
      onDone?.()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="记录交易" open={open} onCancel={onClose} onOk={submit} okText="保存" cancelText="取消" confirmLoading={saving}>
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="code" label="股票代码" rules={[{ required: true, pattern: /^\d{6}$/, message: '6 位数字' }]}>
            <Input placeholder="600519" maxLength={6} />
          </Form.Item>
          <Form.Item name="side" label="方向" rules={[{ required: true }]}>
            <Select options={[{ label: '买入', value: 'buy' }, { label: '卖出', value: 'sell' }]} />
          </Form.Item>
          <Form.Item name="price" label="成交价" rules={[{ required: true, message: '请输入价格' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} precision={3} />
          </Form.Item>
          <Form.Item name="qty" label="数量（股）" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber style={{ width: '100%' }} min={100} step={100} />
          </Form.Item>
          <Form.Item name="trade_date" label="交易日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fee" label="手续费合计">
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
          </Form.Item>
        </div>
        <Form.Item name="note" label="备注">
          <Input placeholder="买入理由 / 计划" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
