import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Skeleton, Table, Tag, Tooltip, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState } from '../components/ui'
import PositionAdviceCard from '../components/PositionAdvice'
import { fmt, trendClass } from '../utils'

export default function Daily() {
  const nav = useNavigate()
  const [brief, setBrief] = useState<any>(null)
  const [picks, setPicks] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pickLoading, setPickLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const b = await api.get<any>('/api/market/daily')
      setBrief(b)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
    setPickLoading(true)
    try {
      const p = await api.get<any>('/api/market/picks?limit=150&top=12')
      setPicks(p)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setPickLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 180000)
    return () => clearInterval(t)
  }, [])

  if (loading && !brief) {
    return <div className="card card-pad"><Skeleton active paragraph={{ rows: 10 }} /></div>
  }
  if (!brief) return null

  const b = brief.breadth ?? {}
  const total = Math.max((b.up ?? 0) + (b.down ?? 0) + (b.flat ?? 0), 1)
  const v = brief.verdict ?? {}
  const tone = v.tone === 'up' ? 'var(--up)' : v.tone === 'down' ? 'var(--down)' : 'var(--text-sub)'

  return (
    <div>
      <Card
        title={`每日行情 · ${brief.date}`}
        desc={`${brief.status?.label ?? ''} · 数据 ${new Date((brief.ts ?? 0) * 1000).toLocaleTimeString('zh-CN', { hour12: false })}`}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
      >
        <div className="daily-summary">{brief.summary}</div>

        <div className="daily-index-grid">
          {(brief.indices ?? []).map((i: any) => (
            <div key={i.code} className="daily-index">
              <div className="row-between">
                <span className="small"><b>{i.name}</b></span>
                <span className={`num ${trendClass(i.pct)}`} style={{ fontWeight: 600 }}>{fmt.pct(i.pct)}</span>
              </div>
              <div className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{fmt.price(i.price)}</div>
              <div className="muted small" style={{ marginTop: 3 }}>
                {i.trend} · RSI {i.rsi ?? '--'} · 20日线 {i.above20 ? '上' : '下'}
              </div>
            </div>
          ))}
        </div>

        <div className="daily-bottom">
          <div style={{ flex: 2.1 }}>
            <div className="muted small">涨跌分布</div>
            <div className="breadth-bar" style={{ marginTop: 6 }}>
              <span style={{ width: `${((b.up ?? 0) / total) * 100}%`, background: 'var(--up)' }} />
              <span style={{ width: `${((b.flat ?? 0) / total) * 100}%`, background: 'var(--text-dim)' }} />
              <span style={{ width: `${((b.down ?? 0) / total) * 100}%`, background: 'var(--down)' }} />
            </div>
            <div className="breadth-labels">
              <span className="up">涨 {b.up ?? 0}</span>
              <span>平 {b.flat ?? 0}</span>
              <span className="down">跌 {b.down ?? 0}</span>
            </div>
          </div>
          <div className="daily-kv">
            <div><span>涨停</span><b className="up">{b.limit_up ?? 0}</b></div>
            <div><span>跌停</span><b className="down">{b.limit_down ?? 0}</b></div>
            <div><span>成交额</span><b>{fmt.big(brief.turnover)}</b></div>
            <div><span>市场温度</span><b style={{ color: tone }}>{brief.score}</b></div>
            <div><span>结论</span><b style={{ color: tone }}>{v.label}</b></div>
          </div>
        </div>

        <div className="sector-columns">
          <div>
            <div className="muted small">领涨行业</div>
            <div className="sector-list">
              {(brief.sectors?.top ?? []).map((x: any) => (
                <div key={x.code} className="sector-row"><span>{x.name}</span><b className="up">{fmt.pct(x.pct)}</b></div>
              ))}
            </div>
          </div>
          <div>
            <div className="muted small">靠后行业</div>
            <div className="sector-list">
              {(brief.sectors?.bottom ?? []).map((x: any) => (
                <div key={x.code} className="sector-row"><span>{x.name}</span><b className="down">{fmt.pct(x.pct)}</b></div>
              ))}
            </div>
          </div>
          <div>
            <div className="muted small">领涨概念</div>
            <div className="sector-list">
              {(brief.sectors?.concepts ?? []).slice(0, 5).map((x: any) => (
                <div key={x.code} className="sector-row"><span>{x.name}</span><b className="up">{fmt.pct(x.pct)}</b></div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <FlowCard hot={brief.hot} nav={nav} />
        <HotBoardCard hot={brief.hot} nav={nav} />
      </div>

      <div style={{ marginTop: 14 }}>
        <IndexAnalysisCard indices={brief.indices} nav={nav} />
      </div>

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <PeriodCard indices={brief.indices} />
        <IndustryTrendCard trends={brief.industry_trends} />
      </div>

      <div style={{ marginTop: 14 }}>
        <NewsCard news={brief.news} industries={brief.sectors?.top} />
      </div>

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <PositionAdviceCard advice={brief.advice} title="仓位管理推荐" />
        <Card title="明日关注" desc="指数关键支撑 / 压力">
          <div className="muted small" style={{ marginBottom: 8 }}>
            收盘后基于近 20 日高低点与 MA20 计算，仅作盘前参考。
          </div>
          {(brief.levels ?? []).map((l: any) => (
            <div key={l.code} className="level-block">
              <div className="row-between">
                <span><b>{l.name}</b> <span className="muted small">{fmt.price(l.price)}</span></span>
                <span className="muted small">MA20 {fmt.price(l.ma20)} · MA60 {fmt.price(l.ma60)}</span>
              </div>
              <div className="level-row">
                <span className="sr sr-support">支撑 {fmt.price(l.support)} <em>{fmt.pct(l.support_dist)}</em></span>
                <span className="sr sr-resistance">压力 {fmt.price(l.resistance)} <em>{fmt.pct(l.resistance_dist)}</em></span>
              </div>
            </div>
          ))}
          <div className="muted small" style={{ marginTop: 8 }}>
            站上压力位可视为转强信号；跌破支撑位应降低仓位。
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card
          title="今日标的推荐"
          desc={picks ? `扫描 ${picks.scanned} 只 · 命中 ${picks.matched} 只 · 按综合评分排序` : '形态 + 量价 + 流动性综合筛选'}
          extra={<Button size="small" loading={pickLoading} onClick={load}>重新扫描</Button>}
          pad={false}
        >
          {pickLoading && !picks ? (
            <div className="card-pad"><Skeleton active paragraph={{ rows: 8 }} /></div>
          ) : (
            <Table
              size="small"
              rowKey="code"
              dataSource={picks?.picks ?? []}
              pagination={false}
              onRow={(r) => ({ onClick: () => nav(`/stock/${r.code}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: '股票', dataIndex: 'name', render: (v: string, r: any) => <span><b>{v}</b> <span className="muted mono small">{r.code}</span></span> },
                { title: '现价', dataIndex: 'price', align: 'right', render: (v: number) => <span className="num">{fmt.price(v)}</span> },
                { title: '涨跌幅', dataIndex: 'pct', align: 'right', render: (v: number) => <span className={`num ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                { title: '行业', dataIndex: 'industry', render: (v: string) => <span className="muted small">{v || '--'}</span> },
                {
                  title: '触发信号',
                  render: (_: any, r: any) => (
                    <div className="pick-signals">
                      {(r.signals ?? []).map((s: any) => (
                        <Tooltip key={s.id} title={s.reason}>
                          <span className="chip">{s.name}</span>
                        </Tooltip>
                      ))}
                    </div>
                  ),
                },
                { title: '5日', dataIndex: 'pct5', align: 'right', render: (v: number) => <span className={`num small ${trendClass(v)}`}>{fmt.pct(v)}</span> },
                { title: '评分', dataIndex: 'score', align: 'right', sorter: (a: any, b: any) => a.score - b.score, render: (v: number) => <span className="num" style={{ fontWeight: 600 }}>{v}</span> },
              ]}
            />
          )}
        </Card>
        <div className="muted small" style={{ marginTop: 8 }}>
          标的由技术形态与量价信号自动生成，不构成投资建议；请结合基本面、仓位上限与止损纪律自行判断。
        </div>
        <div style={{ marginTop: 14 }}>
          <IndicatorNotes />
        </div>
      </div>
    </div>
  )
}


function HotBoardCard({ hot, nav }: { hot: any; nav: (p: string) => void }) {
  if (!hot) return null
  return (
    <Card title="热点榜" desc="涨跌最多的 10 只股票">
      <div className="hot-grid">
        <div>
          <div className="muted small" style={{ marginBottom: 4 }}>涨幅榜</div>
          {(hot.gainers ?? []).map((x: any, i: number) => (
            <div key={x.code} className="hot-row" onClick={() => nav(`/stock/${x.code}`)}>
              <span className="hot-rank">{i + 1}</span>
              <span className="hot-name">{x.name}</span>
              <span className="muted mono small">{x.code}</span>
              <span className="num small">{fmt.price(x.price)}</span>
              <b className="up num small">{fmt.pct(x.pct)}</b>
            </div>
          ))}
        </div>
        <div>
          <div className="muted small" style={{ marginBottom: 4 }}>跌幅榜</div>
          {(hot.losers ?? []).map((x: any, i: number) => (
            <div key={x.code} className="hot-row" onClick={() => nav(`/stock/${x.code}`)}>
              <span className="hot-rank">{i + 1}</span>
              <span className="hot-name">{x.name}</span>
              <span className="muted mono small">{x.code}</span>
              <span className="num small">{fmt.price(x.price)}</span>
              <b className="down num small">{fmt.pct(x.pct)}</b>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function FlowCard({ hot, nav }: { hot: any; nav: (p: string) => void }) {
  if (!hot) return null
  return (
    <Card title="主力追踪" desc="主力净流入 · 行业资金">
      <div className="flow-grid">
        <div>
          <div className="muted small">个股净流入</div>
          {(hot.inflow ?? []).slice(0, 6).map((x: any) => (
            <div key={x.code} className="sector-row" onClick={() => nav(`/stock/${x.code}`)} style={{ cursor: 'pointer' }}>
              <span>{x.name} <span className="muted mono small">{x.code}</span></span>
              <b className="up">{fmt.big(x.inflow)}</b>
            </div>
          ))}
        </div>
        <div>
          <div className="muted small">行业净流入</div>
          {(hot.industries_in ?? []).slice(0, 6).map((x: any) => (
            <div key={x.code} className="sector-row">
              <span>{x.name}</span>
              <b className="up">{fmt.big(x.inflow)}</b>
            </div>
          ))}
        </div>
        <div>
          <div className="muted small">个股净流出</div>
          {(hot.outflow ?? []).slice(0, 6).map((x: any) => (
            <div key={x.code} className="sector-row" onClick={() => nav(`/stock/${x.code}`)} style={{ cursor: 'pointer' }}>
              <span>{x.name} <span className="muted mono small">{x.code}</span></span>
              <b className="down">{fmt.big(x.inflow)}</b>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(hot.industries_in ?? []).slice(0, 5).map((x: any) => (
          <span key={x.code} className="chip">行业推荐 · {x.name} <b className="up">{fmt.pct(x.pct)}</b></span>
        ))}
      </div>
    </Card>
  )
}

function IndexAnalysisCard({ indices, nav }: { indices: any[]; nav: (p: string) => void }) {
  return (
    <Card title="行情分析" desc="指数均线 · MACD · RSI · 近 20 日支撑压力">
      <div className="index-analysis">
        <div className="ia-head">
          <span>指数</span><span>点位</span><span>涨跌</span><span>7日</span><span>20日</span><span>30日</span><span>60日</span><span>MA5</span><span>MA10</span><span>MA20</span><span>MA60</span><span>RSI</span><span>MACD</span><span>九转</span><span>钝化</span><span>支撑</span><span>压力</span>
        </div>
        {indices.map((i) => (
          <div key={i.code} className="ia-row" onClick={() => nav(`/stock/${i.code}`)}>
            <span><b>{i.short}</b></span>
            <span className="num">{fmt.price(i.price)}</span>
            <span className={`num ${trendClass(i.pct)}`}>{fmt.pct(i.pct)}</span>
            <span className={`num small ${trendClass(i.pct7)}`}>{fmt.pct(i.pct7)}</span>
            <span className={`num small ${trendClass(i.pct20)}`}>{fmt.pct(i.pct20)}</span>
            <span className={`num small ${trendClass(i.pct30)}`}>{fmt.pct(i.pct30)}</span>
            <span className={`num small ${trendClass(i.pct60)}`}>{fmt.pct(i.pct60)}</span>
            <span className="num">{i.ma5?.toFixed(0) ?? '--'}</span>
            <span className="num">{i.ma10?.toFixed(0) ?? '--'}</span>
            <span className="num">{i.ma20?.toFixed(0) ?? '--'}</span>
            <span className="num">{i.ma60?.toFixed(0) ?? '--'}</span>
            <span className="num">{i.rsi ?? '--'}</span>
            <span className="num small">{i.macd_dif ?? '--'} / {i.macd_dea ?? '--'}</span>
            <span className="num small">{i.td_buy ? `买${i.td_buy}` : i.td_sell ? `卖${i.td_sell}` : '--'}</span>
            <span className={`small ${i.bottom_dull ? 'up' : 'muted'}`}>{i.bottom_dull ? '底部钝化' : '--'}</span>
            <span className="num down">{i.support?.toFixed(0) ?? '--'}</span>
            <span className="num up">{i.resistance?.toFixed(0) ?? '--'}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}


function PeriodCard({ indices }: { indices: any[] }) {
  const avg = (key: string) => {
    const vals = indices.map((i) => i[key]).filter((v) => typeof v === 'number')
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const rows = [
    { label: '近 7 日', v: avg('pct7') },
    { label: '近 20 日', v: avg('pct20') },
    { label: '近 30 日', v: avg('pct30') },
    { label: '近 60 日', v: avg('pct60') },
  ]
  return (
    <Card title="多周期表现" desc="五大指数平均涨跌">
      <div className="period-grid">
        {rows.map((r) => (
          <div key={r.label} className="period-cell">
            <span>{r.label}</span>
            <b className={r.v == null ? '' : r.v >= 0 ? 'up' : 'down'}>{r.v == null ? '--' : fmt.pct(r.v)}</b>
            <em className="muted">{r.v == null ? '' : r.v >= 0 ? '上涨' : '下跌'}</em>
          </div>
        ))}
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>
        7 日看短线情绪，20/30 日看波段趋势，60 日看中期方向；四个周期同向时趋势更可靠。
      </div>
    </Card>
  )
}

function IndustryTrendCard({ trends }: { trends: any[] }) {
  return (
    <Card title="行业趋势" desc="资金流入前列行业的多周期表现">
      <div className="industry-trends">
        <div className="it-head"><span>行业</span><span>5日</span><span>20日</span><span>60日</span><span>趋势</span><span>主力</span></div>
        {(trends ?? []).map((t) => (
          <div key={t.code} className="it-row">
            <span><b>{t.name}</b></span>
            <span className={`num ${trendClass(t.pct5)}`}>{fmt.pct(t.pct5)}</span>
            <span className={`num ${trendClass(t.pct20)}`}>{fmt.pct(t.pct20)}</span>
            <span className={`num ${trendClass(t.pct60)}`}>{fmt.pct(t.pct60)}</span>
            <span><span className={`chip ${t.trend === '多头' ? 'up' : t.trend === '空头' ? 'down' : ''}`}>{t.trend}</span></span>
            <span className="num up">{fmt.big(t.inflow)}</span>
          </div>
        ))}
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>
        行业趋势由板块指数近 5/20/60 日涨跌与 MA20/60 排列计算，主力为当日净流入。
      </div>
    </Card>
  )
}

function NewsCard({ news, industries }: { news: any[]; industries: any[] }) {
  return (
    <Card title="行情要闻" desc="东方财富 7×24 快讯 · 推荐关注">
      <div className="news-grid">
        <div className="news-list">
          {(news ?? []).slice(0, 8).map((n, i) => (
            <a key={i} href={n.url} target="_blank" rel="noreferrer" className="news-row">
              <span className="news-time">{String(n.time ?? '').slice(11, 16)}</span>
              <span className="news-title">{n.title}</span>
            </a>
          ))}
          {!news?.length && <EmptyState text="要闻加载中…" icon="◌" />}
        </div>
        <div className="news-watch">
          <div className="muted small">推荐关注</div>
          {(industries ?? []).slice(0, 5).map((x) => (
            <div key={x.code} className="sector-row">
              <span>{x.name}</span>
              <b className="up">{fmt.pct(x.pct)}</b>
            </div>
          ))}
          <div className="muted small" style={{ marginTop: 8 }}>
            关注领涨行业的持续性、主力净流入与成交额变化；消息面仅作催化，需结合量价确认。
          </div>
        </div>
      </div>
    </Card>
  )
}

function IndicatorNotes() {
  return (
    <Card title="指标说明与分析逻辑" desc="怎么看这些数字">
      <div className="indicator-notes">
        <div><b>MA5/10/20/60</b>：短中长期均线。价格站上均线且均线多头排列，趋势偏强；跌破 MA20/60 需警惕。</div>
        <div><b>RSI(14)</b>：&gt;70 超买、&lt;30 超卖；低位钝化后拐头向上，可能是底部信号，但需量价确认。</div>
        <div><b>MACD</b>：DIF 上穿 DEA 为金叉，绿柱缩短代表下跌动能减弱；零轴上方金叉更可靠。</div>
        <div><b>九转序列</b>：连续 9 根收盘价低于/高于 4 日前收盘价，分别提示下跌/上涨动能衰竭。</div>
        <div><b>底部钝化</b>：价格处于 60 日低位，RSI 连续低位后拐头，或 MACD 绿柱缩短，属于左侧反转观察信号。</div>
        <div><b>主力净流入</b>：超大单+大单净额，正值为净流入；单日数据易受大单影响，需结合连续性。</div>
        <div><b>策略与标的</b>：形态、量价、资金、流动性综合评分；仅作筛选，不构成投资建议。</div>
      </div>
    </Card>
  )
}
