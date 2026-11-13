import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Spin, Table } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState } from '../components/ui'
import { fmt, trendClass } from '../utils'

/* ------------------------------------------------------------------ utils */

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`

const share = (v?: number | null, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? '--' : `${(v * 100).toFixed(digits)}%`

const num = (v?: number | null, digits = 2) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '--' : Number(v).toFixed(digits)

function stateTone(label?: string) {
  if (label === '强势') return 'var(--up)'
  if (label === '弱势') return 'var(--down)'
  return 'var(--amber)'
}

function biasTone(bias?: string) {
  if (bias === '偏多') return 'var(--up)'
  if (bias === '偏空') return 'var(--down)'
  return 'var(--text-sub)'
}

function percTone(status?: string) {
  if (!status) return 'var(--text-sub)'
  if (status.startsWith('超临界')) return 'var(--up)'
  if (status.startsWith('亚临界')) return 'var(--down)'
  return 'var(--amber)'
}

function regimeTone(regime?: string) {
  if (regime === '扩散') return 'var(--up)'
  if (regime === '分裂') return 'var(--down)'
  return 'var(--amber)'
}

function stanceTone(stance?: string) {
  if (!stance) return 'var(--text-sub)'
  if (stance.includes('进攻') || stance.includes('偏多')) return 'var(--up)'
  if (stance.includes('防守')) return 'var(--down)'
  return 'var(--amber)'
}

function timeText(ts?: number) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function parsePosition(text?: string): { low: number; high: number; mid: number } | null {
  const m = String(text ?? '').match(/(\d+)\s*%\s*[-–—~至]\s*(\d+)\s*%/)
  if (!m) return null
  const low = Number(m[1])
  const high = Number(m[2])
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null
  return { low, high, mid: (low + high) / 2 }
}

function countdownText(td: any) {
  if (!td) return '--'
  const parts: string[] = []
  if (td.buy?.count) parts.push(`买 ${td.buy.count}/9${td.buy.completed ? ' 完成' : ''}`)
  if (td.sell?.count) parts.push(`卖 ${td.sell.count}/9${td.sell.completed ? ' 完成' : ''}`)
  const cd = td.countdown ?? {}
  if (cd.count) parts.push(`${cd.direction === 'sell' ? '卖' : '买'}倒计时 ${cd.count}/13`)
  return parts.length ? parts.join(' · ') : '无进行中结构'
}

function chipStyle(tone: string, filled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    color: tone,
    background: tint(tone, filled ? 16 : 7),
    border: `1px solid ${tint(tone, 32)}`,
    borderRadius: 5,
    padding: '1px 7px',
    fontSize: 10.5,
    fontWeight: 600,
    lineHeight: 1.5,
    whiteSpace: 'nowrap',
  }
}

/* -------------------------------------------------------------- fragments */

function Metric({
  label,
  value,
  sub,
  color,
  title,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  color?: string
  title?: string
}) {
  return (
    <div
      title={title}
      style={{
        padding: '9px 11px',
        border: '1px solid var(--border-soft)',
        background: 'var(--card-2)',
        borderRadius: 7,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: 16,
          fontWeight: 650,
          marginTop: 3,
          color: color ?? 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {sub ? (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-dim)',
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  )
}

function LoadingBody({ text, rows = 4 }: { text: string; rows?: number }) {
  const widths = [92, 76, 86, 64, 80]
  return (
    <div>
      <div className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Spin size="small" />
        <span>{text}</span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 11,
              width: `${widths[i % widths.length]}%`,
              borderRadius: 4,
              background: 'linear-gradient(90deg, var(--card-2), var(--border-soft) 55%, var(--card-2))',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function InlineEmpty({ text }: { text: string }) {
  return (
    <div
      style={{
        minHeight: 96,
        display: 'grid',
        placeItems: 'center',
        padding: '18px 12px',
        color: 'var(--text-dim)',
        fontSize: 11.5,
        lineHeight: 1.8,
        textAlign: 'center',
        border: '1px dashed var(--border-soft)',
        borderRadius: 7,
      }}
    >
      <span>{text}</span>
    </div>
  )
}

function SubHead({ title, note }: { title: ReactNode; note?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 650 }}>{title}</span>
      {note ? (
        <span className="muted" style={{ fontSize: 10.5 }}>
          {note}
        </span>
      ) : null}
    </div>
  )
}

function SectionTitle({ title, desc }: { title: ReactNode; desc?: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span>{title}</span>
      {desc ? (
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>
          {desc}
        </span>
      ) : null}
    </span>
  )
}

function LegendDot({ color }: { color: string }) {
  return <i style={{ display: 'inline-block', width: 8, height: 8, background: color, borderRadius: 2, marginRight: 4 }} />
}

/* --------------------------------------------------------------- percolation */

function PercGrid({ cells, cols, rows }: { cells: number[]; cols: number; rows: number }) {
  if (!cells?.length) return <InlineEmpty text="格点数据为空，等下一次采样。" />
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols || 50}, minmax(0, 1fr))`,
        gap: 1,
        padding: 3,
        background: 'var(--border-soft)',
        border: '1px solid var(--border-soft)',
        borderRadius: 4,
        maxWidth: 480,
      }}
      title={`${cols} × ${rows} 格点`}
    >
      {cells.map((v, i) => (
        <i
          key={i}
          style={{
            display: 'block',
            aspectRatio: '1',
            background: v === 2 ? 'var(--accent)' : v === 1 ? tint('var(--up)', 40) : 'var(--card-2)',
            opacity: v === 0 ? 0.85 : 1,
          }}
        />
      ))}
    </div>
  )
}

function ClusterBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...(values ?? []))
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {(values ?? []).map((n, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 48px', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 10 }}>
            #{i + 1}
          </span>
          <div style={{ height: 6, background: 'var(--card-2)', border: '1px solid var(--border-soft)' }}>
            <i style={{ display: 'block', height: '100%', width: `${Math.max(4, (n / max) * 100)}%`, background: 'var(--accent)', opacity: 0.8 }} />
          </div>
          <b className="num" style={{ fontSize: 10.5, textAlign: 'right' }}>
            {n} 只
          </b>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- TD */

function TdTable({
  rows,
  mode,
  nav,
  emptyText,
}: {
  rows: any[]
  mode: 'index' | 'portfolio' | 'leader'
  nav: (p: string) => void
  emptyText: string
}) {
  const columns: any[] = [
    {
      title: '标的',
      key: 'name',
      width: 200,
      render: (_: any, x: any) => (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
          <b className="small">{x.name ?? x.code}</b>
          <span className="muted mono" style={{ fontSize: 9.5 }}>
            {x.code}
          </span>
          {mode === 'index' && x.state ? (
            <span style={{ fontSize: 9.5, color: stateTone(x.state) }}>HMM {x.state}</span>
          ) : null}
          {mode === 'leader' && x.industry ? (
            <span className="muted" style={{ fontSize: 9.5 }}>
              {x.industry}
            </span>
          ) : null}
          {mode === 'portfolio' && x.weight !== null && x.weight !== undefined ? (
            <span className="muted" style={{ fontSize: 9.5 }}>
              仓位 {Number(x.weight).toFixed(1)}%
            </span>
          ) : null}
          {mode === 'portfolio' && x.float_pct !== null && x.float_pct !== undefined ? (
            <span className={trendClass(x.float_pct)} style={{ fontSize: 9.5 }}>
              浮动 {fmt.pct(x.float_pct)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      title: '信号',
      key: 'signal',
      width: 170,
      render: (_: any, x: any) => {
        const td = x.td ?? {}
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={`chip ${td.bias === '偏多' ? 'up' : td.bias === '偏空' ? 'down' : ''}`}>{td.label ?? '无结构'}</span>
            <span className="muted" style={{ fontSize: 9.5 }}>
              {td.bias ?? '--'}
              {td.strength && td.strength !== '无' ? ` · ${td.strength}` : ''}
            </span>
          </span>
        )
      },
    },
    {
      title: '评分',
      key: 'score',
      width: 62,
      align: 'right',
      render: (_: any, x: any) => (
        <b className="num" style={{ color: biasTone(x.td?.bias), fontSize: 12 }}>
          {x.td?.score ?? '--'}
        </b>
      ),
    },
    {
      title: '倒计时',
      key: 'countdown',
      width: 156,
      render: (_: any, x: any) => (
        <span className="small" style={{ color: 'var(--text-sub)', fontFamily: "'SF Mono', monospace", fontSize: 10.5 }}>
          {countdownText(x.td)}
        </span>
      ),
    },
    {
      title: '解读',
      key: 'read',
      render: (_: any, x: any) => (
        <span style={{ color: 'var(--text-sub)', fontSize: 10.5, lineHeight: 1.65 }}>{x.td?.read ?? '暂无解读'}</span>
      ),
    },
  ]
  return (
    <Table
      size="small"
      rowKey={(x: any) => x.code}
      pagination={false}
      dataSource={rows ?? []}
      columns={columns}
      locale={{
        emptyText: (
          <div style={{ padding: '16px 0', color: 'var(--text-dim)', fontSize: 11.5, lineHeight: 1.7 }}>{emptyText}</div>
        ),
      }}
      onRow={(x: any) =>
        mode === 'index'
          ? {}
          : { onClick: () => nav(`/stock/${x.code}`), style: { cursor: 'pointer' } }
      }
    />
  )
}

/* --------------------------------------------------------------- main page */

export default function Models() {
  const nav = useNavigate()
  const [data, setData] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [portLoading, setPortLoading] = useState(true)
  const [portError, setPortError] = useState('')
  const [last, setLast] = useState('')
  const [selCode, setSelCode] = useState('000300')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setRefreshing(true)
    const [m, p] = await Promise.allSettled([
      api.get<any>('/api/market/models'),
      api.get<any>('/api/portfolio/summary'),
    ])
    if (m.status === 'fulfilled') {
      setData(m.value)
      setError('')
      setLast(timeText(m.value?.ts))
    } else {
      setError((m.reason as any)?.message ?? '模型接口请求失败')
    }
    if (p.status === 'fulfilled') {
      setSummary(p.value)
      setPortError('')
    } else {
      setPortError((p.reason as any)?.message ?? '持仓接口请求失败')
    }
    setPortLoading(false)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), 5 * 60_000)
    return () => clearInterval(timer)
  }, [load])

  const hmmList: any[] = data?.hmm_indices ?? []
  const hmm = hmmList.find((x) => x?.code === selCode) ?? hmmList[0] ?? data?.hmm
  const perc = data?.percolation
  const td = data?.td
  const conclusion = data?.conclusion
  const meta = data?.model_meta
  const focus: any[] = useMemo(() => {
    if (data?.industry_focus?.length) return data.industry_focus
    return (perc?.industries ?? []).slice(0, 8)
  }, [data, perc])

  const updated = timeText(meta?.updated)
  const hmmState = hmm?.state ?? conclusion?.hmm
  const regime = conclusion?.regime ?? (perc ? (perc.giant_occupied >= perc.threshold ? '扩散' : perc.giant_occupied >= perc.threshold - 0.08 ? '临界' : '分裂') : '')
  const position = conclusion?.position ?? '--'
  const posRange = parsePosition(conclusion?.position)
  const stance = conclusion?.stance ?? '--'
  const stanceColor = stanceTone(conclusion?.stance)

  const tdCounts = td?.counts ?? {}
  const targetPct = Math.round(
    posRange?.mid ??
      (stance === '进攻' ? 70 : stance === '均衡偏多' ? 55 : stance === '均衡偏防守' ? 35 : stance === '防守' ? 10 : 45),
  )

  const stockPlans = useMemo(() => {
    const positions: any[] = summary?.positions ?? []
    if (!positions.length) return []
    const n = Math.max(positions.length, 1)
    const defensive = stance === '防守' || stance === '均衡偏防守'
    return positions.map((p: any) => {
      const price = Number(p.price) || 0
      const weight = (Number(p.weight) || 0) / 100
      const target = Math.min(0.18, targetPct / 100 / n)
      let action = '持有'
      let reason = '仓位与目标匹配，先拿着看'
      if (price <= 0) {
        action = '数据不足'
        reason = '行情源暂时没有这只票的价格，等价格回来再算'
      } else if ((p.float_pct ?? 0) <= -15 && (p.pct ?? 0) < 0) {
        action = '止损'
        reason = '浮亏超过 15% 且当天继续走弱，先控制回撤'
      } else if (weight > 0.22) {
        action = '减仓'
        reason = `单票权重 ${(weight * 100).toFixed(1)}%，超过 22% 的集中度上限`
      } else if (defensive && weight > 0.08) {
        action = '减仓'
        reason = '模型给的是防守结论，先把风险暴露降下来'
      } else if (target - weight > 0.02 && (p.pct ?? 0) > -3 && !defensive) {
        action = '加仓'
        reason = '总仓位离目标还有空间，个股当天没破位'
      }
      const deltaValue = (target - weight) * Math.max(Number(summary?.total) || 1, 1)
      const held = Number(p.qty) || 0
      let shares = price > 0 ? Math.round(Math.abs(deltaValue) / price / 100) * 100 : 0
      if ((action === '减仓' || action === '止损') && held > 0) {
        shares = Math.min(shares, Math.floor(held / 100) * 100)
      }
      if (action === '加仓' && shares === 0) {
        action = '持有'
        reason = '目标仓位折算不到 1 手，先不动'
      }
      if ((action === '减仓' || action === '止损') && shares === 0) {
        if (held > 0) {
          shares = held
        } else if (price * 100 <= Math.max(Number(summary?.total) || 1, 1) * 0.5) {
          shares = 100
        } else {
          action = '持有'
          reason = '一手金额太大，减仓不划算，先不动'
        }
      }
      const signed = action === '减仓' || action === '止损' ? -shares : action === '加仓' ? shares : 0
      return {
        ...p,
        price,
        weightPct: weight * 100,
        targetPct: target * 100,
        action,
        reason,
        shares: signed,
        amount: Math.abs(signed * price),
        buy: `${fmt.price(price * 0.97)}–${fmt.price(price)}`,
        sell: `${fmt.price(price * 1.05)}–${fmt.price(price * 1.08)}`,
        stop: fmt.price(price * 0.92),
      }
    })
  }, [summary, stance, targetPct])

  const planAmount = stockPlans.reduce((s: number, p: any) => s + p.amount, 0)
  const clusterValues = perc?.top_clusters ?? []
  const critList = perc?.critical?.length ? perc.critical : perc?.closest ?? []
  const hasCrit = Boolean(perc?.critical?.length)
  const groupNames = (perc?.industries ?? []).map((x: any) => x.name)
  const broadGroups = ['其他', '沪市主板', '深市主板', '创业板', '科创板', '北交所']
  const degradedGrouping =
    (perc as any)?.grouping === 'market' ||
    (groupNames.length > 0 && groupNames.every((n: string) => !n || broadGroups.includes(n)))

  const tdNow = tdCounts.buy > 0 ? '买' : tdCounts.sell > 0 ? '卖' : '观察'
  const nowLine =
    conclusion || hmm || perc || td
      ? `现在 HMM ${hmmState ?? '--'}、广度 ${regime || '--'}、九转买 ${tdCounts.buy ?? 0} / 卖 ${tdCounts.sell ?? 0}。`
      : '模型还没跑完，下面先显示最近一次结果或计算状态。'
  const actionLine = conclusion
    ? `仓位按 ${position} 执行；${
        regime === '扩散'
          ? '行业优先找超临界方向的龙头和补涨'
          : regime === '临界'
            ? '广度没方向，先减频、等放量确认'
            : '只做最强主线，不追普涨，不打补涨'
      }；九转买点没出现前不抢反弹。`
    : '等模型出结论后再按仓位区间执行。'

  return (
    <div>
      {/* page head */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 18,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 260 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.2 }}>量化模型</div>
          <div className="muted small" style={{ marginTop: 4, maxWidth: 760, lineHeight: 1.75 }}>
            HMM 判断市场处在哪个状态，渗流看上涨有没有连成片，九转看短线动能有没有走完。三个模型各管一段，都不预测点位。
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="mono small" style={{ color: 'var(--text-sub)' }}>
              MODEL v{meta?.registry_version ?? '2.1.0'}
            </div>
            <div className="muted" style={{ fontSize: 10 }}>
              {updated ? `快照 ${updated}` : last ? `刷新 ${last}` : loading ? '计算中…' : '--'}
            </div>
          </div>
          <Button size="small" icon={<ReloadOutlined />} loading={refreshing} onClick={() => load()}>
            刷新
          </Button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '9px 12px',
            marginBottom: 12,
            border: `1px solid ${tint('var(--up)', 35)}`,
            background: tint('var(--up)', 7),
            borderRadius: 7,
            fontSize: 11.5,
            color: 'var(--text-sub)',
          }}
        >
          <span>模型接口这次没返回：{error}。页面保留上一次结果，5 分钟后自动重试。</span>
          <button
            className="btn-ghost"
            style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 5 }}
            onClick={() => load()}
          >
            立即重试
          </button>
        </div>
      ) : null}

      {/* conclusion */}
      {conclusion ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 20,
            flexWrap: 'wrap',
            padding: '16px 18px',
            marginBottom: 14,
            border: `1px solid ${tint(stanceColor, 36)}`,
            background: `linear-gradient(120deg, ${tint(stanceColor, 9)}, transparent 62%)`,
            borderRadius: 10,
          }}
        >
          <div
            style={{
              flex: '0 0 172px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 4,
              paddingRight: 18,
              borderRight: '1px solid var(--border-soft)',
            }}
          >
            <span style={{ fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.14em' }}>模型结论</span>
            <div style={{ fontSize: 24, fontWeight: 750, lineHeight: 1.15, color: stanceColor, whiteSpace: 'nowrap' }}>{conclusion.stance}</div>
            <div className="small muted">
              目标仓位{' '}
              <b className="num" style={{ color: 'var(--text)', fontSize: 13 }}>
                {conclusion.position}
              </b>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
              <span className="chip">HMM {conclusion.hmm}</span>
              <span className="chip">广度 {conclusion.regime}</span>
            </div>
          </div>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 550, lineHeight: 1.75 }}>{conclusion.text}</div>
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {(conclusion.bullets ?? []).map((b: string, i: number) => (
                <div key={i} className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  · {b}
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              flex: '0 0 118px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 6,
              paddingLeft: 18,
              borderLeft: '1px solid var(--border-soft)',
            }}
          >
            <div style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>九转结构</div>
            <div style={{ display: 'flex', gap: 5 }}>
              <span style={chipStyle('var(--up)')}>买 {tdCounts.buy ?? 0}</span>
              <span style={chipStyle('var(--down)')}>卖 {tdCounts.sell ?? 0}</span>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              观察 {tdCounts.watch_buy ?? 0} 个下跌结构、{tdCounts.watch_sell ?? 0} 个上涨结构
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '16px 18px',
            marginBottom: 14,
            border: '1px dashed var(--border)',
            borderRadius: 10,
            color: 'var(--text-dim)',
            fontSize: 12,
            lineHeight: 1.75,
          }}
        >
          {loading && !data
            ? '正在计算结论：HMM 和渗流一起出结果，首次大约半分钟。'
            : error
              ? `结论暂时取不到：${error}`
              : 'HMM 或渗流缺数据，这次不给仓位结论。'}
        </div>
      )}

      {/* HMM */}
      <Card
        title={<SectionTitle title="HMM · 市场状态" desc="3 状态高斯隐马尔可夫 · 5 个核心指数日收益 · 后验概率" />}
        extra={
          hmmList.length ? (
            <span className="muted" style={{ fontSize: 10.5 }}>
              {hmmList.length} 个指数 · 切换有滞后，看概率不看单点
            </span>
          ) : null
        }
      >
        {!hmm ? (
          loading && !data ? (
            <LoadingBody text="正在计算 HMM，首次约需半分钟…" rows={6} />
          ) : (
            <InlineEmpty
              text={
                error
                  ? `HMM 数据暂时取不到：${error}`
                  : '这次没有返回可用的 HMM 状态。可能是指数日线样本不足，等下一次采样。'
              }
            />
          )
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {hmmList.map((h: any) => {
                const active = h.code === hmm.code
                return (
                  <button
                    key={h.code}
                    className="btn-ghost"
                    onClick={() => setSelCode(h.code)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 1,
                      minWidth: 104,
                      padding: '6px 10px',
                      background: active ? tint('var(--accent)', 9) : 'var(--card-2)',
                      borderColor: active ? tint('var(--accent)', 55) : undefined,
                      borderRadius: 6,
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>
                      {h.name} <span className="mono">{h.code}</span>
                    </span>
                    <b style={{ fontSize: 13, color: stateTone(h.state) }}>{h.state}</b>
                    <span className="num" style={{ fontSize: 9.5, color: 'var(--text-sub)' }}>
                      置信 {share(h.confidence)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="muted small" style={{ marginBottom: 10, lineHeight: 1.7 }}>
              {data?.hmm_summary?.text ?? hmm.summary ?? 'HMM 状态汇总暂缺。'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 8 }}>
              <Metric label="当前状态" value={hmm.state ?? '--'} color={stateTone(hmm.state)} sub={`${hmm.name ?? ''} ${hmm.code ?? ''}`} />
              <Metric label="状态置信度" value={share(hmm.confidence)} sub={`熵 ${num(hmm.entropy, 2)}，越低越确定`} />
              <Metric label="已持续" value={`${hmm.regime_age ?? '--'} 天`} sub={`历史平均 ${hmm.expected_days ?? '--'} 天`} />
              <Metric label="预计还能持续" value={`${num(hmm.expected_days, 1)} 天`} sub="按状态转移矩阵估算" title="状态的历史平均持续时间，不是到期时间" />
              <Metric label="明日离开概率" value={share(hmm.flip_risk)} sub="概率越低，状态越稳" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span className="chip" style={{ color: stateTone(hmm.state), borderColor: tint(stateTone(hmm.state), 35) }}>
                {hmm.signal ? '执行提示' : '状态'}
              </span>
              <span className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.7 }}>
                {hmm.signal ?? hmm.summary ?? '暂无执行提示。'}
              </span>
            </div>

            <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
              <div>
                <SubHead title="三状态概率" note="带该状态的历史日均涨跌与年化波动" />
                {(hmm.probabilities ?? []).map((p: any) => {
                  const stat = (hmm.stats ?? []).find((s: any) => s.label === p.label)
                  return (
                    <div key={p.label} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <LegendDot color={stateTone(p.label)} />
                          {p.label}
                        </span>
                        <b className="num" style={{ fontSize: 11.5 }}>
                          {share(p.p)}
                        </b>
                      </div>
                      <div
                        style={{
                          height: 7,
                          marginTop: 4,
                          background: 'var(--card-2)',
                          border: '1px solid var(--border-soft)',
                          overflow: 'hidden',
                        }}
                      >
                        <i
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${Math.max(0.6, (p.p ?? 0) * 100)}%`,
                            background: stateTone(p.label),
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <div className="muted" style={{ fontSize: 10, marginTop: 3 }}>
                        日均 {fmt.pct(p.mean)} · 年化波动{' '}
                        {stat?.annual_vol != null
                          ? `${Number(stat.annual_vol).toFixed(1)}%`
                          : p.vol != null
                            ? `${(Number(p.vol) * Math.sqrt(252)).toFixed(1)}%`
                            : '--'}
                      </div>
                    </div>
                  )
                })}

                <SubHead title="状态统计" note="样本内的日均、波动、胜率与持续时间" />
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(r: any) => r.label}
                  dataSource={hmm.stats ?? []}
                  columns={[
                    {
                      title: '状态',
                      key: 'label',
                      width: 64,
                      render: (_: any, r: any) => (
                        <b style={{ fontSize: 11, color: stateTone(r.label) }}>{r.label}</b>
                      ),
                    },
                    {
                      title: '日均',
                      key: 'mean',
                      align: 'right',
                      render: (_: any, r: any) => <span className={trendClass(r.mean)}>{fmt.pct(r.mean)}</span>,
                    },
                    {
                      title: '年化波动',
                      key: 'annual_vol',
                      align: 'right',
                      render: (_: any, r: any) => `${num(r.annual_vol, 1)}%`,
                    },
                    {
                      title: '夏普',
                      key: 'sharpe',
                      align: 'right',
                      render: (_: any, r: any) => num(r.sharpe, 2),
                    },
                    {
                      title: '胜率',
                      key: 'win_rate',
                      align: 'right',
                      render: (_: any, r: any) => `${num(r.win_rate, 1)}%`,
                    },
                    {
                      title: '持续',
                      key: 'duration',
                      align: 'right',
                      render: (_: any, r: any) => `${num(r.duration, 1)} 天`,
                    },
                  ]}
                  locale={{ emptyText: <span className="muted small">状态统计暂缺</span> }}
                />
              </div>

              <div>
                <SubHead title="60 日状态时间线" note="从左到右，越靠右越近" />
                <div style={{ display: 'flex', gap: 1, height: 16 }}>
                  {(hmm.history ?? []).map((s: number, i: number) => (
                    <i
                      key={i}
                      title={`${(hmm.history?.length ?? 60) - i} 个交易日前：${['弱势', '震荡', '强势'][s] ?? '未知'}`}
                      style={{
                        flex: 1,
                        minWidth: 1,
                        background: stateTone(['弱势', '震荡', '强势'][s]),
                        opacity: 0.86,
                      }}
                    />
                  ))}
                </div>
                <div className="row-between muted" style={{ fontSize: 10, marginTop: 4 }}>
                  <span>{hmm.history?.length ?? 60} 个交易日前</span>
                  <span>今天 · {hmm.state}</span>
                </div>

                <SubHead title="状态转移矩阵" note="行是当前状态，列是明天转向该状态的概率" />
                {(hmm.transition ?? []).length ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-dim)', fontWeight: 500 }}>从 \\ 到</th>
                          {(hmm.transition ?? []).map((r: any) => (
                            <th key={r.from} style={{ padding: '4px 6px', color: stateTone(r.from), fontWeight: 600 }}>
                              {r.from}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(hmm.transition ?? []).map((r: any) => (
                          <tr key={r.from}>
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '5px 6px',
                                color: stateTone(r.from),
                                fontWeight: 600,
                                borderTop: '1px solid var(--border-soft)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {r.from}
                            </th>
                            {(r.to ?? []).map((v: number, j: number) => (
                              <td
                                key={j}
                                className="num"
                                style={{
                                  padding: '5px 6px',
                                  textAlign: 'center',
                                  borderTop: '1px solid var(--border-soft)',
                                  background: tint('var(--accent)', Math.round((v ?? 0) * 18)),
                                }}
                              >
                                {share(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="muted" style={{ fontSize: 10, marginTop: 5, lineHeight: 1.6 }}>
                      明日概率：
                      {(hmm.next ?? [])
                        .slice()
                        .sort((a: any, b: any) => (b.p ?? 0) - (a.p ?? 0))
                        .map((x: any) => `${x.label} ${share(x.p)}`)
                        .join(' · ')}
                    </div>
                  </div>
                ) : (
                  <InlineEmpty text="转移矩阵暂缺，等下一次计算。" />
                )}

                <div className="model-fit" style={{ marginTop: 10 }}>
                  <span>
                    对数似然 <b>{num(hmm.loglik, 1)}</b>
                  </span>
                  <span>
                    AIC <b>{num(hmm.aic, 1)}</b>
                  </span>
                  <span>
                    BIC <b>{num(hmm.bic, 1)}</b>
                  </span>
                  <span>
                    迭代 <b>{hmm.iterations ?? '--'}</b>
                  </span>
                  <span>
                    <b style={{ color: hmm.converged ? 'var(--down)' : 'var(--up)' }}>{hmm.converged ? '已收敛' : '未收敛'}</b>
                  </span>
                </div>
              </div>
            </div>

            {(hmm.interpretation ?? []).length ? (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--border-soft)',
                  background: 'var(--card-2)',
                  borderRadius: 7,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 2 }}>怎么读这一屏</div>
                {(hmm.interpretation ?? []).map((line: string, i: number) => (
                  <div key={i} className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.75 }}>
                    · {line}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </Card>

      {/* percolation */}
      <div style={{ marginTop: 14 }}>
        <Card
          title={<SectionTitle title="渗流模型 · 上涨广度" desc="全市场格点 · 4 邻接最大连通簇 · 临界值 59.27%" />}
          extra={
            <span className="muted" style={{ fontSize: 10.5 }}>
              {perc ? perc.status : loading ? '计算中' : '暂不可用'}
            </span>
          }
        >
          {!perc ? (
            loading && !data ? (
              <LoadingBody text="正在扫描全市场上涨家数与连通簇…" rows={6} />
            ) : (
              <InlineEmpty
                text={
                  error
                    ? `渗流数据暂时取不到：${error}`
                    : '全市场有效样本不足 100 只，这次没有算渗流。HMM 和九转不受影响。'
                }
              />
            )
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8 }}>
                <Metric label="当前结构" value={perc.status} color={percTone(perc.status)} sub={`置信度 ${share(perc.confidence)}`} />
                <Metric
                  label="最大簇 / 上涨"
                  value={share(perc.giant_occupied)}
                  sub={`最大簇 ${perc.largest ?? '--'} 只，共 ${perc.clusters ?? '--'} 个簇`}
                />
                <Metric label="上涨占比" value={share(perc.ratio)} sub={`${perc.up ?? '--'} / ${perc.total ?? '--'} 只`} />
                <Metric label="临界阈值" value={share(perc.threshold)} sub="二维方格点渗流临界值" />
                <Metric label="Susceptibility" value={num(perc.susceptibility, 2)} sub="越大说明越接近临界" />
                <Metric label="Spanning" value={perc.spanning ? '是' : '否'} color={perc.spanning ? 'var(--up)' : 'var(--text)'} sub="最大簇是否贯穿整张格点" />
                <Metric
                  label="p 值"
                  value={num(perc.p_value, 2)}
                  sub={`随机基线 ${share(perc.random_baseline)}`}
                  title="随机重排后最大簇不低于实际的占比，越小说明真实结构越强"
                />
                <Metric label="距离阈值" value={`${(Number(perc.distance ?? 0) * 100).toFixed(1)} pct`} sub={Number(perc.distance) >= 0 ? '已超过临界' : '还差一点到临界'} />
              </div>

              <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
                <div>
                  <SubHead title="50 × 50 格点" note="稳定哈希排序，不按行业相邻" />
                  <PercGrid cells={perc.grid?.cells ?? []} cols={perc.grid?.cols ?? 50} rows={perc.grid?.rows ?? 50} />
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 10, color: 'var(--text-dim)' }}>
                    <span>
                      <LegendDot color="var(--accent)" />
                      最大连通簇
                    </span>
                    <span>
                      <LegendDot color={tint('var(--up)', 40)} />
                      上涨但没连上
                    </span>
                    <span>
                      <LegendDot color="var(--card-2)" />
                      下跌或平盘
                    </span>
                  </div>
                </div>
                <div>
                  <SubHead title="Top 连通簇大小" note={`前 ${Math.min(clusterValues.length, 8)} 个簇`} />
                  {clusterValues.length ? <ClusterBars values={clusterValues.slice(0, 8)} /> : <InlineEmpty text="没有连通簇数据。" />}

                  <SubHead title="这条结论怎么来的" />
                  <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.85 }}>
                    {perc.note ?? '渗流模型没有返回说明。'}
                  </div>
                  <div className="muted" style={{ fontSize: 10, marginTop: 6, lineHeight: 1.7 }}>
                    随机重排基线 {share(perc.robustness?.mean)}（{share(perc.robustness?.min)}–{share(perc.robustness?.max)}）；
                    p 值越小，说明真实排列比随机更容易连成片。
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <SubHead
                  title={hasCrit ? `行业临界 · ${critList.length} 个` : `行业临界 · 没有正式临界，以下是最接近的 ${critList.length} 个`}
                  note={degradedGrouping ? '本次行情源缺行业字段，按市场分组，临界值只作相对比较' : '按行业分组后的上涨占比与最大簇'}
                />
                {critList.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                    {critList.slice(0, 8).map((x: any) => (
                      <div
                        key={`${x.name}-${x.critical ? 'c' : 'n'}`}
                        style={{
                          padding: '8px 10px',
                          borderLeft: `2px solid ${x.critical ? 'var(--accent)' : 'var(--border)'}`,
                          background: x.critical ? tint('var(--accent)', 6) : 'var(--card-2)',
                          borderRadius: '0 6px 6px 0',
                        }}
                      >
                        <div className="row-between" style={{ gap: 8 }}>
                          <b className="small">{x.name}</b>
                          <span className="chip" style={{ color: percTone(x.status), borderColor: tint(percTone(x.status), 30) }}>
                            {x.status}
                          </span>
                        </div>
                        <div className="muted small" style={{ marginTop: 3 }}>
                          上涨 {share(x.ratio)} · 最大簇 {share(x.giant_occupied)} · 离阈值{' '}
                          <span style={{ color: 'var(--text-sub)' }}>{(Number(x.distance ?? 0) * 100).toFixed(1)} pct</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                          <span className="muted" style={{ fontSize: 9.5 }}>
                            关键标的
                          </span>
                          {(x.leaders ?? []).slice(0, 3).map((s: any) =>
                            s.code ? (
                              <button
                                key={s.code}
                                className="btn-ghost"
                                onClick={() => nav(`/stock/${s.code}`)}
                                style={{
                                  background: 'var(--card)',
                                  borderRadius: 4,
                                  padding: '1px 6px',
                                  fontSize: 10,
                                  lineHeight: 1.5,
                                }}
                                title={`${s.name} ${fmt.pct(s.pct)}`}
                              >
                                {s.name} <span className={trendClass(s.pct)}>{fmt.pct(s.pct)}</span>
                              </button>
                            ) : null,
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <InlineEmpty text="这次没有行业数据，等行情源恢复行业字段后再看临界行业。" />
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* TD */}
      <div style={{ marginTop: 14 }}>
        <Card
          title={<SectionTitle title="九转模型 · TD Sequential" desc="9 根建仓结构 + 13 根倒计时 · 量的是动能，不是点位" />}
          extra={
            td ? (
              <span className="muted" style={{ fontSize: 10.5 }}>
                买 {tdCounts.buy ?? 0} · 卖 {tdCounts.sell ?? 0} · 观察 {tdCounts.watch_buy ?? 0}/{tdCounts.watch_sell ?? 0}
              </span>
            ) : (
              <span className="muted" style={{ fontSize: 10.5 }}>
                等待数据
              </span>
            )
          }
        >
          {!td ? (
            loading && !data ? (
              <LoadingBody text="正在计算指数、持仓和行业龙头的九转结构…" rows={6} />
            ) : (
              <InlineEmpty
                text={error ? `九转数据暂时取不到：${error}` : '这次没有返回九转结构，等下一次计算。'}
              />
            )
          ) : (
            <>
              <div
                style={{
                  padding: '9px 12px',
                  borderLeft: `2px solid ${tdNow === '买' ? 'var(--up)' : tdNow === '卖' ? 'var(--down)' : 'var(--border)'}`,
                  background: 'var(--card-2)',
                  borderRadius: '0 6px 6px 0',
                  fontSize: 11.5,
                  lineHeight: 1.75,
                  color: 'var(--text-sub)',
                }}
              >
                {td.text ?? '九转没有给出汇总说明。'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 8, marginTop: 10 }}>
                <Metric label="买入结构完成" value={`${tdCounts.buy ?? 0} 个`} color="var(--up)" sub="下跌 9 转，卖压衰竭" />
                <Metric label="卖出结构完成" value={`${tdCounts.sell ?? 0} 个`} color="var(--down)" sub="上涨 9 转，动能透支" />
                <Metric label="下跌结构途中" value={`${tdCounts.watch_buy ?? 0} 个`} sub="观察买点，不提前接" />
                <Metric label="上涨结构途中" value={`${tdCounts.watch_sell ?? 0} 个`} sub="观察卖点，别追价" />
              </div>

              <div style={{ marginTop: 14 }}>
                <SubHead title="指数九转" note="看大盘节奏，指数不给买卖指令，所以不设跳转" />
                <TdTable
                  rows={td.indices ?? []}
                  mode="index"
                  nav={nav}
                  emptyText="指数九转还没算出来，等日线数据回来。"
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <SubHead title="持仓九转" note={summary?.positions?.length ? '点一行进个股，用九转配合均线决定加减' : '还没有持仓，记一笔买入后会出现在这里'} />
                <TdTable
                  rows={td.portfolio ?? []}
                  mode="portfolio"
                  nav={nav}
                  emptyText={portError ? `持仓九转取不到：${portError}` : '当前没有持仓，持仓九转是空的。'}
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <SubHead
                  title="临界行业龙头九转"
                  note={
                    perc?.critical?.length
                      ? `来自 ${Math.min(perc.critical.length, 6)} 个临界行业的前两只龙头`
                      : '没有正式临界行业时，用离阈值最近的行业龙头顶替'
                  }
                />
                <TdTable
                  rows={td.leaders ?? []}
                  mode="leader"
                  nav={nav}
                  emptyText="临界行业龙头数据不足，等下一次渗流分组。"
                />
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 7,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 650, marginBottom: 2 }}>怎么用九转</div>
                <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>
                  · 9 转是衰竭提示，不是反转信号。下跌 9 转完成后常见横盘或反弹，但不代表马上大涨；上涨 9 转也一样，先当风险提示。
                </div>
                <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>
                  · 要和均线、量能一起看。站上 MA20、成交额放大时，买入结构才值得试仓；均线之下的买 9 转只放观察池。
                </div>
                <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>
                  · 倒计时 13 比 9 更严格：出现频率低，信号更强，但同样要等放量或收复短期均线确认，不看到确认不动手。
                </div>
                <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>
                  · 指数九转用来看整体节奏，个股九转用来找具体买卖点。两者方向一致时再动手，胜率比单看一个高。
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* industry focus */}
      <div style={{ marginTop: 14 }}>
        <Card
          title={<SectionTitle title="行业关注重点" desc={degradedGrouping ? '行情源缺行业字段，本次按板块分组 · 点龙头进个股' : '渗流分组里广度靠前的行业 · 点龙头进个股'} />}
          extra={<span className="muted" style={{ fontSize: 10.5 }}>{focus.length ? `${focus.length} 个分组` : '暂无'}</span>}
        >
          {!data ? (
            loading ? (
              <LoadingBody text="正在汇总行业广度、资金和龙头…" rows={4} />
            ) : (
              <InlineEmpty text={error ? `行业关注取不到：${error}` : '这次没有行业关注数据。'} />
            )
          ) : focus.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
              {focus.map((x: any) => {
                const tone = percTone(x.status)
                const leaders = (x.leaders ?? []).filter((s: any) => s.code).slice(0, 3)
                const fallbackFocus = `${x.status ?? '--'}；上涨占比 ${share(x.ratio)}，最大簇 ${share(x.giant_occupied)}。`
                return (
                  <div
                    key={x.name}
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--border-soft)',
                      borderTop: `2px solid ${tone}`,
                      background: 'var(--card-2)',
                      borderRadius: 7,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                    }}
                  >
                    <div className="row-between" style={{ gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{x.name}</b>
                      <span className="chip" style={{ color: tone, borderColor: tint(tone, 30) }}>
                        {x.status ?? '--'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }} className="small">
                      <span className="muted">
                        上涨占比 <b className="num" style={{ color: 'var(--text)' }}>{share(x.ratio)}</b>
                      </span>
                      <span className="muted">
                        最大簇 <b className="num" style={{ color: 'var(--text)' }}>{share(x.giant_occupied)}</b>
                      </span>
                      <span className="muted">
                        资金{' '}
                        <b className={`num ${trendClass(x.flow)}`} style={{ color: x.flow == null ? 'var(--text-dim)' : undefined }}>
                          {x.flow == null ? '--' : fmt.big(x.flow)}
                        </b>
                      </span>
                      <span className="muted">
                        当日 <b className={`num ${trendClass(x.pct)}`}>{fmt.pct(x.pct)}</b>
                      </span>
                    </div>
                    <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.75 }}>
                      {x.focus || fallbackFocus}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className="muted" style={{ fontSize: 9.5 }}>
                        盯龙头
                      </span>
                      {leaders.length ? (
                        leaders.map((s: any) => (
                          <button
                            key={s.code}
                            className="btn-ghost"
                            onClick={() => nav(`/stock/${s.code}`)}
                            style={{
                              background: 'var(--card)',
                              borderRadius: 4,
                              padding: '1px 6px',
                              fontSize: 10,
                              lineHeight: 1.5,
                            }}
                          >
                            {s.name} <span className={trendClass(s.pct)}>{fmt.pct(s.pct)}</span>
                          </button>
                        ))
                      ) : (
                        <span className="muted" style={{ fontSize: 10 }}>
                          {(x.watch ?? []).join('、') || '暂无龙头'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <InlineEmpty text="这次渗流分组没有给出行业关注项，可能是行情源没返回行业字段。等下一次采样。" />
          )}
        </Card>
      </div>

      {/* stock plans */}
      <div style={{ marginTop: 14 }}>
        <Card
          title={<SectionTitle title="个股仓位建议" desc={`按结论目标仓位 ${position} 折算 · 单票上限 15% · 股数按 100 股取整`} />}
          extra={<span className="muted" style={{ fontSize: 10.5 }}>当前总仓位 {num(summary?.position_pct, 1)}%</span>}
        >
          {portLoading ? (
            <LoadingBody text="正在读取持仓与目标仓位…" rows={4} />
          ) : portError ? (
            <InlineEmpty text={`持仓数据暂时取不到：${portError}。仓位建议等接口恢复后再看。`} />
          ) : !summary?.positions?.length ? (
            <InlineEmpty text="账户里还没有持仓。先记一笔买入，这里会按模型目标仓位给出加减仓建议。" />
          ) : (
            <>
              <div className="grid-3" style={{ marginBottom: 10 }}>
                <Metric label="当前总仓位" value={`${num(summary.position_pct, 1)}%`} sub={`总资产 ${fmt.big(summary.total)}`} />
                <Metric label="模型目标仓位" value={position} sub={`折算中值 ${targetPct}%`} color={stanceColor} />
                <Metric
                  label="可用现金"
                  value={`${num(summary.cash_pct, 1)}%`}
                  sub={`约 ${fmt.big(summary.cash)}`}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '0 20px' }}>
                {stockPlans.map((p: any) => (
                  <div key={p.code} className="stock-plan">
                    <div className="row-between">
                      <span>
                        <b>{p.name}</b> <span className="muted mono small">{p.code}</span>
                      </span>
                      <span>
                        <b style={{ color: p.action === '加仓' ? 'var(--up)' : p.action === '减仓' || p.action === '止损' ? 'var(--down)' : 'var(--text)' }}>
                          {p.action}
                        </b>{' '}
                        {['加仓', '减仓', '止损'].includes(p.action) && p.shares !== 0 ? (
                          <b className="mono">
                            {p.shares > 0 ? '+' : ''}
                            {p.shares} 股
                          </b>
                        ) : null}
                      </span>
                    </div>
                    <div className="row-between small" style={{ marginTop: 3, flexWrap: 'wrap', gap: '2px 10px' }}>
                      <span className="muted">
                        现价 {fmt.price(p.price)} · 权重 {p.weightPct.toFixed(1)}% · 目标 {p.targetPct.toFixed(1)}% · 浮动{' '}
                        <span className={trendClass(p.float_pct)}>{fmt.pct(p.float_pct)}</span>
                      </span>
                    </div>
                    <div className="row-between small" style={{ marginTop: 2, flexWrap: 'wrap', gap: '2px 10px' }}>
                      <span className="muted">
                        买入 {p.buy} · 卖出 {p.sell} · 止损 {p.stop}
                      </span>
                    </div>
                    <div className="small" style={{ marginTop: 2, color: 'var(--text-sub)' }}>
                      {p.reason}
                    </div>
                  </div>
                ))}
              </div>
              <div className="muted small" style={{ marginTop: 8, lineHeight: 1.7 }}>
                加仓、减仓金额合计约 ¥{fmt.money(planAmount)}。执行前核对现金、涨跌停和 T+1 限制。
              </div>
            </>
          )}
        </Card>
      </div>

      {/* strategy map */}
      <div style={{ marginTop: 14 }}>
        <Card title="策略映射 · HMM × 渗流 × 九转" desc="三个模型各管一段：先定仓位，再选行业，最后找买卖点">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--accent)', borderBottom: '1px solid var(--border-soft)', paddingBottom: 4 }}>
                HMM · 定总仓位
              </div>
              {[
                { key: '强势', text: '趋势延续，仓位往上限靠，持有的龙头别轻易下车。' },
                { key: '震荡', text: '区间对待，下沿低吸、上沿兑现，减少追涨杀跌。' },
                { key: '弱势', text: '先降仓，等弱势概率回落再加，不抢反弹。' },
              ].map((row) => (
                <div
                  key={row.key}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 5,
                    background: hmmState === row.key ? tint(stateTone(row.key), 9) : 'transparent',
                    borderLeft: `2px solid ${hmmState === row.key ? stateTone(row.key) : 'transparent'}`,
                    fontSize: 10.5,
                    lineHeight: 1.7,
                    color: 'var(--text-sub)',
                  }}
                >
                  <b style={{ color: stateTone(row.key), marginRight: 4 }}>{row.key}</b>{' '}
                  {row.text}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--accent)', borderBottom: '1px solid var(--border-soft)', paddingBottom: 4 }}>
                渗流 · 定选行业
              </div>
              {[
                { key: '扩散', text: '上涨连成片，超临界行业的龙头和补涨都能做。' },
                { key: '临界', text: '方向没定，等一根放量阳线或阴线确认，不押单边。' },
                { key: '分裂', text: '上涨是散的，只做最强 1–2 条主线，不摊大饼。' },
              ].map((row) => (
                <div
                  key={row.key}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 5,
                    background: regime === row.key ? tint(regimeTone(row.key), 9) : 'transparent',
                    borderLeft: `2px solid ${regime === row.key ? regimeTone(row.key) : 'transparent'}`,
                    fontSize: 10.5,
                    lineHeight: 1.7,
                    color: 'var(--text-sub)',
                  }}
                >
                  <b style={{ color: regimeTone(row.key), marginRight: 4 }}>{row.key}</b>{' '}
                  {row.text}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--accent)', borderBottom: '1px solid var(--border-soft)', paddingBottom: 4 }}>
                九转 · 定买卖点
              </div>
              {[
                { key: '买', label: '买入', text: '9/9 出现后，等一根放量阳线或收复 5 日线再分批试仓。' },
                { key: '卖', label: '卖出', text: '9/9 出现后，若跌破 5 日线或放量长上影，先减一半。' },
                { key: '观察', label: '倒计时', text: '13 更严格，出现时信号更强，也要等量能确认。' },
              ].map((row) => (
                <div
                  key={row.key}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 5,
                    background: tdNow === row.key ? tint(row.key === '买' ? 'var(--up)' : row.key === '卖' ? 'var(--down)' : 'var(--amber)', 9) : 'transparent',
                    borderLeft: `2px solid ${tdNow === row.key ? (row.key === '买' ? 'var(--up)' : row.key === '卖' ? 'var(--down)' : 'var(--amber)') : 'transparent'}`,
                    fontSize: 10.5,
                    lineHeight: 1.7,
                    color: 'var(--text-sub)',
                  }}
                >
                  <b
                    style={{
                      color: row.key === '买' ? 'var(--up)' : row.key === '卖' ? 'var(--down)' : 'var(--amber)',
                      marginRight: 4,
                    }}
                  >
                    {row.label}
                  </b>{' '}
                  {row.text}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              border: '1px solid var(--border-soft)',
              background: 'var(--card-2)',
              borderRadius: 7,
              display: 'grid',
              gap: 4,
            }}
          >
            <div className="small" style={{ lineHeight: 1.75 }}>
              <b>{nowLine}</b>
            </div>
            <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.75 }}>
              {actionLine}
            </div>
          </div>
        </Card>
      </div>

      {/* boundary */}
      <div style={{ marginTop: 14 }}>
        <Card title="模型边界" desc="什么时候能用，什么时候别信">
          <div className="small" style={{ display: 'grid', gap: 7, color: 'var(--text-sub)', lineHeight: 1.85 }}>
            <p style={{ margin: 0 }}>
              <b style={{ color: 'var(--text)' }}>HMM 会慢半拍。</b>
              状态是对已走出来的日线做的平滑，拐头时通常晚几天确认；它说的是概率，不是明天的涨跌。
            </p>
            <p style={{ margin: 0 }}>
              <b style={{ color: 'var(--text)' }}>渗流依赖样本和排序。</b>
              全市场有效样本不足 100 只时不计算；行业分组后每只股票太少，临界值只适合横向比较，不适合直接当买卖线。
            </p>
            <p style={{ margin: 0 }}>
              <b style={{ color: 'var(--text)' }}>九转是计数，不是预测。</b>
              9 转只说明这一段动能走到了末端，后面的方向还要看均线、量能和行业环境；指数九转和个股九转不会同步。
            </p>
            <p style={{ margin: 0 }}>
              <b style={{ color: 'var(--text)' }}>三个模型会一起失效。</b>
              政策、流动性和突发消息面前，历史统计没有优势。仓位纪律优先于模型：先定能亏多少，再决定买多少。
            </p>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-soft)', fontSize: 9.5, color: 'var(--text-dim)' }}>
            <span>HMM v{meta?.models?.hmm?.version ?? '2.0.0'} · 3 状态 / 420 日</span>
            <span>渗流 v{meta?.models?.percolation?.version ?? '2.0.0'} · 4 邻接 / 阈值 0.5927</span>
            <span>九转 v{meta?.models?.td?.version ?? '1.0.0'} · 9 / 13</span>
            <span>后端每 10 分钟缓存一次，页面显示最近一次快照</span>
          </div>
        </Card>
      </div>

      {!data && !loading ? (
        <div style={{ marginTop: 14 }}>
          <EmptyState text="模型接口没有返回数据。检查网络后再刷新，别用旧结论下单。" icon="◌" />
        </div>
      ) : null}
    </div>
  )
}
