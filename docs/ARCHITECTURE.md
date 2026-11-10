# Architecture / 架构

## Overview / 总览

```
┌───────────────────────────────────────────────────────┐
│ Desktop (macOS / Windows)                             │
│  React + Vite + AntD + ECharts                        │
│        ↕ HTTP /api                                    │
│  FastAPI + SQLite + market adapters                   │
│        ↕ pywebview native window                      │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ iOS                                                   │
│  SwiftUI + Swift Charts + URLSession                  │
│  local JSON persistence, direct Eastmoney requests    │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ US Edition                                            │
│  FastAPI + static HTML/CSS/JS + ECharts               │
│  Eastmoney US endpoints, in-memory TTL cache          │
└───────────────────────────────────────────────────────┘
```

## Desktop

- `desktop/main.py` — starts uvicorn on 127.0.0.1, opens a native pywebview window; falls back to the default browser.
- `desktop/backend/app.py` — FastAPI app + static SPA serving.
- `desktop/backend/market.py` — Eastmoney A-share quotes, K-lines, indices, search.
- `desktop/backend/models.py` — 3-state Gaussian HMM (Baum-Welch / posterior) and percolation giant component.
- `desktop/backend/portfolio.py` — trades, cost basis, NAV, drawdown.
- `desktop/backend/db.py` — SQLite storage and JSON cache.
- `desktop/frontend/src` — React pages, HUD, themes, ECharts views.

### HMM

- Input: daily log returns of five A-share indices.
- 3 hidden states: strong / range / weak.
- EM (Baum-Welch), forward-backward posterior, transition matrix, expected duration, log-likelihood, AIC/BIC.
- Output maps regime probability to suggested total exposure.

### Percolation

- Stocks mapped to a square lattice in code order.
- Occupied when the stock is up.
- Largest 4-neighbour connected component = giant component.
- Threshold 0.592746 is the 2-D square-site percolation critical value.
- Why the largest cluster: up-count measures breadth only; the giant component measures whether gains are connected. A large cluster means broad diffusion; a small cluster means isolated spikes.
- Industry-level ratio, critical distance, breadth distance and leaders are also reported.

## iOS

- `ios/StockDesk/Views` — SwiftUI screens, HUD, China map canvas, models.
- `ios/StockDesk/Models/QuantModels.swift` — Swift HMM and percolation implementations.
- `ios/StockDesk/Services/MarketService.swift` — Eastmoney HTTP client.
- `ios/StockDesk/Services/AppStore.swift` — local persistence and cached summary.

## US edition

- `us/market_us.py` — US index/quote/mover/search/K-line adapter with a 20–120 s TTL cache.
- `us/app.py` — FastAPI routes and static file serving.
- `us/static` — dependency-free dashboard, ECharts bundled locally.
- `us/run.py` — local server on port 8770.

## Scaling

Desktop uses a CSS font-size variable (`--fs`) on text selectors only. Layout uses flex/grid, and buttons/cards grow instead of clipping. iOS uses a root scale with responsive HUB breakpoints (two columns at 120%, one column at 150%).

## Security

- Servers bind to `127.0.0.1` only.
- No account credentials are stored.
- Market requests go directly to public Eastmoney endpoints.
