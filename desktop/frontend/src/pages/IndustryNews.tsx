import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Spin, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Card, EmptyState } from '../components/ui'
import { api } from '../api'
import { fmt, trendClass } from '../utils'

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`

const num = (v?: number | null, digits = 2) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '--' : Number(v).toFixed(digits)

function biasTone(bias?: string) {
  if (bias === '偏多') return 'var(--up)'
  if (bias === '偏空') return 'var(--down)'
  return 'var(--text-sub)'
}

function timeNow() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function BiasTag({ x }: { x: any }) {
  const tone = biasTone(x?.bias)
  return (
    <Tag
      style={{
        marginInlineEnd: 0,
        color: tone,
        background: tint(tone, 8),
        borderColor: tint(tone, 34),
        fontWeight: 600,
        fontSize: 10.5,
        lineHeight: '17px',
        padding: '0 7px',
      }}
    >
      {x?.bias ?? '中性'} · {x?.score ?? '--'} 分
    </Tag>
  )
}

function KV({ k, v, cls }: { k: ReactNode; v: ReactNode; cls?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 6,
        padding: '3px 0',
        borderBottom: '1px dashed var(--border-soft)',
        fontSize: 10.5,
        minWidth: 0,
      }}
    >
      <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{k}</span>
      <b className={cls} style={{ fontWeight: 500, textAlign: 'right', minWidth: 0 }}>
        {v}
      </b>
    </div>
  )
}

function PeriodCells({ x }: { x: any }) {
  const items = [
    { label: '1 日', value: x.pct1 },
    { label: '5 日', value: x.pct5 },
    { label: '20 日', value: x.pct20 },
    { label: '60 日', value: x.pct60 },
    { label: '120 日', value: x.pct120 },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4, marginTop: 10 }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            padding: '5px 2px',
            textAlign: 'center',
            background: 'var(--card-2)',
            border: '1px solid var(--border-soft)',
            borderRadius: 5,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{it.label}</div>
          <div className={`num ${trendClass(it.value)}`} style={{ fontSize: 10.5, fontWeight: 600, marginTop: 1 }}>
            {fmt.pct(it.value)}
          </div>
        </div>
      ))}
    </div>
  )
}

function IndexCard({ x }: { x: any }) {
  const maLine = (ma?: number) => {
    if (!ma || !x.price) return '--'
    const diff = (x.price / ma - 1) * 100
    return (
      <span style={{ display: 'inline-flex', gap: 5, alignItems: 'baseline' }}>
        <span className="num">{fmt.price(ma)}</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {x.price >= ma ? '上方' : '下方'} {Math.abs(diff).toFixed(1)}%
        </span>
      </span>
    )
  }
  const rsiOk = x.rsi !== null && x.rsi !== undefined && Number.isFinite(Number(x.rsi))
  const rsiNote = !rsiOk ? '' : Number(x.rsi) >= 70 ? '超买' : Number(x.rsi) <= 30 ? '超卖' : '中性'
  const macdTone = (x.macd_hist ?? 0) >= 0 ? 'up' : 'down'

  return (
    <Card
      title={
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13 }}>{x.name}</b>
          <span className="muted mono" style={{ fontSize: 9.5, fontWeight: 400 }}>
            {x.code}
          </span>
          {x.style ? <span className="chip">{x.style}</span> : null}
        </span>
      }
      extra={<BiasTag x={x} />}
      style={{ height: '100%' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <b className="num" style={{ fontSize: 23, lineHeight: 1.1 }}>
            {fmt.price(x.price)}
          </b>
          <b className={`num ${trendClass(x.pct)}`} style={{ fontSize: 13 }}>
            {fmt.pct(x.pct)}
          </b>
        </div>
        <span className="chip">{x.trend ?? '--'}</span>
      </div>

      <PeriodCells x={x} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 12px', marginTop: 8 }}>
        <KV k="MA20" v={maLine(x.ma20)} />
        <KV k="MA60" v={maLine(x.ma60)} />
        <KV k="MA120" v={maLine(x.ma120)} />
        <KV
          k="RSI14"
          v={
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
              <span className="num">{num(x.rsi, 1)}</span>
              {rsiNote ? <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{rsiNote}</span> : null}
            </span>
          }
        />
        <KV k="MACD 柱" v={<span className={`num ${trendClass(x.macd_hist)}`}>{fmt.signed(x.macd_hist)}</span>} />
        <KV
          k="20 日波动"
          v={<span className="num">{x.vol20 === null || x.vol20 === undefined ? '--' : `${num(x.vol20, 2)}%`}</span>}
        />
        <KV k="支撑" v={<span className="num">{fmt.price(x.support)}</span>} />
        <KV k="压力" v={<span className="num">{fmt.price(x.resistance)}</span>} />
        <KV k="52 周高" v={<span className="num up">{fmt.price(x.high52)}</span>} />
        <KV k="52 周低" v={<span className="num down">{fmt.price(x.low52)}</span>} />
      </div>

      {x.desc ? (
        <div style={{ fontSize: 10.5, color: 'var(--text-sub)', lineHeight: 1.7, marginTop: 9 }}>
          {x.desc}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 8,
          padding: '8px 10px',
          borderLeft: `2px solid ${biasTone(x.bias)}`,
          background: tint(biasTone(x.bias), 6),
          borderRadius: '0 6px 6px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.65 }}>{x.conclusion ?? '暂无结论'}</div>
        {x.note ? (
          <div style={{ fontSize: 9.5, color: 'var(--text-dim)', lineHeight: 1.65 }}>
            注意：{x.note}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function Placeholder({ rows = 5 }: { rows?: number }) {
  const widths = [88, 72, 84, 60, 76]
  return (
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
  )
}

function CardSkeleton() {
  return (
    <div className="card card-pad">
      <div className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Spin size="small" />
        <span>指数卡片加载中…</span>
      </div>
      <Placeholder rows={6} />
    </div>
  )
}

export default function IndustryNews() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState('')
  const [showOverseas, setShowOverseas] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setRefreshing(true)
    try {
      const d = await api.get<any[]>('/api/market/index-analysis')
      setRows(Array.isArray(d) ? d : [])
      setError('')
      setLast(timeNow())
    } catch (e: any) {
      setError(e?.message ?? '指数分析接口请求失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), 3 * 60_000)
    return () => clearInterval(timer)
  }, [load])

  const { aRows, overseas, summary } = useMemo(() => {
    const a = rows.filter((x) => x?.region === 'A股')
    const o = rows.filter((x) => x?.region !== 'A股')
    const bull = a.filter((x) => x.bias === '偏多').length
    const bear = a.filter((x) => x.bias === '偏空').length
    const neutral = Math.max(a.length - bull - bear, 0)
    const avg = a.length ? a.reduce((s, x) => s + (Number(x.score) || 0), 0) / a.length : 0
    const above20 = a.filter((x) => x.price && x.ma20 && x.price >= x.ma20).length
    const strong = a.filter((x) => x.trend === '多头').length

    let advice = 'A 股宽基数据还没回来，先看下面的单指数卡片。'
    if (a.length) {
      if (bull >= 7) {
        advice = '多数宽基转多，仓位可以往上放一档，回撤用 MA20 当线。'
      } else if (bear >= 7) {
        advice = '多数宽基偏空，先控制仓位，等指数重新站上 MA20 再谈进攻。'
      } else if (bull > bear) {
        advice = '偏多的宽基略多，但还没形成一致，挑强的做，弱的不补。'
      } else if (bear > bull) {
        advice = '偏空的宽基更多，分化行情里优先防守，别在弱势指数上摊成本。'
      } else {
        advice = '多空数量接近，方向没定，保持中性仓位，等站上或跌破 MA20 再说。'
      }
      advice += ` 平均评分 ${avg.toFixed(0)}，${above20}/${a.length} 个在 MA20 上方，${strong} 个多头排列。`
    }
    return { aRows: a, overseas: o, summary: { bull, bear, neutral, avg, above20, advice } }
  }, [rows])

  const avgTone = summary.avg >= 55 ? 'var(--up)' : summary.avg <= 45 ? 'var(--down)' : 'var(--amber)'
  const usUp = overseas.filter((x) => (x.pct ?? 0) > 0).length
  const usDown = overseas.filter((x) => (x.pct ?? 0) < 0).length

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
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.2 }}>指数分析</div>
          <div className="muted small" style={{ marginTop: 4, lineHeight: 1.75 }}>
            A 股宽基加海外指数，均线、强弱、位置都摊在一张卡片里。先看趋势，再看评分，最后看离支撑和压力多远。
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span className="muted mono" style={{ fontSize: 10 }}>
            {last ? `刷新 ${last}` : loading ? '加载中…' : '--'}
          </span>
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
          <span>指数接口这次没返回：{error}。页面保留上一次结果，3 分钟后自动重试。</span>
          <button className="btn-ghost" style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 5 }} onClick={() => load()}>
            立即重试
          </button>
        </div>
      ) : null}

      {/* summary */}
      {loading && !rows.length ? (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Spin size="small" />
            <span>正在读取 A 股宽基数据…</span>
          </div>
          <Placeholder rows={3} />
        </div>
      ) : rows.length ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 20,
            flexWrap: 'wrap',
            padding: '15px 18px',
            marginBottom: 14,
            border: `1px solid ${tint(avgTone, 34)}`,
            background: `linear-gradient(120deg, ${tint(avgTone, 8)}, transparent 62%)`,
            borderRadius: 10,
          }}
        >
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.14em' }}>A 股宽基 · 综合结论</div>
            <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.7, marginTop: 5 }}>{summary.advice}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span className="chip" style={{ color: 'var(--up)', borderColor: tint('var(--up)', 32) }}>
                偏多 {summary.bull}
              </span>
              <span className="chip" style={{ color: 'var(--text-sub)' }}>
                中性 {summary.neutral}
              </span>
              <span className="chip" style={{ color: 'var(--down)', borderColor: tint('var(--down)', 32) }}>
                偏空 {summary.bear}
              </span>
              <span className="muted" style={{ fontSize: 10.5 }}>
                共 {aRows.length} 个 A 股宽基 · {summary.above20} 个在 MA20 上方
              </span>
            </div>
          </div>
          <div
            style={{
              flex: '0 0 250px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 26,
              paddingLeft: 20,
              borderLeft: '1px solid var(--border-soft)',
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>平均评分</div>
              <div className="num" style={{ fontSize: 36, fontWeight: 750, lineHeight: 1.1, color: avgTone }}>
                {summary.avg.toFixed(0)}
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>/100</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>偏多 / 偏空</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 650, lineHeight: 1.35, marginTop: 4 }}>
                <span className="up">{summary.bull}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 4px' }}>/</span>
                <span className="down">{summary.bear}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* A shares */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="section-title" style={{ margin: 0 }}>
          A 股宽基
        </span>
        <span className="muted" style={{ fontSize: 10.5 }}>
          {aRows.length
            ? `${aRows.length} 个指数 · 结论在每张卡片底部`
            : loading
              ? '加载中…'
              : error
                ? 'A 股指数未加载'
                : '这次没有返回 A 股指数'}
        </span>
      </div>

      {loading && !rows.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : aRows.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
          {aRows.map((x) => (
            <IndexCard key={x.code} x={x} />
          ))}
        </div>
      ) : rows.length ? (
        <div
          style={{
            padding: '18px 16px',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            color: 'var(--text-dim)',
            fontSize: 12,
            lineHeight: 1.8,
          }}
        >
          A 股指数这次没有返回，可能只有海外行情可用。下面海外分区的数据照常显示。
        </div>
      ) : (
        <EmptyState text="指数分析接口没有数据。检查后端是否在跑，再点右上角刷新。" icon="◌" />
      )}

      {/* how to read */}
      <div style={{ marginTop: 14 }}>
        <Card title="怎么读这张表" desc="一张卡片就是一个指数的体检表">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px 18px' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 650, marginBottom: 3 }}>先看趋势</div>
              <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>
                现价在 MA20/60/120 上方或下方，决定短中期方向。三条均线从上到下依次排开（价格 &gt; MA20 &gt; MA60 &gt; MA120）算多头，反过来算空头。
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 650, marginBottom: 3 }}>再看强弱</div>
              <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>
                评分 0–100，60 以上偏多、40 以下偏空。RSI 高于 70 是短线过热，低于 30 是超卖；MACD 柱翻红或翻绿，用来看动能在不在。
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 650, marginBottom: 3 }}>位置和空间</div>
              <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>
                支撑和压力取自近 20 日高低点，52 周高低点看大级别空间。离压力近、离支撑远，追高的性价比就低。
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 650, marginBottom: 3 }}>波动和操作</div>
              <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>
                20 日波动是日收益的标准差，越高越要小仓位。海外指数只看隔夜情绪，不直接决定 A 股仓位。结论是收盘复盘，不是买卖指令。
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* overseas */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="section-title" style={{ margin: 0 }}>
              海外指数
            </span>
            <span className="chip" style={{ color: 'var(--cyan)', borderColor: tint('var(--cyan)', 32) }}>
              隔夜参考
            </span>
            <span className="muted" style={{ fontSize: 10.5 }}>
              {overseas.length ? `${overseas.length} 个 · 涨 ${usUp} / 跌 ${usDown}` : loading ? '加载中…' : '暂无数据'}
            </span>
          </div>
          {overseas.length ? (
            <button
              className="btn-ghost"
              style={{ fontSize: 10.5, padding: '4px 10px', borderRadius: 5 }}
              onClick={() => setShowOverseas((v) => !v)}
            >
              {showOverseas ? '收起明细' : `展开 ${overseas.length} 个明细`}
            </button>
          ) : null}
        </div>

        {overseas.length ? (
          <>
            <div className="muted small" style={{ marginBottom: 8, lineHeight: 1.7 }}>
              {overseas.map((x) => `${x.name} ${fmt.pct(x.pct)}`).join(' · ')} · 只影响开盘情绪，不改 A 股仓位结论。
            </div>
            {showOverseas ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
                {overseas.map((x) => (
                  <IndexCard key={x.code} x={x} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div
            style={{
              padding: '16px',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              color: 'var(--text-dim)',
              fontSize: 11.5,
              lineHeight: 1.8,
            }}
          >
            {loading ? '海外指数加载中，稍等一下…' : '海外指数这次没有返回。隔夜参考缺数据时，A 股开盘还是按自己的均线和广度执行。'}
          </div>
        )}
      </div>
    </div>
  )
}
