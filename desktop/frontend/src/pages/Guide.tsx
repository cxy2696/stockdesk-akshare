import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui'

/* ------------------------------------------------------------------ data */

const SECTIONS = [
  { id: 'guide-start', num: '01', title: '5 分钟上手', en: 'QUICK START', desc: '安装、第一次打开、初始资产' },
  { id: 'guide-daily', num: '02', title: '每日使用流程', en: 'DAILY RHYTHM', desc: '盘前 10 分钟、盘中、盘后' },
  { id: 'guide-pages', num: '03', title: '页面地图', en: 'PAGE MAP', desc: '14 个页面，各自解决什么问题' },
  { id: 'guide-indicators', num: '04', title: '指标词典', en: 'INDICATOR DICTIONARY', desc: '13 个指标：定义、读法、误用' },
  { id: 'guide-risk', num: '05', title: '仓位与风控', en: 'POSITION & RISK', desc: '总仓位、单票、行业、止损' },
  { id: 'guide-data', num: '06', title: '数据与隐私', en: 'DATA & PRIVACY', desc: '来源、缓存、本地存储' },
  { id: 'guide-shortcuts', num: '07', title: '快捷键与效率', en: 'SHORTCUTS', desc: '⌘K、主题、缩放、长图' },
  { id: 'guide-faq', num: '08', title: '常见问题', en: 'FAQ', desc: '空数据、接口、安装、颜色' },
  { id: 'guide-release', num: '09', title: '版本与更新', en: 'RELEASE', desc: '当前 1.11.0 与本次改动' },
]

const INSTALL_ROWS = [
  {
    platform: 'macOS 12+（Apple Silicon）',
    file: 'StockDesk-macOS.dmg / .zip',
    open: '打开 DMG，双击 Install-StockDesk.command；被拦截时右键「打开」',
  },
  {
    platform: 'Windows 10 / 11 x64',
    file: 'StockDesk.exe',
    open: '需要 WebView2；SmartScreen 点「更多信息 → 仍要运行」',
  },
  {
    platform: 'iPhone / iPad（iOS 17+）',
    file: 'StockDesk-iOS-unsigned.ipa',
    open: '用 Sideloadly / AltStore / Xcode 重签；免费签名 7 天有效',
  },
  {
    platform: '浏览器 / NAS',
    file: 'GHCR 容器',
    open: '映射 8765 端口，挂载 /data；适合长期挂着看',
  },
]

type PageRow = {
  name: string
  to?: string
  path: string
  problem: string
  how: string
  numbers: string
}

const PAGE_ROWS: PageRow[] = [
  {
    name: '总览 / HUB',
    to: '/',
    path: '/',
    problem: '每天第一眼：账户和市场现在怎么样，下一步去哪。',
    how: '中央圆盘点进持仓管理；左列每日策略、板块跟踪、收益复盘；右列回测、地域、指数分析、量化模型、KDJ；顶部工具进设置、异常、笔记、自选、搜索。',
    numbers: '总资产、今日盈亏、仓位、市场温度；上证、涨跌家数、成交额、主力净流入；管理员名片里的资产等级。',
  },
  {
    name: '每日策略',
    to: '/daily',
    path: '/daily',
    problem: '开盘前用一页定攻守：今天做多重、盯哪些方向。',
    how: '先读 summary 和结论，再看行业趋势、九转与模型结论、行业关注重点、今日标的、要闻；标的点进详情，要闻点原文。',
    numbers: '市场温度、涨跌 / 涨停 / 跌停、成交额、目标仓位区间；5 个指数的 RSI / MACD / 九转 / 支撑压力；行业 5 / 20 / 60 日；九转 9 / 13 计数。',
  },
  {
    name: '自选行情',
    to: '/watchlist',
    path: '/watchlist',
    problem: '把持仓以外的观察池放一屏，盘中快速比较。',
    how: '右上添加自选，支持代码、名称、拼音首字母；点行进入个股详情；点星标移除；列表 45 秒刷新。',
    numbers: '最新价、涨跌幅、20 日与 60 日走势、成交额、PE / PB、当日最高最低。',
  },
  {
    name: '个股详情',
    path: '/stock/:code',
    problem: '单只股票的行情、筹码、估值和财务放在一页。',
    how: '从自选、持仓、今日标的、热图点进来；切日 / 周 / 月 K 与复权方式；看筹码、黄金分割、公司概况和财务；右上可记一笔交易。',
    numbers: '价格 / 涨跌、换手率 / 量比、PE / PB / 总市值、MACD / 九转、筹码平均成本 / 获利比例 / 90% 区间 / 集中度、支撑压力、财务增速。',
  },
  {
    name: '持仓管理',
    to: '/portfolio',
    path: '/portfolio',
    problem: '记账，同时知道现金、仓位、盈亏和风险边界。',
    how: '记录交易（代码 / 方向 / 价格 / 数量 / 日期 / 费用），可改可删；按买入、卖出筛选；顶部切持仓总览 / 资产分析 / 投资建议；初始资产在右上。',
    numbers: '总资产、可用现金、持仓市值、累计 / 浮动 / 已实现盈亏、仓位、单票权重、成本、持有天数、目标仓位、超限提醒。',
  },
  {
    name: '收益复盘',
    to: '/analytics',
    path: '/analytics',
    problem: '收益从哪来、回撤多深、交易习惯有没有问题。',
    how: '先看四个 KPI，再看净值 / 回撤 / 仓位，最后看月度收益、FIFO 统计和个股贡献；每周或每月看一次。',
    numbers: '累计 / 年化收益、最大回撤、夏普、卡玛、Beta / Alpha、胜率、盈亏比、月度收益、个股贡献、平均仓位。',
  },
  {
    name: '策略回测',
    to: '/backtest',
    path: '/backtest',
    problem: '把买卖规则放到历史上检验，而不是凭感觉。',
    how: '选标的、10 套策略之一、参数、区间、本金，点开始回测；看资金曲线、绩效、交易明细；一次只改一个参数。',
    numbers: '策略收益对比买入持有、最大回撤、夏普、胜率、交易次数、年化 / 超额、手续费 / 印花税 / 滑点。',
  },
  {
    name: '板块跟踪',
    to: '/screener',
    path: '/screener',
    problem: '判断行情是扩散还是少数股票在动，找行业和形态。',
    how: '四个 Tab：板块跟踪（行业 / 概念、按涨幅或资金流排序、点开成分股）；市场情绪（温度、涨停池、强势股、指数趋势）；个股热图（面积 = 市值、颜色 = 涨跌、点击进个股）；形态选股（11 类形态与九转，扫前 100 / 200 / 300 只）。',
    numbers: '板块涨幅、主力净流入、上涨板块占比、涨停 / 跌停、温度、热图颜色与面积、形态命中数 / 评分。',
  },
  {
    name: '地域',
    to: '/regions',
    path: '/regions',
    problem: '从省份看产业集聚、上市公司分布和区域龙头。',
    how: '上方省份选择器或搜索切省份，滚轮缩放、拖拽地图，点省份联动概览；下方可展开全部省份的领涨公司。',
    numbers: '上市公司总数、省份涨 / 跌、地域涨跌、主力净流入、领涨公司 / 行业。',
  },
  {
    name: '指数分析',
    to: '/index-analysis',
    path: '/index-analysis',
    problem: '一屏看 A 股宽基和海外指数，判断偏多还是偏空。',
    how: '先看页面顶部的综合结论和平均评分，再看 A 股指数卡；海外指数只做隔夜参考。',
    numbers: '偏多 / 中性 / 偏空数量、平均评分、20 / 60 / 120 日、MA20 / 60 / 120、RSI、MACD 柱、20 日波动、支撑 / 压力、52 周高低。',
  },
  {
    name: '量化模型',
    to: '/models',
    path: '/models',
    problem: '现在该重仓还是轻仓，行情是扩散还是分裂，九转有没有到点。',
    how: '先看组合策略（HMM × 渗流），再看 HMM 概率 / 转移、渗流格点 / 最大簇、行业临界、九转、个股仓位建议。',
    numbers: 'HMM 三状态概率 / 预计持续天数 / 翻转风险；渗流上涨占比、最大簇 / 上涨、59.27% 阈值、簇数量；目标总仓位、单票建议股数、九转 9 / 13。',
  },
  {
    name: 'KDJ 预警',
    to: '/kdj',
    path: '/kdj',
    problem: '盘中短线是否进入极值，避免追高或恐慌。',
    how: '选行业或指数，切 5 分钟 / 30 分钟；J ≥ 118 超买、J ≤ −14 超卖；60 秒刷新；行业限流时看 ETF 代理标注。',
    numbers: 'K / D / J、RSV、MA5 / 20、量比、中枢位置、J 变化、拐头、趋势、触发覆盖率。',
  },
  {
    name: '设置',
    to: '/settings',
    path: '/settings',
    problem: '账户基准、外观、数据和名片一次配好。',
    how: '设置初始资产；切中英文、字体缩放；改管理员名称 / UID；看数据与缓存；清理并重载。',
    numbers: '初始资产、服务版本、行情时段、缓存策略、交易笔数、持仓数量、总资产 / 现金。',
  },
  {
    name: '使用指南',
    path: '/guide',
    problem: '忘了怎么用的时候查，不用翻聊天记录。',
    how: '左侧目录跳转；宽屏为 sticky 侧栏，窄屏折叠为顶部横向滚动；页面表格里的页面名可以点进对应页。',
    numbers: '9 章、14 个页面、13 个指标、当前版本 1.11.0。',
  },
]

