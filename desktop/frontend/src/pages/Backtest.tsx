import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, DatePicker, Input, InputNumber, Select, Skeleton, Table, Tag, message } from 'antd'
import { ExperimentOutlined, ThunderboltOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api'
import { Card, EmptyState, Kpi, StatLine } from '../components/ui'
import EChart from '../components/EChart'
import { fmt, trendClass, UP, DOWN } from '../utils'
import StockSearch from '../components/StockSearch'
import { useTheme } from '../ThemeContext'

export default function Backtest() {
  const [params] = useSearchParams()
  const [strategies, setStrategies] = useState<any[]>([])
  const [code, setCode] = useState(params.get('code') || '600519')
  const [strategy, setStrategy] = useState('ma_cross')
  const [values, setValues] = useState<Record<string, any>>({})
  const [range, setRange] = useState<any>([dayjs().subtract(5, 'year'), dayjs()])
  const [capital, setCapital] = useState(100000)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [last, setLast] = useState<any>(null)
  const [codeError, setCodeError] = useState('')

  useEffect(() => {
    api.get<any[]>('/api/backtest/strategies').then((s) => {
      setStrategies(s)
      const first = s.find((x) => x.id === 'ma_cross') ?? s[0]
      setValues(Object.fromEntries(first.params.map((p: any) => [p.key, p.value])))
    })
    api.get<any>('/api/backtest/last').then(setLast).catch(() => {})
  }, [])

  const current = strategies.find((s) => s.id === strategy)

  const pickStrategy = (id: string) => {
    setStrategy(id)
    const s = strategies.find((x) => x.id === id)
    if (s) setValues(Object.fromEntries(s.params.map((p: any) => [p.key, p.value])))
  }

  const run = async () => {
    if (!/^\d{6}$/.test(code)) {
      setCodeError('请输入 6 位股票代码')
      return
    }
    setCodeError('')
    setLoading(true)
    try {
      const r = await api.post<any>('/api/backtest/run', {
        code,
        strategy,
        params: values,
        start: range?.[0]?.format('YYYY-MM-DD'),
        end: range?.[1]?.format('YYYY-MM-DD'),
        capital,
      })
      setResult(r)
      message.success(`${r.name} · ${r.strategy_name} 回测完成（${r.metrics.days} 交易日）`)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const shown = result ?? last
  const m = shown?.metrics ?? {}

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 14 }}>
        <Card title="回测参数" desc="日线 · 次日开盘成交">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>标的（代码或名称搜索）</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={code}
                  maxLength={6}
                  prefix={<ThunderboltOutlined style={{ color: 'var(--text-dim)' }} />}
                  placeholder="6 位代码"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ width: 132, flex: '0 0 132px' }}
                />
                <div style={{ flex: 1 }}>
                  <StockSearch width={999} placeholder="输入名称或代码，选择标的" onSelect={(c) => setCode(c)} />
                </div>
              </div>
              {codeError && <div style={{ color: 'var(--up)', fontSize: 11, marginTop: 4 }}>{codeError}</div>}
            </div>

            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>策略</div>
              <Select
                value={strategy}
                onChange={pickStrategy}
                style={{ width: '100%' }}
                options={strategies.map((s) => ({ label: s.name, value: s.id }))}
              />
              {current && <div className="muted small" style={{ marginTop: 6, lineHeight: 1.6 }}>{current.desc}</div>}
            </div>

            {current && (
              <div>
                <div className="muted small" style={{ marginBottom: 6 }}>参数</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {current.params.map((p: any) => (
                    <div key={p.key}>
                      <div className="muted small" style={{ marginBottom: 3, fontSize: 10.5 }}>
                        {p.label}
                      </div>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={values[p.key]}
                        onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>回测区间</div>
              <DatePicker.RangePicker
                value={range}
                onChange={setRange}
                style={{ width: '100%' }}
                allowClear={false}
              />
            </div>

            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>初始资金（¥）</div>
              <InputNumber style={{ width: '100%' }} value={capital} onChange={(v) => setCapital(v ?? 100000)} min={10000} step={10000} />
            </div>

            <Button type="primary" size="large" icon={<ExperimentOutlined />} loading={loading} onClick={run} style={{ marginTop: 4 }}>
              开始回测
            </Button>
            <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.7 }}>
              手续费按万 2.5 双边、卖出加千 0.5 印花税、滑点 0.05% 模拟；空仓时现金不计息。
            </div>
          </div>
        </Card>

        <div>
          {loading && !shown ? (
            <Card><Skeleton active paragraph={{ rows: 10 }} /></Card>
          ) : shown ? (
            <>
              <div className="row-between" style={{ marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 650 }}>{shown.name}</span>
                  <span className="mono muted" style={{ marginLeft: 8 }}>{shown.code}</span>
                  <Tag color="blue" style={{ marginLeft: 8 }}>{shown.strategy_name}</Tag>
                </div>
                <span className="muted small">{shown.metrics?.start ?? shown.start} 至 {shown.metrics?.end ?? shown.end} · {shown.metrics?.days} 个交易日</span>
              </div>

              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                <Kpi label="策略收益" value={fmt.pct(m.total_return)} color={m.total_return >= 0 ? UP : DOWN} sub={<span className="muted">买入持有 {fmt.pct(m.benchmark_return)}</span>} small />
                <Kpi label="最大回撤" value={fmt.pct(m.max_drawdown)} color={DOWN} sub={<span className="muted">夏普 {m.sharpe ?? '--'}</span>} small />
                <Kpi label="交易次数" value={m.trade_count ?? 0} sub={<span className="muted">胜率 {m.win_rate ?? '--'}%</span>} small />
                <Kpi label="超额收益" value={fmt.pct(m.excess_return)} color={m.excess_return >= 0 ? UP : DOWN} sub={<span className="muted">年化 {fmt.pct(m.annual_return)}</span>} small />
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-head">
                  <div className="card-title">资金曲线</div>
                  <div className="card-desc">策略 vs 买入持有</div>
                </div>
                <div style={{ padding: '6px 10px 10px' }}>
                  <BacktestChart result={shown} />
                </div>
              </div>

              <div className="grid-2-even" style={{ marginTop: 12 }}>
                <Card title="绩效指标">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 22px' }}>
                    <div>
                      <StatLine k="年化收益" v={fmt.pct(m.annual_return)} cls={trendClass(m.annual_return)} />
                      <StatLine k="波动率" v={fmt.pct(m.volatility)} cls="flat" />
                      <StatLine k="索提诺" v={m.sortino ?? '--'} />
                      <StatLine k="卡玛比率" v={m.calmar ?? '--'} />
                    </div>
                    <div>
                      <StatLine k="盈亏比" v={m.profit_factor ?? '--'} />
                      <StatLine k="平均持仓" v={m.avg_hold_days ? `${m.avg_hold_days} 天` : '--'} />
                      <StatLine k="在场时间" v={`${m.exposure}%`} />
                      <StatLine k="交易成本" v={`¥${fmt.money(m.costs)}`} />
                    </div>
                  </div>
                </Card>
                <Card title="回撤曲线">
                  <BacktestDrawdown result={shown} />
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <EmptyState text="设置参数后点击「开始回测」，用历史行情验证你的交易规则" icon="🧪" />
            </Card>
          )}
        </div>
      </div>

      {shown?.trades?.length ? (
        <div style={{ marginTop: 14 }}>
          <Card title="交易明细" desc={`${shown.trades.filter((t: any) => t.type === 'sell').length} 笔完整交易`} pad={false}>
            <Table
              size="small"
              pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
              rowKey={(r: any, i) => `${r.date}-${r.type}-${i}`}
              dataSource={shown.trades}
              columns={[
                { title: '日期', dataIndex: 'date' },
                {
                  title: '操作',
                  dataIndex: 'type',
                  render: (v: string) => <Tag color={v === 'buy' ? 'red' : 'green'} style={{ margin: 0 }}>{v === 'buy' ? '买入' : '卖出'}</Tag>,
                },
                { title: '价格', dataIndex: 'price', align: 'right', render: (v: number) => <span className="num">{fmt.price(v)}</span> },
                { title: '数量', dataIndex: 'qty', align: 'right' },
                { title: '费用', dataIndex: 'fee', align: 'right', render: (v: number) => <span className="num muted">{fmt.price(v)}</span> },
                {
                  title: '本次收益',
                  dataIndex: 'pnl',
                  align: 'right',
                  render: (v: number, r: any) =>
                    v === undefined ? <span className="muted">--</span> : (
                      <span className={`num ${trendClass(v)}`}>
                        {fmt.signed(v)} <span className="small">({fmt.pct(r.ret)})</span>
                      </span>
                    ),
                },
                { title: '持有天数', dataIndex: 'hold_days', align: 'right', render: (v: number) => (v === undefined ? '--' : `${v}`) },
              ]}
            />
          </Card>
        </div>
      ) : null}
    </div>
  )
}

function BacktestChart({ result }: { result: any }) {
  const { colors } = useTheme()
  const option = useMemo<any>(() => {
    const dates = result.equity.map((e: any) => e.date)
    const eq = result.equity.map((e: any) => e.equity)
    const bh = result.benchmark.map((e: any) => e.bench)
    return {
      animation: false,
      grid: { left: 48, right: 24, top: 26, bottom: 40 },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 12,
        itemHeight: 2,
        textStyle: { color: colors.textSub, fontSize: 10.5 },
        data: ['策略资金', '买入持有'],
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        valueFormatter: (v: any) => `¥${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.axis, fontSize: 10, hideOverlap: true },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: '#6B7280', fontSize: 10, formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v) },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 2, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.03)', fillerColor: 'rgba(76,141,255,0.12)' }],
      series: [
        {
          name: '策略资金',
          type: 'line',
          data: eq,
          symbol: 'none',
          smooth: 0.1,
          lineStyle: { color: colors.accent, width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colors.accent + '2E' },
                { offset: 1, color: colors.accent + '00' },
              ],
            },
          },
        },
        {
          name: '买入持有',
          type: 'line',
          data: bh,
          symbol: 'none',
          smooth: 0.1,
          lineStyle: { color: colors.purple, width: 1.2, type: 'dashed' },
        },
      ],
    }
  }, [result, colors])
  return <EChart option={option} height={300} />
}

function BacktestDrawdown({ result }: { result: any }) {
  const { colors } = useTheme()
  const option = useMemo<any>(() => {
    const dates = result.drawdown.map((d: any) => d.date)
    const vals = result.drawdown.map((d: any) => d.dd)
    return {
      animation: false,
      grid: { left: 6, right: 10, top: 14, bottom: 22 },
      tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${v}%` },
      xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: colors.grid } }, axisLabel: { show: false }, axisTick: { show: false } },
      yAxis: { type: 'value', max: 0, axisLabel: { color: colors.axis, fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } } },
      series: [
        {
          type: 'line',
          data: vals,
          symbol: 'none',
          smooth: 0.1,
          lineStyle: { color: colors.down, width: 1.2 },
          areaStyle: { color: colors.down + '33' },
        },
      ],
    }
  }, [result, colors])
  return <EChart option={option} height={170} />
}
