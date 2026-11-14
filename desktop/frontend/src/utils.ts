export const UP = '#F04438'
export const DOWN = '#2EBD85'

export const fmt = {
  price(v?: number | null, digits = 2) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '--'
    return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  },
  money(v?: number | null, digits = 2) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '--'
    return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  },
  pct(v?: number | null, digits = 2) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '--'
    const s = v > 0 ? '+' : ''
    return `${s}${v.toFixed(digits)}%`
  },
  signed(v?: number | null, digits = 2) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '--'
    const s = v > 0 ? '+' : ''
    return `${s}${v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
  },
  big(v?: number | null) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '--'
    const abs = Math.abs(v)
    if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}万亿`
    if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
    if (abs >= 1e4) return `${(v / 1e4).toFixed(2)}万`
    return v.toFixed(0)
  },
  lots(v?: number | null) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '--'
    return `${(v / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}手`
  },
}

export function trendColor(v?: number | null) {
  if (v === null || v === undefined || v === 0) return '#9CA3AF'
  return v > 0 ? UP : DOWN
}

export function trendClass(v?: number | null) {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return 'flat'
  return v > 0 ? 'up' : 'down'
}

export const periodOptions = [
  { label: '日K', value: 'daily' },
  { label: '周K', value: 'weekly' },
  { label: '月K', value: 'monthly' },
]

export function calcMA(rows: { close: number }[], n: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < rows.length; i++) {
    sum += rows[i].close
    if (i >= n) sum -= rows[i - n].close
    out.push(i >= n - 1 ? +(sum / n).toFixed(3) : null)
  }
  return out
}

export function today() {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function moneyWan(v?: number | null) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '--'
  return `${(v / 1e4).toFixed(2)} 万`
}
