const T = {
  zh: {
    navTag: '本地优先 · 个人投资台', navScreens: '界面', navEditions: '版本', navStart: '开始',
    heroTitle: '把行情、持仓和模型<br>放在一张安静的桌面上。',
    heroText: 'StockDesk 是一个本地优先的个人股票投资台。HUD 负责看全局，每日策略负责今天，HMM 与渗流负责仓位和行业。账户数据只留在你的电脑或手机里。',
    download: '下载桌面版', source: '查看源码', guide: '使用教程',
    stripEntries: 'HUB 入口', stripScale: '字体缩放', stripModels: 'A 股指数 HMM', stripPackages: 'GHCR 容器', stripCloud: '云端账户',
    screensTitle: '先看全局，再做决定。', screensText: 'HUB 是首页；点进每日策略、持仓、板块或量化模型，看到的都是当前数据，而不是一张静态截图。',
    capModels: 'HMM 状态 + 渗流 + 个股仓位建议', capUS: '独立的美股仪表盘', capIOS: 'iPhone 原生 HUB',
    editionsTitle: '选一个适合你的入口。',
    macTitle: '原生窗口，双击即用', macText: 'pywebview + WebKit，窗口从主屏左上角打开；聊天、笔记、行情互不打扰。',
    winTitle: '单文件 exe', winText: 'Windows 10/11 使用 Edge WebView2 原生窗口；Win7/8 会自动退回浏览器。',
    iosTitle: '装在口袋里的 HUB', iosText: 'SwiftUI + Swift Charts，数据在手机本地；支持 100/120/150% 字体缩放。',
    usTitle: '美股独立版', usText: '道指、纳指、标普、自选、K 线、异动榜；独立端口，不碰 A 股数据。',
    dockerTitle: 'A 股 / 美股容器', dockerText: '两个 GHCR 镜像，挂载一个数据卷就能跑；适合 NAS 或服务器。',
    openTitle: '代码是开放的', openText: '可以读、改、自己打包；欢迎提 issue 或 PR。',
    startTitle: '最短的一条路。', startText: '不想看长文档？先下载 Release，或者用 Docker 跑起来。',
    finalTitle: '工具应该让你更专注，而不是更忙。', finalText: '行情只用于研究，不构成投资建议。把 HMM 和渗流当作纪律和风险提示，而不是预测明天的答案。'
  },
  en: {
    navTag: 'local-first · personal equity desk', navScreens: 'Screens', navEditions: 'Editions', navStart: 'Start',
    heroTitle: 'Market data, positions and models<br>on one quiet desk.',
    heroText: 'StockDesk is a local-first equity desk. The HUB shows the whole picture, Daily Plan handles today, and HMM + percolation help with exposure and sectors. Your account data stays on your machine.',
    download: 'Download desktop', source: 'View source', guide: 'Guide',
    stripEntries: 'HUB entries', stripScale: 'font scaling', stripModels: 'A-share HMM', stripPackages: 'GHCR images', stripCloud: 'cloud accounts',
    screensTitle: 'See the whole board first.', screensText: 'The HUB is home. Step into Daily Plan, Portfolio, Sectors or Models and you are looking at live data, not a static screenshot.',
    capModels: 'HMM states + percolation + per-stock guidance', capUS: 'A standalone US dashboard', capIOS: 'Native HUB on iPhone',
    editionsTitle: 'Pick the entrance that suits you.',
    macTitle: 'Native window, double-click', macText: 'pywebview + WebKit, opens at the top-left of the primary display. No browser tab to lose.',
    winTitle: 'One-file exe', winText: 'Native Edge WebView2 window on Windows 10/11; Windows 7/8 falls back to the browser.',
    iosTitle: 'The HUB in your pocket', iosText: 'SwiftUI + Swift Charts, data stored on the phone, 100/120/150% font scaling.',
    usTitle: 'A separate US edition', usText: 'Dow, Nasdaq, S&P, watchlist, candles and movers on its own port — it never touches A-share data.',
    dockerTitle: 'A-share / US containers', dockerText: 'Two GHCR images. Mount one volume and run — good for a NAS or server.',
    openTitle: 'The code is open', openText: 'Read it, change it, package it. Issues and pull requests are welcome.',
    startTitle: 'The shortest path.', startText: 'No time for long docs? Grab a Release or run a container.',
    finalTitle: 'Tools should help you focus, not keep you busy.', finalText: 'Quotes are for research only. Treat HMM and percolation as discipline and risk context, not as tomorrow’s answer.'
  }
};
let lang = localStorage.getItem('stockdesk-site-lang') || 'zh';
function apply() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (T[lang][k]) el.innerHTML = T[lang][k];
  });
  document.getElementById('lang').textContent = lang === 'zh' ? 'EN' : '中';
}
document.getElementById('lang').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('stockdesk-site-lang', lang);
  apply();
});
apply();
