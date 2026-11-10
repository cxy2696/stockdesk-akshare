const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const state = {
  symbols: JSON.parse(localStorage.getItem('stockdesk-us-watch') || 'null') || ['AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','SPY'],
  quotes: {}, overview: null, selected: 'AAPL', range: 120, movers: 'gainers', chart: null
};
const fmt = {
  price(v) { return v == null ? '--' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) },
  pct(v) { return v == null ? '--' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%` },
  big(v) {
    if (v == null) return '--';
    const n = Number(v);
    if (n >= 1e12) return (n/1e12).toFixed(2)+'T';
    if (n >= 1e9) return (n/1e9).toFixed(2)+'B';
    if (n >= 1e6) return (n/1e6).toFixed(2)+'M';
    if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
    return String(Math.round(n));
  },
  cls(v) { return v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '' },
  time(ts) { return ts ? new Date(ts*1000).toLocaleTimeString('en-GB', { hour12: false }) : '--:--:--' }
};

async function api(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

function setIndices(rows) {
  const box = $('#indices');
  box.innerHTML = '';
  for (const ix of rows) {
    const el = document.createElement('div'); el.className = 'idx';
    el.innerHTML = `<span class="n">${ix.en}</span><span class="p">${fmt.price(ix.price)}</span><span class="c ${fmt.cls(ix.pct)}">${fmt.pct(ix.pct)}</span>`;
    box.appendChild(el);
  }
}

function renderWatch() {
  const box = $('#watchlist'); box.innerHTML = '';
  for (const sym of state.symbols) {
    const q = state.quotes[sym] || { symbol: sym, name: '' };
    const b = document.createElement('button');
    b.className = 'watch-row' + (sym === state.selected ? ' active' : '');
    b.innerHTML = `<span class="sym">${sym}</span><span class="px">${fmt.price(q.price)}</span>
      <span class="nm">${q.name || 'US Equity'}</span><span class="pc ${fmt.cls(q.pct)}">${fmt.pct(q.pct)}</span>`;
    b.onclick = () => selectSymbol(sym);
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×'; del.title = '移除';
    del.onclick = (e) => { e.stopPropagation(); removeSymbol(sym); };
    b.appendChild(del);
    box.appendChild(b);
  }
  $('#watch-count').textContent = String(state.symbols.length);
}

function renderDetail(q) {
  if (!q) return;
  $('#detail-name').textContent = q.name || q.symbol;
  $('#detail-symbol').textContent = q.symbol;
  $('#detail-market').textContent = 'US EQUITY · NASDAQ / NYSE';
  $('#detail-price').textContent = fmt.price(q.price);
  const c = $('#detail-change');
  c.textContent = `${q.change > 0 ? '+' : ''}${q.change == null ? '--' : Number(q.change).toFixed(2)}  ${fmt.pct(q.pct)}`;
  c.className = 'change ' + fmt.cls(q.pct);
  const stats = [
    ['开盘', fmt.price(q.open)], ['最高', fmt.price(q.high)], ['最低', fmt.price(q.low)],
    ['成交量', fmt.big(q.volume)], ['市值', fmt.big(q.market_cap)], ['市盈率', q.pe == null ? '--' : Number(q.pe).toFixed(1)]
  ];
  $('#detail-stats').innerHTML = stats.map(([k,v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}

function renderBreadth(b) {
  $('#breadth-ratio').textContent = `${b.ratio ?? '--'}% UP`;
  $('#b-up').textContent = b.up; $('#b-flat').textContent = b.flat; $('#b-down').textContent = b.down;
  const total = Math.max(b.up + b.flat + b.down, 1);
  $('#breadth-up').style.width = `${b.up/total*100}%`;
  $('#breadth-flat').style.width = `${b.flat/total*100}%`;
  $('#breadth-down').style.width = `${b.down/total*100}%`;
}

function renderMovers(rows) {
  const box = $('#movers'); box.innerHTML = '';
  if (!rows?.length) { box.innerHTML = '<div class="loading">暂无数据</div>'; return; }
  for (const m of rows) {
    const d = document.createElement('div'); d.className = 'mover';
    d.innerHTML = `<span class="s">${m.symbol}</span><span class="p">${fmt.price(m.price)}</span>
      <span class="n">${m.name || ''}</span><span class="c ${fmt.cls(m.pct)}">${fmt.pct(m.pct)}</span>`;
    d.onclick = () => selectSymbol(m.symbol);
    box.appendChild(d);
  }
}

async function loadQuotes() {
  try {
    const d = await api(`/api/us/quotes?symbols=${encodeURIComponent(state.symbols.join(','))}`);
    state.quotes = Object.fromEntries((d.items || []).map(q => [q.symbol, q]));
    renderWatch();
    if (state.quotes[state.selected]) renderDetail(state.quotes[state.selected]);
  } catch (e) { console.error(e); }
}

async function selectSymbol(sym) {
  state.selected = sym;
  if (!state.symbols.includes(sym)) { state.symbols.push(sym); persistWatch(); }
  renderWatch();
  try {
    const d = await api(`/api/us/quotes?symbols=${encodeURIComponent(sym)}`);
    const q = d.items?.[0];
    if (q) { state.quotes[sym] = q; renderDetail(q); }
  } catch (e) { console.error(e); }
  loadChart();
}

function persistWatch() {
  localStorage.setItem('stockdesk-us-watch', JSON.stringify(state.symbols));
  $('#watch-count').textContent = String(state.symbols.length);
}

function removeSymbol(sym) {
  if (state.symbols.length <= 1) return;
  state.symbols = state.symbols.filter(s => s !== sym);
  persistWatch();
  if (state.selected === sym) selectSymbol(state.symbols[0]); else { renderWatch(); loadQuotes(); }
}

async function loadChart() {
  const sym = state.selected;
  try {
    const d = await api(`/api/us/klines/${encodeURIComponent(sym)}?limit=${state.range}`);
    const rows = d.items || [];
    if (!rows.length) return;
    const dates = rows.map(x => x.date.slice(5));
    const vals = rows.map(x => [x.open, x.close, x.low, x.high]);
    const vols = rows.map((x, i) => ({ value: x.volume, itemStyle: { color: x.close >= x.open ? 'rgba(85,214,160,.55)' : 'rgba(255,107,107,.55)' } }));
    if (!state.chart) state.chart = echarts.init($('#chart'), null, { renderer: 'canvas' });
    state.chart.setOption({
      animation: false,
      backgroundColor: 'transparent',
      grid: [{ left: 54, right: 16, top: 18, height: '62%' }, { left: 54, right: 16, top: '76%', height: '13%' }],
      xAxis: [
        { type: 'category', data: dates, boundaryGap: true, axisLine: { lineStyle: { color: '#2b342e' } }, axisLabel: { color: '#7c887f', fontSize: 9 }, splitLine: { show: false } },
        { type: 'category', gridIndex: 1, data: dates, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } }
      ],
      yAxis: [
        { scale: true, axisLabel: { color: '#7c887f', fontSize: 9, formatter: v => Number(v).toFixed(0) }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.045)' } } },
        { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } }
      ],
      dataZoom: [{ type: 'inside', xAxisIndex: [0,1], start: 40, end: 100 }],
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, backgroundColor: 'rgba(8,12,10,.94)', borderColor: 'rgba(226,195,74,.3)', textStyle: { color: '#eef1ea', fontSize: 11 } },
      series: [
        { type: 'candlestick', data: vals, itemStyle: { color: '#55d6a0', color0: '#ff6b6b', borderColor: '#55d6a0', borderColor0: '#ff6b6b' } },
        { type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: vols, barWidth: '55%' }
      ]
    }, true);
    $('#chart-note').textContent = `${d.name || sym} · 日线 · 前复权`;
  } catch (e) { console.error(e); }
}

async function loadOverview() {
  try {
    const d = await api('/api/us/overview');
    state.overview = d;
    setIndices(d.indices || []);
    renderBreadth(d.breadth || {});
    renderMovers((state.movers === 'gainers' ? d.gainers : d.losers) || []);
    $('#data-time').textContent = `数据 ${fmt.time(d.updated)}`;
  } catch (e) { console.error(e); }
}

async function refresh() { await Promise.all([loadOverview(), loadQuotes()]); }

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  const box = $('#suggest');
  if (!q) { box.classList.remove('show'); return; }
  searchTimer = setTimeout(async () => {
    try {
      const d = await api(`/api/us/search?q=${encodeURIComponent(q)}`);
      box.innerHTML = '';
      for (const it of d.items || []) {
        const b = document.createElement('button');
        b.innerHTML = `<span class="s">${it.symbol}</span><span class="n">${it.name} · ${it.market || ''}</span>`;
        b.onclick = () => { box.classList.remove('show'); $('#search').value = ''; selectSymbol(it.symbol); };
        box.appendChild(b);
      }
      box.classList.toggle('show', !!box.children.length);
    } catch (e) { console.error(e); }
  }, 250);
});
document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) $('#suggest').classList.remove('show'); });

$$('#range-tabs button').forEach(b => b.onclick = () => {
  $$('#range-tabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); state.range = Number(b.dataset.range); loadChart();
});
$$('.switch button').forEach(b => b.onclick = () => {
  $$('.switch button').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); state.movers = b.dataset.kind; renderMovers(state.overview?.[state.movers] || []);
});

function clock() { $('#clock').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false }); }
setInterval(clock, 1000); clock();
renderWatch();
selectSymbol('AAPL');
refresh();
setInterval(refresh, 60000);
window.addEventListener('resize', () => state.chart?.resize());
