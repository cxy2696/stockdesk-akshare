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
HmmResult fit_hmm(const double *x, std::size_t n,
                  std::vector<double> mu, std::vector<double> var,
                  std::vector<double> pi, std::vector<double> A,
                  int iters);

}  // namespace stockdesk::native
