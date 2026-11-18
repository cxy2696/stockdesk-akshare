// Pure C++ cross-sectional factor composition.
//
// The Python layer is only an adapter: it prepares dense float matrices with
// NaN for missing observations, then this code performs rank normalisation,
// category aggregation, regime weighting and percentile scoring.  No Python
// objects are touched here, so the kernel is usable from a native service later.
#include "core.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <utility>
#include <vector>

namespace stockdesk::native {
namespace {

// Acklam's inverse-normal rational approximation.  It is accurate to about
// 1e-9 over (0, 1), which is well below the precision displayed by the product.
double inverse_normal(double p) {
    if (!(p > 0.0 && p < 1.0) || !std::isfinite(p)) {
        throw std::invalid_argument("percentile must be strictly between 0 and 1");
    }
    static const double a[] = {
        -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
        1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00};
    static const double b[] = {
        -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
        6.680131188771972e+01, -1.328068155288572e+01};
    static const double c[] = {
        -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
        -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00};
    static const double d[] = {
        7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
        3.754408661907416e+00};
    const double low = 0.02425, high = 1.0 - low;
    if (p < low) {
        const double q = std::sqrt(-2.0 * std::log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0);
    }
    if (p > high) {
        const double q = std::sqrt(-2.0 * std::log(1.0 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0);
    }
    const double q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0);
}

}  // namespace

FactorResult factor_composite(const double *values, std::size_t rows,
                              std::size_t factors, const std::int64_t *directions,
                              const std::int64_t *categories, std::size_t n_categories,
                              const double *category_weights) {
    if (values == nullptr || directions == nullptr || categories == nullptr ||
        category_weights == nullptr) {
        throw std::invalid_argument("factor inputs must not be null");
    }
    if (rows == 0 || factors == 0 || n_categories == 0) {
        throw std::invalid_argument("rows/factors/categories must be > 0");
    }
    if (rows > std::numeric_limits<std::size_t>::max() / factors) {
        throw std::invalid_argument("rows*factors is too large");
    }

    FactorResult out;
    out.category_scores.assign(rows * n_categories, std::numeric_limits<double>::quiet_NaN());
    out.category_hits.assign(rows, 0);
    out.factor_hits.assign(rows, 0);
    out.composite.assign(rows, std::numeric_limits<double>::quiet_NaN());
    out.percentile.assign(rows, std::numeric_limits<double>::quiet_NaN());

    std::vector<double> z(rows * factors, 0.0);
    std::vector<double> cat_sum(rows * n_categories, 0.0);
    std::vector<std::size_t> cat_count(rows * n_categories, 0);

    for (std::size_t j = 0; j < factors; ++j) {
        const std::int64_t cat = categories[j];
        if (cat < 0 || static_cast<std::size_t>(cat) >= n_categories) {
            throw std::invalid_argument("category id out of range");
        }
        const std::int64_t dir = directions[j];
        if (dir != 1 && dir != -1) throw std::invalid_argument("direction must be +1 or -1");

        std::vector<std::pair<double, std::size_t>> valid;
        valid.reserve(rows);
        for (std::size_t i = 0; i < rows; ++i) {
            const double v = values[i * factors + j];
            if (std::isfinite(v)) valid.emplace_back(v, i);
        }
        std::sort(valid.begin(), valid.end());
        const std::size_t n = valid.size();
        if (n == 0) continue;
        for (std::size_t rank = 0; rank < n; ++rank) {
            const std::size_t i = valid[rank].second;
            const double p = (static_cast<double>(rank) + 1.0) / (static_cast<double>(n) + 1.0);
            const double score = std::max(-3.5, std::min(3.5, inverse_normal(p))) *
                                 static_cast<double>(dir);
            z[i * factors + j] = score;
            const std::size_t ci = i * n_categories + static_cast<std::size_t>(cat);
            cat_sum[ci] += score;
            ++cat_count[ci];
            ++out.factor_hits[i];
        }
    }

    std::size_t valid_rows = 0;
    for (std::size_t i = 0; i < rows; ++i) {
        double numerator = 0.0, denominator = 0.0;
        std::size_t hits = 0;
        for (std::size_t c = 0; c < n_categories; ++c) {
            const std::size_t idx = i * n_categories + c;
            if (cat_count[idx] == 0) continue;
            const double score = cat_sum[idx] / static_cast<double>(cat_count[idx]);
            out.category_scores[idx] = score;
            ++hits;
            const double w = category_weights[c];
            if (std::isfinite(w) && w > 0.0) {
                numerator += score * w;
                denominator += w;
            }
        }
        out.category_hits[i] = static_cast<std::int64_t>(hits);
        if (denominator > 0.0) {
            out.composite[i] = numerator / denominator;
            ++valid_rows;
        }
    }

    std::vector<std::pair<double, std::size_t>> order;
    order.reserve(valid_rows);
    for (std::size_t i = 0; i < rows; ++i) {
        if (std::isfinite(out.composite[i])) order.emplace_back(out.composite[i], i);
    }
    std::sort(order.begin(), order.end());
    for (std::size_t rank = 0; rank < order.size(); ++rank) {
        out.percentile[order[rank].second] =
            (static_cast<double>(rank) + 0.5) / static_cast<double>(order.size());
    }
    return out;
}

}  // namespace stockdesk::native
