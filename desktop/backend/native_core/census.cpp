#include "core.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <iterator>
#include <stdexcept>
#include <vector>

namespace stockdesk::native {
namespace {
constexpr double kFlatBand = 0.01;
constexpr double kLimitTolerance = 0.2;

bool finite(double v) { return std::isfinite(v); }
}  // namespace

BreadthResult breadth_census(const double *pct, const double *price,
                             const double *limit_pct, std::size_t n) {
    BreadthResult out;
    for (std::size_t i = 0; i < n; ++i) {
        ++out.total;
        const bool has_price = finite(price[i]) && price[i] > 0;
        const bool has_pct = finite(pct[i]);
        if (!has_price && !has_pct) {
            ++out.missing;
            continue;
        }
        if (!has_pct) {
            ++out.suspended;
            continue;
        }
        ++out.traded;
        const double p = pct[i];
        if (p > kFlatBand) ++out.up;
        else if (p < -kFlatBand) ++out.down;
        else ++out.flat;

        double limit = (limit_pct != nullptr && finite(limit_pct[i])) ? limit_pct[i] : 9.8;
        if (!(limit > 0)) limit = 9.8;
        if (p >= limit - kLimitTolerance) ++out.limit_up;
        if (p <= -limit + kLimitTolerance) ++out.limit_down;
    }
    // Every row must land in exactly one bucket. If this ever changes, fail
    // loudly rather than silently dropping rows from breadth statistics.
    if (out.traded + out.suspended + out.missing != out.total) {
        throw std::runtime_error("breadth census invariant violated");
    }
    return out;
}

CoverageResult coverage_audit(const long long *codes, std::size_t n,
                              const long long *expected, std::size_t m,
                              std::size_t missing_sample) {
    CoverageResult out;
    std::vector<long long> actual(codes, codes + n);
    std::vector<long long> wanted(expected, expected + m);
    std::sort(actual.begin(), actual.end());
    std::sort(wanted.begin(), wanted.end());
    const auto actual_end = std::unique(actual.begin(), actual.end());
    const auto wanted_end = std::unique(wanted.begin(), wanted.end());
    out.present = static_cast<std::size_t>(actual_end - actual.begin());
    out.expected = static_cast<std::size_t>(wanted_end - wanted.begin());
    out.duplicates = n - out.present;

    std::vector<long long> missing;
    std::set_difference(wanted.begin(), wanted_end, actual.begin(), actual_end,
                        std::back_inserter(missing));
    std::vector<long long> extra;
    std::set_difference(actual.begin(), actual_end, wanted.begin(), wanted_end,
                        std::back_inserter(extra));
    out.missing = missing.size();
    out.extra = extra.size();
    const std::size_t take = std::min(missing_sample, missing.size());
    out.missing_sample.assign(missing.begin(), missing.begin() + take);
    return out;
}

}  // namespace stockdesk::native
