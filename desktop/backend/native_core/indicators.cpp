// Pure C++ technical indicators and TD Sequential counts.
#include "core.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <vector>

namespace stockdesk::native {
namespace {
constexpr int TD_SETUP = 9;
constexpr int TD_COUNTDOWN = 13;
const double NaN = std::numeric_limits<double>::quiet_NaN();

void require_series(const double *x, std::size_t n) {
    if (x == nullptr) throw std::invalid_argument("series pointer is null");
    if (n == 0) throw std::invalid_argument("series is empty");
    for (std::size_t i = 0; i < n; ++i) {
        if (!std::isfinite(x[i])) throw std::invalid_argument("series contains non-finite values");
    }
}
}  // namespace

std::vector<double> moving_average(const double *closes, std::size_t n, std::size_t window) {
    require_series(closes, n);
    if (window == 0) throw std::invalid_argument("window must be > 0");
    std::vector<double> out(n, NaN);
    if (window > n) return out;
    double sum = 0.0;
    for (std::size_t i = 0; i < n; ++i) {
        sum += closes[i];
        if (i >= window) sum -= closes[i - window];
        if (i + 1 >= window) out[i] = sum / static_cast<double>(window);
    }
    return out;
}

std::vector<double> rsi(const double *closes, std::size_t n, std::size_t period) {
    require_series(closes, n);
    if (period == 0) throw std::invalid_argument("period must be > 0");
    std::vector<double> out(n, NaN);
    if (n <= period) return out;
    // Match the product's existing simple-average RSI: average gains/losses
    // over the trailing `period` changes, not Wilder's recursive smoothing.
    for (std::size_t i = period; i < n; ++i) {
        double gains = 0.0, losses = 0.0;
        for (std::size_t j = i + 1 - period; j <= i; ++j) {
            const double ch = closes[j] - closes[j - 1];
            if (ch > 0) gains += ch;
            else losses -= ch;
        }
        const double g = gains / static_cast<double>(period);
        const double l = losses / static_cast<double>(period);
        out[i] = (l == 0.0) ? 100.0 : 100.0 - 100.0 / (1.0 + g / l);
    }
    return out;
}

MacdResult macd(const double *closes, std::size_t n, int fast, int slow, int signal) {
    require_series(closes, n);
    if (fast <= 0 || slow <= 0 || signal <= 0 || fast >= slow) {
        throw std::invalid_argument("MACD periods must satisfy 0 < fast < slow and signal > 0");
    }
    MacdResult out;
    out.dif.assign(n, NaN);
    out.dea.assign(n, NaN);
    out.hist.assign(n, NaN);
    const double af = 2.0 / (fast + 1.0), as = 2.0 / (slow + 1.0), ag = 2.0 / (signal + 1.0);
    double ef = closes[0], es = closes[0], dea = 0.0;
    for (std::size_t i = 0; i < n; ++i) {
        ef = (i == 0) ? closes[0] : ef + af * (closes[i] - ef);
        es = (i == 0) ? closes[0] : es + as * (closes[i] - es);
        const double dif = ef - es;
        dea = (i == 0) ? dif : dea + ag * (dif - dea);
        out.dif[i] = dif;
        out.dea[i] = dea;
        out.hist[i] = 2.0 * (dif - dea);
    }
    return out;
}

TdCounts td_counts(const double *closes, const double *highs, const double *lows, std::size_t n) {
    require_series(closes, n);
    if (highs == nullptr || lows == nullptr) throw std::invalid_argument("highs/lows are null");
    for (std::size_t i = 0; i < n; ++i) {
        if (!std::isfinite(highs[i]) || !std::isfinite(lows[i])) {
            throw std::invalid_argument("highs/lows contain non-finite values");
        }
    }
    TdCounts out;
    out.buy.assign(n, 0);
    out.sell.assign(n, 0);
    int bc = 0, sc = 0;
    int last_buy = -1, last_sell = -1;
    for (std::size_t i = 4; i < n; ++i) {
        if (closes[i] < closes[i - 4]) {
            ++bc; sc = 0;
            if (bc == TD_SETUP) last_buy = static_cast<int>(i);
            bc = std::min(bc, TD_SETUP);
        } else if (closes[i] > closes[i - 4]) {
            ++sc; bc = 0;
            if (sc == TD_SETUP) last_sell = static_cast<int>(i);
            sc = std::min(sc, TD_SETUP);
        } else {
            bc = sc = 0;
        }
        out.buy[i] = bc;
        out.sell[i] = sc;
    }
    out.last_buy9 = last_buy;
    out.last_sell9 = last_sell;
    auto countdown = [&](int start, bool buy, int &count, bool &done, int &last) {
        count = 0; done = false; last = -1;
        if (start < 0 || static_cast<std::size_t>(start) + 1 >= n) return;
        for (std::size_t i = static_cast<std::size_t>(start) + 1; i < n; ++i) {
            const bool hit = buy ? (i >= 2 && closes[i] <= lows[i - 2])
                                 : (i >= 2 && closes[i] >= highs[i - 2]);
            if (hit) {
                ++count; last = static_cast<int>(i);
                if (count >= TD_COUNTDOWN) { count = TD_COUNTDOWN; done = true; return; }
            }
        }
    };
    countdown(last_buy, true, out.buy_countdown, out.buy_countdown_done, out.buy_countdown_last);
    countdown(last_sell, false, out.sell_countdown, out.sell_countdown_done, out.sell_countdown_last);
    return out;
}

}  // namespace stockdesk::native
