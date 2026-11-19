// Pure C++ algorithms for the StockDesk model core.
//
// This header deliberately has no Python/pybind11 dependency: the percolation
// and Baum-Welch code can be tested, benchmarked and reused independently of
// the CPython extension. bindings.cpp is the only file that touches Python.
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace stockdesk::native {

struct GridResult {
    std::vector<int> largest;   // linear indices of the largest cluster
    std::vector<int> sizes;     // all component sizes, descending
    bool spanning = false;      // largest cluster touches all four borders
};

struct GridBatchResult {
    std::vector<int> largest_size;      // largest component size per grid
    std::vector<std::uint8_t> spanning; // whether that component touches all borders
};

struct BreadthResult {
    std::size_t total = 0;
    std::size_t traded = 0;
    std::size_t up = 0;
    std::size_t down = 0;
    std::size_t flat = 0;
    std::size_t limit_up = 0;
    std::size_t limit_down = 0;
    std::size_t suspended = 0;
    std::size_t missing = 0;
};

struct CoverageResult {
    std::size_t expected = 0;
    std::size_t present = 0;
    std::size_t duplicates = 0;
    std::size_t missing = 0;
    std::size_t extra = 0;
    std::vector<long long> missing_sample;
};

struct FactorResult {
    std::vector<double> category_scores;  // rows*n_categories, NaN when missing
    std::vector<std::int64_t> category_hits; // non-empty categories per row
    std::vector<std::int64_t> factor_hits;   // non-missing factors per row
    std::vector<double> composite;       // regime-weighted category score
    std::vector<double> percentile;      // 0..1, NaN when unavailable
};

struct MacdResult {
    std::vector<double> dif;
    std::vector<double> dea;
    std::vector<double> hist;
};

struct TdCounts {
    std::vector<int> buy;
    std::vector<int> sell;
    int last_buy9 = -1;
    int last_sell9 = -1;
    int buy_countdown = 0;
    int sell_countdown = 0;
    bool buy_countdown_done = false;
    bool sell_countdown_done = false;
    int buy_countdown_last = -1;
    int sell_countdown_last = -1;
};

struct RiskResult {
    double total_return = 0.0;
    double annual_return = 0.0;
    double volatility = 0.0;
    double sharpe = 0.0;
    double max_drawdown = 0.0;
    double benchmark_return = 0.0;
    double beta = 0.0;
    double alpha = 0.0;
    bool has_beta = false;
};

struct ChipsResult {
    std::vector<double> weights;
    std::vector<double> centers;
    double avg_cost = 0.0;
    double profit_ratio = 0.0;
    double cost_low = 0.0;
    double cost_high = 0.0;
    double support = 0.0;
    double resistance = 0.0;
    double peak = 0.0;
    double low = 0.0;
    double high = 0.0;
};

struct FibResult {
    double low = 0.0;
    double high = 0.0;
    double current = 0.0;
    double position = 0.0;
    double ma20 = 0.0;
    double ma60 = 0.0;
    double rsi = 50.0;
    std::vector<double> levels;  // 7 levels, high -> low
};

struct HmmResult {
    std::vector<double> mu;     // k means
    std::vector<double> var;    // k variances
    std::vector<double> pi;     // k initial-state probabilities
    std::vector<double> A;      // k*k transition matrix, row-major
    std::vector<double> gamma;  // n*k posterior state probabilities
    double loglik = 0.0;
    int iterations = 0;
    bool converged = false;
};

/// Largest four-neighbour connected component on a row-major lattice.
///
/// `grid` must contain `n` cells; the last row may be partial. The function is
/// deterministic and ties resolve to the component discovered first in scan
/// order. Throws std::invalid_argument on invalid dimensions/pointers.
GridResult analyze_grid(const std::uint8_t *grid, std::size_t n, std::size_t cols);

/// Batched summary for Monte-Carlo lattice runs. `grids` is row-major
/// n_grids * n bytes; only the largest size and spanning flag are returned.
GridBatchResult analyze_grid_batch(const std::uint8_t *grids, std::size_t n_grids,
                                   std::size_t n, std::size_t cols);

/// Census every row exactly once: traded / suspended / missing and limit hits.
/// `pct`, `price` and `limit_pct` are row-aligned; NaN means unknown. The limit
/// threshold is board-specific (5/10/20/30%), supplied by the caller.
BreadthResult breadth_census(const double *pct, const double *price,
                             const double *limit_pct, std::size_t n);

/// Compare codes with the expected universe; duplicates and omissions are
/// reported separately so a partial snapshot can never look complete.
CoverageResult coverage_audit(const long long *codes, std::size_t n,
                              const long long *expected, std::size_t m,
                              std::size_t missing_sample = 20);

/// Univariate Gaussian Baum-Welch with scaled forward/backward passes.
///
/// Inputs are validated and normalised (pi and each transition row). Use
/// `std::vector<double>` for A in row-major k*k order. Throws
/// std::invalid_argument for malformed/non-finite inputs and
/// std::runtime_error if the iteration produces non-finite parameters.
std::vector<double> moving_average(const double *closes, std::size_t n, std::size_t window);
std::vector<double> rsi(const double *closes, std::size_t n, std::size_t period);
MacdResult macd(const double *closes, std::size_t n, int fast = 12, int slow = 26, int signal = 9);
TdCounts td_counts(const double *closes, const double *highs, const double *lows, std::size_t n);
RiskResult risk_metrics(const double *nav, std::size_t n, const double *bench, std::size_t m,
                        double annual_days = 244.0);
ChipsResult chips(const double *highs, const double *lows, const double *closes,
                  const double *volumes, std::size_t n, std::size_t buckets = 56);
FibResult fibonacci(const double *highs, const double *lows, const double *closes,
                     std::size_t n);

/// Column-wise z-score standardisation; non-finite cells become 0.
std::vector<double> standardize_matrix(const double *values, std::size_t rows, std::size_t cols);

/// Cross-sectional factor rank/composite/percentile kernel.
///
/// `values` is row-major rows*factors with NaN for missing observations.
/// `directions` is +1/-1 per factor; `categories` indexes 0..n_categories-1;
/// `category_weights` carries the regime weights.  The function performs rank
/// normalisation, per-category averaging and percentile scoring without any
/// Python dependency.
FactorResult factor_composite(const double *values, std::size_t rows,
                              std::size_t factors, const std::int64_t *directions,
                              const std::int64_t *categories, std::size_t n_categories,
                              const double *category_weights);

HmmResult fit_hmm(const double *x, std::size_t n,
                  std::vector<double> mu, std::vector<double> var,
                  std::vector<double> pi, std::vector<double> A,
                  int iters);

}  // namespace stockdesk::native
