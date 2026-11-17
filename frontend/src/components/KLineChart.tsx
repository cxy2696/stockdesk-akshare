import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import EChart from './EChart'
import { calcMA } from '../utils'
import { useTheme } from '../ThemeContext'

export interface KRow {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  amount: number
  pct: number
}

export interface FibLevel {
  price: number
  name: string
  kind: string
  ratio?: number
}

interface Props {
  rows: KRow[]
  height?: number
  mas?: number[]
  fib?: FibLevel[]
  showFib?: boolean
  showMACD?: boolean
  showTD?: boolean
}

function ema(values: number[], n: number): number[] {
  if (!values.length) return []
  const k = 2 / (n + 1)
  const out = [values[0]]
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k))
  return out
}

/** TD Sequential (九转): 9 consecutive closes below/above the close 4 bars ago. */
function tdSequential(closes: number[]): { buy: number[]; sell: number[] } {
  const buy = new Array(closes.length).fill(0)
  const sell = new Array(closes.length).fill(0)
  let bc = 0
  let sc = 0
  for (let i = 4; i < closes.length; i++) {
    if (closes[i] < closes[i - 4]) {
      bc += 1
      sc = 0
    } else if (closes[i] > closes[i - 4]) {
      sc += 1
      bc = 0
    } else {
      bc = 0
      sc = 0
    }
    buy[i] = Math.min(bc, 9)
    sell[i] = Math.min(sc, 9)
  }
  return { buy, sell }
}

