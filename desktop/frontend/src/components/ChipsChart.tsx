import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import EChart from './EChart'
import { useTheme } from '../ThemeContext'

export default function ChipsChart({ chips, height = 240 }: { chips: any; height?: number }) {
  const { colors } = useTheme()
  const option = useMemo<EChartsOption>(() => {
    const buckets = chips?.buckets ?? []
    const prices = buckets.map((b: any) => b.price.toFixed(2))
    const weights = buckets.map((b: any) => b.pct)
    return {
      animation: false,
      grid: { left: 56, right: 42, top: 30, bottom: 22 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params
          return `价格 ${p.name} · 筹码 ${p.value}%`
        },
      },
      xAxis: {
        type: 'value',
        axisLabel: { color: colors.axis, fontSize: 9, formatter: '{value}%' },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: prices,
        axisLabel: { color: colors.axis, fontSize: 9.5, interval: Math.max(1, Math.floor(prices.length / 7)) },
        axisLine: { lineStyle: { color: colors.grid } },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: weights.map((w: number, i: number) => ({
            value: w,
            itemStyle: {
              color:
                buckets[i].price <= chips.current
                  ? colors.up + 'CC'
                  : colors.down + 'B3',
              borderRadius: [0, 3, 3, 0],
            },
          })),
          barWidth: '70%',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: colors.accent, type: 'dashed', width: 1.2 },
            label: { color: colors.accent, fontSize: 10, formatter: `现价 ${chips?.current ?? ''}` },
            data: [{ yAxis: chips?.current?.toFixed(2) }],
          },
        },
      ],
    }
  }, [chips, colors])
  return <EChart option={option} height={height} />
}
