import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Spin } from 'antd'
import { ReloadOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card } from './ui'

/**
 * 共享的本地 Ollama 辅助判断卡片。
 *
 * 行为约束：
 * - 挂载只读 config + cached_only 缓存，绝不自动生成。
 * - 只有用户点「生成判断」/「重新生成」才会 force=true，耗时 20–60 秒。
 * - 字段缺失一律显示 --，解析失败时展示原文，不白屏。
 */

interface OllamaConfig {
  enabled: boolean
  host: string
  model: string
  temperature?: number
  timeout?: number
  num_predict?: number
}

interface OllamaAdviceBody {
  stance?: string
  position?: string
  horizon?: string
  confidence?: number
  summary?: string
  bullets?: string[]
  risks?: string[]
  actions?: string[]
  watch?: string[]
  parse_error?: boolean | string
}

interface OllamaContext {
  as_of?: string
  score?: number
  verdict?: string
  hmm?: string
  percolation?: string
  position_pct?: number
}

interface OllamaResult {
  enabled?: boolean
  host?: string
  model?: string
  generated_at?: number | null
  latency_ms?: number | null
  cached?: boolean
  available?: boolean
  error?: string
  needs_generate?: boolean
  advice?: OllamaAdviceBody | null
  baseline?: OllamaAdviceBody | null
  context?: OllamaContext | null
  raw?: string
}

interface Props {
  compact?: boolean
  title?: string
}

function finite(v: unknown): number | null {
  if (v === null || v === undefined || typeof v === 'boolean' || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function cleanText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function textList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => cleanText(x)).filter(Boolean) : []
}

function stanceText(v: unknown): string {
  return cleanText(v) || '--'
}

function stanceColor(v: string): string {
  if (!v || v === '--') return 'var(--text-sub)'
  if (v.includes('进攻') || v.includes('偏多')) return 'var(--up)'
  if (v.includes('防守')) return 'var(--down)'
  return 'var(--amber)'
}

function confidenceText(v: unknown): string {
  const n = finite(v)
  if (n === null) return '--'
  const pct = n > 0 && n <= 1 ? n * 100 : n
  return `${Math.round(pct)}%`
}

function ratioText(v: unknown, digits = 1): string {
  const n = finite(v)
  if (n === null) return '--'
  return `${(n * 100).toFixed(digits)}%`
}

