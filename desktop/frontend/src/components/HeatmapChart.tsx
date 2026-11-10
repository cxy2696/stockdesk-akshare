import { useCallback, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import EChart from './EChart'

export interface HeatGroup {
  name: string
  value: number
  pct: number
  children: { code: string; name: string; value: number; pct: number; price: number }[]
}

function colorFor(pct: number, alphaBoost = 0) {
  const v = Math.max(-10, Math.min(10, pct || 0))
  if (v > 0.05) return `rgba(229,72,77,${Math.min(0.96, 0.4 + v / 12 + alphaBoost)})`
  if (v < -0.05) return `rgba(24,160,88,${Math.min(0.96, 0.4 + Math.abs(v) / 12 + alphaBoost)})`
  return 'rgba(139,149,168,0.45)'
}

export default function HeatmapChart({
  groups,
  height = 620,
  onSelect,
}: {
  groups: HeatGroup[]
  height?: number
  onSelect: (code: string) => void
}) {
  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      tooltip: {
        backgroundColor: 'rgba(17,24,39,0.94)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#E5E7EB', fontSize: 11.5 },
        formatter: (p: any) => {
          const d = p.data || {}
          if (d.code) {
            return `<b>${d.name}</b> <span style="color:#9CA3AF">${d.code}</span><br/>涨跌幅 <b style="color:${(d.pct ?? 0) >= 0 ? '#F04438' : '#2EBD85'}">${(d.pct ?? 0).toFixed(2)}%</b><br/>市值 ${(d.value ?? 0).toFixed(0)} 亿`
          }
          return `<b>${d.name || p.name}</b><br/>板块涨跌 ${(d.pct ?? 0).toFixed(2)}%<br/>市值 ${(d.value ?? 0).toFixed(0)} 亿`
        },
      },
      series: [
        {
          type: 'treemap',
          leafDepth: 2,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          levels: [
            { itemStyle: { borderColor: '#ffffff', borderWidth: 3, gapWidth: 2 } },
            { itemStyle: { borderColor: 'rgba(255,255,255,0.55)', borderWidth: 1, gapWidth: 1 } },
          ],

          upperLabel: {
            show: true,
            formatter: '{b}',
            height: 20,
            color: '#0F172A',
            fontSize: 10.5,
            fontWeight: 600,
            backgroundColor: 'rgba(255,255,255,0.85)',
            padding: [2, 4],
          },
          label: {
            show: true,
            color: '#fff',
            fontSize: 10,
            lineHeight: 13,
            formatter: (p: any) => {
              const d = p.data || {}
              if (!d.code) return ''
              const pct = d.pct ?? 0
              return `${d.name}\n${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
            },
          },
          itemStyle: { borderColor: '#fff' },
          data: groups.map((g) => ({
            name: g.name,
            value: g.value,
            pct: g.pct,
            itemStyle: { color: colorFor(g.pct, 0.05) },
            children: g.children.map((c) => ({
              name: c.name,
              code: c.code,
              value: c.value,
              pct: c.pct,
              price: c.price,
              itemStyle: { color: colorFor(c.pct) },
              label: { show: c.value >= 150 },
            })),
          })),
        },
      ],
    }),
    [groups],
  )

  const events = useMemo(
    () => ({
      click: (p: any) => {
        if (p?.data?.code) onSelect(p.data.code)
      },
    }),
    [onSelect],
  )

  return <EChart option={option} height={height} onEvents={events} />
}
