import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

interface Props {
  option: echarts.EChartsOption
  height?: number | string
  className?: string
  onEvents?: Record<string, (params: any) => void>
  notMerge?: boolean
}

export default function EChart({ option, height = 300, className, onEvents, notMerge }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chart.current = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    if (!chart.current) return
    chart.current.setOption(option, { notMerge: notMerge ?? false })
  }, [option, notMerge])

  useEffect(() => {
    if (!chart.current || !onEvents) return
    Object.entries(onEvents).forEach(([ev, fn]) => chart.current?.on(ev, fn))
    return () => {
      Object.keys(onEvents).forEach((ev) => chart.current?.off(ev))
    }
  }, [onEvents])

  return <div ref={ref} className={className} style={{ width: '100%', height }} />
}
