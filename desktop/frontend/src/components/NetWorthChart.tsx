import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import EChart from './EChart'
import { useTheme } from '../ThemeContext'

interface Props {
  series: { date: string; nav: number; total: number }[]
  benchmark?: { date: string; bench: number }[]
  height?: number
  compact?: boolean
}

/** 沪深 300 固定用蓝色，避免和主题 accent 混在一起。 */
const BENCH_COLOR = '#4C8DFF'
const EMPTY_SERIES: Props['series'] = []
const EMPTY_BENCH: NonNullable<Props['benchmark']> = []

function pctText(v: number | null) {
  if (v === null || Number.isNaN(v)) return '--'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

export default function NetWorthChart({ series, benchmark = EMPTY_BENCH, height = 240, compact }: Props) {
  const { colors } = useTheme()
  const safeSeries = series ?? EMPTY_SERIES
  const safeBenchmark = benchmark ?? EMPTY_BENCH

  const option = useMemo<EChartsOption>(() => {
    const dates = safeSeries.map((s) => s.date)
    const nav = safeSeries.map((s) => {
      if (typeof s.nav !== 'number' || !Number.isFinite(s.nav)) return null
      return +((s.nav - 1) * 100).toFixed(2)
    })

    // 基准按日期对齐；只对真实存在的点做前向填充，缺数据时保持 null。
    const benchMap = new Map<string, number>()
    safeBenchmark.forEach((b) => {
      if (b?.date && typeof b.bench === 'number' && Number.isFinite(b.bench)) benchMap.set(b.date, b.bench)
    })
    let lastBench: number | null = null
    const bench = dates.map((d) => {
      const raw = benchMap.get(d)
      if (raw !== undefined) lastBench = +((raw - 1) * 100).toFixed(2)
      return lastBench
    })
    const benchVals = bench.filter((v): v is number => v !== null)
    // 后端在基准缺失时会返回全 1 的占位序列，这里同样视为“数据不足”，
    // 不再画一条假的 0% 线。
    const hasBench = benchVals.length > 0 && benchVals.some((v) => Math.abs(v) >= 0.005)

    const yVals = [...nav.filter((v): v is number => v !== null), ...(hasBench ? benchVals : [])]
    const dataLow = yVals.length ? Math.min(...yVals) : 0
    const dataHigh = yVals.length ? Math.max(...yVals) : 0
    let yMin: number
    let yMax: number
    if (dataHigh - dataLow < 0.05) {
      // 单点或全平的曲线：给点留出空间，同时保留 0% 参考线。
      if (Math.abs(dataLow) < 0.001 && Math.abs(dataHigh) < 0.001) {
        yMin = -0.5
        yMax = 0.5
      } else {
        const span = Math.max(0.5, Math.abs(dataHigh) * 0.25, Math.abs(dataLow) * 0.25)
        yMin = dataLow >= 0 ? -0.05 : +(dataLow - span).toFixed(2)
        yMax = dataHigh <= 0 ? 0.05 : +(dataHigh + span).toFixed(2)
      }
    } else {
      const pad = Math.max((dataHigh - dataLow) * 0.15, 0.25)
      const tiny = +(pad * 0.06).toFixed(2)
      yMin = dataLow >= 0 ? -tiny : +(dataLow - pad).toFixed(2)
      yMax = dataHigh <= 0 ? tiny : +(dataHigh + pad).toFixed(2)
    }

    const fewPoints = dates.length <= 2

    const tooltipFormatter = (params: any) => {
      const list = Array.isArray(params) ? params : [params]
      const date = list[0]?.axisValue ?? ''
      const pick = (name: string) => {
        const p = list.find((x: any) => x.seriesName === name)
        if (!p) return null
        const n = Number(p.value)
        return Number.isFinite(n) ? n : null
      }
      const account = pick('账户')
      const benchValue = hasBench ? pick('沪深300') : null
      const excess = account !== null && benchValue !== null ? +(account - benchValue).toFixed(2) : null
      const rows = [
        `<div style="font-size:10px;color:${colors.axis};margin-bottom:4px">${date}</div>`,
        `<div style="display:flex;gap:18px;justify-content:space-between"><span>账户</span><b style="color:${colors.accent}">${pctText(account)}</b></div>`,
      ]
      if (hasBench) {
        rows.push(
          `<div style="display:flex;gap:18px;justify-content:space-between"><span>沪深300</span><b style="color:${BENCH_COLOR}">${pctText(benchValue)}</b></div>`,
          `<div style="display:flex;gap:18px;justify-content:space-between"><span>超额</span><b style="color:${excess !== null && excess >= 0 ? colors.up : colors.down}">${excess === null ? '--' : `${excess > 0 ? '+' : ''}${excess.toFixed(2)}%`}</b></div>`,
        )
      } else {
        rows.push(`<div style="margin-top:2px;color:${colors.axis}">沪深300 · 基准数据不足</div>`)
      }
      return rows.join('')
    }

    return {
      animation: false,
      grid: {
        left: compact ? 4 : 42,
        right: compact ? 4 : 14,
        top: compact ? 8 : 30,
        bottom: compact ? 4 : 26,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        axisPointer: { type: 'line', lineStyle: { color: colors.axis, opacity: 0.35 } },
        formatter: tooltipFormatter,
      },
      legend: compact
        ? undefined
        : {
            show: true,
            right: 4,
            top: 0,
            itemWidth: 14,
            itemHeight: 3,
            icon: 'roundRect',
            textStyle: { color: colors.textSub, fontSize: 10.5 },
            inactiveColor: colors.axis,
            data: ['账户', '沪深300'],
            formatter: (name: string) => (name === '沪深300' && !hasBench ? '沪深300（基准数据不足）' : name),
          },
      xAxis: {
        type: 'category',
        data: dates,
        show: !compact,
        boundaryGap: fewPoints,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.axis, fontSize: 10, hideOverlap: true },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        show: !compact,
        min: yMin,
        max: yMax,
        axisLabel: { color: colors.axis, fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      series: [
        {
          name: '账户',
          type: 'line',
          data: nav,
          smooth: fewPoints ? false : 0.2,
          symbol: fewPoints ? 'circle' : 'none',
          symbolSize: 5,
          showSymbol: fewPoints,
          itemStyle: { color: colors.accent, borderColor: colors.card, borderWidth: 1 },
          lineStyle: { width: 2.2, color: colors.accent },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colors.accent + '38' },
                { offset: 1, color: colors.accent + '00' },
              ],
            },
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: colors.axis, width: 1, type: 'dashed', opacity: 0.65 },
            label: {
              show: true,
              position: 'insideEndTop',
              formatter: '0%',
              color: colors.axis,
              fontSize: 9,
            },
            data: [{ yAxis: 0 }],
          },
          z: 3,
        },
        {
          name: '沪深300',
          type: 'line',
          data: hasBench ? bench : [],
          smooth: fewPoints ? false : 0.2,
          symbol: fewPoints ? 'circle' : 'none',
          symbolSize: 5,
          showSymbol: fewPoints,
          connectNulls: false,
          lineStyle: { width: 1.4, color: BENCH_COLOR, type: 'dashed', opacity: 0.95 },
          itemStyle: { color: BENCH_COLOR, borderColor: colors.card, borderWidth: 1 },
          z: 2,
        },
      ],
    }
  }, [safeSeries, safeBenchmark, compact, colors])

  if (!safeSeries.length) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          border: `1px dashed ${colors.grid}`,
          borderRadius: 10,
          color: colors.axis,
          fontSize: 12,
        }}
      >
        <span style={{ fontSize: 22, opacity: 0.55 }}>◌</span>
        <span>暂无净值数据，记一笔交易后开始计算</span>
      </div>
    )
  }

  return (
    <div>
      <EChart option={option} height={height} />
      {safeSeries.length === 1 && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: colors.textSub, lineHeight: 1.6 }}>
          只有 1 个交易日的数据，曲线会在第二个交易日后展开。
        </div>
      )}
    </div>
  )
}
