import { useEffect, useMemo, useState } from 'react'
import { Button } from 'antd'
import EChart from './EChart'
import { useTheme } from '../ThemeContext'

export interface HeatStock {
  code: string
  name: string
  value: number
  pct: number
  price: number
  industry?: string
  market?: string
}

export interface HeatGroup {
  name: string
  value: number
  pct: number
  children: HeatStock[]
}

export type HeatDirection = 'all' | 'up' | 'down'

/**
 * 搜索与涨跌筛选。按可见个股市值重新汇总板块面积和涨跌幅，
 * 避免筛选后板块还占着原来的面积。
 */
export function filterHeatmapGroups(groups: HeatGroup[], query = '', direction: HeatDirection = 'all'): HeatGroup[] {
  const q = query.trim().toLowerCase()
  const out: HeatGroup[] = []
  ;(groups ?? []).forEach((g) => {
    const children = (g.children ?? []).filter((c) => {
      if (q && !`${c.code ?? ''}`.toLowerCase().includes(q) && !`${c.name ?? ''}`.toLowerCase().includes(q)) return false
      const pct = Number(c.pct)
      const p = Number.isFinite(pct) ? pct : 0
      if (direction === 'up' && p <= 0) return false
      if (direction === 'down' && p >= 0) return false
      return true
    })
    if (!children.length) return
    const total = children.reduce((sum, c) => sum + (Number(c.value) || 0), 0)
    const pct = total > 0
      ? children.reduce((sum, c) => sum + (Number(c.pct) || 0) * (Number(c.value) || 0), 0) / total
      : 0
    out.push({ ...g, value: +total.toFixed(2), pct: +pct.toFixed(2), children })
  })
  return out
}

function toRgba(color: string, alpha: number) {
  const c = (color || '').trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(c)) {
    let hex = c.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((x) => x + x).join('')
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }
  return c
}

function mixWith(color: string, base: string, alpha: number) {
  const parse = (v: string) => {
    const c = (v || '').trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return null
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
  }
  const fg = parse(color)
  const bg = parse(base)
  if (!fg || !bg) return color
  const blend = (i: number) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha))
  return `rgb(${blend(0)}, ${blend(1)}, ${blend(2)})`
}

function escapeHtml(input: unknown) {
  return String(input ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ))
}

