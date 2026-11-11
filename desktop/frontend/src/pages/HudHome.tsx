import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../ThemeContext'
import {
  AppstoreOutlined, BellOutlined, CalendarOutlined, ExperimentOutlined, FundOutlined,
  MailOutlined, PieChartOutlined, ProfileOutlined, SearchOutlined, SettingOutlined,
  StarOutlined, ThunderboltOutlined, FireOutlined, AimOutlined, EnvironmentOutlined, ReadOutlined, NodeIndexOutlined, LineChartOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { useAdmin } from '../admin'
import { fmt, trendClass } from '../utils'

const LEFT = [
  { key: '/daily', label: '每日策略', en: 'Daily Plan', icon: <CalendarOutlined /> },
  { key: '/screener', label: '板块跟踪', en: 'Sectors', icon: <FundOutlined /> },
  { key: '/analytics', label: '收益复盘', en: 'Review', icon: <PieChartOutlined /> },
]

const RIGHT = [
  { key: '/backtest', label: '策略回测', en: 'Backtest', icon: <ExperimentOutlined /> },
  { key: '/regions', label: '地域', en: 'Regions', icon: <EnvironmentOutlined /> },
  { key: '/industry-news', label: '行业要闻', en: 'Industry News', icon: <ReadOutlined /> },
  { key: '/models', label: '量化模型', en: 'Quant Models', icon: <NodeIndexOutlined /> },
  { key: '/kdj', label: 'KDJ预警', en: 'KDJ Alerts', icon: <LineChartOutlined /> },
]

const SEG_COLORS = ['#F2C94C', '#55D6C2', '#B08CFF', '#FF8A5C', '#6EA8FF', '#7D8B86']

export default function HudHome({ overview }: { overview: any }) {
  const { lang } = useTheme()
  const nav = useNavigate()
  const [summary, setSummary] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('stockdesk-summary-cache-v1') || 'null') } catch { return null }
  })
  const [state, setState] = useState<any>(null)
  const [hot, setHot] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const admin = useAdmin()
  const [now, setNow] = useState(new Date())
  const orbitRef = useRef<SVGSVGElement>(null)
  const scanRef = useRef<HTMLDivElement>(null)
  const pulseRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const loop = (t: number) => {
      const sec = (t - start) / 1000
      const deg = (sec * 26) % 360
      if (orbitRef.current) orbitRef.current.style.transform = `rotate(${deg}deg)`
      if (scanRef.current) scanRef.current.style.transform = `rotate(${deg * 1.4 + 30}deg)`
      const p = (Math.sin(sec * 2.6) + 1) / 2
      if (pulseRef.current) {
        pulseRef.current.style.opacity = String(0.16 + p * 0.42)
        pulseRef.current.style.transform = `scale(${1 + p * 0.025})`
      }
      if (dotRef.current) dotRef.current.style.opacity = String(0.35 + p * 0.65)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    setReady(true)
    const repaint = () => {
      const el = document.querySelector('.hud-console') as HTMLElement | null
      if (!el) return
      el.style.transform = 'translateZ(0)'
      el.style.opacity = '0.999'
      requestAnimationFrame(() => { el.style.opacity = '1' })
      window.dispatchEvent(new Event('resize'))
    }
    const timers = [120, 600, 1500].map((ms) => setTimeout(repaint, ms))
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    api.get<any>('/api/portfolio/summary').then((s) => {
      if (!s) return
      setSummary((prev: any) => {
        if ((s.total ?? 0) === 0 && (prev?.total ?? 0) > 0) return prev
        try { localStorage.setItem('stockdesk-summary-cache-v1', JSON.stringify(s)) } catch { /* ignore */ }
        return s
      })
    }).catch(() => {}).finally(() => {
      // load heavy market panels only after the account snapshot is painted
      api.get<any>('/api/market/state').then(setState).catch(() => {})
      api.get<any>('/api/market/hot').then(setHot).catch(() => {})
    })
  }, [])

  const todayPnl = (summary?.positions ?? []).reduce((a: number, p: any) => a + (p.today_pnl ?? 0), 0)
  const positions = summary?.positions ?? []
  const assetLevel = Math.max(1, String(Math.floor(Math.max(0, summary?.cash ?? 0))).length)
  const temp = state?.score ?? 0
  const tempColor = temp >= 58 ? 'var(--up)' : temp >= 42 ? 'var(--amber)' : 'var(--down)'

  const dots = useMemo(() => {
    const total = Math.max(summary?.total ?? 1, 1)
    let a = 0
    return positions.slice(0, 6).map((p: any, i: number) => {
      const w = (p.weight ?? 0) / 100
      const mid = a + w / 2
      a += w
      const angle = mid * Math.PI * 2 - Math.PI / 2
      const r = 205
      return { x: 300 + Math.cos(angle) * r, y: 300 + Math.sin(angle) * r, color: SEG_COLORS[i % SEG_COLORS.length] }
    })
  }, [summary])

  return (
    <div className={`hud-console ${ready ? 'ready' : ''}`}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="hudSilver" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3f3f3" />
            <stop offset="0.45" stopColor="#cfcfcf" />
            <stop offset="1" stopColor="#9d9d9d" />
          </linearGradient>
          <linearGradient id="hudGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe98c" />
            <stop offset="0.5" stopColor="#e2c34a" />
            <stop offset="1" stopColor="#a88612" />
          </linearGradient>
        </defs>
      </svg>
      <div className="hud-top-icons">
        <button onClick={() => nav('/settings')}><SettingOutlined /></button>
        <button onClick={() => nav('/anomalies')}><BellOutlined /></button>
        <button onClick={() => nav('/notes')}><MailOutlined /></button>
        <button onClick={() => nav('/watchlist')}><StarOutlined /></button>
        <button onClick={() => nav('/screener')}><SearchOutlined /></button>
      </div>

      <div className="hud-console-grid">
        <aside className="hud-left-stack">
          {LEFT.map((m, i) => (
            <button key={m.label} className={`hud-silver ${m.key === '/' && i === 0 ? 'active' : ''}`} onClick={() => nav(m.key)}>
              <svg className="hud-btn-shape" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M6 0 H100 Q96 50 100 100 H0 Z" fill={m.key === '/' && i === 0 ? '#b99a1f' : '#c7c7c7'} stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
                <path d="M6 0 H100 Q96 50 100 100 H0 Z" fill={m.key === '/' && i === 0 ? 'url(#hudGold)' : 'url(#hudSilver)'} />
              </svg>
              <span className="hud-silver-icon">{m.icon}</span>
              <span>{lang === 'en' ? m.en : m.label}</span>
            </button>
          ))}
          <div className="hud-profile">
        <div className="hud-avatar">S</div>
        <div className="hud-profile-main">
          <div className="hud-profile-name">{admin.name} <span>{lang === 'en' ? 'Administrator' : '管理员'}</span></div>
          <div className="hud-profile-id">UID: {admin.uid} · {lang === 'en' ? 'Asset level' : '资产等级'} {assetLevel}</div>
          <div className="hud-profile-bar"><i style={{ width: '62%' }} /></div>
          <div className="hud-profile-foot"><span>{lang === 'en' ? 'Total assets' : '总资产'} ¥{fmt.money(summary?.total)}</span><b className={trendClass(summary?.total_pct)}>{fmt.pct(summary?.total_pct)}</b></div>
        </div>
      </div>

        </aside>

        <section className="hud-core">
          <div className="hud-disc" onClick={() => nav('/portfolio')} style={{ cursor: 'pointer' }}>
            <div ref={pulseRef} className="hud-pulse" />
            <svg ref={orbitRef} className="hud-orbit" viewBox="0 0 600 600">
              <circle cx="300" cy="300" r="292" fill="none" stroke="rgba(242,201,76,0.65)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="110 1400" />
              <circle cx="300" cy="300" r="284" fill="none" stroke="rgba(242,201,76,0.22)" strokeWidth="1" strokeDasharray="2 14" />
            </svg>
            <svg className="hud-map" viewBox="0 0 600 600">
              <circle cx="300" cy="300" r="284" fill="#0a0f0e" stroke="#30362f" strokeWidth="2" />
              <g fill="#232a22" stroke="#3a4136" strokeWidth="1.2">
                <path d="M118 180 L210 145 L268 180 L250 260 L165 275 Z" />
                <path d="M312 108 L420 130 L445 205 L380 250 L315 205 Z" />
                <path d="M110 330 L190 300 L270 340 L245 430 L155 455 L105 400 Z" />
                <path d="M330 320 L415 290 L480 350 L455 445 L360 460 L310 405 Z" />
                <path d="M270 200 L360 190 L390 265 L325 295 L265 270 Z" />
              </g>
              <g fill="#b8a63c" fillOpacity="0.82" stroke="#e2cf58" strokeWidth="1.5">
                <path d="M205 235 L285 210 L345 245 L330 320 L250 335 L200 295 Z" />
                <path d="M250 335 L330 320 L370 375 L320 425 L245 405 Z" />
              </g>
              <g stroke="#76774a" strokeWidth="1.4" fill="none" opacity="0.75">
                <path d="M155 275 L250 260 L325 295 L330 320" />
                <path d="M190 300 L250 335 L245 405" />
                <path d="M330 320 L380 250 M330 320 L415 290" />
                <path d="M205 235 L270 200 M285 210 L312 108" />
              </g>
              <g fill="#e2cf58">
                <circle cx="250" cy="335" r="4" />
                <circle cx="330" cy="320" r="4" />
              </g>
              <circle cx="300" cy="300" r="240" fill="none" stroke="#3b4237" strokeDasharray="2 7" opacity="0.7" />
              <circle cx="300" cy="300" r="160" fill="none" stroke="#3b4237" strokeDasharray="1 9" opacity="0.5" />
            </svg>
            <div ref={scanRef} className="hud-disc-scan" />
            <div className="hud-disc-ticks">
              {Array.from({ length: 48 }).map((_, i) => <i key={i} style={{ transform: `rotate(${i * 7.5}deg)` }} />)}
            </div>
            {dots.map((d: any, i: number) => (
              <span key={i} className="hud-disc-dot" style={{ left: `${(d.x / 600) * 100}%`, top: `${(d.y / 600) * 100}%`, background: d.color }} />
            ))}
            <div className="hud-center-tag">
              <div>{lang === 'en' ? 'ASSET HUB' : '资产中枢'}</div>
              <span><i ref={dotRef} /> {lang === 'en' ? 'RUNNING · ACTIVE' : '运行中 · ACTIVE'}</span>
            </div>
          </div>

          <div className="hud-powerbar">
            <button className="hud-power" onClick={() => nav('/daily')}><ThunderboltOutlined /></button>
            <div className="hud-power-meta">
              <span>今日盈亏</span>
              <b className={trendClass(todayPnl)}>{fmt.money(todayPnl)}</b>
            </div>
            <div className="hud-power-meta">
              <span>仓位</span>
              <b>{((summary?.market_value ?? 0) / Math.max(summary?.total ?? 1, 1) * 100).toFixed(1)}%</b>
            </div>
            <div className="hud-power-meta">
              <span>市场温度</span>
              <b style={{ color: tempColor }}>{temp}</b>
            </div>
          </div>
        </section>

        <aside className="hud-right-grid">
          {RIGHT.map((m) => (
            <button key={m.label} className="hud-silver small" onClick={() => nav(m.key)}>
              <svg className="hud-btn-shape" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M0 0 H94 L100 100 H0 Q4 50 0 0 Z" fill="#c7c7c7" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
                <path d="M0 0 H94 L100 100 H0 Q4 50 0 0 Z" fill="url(#hudSilver)" />
              </svg>
              <span className="hud-silver-icon">{m.icon}</span>
              <span>{lang === 'en' ? m.en : m.label}</span>
            </button>
          ))}
        </aside>
      </div>

      <div className="hud-console-bottom">
        <span className="hud-live"><i /> LIVE</span>
        <span>{lang === 'en' ? 'SSE' : '上证'} {fmt.price(overview?.indices?.[0]?.price)} {fmt.pct(overview?.indices?.[0]?.pct)}</span>
        <span>{lang === 'en' ? 'Up' : '涨'} {state?.breadth?.up ?? '--'} / {lang === 'en' ? 'Down' : '跌'} {state?.breadth?.down ?? '--'}</span>
        <span>{lang === 'en' ? 'Turnover' : '成交额'} {fmt.big(state?.turnover)}</span>
        <span className="hud-spacer" />
        <span>{lang === 'en' ? 'Net inflow' : '主力净流入'} {hot?.inflow?.[0]?.name ?? '--'} {fmt.big(hot?.inflow?.[0]?.inflow)}</span>
        <span>{lang === 'en' ? 'Now' : '当前'} {now.toLocaleTimeString('zh-CN', { hour12: false })}</span>
        <span>{lang === 'en' ? 'Data' : '数据'} {hot?.updated ? new Date(hot.updated * 1000).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--'}</span>
        <span className="hud-version">COMMAND DECK · v1.10.2</span>
      </div>
    </div>
  )
}
