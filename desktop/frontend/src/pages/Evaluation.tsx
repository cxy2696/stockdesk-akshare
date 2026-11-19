import { useEffect, useMemo, useState } from 'react'
import { Button, Select, Skeleton, Table, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { EChartsOption } from 'echarts'
import { api } from '../api'
import { Card, EmptyState, Kpi, More } from '../components/ui'
import EChart from '../components/EChart'
import { fmt, trendClass } from '../utils'
import { useTheme } from '../ThemeContext'

const INDEXES = [
  { value: '000300', label: '沪深300' },
  { value: '000001', label: '上证指数' },
  { value: '399006', label: '创业板指' },
  { value: '000688', label: '科创50' },
]

const STATE_TONE: Record<string, string> = {
  弱势: '#2EBD85',
  震荡: '#D99A2B',
  强势: '#F04438',
}

export default function Evaluation() {
  const [code, setCode] = useState('000300')
  const [horizon, setHorizon] = useState(5)
  const [lookback, setLookback] = useState(220)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { colors } = useTheme()

  const load = async (next = code, nextHorizon = horizon, nextLookback = lookback) => {
    setLoading(true)
    setError('')
    try {
      const result = await api.get<any>(`/api/models/history?code=${next}&limit=1000&horizon=${nextHorizon}&lookback=${nextLookback}`)
      if (result?.error) {
        setError(result.error)
        setData(null)
      } else {
        setData(result)
      }
    } catch (e: any) {
      setError(e?.message ?? '历史测评加载失败')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, horizon, lookback])

  const curve = data?.curve ?? []
  const option = useMemo<EChartsOption>(() => {
    const dates = curve.map((p: any) => p.date)
    const strategy = curve.map((p: any) => +((Number(p.strategy) - 1) * 100).toFixed(2))
    const benchmark = curve.map((p: any) => +((Number(p.benchmark) - 1) * 100).toFixed(2))
    return {
      animation: false,
      grid: { left: 44, right: 22, top: 28, bottom: 28 },
      legend: { data: ['模型仓位', '买入持有'], right: 8, top: 0, textStyle: { color: colors.textSub, fontSize: 11 } },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        valueFormatter: (v: any) => (typeof v === 'number' ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '--'),
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.axis } },
        axisLabel: { color: colors.axis, fontSize: 9.5, hideOverlap: true },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: colors.axis, fontSize: 9.5, formatter: '{value}%' },
        splitLine: { lineStyle: { color: colors.grid } },
        axisLine: { show: false },
      },
      series: [
        {
          name: '模型仓位',
          type: 'line',
          data: strategy,
          showSymbol: false,
          smooth: 0.18,
          lineStyle: { width: 2, color: colors.accent },
          itemStyle: { color: colors.accent },
          areaStyle: { color: colors.accent, opacity: 0.08 },
        },
        {
          name: '买入持有',
          type: 'line',
          data: benchmark,
          showSymbol: false,
          smooth: 0.18,
          lineStyle: { width: 1.5, color: colors.purple, type: 'dashed' },
          itemStyle: { color: colors.purple },
        },
      ],
    }
  }, [curve, colors])

  const stateRows = data?.by_state ?? []
  const calRows = data?.calibration ?? []
  const recent = (data?.recent ?? []).slice(0, 10)
  const h = data?.horizon ?? horizon
  const hit = data?.hit_rate
  const corr = data?.correlation
  const ci = data?.hit_rate_ci95
  const edge = hit == null ? '样本不足' : (ci && ci[0] > 0.5 && (corr == null || corr > 0)) ? '方向有优势' : hit <= 0.45 ? '方向偏弱' : '方向不稳定'
  const edgeTone = edge === '方向有优势' ? 'up' : edge === '方向偏弱' ? 'down' : 'muted'

  return (
    <div>
      <div className="daily-nav">
        <span className="daily-nav-label">滚动检验</span>
        <Select
          size="small"
          value={code}
          options={INDEXES}
          onChange={setCode}
          style={{ width: 132 }}
          popupMatchSelectWidth={false}
        />
        <Select
          size="small"
          value={horizon}
          options={[{ label: '持有 3 日', value: 3 }, { label: '持有 5 日', value: 5 }, { label: '持有 10 日', value: 10 }]}
          onChange={setHorizon}
          style={{ width: 104 }}
        />
        <Select
          size="small"
          value={lookback}
          options={[{ label: '回看 120 日', value: 120 }, { label: '回看 220 日', value: 220 }, { label: '回看 320 日', value: 320 }]}
          onChange={setLookback}
          style={{ width: 112 }}
        />
        <span className="muted small">{data ? `${data.lookback} 日回看 · 每 ${data.step} 日评估 · 持有 ${data.horizon} 日` : '滚动 220 日 · 5 日持有'}</span>
        <span className="daily-nav-spacer" />
        {data?.stale && <span className="muted small">后台更新中</span>}
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => load()}>刷新</Button>
      </div>

      {loading && !data ? (
        <div className="card card-pad"><Skeleton active paragraph={{ rows: 10 }} /></div>
      ) : error ? (
        <Card title="历史测评暂不可用">
          <EmptyState text={error} icon="◌" />
          <Button size="small" onClick={() => load()}>重试</Button>
        </Card>
      ) : !data ? (
        <Card><EmptyState text="还没有可评估的历史样本。" icon="◇" /></Card>
      ) : (
        <>
          <div className="kpi-grid evaluation-kpis">
            <Kpi
              label="评估样本"
              value={`${data.samples} 期`}
              sub={<span className="muted">{data.start} → {data.end} · {data.bars} 根日线</span>}
            />
            <Kpi
              label="方向命中率"
              value={hit == null ? '--' : `${(hit * 100).toFixed(1)}%`}
              color={hit >= 0.5 ? 'var(--up)' : 'var(--text)'}
              sub={<span className="muted">实际 {h} 日方向 · CI {data.hit_rate_ci95 ? `${(data.hit_rate_ci95[0] * 100).toFixed(0)}–${(data.hit_rate_ci95[1] * 100).toFixed(0)}%` : '--'} · 相关 {corr == null ? '--' : corr.toFixed(2)}</span>}
            />
            <Kpi
              label="模型仓位收益"
              value={fmt.pct(data.strategy_return * 100)}
              color={data.strategy_return >= 0 ? 'var(--up)' : 'var(--down)'}
              sub={<span className="muted">买入持有 {fmt.pct(data.benchmark_return * 100)} · 超额 {fmt.pct(data.excess_return * 100)}</span>}
            />
            <Kpi
              label="最大回撤"
              value={fmt.pct(data.max_drawdown * 100)}
              color="var(--down)"
              sub={<span className="muted">基准 {fmt.pct(data.benchmark_drawdown * 100)} · 夏普 {data.sharpe ?? '--'}</span>}
            />
          </div>
          <div className="evaluation-verdict">
            <b className={edgeTone}>{edge}</b>
            <span className="muted">命中率 {hit == null ? '--' : `${(hit * 100).toFixed(1)}%`} · 50% 为随机 · 样本 {data.samples} 期 · 回看 {data.lookback} 日 · 持有 {h} 日</span>
            <span className="muted">先看样本和回撤，再看命中率；这是样本外检验，不是收益承诺。</span>
          </div>

          <div style={{ marginTop: 14 }}>
            <Card
              title="历史净值对比"
              desc={`模型仓位按状态映射：弱势 20% / 震荡 60% / 强势 90%，并按概率小幅倾斜 · ${data.engine}`}
              extra={<span className="muted small">{data.stale ? '缓存快照' : '最新计算'} · {new Date((data.ts ?? 0) * 1000).toLocaleTimeString('zh-CN', { hour12: false })}</span>}
            >
              <EChart option={option} height={300} />
              <div className="muted small" style={{ marginTop: 6, lineHeight: 1.7 }}>
                滚动样本外检验；每 {data.step} 个交易日重训 HMM，信号只使用当日及以前的数据，持有 {h} 日结算。不是未来收益承诺。
              </div>
            </Card>
          </div>

          <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
            <Card title="分状态表现" desc={`状态、样本、实际 ${h} 日平均收益与方向命中`}>
              <Table
                size="small"
                rowKey="state"
                pagination={false}
                dataSource={stateRows}
                columns={[
                  {
                    title: '状态',
                    dataIndex: 'state',
                    render: (v: string) => <Tag color={STATE_TONE[v] ?? 'default'} style={{ marginInlineEnd: 0 }}>{v}</Tag>,
                  },
                  { title: '样本', dataIndex: 'count', align: 'right' as const },
                  { title: `实际 ${h} 日`, dataIndex: 'actual_avg', align: 'right' as const, render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                  { title: '命中率', dataIndex: 'hit_rate', align: 'right' as const, render: (v: number | null) => (v == null ? '--' : `${(v * 100).toFixed(0)}%`) },
                  { title: '平均置信', dataIndex: 'confidence', align: 'right' as const, render: (v: number | null) => (v == null ? '--' : `${(v * 100).toFixed(0)}%`) },
                ]}
              />
            </Card>

            <Card title="上涨概率校准" desc="按预测概率分组，观察实际上涨比例">
              <Table
                size="small"
                rowKey="bucket"
                pagination={false}
                dataSource={calRows}
                columns={[
                  { title: '概率分组', dataIndex: 'bucket' },
                  { title: '样本', dataIndex: 'count', align: 'right' as const },
                  { title: '实际上涨率', dataIndex: 'actual_up_rate', align: 'right' as const, render: (v: number | null) => (v == null ? '--' : `${(v * 100).toFixed(0)}%`) },
                  { title: '实际均值', dataIndex: 'actual_avg', align: 'right' as const, render: (v: number | null) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                ]}
              />
            </Card>
          </div>

          <div style={{ marginTop: 14 }}>
            <Card
              title="最近 10 期"
              desc={`状态、预测方向、实际 ${h} 日收益与模型仓位`}
              extra={<span className="muted small">按时间倒序 · 绿=命中 / 红=未命中</span>}
            >
              <Table
                size="small"
                rowKey="date"
                pagination={false}
                scroll={{ x: 720 }}
                dataSource={recent}
                columns={[
                  { title: '日期', dataIndex: 'date', width: 96, render: (v: string) => <span className="mono small">{v}</span> },
                  { title: '状态', dataIndex: 'state', width: 72, render: (v: string) => <span style={{ color: STATE_TONE[v] ?? 'var(--text-sub)', fontWeight: 600 }}>{v}</span> },
                  { title: '置信', dataIndex: 'confidence', width: 62, align: 'right' as const, render: (v: number) => (v == null ? '--' : `${(v * 100).toFixed(0)}%`) },
                  { title: `预期 ${h} 日`, dataIndex: 'expected_5d', width: 88, align: 'right' as const, render: (v: number | null) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                  { title: '上涨概率', dataIndex: 'prob_up', width: 78, align: 'right' as const, render: (v: number | null) => (v == null ? '--' : `${(v * 100).toFixed(0)}%`) },
                  { title: `实际 ${h} 日`, dataIndex: 'actual_5d', width: 88, align: 'right' as const, render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                  { title: '结果', dataIndex: 'hit', width: 66, align: 'center' as const, render: (v: boolean) => <span style={{ color: v ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>{v ? '命中' : '未中'}</span> },
                  { title: '仓位', dataIndex: 'exposure', width: 62, align: 'right' as const, render: (v: number) => `${(v * 100).toFixed(0)}%` },
                ]}
              />
            </Card>
          </div>

        </>
      )}
    </div>
  )
}
