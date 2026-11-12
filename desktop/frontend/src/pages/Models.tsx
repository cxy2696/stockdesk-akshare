import { useEffect, useState } from 'react'
import { Card, Kpi, StatLine } from '../components/ui'
import { api } from '../api'
import { fmt, trendClass } from '../utils'

const STATE_COLORS = ['#35D0A5', '#F2C94C', '#FF6B6B']
const STATE_TEXT = ['弱势', '震荡', '强势']

export default function Models() {
  const [data, setData] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [sel, setSel] = useState(1)
  const [last, setLast] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const load = () => {
    setRefreshing(true)
    api.get<any>('/api/market/models').then((d) => { setData(d); setLast(new Date().toLocaleTimeString('zh-CN', { hour12: false })) }).catch(() => {}).finally(() => setRefreshing(false))
    api.get<any>('/api/portfolio/summary').then(setSummary).catch(() => {})
  }
  useEffect(() => {
    load()
    const timer = setInterval(load, 5 * 60_000)
    return () => clearInterval(timer)
  }, [])
  const hmmList = data?.hmm_indices ?? []
  const hmm = hmmList[sel] ?? data?.hmm
  const perc = data?.percolation
  const state = hmm?.state_index ?? 1
  const giant = perc?.giant_occupied ?? 0
  const regime = giant >= (perc?.threshold ?? 0.5927) ? '扩散' : giant >= (perc?.threshold ?? 0.5927) - 0.08 ? '临界' : '分裂'
  const hmmLabel = hmm?.state ?? '震荡'
  const stance = (hmmLabel === '强势' && regime === '扩散') ? '进攻' : (hmmLabel === '弱势' && regime !== '扩散') ? '防守' : (hmmLabel === '强势' || regime === '扩散') ? '均衡偏多' : '均衡偏防守'
  const position = (hmmLabel === '强势' && regime === '扩散') ? '60%–80%' : (hmmLabel === '强势' && regime === '临界') ? '50%–70%' : (hmmLabel === '弱势' && regime === '分裂') ? '0%–15%' : (hmmLabel === '弱势') ? '15%–30%' : (regime === '扩散') ? '50%–70%' : '30%–50%'
  const styleText = (hmmLabel === '强势' && regime === '扩散') ? '趋势跟随，优先超临界行业龙头，回踩 MA20 低吸' : (hmmLabel === '弱势' && regime === '分裂') ? '防守，红利/现金为主，不做弱势行业补涨' : (hmmLabel === '强势') ? '只做最强 2–3 个行业，降低非龙头暴露' : (regime === '扩散') ? '行业轮动低吸，买强不买弱' : '控制频率，等待状态与广度同时转强'
  const buyText = `HMM 当前状态概率 ≥ 60% 且非弱势；渗流最大簇/上涨 ≥ ${( (perc?.threshold ?? 0.5927) * 100).toFixed(1)}%；目标行业上涨占比 ≥ 60%；个股站上 MA20 且放量`
  const sellText = `HMM 弱势概率升至 30% 以上，或 渗流最大簇/上涨跌破 ${( (perc?.threshold ?? 0.5927) * 100).toFixed(1)}%，或个股跌破 MA20 / 近 20 日支撑`
  const priority = (perc?.industries ?? []).slice(0, 3)
  const targetPositionPct = stance === '进攻' ? 80 : stance === '均衡偏多' ? 62 : stance === '均衡偏防守' ? 45 : 25
  const stockPlans = (summary?.positions ?? []).map((p: any) => {
    const price = p.price ?? 0
    const weight = (p.weight ?? 0) / 100
    const target = Math.min(0.18, targetPositionPct / 100 / Math.max((summary?.positions ?? []).length, 1))
    let action = '持有'; let reason = '仓位与趋势匹配，继续观察'
    if (price <= 0) { action = '数据不足'; reason = '等待行情' }
    else if ((p.float_pct ?? 0) <= -15 && (p.pct ?? 0) < 0) { action = '止损'; reason = '浮亏超过 15% 且当日走弱，优先控制回撤' }
    else if (weight > 0.22) { action = '减仓'; reason = '单票权重超过 22%，集中度偏高' }
    else if (stance === '防守' && weight > 0.08) { action = '减仓'; reason = '模型处于防守状态，降低风险暴露' }
    else if (target - weight > 0.02 && (p.pct ?? 0) > -3 && stance !== '防守') { action = '加仓'; reason = '总仓位低于目标，个股未破位' }
    const deltaValue = (target - weight) * Math.max(summary?.total ?? 1, 1)
    const shares = price > 0 ? Math.round(Math.abs(deltaValue) / price / 100) * 100 : 0
    const signed = action === '减仓' || action === '止损' ? -shares : shares
    return { ...p, price, weight: weight * 100, action, reason, shares: signed, amount: Math.abs(signed * price), buy: `${fmt.price(price * 0.97)}–${fmt.price(price)}`, sell: `${fmt.price(price * 1.05)}–${fmt.price(price * 1.08)}`, stop: fmt.price(price * 0.92) }
  })

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div className="muted small">
          隐马尔可夫模型识别市场状态；渗流模型衡量上涨广度是否形成连通扩散。模型只描述当前结构，不预测点位。
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="muted small" style={{ fontFamily: 'monospace', fontSize: 9 }}>
            MODEL v{data?.model_meta?.registry_version ?? '2.0.0'} · {last ? `更新 ${last}` : '计算中'}
          </span>
          <button className="btn-ghost" style={{ fontSize: 10, padding: '5px 9px' }} onClick={load} disabled={refreshing}>
            {refreshing ? '计算中…' : '刷新'}
          </button>
        </div>
      </div>
      <div className="model-index-grid">
        {hmmList.map((h: any, i: number) => (
          <button key={h.code} className={i === sel ? 'active' : ''} onClick={() => setSel(i)}>
            <span>{h.name}</span>
            <b>{h.state}</b>
            <em>{(Math.max(...h.probabilities.map((p: any) => p.p)) * 100).toFixed(0)}%</em>
          </button>
        ))}
      </div>
      <div className="muted small" style={{ marginTop: 8, marginBottom: 12 }}>{data?.hmm_summary?.text ?? 'A 股核心指数 HMM 计算中…'}</div>

      {hmm && perc && (
      <div className="model-strategy">
        <div className="model-strategy-head">
          <div><span>组合策略</span><b>{stance}</b></div>
          <div><span>建议总仓位</span><b>{position}</b></div>
          <div><span>模型组合</span><b>{hmmLabel} × {regime}</b></div>
        </div>
        <div className="model-strategy-grid">
          <div><span>选股方向</span><p>{styleText}</p></div>
          <div><span>优先行业</span><p>{priority.map((x: any) => `${x.name}（${fmt.pct(x.ratio * 100)}）`).join(' · ') || '等待行业数据'}</p></div>
          <div><span>买入条件</span><p>{buyText}</p></div>
          <div><span>卖出/降仓条件</span><p>{sellText}</p></div>
        </div>
      </div>

      )}

      {stockPlans.length > 0 && (
        <Card title="个股仓位建议" desc={`结合持仓、HMM 状态与行业渗流 · 目标总仓位 ${targetPositionPct}%`}>
          <div className="stock-plan-list">
            {stockPlans.map((p: any) => (
              <div key={p.code} className="stock-plan">
                <div className="row-between">
                  <span><b>{p.name}</b> <span className="muted small mono">{p.code}</span></span>
                  <span><b className={p.action === '加仓' ? 'up' : p.action === '减仓' || p.action === '止损' ? 'down' : ''}>{p.action}</b> <b className="mono">{p.shares > 0 ? '+' : ''}{p.shares} 股</b></span>
                </div>
                <div className="row-between small" style={{ marginTop: 3 }}>
                  <span className="muted">现价 {fmt.price(p.price)} · 权重 {p.weight.toFixed(1)}% · 浮动 {fmt.pct(p.float_pct)}</span>
                  <span className="muted">买入 {p.buy} · 卖出 {p.sell} · 止损 {p.stop}</span>
                </div>
                <div className="muted small" style={{ marginTop: 2 }}>{p.reason}</div>
              </div>
            ))}
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>建议股数按 100 股取整；加仓/减仓金额合计约 ¥{fmt.money(stockPlans.reduce((s: number, p: any) => s + p.amount, 0))}。执行前核对现金与涨跌停限制。</div>
        </Card>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title={`隐马尔可夫 · ${hmm?.name ?? '市场状态'}`} desc="沪深300 日收益 · 3 状态高斯 HMM · Baum-Welch">
          {hmm ? (
            <>
              <div className="model-state" style={{ borderColor: STATE_COLORS[state] }}>
                <div>
                  <div className="muted small">当前状态</div>
                  <b style={{ color: STATE_COLORS[state] }}>{hmm.state}</b>
                </div>
                <div className="model-state-meta">
                  <span>预计持续 {hmm.expected_days} 天</span>
                  <span>下一状态 {hmm.next?.sort((a: any, b: any) => b.p - a.p)[0]?.label}</span>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                {hmm.probabilities?.map((p: any, i: number) => (
                  <div key={p.label} className="model-bar-row">
                    <span>{p.label}</span>
                    <div className="model-bar"><i style={{ width: `${p.p * 100}%`, background: STATE_COLORS[i] }} /></div>
                    <b>{(p.p * 100).toFixed(1)}%</b>
                  </div>
                ))}
              </div>
              <div className="model-timeline" title="最近 60 日状态">
                {hmm.history?.map((h: number, i: number) => <i key={i} style={{ background: STATE_COLORS[h] }} />)}
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>{hmm.signal}</div>
              <div className="model-explain">
                {(hmm.interpretation ?? []).map((line: string, i: number) => <div key={i}>· {line}</div>)}
              </div>
              <div className="model-fit">
                <span>对数似然 <b>{hmm.loglik}</b></span>
                <span>AIC <b>{hmm.aic}</b></span>
                <span>BIC <b>{hmm.bic}</b></span>
                <span>迭代 <b>{hmm.iterations}</b></span>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="muted small" style={{ marginBottom: 4 }}>状态转移矩阵</div>
                <div className="model-matrix">
                  <div />
                  {hmm.transition?.map((t: any, i: number) => <b key={i}>{STATE_TEXT[i]}</b>)}
                  {hmm.transition?.map((row: any, i: number) => (
                    <div key={i} className="model-matrix-row">
                      <b>{STATE_TEXT[i]}</b>
                      {row.to.map((v: number, j: number) => <span key={j}>{(v * 100).toFixed(1)}%</span>)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : <div className="muted small">模型计算中…</div>}
        </Card>

        <Card title="渗流模型 · 广度扩散" desc="上涨股票格点 · 4 邻接连通簇 · 阈值 0.5927">
          {perc ? (
            <>
              <div className="model-state" style={{ borderColor: perc.giant_occupied >= perc.threshold ? '#35D0A5' : '#F2C94C' }}>
                <div>
                  <div className="muted small">当前结构</div>
                  <b>{perc.status}</b>
                </div>
                <div className="model-state-meta">
                  <span>上涨占比 {fmt.pct(perc.ratio * 100)}</span>
                  <span>最大簇/上涨 {fmt.pct(perc.giant_occupied * 100)}</span>
                </div>
              </div>
              <div className="model-perc-grid" style={{ gridTemplateColumns: `repeat(${perc.grid.cols}, 1fr)` }}>
                {perc.grid.cells.map((c: number, i: number) => (
                  <i key={i} className={c === 2 ? 'giant' : c === 1 ? 'up' : 'down'} />
                ))}
              </div>
              <div className="model-threshold">
                <div><span>上涨占比</span><b>{fmt.pct(perc.ratio * 100)}</b></div>
                <div><span>最大簇 / 上涨</span><b>{fmt.pct(perc.giant_occupied * 100)}</b></div>
                <div><span>临界阈值</span><b>{(perc.threshold * 100).toFixed(1)}%</b></div>
              </div>
              <div className="grid-3" style={{ marginTop: 6 }}>
                <StatLine k="随机重排 最大簇均值" v={fmt.pct((perc.robustness?.mean ?? 0) * 100)} />
                <StatLine k="最小值" v={fmt.pct((perc.robustness?.min ?? 0) * 100)} />
                <StatLine k="最大值" v={fmt.pct((perc.robustness?.max ?? 0) * 100)} />
              </div>
              <div className="grid-2" style={{ marginTop: 10 }}>
                <Kpi label="上涨家数" value={`${perc.up} / ${perc.total}`} />
                <Kpi label="最大连通簇" value={`${perc.largest} 只`} color="var(--accent)" />
                <Kpi label="连通簇数量" value={`${perc.clusters} 个`} />
                <Kpi label="阈值" value={`${perc.threshold}`} />
              </div>
              <div className="muted small" style={{ marginTop: 8, lineHeight: 1.7 }}>{perc.note}</div>
            </>
          ) : <div className="muted small">模型计算中…</div>}
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="细分行业渗流" desc="按行业分组 · 上涨占比与最大连通簇 · Top 20">
          <div className="grid-2" style={{ gap: 0 }}>
            {(perc?.industries ?? []).map((x: any) => (
              <div key={x.name} className="ind-perc-row">
                <div><b>{x.name}</b><span>{x.count} 只</span></div>
                <div className="muted small">上涨 {fmt.pct(x.ratio * 100)} · 最大簇 {fmt.pct(x.giant_occupied * 100)} · {x.status}</div>
                <div className="muted small">领涨 {x.leader} <span className="up">{fmt.pct(x.leader_pct)}</span></div>
              </div>
            ))}
          </div>
          <div className="muted small" style={{ marginTop: 8, lineHeight: 1.7 }}>
            行业分组后股票数较少，临界值仅作为扩散强弱参考，不能与全市场格点直接比较；优先观察上涨占比与最大簇是否同向。
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="行业临界与关键标的" desc="广度接近/越过 59.27% 的细分行业与领涨公司">
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>
                {(perc?.critical ?? []).length ? `临界行业 ${perc.critical.length} 个` : '当前无正式临界行业，以下为最接近阈值的行业'}
              </div>
              {(perc?.critical?.length ? perc.critical : (perc?.closest ?? [])).slice(0, 6).map((x: any) => (
                <div key={x.name} className={`ind-critical ${x.critical ? 'on' : ''}`}>
                  <div className="row-between"><b>{x.name}</b><span className={x.critical ? 'up' : 'muted'}>{x.status}</span></div>
                  <div className="muted small">上涨 {fmt.pct(x.ratio * 100)} · 最大簇 {fmt.pct(x.giant_occupied * 100)} · 距阈值 {(x.breadth_distance * 100).toFixed(1)}pct</div>
                  <div className="small">关键标的：{(x.leaders ?? []).map((s: any) => `${s.name} ${fmt.pct(s.pct)}`).join(' · ')}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>关键标的 · 行业领涨</div>
              {(perc?.key_stocks ?? []).slice(0, 10).map((s: any) => (
                <div key={s.code} className="row-between" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span><b className="small">{s.name}</b> <span className="muted small">{s.industry}</span></span>
                  <b className={trendClass(s.pct)}>{fmt.pct(s.pct)}</b>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="策略映射 · HMM × 渗流" desc="把模型状态翻译为仓位、选股与买卖参考">
          <div className="model-map-grid">
            <div className="model-map-col">
              <b>HMM 市场状态</b>
              <span><b>强势</b>：趋势延续，可持有龙头；回踩 MA20 加仓，跌破减仓。</span>
              <span><b>震荡</b>：降低频率，区间下沿低吸、上沿兑现，不追突破。</span>
              <span><b>弱势</b>：控制仓位，反弹减仓，等待弱势概率下降。</span>
            </div>
            <div className="model-map-col">
              <b>渗流结构</b>
              <span><b>扩散</b>：上涨广度连通，可在超临界行业找龙头与补涨。</span>
              <span><b>临界</b>：方向未定，降低仓位，等待最大簇继续扩大或收缩。</span>
              <span><b>分裂</b>：上涨孤立，只做最强主线，避免扩散型追涨。</span>
            </div>
            <div className="model-map-col">
              <b>组合结论</b>
              <span><b>强势 + 扩散</b>：进攻，仓位 60%–80%，趋势龙头。</span>
              <span><b>强势/震荡 + 临界</b>：均衡，仓位 40%–60%，等确认。</span>
              <span><b>弱势 + 分裂</b>：防守，仓位 0%–20%，红利/现金。</span>
            </div>
          </div>
          <div className="model-checklist">
            <div><b>买入前检查</b><span>状态概率同向 · 行业广度 ≥ 60% · 最大簇未收缩 · 个股站上 MA20 · 成交额放大</span></div>
            <div><b>卖出前检查</b><span>弱势概率上升 · 最大簇跌破阈值 · 行业广度跌回 50% 下 · 个股跌破 MA20/支撑</span></div>
            <div><b>仓位纪律</b><span>单行业 ≤ 30%，单票 ≤ 15%；模型切换时先减仓再确认。</span></div>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="模型说明" desc="使用边界">
          <div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.9 }}>
            HMM 用日收益的三状态高斯隐马尔可夫模型识别市场所处状态，输出当前后验概率与状态转移；状态切换存在滞后，不能替代风控。策略使用时看“概率 + 方向”：强势概率持续高才加仓，弱势概率快速上升先降仓。
            渗流模型把上涨股票映射到二维格点并寻找最大连通簇，用于观察上涨广度是“扩散”还是“分裂”，阈值采用二维方格点渗流临界值 0.5927。选股上优先“行业广度 &gt; 60% 且最大簇未收缩”的行业；买点上要求个股与行业同向，卖点上以最大簇跌破阈值或个股跌破 MA20 为纪律。
            两者组合使用时，HMM 决定“总仓位”，渗流决定“选哪些行业与标的”；单一模型不应独立构成买卖依据。
            为什么选择“最大 4 邻接连通簇”：上涨家数只描述广度，最大簇衡量上涨是否连成一片，对应渗流理论的 giant component；簇越大说明扩散越真实，簇越小说明上涨越孤立。阈值 59.27% 是二维方格点渗流临界值，行业样本较小时仅用于相对比较。
          </div>
        </Card>
      </div>
    </div>
  )
}