export default function KLineChart({
  rows,
  height = 480,
  mas = [5, 10, 20, 60],
  fib = [],
  showFib = true,
  showMACD = true,
  showTD = true,
}: Props) {
  const { colors } = useTheme()
  const option = useMemo<EChartsOption>(() => {
    const dates = rows.map((r) => r.date)
    const startIdx = Math.max(0, rows.length - 120)
    const shownRows = rows.slice(startIdx)
    const yMin = Math.min(...shownRows.map((r) => r.low)) * 0.995
    const yMax = Math.max(...shownRows.map((r) => r.high)) * 1.005
    const showRail = showFib && fib.length > 0
    const gridLeft = showRail ? 88 : 12
    const gridTop = 26
    const priceH = height * (showMACD ? 0.44 : 0.56)
    const yPix = (price: number) => gridTop + ((yMax - price) / Math.max(yMax - yMin, 1e-6)) * priceH

    const candles = rows.map((r) => [r.open, r.close, r.low, r.high])
    const vols = rows.map((r) => ({
      value: r.volume,
      itemStyle: { color: r.close >= r.open ? colors.up + '99' : colors.down + '99' },
    }))
    const maColors = [colors.amber, colors.cyan, colors.purple, colors.axis]
    const maSeries = mas.map((n, i) => ({
      name: `MA${n}`,
      type: 'line' as const,
      data: calcMA(rows, n),
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1, color: maColors[i % maColors.length], opacity: 0.85 },
      itemStyle: { color: maColors[i % maColors.length] },
      xAxisIndex: 0,
      yAxisIndex: 0,
      z: 3,
    }))

    // MACD
    const closes = rows.map((r) => r.close)
    const dif = ema(closes, 12).map((v, i) => v - ema(closes, 26)[i])
    const dea = ema(dif, 9)
    const hist = dif.map((v, i) => (v - dea[i]) * 2)
    const macdBars = hist.map((v) => ({
      value: +v.toFixed(3),
      itemStyle: { color: v >= 0 ? colors.up + 'CC' : colors.down + 'CC' },
    }))

    // TD 九转
    const td = tdSequential(closes)
    const tdBuy = rows
      .map((r, i) => ({ r, i, n: td.buy[i] }))
      .filter((x) => x.n >= 5)
      .map((x) => ({
        value: [x.r.date, x.r.low * 0.993],
        count: x.n,
        itemStyle: { color: x.n === 9 ? colors.down : colors.down + '99' },
        label: { color: '#fff' },
      }))
    const tdSell = rows
      .map((r, i) => ({ r, i, n: td.sell[i] }))
      .filter((x) => x.n >= 5)
      .map((x) => ({
        value: [x.r.date, x.r.high * 1.007],
        count: x.n,
        itemStyle: { color: x.n === 9 ? colors.up : colors.up + '99' },
        label: { color: '#fff' },
      }))

    const grids: any[] = [
      { left: gridLeft, right: 64, top: 26, height: `${showMACD ? 44 : 56}%` },
      { left: gridLeft, right: 64, top: showMACD ? '55%' : '66%', height: '9%' },
    ]
    if (showMACD) grids.push({ left: gridLeft, right: 64, top: '68%', height: '15%' })

    const xAxes: any[] = [
      {
        type: 'category', data: dates, boundaryGap: true,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { show: false }, axisTick: { show: false },
        min: 'dataMin', max: 'dataMax',
      },
      {
        type: 'category', gridIndex: 1, data: dates, boundaryGap: true,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { show: false }, axisTick: { show: false },
      },
    ]
    if (showMACD) {
      xAxes.push({
        type: 'category', gridIndex: 2, data: dates, boundaryGap: true,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.axis, fontSize: 9.5, hideOverlap: true },
        axisTick: { show: false },
      })
    }

    const yAxes: any[] = [
      {
        min: yMin, max: yMax, position: 'right',
        axisLine: { show: false },
        axisLabel: { color: colors.axis, fontSize: 10, formatter: (v: number) => v.toFixed(0) },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      {
        gridIndex: 1, scale: true, position: 'right',
        axisLine: { show: false }, axisLabel: { show: false }, splitLine: { show: false }, splitNumber: 2,
      },
    ]
    if (showMACD) {
      yAxes.push({
        gridIndex: 2, scale: true, position: 'right',
        axisLine: { show: false },
        axisLabel: { color: colors.axis, fontSize: 9, formatter: (v: number) => v.toFixed(0) },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
        splitNumber: 2,
      })
    }

    const series: any[] = [
      {
        name: 'K线', type: 'candlestick', data: candles,
        itemStyle: { color: colors.up, color0: colors.down, borderColor: colors.up, borderColor0: colors.down },
        xAxisIndex: 0, yAxisIndex: 0,
      },
      ...maSeries,
      { name: '成交量', type: 'bar', data: vols, xAxisIndex: 1, yAxisIndex: 1, barWidth: '58%' },
    ]
    if (showMACD) {
      series.push(
        {
          name: 'MACD', type: 'bar', data: macdBars, xAxisIndex: 2, yAxisIndex: 2, barWidth: '55%',
        },
        {
          name: 'DIF', type: 'line', data: dif.map((v) => +v.toFixed(3)), symbol: 'none',
          lineStyle: { width: 1.1, color: colors.amber }, xAxisIndex: 2, yAxisIndex: 2,
        },
        {
          name: 'DEA', type: 'line', data: dea.map((v) => +v.toFixed(3)), symbol: 'none',
          lineStyle: { width: 1.1, color: colors.purple }, xAxisIndex: 2, yAxisIndex: 2,
        },
      )
    }
    if (showTD) {
      series.push(
        {
          name: '九转买', type: 'scatter', data: tdBuy, xAxisIndex: 0, yAxisIndex: 0, symbolSize: 16, z: 20,
          label: { show: true, formatter: (p: any) => String(p.data.count), fontSize: 9, fontWeight: 700, color: '#fff' },
          tooltip: { show: false },
        },
        {
          name: '九转卖', type: 'scatter', data: tdSell, xAxisIndex: 0, yAxisIndex: 0, symbolSize: 16, z: 20,
          label: { show: true, formatter: (p: any) => String(p.data.count), fontSize: 9, fontWeight: 700, color: '#fff' },
          tooltip: { show: false },
        },
      )
    }

    const fibSeries = showRail
      ? {
          name: '黄金分割', type: 'line', data: [], z: 30, silent: true,
          markLine: {
            symbol: 'none', silent: true, animation: false, z: 30,
            data: fib.map((l) => {
              const color = l.kind === '压力' ? colors.purple : colors.amber
              return {
                yAxis: l.price,
                lineStyle: { color, type: 'dashed', width: 1, opacity: 0.75 },
                label: { show: false },
              }
            }),
          },
        }
      : null
    if (fibSeries) series.push(fibSeries)

    return {
      animation: false,
      backgroundColor: 'transparent',
      legend: {
        top: 0, left: 4, itemWidth: 12, itemHeight: 2,
        textStyle: { color: colors.textSub, fontSize: 10.5 },
        data: mas.map((n) => `MA${n}`),
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: colors.text } },
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11.5 },
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params]
          const i = list[0]?.dataIndex
          if (i === undefined) return ''
          const r = rows[i]
          const cls = r.close >= r.open ? 'color:#F04438' : 'color:#2EBD85'
          const parts = [
            `<div style="font-weight:600;margin-bottom:4px">${r.date}</div>`,
            `<div style="display:grid;grid-template-columns:auto auto;gap:2px 14px">`,
            `<span style="color:${colors.textSub}">开</span><span style="${cls}">${r.open.toFixed(2)}</span>`,
            `<span style="color:${colors.textSub}">收</span><span style="${cls}">${r.close.toFixed(2)}</span>`,
            `<span style="color:${colors.textSub}">高</span><span style="color:${colors.text}">${r.high.toFixed(2)}</span>`,
            `<span style="color:${colors.textSub}">低</span><span style="color:${colors.text}">${r.low.toFixed(2)}</span>`,
            `<span style="color:${colors.textSub}">涨跌</span><span style="${cls}">${r.pct > 0 ? '+' : ''}${r.pct.toFixed(2)}%</span>`,
            `<span style="color:${colors.textSub}">成交量</span><span style="color:${colors.text}">${(r.volume / 1e4).toFixed(2)}万手</span>`,
            `<span style="color:${colors.textSub}">成交额</span><span style="color:${colors.text}">${(r.amount / 1e8).toFixed(2)}亿</span>`,
            `</div>`,
          ]
          if (showMACD) {
            parts.push(
              `<div style="margin-top:4px;color:${colors.textSub};font-size:10.5px">MACD ${hist[i].toFixed(2)} · DIF ${dif[i].toFixed(2)} · DEA ${dea[i].toFixed(2)}</div>`,
            )
          }
          const tdb = td.buy[i]
          const tds = td.sell[i]
          if (tdb >= 5 || tds >= 5) {
            parts.push(`<div style="margin-top:3px;font-size:10.5px">九转：${tdb >= 5 ? `买入 ${tdb}` : ''}${tdb >= 5 && tds >= 5 ? ' / ' : ''}${tds >= 5 ? `卖出 ${tds}` : ''}</div>`)
          }
          return parts.join('')
        },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      dataZoom: [
        { type: 'inside', xAxisIndex: showMACD ? [0, 1, 2] : [0, 1], startValue: dates[startIdx], endValue: dates[dates.length - 1] },
        {
          show: true,
          xAxisIndex: showMACD ? [0, 1, 2] : [0, 1],
          type: 'slider', bottom: 2, height: 14,
          borderColor: 'transparent', backgroundColor: 'transparent',
          fillerColor: colors.accent + '22', handleStyle: { color: colors.accent },
          textStyle: { color: colors.axis, fontSize: 9 },
          startValue: dates[startIdx], endValue: dates[dates.length - 1],
        },
      ],
      graphic: [
        ...(showRail
          ? fib.map((l) => {
            const color = l.kind === '压力' ? colors.purple : colors.amber
            return {
              type: 'text' as const,
              left: 2,
              top: yPix(l.price) - 7,
              silent: true,
              style: {
                text: `${l.name} ${l.price.toFixed(2)}`,
                fill: color,
                font: '9px "SF Mono", "JetBrains Mono", monospace',
                backgroundColor: colors.card,
                borderColor: color,
                borderWidth: 0.5,
                padding: [2, 4] as [number, number],
              },
            }
          })
          : []),
        ...(showMACD
          ? [{
              type: 'text' as const,
              left: gridLeft,
              top: height * 0.68 - 15,
              silent: true,
              style: { text: 'MACD(12,26,9)', fill: colors.axis, font: '9px "SF Mono", monospace' },
            }]
          : []),
      ],
      series,
    }
  }, [rows, mas, colors, fib, showFib, showMACD, showTD, height])

  return <EChart option={option} height={height} notMerge />
}
