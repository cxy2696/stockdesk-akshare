# StockDesk native-core architecture

## Current ownership

The product is not yet "all C++"; this document records the real boundary so the
migration can continue without pretending the rewrite is finished.

| Layer | Language | Owner |
|---|---|---|
| HMM regime fit / smoothing | C++17 | `backend/native_core/hmm.cpp` |
| Percolation / union-find | C++17 | `backend/native_core/percolation.cpp` |
| Breadth census | C++17 | `backend/native_core/census.cpp` |
| Universe coverage audit | C++17 | `backend/native_core/census.cpp` |
| Cross-sectional factor rank/composite/percentile | C++17 | `backend/native_core/factor.cpp` |
| Python binding / validation | C++17 + pybind11 | `backend/native_core/bindings.cpp` |
| Data source adapters, caching, FastAPI routes | Python | `backend/*.py` |
| Desktop UI | React/TypeScript | `frontend/src` |
| iOS UI | SwiftUI | `ios/StockDesk` |

The native algorithms are pure C++ and have no Python dependency.  `core.hpp`
is the stable algorithm contract; `bindings.cpp` is the only file that touches
Python objects.  This keeps a future native service / CLI reuse straightforward.

## Factor pipeline (native)

`factor_composite` receives a dense rows×factors matrix with `NaN` for missing
observations, plus per-factor direction/category and per-category regime
weights. It performs:

1. per-factor rank normalisation with inverse-normal scores;
2. direction flip for inverse factors;
3. category averaging;
4. regime-weight aggregation with available-category renormalisation;
5. cross-sectional percentile.

Python prepares the matrix and converts the typed result into API JSON.  The
Python fallback remains for environments without the extension, but the default
packaged build uses the C++ kernel.

## Why Python and TypeScript still exist

- Market/news/F10 access is currently implemented with Python HTTP/akshare
  adapters. Rewriting all of them in C++ is a separate migration: TLS client,
  JSON/HTML parsing and provider-specific retry policies.
- FastAPI supplies routing, WebSockets and the desktop process lifecycle.
- React/TypeScript is the presentation layer; moving it to C++ would require a
  GUI toolkit and would not make the algorithms more correct.

## Next native migrations

1. Technical indicators (MA/RSI/MACD/TD) into `indicators.cpp`.
2. Portfolio returns/risk (volatility, drawdown, Sharpe, beta/alpha) into
   `risk.cpp`.
3. Streaming quote normalisation and snapshot assembly into C++.
4. Optional native HTTP service; Python remains a thin launcher/FFI adapter.

Each step must keep the Python fallback and parity tests until the native path
has been running in production for a full market cycle.
