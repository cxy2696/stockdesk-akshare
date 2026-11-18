import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Button, DatePicker, Input, InputNumber, Segmented, Select, Skeleton, Table, Tag, message,
} from 'antd'
import { ExperimentOutlined, MinusCircleOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api'
import { Card, Kpi, StatLine } from '../components/ui'
import EChart from '../components/EChart'
import { fmt, trendClass, UP, DOWN } from '../utils'
import StockSearch from '../components/StockSearch'
import { useTheme } from '../ThemeContext'

type Mode = 'recommended' | 'custom' | 'ledger' | 'single'

const MODES: { label: string; value: Mode }[] = [
  { label: '推荐组合', value: 'recommended' },
  { label: '自定义持仓', value: 'custom' },
  { label: '交易记录回放', value: 'ledger' },
  { label: '单股策略', value: 'single' },
]

const MODE_DESC: Record<Mode, string> = {
  recommended: '用自选 + 当前持仓作为股票池，60 日动量选前 N，HMM 状态决定总仓位；每 N 个交易日换仓，次日开盘成交。',
  custom: '输入代码和目标权重，可买入持有或定期再平衡；权重会自动归一化。',
  ledger: '回放你在「持仓管理」里记录的真实买卖，保留实际费用，检查现金和 T+1 约束。',
  single: '对单只股票运行双均线、动量、RSI、MACD 等规则策略。',
}

interface HoldingRow { code: string; weight: number }

export default function Backtest() {
  const [params] = useSearchParams()
  const [strategies, setStrategies] = useState<any[]>([])
  const [benchmarks, setBenchmarks] = useState<any[]>([])
  const [mode, setMode] = useState<Mode>(() => (params.get('code') ? 'single' : 'recommended'))
  const [code, setCode] = useState(params.get('code') || '600519')
  const [strategy, setStrategy] = useState('ma_cross')
  const [benchmark, setBenchmark] = useState('000001')
  const [values, setValues] = useState<Record<string, any>>({})
  const [range, setRange] = useState<any>([dayjs().subtract(5, 'year'), dayjs()])
  const [capital, setCapital] = useState(1_000_000)
  const [commissionBps, setCommissionBps] = useState(2.5)
  const [slippageBps, setSlippageBps] = useState(5)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [last, setLast] = useState<any>(null)
  const [codeError, setCodeError] = useState('')
  const [holdings, setHoldings] = useState<HoldingRow[]>([
    { code: '600519', weight: 50 },
    { code: '000858', weight: 50 },
  ])
  const [universe, setUniverse] = useState<string[]>([])
  const [topN, setTopN] = useState(5)
  const [rebalance, setRebalance] = useState(20)
  const [customRebalance, setCustomRebalance] = useState(0)

  useEffect(() => {
    api.get<any[]>('/api/backtest/strategies').then((s) => {
      setStrategies(s)
      const first = s.find((x) => x.id === 'ma_cross') ?? s[0]
      setValues(Object.fromEntries(first.params.map((p: any) => [p.key, p.value])))
    }).catch(() => {})
    api.get<any[]>('/api/backtest/benchmarks').then(setBenchmarks).catch(() => {})
    api.get<any>('/api/backtest/last').then(setLast).catch(() => {})
  }, [])

  const current = strategies.find((s) => s.id === strategy)

  const pickStrategy = (id: string) => {
    setStrategy(id)
    const s = strategies.find((x) => x.id === id)
    if (s) setValues(Object.fromEntries(s.params.map((p: any) => [p.key, p.value])))
  }

  const run = async () => {
    if (mode === 'single' && !/^\d{6}$/.test(code)) {
      setCodeError('请输入 6 位股票代码')
      return
    }
    if (mode === 'custom' && !holdings.some((h) => /^\d{6}$/.test(h.code) && h.weight > 0)) {
      setCodeError('至少填写一个有效代码和正权重')
      return
    }
    setCodeError('')
    setLoading(true)
    try {
      const common = {
        start: range?.[0]?.format('YYYY-MM-DD'),
        end: range?.[1]?.format('YYYY-MM-DD'),
        capital,
        benchmark,
        commission: commissionBps / 10000,
        slippage: slippageBps / 10000,
      }
      let r: any
      if (mode === 'single') {
        r = await api.post<any>('/api/backtest/run', {
          code,
          strategy,
          params: values,
          ...common,
        })
      } else {
        r = await api.post<any>('/api/backtest/portfolio', {
          mode,
          ...common,
          holdings: holdings.filter((h) => h.code && h.weight > 0),
          universe: universe.map((x) => x.trim()).filter(Boolean),
          top_n: topN,
          rebalance_days: mode === 'custom' ? customRebalance : rebalance,
        })
      }
      setResult(r)
      message.success(`${r.mode_name ?? r.name} · ${r.strategy_name} 回测完成（${r.metrics.days} 交易日）`)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const useCurrentPositions = async () => {
    try {
      const summary = await api.get<any>('/api/portfolio/summary')
      const positions = summary?.positions ?? []
      if (!positions.length) {
        message.info('当前没有持仓；先记录买入，或手动填写代码和权重')
        return
      }
      const weight = Math.floor((100 / positions.length) * 10) / 10
      setHoldings(positions.map((p: any) => ({ code: p.code, weight })))
      setMode('custom')
    } catch (e: any) {
      message.error(e.message || '读取持仓失败')
    }
  }

  const shown = result ?? (mode === 'single' ? last : null)
  const m = shown?.metrics ?? {}
  const isPortfolio = shown?.mode && shown.mode !== 'single'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 14 }}>
        <Card title="回测参数" desc="日线 · 次日开盘成交 · T+1">
          <Segmented
            block
            size="small"
            value={mode}
            options={MODES}
            onChange={(v) => { setMode(v as Mode); setResult(null); setCodeError('') }}
            style={{ marginBottom: 10 }}
          />
          <div className="muted small" style={{ lineHeight: 1.7, marginBottom: 14 }}>{MODE_DESC[mode]}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'single' && (
              <>
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
                          <div className="muted small" style={{ marginBottom: 3, fontSize: 10.5 }}>{p.label}</div>
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
              </>
            )}

            {mode === 'recommended' && (
              <>
                <div>
                  <div className="muted small" style={{ marginBottom: 6 }}>股票池（留空 = 自选 + 当前持仓）</div>
                  <Select
                    mode="tags"
                    value={universe}
                    onChange={setUniverse}
                    tokenSeparators={[',', ' ']}
                    placeholder="输入 6 位代码，回车添加"
                    style={{ width: '100%' }}
                  />
                  <div className="muted small" style={{ marginTop: 5, lineHeight: 1.6 }}>
                    留空时用自选和持仓；仍为空时使用成交额前 12 只。股票池是当前名单，存在选择偏差，只做样本内演示。
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div className="muted small" style={{ marginBottom: 4 }}>持仓数量</div>
                    <InputNumber min={1} max={20} value={topN} onChange={(v) => setTopN(v ?? 5)} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <div className="muted small" style={{ marginBottom: 4 }}>换仓间隔（交易日）</div>
                    <InputNumber min={1} max={120} value={rebalance} onChange={(v) => setRebalance(v ?? 20)} style={{ width: '100%' }} />
                  </div>
                </div>
              </>
            )}

            {mode === 'custom' && (
              <>
                <div className="row-between">
                  <div className="muted small">持仓与目标权重</div>
                  <Button size="small" onClick={useCurrentPositions}>用当前持仓</Button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {holdings.map((h, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px 24px', gap: 6, alignItems: 'center' }}>
                      <Input
                        value={h.code}
                        maxLength={6}
                        placeholder="6 位代码"
                        onChange={(e) => {
                          const next = e.target.value.replace(/\D/g, '').slice(0, 6)
                          setHoldings((rows) => rows.map((row, j) => (j === i ? { ...row, code: next } : row)))
                        }}
                      />
                      <InputNumber
                        min={0}
                        max={100}
                        value={h.weight}
                        addonAfter="%"
                        onChange={(v) => setHoldings((rows) => rows.map((row, j) => (j === i ? { ...row, weight: v ?? 0 } : row)))}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<MinusCircleOutlined />}
                        disabled={holdings.length <= 1}
                        onClick={() => setHoldings((rows) => rows.filter((_, j) => j !== i))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setHoldings((rows) => [...rows, { code: '', weight: 0 }])}>
                    添加一行
                  </Button>
                  <div className="muted small">权重合计不必等于 100，回测会自动归一化。</div>
                </div>
                <div>
                  <div className="muted small" style={{ marginBottom: 4 }}>再平衡间隔（0 = 买入持有）</div>
                  <InputNumber min={0} max={250} value={customRebalance} onChange={(v) => setCustomRebalance(v ?? 0)} style={{ width: '100%' }} />
                </div>
                {codeError && <div style={{ color: 'var(--up)', fontSize: 11 }}>{codeError}</div>}
              </>
            )}

            {mode === 'ledger' && (
              <div className="card" style={{ background: 'var(--bg-soft)', border: '1px solid var(--border-soft)' }}>
                <div style={{ padding: 12, lineHeight: 1.8, fontSize: 11.5 }}>
                  <div style={{ fontWeight: 650, marginBottom: 4 }}>读取「持仓管理 → 交易流水」</div>
                  <div className="muted">按记录的实际价格和费用回放；同一天买入的股票不能卖出（T+1），现金不足的买入会跳过并列出警告。</div>
                  <div className="muted" style={{ marginTop: 4 }}>当前流水会在运行回测时读取，不需要重复录入。</div>
                </div>
              </div>
            )}

            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>基准</div>
              <Select
                value={benchmark}
                onChange={setBenchmark}
                style={{ width: '100%' }}
                options={benchmarks.length ? benchmarks.map((b) => ({ label: b.name, value: b.code })) : [{ label: '上证指数', value: '000001' }]}
              />
              <div className="muted small" style={{ marginTop: 5 }}>默认上证指数；可切换沪深300等指数或买入持有。</div>
            </div>

            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>回测区间</div>
              <DatePicker.RangePicker
                value={range}
                onChange={setRange}
                style={{ width: '100%' }}
                allowClear={false}
                disabled={mode === 'ledger'}
              />
            </div>

            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>初始资金（¥）</div>
              <InputNumber style={{ width: '100%' }} value={capital} onChange={(v) => setCapital(v ?? 1_000_000)} min={10000} step={100000} />
            </div>

            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>成本假设</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <InputNumber
                  value={commissionBps}
                  onChange={(v) => setCommissionBps(v ?? 2.5)}
                  min={0}
                  max={30}
                  step={0.5}
                  addonAfter="‱ 佣金"
                  style={{ width: '100%' }}
                />
                <InputNumber
                  value={slippageBps}
                  onChange={(v) => setSlippageBps(v ?? 5)}
                  min={0}
                  max={50}
                  step={1}
                  addonAfter="‱ 滑点"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.7, marginTop: 5 }}>
                卖出另收千 0.5 印花税；单笔佣金最低 5 元；空仓现金不计息。停牌按最近收盘估值，不模拟涨跌停无法成交。
              </div>
            </div>

            <Button type="primary" size="large" icon={<ExperimentOutlined />} loading={loading} onClick={run} style={{ marginTop: 4 }}>
              开始回测
            </Button>
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
                  {shown.code ? <span className="mono muted" style={{ marginLeft: 8 }}>{shown.code}</span> : null}
                  <Tag color="blue" style={{ marginLeft: 8 }}>{shown.strategy_name}</Tag>
                  {isPortfolio && shown.mode_name !== shown.name && <Tag color="purple">{shown.mode_name}</Tag>}
                </div>
                <span className="muted small">{shown.metrics?.start ?? shown.start} 至 {shown.metrics?.end ?? shown.end} · {shown.metrics?.days} 个交易日</span>
              </div>

              {isPortfolio && shown.holdings?.length ? (
                <div className="backtest-holdings">
                  <span className="muted small">{shown.mode === 'recommended' ? '股票池' : '持仓'}</span>
                  {shown.holdings.slice(0, 12).map((h: any) => (
                    <span key={h.code} className="chip">
                      {h.code}{h.weight != null ? ` · ${h.weight}%` : ''}
                    </span>
                  ))}
                  {shown.holdings.length > 12 && <span className="muted small">+{shown.holdings.length - 12}</span>}
                </div>
              ) : null}

              {shown.warnings?.length ? (
                <div className="card" style={{ marginBottom: 10, borderColor: 'var(--amber)' }}>
                  <div style={{ padding: 10, fontSize: 11, lineHeight: 1.7 }}>
                    <b>回放警告</b>
                    <div className="muted" style={{ marginTop: 4 }}>{shown.warnings.join('；')}</div>
                  </div>
                </div>
              ) : null}

              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                <Kpi
                  label={mode === 'single' ? '策略收益' : mode === 'ledger' ? '账户收益' : '组合收益'}
                  value={fmt.pct(m.total_return)}
                  color={m.total_return >= 0 ? UP : DOWN}
                  sub={<span className="muted">{shown.benchmark_name || '基准'} {fmt.pct(m.benchmark_return)}</span>}
                  small
                />
                <Kpi label="最大回撤" value={fmt.pct(m.max_drawdown)} color={DOWN} sub={<span className="muted">夏普 {m.sharpe ?? '--'}</span>} small />
                <Kpi
                  label={mode === 'single' ? '交易次数' : '交易笔数'}
                  value={m.trade_count ?? 0}
                  sub={<span className="muted">胜率 {m.win_rate == null ? '--' : `${m.win_rate}%`}</span>}
                  small
                />
                <Kpi label="超额收益" value={fmt.pct(m.excess_return)} color={m.excess_return >= 0 ? UP : DOWN} sub={<span className="muted">年化 {fmt.pct(m.annual_return)}</span>} small />
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-head">
                  <div className="card-title">资金曲线</div>
                  <div className="card-desc">策略 vs {shown.benchmark_name || '基准'}</div>
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
                      <StatLine k="波动率" v={m.volatility == null ? '--' : `${m.volatility}%`} cls="flat" />
                      <StatLine k="索提诺" v={m.sortino ?? '--'} />
                      <StatLine k="卡玛比率" v={m.calmar ?? '--'} />
                      <StatLine k="跟踪误差" v={m.tracking_error == null ? '--' : `${Math.abs(m.tracking_error).toFixed(2)}%`} />
                    </div>
                    <div>
                      <StatLine k="盈亏比" v={m.profit_factor ?? '--'} />
                      <StatLine k="平均持仓" v={m.avg_hold_days ? `${m.avg_hold_days} 天` : '--'} />
                      <StatLine k="在场时间" v={`${m.exposure ?? '--'}%`} />
                      <StatLine k="信息比率" v={m.information_ratio ?? '--'} />
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
            <Card title="选择回测口径" desc="四种模式共用次日开盘、T+1、费用和基准假设">
              <div className="backtest-guide">
                {MODES.map((m) => (
                  <div key={m.value} className={`backtest-guide-row ${mode === m.value ? 'active' : ''}`}>
                    <b>{m.label}</b>
                    <span>{MODE_DESC[m.value]}</span>
                  </div>
                ))}
              </div>
              <div className="muted small" style={{ marginTop: 12, lineHeight: 1.8 }}>
                推荐组合需要自选或持仓至少 1 只；自定义持仓至少 1 个代码和正权重；交易记录回放需要至少一笔流水；单股策略输入 6 位代码即可。
                回测是历史样本内检验，不构成收益承诺。
              </div>
            </Card>
          )}
        </div>
      </div>

      {shown?.trades?.length ? (
        <div style={{ marginTop: 14 }}>
          <Card
            title="交易明细"
            desc={`${shown.trades.length} 笔委托 · ${shown.metrics?.closed_trades ?? shown.trades.filter((t: any) => t.type === 'sell').length} 笔平仓`}
            pad={false}
          >
            <Table
              size="small"
              pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
              rowKey={(r: any, i) => `${r.date}-${r.code ?? ''}-${r.type}-${i}`}
              dataSource={shown.trades}
              columns={[
                { title: '日期', dataIndex: 'date' },
                { title: '代码', dataIndex: 'code', render: (v: string, r: any) => <span className="mono small">{v ?? r.code ?? shown.code ?? '--'}</span> },
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
        data: ['策略资金', result.benchmark_name || '基准'],
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
          name: result.benchmark_name || '基准',
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
