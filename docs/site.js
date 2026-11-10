const T = {
  zh: {
    navTag:'个人投资台', navFilm:'影片', navDesk:'界面', navEditions:'版本', navStart:'开始',
    heroTitle:'一张安静的桌子，<br>看完整市场。', heroText:'StockDesk 把市场、持仓和模型放在一张安静的屏幕上。它跑在你自己的电脑里，账户数据留在本地，帮你在交易前回答三个问题。',
    download:'下载', source:'查看源码', guide:'阅读教程 →',
    floatA:'本地优先', floatB:'账户数据不上传',
    manifesto:'大多数投资工具在不断加噪音。StockDesk 做的是减法：一个 HUB、一份每日策略、一个诚实的持仓视图，需要时再打开模型。',
    filmLabel:'产品影片', filmTitle:'看这张桌子怎么动。', filmText:'一段没有摆拍的短演示：HUB、每日策略、持仓和模型。',
    chHub:'HUB', chDaily:'每日策略', chPortfolio:'持仓', chModels:'模型', chUS:'美股版',
    deskLabel:'这张桌子', deskTitle:'三个问题，<br>一个地方回答。', deskText:'用下面的标签看看同一张桌子如何随问题变化。',
    tabMarket:'市场怎么样？', tabPortfolio:'我的仓位怎么样？', tabModels:'模型怎么说？',
    marketH:'宽度、情绪，和今天的计划。', marketP:'每日策略先给出市场状态、涨跌宽度和明天的关键位。它告诉你今天是该进攻，还是该等一等。',
    marketL1:'指数趋势、RSI 与支撑/压力', marketL2:'涨跌宽度、成交额与最强板块', marketL3:'仓位区间，而不是一句预测',
    capMarket:'每日策略 + 板块宽度',
    portfolioH:'成本、筹码、支撑，都在一张图里。', portfolioP:'持仓页把成本、支撑压力、筹码分布和已实现盈亏放在一起；复盘页再把这些交易讲成一个可以学习的故事。',
    portfolioL1:'每只持仓的支撑与压力', portfolioL2:'筹码分布与获利比例', portfolioL3:'净值、回撤与交易统计',
    capPortfolio:'持仓 + 支撑/压力',
    modelsH:'HMM 管仓位，渗流管行业。', modelsP:'五个 A 股指数的 HMM 给出总仓位；渗流最大连通簇判断上涨是否连成片。个股建议会结合你真实的持仓和成本。',
    modelsL1:'强势 / 震荡 / 弱势三状态', modelsL2:'最大连通簇与行业临界', modelsL3:'加仓 / 减仓 / 止损股数',
    capModels:'HMM + 渗流 + 个股仓位',
    bookTitle:'你的仓位，不用很吵。', bookText:'成本、支撑、压力、筹码和已实现盈亏放在一处。复盘页把交易变成经验，而不是一张流水账。',
    bookS1:'成本 + 筹码', bookS1n:'人群被困在哪里', bookS2:'净值 + 回撤', bookS2n:'风险真正长什么样',
    modelTitle:'模型描述现在，<br>不预测明天。', modelText:'五个 A 股指数的三状态 HMM 给出总仓位；渗流寻找最大 4 邻接连通簇，区分“普涨扩散”和“少数股票在动”；个股建议跟随你的真实持仓。',
    edLabel:'版本', edMac:'原生窗口，双击即用。', edWin:'单文件 exe，WebView2。', edIOS:'装在口袋里的 HUB。', edUS:'独立的美股仪表盘。', edDocker:'A 股 / 美股容器。',
    startLabel:'从这里开始', startTitle:'选最短的一条路。', startText:'下载 Release、跑一个容器，或者从源码构建。教程里写了第一次打开的五分钟和每天的使用顺序。',
    dl:'Releases →', gd:'教程 →', site:'本页面', closeTitle:'工具应该让你更平静，<br>而不是更忙。', closeText:'行情只用于研究。HMM 与渗流是纪律和风险背景，不是明天的答案。'
  },
  en: {
    navTag:'personal equity desk', navFilm:'Film', navDesk:'Desk', navEditions:'Editions', navStart:'Start',
    heroTitle:'One quiet desk<br>for the whole market.', heroText:'StockDesk puts the market, your positions and the models on one calm screen. It runs on your machine, keeps your account local, and helps you answer three questions before you trade.',
    download:'Download', source:'View source', guide:'Read the guide →',
    floatA:'LOCAL-FIRST', floatB:'account data stays here',
    manifesto:'Most investing tools add noise. StockDesk removes it: one HUB, one daily plan, one honest view of your positions — then the models, only when you need them.',
    filmLabel:'PRODUCT FILM', filmTitle:'Watch the desk move.', filmText:'A short, unedited walk through the HUB, the daily plan, the portfolio and the models.',
    chHub:'The HUB', chDaily:'Daily plan', chPortfolio:'Portfolio', chModels:'Models', chUS:'US edition',
    deskLabel:'THE DESK', deskTitle:'Three questions.<br>One place to answer them.', deskText:'Use the tabs to see how the same desk changes with the question you are asking.',
    tabMarket:'How is the market?', tabPortfolio:'How is my book?', tabModels:'What do the models say?',
    marketH:'Breadth, mood and the day’s plan.', marketP:'Daily Plan opens with the market state, breadth and tomorrow’s levels. It tells you whether today is a day to press or a day to wait.',
    marketL1:'Index trend, RSI and support/resistance', marketL2:'Breadth, turnover and the strongest sectors', marketL3:'A position range, not a prediction',
    capMarket:'Daily Plan + sector breadth',
    portfolioH:'Cost, chips and pressure in one view.', portfolioP:'The portfolio page keeps cost, support, chip distribution and realized P&L together. The review page turns those trades into a story you can learn from.',
    portfolioL1:'Support and pressure per position', portfolioL2:'Chip distribution and profit ratio', portfolioL3:'NAV, drawdown and trade statistics',
    capPortfolio:'Portfolio + support/pressure',
    modelsH:'HMM for exposure. Percolation for sectors.', modelsP:'A 3-state HMM on five A-share indices suggests total exposure; percolation checks whether gains are connected. Per-stock guidance follows your real holdings and cost.',
    modelsL1:'Strong / range / weak states', modelsL2:'Largest cluster + industry criticality', modelsL3:'Add / trim / stop-out share counts',
    capModels:'HMM + percolation + per-stock guidance',
    bookTitle:'Your book, without the noise.', bookText:'Cost, support, pressure, chips and realized P&L in one place. The review page turns trades into experience, not a ledger.',
    bookS1:'Cost + chips', bookS1n:'Where the crowd is trapped', bookS2:'NAV + drawdown', bookS2n:'What the risk really looked like',
    modelTitle:'Models describe.<br>They do not predict.', modelText:'A 3-state HMM on five A-share indices suggests total exposure. Percolation finds the largest four-neighbour cluster, separating broad diffusion from a few moving names. Per-stock guidance follows your actual holdings.',
    edLabel:'EDITIONS', edMac:'Native window. Double-click.', edWin:'One-file exe, WebView2.', edIOS:'The HUB in your pocket.', edUS:'A separate US dashboard.', edDocker:'A-share and US images.',
    startLabel:'START HERE', startTitle:'Pick the shortest path.', startText:'Download a release, run a container, or build from source. The guide covers the first five minutes and the daily routine.',
    dl:'Releases →', gd:'Guide →', site:'This site', closeTitle:'A tool should make you calmer,<br>not busier.', closeText:'Quotes are for research. HMM and percolation are discipline and risk context, not tomorrow’s answer.'
  }
};
const content = {
  market: { img:'./assets/daily.png', title:'marketH', body:'marketP', list:['marketL1','marketL2','marketL3'], cap:'capMarket' },
  portfolio: { img:'./assets/portfolio.png', title:'portfolioH', body:'portfolioP', list:['portfolioL1','portfolioL2','portfolioL3'], cap:'capPortfolio' },
  models: { img:'./assets/models.png', title:'modelsH', body:'modelsP', list:['modelsL1','modelsL2','modelsL3'], cap:'capModels' }
};
let lang = localStorage.getItem('stockdesk-site-lang') || 'zh';
function apply() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (T[lang][k]) el.innerHTML = T[lang][k];
  });
  document.getElementById('lang').textContent = lang === 'zh' ? 'EN' : '中';
  document.querySelectorAll('.chapters button').forEach(b => { const k = b.dataset.k; if (k) b.querySelector('span').textContent = T[lang][k]; });
  setTab(document.querySelector('.tabs button.active')?.dataset.k || 'market');
}
function setTab(k) {
  const c = content[k];
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.k === k));
  document.getElementById('deskImg').src = c.img;
  document.getElementById('deskImg').alt = T[lang][c.title];
  document.getElementById('deskTitle').innerHTML = T[lang][c.title];
  document.getElementById('deskBody').textContent = T[lang][c.body];
  document.getElementById('deskList').innerHTML = c.list.map(x => `<li>${T[lang][x]}</li>`).join('');
  document.getElementById('deskTitle').dataset.i18n = c.title;
  document.getElementById('deskBody').dataset.i18n = c.body;
  document.getElementById('deskList').dataset.i18n = '';
  document.getElementById('deskCap').textContent = T[lang][c.cap];
}
document.getElementById('lang').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('stockdesk-site-lang', lang);
  apply();
});
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.k)));
document.querySelectorAll('.chapters button').forEach(b => {
  b.dataset.k = {3:'chHub',11:'chDaily',16:'chPortfolio',23:'chModels',31:'chUS'}[b.dataset.t];
  b.addEventListener('click', () => { const v = document.getElementById('demoVideo'); v.currentTime = Number(b.dataset.t); v.play().catch(()=>{}); });
});

