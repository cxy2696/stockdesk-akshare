// Pure C++ portfolio risk metrics.
#include "core.hpp"

#include <cmath>
#include <stdexcept>
#include <vector>

namespace stockdesk::native {
namespace {
void require_nav(const double *x, std::size_t n, const char *name) {
    if (x == nullptr || n < 2) throw std::invalid_argument(std::string(name) + " needs at least two points");
    for (std::size_t i = 0; i < n; ++i) {
        if (!std::isfinite(x[i]) || x[i] <= 0.0) throw std::invalid_argument(std::string(name) + " must be finite and positive");
    }
}
}
RiskResult risk_metrics(const double *nav, std::size_t n, const double *bench, std::size_t m,
                        double annual_days) {
    require_nav(nav, n, "nav");
    if (annual_days <= 0.0) throw std::invalid_argument("annual_days must be > 0");
    RiskResult out;
    out.total_return = nav[n - 1] - 1.0;
    const double years = std::max(static_cast<double>(n) / annual_days, 1.0 / annual_days);
    out.annual_return = nav[n - 1] > 0.0 ? std::pow(nav[n - 1], 1.0 / years) - 1.0 : -1.0;

    const std::size_t rets_n = n - 1;
    std::vector<double> rets(rets_n);
    double sum = 0.0;
    for (std::size_t i = 0; i < rets_n; ++i) {
        rets[i] = nav[i + 1] / nav[i] - 1.0;
        sum += rets[i];
    }
    const double mean = sum / static_cast<double>(rets_n);
    double var = 0.0;
    for (double r : rets) var += (r - mean) * (r - mean);
    var /= static_cast<double>(rets_n);
    out.volatility = std::sqrt(var) * std::sqrt(annual_days);
    out.sharpe = out.volatility > 0.0 ? (mean * annual_days) / out.volatility : 0.0;
    double peak = nav[0], mdd = 0.0;
    for (std::size_t i = 1; i < n; ++i) {
        peak = std::max(peak, nav[i]);
        mdd = std::min(mdd, nav[i] / peak - 1.0);
    }
    out.max_drawdown = mdd;

    if (bench != nullptr && m > 1) {
        require_nav(bench, m, "bench");
        out.benchmark_return = bench[m - 1] / bench[0] - 1.0;
        const std::size_t bm = std::min(rets_n, m - 1);
        if (bm > 1) {
            std::vector<double> br(bm);
            double mb = 0.0;
            for (std::size_t i = 0; i < bm; ++i) {
                br[i] = bench[i + 1] / bench[i] - 1.0;
                mb += br[i];
            }
            mb /= static_cast<double>(bm);
            double cov = 0.0, vb = 0.0;
            for (std::size_t i = 0; i < bm; ++i) {
                cov += (rets[i] - mean) * (br[i] - mb);
                vb += (br[i] - mb) * (br[i] - mb);
            }
            cov /= static_cast<double>(bm);
            vb /= static_cast<double>(bm);
            if (vb > 0.0) {
                out.beta = cov / vb;
                out.has_beta = true;
                const double bench_annual = bench[m - 1] > 0.0
                    ? std::pow(bench[m - 1] / bench[0], 1.0 / years) - 1.0 : -1.0;
                out.alpha = out.annual_return - out.beta * bench_annual;
            }
        }
    }
    return out;
}
}