function latencyText(v: unknown): string {
  const n = finite(v)
  if (n === null || n < 0) return ''
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} 秒`
}

function generatedText(v: unknown): string {
  const n = finite(v)
  if (n === null || n <= 0) return ''
  const d = new Date(n * 1000)
  if (Number.isNaN(d.getTime())) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function errorText(e: unknown): string {
  const message = (e as { message?: unknown } | null)?.message
  return typeof message === 'string' && message.trim() ? message : '请求失败，请检查后端是否在运行。'
}

export default function OllamaAdvice({ compact = false, title = '本地模型辅助判断' }: Props) {
  const [config, setConfig] = useState<OllamaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [configError, setConfigError] = useState('')
  const [result, setResult] = useState<OllamaResult | null>(null)
  const [loadError, setLoadError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  // 挂载只取配置与缓存；不会触发模型生成。
  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setConfigError('')
      setLoadError('')
      let cfg: OllamaConfig
      try {
        cfg = await api.get<OllamaConfig>('/api/ollama/config')
      } catch (e) {
        if (!alive) return
        setConfigError(errorText(e))
        setLoading(false)
        return
      }
      if (!alive) return
      setConfig(cfg)
      if (!cfg.enabled) {
        setLoading(false)
        return
      }
      try {
        const cached = await api.post<OllamaResult>('/api/ollama/advice?cached_only=1')
        if (!alive) return
        setResult(cached)
      } catch (e) {
        if (!alive) return
        setLoadError(errorText(e))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [reloadKey])

  useEffect(() => {
    if (!generating) return
    const started = Date.now()
    setElapsed(0)
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [generating])

  const reload = () => setReloadKey((k) => k + 1)

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    setElapsed(0)
    setLoadError('')
    try {
      const fresh = await api.post<OllamaResult>('/api/ollama/advice?force=true')
      setResult(fresh)
      if (fresh && fresh.available === false) {
        setLoadError(fresh.error || '模型这次没有给出可用判断。')
      }
    } catch (e) {
      setLoadError(errorText(e))
    } finally {
      setGenerating(false)
    }
  }

  const advice = result?.advice ?? null
  const baseline = result?.baseline ?? null
  const stance = stanceText(advice?.stance)
  const position = cleanText(advice?.position) || cleanText(baseline?.position) || '--'
  const horizon = cleanText(advice?.horizon)
  const confidence = confidenceText(advice?.confidence)
  const summary = cleanText(advice?.summary)
  const bullets = textList(advice?.bullets)
  const risks = textList(advice?.risks)
  const actions = textList(advice?.actions)
  const watch = textList(advice?.watch)
  const parseFailed = Boolean(advice?.parse_error)
  const raw = typeof result?.raw === 'string' ? result.raw : ''
  const rawShown = raw.length > 2400 ? `${raw.slice(0, 2400)}\n…` : raw
  const latency = latencyText(result?.latency_ms)
  const generated = generatedText(result?.generated_at)
  const ctx = result?.context
  const available = Boolean(result?.available && (advice || raw))
  const waiting = generating

  const extra =
    config?.enabled && !loading ? (
      result?.available ? (
        <Button size="small" icon={<ReloadOutlined />} loading={generating} onClick={generate}>
          重新生成
        </Button>
      ) : (
        <Button size="small" type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={generate}>
          生成判断
        </Button>
      )
    ) : null

  return (
    <Card
      title={title}
      desc={compact ? '本机模型 · 只发聚合数据' : '本机 Ollama · 只发市场聚合、模型结论与持仓汇总'}
      extra={extra}
      className={`ollama-card${compact ? ' ollama-compact' : ''}`}
    >
      {loading ? (
        <div className="ollama-loading">
          <Spin size="small" />
          <span>读取 Ollama 配置和缓存…</span>
        </div>
      ) : null}

      {!loading && configError ? (
        <div className="ollama-error">
          <div>
            <b>读不到 Ollama 配置</b>
            <span>{configError}</span>
          </div>
          <Button size="small" onClick={reload}>
            重试
          </Button>
        </div>
      ) : null}

      {!loading && !configError && config && !config.enabled ? (
        <div className="ollama-off">
          <div>
            <b>未启用</b>
            <span>到设置里打开「启用 Ollama 辅助判断」。只把市场聚合数据、模型结论和持仓汇总发给本机，不上传交易备注。</span>
          </div>
          <Link to="/settings">
            <Button size="small" icon={<SettingOutlined />}>
              去设置
            </Button>
          </Link>
        </div>
      ) : null}

      {waiting ? (
        <div className="ollama-wait">
          <Spin size="small" />
          <div>
            <b>本地模型思考中，约 30–60 秒</b>
            <span>
              已等待 {elapsed} 秒 · {config?.model ?? '本地模型'} 正在读取当前聚合数据，页面不用刷新。
            </span>
          </div>
        </div>
      ) : null}

      {!loading && !configError && config?.enabled ? (
        <>
          {loadError && !available ? (
            <div className="ollama-error">
              <div>
                <b>这次没拿到判断</b>
                <span>{loadError}</span>
              </div>
              <div className="ollama-error-actions">
                <Button size="small" type="primary" loading={generating} onClick={generate}>
                  重试生成
                </Button>
                <Button size="small" onClick={reload}>
                  重新读取
                </Button>
              </div>
            </div>
          ) : null}

          {!result && !loadError && !loading ? (
            <div className="ollama-empty">
              <div>
                <b>还没有生成过判断</b>
                <span>本地模型第一次生成约 30–60 秒。只发聚合数据和模型结论，点一次就好。</span>
              </div>
              <Button size="small" type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={generate}>
                生成判断
              </Button>
            </div>
          ) : null}

          {result && !result.available ? (
            result.needs_generate ? (
              <div className="ollama-empty">
                <div>
                  <b>还没有生成过判断</b>
                  <span>{result.error || '点「生成判断」让本地模型跑一次，约 30–60 秒。'}</span>
                </div>
                <Button size="small" type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={generate}>
                  生成判断
                </Button>
              </div>
            ) : loadError ? null : (
              <div className="ollama-error">
                <div>
                  <b>这次没拿到判断</b>
                  <span>{result.error || 'Ollama 没有返回可用结果。'}</span>
                </div>
                <div className="ollama-error-actions">
                  <Button size="small" type="primary" loading={generating} onClick={generate}>
                    生成判断
                  </Button>
                  <Button size="small" onClick={reload}>
                    重新读取
                  </Button>
                </div>
              </div>
            )
          ) : null}

          {result?.available && advice ? (
            <>
              <div className="ollama-head">
                <div className="ollama-head-main">
                  <span className="ollama-kicker">{result.cached ? '缓存判断' : '本次判断'}</span>
                  <div className="ollama-stance" style={{ color: stanceColor(stance) }}>
                    {stance}
                  </div>
                  <div className="ollama-meta">
                    <span>
                      仓位 <b>{position}</b>
                    </span>
                    <span>
                      置信度 <b>{confidence}</b>
                    </span>
                    {horizon ? (
                      <span>
                        周期 <b>{horizon}</b>
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="ollama-badges">
                  {result.cached ? <span className="ollama-badge">缓存</span> : <span className="ollama-badge fresh">刚生成</span>}
                  <span>{result.model || config.model || '--'}</span>
                  {latency ? <span>耗时 {latency}</span> : null}
                  {generated ? <span>{generated}</span> : null}
                </div>
              </div>

              {ctx ? (
                <div className="ollama-context">
                  <span>基准 {cleanText(ctx.as_of) || '--'}</span>
                  <span>市场温度 {finite(ctx.score) !== null ? Math.round(Number(ctx.score)) : '--'}</span>
                  <span>结论 {cleanText(ctx.verdict) || '--'}</span>
                  <span>HMM {cleanText(ctx.hmm) || '--'}</span>
                  <span>广度 {cleanText(ctx.percolation) || '--'}</span>
                  <span>当前仓位 {ratioText(ctx.position_pct)}</span>
                </div>
              ) : null}

              {loadError ? (
                <div className="ollama-inline-error">
                  生成失败：{loadError}。下面仍是上一次的缓存判断。
                </div>
              ) : null}

              {parseFailed ? (
                <div className="ollama-parse">
                  <b>模型没有按 JSON 返回，以下为原文</b>
                  {rawShown ? <pre className="ollama-raw">{rawShown}</pre> : <span className="muted small">没有拿到可读原文。</span>}
                </div>
              ) : null}

              {summary ? <p className="ollama-summary">{summary}</p> : <p className="ollama-summary muted">模型没有给出摘要。</p>}

              <div className="ollama-block">
                <div className="ollama-block-title">依据</div>
                {bullets.length ? (
                  <ul className="ollama-bullets">
                    {bullets.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="ollama-none">模型没有列出依据。</div>
                )}
              </div>

              <div className="ollama-columns">
                <div className="ollama-block ollama-risks">
                  <div className="ollama-block-title">风险</div>
                  {risks.length ? (
                    <ul>
                      {risks.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="ollama-none">这次没有列出风险。</div>
                  )}
                </div>
                <div className="ollama-block ollama-actions">
                  <div className="ollama-block-title">可执行</div>
                  {actions.length ? (
                    <ol>
                      {actions.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  ) : (
                    <div className="ollama-none">这次没有给出动作。</div>
                  )}
                </div>
              </div>

              <div className="ollama-watch">
                <span className="ollama-block-title">盯这些</span>
                {watch.length ? (
                  watch.map((item, i) => (
                    <span key={`${item}-${i}`} className="ollama-watch-chip">
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="ollama-none">这次没有点出具体标的。</span>
                )}
              </div>

              <div className="ollama-note">这是本机 Ollama 基于当前数据的辅助判断，不是投资建议。</div>
            </>
          ) : null}

          {result?.available && !advice && raw ? (
            <div className="ollama-parse">
              <b>模型没有按 JSON 返回，以下为原文</b>
              <pre className="ollama-raw">{rawShown}</pre>
              <div className="ollama-note">这是本机 Ollama 基于当前数据的辅助判断，不是投资建议。</div>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}