type IndicatorItem = {
  name: string
  en: string
  group: 'trend' | 'structure' | 'breadth'
  look: string
  quick: string
  def: string
  read: string
  misuse: string
}

const INDICATORS: IndicatorItem[] = [
  {
    name: 'MA 均线',
    en: 'MA5 / 10 / 20 / 60',
    group: 'trend',
    look: '价格与 MA20 的位置、MA20 斜率',
    quick: '站上且多头排列偏强，跌破 MA20 / 60 转弱',
    def: 'N 日收盘价均值。MA5 约一周，MA10 两周，MA20 一个月，MA60 一个季度；系统默认看 5 / 10 / 20 / 60。',
    read: '价格站在 MA20 上方、MA20 向上，波段偏强；回踩 MA20 缩量不破，是低吸观察点；收盘跌破 MA20 且 3 天收不回，先减仓；MA60 是中期防线。均线粘合后放量发散，方向更可信。',
    misuse: '均线滞后，震荡市会反复穿越；不复权遇到除权会跳变；小周期金叉不代表大周期转多；金叉不是买入指令。',
  },
  {
    name: 'RSI(14)',
    en: 'RELATIVE STRENGTH',
    group: 'trend',
    look: '70 / 30 的位置、有没有背离',
    quick: '超买能更超买，超卖能更超卖',
    def: '14 日平均涨幅与平均跌幅的比值，0–100。≥70 超买，≤30 超卖，50 是多空分界。',
    read: '50 上方偏强；强势股 RSI 70–80 可以持续很久；价格新低而 RSI 不新低（底背离）+ 放量止跌，比单看 30 更有用；弱势股 30 下方钝化是常态。',
    misuse: '超买可以更超买，超卖可以更超卖；单日暴跌会压低 RSI；参数 6 / 14 / 24 结果不同，别混用；RSI 低不等于便宜。',
  },
  {
    name: 'MACD',
    en: 'DIF / DEA / HIST',
    group: 'trend',
    look: '零轴位置、金叉死叉、柱体',
    quick: '零轴上方金叉更可信，震荡市假信号多',
    def: 'DIF = EMA12 − EMA26；DEA = DIF 的 9 日 EMA；柱 = 2 × (DIF − DEA)。',
    read: '零轴上方金叉，趋势延续概率更高；零轴下方金叉多是反弹；红柱缩短 / 绿柱缩短说明动能减弱；顶 / 底背离要同时看价格高低点。',
    misuse: '滞后；震荡市金叉死叉频繁；只看金叉不看零轴；柱体颜色和 K 线涨跌是两回事。',
  },
  {
    name: '九转',
    en: 'TD SEQUENTIAL',
    group: 'structure',
    look: '9 / 9 与 13 / 13、完成后 20 根',
    quick: '衰竭不等于反转，先等止跌',
    def: 'TD Sequential。连续 9 根收盘价低于 4 日前收盘价 = 买入建仓结构（9/9），高于 = 卖出结构；结构完成后进入倒计时，最多 13 根，跌破两日前低点（买）/ 突破两日前高点（卖）计数，13/13 为完成。',
    read: '9/9 是动能衰竭，不是反转确认；7/9 只观察；13/13 比 9/9 强；结构完成后 20 根内还有效；买结构要等放量止跌、收复 MA5 或支撑确认，卖结构看是否跌破 5 日线。',
    misuse: '下跌中接飞刀；9 之后还能继续跌；震荡市计数反复清零；停牌 / 除权会打断；不同软件对倒计时的定义有差异。',
  },
  {
    name: '底部钝化',
    en: 'BOTTOM DULL',
    group: 'structure',
    look: '60 日低位、RSI 35 下方拐头',
    quick: '左侧信号，先等止跌',
    def: '价格在 60 日低位（≤ 60 日低点 × 1.04），RSI 连续 3 天低于 35 后拐头，或 MACD 绿柱连续缩短；系统标记为底部钝化。',
    read: '左侧观察信号。先等价格止跌、放量收阳或站回 MA5；和九转买入、筹码单峰、行业广度回升一起看；仓位先小，确认后再加。',
    misuse: '钝化可以持续几周；低位不等于便宜；下跌趋势里 RSI 低是常态；不要一次满仓。',
  },
  {
    name: '主力净流入',
    en: 'MAIN FLOW',
    group: 'breadth',
    look: '连续 3–5 日、占成交额比例',
    quick: '单日大单会骗人，看连续性',
    def: '按成交金额分单，超大单 + 大单的净买入额；正值为净流入。不同数据源的口径不完全一样。',
    read: '看连续 3–5 日是否同向；看净流入占成交额的比例；行业流入和个股流入同向更可信；价格不涨但持续流入可能是吸筹，也可能是被动资金。',
    misuse: '单日大单可能来自对倒、ETF 申赎、大宗；净流入不等于次日涨；尾盘拉抬会失真；只看一天容易做反。',
  },
  {
    name: '筹码分布',
    en: 'CHIP DISTRIBUTION',
    group: 'structure',
    look: '获利比例、90% 区间、集中度',
    quick: '是估算，不是真实持仓',
    def: '用历史成交量、换手率和价格估算的持仓成本分布；看平均成本、获利比例、90% 成本区间、集中度和筹码峰。',
    read: '现价上方是套牢盘，下方是获利盘；单峰密集 + 集中度高，说明成本集中，突破需要放量；回踩筹码峰上沿可能有支撑；获利比例超过 90% 时注意兑现压力。',
    misuse: '是估算，不是真实持仓；上市不久、高换手、除权会失真；不要精确到小数点；筹码峰不是铁底。',
  },
  {
    name: '黄金分割',
    en: 'FIBONACCI',
    group: 'structure',
    look: '0.382 / 0.5 / 0.618 与前高、MA 重合',
    quick: '高低点选错就全错',
    def: '用一段前高前低计算 0.236 / 0.382 / 0.5 / 0.618 / 0.786 回撤位，作为支撑 / 压力参考。',
    read: '上涨后回踩 0.382–0.5 是强势整理，0.618 是最后防线；跌破 0.618 说明这段上涨结构走坏；和 MA20、筹码峰、前高重合时更有效。',
    misuse: '不是预测工具；高低点选错，位就全错；强趋势只回撤 0.236；不要每个价位都画线。',
  },
  {
    name: 'KDJ',
    en: '5M / 30M',
    group: 'trend',
    look: 'J ≥ 118 / J ≤ −14、5m 与 30m 同向',
    quick: '强趋势会钝化，极值不是指令',
    def: 'RSV = (收盘 − 9 日最低) / (9 日最高 − 9 日最低) × 100；K = 2/3 前 K + 1/3 RSV；D = 2/3 前 D + 1/3 K；J = 3K − 2D，可以超出 0–100。系统看 5m / 30m，J ≥ 118 超买、J ≤ −14 超卖。',
    read: '5 分钟偏即时，30 分钟偏质量；两周期同向触发权重更高；J 拐头 + 价格跌破 / 站上短均线才确认；看中枢位置和量比。',
    misuse: '强趋势中 J 会长期钝化；KDJ 滞后；单周期噪音大；极值不是买卖指令；阈值只是过滤噪音。',
  },
  {
    name: '市场温度',
    en: 'MARKET SCORE',
    group: 'breadth',
    look: '0–100 的分值与连续方向',
    quick: '不是仓位公式，别拿它预测点位',
    def: '0–100 的综合分：上涨占比、主要指数平均涨跌、5 个指数站上 MA20 的数量、涨停 / 跌停差，加权后截断。',
    read: '≥70 强势，58–69 偏强，45–57 震荡，32–44 偏弱，低于 32 弱势；连续 3 天回升比单日跳升可靠；和成交额、涨停家数一起看。',
    misuse: '一天的分数会被涨停 / 跌停极端值拉高或压低；指数涨但个股跌时温度可能不高；它不是仓位公式；别拿它预测点位。',
  },
  {
    name: 'HMM 三状态',
    en: 'HIDDEN MARKOV',
    group: 'breadth',
    look: '状态概率 ≥ 60%、预计持续天数',
    quick: '拐点处滞后，不能替代风控',
    def: '对沪深 300 日收益拟合 3 状态高斯 HMM（Baum-Welch），输出弱势 / 震荡 / 强势的后验概率、状态转移矩阵、预计持续天数、翻转风险。',
    read: '看概率最大的状态是否 ≥ 60%；强势 + 预计持续天数长，趋势延续；弱势概率快速上升，先降仓；转移矩阵看状态粘性；AIC / BIC 只用于比较拟合。',
    misuse: '状态切换滞后，拐点最容易错；3 个状态是拟合出来的，不是基本面；不要用单日概率变化做交易；换样本 / 参数结果会变。',
  },
  {
    name: '渗流最大连通簇',
    en: 'PERCOLATION',
    group: 'breadth',
    look: '最大簇 / 上涨 对比 59.27%',
    quick: '格点不是产业关系，单日快照会抖',
    def: '把全市场股票排成二维格点，上涨股票标记为占据；按 4 邻接找最大连通簇；最大簇 / 上涨家数 = giant_occupied；59.27% 是二维方格点渗流临界值。',
    read: '≥59.27% 且上升 = 扩散；接近 = 临界；低于 = 分裂；看最大簇绝对家数、簇数量、随机重排基线；行业分组看局部扩散。',
    misuse: '格点位置不代表产业关系；行业样本小，59.27% 不能直接套；单日快照会抖；扩散不等于指数一定涨；别把簇大小当买入信号。',
  },
  {
    name: '行业广度',
    en: 'INDUSTRY BREADTH',
    group: 'breadth',
    look: '上涨占比 ≥ 60%、最大簇不收缩',
    quick: '小样本行业会失真',
    def: '行业上涨家数 / 行业总家数；系统同时给出行业最大连通簇、距 59.27% 的宽度差和领涨股。',
    read: '广度 ≥60% 且最大簇没收缩，说明行业内部在扩散；广度上升 + 龙头走强 + 主力流入，三者同向更好；广度低但龙头独涨，是孤立行情。',
    misuse: '小行业只有 5 只股票，1 只涨停就是 20%；等权广度会被小市值 / ST 影响；广度高不代表指数强；行业分类会调整。',
  },
]

