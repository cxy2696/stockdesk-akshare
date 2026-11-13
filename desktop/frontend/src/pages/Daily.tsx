import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Segmented, Skeleton, Table, Tag, Tooltip, message } from 'antd'
import { ArrowRightOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons'
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
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const b = await api.get<any>('/api/market/daily')
      setBrief(b)
    } catch (e: any) {
      setError(e?.message ?? '行情加载失败')
    } finally {
      setLoading(false)
    }
    setPickLoading(true)
    try {
      const p = await api.get<any>('/api/market/picks?limit=150&top=12')
      setPicks(p)
    } catch {
      setPicks({ picks: [], scanned: 0, matched: 0 })
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
    return (
      <div className="card card-pad">
        <Skeleton active paragraph={{ rows: 12 }} />
        <div className="muted small" style={{ marginTop: 10 }}>
          第一次打开要把行情、资金、板块和模型汇总到一起，通常十几秒；之后会先用上次结果秒开，再在后台更新。
        </div>
      </div>
    )
  }
  if (!brief) {
    return (
      <Card title="每日策略暂时不可用" desc="行情源没有返回数据">
        <div className="muted small" style={{ marginBottom: 10 }}>{error || '请检查网络后重试。'}</div>
        <Button icon={<ReloadOutlined />} onClick={load}>重新加载</Button>
      </Card>
    )
  }

  const b = brief.breadth ?? {}
  const total = Math.max((b.up ?? 0) + (b.down ?? 0) + (b.flat ?? 0), 1)
  const v = brief.verdict ?? {}
  const tone = v.tone === 'up' ? 'var(--up)' : v.tone === 'down' ? 'var(--down)' : 'var(--text-sub)'
  const model = brief.model ?? {}

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="daily-page">
      <div className="daily-nav">
        <span className="daily-nav-label">页面导航</span>
        {[
          ['daily-market', '每日行情'],
          ['daily-models', '量化结论'],
          ['daily-td', '九转模型'],
          ['daily-industry', '行业关注'],
          ['daily-news', '行业要闻'],
          ['daily-picks', '今日标的'],
        ].map(([id, label]) => (
          <button key={id} className="daily-nav-chip" onClick={() => jump(id)}>{label}</button>
        ))}
        <span className="daily-nav-spacer" />
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button>
      </div>

      <Card
        title={`每日行情 · ${brief.date}`}
        desc={`${brief.status?.label ?? ''} · 数据 ${new Date((brief.ts ?? 0) * 1000).toLocaleTimeString('zh-CN', { hour12: false })}`}
        extra={<span className="daily-status"><SyncOutlined /> {error ? '部分数据延迟' : '已更新'}</span>}
      >
        <div className="daily-summary">{brief.summary}</div>

        <div className="daily-index-grid">
          {(brief.indices ?? []).map((i: any) => (
            <button key={i.code} className="daily-index daily-index-btn" onClick={() => nav(`/stock/${i.code}`)}>
              <div className="row-between">
                <span className="small"><b>{i.name}</b></span>
                <span className={`num ${trendClass(i.pct)}`} style={{ fontWeight: 600 }}>{fmt.pct(i.pct)}</span>
              </div>
              <div className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{fmt.price(i.price)}</div>
              <div className="muted small" style={{ marginTop: 3 }}>
                {i.trend ?? '震荡'} · RSI {i.rsi ?? '--'} · MA20 {i.above20 ? '上方' : '下方'}
              </div>
              <div className="daily-index-td">
                九转 {i.td?.label ?? (i.td_buy ? `买 ${i.td_buy}/9` : i.td_sell ? `卖 ${i.td_sell}/9` : '无结构')}
              </div>
            </button>
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
            <div><span>市场温度</span><b style={{ color: tone }}>{brief.score ?? '--'}</b></div>
            <div><span>结论</span><b style={{ color: tone }}>{v.label ?? '--'}</b></div>
          </div>
        </div>

        <div className="sector-columns">
          <div>
            <div className="muted small">领涨行业</div>
            <div className="sector-list">
              {(brief.sectors?.top ?? []).map((x: any) => (
                <div key={x.code} className="sector-row"><span>{x.name}</span><b className={trendClass(x.pct)}>{fmt.pct(x.pct)}</b></div>
              ))}
            </div>
          </div>
          <div>
            <div className="muted small">靠后行业</div>
            <div className="sector-list">
              {(brief.sectors?.bottom ?? []).map((x: any) => (
                <div key={x.code} className="sector-row"><span>{x.name}</span><b className={trendClass(x.pct)}>{fmt.pct(x.pct)}</b></div>
              ))}
            </div>
          </div>
          <div>
            <div className="muted small">领涨概念</div>
            <div className="sector-list">
              {(brief.sectors?.concepts ?? []).slice(0, 5).map((x: any) => (
                <div key={x.code} className="sector-row"><span>{x.name}</span><b className={trendClass(x.pct)}>{fmt.pct(x.pct)}</b></div>
              ))}
              {!(brief.sectors?.concepts ?? []).length && <div className="muted small">概念板块数据暂缺</div>}
            </div>
          </div>
        </div>
      </Card>

      <ModelStrip model={model} onJump={() => jump('daily-models')} />

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <FlowBoard hot={brief.hot} nav={nav} />
        <HotBoard hot={brief.hot} nav={nav} />
      </div>

      <div id="daily-models" style={{ marginTop: 14 }}>
        <QuantAnalysis brief={brief} model={model} nav={nav} />
      </div>

      <div id="daily-td" style={{ marginTop: 14 }}>
        <TDModel td={brief.td} model={model} nav={nav} />
      </div>

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <PeriodCard indices={brief.indices} />
        <IndustryTrendCard trends={brief.industry_trends} />
      </div>

      <div id="daily-industry" style={{ marginTop: 14 }}>
        <IndustryFocus focus={brief.industry_focus} market={brief.sectors?.top} nav={nav} />
      </div>

      <div id="daily-news" style={{ marginTop: 14 }}>
        <NewsCenter news={brief.news} related={brief.industry_news} sectors={brief.sectors} focus={brief.industry_focus} />
      </div>

      <div className="grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
        <PositionAdviceCard advice={brief.advice} title="仓位管理推荐" />
        <LevelsCard levels={brief.levels} />
      </div>

      <div id="daily-picks" style={{ marginTop: 14 }}>
        <Card
          title="今日标的推荐"
          desc={picks ? `扫描 ${picks.scanned ?? 0} 只 · 命中 ${picks.matched ?? 0} 只 · 按综合评分排序` : '形态 + 量价 + 流动性综合筛选'}
          extra={<Button size="small" loading={pickLoading} onClick={load}>重新扫描</Button>}
          pad={false}
        >
          {pickLoading && !picks ? (
            <div className="card-pad"><Skeleton active paragraph={{ rows: 8 }} /></div>
          ) : (picks?.picks ?? []).length ? (
            <Table
              size="small"
              rowKey="code"
              dataSource={picks.picks}
              pagination={false}
              onRow={(r) => ({ onClick: () => nav(`/stock/${r.code}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: '股票', dataIndex: 'name', render: (val: string, r: any) => <span><b>{val}</b> <span className="muted mono small">{r.code}</span></span> },
                { title: '现价', dataIndex: 'price', align: 'right', render: (val: number) => <span className="num">{fmt.price(val)}</span> },
                { title: '涨跌幅', dataIndex: 'pct', align: 'right', render: (val: number) => <span className={`num ${trendClass(val)}`}>{fmt.pct(val)}</span> },
                ...((picks.picks ?? []).some((r: any) => r.industry) ? [{ title: '行业', dataIndex: 'industry', render: (val: string) => <span className="muted small">{val}</span> }] : []),
                {
                  title: '触发信号',
                  render: (_: any, r: any) => (
                    <div className="pick-signals">
                      {(r.signals ?? []).map((s: any) => (
                        <Tooltip key={s.id ?? s.name} title={s.reason}>
                          <span className="chip">{s.name}</span>
                        </Tooltip>
                      ))}
                    </div>
                  ),
                },
                { title: '5日', dataIndex: 'pct5', align: 'right', render: (val: number) => <span className={`num small ${trendClass(val)}`}>{fmt.pct(val)}</span> },
                { title: '评分', dataIndex: 'score', align: 'right', sorter: (a: any, b: any) => a.score - b.score, render: (val: number) => <span className="num" style={{ fontWeight: 600 }}>{val}</span> },
              ]}
            />
          ) : (
            <EmptyState text="今天没有同时满足形态、量价与流动性条件的标的。宁可空仓等，也不为了交易而交易。" icon="◇" />
          )}
        </Card>
        <div className="muted small" style={{ marginTop: 8 }}>
          标的是从成交额与市值靠前的股票里筛出来的，只用来缩小观察范围，不构成买卖建议。进场前先看支撑、仓位上限和止损位。
        </div>
        <div style={{ marginTop: 14 }}>
          <IndicatorNotes />
        </div>
      </div>
    </div>
  )
}

function ModelStrip({ model, onJump }: { model: any; onJump: () => void }) {
  const c = model?.conclusion
  if (!c?.text) return null
  const td = model?.td?.counts ?? {}
  return (
    <div className="model-strip" onClick={onJump} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onJump() }}>
      <div className="model-strip-main">
        <span>今日模型结论</span>
        <b>{c.stance}</b>
        <em>总仓位 {c.position}</em>
      </div>
      <div className="model-strip-text">{c.text}</div>
      <div className="model-strip-tags">
        <span>HMM {c.hmm}</span>
        <span>渗流 {c.regime}</span>
        <span>九转 买 {td.buy ?? 0} / 卖 {td.sell ?? 0}</span>
        <span className="model-strip-more">查看拆解 <ArrowRightOutlined /></span>
      </div>
    </div>
  )
}

function FlowBoard({ hot, nav }: { hot: any; nav: (p: string) => void }) {
  if (!hot) {
    return <Card title="主力追踪"><EmptyState text="资金流数据还在加载，稍后会自动补上。" icon="◌" /></Card>
  }
  const inflow = hot.inflow ?? []
  const outflow = hot.outflow ?? []
  const industries = hot.industries_in ?? []
  const totals = hot.totals ?? {}
  const source = hot.source === 'sina-market-center' ? '新浪资金流' : '东方财富 / 新浪合并'
  return (
    <Card
      title="主力追踪"
      desc={`个股与行业当日主力净额 · ${source}`}
      extra={<span className="muted small">{hot.updated ? new Date(hot.updated * 1000).toLocaleTimeString('zh-CN', { hour12: false }) : ''}</span>}
    >
      <div className="flow-totals">
        <div><span>主力净流入</span><b className="up">{fmt.big(totals.inflow)}</b></div>
        <div><span>主力净流出</span><b className="down">{fmt.big(totals.outflow)}</b></div>
        <div><span>资金榜净额</span><b className={trendClass(totals.net)}>{fmt.big(totals.net)}</b></div>
      </div>
      <div className="flow-cols">
        <div className="flow-col">
          <div className="flow-col-head">个股净流入 <em>前 6</em></div>
          {inflow.slice(0, 6).map((x: any) => (
            <button key={x.code} className="flow-row" onClick={() => nav(`/stock/${x.code}`)}>
              <span className="flow-name">{x.name}<em className="mono">{x.code}</em></span>
              <span className="flow-val up">{fmt.big(x.inflow)}</span>
            </button>
          ))}
          {!inflow.length && <div className="muted small">暂未取得个股流入数据</div>}
        </div>
        <div className="flow-col">
          <div className="flow-col-head">个股净流出 <em>前 6</em></div>
          {outflow.slice(0, 6).map((x: any) => (
            <button key={x.code} className="flow-row" onClick={() => nav(`/stock/${x.code}`)}>
              <span className="flow-name">{x.name}<em className="mono">{x.code}</em></span>
              <span className="flow-val down">{fmt.big(x.inflow)}</span>
            </button>
          ))}
          {!outflow.length && <div className="muted small">暂未取得个股流出数据</div>}
        </div>
        <div className="flow-col">
          <div className="flow-col-head">行业净流入 <em>前 6</em></div>
          {industries.slice(0, 6).map((x: any) => (
            <div key={x.code ?? x.name} className="flow-row flow-row-static">
              <span className="flow-name">{x.name}<em className="mono">当日 {fmt.pct(x.pct)}</em></span>
              <span className={`flow-val ${trendClass(x.inflow)}`}>{fmt.big(x.inflow)}</span>
            </div>
          ))}
          {!industries.length && <div className="muted small">板块资金数据暂缺，个股资金仍可用</div>}
        </div>
      </div>
      <div className="flow-chips">
        {industries.slice(0, 5).map((x: any) => (
          <span key={x.code ?? x.name} className="chip">
            行业资金 · {x.name} <b className={trendClass(x.pct)}>{fmt.pct(x.pct)}</b>
          </span>
        ))}
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>
        主力净额 = 超大单 + 大单净买入。单日数字容易被一笔大单带偏，要连看 3–5 天，再和行业资金对一下方向。
      </div>
    </Card>
  )
}

function HotBoard({ hot, nav }: { hot: any; nav: (p: string) => void }) {
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

function QuantAnalysis({ brief, model, nav }: { brief: any; model: any; nav: (p: string) => void }) {
  const hmm = model?.hmm
  const perc = model?.percolation
  const conclude = model?.conclusion
  const indices = brief.indices ?? []
  return (
    <Card
      title="行情分析 · 模型结论"
      desc="指数均线 / MACD / RSI / 九转 + HMM 与渗流结论"
      extra={<span className="muted small">模型结果每 10 分钟更新</span>}
    >
      <div className="model-mini-grid">
        <div className="model-mini">
          <div className="model-mini-head"><span>HMM 市场状态</span><b className={hmm?.state === '强势' ? 'up' : hmm?.state === '弱势' ? 'down' : ''}>{hmm?.state ?? '--'}</b></div>
          <div className="model-mini-body">
            概率 {((hmm?.confidence ?? 0) * 100).toFixed(0)}% · 已持续 {hmm?.regime_age ?? '--'} 天
          </div>
          <div className="model-mini-foot">历史平均 {hmm?.expected_days ?? '--'} 天 · 明日离开概率 {((hmm?.flip_risk ?? 0) * 100).toFixed(0)}%</div>
        </div>
        <div className="model-mini">
          <div className="model-mini-head"><span>渗流广度</span><b className={perc?.status?.includes('超') ? 'up' : perc?.status?.includes('临界') ? '' : 'down'}>{perc?.status ?? '--'}</b></div>
          <div className="model-mini-body">
            最大簇 {((perc?.giant_occupied ?? 0) * 100).toFixed(0)}% · 上涨占比 {((perc?.ratio ?? 0) * 100).toFixed(0)}%
          </div>
          <div className="model-mini-foot">阈值 {(perc?.threshold ?? 0.5927) * 100}% · {perc?.clusters ?? '--'} 个连通簇</div>
        </div>
        <div className="model-mini">
          <div className="model-mini-head"><span>九转信号</span><b>{brief.td?.counts?.buy ?? 0} 买 / {brief.td?.counts?.sell ?? 0} 卖</b></div>
          <div className="model-mini-body">{brief.td?.text ?? '九转结构计算中'}</div>
          <div className="model-mini-foot">买结构=下跌衰竭，卖结构=上涨透支，都要等确认</div>
        </div>
      </div>

      <div className="index-analysis" style={{ marginTop: 12 }}>
        <div className="qa-head">
          <span>指数</span><span>点位</span><span>涨跌</span><span>7日</span><span>20日</span><span>60日</span><span>MA20</span><span>MA60</span><span>RSI</span><span>九转</span><span>支撑</span><span>压力</span>
        </div>
        {indices.map((i: any) => (
          <div key={i.code} className="qa-row" onClick={() => nav(`/stock/${i.code}`)}>
            <span><b>{i.short}</b></span>
            <span className="num">{fmt.price(i.price)}</span>
            <span className={`num ${trendClass(i.pct)}`}>{fmt.pct(i.pct)}</span>
            <span className={`num small ${trendClass(i.pct7)}`}>{fmt.pct(i.pct7)}</span>
            <span className={`num small ${trendClass(i.pct20)}`}>{fmt.pct(i.pct20)}</span>
            <span className={`num small ${trendClass(i.pct60)}`}>{fmt.pct(i.pct60)}</span>
            <span className="num">{i.ma20 ? i.ma20.toFixed(0) : '--'}</span>
            <span className="num">{i.ma60 ? i.ma60.toFixed(0) : '--'}</span>
            <span className="num">{i.rsi ?? '--'}</span>
            <span className={`small ${i.td?.bias === '偏多' ? 'up' : i.td?.bias === '偏空' ? 'down' : 'muted'}`}>{i.td?.label ?? '--'}</span>
            <span className="num down">{i.support ? i.support.toFixed(0) : '--'}</span>
            <span className="num up">{i.resistance ? i.resistance.toFixed(0) : '--'}</span>
          </div>
        ))}
      </div>

      {conclude?.bullets?.length > 0 && (
        <div className="model-bullets">
          {conclude.bullets.map((line: string, i: number) => <div key={i}>· {line}</div>)}
        </div>
      )}
      {(hmm?.summary || perc?.note) && (
        <div className="model-notes">
          {hmm?.summary && <div><b>状态：</b>{hmm.summary}</div>}
          {perc?.note && <div><b>广度：</b>{perc.note}</div>}
        </div>
      )}
    </Card>
  )
}

function TDModel({ td, model, nav }: { td: any; model: any; nav: (p: string) => void }) {
  const rows = td?.indices ?? model?.td?.indices ?? []
  const counts = td?.counts ?? {}
  const portfolio = model?.td?.portfolio ?? []
  const leaders = model?.td?.leaders ?? []
  return (
    <Card
      title="九转模型分析"
      desc="TD Sequential · 建仓结构 9 根 / 倒计时 13 根 · 判断动能衰竭，不预测点位"
      extra={<span className="muted small">买 {counts.buy ?? 0} · 卖 {counts.sell ?? 0} · 观察 {counts.watch_buy ?? 0}/{counts.watch_sell ?? 0}</span>}
    >
      <div className="td-summary">{td?.text ?? model?.td?.text ?? '九转结构计算中…'}</div>

      <div className="td-grid">
        {rows.map((x: any) => (
          <button key={x.code} className="td-card" onClick={() => nav(`/stock/${x.code}`)}>
            <div className="row-between">
              <b>{x.name}</b>
              <span className={`chip ${x.td?.bias === '偏多' ? 'up' : x.td?.bias === '偏空' ? 'down' : ''}`}>{x.td?.label ?? '无结构'}</span>
            </div>
            <div className="td-state-line">
              <span className={x.state === '强势' ? 'up' : x.state === '弱势' ? 'down' : 'muted'}>
                {x.state ?? '状态未知'} {x.confidence ? `${(x.confidence * 100).toFixed(0)}%` : ''}
              </span>
              <span className="muted">
                结构 买 {x.td?.buy?.count ?? 0}/9 · 卖 {x.td?.sell?.count ?? 0}/9
                {x.td?.countdown?.count ? ` · 倒计时 ${x.td.countdown.direction === 'buy' ? '买' : '卖'} ${x.td.countdown.count}/13` : ''}
              </span>
            </div>
            <div className="td-meter">
              <span>买 {x.td?.buy?.count ?? 0}/9</span>
              <div className="td-track"><i style={{ width: `${((x.td?.buy?.count ?? 0) / 9) * 100}%`, background: 'var(--up)' }} /></div>
            </div>
            <div className="td-meter">
              <span>卖 {x.td?.sell?.count ?? 0}/9</span>
              <div className="td-track"><i style={{ width: `${((x.td?.sell?.count ?? 0) / 9) * 100}%`, background: 'var(--down)' }} /></div>
            </div>
            <div className="td-read">{x.td?.read ?? '数据不足'}</div>
          </button>
        ))}
        {!rows.length && <EmptyState text="指数九转数据暂时不可用，等行情源恢复后会自动重算。" icon="◌" />}
      </div>

      <div className="grid-2" style={{ marginTop: 12, alignItems: 'start' }}>
        <div>
          <div className="muted small" style={{ marginBottom: 6 }}>持仓九转</div>
          {portfolio.length ? portfolio.map((x: any) => (
            <div key={x.code} className="td-row" onClick={() => nav(`/stock/${x.code}`)}>
              <span><b>{x.name}</b> <span className="muted mono small">{x.code}</span></span>
              <span className={`small ${x.td?.bias === '偏多' ? 'up' : x.td?.bias === '偏空' ? 'down' : 'muted'}`}>{x.td?.label ?? '--'}</span>
            </div>
          )) : <div className="muted small">还没有持仓，记一笔买入后这里会显示持仓的九转状态。</div>}
        </div>
        <div>
          <div className="muted small" style={{ marginBottom: 6 }}>临界行业龙头九转</div>
          {leaders.length ? leaders.map((x: any) => (
            <div key={x.code} className="td-row" onClick={() => nav(`/stock/${x.code}`)}>
              <span><b>{x.name}</b> <span className="muted small">{x.industry}</span></span>
              <span className={`small ${x.td?.bias === '偏多' ? 'up' : x.td?.bias === '偏空' ? 'down' : 'muted'}`}>{x.td?.label ?? '--'}</span>
            </div>
          )) : <div className="muted small">暂无临界行业龙头数据。</div>}
        </div>
      </div>

      <div className="td-guide">
        <b>怎么用：</b>九转说明的是“这一段走势累了”，不是“马上反转”。买结构 9 完成后，等一根放量阳线或收复 5 日线再试仓；卖结构 9 完成后，若跌破 5 日线先减一半。倒计时 13 比 9 更严格，出现时信号更强，但也更需要成交量配合。
      </div>
    </Card>
  )
}

function PeriodCard({ indices }: { indices: any[] }) {
  const avg = (key: string) => {
    const vals = indices.map((i) => i[key]).filter((val) => typeof val === 'number')
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
        7 日看短线情绪，20/30 日看波段，60 日看中期方向。四个周期同向时，趋势更可信；互相打架时，仓位别重。
      </div>
    </Card>
  )
}

function IndustryTrendCard({ trends }: { trends: any[] }) {
  return (
    <Card title="行业趋势" desc="资金流入前列行业的多周期表现">
      <div className="industry-trends">
        <div className="it-head"><span>行业</span><span>5日</span><span>20日</span><span>60日</span><span>趋势</span><span>主力</span></div>
        {(!trends || trends.length === 0) && (
          <EmptyState text="行情源没有返回板块历史数据。等东方财富板块接口恢复，5/20/60 日趋势会自动补全。" />
        )}
        {(trends ?? []).map((t: any) => (
          <div key={t.code} className="it-row">
            <span><b>{t.name}</b></span>
            <span className={`num ${trendClass(t.pct5)}`}>{fmt.pct(t.pct5)}</span>
            <span className={`num ${trendClass(t.pct20)}`}>{fmt.pct(t.pct20)}</span>
            <span className={`num ${trendClass(t.pct60)}`}>{fmt.pct(t.pct60)}</span>
            <span><span className={`chip ${t.trend === '多头' ? 'up' : t.trend === '空头' ? 'down' : ''}`}>{t.trend}</span></span>
            <span className={`num ${trendClass(t.inflow)}`}>{fmt.big(t.inflow)}</span>
          </div>
        ))}
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>
        趋势由板块指数近 5/20/60 日涨跌和 MA20/60 排列算出，主力是当日净流入。趋势向上但资金流出，要小心是拉高出货。
      </div>
    </Card>
  )
}

function IndustryFocus({ focus, verdict, market, nav }: { focus: any[]; verdict?: any; market?: any[]; nav: (p: string) => void }) {
  const list = focus ?? []
  return (
    <Card
      title="行业关注重点"
      desc="广度、资金、龙头与九转放在一起看，决定先做哪个方向"
      extra={<span className="muted small">{list.length ? `${list.length} 个方向` : '数据计算中'}</span>}
    >
      {list.length ? (
        <div className="focus-grid">
          {list.map((x: any) => (
            <div key={x.name} className="focus-card">
              <div className="row-between">
                <b>{x.name}</b>
                <span className={`chip ${x.status?.includes('超') ? 'up' : x.status?.includes('临界') ? 'amber' : 'down'}`}>{x.status}</span>
              </div>
              <div className="focus-metrics">
                <span>上涨 <b className="up">{Math.round((x.ratio ?? 0) * 100)}%</b></span>
                <span>最大簇 <b>{(x.giant_occupied ? (x.giant_occupied * 100).toFixed(0) : '--')}%</b></span>
                <span>资金 <b className={trendClass(x.flow)}>{x.flow == null ? '--' : fmt.big(x.flow)}</b></span>
              </div>
              <div className="focus-bar"><i style={{ width: `${Math.min(100, (x.ratio ?? 0) * 100)}%` }} /></div>
              <div className="focus-text">{x.focus}</div>
              <div className="focus-watch">
                {(x.watch ?? []).slice(0, 3).map((name: string) => {
                  const leader = (x.leaders ?? []).find((s: any) => s.name === name)
                  return (
                    <button key={name} className="chip chip-btn" onClick={() => leader?.code && nav(`/stock/${leader.code}`)}>
                      {name} {leader?.pct != null ? fmt.pct(leader.pct) : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid-2">
          <EmptyState text="行业广度还在计算。稍等片刻，或先看下面的行业要闻和资金流。" icon="◌" />
          <div>
            <div className="muted small" style={{ marginBottom: 6 }}>今天资金在往这些方向走</div>
            {(market ?? []).slice(0, 6).map((x: any) => (
              <div key={x.code} className="sector-row"><span>{x.name}</span><b className={trendClass(x.pct)}>{fmt.pct(x.pct)}</b></div>
            ))}
          </div>
        </div>
      )}
      <div className="muted small" style={{ marginTop: 8 }}>
        判断顺序：先看行业上涨占比有没有过 50%，再看最大连通簇是否扩大，最后看龙头能不能放量。三步都对上，才值得加仓位。
      </div>
    </Card>
  )
}

function NewsCenter({ news, related, sectors, focus }: { news: any[]; related: any[]; sectors: any; focus: any[] }) {
  const [tab, setTab] = useState('all')
  const [expanded, setExpanded] = useState(false)
  const relatedTitles = useMemo(() => new Set((related ?? []).map((n: any) => n.title)), [related])

  const filtered = useMemo(() => {
    const all = news ?? []
    if (tab === 'related') return all.filter((n) => relatedTitles.has(n.title))
    if (tab === 'flash') return all.filter((n) => (n.kind ?? '') === '快讯')
    if (tab === 'focus') return all.filter((n) => (n.kind ?? '') === '要闻')
    return all
  }, [news, tab, relatedTitles])

  const shown = expanded ? filtered : filtered.slice(0, 10)
  const watch = (sectors?.top ?? []).slice(0, 4)
  const names = (focus ?? []).slice(0, 4)

  return (
    <Card
      title="行业要闻"
      desc="东方财富 7×24 快讯 + 要闻 · 点标题直接打开全文"
      extra={<Segmented size="small" value={tab} onChange={(val) => { setTab(val as string); setExpanded(false) }} options={[
        { label: '全部', value: 'all' },
        { label: '行业相关', value: 'related' },
        { label: '快讯', value: 'flash' },
        { label: '要闻', value: 'focus' },
      ]} />}
    >
      <div className="news-layout">
        <div className="news-feed">
          {shown.map((n: any, i: number) => (
            <a key={`${n.title}-${i}`} className="news-item" href={n.url} target="_blank" rel="noreferrer">
              <div className="news-item-side">
                <span className="news-item-time">{String(n.time ?? '').slice(11, 16) || '--:--'}</span>
                <span className="news-item-kind">{n.kind ?? '快讯'}</span>
              </div>
              <div className="news-item-main">
                <div className="news-item-title">{n.title}</div>
                {n.summary && <div className="news-item-summary">{n.summary}</div>}
                <div className="news-item-meta">
                  {(n.industries ?? []).slice(0, 3).map((ind: string) => (
                    <span key={ind} className="news-tag">{ind}</span>
                  ))}
                  <span className="news-more">阅读全文 ↗</span>
                </div>
              </div>
            </a>
          ))}
          {!shown.length && <EmptyState text="这个分类下暂时没有新闻，换个标签看看。" icon="○" />}
          {filtered.length > 10 && (
            <button className="news-expand" onClick={() => setExpanded((v) => !v)}>
              {expanded ? '收起' : `展开全部 ${filtered.length} 条`}
            </button>
          )}
        </div>
        <aside className="news-aside">
          <div className="news-aside-title">今天盯这几个方向</div>
          {watch.map((x: any) => (
            <div key={x.code} className="news-watch-row">
              <span>{x.name}</span>
              <b className={trendClass(x.pct)}>{fmt.pct(x.pct)}</b>
            </div>
          ))}
          {!watch.length && <div className="muted small">行业资金数据暂缺。</div>}
          <div className="news-aside-title" style={{ marginTop: 12 }}>行业关注</div>
          {names.map((x: any) => (
            <div key={x.name} className="news-watch-row">
              <span>{x.name}</span>
              <b className="muted small">{x.status}</b>
            </div>
          ))}
          {!names.length && <div className="muted small">行业广度计算中。</div>}
          <div className="news-aside-note">
            消息只负责点火，能不能持续要看成交额和资金。看到利好先找对应行业有没有放量，再决定追不追。
          </div>
        </aside>
      </div>
    </Card>
  )
}

function LevelsCard({ levels }: { levels: any[] }) {
  return (
    <Card title="明日关注" desc="指数关键支撑 / 压力">
      <div className="muted small" style={{ marginBottom: 8 }}>
        收盘后用近 20 日高低点和 MA20 算出来，盘前看一眼就够。
      </div>
      {(levels ?? []).map((l: any) => (
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
      {!(levels ?? []).length && <EmptyState text="指数支撑压力数据暂时不可用。" icon="○" />}
      <div className="muted small" style={{ marginTop: 8 }}>
        站上压力位说明转强，可以继续拿；跌破支撑先减仓，不要用“再等等”骗自己。
      </div>
    </Card>
  )
}

function IndicatorNotes() {
  return (
    <Card title="指标说明与分析逻辑" desc="这些数字分别在看什么">
      <div className="indicator-notes">
        <div><b>MA5/10/20/60</b>：短中长期均线。价格站上均线且多头排列，趋势偏强；跌破 MA20/60 要警惕。</div>
        <div><b>RSI(14)</b>：&gt;70 超买、&lt;30 超卖。低位钝化后拐头向上，是底部观察信号，但要量价确认。</div>
        <div><b>MACD</b>：DIF 上穿 DEA 是金叉，绿柱缩短说明下跌动能减弱；零轴上方的金叉更可靠。</div>
        <div><b>九转（TD）</b>：连续 9 根收盘价低于/高于 4 日前收盘价为建仓/减仓结构；之后 13 根倒计时更严格。它描述动能衰竭，不是反转保证。</div>
        <div><b>HMM 状态</b>：用日收益把市场分成弱势/震荡/强势三种状态，给出概率和预计持续时间。状态决定总仓位，不做个股选择。</div>
        <div><b>渗流广度</b>：把上涨股票放到二维格点上看是否连成片。最大簇越大，说明上涨越真实；只有少数股票涨，就是结构性行情。</div>
        <div><b>主力净流入</b>：超大单 + 大单净额。单日容易失真，连看几天，再和行业资金对照。</div>
        <div><b>仓位建议</b>：市场温度 + 账户回撤 + 集中度共同决定，先定总仓位，再谈买什么。</div>
      </div>
    </Card>
  )
}
