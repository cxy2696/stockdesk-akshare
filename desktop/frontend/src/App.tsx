import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  AppstoreOutlined,
  CalendarOutlined,
  ExperimentOutlined,
  FundOutlined,
  LineChartOutlined,
  PieChartOutlined,
  ProfileOutlined,
  SettingOutlined,
  StarOutlined,
  SyncOutlined,
  MoonOutlined,
  SunOutlined,
  ThunderboltOutlined,
  ArrowLeftOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'
import StockSearch from './components/StockSearch'
import { api } from './api'
import { fmt, trendClass } from './utils'
import { useTheme } from './ThemeContext'
import { sharePageImage } from './share'
import Dashboard from './pages/Dashboard'
import Watchlist from './pages/Watchlist'
import StockDetail from './pages/StockDetail'
import Portfolio from './pages/Portfolio'
import Analytics from './pages/Analytics'
import Backtest from './pages/Backtest'
import MarketBoard from './pages/MarketBoard'
import Daily from './pages/Daily'
import SettingsPage from './pages/Settings'
import Guide from './pages/Guide'
import Notes from './pages/Notes'
import Anomalies from './pages/Anomalies'
import AssetAnalysis from './pages/AssetAnalysis'
import AdviceCenter from './pages/AdviceCenter'
import IndexAnalysis from './pages/IndexAnalysis'
import HubMap from './pages/HubMap'
import Regions from './pages/Regions'
import IndustryNews from './pages/IndustryNews'
import Models from './pages/Models'

const EN_NAV: Record<string, { label: string; title: string; sub: string }> = {
  '/': { label: 'Overview', title: 'Investment Overview', sub: 'Assets, holdings and today\'s market' },
  '/daily': { label: 'Daily Plan', title: 'Daily Plan', sub: 'Market · position sizing · candidates' },
  '/watchlist': { label: 'Watchlist', title: 'Watchlist', sub: 'Symbols you follow' },
  '/portfolio': { label: 'Portfolio', title: 'Portfolio', sub: 'Trades · cost · P&L' },
  '/analytics': { label: 'Review', title: 'Performance Review', sub: 'NAV · drawdown · statistics' },
  '/backtest': { label: 'Backtest', title: 'Strategy Backtest', sub: 'Test rules on historical data' },
  '/screener': { label: 'Sectors', title: 'Sector Tracker', sub: 'Boards · mood · heatmap' },
}

const NAV = [
  { key: '/', label: '总览', icon: <AppstoreOutlined />, title: '投资总览', sub: '资产、持仓与今日市场' },
  { key: '/daily', label: '每日策略', icon: <CalendarOutlined />, title: '每日策略', sub: '每日行情 · 仓位建议 · 标的推荐' },
  { key: '/watchlist', label: '自选行情', icon: <StarOutlined />, title: '自选行情', sub: '关注的标的与分时走势' },
  { key: '/portfolio', label: '持仓账簿', icon: <ProfileOutlined />, title: '持仓账簿', sub: '交易流水 · 成本 · 盈亏' },
  { key: '/analytics', label: '收益复盘', icon: <PieChartOutlined />, title: '收益复盘', sub: '净值曲线 · 回撤 · 交易统计' },
  { key: '/backtest', label: '策略回测', icon: <ExperimentOutlined />, title: '策略回测', sub: '用历史数据检验交易规则' },
  { key: '/screener', label: '板块跟踪', icon: <FundOutlined />, title: '板块跟踪', sub: '板块 · 市场情绪 · 个股热图' },
]

