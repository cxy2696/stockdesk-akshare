// Pure C++ chip distribution and Fibonacci calculations.
#include "core.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <utility>
#include <vector>

namespace stockdesk::native {
namespace {
constexpr double kNaN = std::numeric_limits<double>::quiet_NaN();
void validate(const double *highs, const double *lows, const double *closes,
              const double *volumes, std::size_t n) {
    if (highs == nullptr || lows == nullptr || closes == nullptr || volumes == nullptr) {
        throw std::invalid_argument("OHLCV pointer is null");
    }
    if (n < 2) throw std::invalid_argument("need at least two bars");
    for (std::size_t i = 0; i < n; ++i) {
        if (!std::isfinite(highs[i]) || !std::isfinite(lows[i]) ||
            !std::isfinite(closes[i]) || !std::isfinite(volumes[i])) {
            throw std::invalid_argument("OHLCV contains non-finite values");
        }
        if (lows[i] > highs[i] || volumes[i] < 0.0) {
            throw std::invalid_argument("invalid OHLCV row");
        }
    }
}
}
ChipsResult chips(const double *highs, const double *lows, const double *closes,
                  const double *volumes, std::size_t n, std::size_t buckets) {
    validate(highs, lows, closes, volumes, n);
    if (buckets < 4) throw std::invalid_argument("buckets must be >= 4");
    ChipsResult out;
    double lo = lows[0], hi = highs[0];
    for (std::size_t i = 1; i < n; ++i) {
        lo = std::min(lo, lows[i]);
        hi = std::max(hi, highs[i]);
    }
    if (!(hi > lo)) hi = lo * 1.001;
    const double step = (hi - lo) / static_cast<double>(buckets);
    if (!(step > 0.0)) throw std::invalid_argument("price range is degenerate");
    out.low = lo; out.high = hi;
    out.weights.assign(buckets, 0.0);
    out.centers.resize(buckets);
    for (std::size_t b = 0; b < buckets; ++b) out.centers[b] = lo + step * (static_cast<double>(b) + 0.5);
    for (std::size_t i = 0; i < n; ++i) {
        const double age = static_cast<double>(n - 1 - i);
        const double w = std::pow(0.5, age / 45.0);
        int b_lo = static_cast<int>((lows[i] - lo) / step);
        int b_hi = static_cast<int>((highs[i] - lo) / step);
        b_lo = std::max(0, std::min(static_cast<int>(buckets) - 1, b_lo));
        b_hi = std::max(0, std::min(static_cast<int>(buckets) - 1, b_hi));
        const int span = b_hi - b_lo + 1;
        const double per = volumes[i] * w / static_cast<double>(span);
        for (int b = b_lo; b <= b_hi; ++b) out.weights[static_cast<std::size_t>(b)] += per;
    }
    double total = 0.0;
    for (double w : out.weights) total += w;
    if (!(total > 0.0)) total = 1.0;
    const double current = closes[n - 1];
    double weighted = 0.0, profit = 0.0;
    for (std::size_t b = 0; b < buckets; ++b) {
        weighted += out.centers[b] * out.weights[b];
        if (out.centers[b] <= current) profit += out.weights[b];
    }
    out.avg_cost = weighted / total;
    out.profit_ratio = profit / total * 100.0;

    std::vector<std::size_t> order(buckets);
    for (std::size_t i = 0; i < buckets; ++i) order[i] = i;
    std::sort(order.begin(), order.end(), [&](std::size_t a, std::size_t b) {
        return out.weights[a] < out.weights[b];
    });
    double acc = 0.0;
    std::vector<std::size_t> keep;
    for (std::size_t idx : order) {
        keep.push_back(idx);
        acc += out.weights[idx];
        if (acc / total >= 0.9) break;
    }
    double p_low = out.centers[keep[0]], p_high = out.centers[keep[0]];
    for (std::size_t idx : keep) {
        p_low = std::min(p_low, out.centers[idx]);
        p_high = std::max(p_high, out.centers[idx]);
    }
    out.cost_low = p_low; out.cost_high = p_high;
    double support = -1.0, resistance = -1.0, peak = out.centers[0], peak_w = -1.0;
    for (std::size_t b = 0; b < buckets; ++b) {
        if (out.centers[b] <= current && out.weights[b] > support) support = out.weights[b];
        if (out.centers[b] > current && out.weights[b] > resistance) resistance = out.weights[b];
        if (out.weights[b] > peak_w) { peak_w = out.weights[b]; peak = out.centers[b]; }
    }
    auto price_for = [&](double target_weight, bool below) {
        for (std::size_t b = 0; b < buckets; ++b) {
            const bool side = below ? (out.centers[b] <= current) : (out.centers[b] > current);
            if (side && out.weights[b] == target_weight) return out.centers[b];
        }
        return below ? lo : hi;
    };
    out.support = support >= 0.0 ? price_for(support, true) : lo;
    out.resistance = resistance >= 0.0 ? price_for(resistance, false) : hi;
    if (!std::isfinite(out.support)) out.support = lo;
    if (!std::isfinite(out.resistance)) out.resistance = hi;
    out.peak = peak;
    return out;
}

FibResult fibonacci(const double *highs, const double *lows, const double *closes, std::size_t n) {
    if (highs == nullptr || lows == nullptr || closes == nullptr || n < 2) {
        throw std::invalid_argument("invalid Fibonacci input");
    }
    FibResult out;
    double lo = lows[0], hi = highs[0];
    for (std::size_t i = 1; i < n; ++i) {
        if (!std::isfinite(highs[i]) || !std::isfinite(lows[i]) || !std::isfinite(closes[i])) {
            throw std::invalid_argument("non-finite OHLC");
        }
        lo = std::min(lo, lows[i]); hi = std::max(hi, highs[i]);
    }
    const double current = closes[n - 1];
    const double span = hi - lo;
    if (!(span > 0.0)) throw std::invalid_argument("degenerate range");
    out.low = lo; out.high = hi; out.current = current;
    out.position = (current - lo) / span;
    const std::size_t w20 = std::min<std::size_t>(20, n), w60 = std::min<std::size_t>(60, n);
    double s20 = 0.0, s60 = 0.0;
    for (std::size_t i = n - w20; i < n; ++i) s20 += closes[i];
    for (std::size_t i = n - w60; i < n; ++i) s60 += closes[i];
    out.ma20 = s20 / static_cast<double>(w20);
    out.ma60 = s60 / static_cast<double>(w60);
    double gains = 0.0, losses = 0.0;
    const std::size_t start = n > 14 ? n - 14 : 1;
    for (std::size_t i = start; i < n; ++i) {
        const double ch = closes[i] - closes[i - 1];
        if (ch > 0) gains += ch; else losses -= ch;
    }
    out.rsi = losses == 0.0 ? 100.0 : 100.0 - 100.0 / (1.0 + (gains / 14.0) / (losses / 14.0));
    for (double ratio : {0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0}) {
        out.levels.push_back(hi - span * ratio);
    }
    return out;
}
}