function useChartSize() {
  const calc = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
    return { height: vw >= 1440 ? 640 : 560, width: Math.max(560, vw - 260) }
  }
  const [size, setSize] = useState(calc)
  useEffect(() => {
    const onResize = () => setSize(calc())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

export default function HeatmapChart({
  groups,
  height,
  onSelect,
  query = '',
  direction = 'all',
  rootLabel = '行业',
}: {
  groups: HeatGroup[]
  height?: number
  onSelect: (code: string) => void
  query?: string
  direction?: HeatDirection
  rootLabel?: string
}) {
  const { colors } = useTheme()
  const size = useChartSize()
  const chartHeight = height ?? size.height
  const chartWidth = size.width
  const [drill, setDrill] = useState<string | null>(null)

  const visible = useMemo(() => filterHeatmapGroups(groups ?? [], query, direction), [groups, query, direction])

  useEffect(() => {
    if (drill && !visible.some((g) => g.name === drill)) setDrill(null)
  }, [visible, drill])

  const currentGroups = useMemo(
    () => (drill ? visible.filter((g) => g.name === drill) : visible),
    [visible, drill],
  )

  const borderColor = colors.card

  const option = useMemo<any>(() => {
    const labelColor = (pct: number) => (Math.abs(pct) >= 3 ? '#FFFFFF' : colors.text)
    const cellColor = (pct: number, isGroup = false) => {
      const v = Math.max(-10, Math.min(10, Number.isFinite(pct) ? pct : 0))
      if (Math.abs(v) <= 0.05) return mixWith(colors.axis, colors.card, isGroup ? 0.5 : 0.36)
      const base = v > 0 ? colors.up : colors.down
      const alpha = (isGroup ? 0.58 : 0.48) + (Math.abs(v) / 10) * 0.42
      return mixWith(base, colors.card, Math.min(0.96, alpha))
    }

    // 标签按“可用面积”显示：整张热图面积越大，能放下名字的方块越多。
    const rootValue = currentGroups.reduce((sum, g) => sum + (Number(g.value) || 0), 0)
    const labelMinValue = Math.max(20, rootValue * (3800 / Math.max(1, chartWidth * chartHeight)))

    const seriesData = currentGroups.map((g) => {
      return {
        name: g.name,
        value: g.value,
        pct: g.pct,
        isGroup: true,
        children: g.children.map((c) => {
          const pct = Number.isFinite(Number(c.pct)) ? Number(c.pct) : 0
          const showName = (Number(c.value) || 0) >= labelMinValue
          return {
            name: c.name,
            code: c.code,
            value: c.value,
            pct,
            price: c.price,
            group: g.name,
            industry: c.industry || g.name,
            itemStyle: {
              color: cellColor(pct),
              // Borders on 2–3 px tiles are what turn the middle of the map
              // into moiré.  Only tiles large enough to read get a border.
              borderColor: toRgba(borderColor, 0.5),
              borderWidth: showName ? 0.8 : 0,
            },
            emphasis: {
              itemStyle: {
                color: cellColor(pct),
                borderColor: colors.accent,
                borderWidth: 3,
                shadowBlur: 10,
                shadowColor: toRgba(colors.accent, 0.5),
              },
            },
            label: {
              show: showName,
              color: labelColor(pct),
              textBorderColor: Math.abs(pct) >= 3 ? 'rgba(0,0,0,0.28)' : 'transparent',
              textBorderWidth: 1,
              formatter: () => {
                const raw = String(c.name ?? '')
                const name = raw.length > 7 ? `${raw.slice(0, 6)}…` : raw
                return `${name}\n${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
              },
            },
          }
        }),
        itemStyle: { color: cellColor(g.pct, true) },
        emphasis: {
          itemStyle: {
            color: cellColor(g.pct, true),
            borderColor: colors.accent,
            borderWidth: 3,
            shadowBlur: 10,
            shadowColor: toRgba(colors.accent, 0.5),
          },
        },
      }
    })

    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        formatter: (p: any) => {
          const d = p?.data || {}
          if (d.code) {
            const pct = Number.isFinite(Number(d.pct)) ? Number(d.pct) : 0
            const tone = pct >= 0 ? colors.up : colors.down
            return `<div style="font-weight:650;font-size:12px">${escapeHtml(d.name)} <span style="color:${colors.axis};font-weight:400">${escapeHtml(d.code)}</span></div>
              <div style="margin-top:4px;display:flex;gap:18px;justify-content:space-between"><span>涨跌幅</span><b style="color:${tone}">${pct > 0 ? '+' : ''}${pct.toFixed(2)}%</b></div>
              <div style="display:flex;gap:18px;justify-content:space-between"><span>总市值</span><b>${(Number(d.value) || 0).toFixed(0)} 亿</b></div>
              <div style="color:${colors.axis}">所属行业/板块 ${escapeHtml(d.industry || d.group || '--')}</div>
              <div style="margin-top:3px;color:${colors.axis};font-size:10px">单击查看个股详情</div>`
          }
          const pct = Number.isFinite(Number(d.pct)) ? Number(d.pct) : 0
          const tone = pct >= 0 ? colors.up : colors.down
          const group = currentGroups.find((g) => g.name === (d.name || p?.name))
          const count = group?.children.length ?? (d.children || []).length
          return `<div style="font-weight:650;font-size:12px">${escapeHtml(d.name || p?.name)} <span style="color:${colors.axis};font-weight:400">板块</span></div>
            <div style="margin-top:4px;display:flex;gap:18px;justify-content:space-between"><span>板块涨跌</span><b style="color:${tone}">${pct > 0 ? '+' : ''}${pct.toFixed(2)}%</b></div>
            <div style="display:flex;gap:18px;justify-content:space-between"><span>成分股</span><b>${count} 只</b></div>
            <div style="display:flex;gap:18px;justify-content:space-between"><span>总市值</span><b>${(Number(d.value) || 0).toFixed(0)} 亿</b></div>
            <div style="margin-top:3px;color:${colors.axis};font-size:10px">单击进入该板块</div>`
        },
      },
      series: [
        {
          type: 'treemap',
          leafDepth: 2,
          roam: false,
          nodeClick: false,
          // Overview mode: thousands of 2–3 px tiles are unreadable, so hide
          // nodes below a usable pixel area.  The search box re-lays out the
          // remaining names, so small caps are still reachable.
          visibleMin: 320,
          childrenVisibleMin: 320,
          breadcrumb: { show: false },
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          levels: [
            { itemStyle: { borderColor, borderWidth: 3, gapWidth: 2 } },
            { itemStyle: { borderColor: toRgba(borderColor, 0.35), borderWidth: 0, gapWidth: 0.3 } },
          ],
          upperLabel: {
            show: true,
            height: 22,
            color: colors.text,
            fontSize: 11,
            fontWeight: 650,
            backgroundColor: toRgba(colors.card, 0.9),
            borderColor: toRgba(colors.text, 0.08),
            borderWidth: 1,
            borderRadius: 4,
            padding: [3, 6],
            formatter: (p: any) => {
              const d = p?.data || {}
              const pct = Number(d.pct)
              const label = d.name || p?.name || ''
              if (!Number.isFinite(pct)) return label
              return `${label}  ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
            },
          },
          label: {
            show: true,
            position: 'inside',
            color: colors.text,
            fontSize: 10.5,
            lineHeight: 13,
            fontWeight: 600,
            overflow: 'truncate',
          },
          itemStyle: { borderColor },
          emphasis: {
            itemStyle: {
              borderColor: colors.accent,
              borderWidth: 2,
            },
            label: { fontWeight: 700 },
            upperLabel: { color: colors.text },
          },
          data: seriesData,
        },
      ],
    }
  }, [currentGroups, colors, borderColor, chartWidth, chartHeight])

  const events = useMemo(
    () => ({
      click: (p: any) => {
        const d = p?.data || {}
        if (d.code) {
          onSelect(d.code)
          return
        }
        if (d.name) setDrill(d.name)
      },
    }),
    [onSelect],
  )

  const breadcrumb = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
      <button
        type="button"
        className="link"
        onClick={() => setDrill(null)}
        style={{ background: 'none', border: 0, padding: 0, fontSize: 12.5, fontFamily: 'inherit' }}
      >
        全部{rootLabel}
      </button>
      {drill && (
        <>
          <span style={{ color: colors.axis }}>/</span>
          <b style={{ fontSize: 12.5 }}>{drill}</b>
          <span className="muted small">{currentGroups[0]?.children.length ?? 0} 只</span>
          <Button size="small" onClick={() => setDrill(null)} style={{ marginLeft: 2 }}>返回全部</Button>
        </>
      )}
      <span style={{ marginLeft: 'auto', color: colors.axis, fontSize: 11 }}>
        单击板块下钻 · 单击个股查看详情
      </span>
    </div>
  )

  if (!currentGroups.length) {
    return (
      <div style={{ width: '100%', minWidth: 0 }}>
        {breadcrumb}
        <div
          style={{
            height: chartHeight,
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
          <span style={{ fontSize: 24, opacity: 0.55 }}>▦</span>
          <span>
            {(groups ?? []).length
              ? '当前筛选条件下没有匹配的个股，清空搜索或切回“全部”再试。'
              : '暂无热图数据'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
      {breadcrumb}
      <div style={{ width: '100%', minWidth: 0, cursor: 'pointer' }}>
        <EChart option={option} height={chartHeight} onEvents={events} notMerge />
      </div>
    </div>
  )
}
