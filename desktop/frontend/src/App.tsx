import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  AppstoreOutlined,
  CalendarOutlined,
  CompassOutlined,
  ExperimentOutlined,
  FilterOutlined,
  FundOutlined,
  HomeOutlined,
  ReadOutlined,
  LineChartOutlined,
  PieChartOutlined,
  ProfileOutlined,
  RadarChartOutlined,
  SettingOutlined,
  StarOutlined,
  SyncOutlined,
  MoonOutlined,
  SunOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  NodeIndexOutlined,
  ArrowLeftOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'
import StockSearch from './components/StockSearch'
import { api } from './api'
import { fmt, trendClass } from './utils'
import { useTheme } from './ThemeContext'
import { sharePageImage } from './share'
import Decision from './pages/Decision'
import Forecast from './pages/Forecast'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const StockDetail = lazy(() => import('./pages/StockDetail'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Backtest = lazy(() => import('./pages/Backtest'))
const Factors = lazy(() => import('./pages/Factors'))
const MarketBoard = lazy(() => import('./pages/MarketBoard'))
const Daily = lazy(() => import('./pages/Daily'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Guide = lazy(() => import('./pages/Guide'))
const Notes = lazy(() => import('./pages/Notes'))
const Anomalies = lazy(() => import('./pages/Anomalies'))
const IndexAnalysis = lazy(() => import('./pages/IndexAnalysis'))
const HubMap = lazy(() => import('./pages/HubMap'))
const Models = lazy(() => import('./pages/Models'))
const Evaluation = lazy(() => import('./pages/Evaluation'))
const Research = lazy(() => import('./pages/Research'))

const UI_VERSION = __APP_VERSION__

const EN_NAV: Record<string, { label: string; title: string; sub: string }> = {
  '/': { label: 'Overview', title: 'Investment Overview', sub: 'Assets, holdings and today\'s market' },
  '/daily': { label: 'Daily Plan', title: 'Daily Plan', sub: 'Market · position sizing · candidates' },
  '/decision': { label: 'Decision', title: 'Trade Decision', sub: 'Buy zone · stop · target · rating' },
  '/forecast': { label: 'Forecast', title: 'Market Forecast', sub: '5-day regime-conditional outlook' },
  '/evaluation': { label: 'Evaluation', title: 'Model Evaluation', sub: 'Walk-forward hit rate and equity' },
  '/research': { label: 'Research', title: 'Research', sub: 'Models · factors · sectors · index · regions' },
  '/watchlist': { label: 'Watchlist', title: 'Watchlist', sub: 'Symbols you follow' },
  '/portfolio': { label: 'Portfolio', title: 'Portfolio', sub: 'Positions · analysis · advice · trades' },
  '/analytics': { label: 'Review', title: 'Performance Review', sub: 'NAV · drawdown · statistics' },
  '/backtest': { label: 'Backtest', title: 'Strategy Backtest', sub: 'Test rules on historical data' },
  '/factors': { label: 'Factors', title: 'Factor Screen', sub: 'Factor classification · cross-sectional screen' },
  '/screener': { label: 'Sectors', title: 'Sector Tracker', sub: 'Boards · mood · heatmap' },
}

const NAV_CORE = [
  { key: '/', label: '总览', icon: <HomeOutlined />, title: '投资总览', sub: '资产、持仓与今日市场' },
  { key: '/daily', label: '每日策略', icon: <CalendarOutlined />, title: '每日策略', sub: '今日结论 · 仓位 · 标的' },
  { key: '/decision', label: '交易决策', icon: <CompassOutlined />, title: '交易决策', sub: '买区 · 止损 · 目标 · 评级' },
  { key: '/evaluation', label: '历史测评', icon: <HistoryOutlined />, title: '历史测评', sub: '模型滚动检验 · 命中率 · 净值对比' },
  { key: '/portfolio', label: '持仓管理', icon: <ProfileOutlined />, title: '持仓管理', sub: '持仓 · 交易流水 · 资产与建议' },
  { key: '/analytics', label: '收益复盘', icon: <PieChartOutlined />, title: '收益复盘', sub: '净值 · 回撤 · 交易统计' },
  { key: '/backtest', label: '策略回测', icon: <ExperimentOutlined />, title: '策略回测', sub: '用历史数据检验交易规则' },
]

const NAV_RESEARCH = [
  { key: '/research', label: '研究台', icon: <NodeIndexOutlined />, title: '研究台', sub: '市场结论 · 模型 · 因子 · 板块 · 指数' },
  { key: '/forecast', label: '市场预测', icon: <RadarChartOutlined />, title: '市场预测', sub: '未来 5 日状态条件收益 · 上涨概率' },
  { key: '/models', label: '量化模型', icon: <ThunderboltOutlined />, title: '量化模型', sub: 'HMM · 渗流 · 九转 · 行业与仓位' },
  { key: '/factors', label: '因子筛选', icon: <FilterOutlined />, title: '因子筛选', sub: '因子分类 · 覆盖率 · 横截面打分' },
  { key: '/screener', label: '板块跟踪', icon: <FundOutlined />, title: '板块跟踪', sub: '板块 · 市场情绪 · 个股热图' },
  { key: '/index-analysis', label: '指数分析', icon: <LineChartOutlined />, title: '指数分析', sub: 'A股主要宽基 · 海外指数 · 操作结论' },
  { key: '/regions', label: '地域', icon: <CompassOutlined />, title: '地域', sub: '中国上市公司分布 · 省份龙头' },
]

const NAV_TOOLS = [
  { key: '/watchlist', label: '自选行情', icon: <StarOutlined />, title: '自选行情', sub: '关注的标的与分时走势' },
  { key: '/guide', label: '使用指南', icon: <ReadOutlined />, title: '使用指南', sub: '安装 · 第一次打开 · 每天的使用顺序' },
  { key: '/settings', label: '设置', icon: <SettingOutlined />, title: '设置', sub: '账户资产 · 数据与缓存' },
]

const NAV = [...NAV_CORE, ...NAV_RESEARCH, ...NAV_TOOLS]


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
    // A packaged app can keep an old WebView page after an update.  Compare the
    // server version once and reload into the new bundle when needed.
    api.get<any>('/api/health').then((h) => {
      if (h?.version && h.version !== UI_VERSION) {
        const key = `stockdesk-version:${h.version}`
        if (sessionStorage.getItem(key) !== '1') {
          sessionStorage.setItem(key, '1')
          location.reload()
        }
      }
    }).catch(() => {})
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const meta = useMemo(() => {
    if (lang === 'en') {
      if (loc.pathname.startsWith('/stock/')) return { title: 'Stock Detail', sub: 'Quote · flows · fundamentals' }
      if (loc.pathname === '/settings') return { title: 'Settings', sub: 'Assets · data and cache' }
      if (loc.pathname === '/regions' || loc.pathname === '/hub-map') return { title: 'Regions', sub: 'China listed-company map · province leaders' }
      if (loc.pathname === '/guide') return { title: 'Guide', sub: 'Install · first run · daily workflow' }
      if (loc.pathname === '/notes') return { title: 'Notes', sub: 'Local notes and observations' }
      if (loc.pathname === '/anomalies') return { title: 'Anomalies', sub: 'Triggered conditions and current hits' }
      if (loc.pathname === '/asset-analysis') return { title: 'Portfolio', sub: 'Asset analysis merged into Portfolio' }
      if (loc.pathname === '/advice-center') return { title: 'Portfolio', sub: 'Advice merged into Portfolio' }
      if (loc.pathname === '/index-analysis' || loc.pathname === '/industry-news') return { title: 'Index Analysis', sub: 'A-share and global indices · conclusions' }
      if (loc.pathname === '/models') return { title: 'Quant Models', sub: 'HMM · percolation · position plans' }
      if (loc.pathname === '/evaluation') return { title: 'Model Evaluation', sub: 'Walk-forward hit rate and equity' }
      if (loc.pathname === '/research') return { title: 'Research', sub: 'From market conclusion to one research direction' }
      if (loc.pathname === '/decision') return { title: 'Trade Decision', sub: 'Buy zone · stop · target · rating' }
      if (loc.pathname === '/forecast') return { title: 'Market Forecast', sub: '5-day regime-conditional outlook' }
      if (loc.pathname === '/industry-news') return { title: 'Index Analysis', sub: 'A-share and global indices · conclusions' }
      return EN_NAV[loc.pathname] ?? { title: 'StockDesk', sub: '' }
    }
    if (loc.pathname.startsWith('/stock/')) return { title: '个股详情', sub: '行情 · 筹码 · 财务' }
    if (loc.pathname === '/settings') return { title: '设置', sub: '账户资产 · 数据与缓存' }
    if (loc.pathname === '/regions' || loc.pathname === '/hub-map') return { title: '地域', sub: '中国上市公司分布 · 省份龙头 · 行业偏好' }
    if (loc.pathname === '/guide') return { title: '使用指南', sub: '安装 · 第一次打开 · 每天的使用顺序' }
    if (loc.pathname === '/notes') return { title: '笔记', sub: '本地记录与观察' }
    if (loc.pathname === '/anomalies') return { title: '异常提醒', sub: '触发条件与当前命中' }
    if (loc.pathname === '/asset-analysis') return { title: '持仓管理', sub: '资产分析已并入持仓管理' }
    if (loc.pathname === '/advice-center') return { title: '持仓管理', sub: '投资建议已并入持仓管理' }
    if (loc.pathname === '/index-analysis' || loc.pathname === '/industry-news') return { title: '指数分析', sub: 'A股主要宽基 · 海外指数 · 操作结论' }
    if (loc.pathname === '/models') return { title: '量化模型', sub: 'HMM · 渗流 · 九转 · 行业关注 · 仓位建议' }
    if (loc.pathname === '/evaluation') return { title: '历史测评', sub: '滚动检验 · 命中率 · 净值对比' }
    if (loc.pathname === '/research') return { title: '研究台', sub: '模型 · 因子 · 板块 · 指数 · 地域' }
    if (loc.pathname === '/decision') return { title: '交易决策', sub: '买入区间 · 止损 · 目标 · 评级与原因' }
    if (loc.pathname === '/forecast') return { title: '市场预测', sub: '未来 5 日状态条件收益 · 上涨概率' }
    return NAV.find((n) => n.key === loc.pathname) ?? { title: 'StockDesk', sub: '' }
  }, [loc.pathname, lang])

  const breadth = overview?.breadth
  const status = overview?.status

  const navLink = (n: (typeof NAV)[number]) => (
    <Link key={n.key} to={n.key} className={`nav-item ${loc.pathname === n.key ? 'active' : ''}`}>
      {n.icon}
      <span>{lang === 'en' ? EN_NAV[n.key]?.label ?? n.label : n.label}</span>
    </Link>
  )

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
        {NAV_CORE.map(navLink)}
        <div className="nav-group-label">{lang === 'en' ? 'RESEARCH' : '研究'}</div>
        {NAV_RESEARCH.map(navLink)}

        <div className="nav-group-label">{lang === 'en' ? 'TOOLS' : '工具'}</div>
        {NAV_TOOLS.map(navLink)}

        <div className="sider-foot">
          <div>
            <span className={`status-dot ${status?.open ? '' : 'closed'}`} />
            {status?.label ?? '加载中'} {status?.now && <span className="mono">{status.now}</span>}
          </div>
          <div style={{ marginTop: 4 }}>
            数据源 东方财富 · 本地缓存
          </div>
          <div style={{ marginTop: 4 }}>
            <SyncOutlined spin={spin} /> 数据 {updated || '--'} · 自动刷新
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
          <div className="page-head" title={meta.sub || meta.title}>
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
          <Tooltip title={lang === 'en' ? 'Guide' : '使用指南'}>
            <button className="share-page" onClick={() => navigate('/guide')} aria-label="使用指南">
              <ReadOutlined />
            </button>
          </Tooltip>
          <Tooltip title={lang === 'en' ? 'Back to home' : '一键返回首页'}>
            <button className="share-page" onClick={() => navigate('/')} aria-label="返回首页">
              <HomeOutlined />
            </button>
          </Tooltip>
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
            <Suspense fallback={<div className="card card-pad muted">正在载入页面…</div>}>
            <Routes>
              <Route path="/" element={<Dashboard overview={overview} />} />
              <Route path="/daily" element={<Daily />} />
              <Route path="/decision" element={<Decision />} />
              <Route path="/forecast" element={<Forecast />} />
        <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/stock/:code" element={<StockDetail />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/backtest" element={<Backtest />} />
              <Route path="/factors" element={<Factors />} />
              <Route path="/screener" element={<MarketBoard />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/anomalies" element={<Anomalies />} />
              <Route path="/asset-analysis" element={<Navigate to="/portfolio?tab=analysis" replace />} />
              <Route path="/advice-center" element={<Navigate to="/portfolio?tab=advice" replace />} />
              <Route path="/index-analysis" element={<IndexAnalysis />} />
              <Route path="/hub-map" element={<Navigate to="/regions" replace />} />
              <Route path="/regions" element={<HubMap />} />
              <Route path="/industry-news" element={<IndexAnalysis />} />
              <Route path="/models" element={<Models />} />
              <Route path="/evaluation" element={<Evaluation />} />
              <Route path="/research" element={<Research />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