const video = document.getElementById('demoVideo');
const playBtn = document.getElementById('playDemo');
const videoState = document.getElementById('videoState');
function syncVideo() { if (videoState) videoState.textContent = video && !video.paused ? 'PLAYING' : 'PAUSED'; }
if (playBtn && video) {
  playBtn.addEventListener('click', async () => { try { video.paused ? await video.play() : video.pause(); } catch {} syncVideo(); });
  video.addEventListener('play', syncVideo); video.addEventListener('pause', syncVideo);
  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;
    let active = 3;
    for (const b of document.querySelectorAll('.chapters button')) if (t >= Number(b.dataset.t)) active = Number(b.dataset.t);
    document.querySelectorAll('.chapters button').forEach(b => b.classList.toggle('active', Number(b.dataset.t) === active));
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) video.play().catch(()=>{}); else video.pause(); }), {threshold:.4}).observe(video);
  }
}

const progress = document.getElementById('progress');
addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.width = `${max > 0 ? Math.min(100, scrollY/max*100) : 0}%`;
  document.querySelector('.nav')?.classList.toggle('scrolled', scrollY > 10);
}, {passive:true});

const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }), {threshold:.12});
document.querySelectorAll('main > section:not(.hero)').forEach(s => { s.classList.add('reveal'); io.observe(s); });
if ('IntersectionObserver' in window) {
  const links = [...document.querySelectorAll('nav a[href^="#"]')];
  const secs = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#'+e.target.id)); }), {rootMargin:'-30% 0px -55% 0px'});
  secs.forEach(s => so.observe(s));
}

try {
  const visits = (Number(localStorage.getItem('sd-site-visits')) || 0) + 1;
  localStorage.setItem('sd-site-visits', String(visits));
  let depth = Number(localStorage.getItem('sd-site-depth')) || 0;
  const stats = document.getElementById('localStats');
  const update = () => {
    const p = Math.round(Math.max(depth, (scrollY + innerHeight) / document.documentElement.scrollHeight * 100));
    if (stats) stats.textContent = `LOCAL SESSION · VISIT ${visits} · DEPTH ${Math.min(100,p)}%`;
    localStorage.setItem('sd-site-depth', String(Math.round(depth)));
  };
  addEventListener('scroll', () => { depth = Math.max(depth, (scrollY + innerHeight) / document.documentElement.scrollHeight * 100); update(); }, {passive:true});
  update();
} catch {}
apply();
