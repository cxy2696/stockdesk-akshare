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

export default function NetWorthChart({ series, benchmark = [], height = 240, compact }: Props) {
  const { colors } = useTheme()
  const option = useMemo<EChartsOption>(() => {
    const dates = series.map((s) => s.date)
    const nav = series.map((s) => +((s.nav - 1) * 100).toFixed(2))
    const benchMap = new Map(benchmark.map((b) => [b.date, b.bench]))
    let lastB = 1
    const bench = dates.map((d) => {
      const v = benchMap.get(d)
      if (v !== undefined) lastB = v
      return +((lastB - 1) * 100).toFixed(2)
    })
    return {
      animation: false,
      grid: { left: compact ? 4 : 8, right: compact ? 4 : 8, top: compact ? 8 : 18, bottom: compact ? 4 : 8 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        valueFormatter: (v: any) => `${v > 0 ? '+' : ''}${v}%`,
      },
      legend: compact
        ? undefined
        : {
            right: 4,
            top: 0,
            itemWidth: 10,
            itemHeight: 2,
            textStyle: { color: colors.textSub, fontSize: 10 },
            data: ['账户', '沪深300'],
          },
      xAxis: {
        type: 'category',
        data: dates,
        show: !compact,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.axis, fontSize: 10 },
        axisTick: { show: false },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        show: !compact,
        scale: true,
        axisLabel: { color: colors.axis, fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      series: [
        {
          name: '账户',
          type: 'line',
          data: nav,
          smooth: 0.2,
          symbol: 'none',
          lineStyle: { width: 2, color: colors.accent },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colors.accent + '33' },
                { offset: 1, color: colors.accent + '00' },
              ],
            },
          },
        },
        {
          name: '沪深300',
          type: 'line',
          data: bench,
          smooth: 0.2,
          symbol: 'none',
          lineStyle: { width: 1.2, color: colors.purple, type: 'dashed', opacity: 0.85 },
        },
      ],
    }
  }, [series, benchmark, compact, colors])

  return <EChart option={option} height={height} />
}