const RISK_ROWS = [
  {
    item: '总仓位',
    rule: '每日策略给 target_low–target_high；模型页给方向区间，冲突时取更小的',
    detail: '市场温度 ≥70 时常见 70%–85%，45–58 时 45%–60%，低于 32 时 15%–30%；单次调整不超过 10%，不在盘中临时改。',
  },
  {
    item: '单票上限',
    rule: '仓位建议按市场评分给 15%–25%，模型页按 15%',
    detail: '市场评分 ≥70 时用 25%，45–70 时 20%，低于 45 时 15%；两处口径取更小的那个，超过就先减。',
  },
  {
    item: '行业上限',
    rule: '单行业不超过 30%',
    detail: '主题重叠的行业合并算，比如半导体、设备、材料按一条产业链看，避免名义上分散、实际押一个方向。',
  },
  {
    item: '止损',
    rule: '建仓前写下来，不写不买',
    detail: '跌破近 20 日支撑或 MA20、收盘不收回，先减一半；再破止损全出。单笔亏损控制在账户 1%–2%，浮亏 15% 进异常提醒；模型页的止损参考是现价 −8%。',
  },
  {
    item: '加仓',
    rule: '首仓 1/3，确认后 1/3，突破或回踩再加 1/3',
    detail: '只在盈利仓或计划内加；每次加仓后重算成本和止损；不对亏损仓补仓摊薄。',
  },
  {
    item: '减仓',
    rule: '先减超限、破位、行业广度转弱的',
    detail: '分 2 批，反弹减，不追跌杀跌；减下来的现金不急着换股，等下一次确认。',
  },
  {
    item: '现金',
    rule: '至少留 8%–10%，弱势留 20% 以上',
    detail: '现金是仓位的一部分，用来接回撤和周转，不是闲置资金。',
  },
]

const MISTAKE_ROWS = [
  {
    mistake: '追涨',
    sign: '涨停或加速段买入，次日低开就慌',
    fix: '等回踩 MA5 / MA20，或放量突破后的第一次缩量回踩；错过就等下一次。',
  },
  {
    mistake: '补跌',
    sign: '亏损加仓摊薄成本，越跌越买',
    fix: '先看行业广度和支撑；破位不加，等九转买结构、放量止跌或收复 MA5 再谈。',
  },
  {
    mistake: '过度交易',
    sign: '每天换股，手续费和滑点吃掉收益',
    fix: '一周调整 1–2 次；连续 3 次止损停一天；没有计划内的信号不动手。',
  },
  {
    mistake: '单票重仓',
    sign: '一只票决定账户曲线',
    fix: '单票超过 25% 先减到上限内；行业超过 30% 按产业链合并计算。',
  },
  {
    mistake: '把模型当预测',
    sign: '看到强势就满仓，看到弱势就清仓',
    fix: '模型给区间和方向，执行靠分批与止损；模型转头时先减仓，再等确认。',
  },
  {
    mistake: '不记录',
    sign: '交易不补录，现金和复盘全错',
    fix: '成交当天补录；至少记价格、数量、费用、日期，备注写一句买入理由。',
  },
]

const SOURCE_ROWS = [
  ['A 股快照 / 指数 / 个股报价', '东方财富公开行情', '新浪行情、akshare', '快照 3 分钟，报价 20 秒'],
  ['日 / 周 / 月 / 分钟 K 线', '东方财富', '新浪、akshare', '10 分钟'],
  ['行业 / 概念板块', '东方财富 BK 板块', '新浪行业 / 概念资金流（SINA*，无成分股）', '约 1–10 分钟'],
  ['主力资金 / 涨跌分布 / 涨停池', '东方财富', '新浪资金流', '60 秒'],
  ['新闻 / 要闻', '东方财富 7×24', '—', '打开页面时'],
  ['公司概况 / 财务', '东方财富 F10', '—', '按需缓存'],
]

const REFRESH_ROWS = [
  ['HUB 指数与市场状态', '30 秒'],
  ['每日策略', '3 分钟'],
  ['自选行情', '45 秒'],
  ['KDJ 预警', '60 秒'],
  ['量化模型', '5 分钟'],
  ['全市场快照 / 单只报价', '3 分钟 / 20 秒'],
  ['K 线', '10 分钟'],
]

const DATA_DIRS = [
  ['macOS App', '~/Library/Application Support/StockDesk'],
  ['Windows App', '%LOCALAPPDATA%\\StockDesk'],
  ['源码运行', 'desktop/data/'],
  ['iPhone / iPad', 'App 沙盒'],
  ['Docker', '/data'],
]

const SHORTCUT_ROWS: { action: string; entry: ReactNode; note: string }[] = [
  { action: '全局搜索', entry: <kbd className="kbd">⌘K</kbd>, note: '聚焦顶栏搜索；Windows 用 Ctrl+K；代码、名称、拼音首字母；回车进个股' },
  { action: '主题切换', entry: '顶栏闪电 / 月亮 / 太阳', note: '指挥舱 → 明亮 → 深色，默认指挥舱' },
  { action: '语言', entry: '顶栏 EN / 中', note: '中英切换；页面标题、导航和部分文案会变' },
  { action: '字体缩放', entry: '设置 → 字体缩放', note: '100% / 120% / 150%，只放大文字，表格换行，图表不拉伸' },
  { action: '长图分享', entry: '顶栏分享图标', note: '子页面可用，HUB 不显示；保存 PNG 或调系统分享' },
  { action: '返回', entry: '顶栏左上箭头', note: '回上一页；没有历史时回 HUB' },
  { action: '关闭弹窗', entry: 'Esc', note: '关闭搜索建议、Modal、Drawer' },
]

const FAQ: [string, string][] = [
  [
    '打开后数据是空的，或者一直加载',
    '先看行情状态：交易中、午间休市、已收盘。第一次打开要拉全市场快照，通常 3–10 秒；开盘前后会更慢。休市时价格停在上一交易日收盘，不是没数据。超过 30 秒还空，按顺序试：刷新页面 → 退出 App 重开 → 检查网络 / 代理 → 看日志（macOS 在 ~/Library/Application Support/StockDesk，Windows 在 %LOCALAPPDATA%\\StockDesk）。',
  ],
  [
    '行情加载慢，或者数字不动',
    '东方财富、新浪都是公开接口，会限流。缓存没过期时返回同一份数据，连续点刷新不会更快。自选 45 秒、KDJ 60 秒、HUB 30 秒、每日策略 3 分钟；K 线缓存 10 分钟。等 1–2 分钟再试；如果只有板块或 KDJ 不动，看是不是回退到了新浪或 ETF 代理。',
  ],
  [
    '板块接口不可用怎么办',
    '东方财富板块列表不可达时，行业 / 概念会回退到新浪资金流，代码显示 SINA*，没有成分股明细；KDJ 行业卡使用并标注 ETF 代理（半导体 512480、通信设备 515880）。涨跌和资金流仍然可用，等接口恢复会回到东方财富。',
  ],
  [
    'macOS 提示「无法打开」或「已损坏」',
    'App 是 ad-hoc 签名，浏览器下载会带隔离标记。优先运行安装包里的 Install-StockDesk.command；仍然提示时执行 xattr -dr com.apple.quarantine /Applications/StockDesk.app，再到「隐私与安全性」点「仍要打开」。仅支持 Apple Silicon；Intel Mac 从源码跑或用容器。',
  ],
  [
    'Windows 双击没有窗口',
    '需要 WebView2 Runtime；没有时会退回默认浏览器。SmartScreen 点「更多信息 → 仍要运行」。还是没有窗口，用 StockDesk.exe --browser，日志在 %LOCALAPPDATA%\\StockDesk\\stockdesk.log。',
  ],
  [
    'iOS 安装失败',
    'IPA 未签名，必须用 Apple ID 重签（Sideloadly / AltStore / Xcode）。免费签名 7 天过期，重签后数据是否保留看工具。App 完全本地运行，不需要 Mac 后端。',
  ],
  [
    '为什么是红涨绿跌',
    'A 股习惯：--up 是红，--down 是绿；指挥舱、明亮、深色三套主题都保持这个含义。颜色只表示方向，不表示强弱；同样 +1% 的红色和 +9% 的红色，要看数字。',
  ],
  [
    '升级后页面还是旧的，或者空白',
    '先强制刷新（⌘⇧R / Ctrl+F5）或退出 App 重开；设置 → 数据与缓存里的服务版本应为 1.11.0。还不对，检查是不是开了旧端口或旧窗口；启动器会自动顺延端口，以日志里的实际地址为准。',
  ],
  [
    '换电脑怎么备份',
    '先退出 App，再复制整个数据目录；cache.db 可以不复制，stockdesk.db 一定要。笔记、主题、缩放、管理员名片在界面本地存储里，不会跟 stockdesk.db 一起走，重要笔记先复制文本。恢复时先退出再放回，避免 SQLite 锁。',
  ],
]