export default function App() {
  const loc = useLocation()
  const navigate = useNavigate()
  const { mode, toggle, scale, lang, toggleLang } = useTheme()
  const [overview, setOverview] = useState<any>(null)
  const [updated, setUpdated] = useState('')
  const [spin, setSpin] = useState(false)

  const load = async () => {
    try {
      setSpin(true)
      const data = await api.get<any>('/api/market/overview')
      setOverview(data)
      setUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    } catch {
      /* keep last */
    } finally {
      setSpin(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const meta = useMemo(() => {
    if (lang === 'en') {
      if (loc.pathname.startsWith('/stock/')) return { title: 'Stock Detail', sub: 'Quote · flows · fundamentals' }
      if (loc.pathname === '/settings') return { title: 'Settings', sub: 'Assets · data and cache' }
      if (loc.pathname === '/regions' || loc.pathname === '/hub-map') return { title: 'Regions', sub: 'China listed-company map · analysis' }
      if (loc.pathname === '/index-analysis') return { title: 'Index Analysis', sub: 'A-share and global indices' }
      if (loc.pathname === '/models') return { title: 'Quant Models', sub: 'HMM · percolation · position plans' }
      if (loc.pathname === '/industry-news') return { title: 'Industry News', sub: 'Sector headlines and key names' }
      return EN_NAV[loc.pathname] ?? { title: 'StockDesk', sub: '' }
    }
    if (loc.pathname.startsWith('/stock/')) return { title: '个股详情', sub: '行情 · 筹码 · 财务' }
    if (loc.pathname === '/settings') return { title: '设置', sub: '账户资产 · 数据与缓存' }
    if (loc.pathname === '/regions' || loc.pathname === '/hub-map') return { title: '地域', sub: '中国上市公司分布 · 资产分析 · 投资建议 · 指数分析' }
    if (loc.pathname === '/index-analysis') return { title: '指数分析', sub: 'A股主要宽基 · 海外指数 · 建议结论' }
    return NAV.find((n) => n.key === loc.pathname) ?? { title: 'StockDesk', sub: '' }
  }, [loc.pathname, lang])

  const breadth = overview?.breadth
  const status = overview?.status

  return (
    <div className={`shell hud-mode font-scale-${Math.round(scale * 100)}`}>
      <aside className="sider">
        <div className="brand">
          <div className="brand-logo">S</div>
          <div>
            <div className="brand-title">StockDesk</div>
            <div className="brand-sub">PERSONAL INVESTING</div>
          </div>
        </div>

        <div className="nav-group-label">{lang === 'en' ? 'WORKSPACE' : '工作台'}</div>
        {NAV.map((n) => (
          <Link key={n.key} to={n.key} className={`nav-item ${loc.pathname === n.key ? 'active' : ''}`}>
            {n.icon}
            <span>{lang === 'en' ? EN_NAV[n.key]?.label ?? n.label : n.label}</span>
          </Link>
        ))}

        <div className="nav-group-label">工具</div>
        <Tooltip title="布局与数据设置" placement="right">
          <Link to="/settings" className={`nav-item ${loc.pathname === '/settings' ? 'active' : ''}`}>
            <SettingOutlined />
            <span>设置</span>
          </Link>
        </Tooltip>

        <div className="sider-foot">
          <div>
            <span className={`status-dot ${status?.open ? '' : 'closed'}`} />
            {status?.label ?? '加载中'} {status?.now && <span className="mono">{status.now}</span>}
          </div>
          <div style={{ marginTop: 4 }}>
            数据源 东方财富 · 本地缓存
          </div>
          <div style={{ marginTop: 4 }}>
            <SyncOutlined spin={spin} /> 刷新 {updated || '--'}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          {loc.pathname !== '/' && (
            <button className="hud-back" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/') }} aria-label="返回">
              <ArrowLeftOutlined />
            </button>
          )}
          <div className="page-head">
            <div className="page-title">{meta.title}</div>
            <div className="page-sub">{meta.sub}</div>
          </div>
          <div className="ticker-strip">
            {(overview?.indices ?? []).map((i: any) => (
              <div className="ticker" key={i.code}>
                {i.short !== '上证' && <span className="ticker-name">{i.short}</span>}
                <span className={`ticker-val num ${trendClass(i.pct)}`}>{fmt.price(i.price)}</span>
                <span className={`num small ${trendClass(i.pct)}`}>{fmt.pct(i.pct)}</span>
              </div>
            ))}
            {breadth && (
              <div className="ticker" title="上涨 / 下跌家数" style={{ borderLeft: '1px solid var(--border)', marginLeft: 4, paddingLeft: 9 }}>
                <span className="ticker-val num up">{breadth.up}</span>
                <span className="muted">/</span>
                <span className="ticker-val num down">{breadth.down}</span>
              </div>
            )}
          </div>
          <StockSearch width={210} placeholder={lang === 'en' ? 'Search symbol ⌘K' : '搜索股票 ⌘K'} />
          <button className="share-page" onClick={toggleLang} title={lang === 'en' ? '切换中文' : 'Switch to English'} aria-label="Language">
            {lang === 'en' ? '中' : 'EN'}
          </button>
          {loc.pathname !== '/' && (
            <Tooltip title="分享当前界面为图片">
              <button className="share-page" onClick={sharePageImage} aria-label="分享当前界面">
                <ShareAltOutlined />
              </button>
            </Tooltip>
          )}
          <Tooltip title="切换主题：指挥舱 / 明亮 / 深色">
            <button className="theme-toggle" onClick={toggle} aria-label="切换主题">
              {mode === 'hud' ? <ThunderboltOutlined /> : mode === 'light' ? <MoonOutlined /> : <SunOutlined />}
            </button>
          </Tooltip>
        </header>

        <main className="content">
          <div className="page-enter" key={loc.pathname}>
            <Routes>
              <Route path="/" element={<Dashboard overview={overview} />} />
              <Route path="/daily" element={<Daily />} />
        <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/stock/:code" element={<StockDetail />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/backtest" element={<Backtest />} />
              <Route path="/screener" element={<MarketBoard />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/anomalies" element={<Anomalies />} />
              <Route path="/asset-analysis" element={<AssetAnalysis />} />
              <Route path="/advice-center" element={<AdviceCenter />} />
              <Route path="/index-analysis" element={<IndexAnalysis />} />
              <Route path="/hub-map" element={<Navigate to="/regions" replace />} />
              <Route path="/regions" element={<HubMap />} />
              <Route path="/industry-news" element={<IndustryNews />} />
              <Route path="/models" element={<Models />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}
