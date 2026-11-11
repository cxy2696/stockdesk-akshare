(() => {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============================================================
     Copy
     ============================================================ */

  const T = {
    zh: {
      navTag: "个人投资台",
      navFilm: "影片",
      navDesk: "界面",
      navEditions: "版本",
      navStart: "开始",
      heroTitle: "一张安静的<br>桌子，<br>看完整市场。",
      heroAlt: "One quiet desk for the whole market.",
      heroText: "StockDesk 把市场、持仓和模型放在一张安静的屏幕上。它跑在你自己的电脑里，账户数据留在本地，帮你在交易前回答三个问题。",
      download: "下载",
      source: "查看源码",
      guide: "阅读教程 →",
      guideShort: "教程 ↗",
      watchFilm: "放映影片",
      watchChapter: "在影片中查看",
      watchAgain: "再看一次",
      filmLength: "43 秒",
      withSound: "建议开启声音",
      fiveChapters: "五幕 · 一张桌子",
      floatA: "本地优先",
      floatB: "账户数据不上传",
      scrollHint: "向下滚动，先看影片",
      musicLabel: "背景音乐",
      nowPlaying: "正在播放",
      soundOnLabel: "关闭背景音乐",
      soundOffLabel: "开启背景音乐",
      playFilmLabel: "放映影片",
      pauseFilmLabel: "暂停影片",
      replayFilmLabel: "重新播放影片",
      closeFilmLabel: "关闭放映",
      fullscreenLabel: "全屏",
      exitFullscreenLabel: "退出全屏",
      playChapter: "播放章节",
      languageSwitch: "Switch to English",
      manifestoTitle: "少一点噪音，<br>多一点好问题。",
      manifesto: "大多数投资工具在不断加噪音。StockDesk 做的是减法：一个 HUB、一份每日策略、一个诚实的持仓视图，需要时再打开模型。",
      questionsLabel: "交易前，先回答三个问题",
      tabMarket: "市场怎么样？",
      tabPortfolio: "我的仓位怎么样？",
      tabModels: "模型怎么说？",
      factHub: "HUB 入口",
      factIndices: "A 股核心指数",
      factCloud: "云端账户",
      filmTitle: "看这张桌子<br class=\"mobile-break\">怎么动。",
      filmText: "一段没有摆拍的短演示：HUB、每日策略、持仓和模型。",
      chHub: "HUB",
      chHubDesc: "先看全貌，再看细节。",
      chDaily: "每日策略",
      chDailyDesc: "今天该进攻，还是等待。",
      chPortfolio: "持仓",
      chPortfolioDesc: "成本、压力与筹码。",
      chModels: "模型",
      chModelsDesc: "描述状态，不预测明天。",
      chUS: "美股版",
      chUSDesc: "从桌面到口袋，再到美股。",
      deskTitle: "三个问题，<br>一个地方回答。",
      deskText: "用下面的标签看看同一张桌子如何随问题变化。",
      marketH: "宽度、情绪，和今天的计划。",
      marketP: "每日策略先给出市场状态、涨跌宽度和明天的关键位。它告诉你今天是该进攻，还是该等一等。",
      marketL1: "指数趋势、RSI 与支撑/压力",
      marketL2: "涨跌宽度、成交额与最强板块",
      marketL3: "仓位区间，而不是一句预测",
      capMarket: "每日策略 + 板块宽度",
      portfolioH: "成本、筹码、支撑，都在一张图里。",
      portfolioP: "持仓页把成本、支撑压力、筹码分布和已实现盈亏放在一起；复盘页再把这些交易讲成一个可以学习的故事。",
      portfolioL1: "每只持仓的支撑与压力",
      portfolioL2: "筹码分布与获利比例",
      portfolioL3: "净值、回撤与交易统计",
      capPortfolio: "持仓 + 支撑/压力",
      modelsH: "HMM 管仓位，渗流管行业。",
      modelsP: "五个 A 股指数的 HMM 给出总仓位；渗流最大连通簇判断上涨是否连成片。个股建议会结合你真实的持仓和成本。",
      modelsL1: "强势 / 震荡 / 弱势三状态",
      modelsL2: "最大连通簇与行业临界",
      modelsL3: "加仓 / 减仓 / 止损股数",
      capModels: "HMM + 渗流 + 个股仓位",
      bookTitle: "你的仓位，<br>不用很吵。",
      bookText: "成本、支撑、压力、筹码和已实现盈亏放在一处。复盘页把交易变成经验，而不是一张流水账。",
      bookS1: "成本 + 筹码",
      bookS1n: "人群被困在哪里",
      bookS2: "净值 + 回撤",
      bookS2n: "风险真正长什么样",
      modelTitle: "模型描述现在，<br>不预测明天。",
      modelText: "五个 A 股指数的三状态 HMM 给出总仓位；渗流寻找最大 4 邻接连通簇，区分“普涨扩散”和“少数股票在动”；个股建议跟随你的真实持仓。",
      editionsTitle: "选一个入口。",
      editionsText: "macOS、Windows、iOS、美股版与容器，共用一套数据习惯。",
      edMac: "原生窗口，双击即用。",
      edWin: "单文件 exe，WebView2。",
      edIOS: "装在口袋里的 HUB。",
      edUS: "独立的美股仪表盘。",
      edDocker: "A 股 / 美股容器。",
      startTitle: "选最短的<br>一条路。",
      startText: "下载 Release、跑一个容器，或者从源码构建。<br>教程里写了第一次打开的五分钟和每天的使用顺序。",
      dl: "Releases →",
      gd: "教程 →",
      copy: "复制",
      copied: "已复制",
      release: "Releases",
      closeTitle: "工具应该让你<br class=\"mobile-break\">更平静，<br>而不是更忙。",
      closeText: "行情只用于研究。<br>HMM 与渗流是纪律和风险背景，不是明天的答案。",
      legal: "MIT · 行情仅供研究，不构成投资建议。",
      mobileFoot: "本地优先 · 账户数据留在本机<br>由 StockDesk 与一次安静的坚持构成。"
    },
    en: {
      navTag: "personal equity desk",
      navFilm: "Film",
      navDesk: "Desk",
      navEditions: "Editions",
      navStart: "Start",
      heroTitle: "One quiet desk<br>for the whole market.",
      heroAlt: "一张安静的桌子，看完整市场。",
      heroText: "StockDesk puts the market, your positions and the models on one calm screen. It runs on your machine, keeps your account local, and helps you answer three questions before you trade.",
      download: "Download",
      source: "View source",
      guide: "Read the guide →",
      guideShort: "Guide ↗",
      watchFilm: "Watch the film",
      watchChapter: "Watch in film",
      watchAgain: "Watch again",
      filmLength: "43 sec",
      withSound: "with sound",
      fiveChapters: "FIVE CHAPTERS · ONE DESK",
      floatA: "LOCAL-FIRST",
      floatB: "account data stays here",
      scrollHint: "Scroll to start with the film",
      musicLabel: "Background music",
      nowPlaying: "NOW PLAYING",
      soundOnLabel: "Turn background music off",
      soundOffLabel: "Turn background music on",
      playFilmLabel: "Play the film",
      pauseFilmLabel: "Pause the film",
      replayFilmLabel: "Replay the film",
      closeFilmLabel: "Close the film",
      fullscreenLabel: "Fullscreen",
      exitFullscreenLabel: "Exit fullscreen",
      playChapter: "PLAY CHAPTER",
      languageSwitch: "切换到中文",
      manifestoTitle: "Less noise.<br>Better questions.",
      manifesto: "Most investing tools add more noise. StockDesk removes it: one HUB, one daily plan, one honest view of your positions — then the models, only when you need them.",
      questionsLabel: "Three questions before you trade",
      tabMarket: "How is the market?",
      tabPortfolio: "How is my book?",
      tabModels: "What do the models say?",
      factHub: "HUB entries",
      factIndices: "A-share indices",
      factCloud: "cloud account",
      filmTitle: "Watch the desk<br class=\"mobile-break\"> move.",
      filmText: "A short, unedited walk through the HUB, the daily plan, the portfolio and the models.",
      chHub: "The HUB",
      chHubDesc: "See the whole board first.",
      chDaily: "Daily Plan",
      chDailyDesc: "Attack or wait.",
      chPortfolio: "Your Book",
      chPortfolioDesc: "Cost, pressure, chips.",
      chModels: "Models",
      chModelsDesc: "Describe. Don’t predict.",
      chUS: "US edition",
      chUSDesc: "Desktop, pocket, US edition.",
      deskTitle: "Three questions.<br>One place to answer them.",
      deskText: "Use the tabs to see how the same desk changes with the question you are asking.",
      marketH: "Breadth, mood and the day’s plan.",
      marketP: "Daily Plan opens with the market state, breadth and tomorrow’s levels. It tells you whether today is a day to press or a day to wait.",
      marketL1: "Index trend, RSI and support/resistance",
      marketL2: "Breadth, turnover and the strongest sectors",
      marketL3: "A position range, not a prediction",
      capMarket: "Daily Plan + sector breadth",
      portfolioH: "Cost, chips and pressure in one view.",
      portfolioP: "The portfolio page keeps cost, support, chip distribution and realized P&L together. The review page turns those trades into a story you can learn from.",
      portfolioL1: "Support and pressure per position",
      portfolioL2: "Chip distribution and profit ratio",
      portfolioL3: "NAV, drawdown and trade statistics",
      capPortfolio: "Portfolio + support/pressure",
      modelsH: "HMM for exposure. Percolation for sectors.",
      modelsP: "A 3-state HMM on five A-share indices suggests total exposure; percolation checks whether gains are connected. Per-stock guidance follows your real holdings and cost.",
      modelsL1: "Strong / range / weak states",
      modelsL2: "Largest cluster + industry criticality",
      modelsL3: "Add / trim / stop-out share counts",
      capModels: "HMM + percolation + per-stock guidance",
      bookTitle: "Your book,<br>without the noise.",
      bookText: "Cost, support, pressure, chips and realized P&L in one place. The review page turns trades into experience, not a ledger.",
      bookS1: "Cost + chips",
      bookS1n: "Where the crowd is trapped",
      bookS2: "NAV + drawdown",
      bookS2n: "What the risk really looked like",
      modelTitle: "Models describe.<br>They do not predict.",
      modelText: "A 3-state HMM on five A-share indices suggests total exposure. Percolation finds the largest four-neighbour cluster, separating broad diffusion from a few moving names. Per-stock guidance follows your actual holdings.",
      editionsTitle: "Pick an edition.",
      editionsText: "macOS, Windows, iOS, the US edition and containers, with the same data habits.",
      edMac: "Native window. Double-click.",
      edWin: "One-file exe, WebView2.",
      edIOS: "The HUB in your pocket.",
      edUS: "A separate US dashboard.",
      edDocker: "A-share and US images.",
      startTitle: "Pick the<br>shortest path.",
      startText: "Download a release, run a container, or build from source.<br>The guide covers the first five minutes and the daily routine.",
      dl: "Releases →",
      gd: "Guide →",
      copy: "COPY",
      copied: "COPIED",
      release: "Releases",
      closeTitle: "A tool should make you<br>calmer, not busier.",
      closeText: "Quotes are for research.<br>HMM and percolation are discipline and risk context, not tomorrow’s answer.",
      legal: "MIT · market data for research only, not investment advice.",
      mobileFoot: "LOCAL-FIRST · account data stays on your machine<br>Built by StockDesk, with a little quiet stubbornness."
    }
  };

  const DESK_CONTENT = {
    market: {
      img: "./assets/daily.png",
      title: "marketH",
      body: "marketP",
      list: ["marketL1", "marketL2", "marketL3"],
      cap: "capMarket"
    },
    portfolio: {
      img: "./assets/portfolio.png",
      title: "portfolioH",
      body: "portfolioP",
      list: ["portfolioL1", "portfolioL2", "portfolioL3"],
      cap: "capPortfolio"
    },
    models: {
      img: "./assets/models.png",
      title: "modelsH",
      body: "modelsP",
      list: ["modelsL1", "modelsL2", "modelsL3"],
      cap: "capModels"
    }
  };

  const CHAPTERS = [
    { time: 7, key: "chHub", desc: "chHubDesc" },
    { time: 15, key: "chDaily", desc: "chDailyDesc" },
    { time: 20.5, key: "chPortfolio", desc: "chPortfolioDesc" },
    { time: 26.5, key: "chModels", desc: "chModelsDesc" },
    { time: 32.5, key: "chUS", desc: "chUSDesc" }
  ];

  let lang = localStorage.getItem("stockdesk-site-lang") || "zh";
  if (lang !== "zh" && lang !== "en") lang = "zh";
  let currentTab = "market";
  let currentChapter = 0;

  const header = $("#siteHeader");
  const pageProgress = $("#pageProgress");
  const main = $("main");
  const toast = $("#toast");
  const langButtons = $$("[data-lang-toggle]");
  const soundToggles = $$("[data-sound-toggle]");
  const menuButton = $("#menuButton");
  const mobileMenu = $("#mobileMenu");
  const mobileClose = $("#mobileClose");

  const audio = $("#soundtrack");
  const nowPlaying = $("#nowPlaying");
  const preview = $("#previewVideo");
  const previewProgress = $("#previewProgress");
  const filmFrame = $("#filmFrame");
  const heroVisual = $(".hero-visual");

  const chapterButtons = $$(".chapter");
  const stageImages = $$("#stageImages img");
  const stageNo = $("#stageNo");
  const stageTitle = $("#stageTitle");
  const stageTime = $("#stageTime");
  const stagePlay = $("#stagePlay");

  const tabButtons = $$("#deskTabs button");
  const tabList = $("#deskTabs");
  const deskVisual = $(".desk-visual");
  const deskImg = $("#deskImg");
  const deskCap = $("#deskCap");
  const deskTitle = $("#deskTitle");
  const deskBody = $("#deskBody");
  const deskList = $("#deskList");

  const cinema = $("#cinema");
  const filmVideo = $("#filmVideo");
  const cinemaClose = $("#cinemaClose");
  const cinemaPlay = $("#cinemaPlay");
  const cinemaBigPlay = $("#cinemaBigPlay");
  const cinemaReplay = $("#cinemaReplay");
  const cinemaLoader = $("#cinemaLoader");
  const cinemaEndCard = $("#cinemaEndCard");
  const cinemaError = $("#cinemaError");
  const cinemaTitle = $("#cinemaTitle");
  const filmChapterLabel = $("#filmChapterLabel");
  const filmTime = $("#filmTime");
  const filmDuration = $("#filmDuration");
  const seek = $("#seek");
  const cinemaChapters = $$("#cinemaChapters button");
  const cinemaFullscreen = $("#cinemaFullscreen");

  const FALLBACK_DURATION = 42.8;
  const PREVIEW_IN = 7.5;
  const PREVIEW_OUT = 38.2;
  const PAGE_VOLUME = 0.28;
  const CINEMA_VOLUME = 0.47;

  let soundOn = false;
  let userMuted = false;
  let audioFadeFrame = 0;
  let audioPauseTimer = 0;
  let toastTimer = null;
  let menuOpen = false;
  let menuLastFocus = null;
  let cinemaOpen = false;
  let lastFocusedElement = null;
  let pendingSeek = null;
  let previewReady = false;
  let previewVisible = true;
  let lastCinemaChapter = -1;
  let nowPlayingIdleTimer = 0;
  let scrollTicking = false;

  /* ============================================================
     Helpers
     ============================================================ */

  function formatClock(value, ceil = false) {
    const total = Math.max(0, Number.isFinite(value) ? value : 0);
    const whole = ceil ? Math.ceil(total) : Math.floor(total);
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function showToast(message, duration = 2200) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), duration);
  }

  /* ============================================================
     Language
     ============================================================ */

  function applyLanguage() {
    const dict = T[lang];
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    $$("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (key && dict[key] != null) el.innerHTML = dict[key];
    });
    langButtons.forEach((button) => {
      button.textContent = lang === "zh" ? "EN" : "中";
      button.setAttribute("aria-label", dict.languageSwitch);
    });
    document.title = lang === "zh"
      ? "StockDesk · 一张安静的书桌"
      : "StockDesk · A quiet desk for the whole market";
    setDeskTab(currentTab, { animate: false });
    setChapter(currentChapter);
    updatePlaybackLabels();
    updateCinemaLabels();
    syncSoundUI();
    updateMenuLabels();
  }

  function toggleLanguage() {
    lang = lang === "zh" ? "en" : "zh";
    localStorage.setItem("stockdesk-site-lang", lang);
    applyLanguage();
  }

  langButtons.forEach((button) => button.addEventListener("click", toggleLanguage));

  /* ============================================================
     Desk tabs
     ============================================================ */

  function setDeskTab(key, { animate = true } = {}) {
    if (!DESK_CONTENT[key]) return;
    const dict = T[lang];
    const data = DESK_CONTENT[key];
    currentTab = key;

    tabButtons.forEach((button) => {
      const active = button.dataset.k === key;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $(".desk-view")?.setAttribute("aria-labelledby", `desk-tab-${key}`);

    deskTitle.innerHTML = dict[data.title];
    deskBody.textContent = dict[data.body];
    deskList.innerHTML = data.list.map((item) => `<li>${dict[item]}</li>`).join("");
    deskTitle.dataset.i18n = data.title;
    deskBody.dataset.i18n = data.body;
    deskList.dataset.i18n = "";
    deskCap.textContent = dict[data.cap];
    deskCap.dataset.i18n = data.cap;
    deskImg.alt = dict[data.title];

    const swap = () => {
      if (deskImg.getAttribute("src") !== data.img) deskImg.src = data.img;
      deskVisual.classList.remove("is-swapping");
    };
    if (animate) {
      deskVisual.classList.add("is-swapping");
      window.setTimeout(swap, 130);
    } else {
      swap();
    }
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setDeskTab(button.dataset.k));
  });
  tabList?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...tabButtons];
    const current = items.indexOf(document.activeElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    setDeskTab(items[next].dataset.k);
  });

  if (tabButtons.length) {
    tabButtons.forEach((button, i) => {
      button.id = `desk-tab-${button.dataset.k}`;
      button.setAttribute("aria-controls", "desk-panel");
      button.tabIndex = button.classList.contains("active") ? 0 : -1;
      if (i === 0) {
        // keep the first item focusable even before applyLanguage runs
      }
    });
    $(".desk-view")?.setAttribute("id", "desk-panel");
    $(".desk-view")?.setAttribute("role", "tabpanel");
  }

  /* ============================================================
     Chapter stage
     ============================================================ */

  function chapterLabel(index) {
    return T[lang][CHAPTERS[index].key];
  }

  function setChapter(index) {
    const i = clamp(index, 0, CHAPTERS.length - 1);
    currentChapter = i;
    chapterButtons.forEach((button, n) => {
      const active = n === i;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "true" : "false");
    });
    stageImages.forEach((image, n) => image.classList.toggle("is-active", n === i));
    if (stageNo) stageNo.textContent = String(i + 1).padStart(2, "0");
    if (stageTitle) stageTitle.textContent = chapterLabel(i);
    if (stageTime) stageTime.textContent = formatClock(CHAPTERS[i].time);
    if (stagePlay) {
      stagePlay.dataset.time = String(CHAPTERS[i].time);
      stagePlay.setAttribute("aria-label", `${T[lang].playChapter} / ${chapterLabel(i)}`);
    }
  }

  chapterButtons.forEach((button, index) => {
    button.addEventListener("mouseenter", () => setChapter(index));
    button.addEventListener("focus", () => setChapter(index));
    button.addEventListener("click", () => openFilm(CHAPTERS[index].time));
  });

  /* ============================================================
     Soundtrack
     ============================================================ */

  function fadeAudio(target, duration = 800, onDone) {
    if (!audio) return;
    window.cancelAnimationFrame(audioFadeFrame);
    window.clearTimeout(audioPauseTimer);
    const from = audio.volume;
    const to = clamp(target, 0, 1);
    const start = performance.now();
    const step = (now) => {
      const progress = clamp((now - start) / Math.max(1, duration), 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      try { audio.volume = from + (to - from) * eased; } catch (_) {}
      if (progress < 1) {
        audioFadeFrame = window.requestAnimationFrame(step);
      } else if (typeof onDone === "function") {
        onDone();
      }
    };
    audioFadeFrame = window.requestAnimationFrame(step);
  }

  function soundTargetVolume() {
    return cinemaOpen ? CINEMA_VOLUME : PAGE_VOLUME;
  }

  function syncSoundUI() {
    document.body.classList.toggle("sound-on", soundOn);
    soundToggles.forEach((button) => {
      button.setAttribute("aria-pressed", String(soundOn));
      if (button.classList.contains("sound-button") || button.classList.contains("cinema-sound")) {
        button.setAttribute("aria-label", soundOn ? T[lang].soundOnLabel : T[lang].soundOffLabel);
      } else if (button.classList.contains("record-button")) {
        button.setAttribute("aria-label", soundOn ? T[lang].soundOnLabel : T[lang].soundOffLabel);
      }
    });
    $$(".sound-label, .cinema-sound [data-sound-label]").forEach((label) => {
      label.textContent = soundOn ? "SND ON" : "SND OFF";
    });
    if (nowPlaying) {
      nowPlaying.classList.toggle("is-on", soundOn);
      nowPlaying.setAttribute("aria-hidden", String(!soundOn));
    }
    scheduleNowPlayingIdle();
  }

  function enableSound({ silent = false } = {}) {
    if (!audio) return;
    window.clearTimeout(audioPauseTimer);
    soundOn = true;
    userMuted = false;
    syncSoundUI();
    try { audio.volume = Math.max(audio.volume, 0.001); } catch (_) {}
    const promise = audio.play();
    if (promise && typeof promise.then === "function") {
      promise.then(() => {
        fadeAudio(soundTargetVolume(), cinemaOpen ? 500 : 1200);
      }).catch(() => {
        soundOn = false;
        syncSoundUI();
        if (!silent) showToast(lang === "zh" ? "浏览器暂未允许播放声音，请再点一次。" : "The browser blocked audio. Tap once more.");
      });
    }
  }

  function disableSound() {
    if (!audio) return;
    window.cancelAnimationFrame(audioFadeFrame);
    window.clearTimeout(audioPauseTimer);
    soundOn = false;
    userMuted = true;
    syncSoundUI();
    fadeAudio(0, 420, () => {
      if (!soundOn) audio.pause();
    });
  }

  function toggleSound() {
    if (soundOn) disableSound();
    else enableSound();
  }

  soundToggles.forEach((button) => button.addEventListener("click", toggleSound));

  function scheduleNowPlayingIdle() {
    if (!nowPlaying) return;
    window.clearTimeout(nowPlayingIdleTimer);
    nowPlaying.classList.remove("is-idle");
    if (!soundOn || !window.matchMedia("(max-width: 720px)").matches) return;
    nowPlayingIdleTimer = window.setTimeout(() => {
      if (soundOn) nowPlaying.classList.add("is-idle");
    }, 4200);
  }

  nowPlaying?.addEventListener("pointerenter", () => {
    window.clearTimeout(nowPlayingIdleTimer);
    nowPlaying.classList.remove("is-idle");
  });
  nowPlaying?.addEventListener("focusin", () => {
    window.clearTimeout(nowPlayingIdleTimer);
    nowPlaying.classList.remove("is-idle");
  });
  nowPlaying?.addEventListener("pointerleave", () => {
    if (soundOn) scheduleNowPlayingIdle();
  });
  nowPlaying?.addEventListener("focusout", () => {
    if (soundOn) scheduleNowPlayingIdle();
  });
  audio?.addEventListener("playing", syncSoundUI);
  audio?.addEventListener("error", () => {
    showToast(lang === "zh" ? "背景音乐加载失败。" : "The soundtrack could not be loaded.");
  });
  audio?.addEventListener("ended", () => {
    // audio.loop should prevent this, but keep the UI honest if the browser stops it.
    soundOn = false;
    syncSoundUI();
  });

  /* ============================================================
     Preview
     ============================================================ */

  function paintPreviewProgress() {
    if (!preview || !previewProgress) return;
    const span = PREVIEW_OUT - PREVIEW_IN;
    const current = clamp(preview.currentTime - PREVIEW_IN, 0, span);
    previewProgress.style.width = `${(current / span) * 100}%`;
  }

  function startPreview() {
    if (!preview || !previewReady || reduceMotion || document.hidden || !previewVisible || cinemaOpen) return;
    const promise = preview.play();
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
  }

  function stopPreview() {
    if (preview) preview.pause();
  }

  function preparePreview() {
    if (!preview) return;
    previewReady = true;
    try {
      if (preview.currentTime < PREVIEW_IN - 0.5) preview.currentTime = PREVIEW_IN;
    } catch (_) {}
    paintPreviewProgress();
    startPreview();
  }

  function initPreview() {
    if (!preview || reduceMotion) return;
    preview.addEventListener("loadedmetadata", () => {
      if (!previewReady) preparePreview();
    });
    preview.addEventListener("playing", () => {
      if (preview.currentTime < PREVIEW_IN - 0.75) {
        try { preview.currentTime = PREVIEW_IN; } catch (_) {}
      }
    });
    preview.addEventListener("timeupdate", () => {
      if (preview.currentTime >= PREVIEW_OUT) {
        try { preview.currentTime = PREVIEW_IN; } catch (_) {}
      }
      if (preview.currentTime >= PREVIEW_IN - 0.35) {
        preview.closest(".frame-screen")?.classList.add("is-live");
      }
      paintPreviewProgress();
    });
    preview.addEventListener("seeked", () => {
      if (preview.currentTime >= PREVIEW_IN - 0.35) {
        preview.closest(".frame-screen")?.classList.add("is-live");
      }
    });
    if (preview.readyState >= 1) preparePreview();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        previewVisible = entry.isIntersecting;
        if (previewVisible) startPreview();
        else stopPreview();
      });
    }, { threshold: 0.12 });
    if (heroVisual) observer.observe(heroVisual);
  }

  document.addEventListener("visibilitychange", () => {
    if (!preview) return;
    if (document.hidden) stopPreview();
    else startPreview();
  });

  /* ============================================================
     Cinema
     ============================================================ */

  function durationOfVideo() {
    return filmVideo && Number.isFinite(filmVideo.duration) && filmVideo.duration > 0
      ? filmVideo.duration
      : FALLBACK_DURATION;
  }

  function cinemaChapterAt(time) {
    let index = 0;
    for (let i = 0; i < CHAPTERS.length; i += 1) {
      if (time + 0.001 >= CHAPTERS[i].time) index = i;
      else break;
    }
    return index;
  }

  function updateCinemaLabels() {
    if (!filmVideo) return;
    const time = filmVideo.currentTime || 0;
    const duration = durationOfVideo();
    const index = cinemaChapterAt(time);
    const chapter = CHAPTERS[index];
    const dict = T[lang];

    if (filmTime) filmTime.textContent = formatClock(time);
    if (filmDuration) filmDuration.textContent = formatClock(duration, true);
    if (seek) {
      if (Math.abs(Number(seek.max) - duration) > 0.15) seek.max = String(duration);
      const pct = clamp((time / Math.max(0.1, duration)) * 100, 0, 100);
      seek.value = String(time);
      seek.style.setProperty("--seek", `${pct}%`);
    }

    let top = "PROLOGUE";
    if (time >= 39) top = "END TITLE";
    else if (time >= CHAPTERS[0].time) top = `${String(index + 1).padStart(2, "0")} — ${dict[chapter.key]}`;
    if (cinemaTitle && cinemaTitle.textContent !== top) cinemaTitle.textContent = top;

    if (filmChapterLabel) {
      const label = time >= 39 ? "END TITLE" : time < CHAPTERS[0].time ? "PROLOGUE" : dict[chapter.key];
      if (filmChapterLabel.textContent !== label) filmChapterLabel.textContent = label;
    }

    if (lastCinemaChapter !== index) {
      lastCinemaChapter = index;
      cinemaChapters.forEach((button, n) => {
        const active = n === index;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-current", active ? "true" : "false");
      });
    }
  }

  function updatePlaybackLabels() {
    if (!filmVideo) return;
    const paused = filmVideo.paused || filmVideo.ended;
    if (cinemaPlay) cinemaPlay.setAttribute("aria-label", paused ? T[lang].playFilmLabel : T[lang].pauseFilmLabel);
    if (cinemaBigPlay) {
      cinemaBigPlay.setAttribute(
        "aria-label",
        filmVideo.ended ? T[lang].replayFilmLabel : paused ? T[lang].playFilmLabel : T[lang].pauseFilmLabel
      );
    }
    if (cinemaClose) cinemaClose.setAttribute("aria-label", T[lang].closeFilmLabel);
    if (cinemaFullscreen) {
      const full = Boolean(document.fullscreenElement);
      cinemaFullscreen.setAttribute("aria-label", full ? T[lang].exitFullscreenLabel : T[lang].fullscreenLabel);
    }
    if (stagePlay) stagePlay.setAttribute("aria-label", `${T[lang].playChapter} / ${chapterLabel(currentChapter)}`);
    const screenPlay = $(".screen-play");
    if (screenPlay) screenPlay.setAttribute("aria-label", T[lang].playFilmLabel);
  }

  function playFilm() {
    if (!filmVideo) return;
    if (filmVideo.ended) {
      try { filmVideo.currentTime = 0; } catch (_) {}
    }
    cinema.classList.remove("is-ended");
    if (cinemaEndCard) cinemaEndCard.setAttribute("aria-hidden", "true");
    const promise = filmVideo.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => cinema.classList.add("is-paused"));
    }
  }

  function pauseFilm() {
    if (filmVideo) filmVideo.pause();
  }

  function toggleFilmPlayback() {
    if (!filmVideo) return;
    if (filmVideo.paused || filmVideo.ended) playFilm();
    else pauseFilm();
  }

  function setSeek(time, { play = false } = {}) {
    if (!filmVideo) return;
    const target = clamp(time, 0, durationOfVideo() - 0.05);
    cinema.classList.remove("is-ended");
    if (cinemaEndCard) cinemaEndCard.setAttribute("aria-hidden", "true");
    if (filmVideo.readyState >= 1) {
      try { filmVideo.currentTime = target; } catch (_) { pendingSeek = target; }
      updateCinemaLabels();
    } else {
      pendingSeek = target;
    }
    if (play) playFilm();
  }

  function openFilm(time = 0) {
    if (!cinema || !filmVideo) return;
    closeMenu({ restoreFocus: false });

    if (!cinemaOpen) {
      lastFocusedElement = document.activeElement;
      cinemaOpen = true;
      document.body.classList.add("cinema-open");
      cinema.inert = false;
      cinema.setAttribute("aria-hidden", "false");
      cinema.classList.add("is-open", "is-paused");
      cinema.classList.remove("is-ended", "is-loading");
      if (cinemaEndCard) cinemaEndCard.setAttribute("aria-hidden", "true");
      if (header) header.inert = true;
      if (main) main.inert = true;
      stopPreview();
      lastCinemaChapter = -1;
      if (!soundOn && !userMuted) enableSound({ silent: true });
      else if (soundOn) fadeAudio(CINEMA_VOLUME, 500);
      window.setTimeout(() => {
        if (cinemaOpen && cinemaClose) cinemaClose.focus({ preventScroll: true });
      }, 520);
    }

    const target = clamp(Number(time) || 0, 0, durationOfVideo() - 0.05);
    if (filmVideo.readyState >= 1) {
      try { filmVideo.currentTime = target; } catch (_) { pendingSeek = target; }
    } else {
      pendingSeek = target;
    }
    updateCinemaLabels();
    updatePlaybackLabels();
    playFilm();
  }

  function closeFilm({ restoreFocus = true } = {}) {
    if (!cinemaOpen) return;
    cinemaOpen = false;
    if (filmVideo) filmVideo.pause();
    if (cinema) {
      cinema.classList.remove("is-open", "is-paused", "is-playing", "is-ended", "is-loading");
      cinema.setAttribute("aria-hidden", "true");
      cinema.inert = true;
    }
    document.body.classList.remove("cinema-open");
    if (header) header.inert = false;
    if (main) main.inert = false;
    if (soundOn) fadeAudio(PAGE_VOLUME, 700);
    startPreview();
    if (restoreFocus && lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      const target = lastFocusedElement;
      window.setTimeout(() => target.focus({ preventScroll: true }), 60);
    }
    pendingSeek = null;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function initCinema() {
    if (!filmVideo) return;
    filmVideo.addEventListener("loadedmetadata", () => {
      if (filmDuration) filmDuration.textContent = formatClock(durationOfVideo(), true);
      if (pendingSeek !== null) {
        const target = pendingSeek;
        pendingSeek = null;
        try { filmVideo.currentTime = target; } catch (_) {}
      }
      updateCinemaLabels();
    });
    filmVideo.addEventListener("timeupdate", updateCinemaLabels);
    filmVideo.addEventListener("play", () => {
      cinema.classList.remove("is-paused", "is-ended");
      cinema.classList.add("is-playing");
      if (cinemaEndCard) cinemaEndCard.setAttribute("aria-hidden", "true");
      updatePlaybackLabels();
      updateCinemaLabels();
      smoothUpdate();
    });
    filmVideo.addEventListener("pause", () => {
      cinema.classList.add("is-paused");
      cinema.classList.remove("is-playing");
      updatePlaybackLabels();
    });
    filmVideo.addEventListener("waiting", () => {
      if (cinemaOpen) cinema.classList.add("is-loading");
    });
    filmVideo.addEventListener("playing", () => {
      cinema.classList.remove("is-loading");
      updateCinemaLabels();
    });
    filmVideo.addEventListener("canplay", () => cinema.classList.remove("is-loading"));
    filmVideo.addEventListener("ended", () => {
      cinema.classList.add("is-ended", "is-paused");
      cinema.classList.remove("is-playing");
      if (cinemaEndCard) cinemaEndCard.setAttribute("aria-hidden", "false");
      updatePlaybackLabels();
      updateCinemaLabels();
    });
    filmVideo.addEventListener("error", () => {
      if (cinemaError) cinemaError.hidden = false;
      cinema.classList.remove("is-loading");
    });
    if (filmVideo.readyState >= 1) {
      if (filmDuration) filmDuration.textContent = formatClock(durationOfVideo(), true);
    }
  }

  function smoothUpdate() {
    if (!cinemaOpen || !filmVideo) return;
    updateCinemaLabels();
    if (!filmVideo.paused && !filmVideo.ended) window.requestAnimationFrame(smoothUpdate);
  }

  cinemaClose?.addEventListener("click", () => closeFilm());
  cinemaPlay?.addEventListener("click", toggleFilmPlayback);
  cinemaBigPlay?.addEventListener("click", toggleFilmPlayback);
  cinemaReplay?.addEventListener("click", () => {
    if (!filmVideo) return;
    try { filmVideo.currentTime = 0; } catch (_) {}
    cinema.classList.remove("is-ended");
    playFilm();
  });
  seek?.addEventListener("input", () => {
    if (!filmVideo) return;
    const target = clamp(Number(seek.value) || 0, 0, durationOfVideo() - 0.05);
    try { filmVideo.currentTime = target; } catch (_) {}
    cinema.classList.remove("is-ended");
    updateCinemaLabels();
  });
  cinemaChapters.forEach((button) => {
    button.addEventListener("click", () => {
      setSeek(Number(button.dataset.time) || 0, { play: true });
    });
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-film]");
    if (!trigger) return;
    event.preventDefault();
    openFilm(Number(trigger.dataset.time) || 0);
  });

  function toggleFullscreen() {
    if (!cinema) return;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (!active) {
      const request = cinema.requestFullscreen || cinema.webkitRequestFullscreen;
      if (request) {
        const result = request.call(cinema);
        if (result && result.catch) result.catch(() => {});
      } else if (filmVideo && typeof filmVideo.webkitEnterFullscreen === "function") {
        filmVideo.webkitEnterFullscreen();
      } else {
        showToast(lang === "zh" ? "当前浏览器不支持全屏。" : "Fullscreen is not available in this browser.");
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }

  cinemaFullscreen?.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", updatePlaybackLabels);

  /* ============================================================
     Mobile menu
     ============================================================ */

  function updateMenuLabels() {
    if (!menuButton) return;
    menuButton.setAttribute("aria-label", menuOpen
      ? (lang === "zh" ? "关闭菜单" : "Close menu")
      : (lang === "zh" ? "打开菜单" : "Open menu"));
    if (mobileClose) mobileClose.setAttribute("aria-label", lang === "zh" ? "关闭菜单" : "Close menu");
  }

  function openMenu() {
    if (!mobileMenu || menuOpen) return;
    menuOpen = true;
    menuLastFocus = document.activeElement;
    mobileMenu.inert = false;
    mobileMenu.classList.add("is-open");
    mobileMenu.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-open");
    menuButton?.setAttribute("aria-expanded", "true");
    updateMenuLabels();
    window.setTimeout(() => {
      if (!menuOpen) return;
      mobileMenu.querySelector("a, button")?.focus({ preventScroll: true });
    }, 250);
  }

  function closeMenu({ restoreFocus = true } = {}) {
    if (!mobileMenu || !menuOpen) return;
    menuOpen = false;
    mobileMenu.classList.remove("is-open");
    mobileMenu.setAttribute("aria-hidden", "true");
    mobileMenu.inert = true;
    document.body.classList.remove("menu-open");
    menuButton?.setAttribute("aria-expanded", "false");
    updateMenuLabels();
    if (restoreFocus && menuLastFocus && typeof menuLastFocus.focus === "function") {
      menuLastFocus.focus({ preventScroll: true });
    }
  }

  menuButton?.addEventListener("click", () => {
    if (menuOpen) closeMenu();
    else openMenu();
  });
  mobileClose?.addEventListener("click", () => closeMenu());
  mobileMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMenu({ restoreFocus: false }));
  });

  /* ============================================================
     Scroll, theme and reveal
     ============================================================ */

  const themeSections = $$("main > section[data-theme]");

  function revealPassedContent() {
    const trigger = window.innerHeight - 24;
    $$(".reveal:not(.is-in)").forEach((el) => {
      if (el.getBoundingClientRect().top < trigger) el.classList.add("is-in");
    });
  }

  function updateScrollUI() {
    scrollTicking = false;
    const y = window.scrollY || window.pageYOffset;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    if (pageProgress) pageProgress.style.width = `${clamp((y / max) * 100, 0, 100)}%`;

    if (header) {
      header.classList.toggle("is-scrolled", y > 22);
      let current = "dark";
      themeSections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 72 && rect.bottom > 72) current = section.dataset.theme || "dark";
      });
      header.dataset.theme = current;
    }
    revealPassedContent();
  }

  function requestScrollUI() {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(updateScrollUI);
  }

  window.addEventListener("scroll", requestScrollUI, { passive: true });
  window.addEventListener("resize", requestScrollUI, { passive: true });

  const revealEls = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        obs.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }

  /* ============================================================
     Copy install snippet
     ============================================================ */

  const copyButton = $("#copyCode");
  const installCode = $("#installCode");
  if (copyButton && installCode) {
    copyButton.addEventListener("click", async () => {
      const text = installCode.textContent || "";
      let copied = false;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (_) {}
      }
      if (!copied) {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        try { copied = document.execCommand("copy"); } catch (_) {}
        area.remove();
      }
      if (copied) {
        copyButton.textContent = T[lang].copied;
        showToast(T[lang].copied);
        window.setTimeout(() => { copyButton.textContent = T[lang].copy; }, 1800);
      } else {
        showToast(lang === "zh" ? "复制失败，请手动选择命令。" : "Copy failed — select the commands manually.");
      }
    });
  }

  /* ============================================================
     Keyboard and focus
     ============================================================ */

  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  function visibleFocusable(container) {
    return $$(focusableSelector, container).filter((el) => {
      if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none";
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        event.preventDefault();
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
      }
      if (cinemaOpen) {
        closeFilm();
        event.preventDefault();
        return;
      }
      if (menuOpen) {
        closeMenu();
        event.preventDefault();
        return;
      }
    }

    if (cinemaOpen) {
      if (event.key === "Tab") {
        const items = visibleFocusable(cinema);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          last.focus({ preventScroll: true });
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
          first.focus({ preventScroll: true });
          event.preventDefault();
        }
        return;
      }
      const target = event.target;
      const inField = target instanceof Element && (target.matches("input, textarea, select") || target.isContentEditable);
      if (event.code === "Space" && !inField) {
        event.preventDefault();
        toggleFilmPlayback();
      } else if ((event.key === "k" || event.key === "K") && !inField) {
        event.preventDefault();
        toggleFilmPlayback();
      } else if (event.key === "ArrowRight" && !inField) {
        event.preventDefault();
        setSeek((filmVideo?.currentTime || 0) + 5);
      } else if (event.key === "ArrowLeft" && !inField) {
        event.preventDefault();
        setSeek((filmVideo?.currentTime || 0) - 5);
      } else if ((event.key === "m" || event.key === "M") && !inField) {
        event.preventDefault();
        toggleSound();
      } else if ((event.key === "f" || event.key === "F") && !inField) {
        event.preventDefault();
        toggleFullscreen();
      }
      return;
    }

    if (menuOpen && event.key === "Tab") {
      const items = visibleFocusable(mobileMenu);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus({ preventScroll: true });
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus({ preventScroll: true });
        event.preventDefault();
      }
    }
  });

  /* ============================================================
     Subtle hero tilt
     ============================================================ */

  if (filmFrame && heroVisual && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    heroVisual.addEventListener("pointermove", (event) => {
      const rect = heroVisual.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
      const y = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
      filmFrame.style.transform = `perspective(1400px) rotateX(${-y * 3.2}deg) rotateY(${x * 4.2}deg) rotate(0.65deg)`;
    });
    heroVisual.addEventListener("pointerleave", () => {
      filmFrame.style.transform = "perspective(1400px) rotateX(0deg) rotateY(0deg) rotate(0.65deg)";
    });
  }

  /* ============================================================
     Boot
     ============================================================ */

  if (mobileMenu) mobileMenu.inert = true;
  if (audio) audio.volume = 0;
  initPreview();
  initCinema();
  applyLanguage();
  updateScrollUI();
  revealPassedContent();
  updatePlaybackLabels();
  updateMenuLabels();
})();
