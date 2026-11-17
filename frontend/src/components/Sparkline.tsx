import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import EChart from './EChart'
import { useTheme } from '../ThemeContext'

interface Props {
  data: number[]
  color?: string
  height?: number
  filled?: boolean
}

export default function Sparkline({ data, color, height = 34, filled = true }: Props) {
  const { colors } = useTheme()
  const line = color || colors.accent
  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: 'category', show: false, boundaryGap: false, data: data.map((_, i) => i) },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: { show: false },
      series: [
        {
          type: 'line',
          data,
          smooth: 0.25,
          symbol: 'none',
          lineStyle: { width: 1.5, color: line },
          areaStyle: filled
            ? {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: line + '44' },
                    { offset: 1, color: line + '00' },
                  ],
                },
              }
            : undefined,
        },
      ],
    }),
    [data, line, filled],
  )
  if (!data.length) return <div style={{ height }} />
  return <EChart option={option} height={height} />
}
