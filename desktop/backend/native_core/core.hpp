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