const UPDATES = [
  ['模型', 'HMM 三状态重做，渗流最大连通簇重算，补了组合策略、行业临界和关键标的', '量化模型'],
  ['九转', 'TD 建仓结构 9 / 倒计时 13 独立成模型，接入每日策略、个股详情、形态选股', '每日策略 / 个股详情 / 板块跟踪'],
  ['合并页面', '资产分析、投资建议并入持仓管理；行业要闻并入每日策略；指数分析取代行业要闻', '持仓管理 / 每日策略 / 指数分析'],
  ['HUB', '中央圆盘直接进持仓管理；右侧入口改为回测、地域、指数分析、模型、KDJ', '总览'],
  ['热图', '按行业分组，面积 = 市值、颜色 = 涨跌幅，点击方块进个股', '板块跟踪 → 个股热图'],
  ['地域', '地图和概览支持全部省份切换，省份领涨公司可展开', '地域'],
  ['图表', '收益复盘的净值、趋势、回撤、仓位线颜色区分更明显；模型图重绘', '收益复盘 / 量化模型'],
  ['指南', '这页重做：9 章、页面速查、13 个指标、FAQ', '使用指南'],
]

/* -------------------------------------------------------------- components */

function Chapter({
  id,
  num,
  title,
  en,
  desc,
  children,
}: {
  id: string
  num: string
  title: string
  en: string
  desc: string
  children: ReactNode
}) {
  return (
    <section id={id} className="sd-guide-section">
      <Card
        className="sd-guide-card"
        title={
          <>
            <span className="sd-ch-num">{num}</span>
            <span>{title}</span>
            <span className="sd-ch-en">{en}</span>
          </>
        }
        desc={desc}
      >
        {children}
      </Card>
    </section>
  )
}

function Sub({ no, title, en }: { no: string; title: string; en?: string }) {
  return (
    <div className="sd-sub">
      <i>{no}</i>
      <b>{title}</b>
      {en && <span>{en}</span>}
    </div>
  )
}

function Note({
  tone = 'info',
  tag,
  children,
}: {
  tone?: 'info' | 'warn'
  tag: string
  children: ReactNode
}) {
  return (
    <div className={`sd-note ${tone === 'warn' ? 'warn' : ''}`}>
      <span className="sd-note-tag">{tag}</span>
      <div>{children}</div>
    </div>
  )
}

function Code({ label, children }: { label: string; children: string }) {
  return (
    <div className="sd-code-block">
      <div className="sd-code-head">
        <span>{label}</span>
        <span>terminal</span>
      </div>
      <pre className="sd-code">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function FlowBlock({
  time,
  title,
  items,
}: {
  time: string
  title: string
  items: { h: string; p: string }[]
}) {
  return (
    <div className="sd-flow">
      <div className="sd-flow-head">
        <b>{time}</b>
        <span>{title}</span>
      </div>
      <ol>
        {items.map((x) => (
          <li key={x.h}>
            <b>{x.h}</b>
            <span>{x.p}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function IndicatorCard({ x }: { x: IndicatorItem }) {
  return (
    <div className="sd-ind">
      <div className="sd-ind-head">
        <b>{x.name}</b>
        <span>{x.en}</span>
      </div>
      <div className="sd-ind-row">
        <em>定义</em>
        <p>{x.def}</p>
      </div>
      <div className="sd-ind-row">
        <em>怎么读</em>
        <p>{x.read}</p>
      </div>
      <div className="sd-ind-row misuse">
        <em>容易误用</em>
        <p>{x.misuse}</p>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- the page */

export default function Guide() {
  const [active, setActive] = useState(SECTIONS[0].id)
  const rootRef = useRef<HTMLDivElement>(null)
  const tocNavRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const scroller = root.closest('.content') as HTMLElement | null
    if (!scroller) return

    let raf = 0
    const update = () => {
      raf = 0
      const top = scroller.getBoundingClientRect().top
      const threshold = Math.max(180, Math.min(340, scroller.clientHeight * 0.33))
      let current = SECTIONS[0].id
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id)
        if (!el) continue
        if (el.getBoundingClientRect().top - top <= threshold) current = s.id
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 12) {
        current = SECTIONS[SECTIONS.length - 1].id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
    const settle = window.setTimeout(onScroll, 320)
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.clearTimeout(settle)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    const nav = tocNavRef.current
    if (!nav || nav.scrollWidth <= nav.clientWidth + 2) return
    const item = nav.querySelector('a.active') as HTMLElement | null
    if (!item) return
    const left = item.offsetLeft - nav.clientWidth / 2 + item.clientWidth / 2
    nav.scrollLeft = Math.max(0, left)
  }, [active])

  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (!SECTIONS.some((s) => s.id === hash)) return
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [])

  const jump = (e: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    setActive(id)
    window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <div className="sd-guide" ref={rootRef}>
      <div className="sd-guide-layout">
        <aside className="sd-guide-toc">
          <div className="sd-toc-head">
            <b>目录</b>
            <span>CONTENTS</span>
          </div>
          <nav className="sd-toc-nav" aria-label="使用指南目录" ref={tocNavRef}>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={active === s.id ? 'active' : ''}
                aria-current={active === s.id ? 'true' : undefined}
                onClick={(e) => jump(e, s.id)}
              >
                <i>{s.num}</i>
                <span>{s.title}</span>
              </a>
            ))}
          </nav>
          <div className="sd-toc-foot">
            <span>本地优先 · 单用户</span>
            <span>v1.11.0</span>
          </div>
        </aside>

        <div className="sd-guide-body">
          <header className="sd-guide-hero" id="guide-top">
            <div className="sd-hero-eyebrow">
              <i />
              STOCKDESK · PERSONAL EQUITY DESK
            </div>
            <h1>本地优先的个人股票投资台</h1>
            <p className="sd-hero-lead">
              账户、交易、自选、笔记和行情缓存都在本机。打开就是持仓、市场状态和下一步要做什么；
              不登录、不连券商、不上传。先读「5 分钟上手」，之后把「页面地图」和「指标词典」当字典查。
            </p>
            <div className="sd-hero-actions">
              <a className="sd-btn primary" href="#guide-start" onClick={(e) => jump(e, 'guide-start')}>
                5 分钟上手 <span>→</span>
              </a>
              <a className="sd-btn" href="#guide-pages" onClick={(e) => jump(e, 'guide-pages')}>
                页面地图
              </a>
              <a className="sd-btn" href="#guide-indicators" onClick={(e) => jump(e, 'guide-indicators')}>
                指标词典
              </a>
            </div>
            <div className="sd-hero-meta">
              <span className="sd-chip">v1.11.0</span>
              <span className="sd-chip">macOS · Windows · iOS</span>
              <span className="sd-chip">A 股 / 宽基 / 板块</span>
              <span className="sd-chip">本地 SQLite</span>
              <span className="sd-chip">无账号</span>
            </div>
            <div className="sd-hero-stats">
              <div className="sd-hero-stat">
                <b>09</b>
                <span>章节</span>
              </div>
              <div className="sd-hero-stat">
                <b>14</b>
                <span>页面</span>
              </div>
              <div className="sd-hero-stat">
                <b>13</b>
                <span>指标</span>
              </div>
              <div className="sd-hero-stat">
                <b>1.11.0</b>
                <span>当前版本</span>
              </div>
            </div>
          </header>

          <Chapter id="guide-start" num="01" title="5 分钟上手" en="QUICK START" desc="安装、第一次打开、初始资产">
            <p className="sd-p">
              先选一种方式把它跑起来：装好的 App，或者从源码起一个本地服务。两种方式的数据目录不同，别混着用。
            </p>

            <Sub no="1.1" title="装 App" en="INSTALL" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-install">
                <thead>
                  <tr>
                    <th>平台</th>
                    <th>文件</th>
                    <th>第一次打开</th>
                  </tr>
                </thead>
                <tbody>
                  {INSTALL_ROWS.map((r) => (
                    <tr key={r.platform}>
                      <td>{r.platform}</td>
                      <td>{r.file}</td>
                      <td>{r.open}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note tag="提示">
              macOS 安装包里的 App 不要直接双击运行，先跑 <span className="sd-inline">Install-StockDesk.command</span>。
              它会复制到 Applications 并清掉下载隔离；被拦截时右键「打开」，或者用第 8 章的 xattr 命令。
            </Note>

            <Sub no="1.2" title="从源码运行" en="FROM SOURCE" />
            <Code label="bash · macOS / Linux">{`cd desktop
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py`}</Code>
            <p className="sd-p">
              Windows 把前两行换成 <span className="sd-inline">py -3.10 -m venv .venv</span> 和
              <span className="sd-inline">.venv\Scripts\pip install -r requirements.txt</span>，其余相同。
              默认地址是 <span className="sd-inline">http://127.0.0.1:8765</span>，端口被占用会顺延；不想开原生窗口就加
              <span className="sd-inline">--browser</span>，只起接口用 <span className="sd-inline">--headless</span>。
            </p>

            <Sub no="1.3" title="第一次打开看到什么" en="FIRST RUN" />
            <ol className="sd-steps">
              <li>
                <i>1</i>
                <div>
                  <b>HUB。</b>默认是指挥舱主题。中间圆盘是资产中枢，点它直接进持仓管理；左列每日策略、板块跟踪、收益复盘；
                  右列策略回测、地域、指数分析、量化模型、KDJ 预警。顶部五个小按钮是设置、异常提醒、笔记、自选、搜索。
                </div>
              </li>
              <li>
                <i>2</i>
                <div>
                  <b>顶栏。</b>⌘K 搜索、EN / 中切换、分享当前页、主题切换。进入子页面后，左上角出现返回箭头。
                </div>
              </li>
              <li>
                <i>3</i>
                <div>
                  <b>空账户是正常的。</b>第一次打开总资产等于初始资产，可用现金等于本金，仓位 0。首次拉全市场快照要几秒，
                  看到「加载中」不是坏了。
                </div>
              </li>
              <li>
                <i>4</i>
                <div>
                  <b>先做三件事。</b>设置里确认初始资产；持仓管理里记第一笔交易；自选里加第一只票。然后回到每日策略。
                </div>
              </li>
            </ol>

            <Sub no="1.4" title="初始资产怎么设" en="CAPITAL" />
            <p className="sd-p">
              入口有两个：设置 → 资产总览 → 初始资产；或者持仓管理右上角的「初始资产」。它填的是你投入这个账户的本金，
              不是当前市值，也不是券商的可用资金。
            </p>
            <div className="sd-formula">
              <div>总资产 = 可用现金 + 持仓市值</div>
              <div>可用现金 = 初始资产 − 净投入</div>
              <div>净投入 = 累计买入（含费用）− 累计卖出（扣费用）</div>
              <div>累计收益率 =（总资产 − 初始资产）÷ 初始资产</div>
            </div>
            <p className="sd-p">
              例：初始资产 200,000，买入 50,000（费用 30），现金 149,970；持仓市值 52,000 时，总资产 201,970，
              累计收益 +0.985%。改初始资产会重算现金和收益基准，交易流水不会变；所以最好在补交易之前设好。
            </p>
            <Note tone="warn" tag="注意">
              不要用当前市值当初始资产，否则累计收益会被抹平。先把本金填对，再按时间顺序补最近 3–6 个月的买卖；
              老交易补得越全，复盘越准。
            </Note>
          </Chapter>

          <Chapter id="guide-daily" num="02" title="每日使用流程" en="DAILY RHYTHM" desc="盘前 10 分钟、盘中、盘后">
            <p className="sd-p">
              一天分三段：开盘前定计划，盘中只执行和记录，收盘后复盘。顺序不要反过来，也不要每天重做一遍总仓位。
            </p>

            <div className="sd-flow-grid">
              <FlowBlock
                time="08:50–09:00"
                title="盘前 10 分钟：定攻守"
                items={[
                  { h: 'HUB 看环境', p: '上证、涨跌家数、成交额、主力净流入；账户看总资产、今日盈亏、仓位、市场温度。' },
                  { h: '每日策略读结论', p: '先看 summary 与市场温度，再看涨跌分布、涨停 / 跌停、成交额、目标仓位区间。' },
                  { h: '行业与模型', p: '行业 5 / 20 / 60 日趋势、九转 9 / 13、HMM 状态、渗流最大簇、行业关注重点，挑 2–3 个方向。' },
                  { h: '今日标的', p: '看触发信号和评分，只挑 1–3 只加入自选；它是候选，不是买点。' },
                  { h: '明日关注', p: '记下指数的支撑 / 压力，把「跌破哪里减、站稳哪里加」写成条件。' },
                  { h: '写一句计划', p: '例如「今天最多买 2 万，跌破 3180 减半」。写在笔记里，盘中只按这句执行。' },
                ]}
              />
              <FlowBlock
                time="09:30–15:00"
                title="盘中：执行和记录"
                items={[
                  { h: '自选行情', p: '45 秒刷新；先看价格相对 MA20 和支撑的位置，再看涨跌幅，不要只看红绿。' },
                  { h: '个股详情', p: '日 / 周 / 月 K、筹码、黄金分割、MACD、九转；盘中不改大逻辑，只找执行点。' },
                  { h: '提醒', p: 'KDJ 看 5m / 30m 的 J ≥ 118 或 ≤ −14；异常提醒看指数 ±1.5%、持仓 ±5%、跌破支撑、浮亏 −15%、跌停 ≥10 家。' },
                  { h: '执行', p: '分批买卖，单次不超过计划仓位的一半；成交后立刻补录价格、数量、费用、日期。' },
                  { h: '三件不做', p: '不追涨停、不因为一条快讯改总仓位、不在破位后补仓摊薄。' },
                ]}
              />
              <FlowBlock
                time="15:00 以后"
                title="盘后：复盘和记录"
                items={[
                  { h: '持仓管理', p: '补录当天交易，核对现金不为负、单票权重没超限、支撑压力有没有变化。' },
                  { h: '收益复盘', p: '净值、回撤、仓位、月度收益、FIFO 统计、个股贡献；每周或每月看一次，不用天天盯。' },
                  { h: '每日策略', p: '收盘数据更新后再看明日支撑 / 压力和行业趋势；不要每小时刷。' },
                  { h: '笔记', p: '写三句：今天做对了什么、做错了什么、明天准备怎么做。' },
                  { h: '分享', p: '需要留档时，在子页面点分享生成长图；HUB 不支持分享。' },
                ]}
              />
            </div>

            <div className="sd-route-line">
              <span>最短路径</span>
              <b>HUB</b>
              <i>→</i>
              <b>每日策略</b>
              <i>→</i>
              <b>持仓管理</b>
              <i>→</i>
              <b>自选行情</b>
              <i>→</i>
              <b>收盘补录</b>
              <i>→</i>
              <b>收益复盘</b>
            </div>

            <Note tone="warn" tag="纪律">
              盘中只执行盘前写好的计划。计划外的交易，先放 10 分钟再决定；十分钟后还想买，再按分批和止损规则做。
            </Note>
          </Chapter>

          <Chapter id="guide-pages" num="03" title="页面地图" en="PAGE MAP" desc="14 个页面，各自解决什么问题">
            <p className="sd-p">
              页面分三层：每天用的（HUB、每日策略、自选、持仓），每周用的（复盘、板块、指数、模型），
              以及按需用的（回测、地域、KDJ、设置）。下面这张表可以当索引，页面名可以直接点进去。
            </p>

            <Sub no="3.1" title="页面速查" en="PAGE INDEX" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-pages">
                <thead>
                  <tr>
                    <th>页面</th>
                    <th>解决什么问题</th>
                    <th>怎么用</th>
                    <th>先看哪几个数字</th>
                  </tr>
                </thead>
                <tbody>
                  {PAGE_ROWS.map((p) => (
                    <tr key={p.path}>
                      <td>
                        <div className="sd-page-cell">
                          {p.to ? (
                            <Link className="sd-page-link" to={p.to}>
                              {p.name}
                            </Link>
                          ) : (
                            <b>{p.name}</b>
                          )}
                          <span className="sd-page-path">{p.path}</span>
                        </div>
                      </td>
                      <td>{p.problem}</td>
                      <td>{p.how}</td>
                      <td>{p.numbers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Sub no="3.2" title="三条常用路线" en="ROUTES" />
            <div className="sd-route-grid">
              <div className="sd-route">
                <b>每天 10 分钟</b>
                <span>HUB → 每日策略 → 持仓管理 → 自选行情。看完就关，不来回翻。</span>
              </div>
              <div className="sd-route">
                <b>周末 30 分钟</b>
                <span>收益复盘 → 板块跟踪 → 指数分析 → 量化模型。看收益来源、市场扩散和下周仓位。</span>
              </div>
              <div className="sd-route">
                <b>验证一个想法</b>
                <span>策略回测 → 个股详情 → 板块形态 → 量化模型。先看历史，再看当下结构。</span>
              </div>
            </div>

            <Note tag="连接">
              页面之间不是孤立的：每日策略的标的点进去是个股详情；指数的「明日关注」来自近 20 日高低点与 MA20；
              持仓的支撑 / 压力来自筹码密集区与黄金分割位；模型页的仓位建议跟着真实持仓走。先把交易记全，后面的数字才连得上。
            </Note>
          </Chapter>

          <Chapter id="guide-indicators" num="04" title="指标词典" en="INDICATOR DICTIONARY" desc="13 个指标：定义、读法、误用">
            <p className="sd-p">
              指标只描述已经发生的事。下面每条都分成定义、怎么读、容易误用；先看速查表，再按需翻详细解释。
              所有阈值都是过滤器，不是买卖指令。
            </p>

            <Sub no="4.1" title="指标速查" en="CHEAT SHEET" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-indicators">
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>先看什么</th>
                    <th>一句话</th>
                  </tr>
                </thead>
                <tbody>
                  {INDICATORS.map((x) => (
                    <tr key={x.name}>
                      <td>{x.name}</td>
                      <td>{x.look}</td>
                      <td>{x.quick}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Sub no="4.2" title="趋势与动能" en="TREND & MOMENTUM" />
            <div className="sd-ind-grid">
              {INDICATORS.filter((x) => x.group === 'trend').map((x) => (
                <IndicatorCard key={x.name} x={x} />
              ))}
            </div>

            <Sub no="4.3" title="结构与时点" en="STRUCTURE & TIMING" />
            <div className="sd-ind-grid">
              {INDICATORS.filter((x) => x.group === 'structure').map((x) => (
                <IndicatorCard key={x.name} x={x} />
              ))}
            </div>

            <Sub no="4.4" title="资金与广度" en="FLOW & BREADTH" />
            <div className="sd-ind-grid">
              {INDICATORS.filter((x) => x.group === 'breadth').map((x) => (
                <IndicatorCard key={x.name} x={x} />
              ))}
            </div>

            <Note tone="warn" tag="顺序">
              先看价格和均线，再看动能（RSI / MACD / KDJ），然后用九转和筹码找时点，最后用资金与广度确认。
              顺序反过来，很容易被单个指标带着走。
            </Note>
          </Chapter>

          <Chapter id="guide-risk" num="05" title="仓位与风控" en="POSITION & RISK" desc="总仓位、单票、行业、止损">
            <p className="sd-p">
              先定亏多少，再谈赚多少。仓位是少数你能完全控制的变量；选股可以错，仓位错了很难补。
            </p>

            <Sub no="5.1" title="七条硬约束" en="RULES" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-risk">
                <thead>
                  <tr>
                    <th>项目</th>
                    <th>建议</th>
                    <th>怎么执行</th>
                  </tr>
                </thead>
                <tbody>
                  {RISK_ROWS.map((r) => (
                    <tr key={r.item}>
                      <td>{r.item}</td>
                      <td>{r.rule}</td>
                      <td>{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Sub no="5.2" title="止损与加减仓" en="STOP & SCALE" />
            <p className="sd-p">
              止损不是预测，是保险费。建仓前先把止损价写下来，再决定买多少；先算最坏情况，再看能赚多少。
            </p>
            <ul className="sd-list">
              <li>
                <b>止损三句话。</b>跌破近 20 日支撑或 MA20、收盘不收回，先减一半；再破止损全出；
                单笔亏损控制在账户 1%–2%，浮亏 15% 会进异常提醒。
              </li>
              <li>
                <b>加仓。</b>首仓 1/3，盈利或结构确认后加第二个 1/3，突破或回踩再加最后 1/3；
                每次加仓后把止损上移，不对亏损仓补仓摊薄。
              </li>
              <li>
                <b>减仓。</b>先减权重超限、跌破支撑、行业广度转弱的；分 2 批，反弹减，不追跌杀跌；
                减下来的现金不急着换股。
              </li>
              <li>
                <b>频率。</b>一周调整 1–2 次已经够多；连续 3 次止损，停一天不做交易，先看是不是市场状态变了。
              </li>
            </ul>

            <Sub no="5.3" title="常见错误" en="COMMON MISTAKES" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-mistakes">
                <thead>
                  <tr>
                    <th>错误</th>
                    <th>通常长什么样</th>
                    <th>怎么改</th>
                  </tr>
                </thead>
                <tbody>
                  {MISTAKE_ROWS.map((r) => (
                    <tr key={r.mistake}>
                      <td>{r.mistake}</td>
                      <td>{r.sign}</td>
                      <td>{r.fix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Note tone="warn" tag="边界">
              仓位建议是区间，不是指令。你的资金期限、税费、风险承受能力都会改变执行；同样的 60% 仓位，
              对别人合适，对你未必。
            </Note>
          </Chapter>

          <Chapter id="guide-data" num="06" title="数据与隐私" en="DATA & PRIVACY" desc="来源、缓存、本地存储">
            <p className="sd-p">
              行情来自公开接口，账户数据只在本机。知道哪些会出网、哪些会缓存，遇到空白和延迟时就不容易慌。
            </p>

            <Sub no="6.1" title="数据从哪来" en="SOURCES" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-sources">
                <thead>
                  <tr>
                    <th>数据</th>
                    <th>主来源</th>
                    <th>回退</th>
                    <th>刷新</th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCE_ROWS.map((r) => (
                    <tr key={r[0]}>
                      <td>{r[0]}</td>
                      <td>{r[1]}</td>
                      <td>{r[2]}</td>
                      <td>{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sd-p">
              东方财富是主路径，新浪和 akshare 是回退。回退数据会在页面标注来源；板块回退到新浪时，行业代码是 SINA*，
              没有成分股明细，这是数据源限制，不是页面坏了。
            </p>

            <Sub no="6.2" title="缓存与刷新节奏" en="CACHE" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-refresh">
                <thead>
                  <tr>
                    <th>内容</th>
                    <th>节奏</th>
                  </tr>
                </thead>
                <tbody>
                  {REFRESH_ROWS.map((r) => (
                    <tr key={r[0]}>
                      <td>{r[0]}</td>
                      <td>{r[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sd-p">
              缓存是为了少打接口，不是实时行情的承诺。缓存没过期时，连续点刷新拿到的是同一份数据；
              开盘前后 9:15–9:35 最容易拥堵，等一两分钟通常自己恢复。
            </p>

            <Sub no="6.3" title="本地存了什么" en="LOCAL STORAGE" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-dirs">
                <thead>
                  <tr>
                    <th>运行方式</th>
                    <th>数据目录</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_DIRS.map((r) => (
                    <tr key={r[0]}>
                      <td>{r[0]}</td>
                      <td>
                        <span className="sd-mono">{r[1]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sd-p">
              目录里两个库：<span className="sd-inline">stockdesk.db</span> 放交易、自选和设置；
              <span className="sd-inline">cache.db</span> 放行情缓存；打包版还会写 <span className="sd-inline">stockdesk.log</span>。
              笔记、主题、语言、缩放、管理员名片存在界面本地存储里，不在 stockdesk.db。
            </p>
            <Note tag="隐私">
              交易、自选、设置、笔记不会离开本机；唯一出网的是行情和新闻请求，请求里带股票代码，不带账户、持仓数量或笔记。
              没有账号、没有云同步、没有遥测。
            </Note>

            <Sub no="6.4" title="延迟与限制" en="LIMITS" />
            <ul className="sd-list">
              <li>公开接口没有 SLA。被限流时会变慢、回退或短时无数据；这不是账户数据出错。</li>
              <li>行情可能有几秒到几分钟延迟；休市后显示上一交易日收盘，不会继续跳。</li>
              <li>筹码、主力资金、HMM、渗流都是估算或统计模型，不是交易所的原始持仓数据。</li>
              <li>不连券商、不代下单、不同步成交；买卖都在你自己的券商 App 里完成，这里只记账。</li>
              <li>单机、单用户，不做多设备同步；换电脑要手动备份数据目录。</li>
            </ul>
          </Chapter>

          <Chapter id="guide-shortcuts" num="07" title="快捷键与效率" en="SHORTCUTS" desc="⌘K、主题、缩放、长图">
            <p className="sd-p">
              常用的只有几个，记住就能少点很多次鼠标。⌘K 是全局的；其余入口都在顶栏或设置里。
            </p>

            <Sub no="7.1" title="常用操作" en="KEY MAP" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-shortcuts">
                <thead>
                  <tr>
                    <th>操作</th>
                    <th>入口</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {SHORTCUT_ROWS.map((r) => (
                    <tr key={r.action}>
                      <td>{r.action}</td>
                      <td>{r.entry}</td>
                      <td>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Sub no="7.2" title="数据自己更新的节奏" en="AUTO REFRESH" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-refresh">
                <thead>
                  <tr>
                    <th>内容</th>
                    <th>节奏</th>
                  </tr>
                </thead>
                <tbody>
                  {REFRESH_ROWS.map((r) => (
                    <tr key={r[0]}>
                      <td>{r[0]}</td>
                      <td>{r[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="sd-list">
              <li>
                <b>用 ⌘K 代替找导航。</b>搜到代码直接回车进个股，比从自选里翻快。
              </li>
              <li>
                <b>固定顺序。</b>HUB → 每日策略 → 持仓 → 自选；其他页面按需开，避免每天把所有页面刷一遍。
              </li>
              <li>
                <b>分享前切回 100%。</b>150% 字号适合阅读，长图会更高；100% 更紧凑。HUB 不显示分享按钮，进子页面再分享。
              </li>
              <li>
                <b>主题按环境选。</b>白天用明亮，晚上用深色或指挥舱；指挥舱对比度最高，但信息密度也最大。
              </li>
            </ul>
            <Note tag="缩放">
              字体缩放只改文字：按钮、卡片、表格会自动增高或换行，地图和图表不拉伸。120% / 150% 下顶栏的指数 ticker 会隐藏，
              这是布局取舍，不是数据丢了。
            </Note>
          </Chapter>

          <Chapter id="guide-faq" num="08" title="常见问题" en="FAQ" desc="空数据、接口、安装、颜色">
            <p className="sd-p">按出现频率排。先看现象，再按顺序试；大多数问题在刷新或换数据源后就能恢复。</p>
            <div className="sd-faq-grid">
              {FAQ.map(([q, a], i) => (
                <div className="sd-faq" key={q}>
                  <b>
                    <span>Q{i + 1}</span> {q}
                  </b>
                  <p>{a}</p>
                </div>
              ))}
            </div>
          </Chapter>

          <Chapter id="guide-release" num="09" title="版本与更新" en="RELEASE" desc="当前 1.11.0 与本次改动">
            <div className="sd-release">
              <div className="sd-release-badge">v1.11.0</div>
              <div className="sd-release-meta">
                <b>本轮改造版</b>
                <span>2026 年 11 月 · 桌面端</span>
              </div>
            </div>
            <p className="sd-p">
              这一轮把页面结构和模型结论重新收了一遍：合并重复页面、补上九转和行业关注、把模型从“看数字”改成“给区间和条件”。
              版本号按桌面端计，iOS 和美股版有自己的版本线。
            </p>

            <Sub no="9.1" title="这次改了什么" en="WHAT CHANGED" />
            <div className="sd-table-wrap">
              <table className="sd-table sd-table-updates">
                <thead>
                  <tr>
                    <th>模块</th>
                    <th>变化</th>
                    <th>去哪里看</th>
                  </tr>
                </thead>
                <tbody>
                  {UPDATES.map((r) => (
                    <tr key={r[0]}>
                      <td>{r[0]}</td>
                      <td>{r[1]}</td>
                      <td>{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Sub no="9.2" title="升级后先做三件事" en="AFTER UPGRADE" />
            <ol className="sd-steps">
              <li>
                <i>1</i>
                <div>
                  <b>确认版本。</b>设置 → 数据与缓存里的服务版本应为 1.11.0；页面还是旧的，先强制刷新或退出 App 重开。
                </div>
              </li>
              <li>
                <i>2</i>
                <div>
                  <b>确认入口。</b>持仓管理里应该能看到持仓总览、资产分析、投资建议三个分区；旧地址
                  <span className="sd-inline">/asset-analysis</span>、<span className="sd-inline">/advice-center</span> 会直接跳过来，
                  <span className="sd-inline">/industry-news</span> 跳到指数分析，书签不用改。
                </div>
              </li>
              <li>
                <i>3</i>
                <div>
                  <b>走一遍新路径。</b>每日策略看九转 / 模型结论；板块跟踪点热图进个股；地域切几个省份；
                  量化模型看组合策略和个股仓位建议。
                </div>
              </li>
            </ol>

            <Note tone="warn" tag="升级">
              升级不会改动你的交易、自选和设置；但如果你从源码切到打包 App，数据目录会变，先把旧目录里的
              stockdesk.db 备份出来。
            </Note>

            <div className="sd-guide-foot">
              <span>StockDesk · v1.11.0 · 本地优先</span>
              <span>行情与模型用于研究；下单和盈亏由你自己承担。</span>
            </div>
          </Chapter>
        </div>
      </div>

      <style>{`
        .sd-guide {
          max-width: 1380px;
          margin: 0 auto;
          color: var(--text-sub);
        }
        .sd-guide-layout {
          display: grid;
          grid-template-columns: 224px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }
        .sd-guide-body { min-width: 0; }

        /* ---------------------------------------------------------- toc */
        .sd-guide-toc {
          position: sticky;
          top: 12px;
          align-self: start;
          max-height: calc(100vh - 110px);
          overflow: auto;
          padding: 12px 10px;
          background: var(--card);
          border: 1px solid var(--border-soft);
          border-radius: 12px;
          box-shadow: var(--shadow);
        }
        .sd-toc-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          padding: 2px 8px 8px;
          margin-bottom: 6px;
          border-bottom: 1px solid var(--border-soft);
        }
        .sd-toc-head b {
          font-size: calc(12px * var(--fs, 1));
          color: var(--text);
          letter-spacing: 0.12em;
        }
        .sd-toc-head span {
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(8px * var(--fs, 1));
          color: var(--text-dim);
          letter-spacing: 0.16em;
        }
        .sd-toc-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sd-toc-nav a {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px;
          border-left: 2px solid transparent;
          border-radius: 8px;
          color: var(--text-sub);
          text-decoration: none;
          font-size: calc(11.5px * var(--fs, 1));
          line-height: 1.35;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .sd-toc-nav a i {
          flex: 0 0 18px;
          width: 18px;
          font-style: normal;
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(9px * var(--fs, 1));
          color: var(--text-dim);
        }
        .sd-toc-nav a:hover {
          background: var(--hover);
          color: var(--text);
        }
        .sd-toc-nav a.active {
          background: var(--accent-soft);
          border-left-color: var(--accent);
          color: var(--accent);
          font-weight: 600;
        }
        .sd-toc-nav a.active i { color: var(--accent); }
        .sd-toc-foot {
          display: flex;
          justify-content: space-between;
          gap: 6px;
          margin-top: 10px;
          padding: 8px 8px 2px;
          border-top: 1px solid var(--border-soft);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(8.5px * var(--fs, 1));
          color: var(--text-dim);
        }

        /* --------------------------------------------------------- hero */
        .sd-guide-hero {
          position: relative;
          overflow: hidden;
          padding: 24px 26px 20px;
          border: 1px solid var(--border-soft);
          border-radius: 14px;
          background: linear-gradient(135deg, var(--card) 0%, var(--card-2) 100%);
          box-shadow: var(--shadow);
        }
        .sd-guide-hero::after {
          content: '';
          position: absolute;
          right: -70px;
          top: -90px;
          width: 260px;
          height: 260px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--accent-soft), transparent 66%);
          pointer-events: none;
        }
        .sd-hero-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(9px * var(--fs, 1));
          letter-spacing: 0.18em;
          color: var(--accent);
        }
        .sd-hero-eyebrow i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          display: inline-block;
        }
        .sd-guide-hero h1 {
          position: relative;
          z-index: 1;
          max-width: 880px;
          margin: 10px 0 8px;
          font-size: calc(25px * var(--fs, 1));
          line-height: 1.28;
          letter-spacing: -0.01em;
          color: var(--text);
        }
        .sd-hero-lead {
          position: relative;
          z-index: 1;
          max-width: 860px;
          margin: 0;
          font-size: calc(12.5px * var(--fs, 1));
          line-height: 1.9;
          color: var(--text-sub);
        }
        .sd-hero-actions {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }
        .sd-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 32px;
          padding: 0 13px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--card);
          color: var(--text-sub);
          font-size: calc(11.5px * var(--fs, 1));
          text-decoration: none;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .sd-btn:hover {
          border-color: var(--accent);
          color: var(--text);
        }
        .sd-btn.primary {
          border-color: var(--accent);
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }
        .sd-btn.primary:hover {
          background: var(--accent);
          color: var(--bg);
        }
        .sd-hero-meta {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 14px;
        }
        .sd-chip {
          padding: 3px 8px;
          border: 1px solid var(--border-soft);
          border-radius: 99px;
          background: var(--tag-bg);
          color: var(--text-sub);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(9.5px * var(--fs, 1));
        }
        .sd-hero-stats {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--border-soft);
        }
        .sd-hero-stat b {
          display: block;
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(18px * var(--fs, 1));
          font-weight: 600;
          color: var(--text);
          line-height: 1.2;
        }
        .sd-hero-stat span {
          display: block;
          margin-top: 2px;
          font-size: calc(9.5px * var(--fs, 1));
          letter-spacing: 0.08em;
          color: var(--text-dim);
        }

        /* ------------------------------------------------------ chapters */
        .sd-guide-section {
          margin-top: 14px;
          scroll-margin-top: 16px;
        }
        .sd-guide-card .card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: calc(14px * var(--fs, 1));
        }
        .sd-ch-num {
          padding: 2px 5px;
          border: 1px solid var(--accent);
          border-radius: 5px;
          color: var(--accent);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(9.5px * var(--fs, 1));
          line-height: 1;
        }
        .sd-ch-en {
          margin-left: 2px;
          color: var(--text-dim);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(8px * var(--fs, 1));
          font-weight: 400;
          letter-spacing: 0.14em;
        }
        .sd-guide-card .card-desc {
          font-size: calc(10px * var(--fs, 1));
        }
        .sd-sub {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin: 18px 0 8px;
        }
        .sd-sub:first-child { margin-top: 0; }
        .sd-sub i {
          font-style: normal;
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(9.5px * var(--fs, 1));
          color: var(--accent);
          letter-spacing: 0.04em;
        }
        .sd-sub b {
          font-size: calc(12.5px * var(--fs, 1));
          color: var(--text);
          font-weight: 650;
        }
        .sd-sub span {
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(8px * var(--fs, 1));
          color: var(--text-dim);
          letter-spacing: 0.12em;
        }
        .sd-sub::after {
          content: '';
          flex: 1;
          height: 1px;
          margin-left: 4px;
          background: var(--border-soft);
        }
        .sd-p {
          margin: 0 0 8px;
          font-size: calc(12px * var(--fs, 1));
          line-height: 1.9;
          color: var(--text-sub);
        }
        .sd-inline {
          padding: 1px 5px;
          border-radius: 4px;
          background: var(--tag-bg);
          color: var(--text);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(10.5px * var(--fs, 1));
        }
        .sd-mono {
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(10.5px * var(--fs, 1));
          color: var(--text);
          word-break: break-all;
        }
        .sd-list {
          margin: 0;
          padding-left: 18px;
          color: var(--text-sub);
          font-size: calc(12px * var(--fs, 1));
          line-height: 1.9;
        }
        .sd-list li {
          margin: 4px 0;
          padding-left: 2px;
        }
        .sd-list li::marker { color: var(--accent); }
        .sd-list b { color: var(--text); font-weight: 600; }

        /* --------------------------------------------------------- notes */
        .sd-note {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin: 12px 0 4px;
          padding: 10px 12px;
          border-left: 3px solid var(--accent);
          border-radius: 0 9px 9px 0;
          background: var(--accent-soft);
          color: var(--text-sub);
          font-size: calc(11.5px * var(--fs, 1));
          line-height: 1.8;
        }
        .sd-note-tag {
          flex: 0 0 auto;
          margin-top: 1px;
          padding: 2px 5px;
          border: 1px solid var(--accent);
          border-radius: 4px;
          color: var(--accent);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(8px * var(--fs, 1));
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .sd-note b { color: var(--text); }
        .sd-note.warn {
          border-left-color: var(--amber);
          background: rgba(217, 119, 6, 0.1);
        }
        .sd-note.warn .sd-note-tag {
          border-color: var(--amber);
          color: var(--amber);
        }

        /* -------------------------------------------------------- tables */
        .sd-table-wrap {
          max-width: 100%;
          margin: 10px 0 4px;
          overflow-x: auto;
          border: 1px solid var(--border-soft);
          border-radius: 10px;
          background: var(--card);
        }
        .sd-table {
          width: 100%;
          border-collapse: collapse;
          font-size: calc(11.5px * var(--fs, 1));
          line-height: 1.7;
        }
        .sd-table th {
          padding: 8px 10px;
          border-bottom: 1px solid var(--border);
          background: var(--tag-bg);
          color: var(--text-sub);
          font-weight: 600;
          text-align: left;
          white-space: nowrap;
        }
        .sd-table td {
          padding: 8px 10px;
          border-bottom: 1px solid var(--border-soft);
          color: var(--text-sub);
          vertical-align: top;
        }
        .sd-table tr:last-child td { border-bottom: none; }
        .sd-table tbody tr:hover td { background: var(--hover); }
        .sd-table td:first-child { color: var(--text); }
        .sd-table-pages { min-width: 880px; }
        .sd-table-indicators { min-width: 620px; }
        .sd-table-install { min-width: 640px; }
        .sd-table-shortcuts { min-width: 620px; }
        .sd-page-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 98px;
        }
        .sd-page-link {
          width: fit-content;
          border-bottom: 1px dashed var(--border);
          color: var(--text);
          font-weight: 600;
          text-decoration: none;
        }
        .sd-page-link:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .sd-page-path {
          color: var(--text-dim);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(9px * var(--fs, 1));
        }

        /* ------------------------------------------------------ code/ui */
        .sd-code-block {
          margin: 10px 0 4px;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--card-2);
        }
        .sd-code-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 5px 10px;
          border-bottom: 1px solid var(--border);
          background: var(--tag-bg);
          color: var(--text-dim);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(8px * var(--fs, 1));
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .sd-code {
          margin: 0;
          padding: 11px 12px;
          overflow-x: auto;
          color: var(--text);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(11px * var(--fs, 1));
          line-height: 1.75;
          white-space: pre;
        }
        .sd-code code { font-family: inherit; }
        .sd-formula {
          display: flex;
          flex-direction: column;
          gap: 3px;
          margin: 8px 0;
          padding: 10px 12px;
          border: 1px dashed var(--border);
          border-radius: 9px;
          background: var(--card-2);
          color: var(--text-sub);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(10.5px * var(--fs, 1));
          line-height: 1.8;
        }
        .sd-steps {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .sd-steps li {
          display: grid;
          grid-template-columns: 26px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          color: var(--text-sub);
          font-size: calc(12px * var(--fs, 1));
          line-height: 1.8;
        }
        .sd-steps li > i {
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          margin-top: 2px;
          border-radius: 7px;
          background: var(--accent-soft);
          color: var(--accent);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(10px * var(--fs, 1));
          font-style: normal;
          font-weight: 600;
        }
        .sd-steps li > div { min-width: 0; }
        .sd-steps b { color: var(--text); font-weight: 600; }

        /* --------------------------------------------------------- flows */
        .sd-flow-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 10px;
        }
        .sd-flow {
          padding: 12px;
          border: 1px solid var(--border-soft);
          border-radius: 11px;
          background: var(--card-2);
          min-width: 0;
        }
        .sd-flow-head {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-bottom: 8px;
          margin-bottom: 6px;
          border-bottom: 1px solid var(--border-soft);
        }
        .sd-flow-head b {
          color: var(--accent);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(10.5px * var(--fs, 1));
          letter-spacing: 0.04em;
        }
        .sd-flow-head span {
          color: var(--text);
          font-size: calc(12px * var(--fs, 1));
          font-weight: 600;
        }
        .sd-flow ol {
          margin: 0;
          padding-left: 16px;
          color: var(--text-sub);
          font-size: calc(11px * var(--fs, 1));
          line-height: 1.75;
        }
        .sd-flow li { margin: 5px 0; }
        .sd-flow li b {
          display: block;
          color: var(--text);
          font-weight: 600;
        }
        .sd-flow li span { display: block; color: var(--text-sub); }
        .sd-route-line {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 7px;
          margin-top: 14px;
          padding: 9px 12px;
          border: 1px dashed var(--border);
          border-radius: 9px;
          background: var(--card-2);
          color: var(--text-sub);
          font-size: calc(10.5px * var(--fs, 1));
        }
        .sd-route-line span {
          margin-right: 2px;
          color: var(--text-dim);
          letter-spacing: 0.08em;
        }
        .sd-route-line b {
          color: var(--text);
          font-weight: 500;
        }
        .sd-route-line i {
          color: var(--accent);
          font-style: normal;
        }
        .sd-route-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 10px;
        }
        .sd-route {
          padding: 10px 12px;
          border: 1px solid var(--border-soft);
          border-radius: 10px;
          background: var(--card-2);
          min-width: 0;
        }
        .sd-route b {
          display: block;
          margin-bottom: 4px;
          color: var(--text);
          font-size: calc(11.5px * var(--fs, 1));
        }
        .sd-route span {
          color: var(--text-sub);
          font-size: calc(10.5px * var(--fs, 1));
          line-height: 1.7;
        }

        /* ---------------------------------------------------- indicators */
        .sd-ind-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 8px;
        }
        .sd-ind {
          padding: 11px 12px;
          border: 1px solid var(--border-soft);
          border-radius: 10px;
          background: var(--card-2);
          min-width: 0;
        }
        .sd-ind-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          padding-bottom: 7px;
          margin-bottom: 6px;
          border-bottom: 1px solid var(--border-soft);
        }
        .sd-ind-head b {
          color: var(--text);
          font-size: calc(12px * var(--fs, 1));
        }
        .sd-ind-head span {
          color: var(--text-dim);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(8px * var(--fs, 1));
          letter-spacing: 0.04em;
          text-align: right;
        }
        .sd-ind-row {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr);
          gap: 8px;
          margin-top: 5px;
          color: var(--text-sub);
          font-size: calc(11px * var(--fs, 1));
          line-height: 1.75;
        }
        .sd-ind-row em {
          padding-top: 1px;
          color: var(--accent);
          font-size: calc(9.5px * var(--fs, 1));
          font-style: normal;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .sd-ind-row.misuse em { color: var(--amber); }
        .sd-ind-row p { margin: 0; }

        /* ----------------------------------------------------------- faq */
        .sd-faq-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 8px;
        }
        .sd-faq {
          padding: 11px 12px;
          border: 1px solid var(--border-soft);
          border-radius: 10px;
          background: var(--card-2);
          min-width: 0;
        }
        .sd-faq b {
          display: block;
          margin-bottom: 4px;
          color: var(--text);
          font-size: calc(11.5px * var(--fs, 1));
          line-height: 1.6;
        }
        .sd-faq b span {
          margin-right: 4px;
          color: var(--accent);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(9px * var(--fs, 1));
        }
        .sd-faq p {
          margin: 0;
          color: var(--text-sub);
          font-size: calc(11px * var(--fs, 1));
          line-height: 1.8;
        }

        /* ------------------------------------------------------- release */
        .sd-release {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 10px;
          padding: 14px;
          border: 1px solid var(--border-soft);
          border-radius: 11px;
          background: linear-gradient(135deg, var(--accent-soft), transparent 70%), var(--card-2);
        }
        .sd-release-badge {
          padding: 10px 12px;
          border: 1px solid var(--accent);
          border-radius: 8px;
          background: var(--card);
          color: var(--accent);
          font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
          font-size: calc(18px * var(--fs, 1));
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
        }
        .sd-release-meta b {
          display: block;
          color: var(--text);
          font-size: calc(13px * var(--fs, 1));
        }
        .sd-release-meta span {
          display: block;
          margin-top: 3px;
          color: var(--text-sub);
          font-size: calc(11px * var(--fs, 1));
        }
        .sd-guide-foot {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 6px 16px;
          margin-top: 18px;
          padding-top: 12px;
          border-top: 1px solid var(--border-soft);
          color: var(--text-dim);
          font-size: calc(9.5px * var(--fs, 1));
          line-height: 1.7;
        }

        /* ------------------------------------------------------ responsive */
        @media (max-width: 1280px) {
          .sd-guide-layout { grid-template-columns: 200px minmax(0, 1fr); gap: 14px; }
          .sd-flow-grid { grid-template-columns: 1fr; }
          .sd-route-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 1180px) {
          .sd-ind-grid { grid-template-columns: 1fr; }
          .sd-faq-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 1000px) {
          .sd-guide-layout { grid-template-columns: minmax(0, 1fr); }
          .sd-guide-toc { min-width: 0; }
          .sd-guide-toc {
            position: sticky;
            top: -18px;
            z-index: 30;
            max-height: none;
            overflow: visible;
            padding: 6px;
            border-radius: 10px;
          }
          .sd-toc-head, .sd-toc-foot { display: none; }
          .sd-toc-nav {
            flex-direction: row;
            gap: 4px;
            overflow-x: auto;
            scrollbar-width: none;
          }
          .sd-toc-nav::-webkit-scrollbar { display: none; }
          .sd-toc-nav a {
            flex: 0 0 auto;
            padding: 6px 9px;
            border-left: 0;
            border-bottom: 2px solid transparent;
            border-radius: 7px 7px 0 0;
            white-space: nowrap;
          }
          .sd-toc-nav a.active {
            border-left-color: transparent;
            border-bottom-color: var(--accent);
          }
          .sd-guide-section { scroll-margin-top: 62px; }
        }
        @media (max-width: 720px) {
          .sd-guide-hero { padding: 18px 16px 16px; }
          .sd-guide-hero h1 { font-size: calc(21px * var(--fs, 1)); }
          .sd-hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .sd-ch-en { display: none; }
          .sd-guide-card .card-desc { display: none; }
          .sd-guide-card .card-head,
          .sd-guide-card .card-body { padding-left: 14px; padding-right: 14px; }
          .sd-ind-row { grid-template-columns: 52px minmax(0, 1fr); }
          .sd-release { align-items: flex-start; gap: 10px; }
          .sd-release-badge { font-size: calc(15px * var(--fs, 1)); padding: 8px 9px; }
        }
      `}</style>
    </div>
  )
}
