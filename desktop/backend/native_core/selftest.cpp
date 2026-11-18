// Deterministic self-test for the pure C++ core.
//
// This is intentionally independent of pybind11/CPython: it catches lattice
// and numerical regressions in environments where the Python package is not
// built. The Python test suite still checks C++/NumPy parity and threading.
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <cstdio>
#include <limits>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>

#include "core.hpp"

namespace {

using stockdesk::native::BreadthResult;
using stockdesk::native::CoverageResult;
using stockdesk::native::GridBatchResult;
using stockdesk::native::GridResult;
using stockdesk::native::HmmResult;

int failures = 0;

void check(bool condition, const std::string &message) {
    if (!condition) {
        std::fprintf(stderr, "FAIL: %s\n", message.c_str());
        ++failures;
    }
}

struct ReferenceGrid {
    std::vector<int> largest;
    std::vector<int> sizes;
    bool spanning = false;
};

ReferenceGrid reference_grid(const std::vector<std::uint8_t> &grid, std::size_t cols) {
    const std::size_t n = grid.size();
    const std::size_t rows = (n + cols - 1) / cols;
    std::vector<bool> seen(n, false);
    ReferenceGrid out;
    std::vector<int> stack;
    for (std::size_t start = 0; start < n; ++start) {
        if (!grid[start] || seen[start]) continue;
        stack.clear();
        stack.push_back(static_cast<int>(start));
        seen[start] = true;
        std::vector<int> component;
        bool top = false, bottom = false, left = false, right = false;
        while (!stack.empty()) {
            const int v = stack.back();
            stack.pop_back();
            component.push_back(v);
            const std::size_t r = static_cast<std::size_t>(v) / cols;
            const std::size_t c = static_cast<std::size_t>(v) % cols;
            top |= r == 0;
            bottom |= r + 1 == rows;
            left |= c == 0;
            right |= c + 1 == cols;
            const int candidates[4][2] = {
                {static_cast<int>(r) - 1, static_cast<int>(c)},
                {static_cast<int>(r) + 1, static_cast<int>(c)},
                {static_cast<int>(r), static_cast<int>(c) - 1},
                {static_cast<int>(r), static_cast<int>(c) + 1},
            };
            for (const auto &nx : candidates) {
                if (nx[0] < 0 || nx[1] < 0 ||
                    nx[0] >= static_cast<int>(rows) || nx[1] >= static_cast<int>(cols)) {
                    continue;
                }
                const std::size_t w = static_cast<std::size_t>(nx[0]) * cols +
                                      static_cast<std::size_t>(nx[1]);
                if (w < n && grid[w] && !seen[w]) {
                    seen[w] = true;
                    stack.push_back(static_cast<int>(w));
                }
            }
        }
        std::sort(component.begin(), component.end());
        out.sizes.push_back(static_cast<int>(component.size()));
        if (component.size() > out.largest.size()) {
            out.largest = component;
            out.spanning = top && bottom && left && right;
        }
    }
    std::sort(out.sizes.begin(), out.sizes.end(), std::greater<int>());
    return out;
}

void compare_grid(const std::vector<std::uint8_t> &grid, std::size_t cols,
                  const std::string &label) {
    const GridResult got = stockdesk::native::analyze_grid(grid.data(), grid.size(), cols);
    const ReferenceGrid want = reference_grid(grid, cols);
    check(got.largest == want.largest, label + " largest mismatch");
    check(got.sizes == want.sizes, label + " sizes mismatch");
    check(got.spanning == want.spanning, label + " spanning mismatch");
}

std::vector<double> synthetic_returns(std::size_t n, std::uint32_t seed = 7) {
    std::mt19937 rng(seed);
    std::normal_distribution<double> weak(-1.0, 0.8);
    std::normal_distribution<double> range(0.2, 0.6);
    std::normal_distribution<double> strong(1.2, 0.9);
    std::vector<double> x;
    x.reserve(n);
    for (std::size_t i = 0; i < n; ++i) {
        if (i < n / 3) x.push_back(weak(rng));
        else if (i < 2 * (n / 3)) x.push_back(range(rng));
        else x.push_back(strong(rng));
    }
    return x;
}

std::vector<double> initial_mu() { return {-1.0, 0.0, 1.0}; }
std::vector<double> initial_var() { return {1.0, 1.0, 1.0}; }
std::vector<double> initial_pi() { return {1.0 / 3, 1.0 / 3, 1.0 / 3}; }
std::vector<double> initial_a() {
    return {0.8, 0.1, 0.1,
            0.1, 0.8, 0.1,
            0.1, 0.1, 0.8};
}

void test_percolation() {
    const std::vector<std::uint8_t> fixed = {1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1};
    for (std::size_t cols = 1; cols <= 7; ++cols) {
        compare_grid(fixed, cols, "fixed cols=" + std::to_string(cols));
    }

    std::mt19937 rng(11);
    std::bernoulli_distribution occupied(0.5);
    for (int trial = 0; trial < 200; ++trial) {
        const std::size_t n = static_cast<std::size_t>(rng() % 161);
        const std::size_t cols = 1 + static_cast<std::size_t>(rng() % 16);
        std::vector<std::uint8_t> grid(n);
        for (auto &cell : grid) cell = occupied(rng) ? 1 : 0;
        compare_grid(grid, cols, "random trial=" + std::to_string(trial));
    }

    try {
        stockdesk::native::analyze_grid(nullptr, 1, 1);
        check(false, "null grid should throw");
    } catch (const std::invalid_argument &) {
    }
    try {
        stockdesk::native::analyze_grid(fixed.data(), fixed.size(), 0);
        check(false, "cols=0 should throw");
    } catch (const std::invalid_argument &) {
    }
    check(stockdesk::native::analyze_grid(nullptr, 0, 1).largest.empty(),
          "empty grid should be empty");
    try {
        stockdesk::native::analyze_grid(nullptr, 0, 0);
        check(false, "empty grid with cols=0 should throw");
    } catch (const std::invalid_argument &) {
    }

    // Batch summary must agree with the detailed single-grid result.
    const std::size_t cols = 9, n = 9 * 9;
    std::vector<std::uint8_t> batch(15 * n);
    for (auto &cell : batch) cell = occupied(rng) ? 1 : 0;
    const GridBatchResult summary =
        stockdesk::native::analyze_grid_batch(batch.data(), 15, n, cols);
    check(summary.largest_size.size() == 15, "batch size mismatch");
    for (std::size_t i = 0; i < 15; ++i) {
        const GridResult single =
            stockdesk::native::analyze_grid(batch.data() + i * n, n, cols);
        check(summary.largest_size[i] == static_cast<int>(single.largest.size()),
              "batch largest mismatch");
        check((summary.spanning[i] != 0) == single.spanning, "batch spanning mismatch");
    }
}

void test_hmm() {
    const std::size_t n = 420;
    const std::vector<double> x = synthetic_returns(n);
    const HmmResult first = stockdesk::native::fit_hmm(
        x.data(), n, initial_mu(), initial_var(), initial_pi(), initial_a(), 80);
    check(first.mu.size() == 3 && first.var.size() == 3 && first.pi.size() == 3,
          "HMM parameter shape");
    check(first.A.size() == 9, "HMM A shape");
    check(first.gamma.size() == n * 3, "HMM gamma shape");
    check(std::isfinite(first.loglik), "HMM loglik finite");
    check(first.iterations >= 1, "HMM iterations");
    for (std::size_t t = 0; t < n; ++t) {
        double sum = 0;
        for (std::size_t j = 0; j < 3; ++j) sum += first.gamma[t * 3 + j];
        if (!(std::abs(sum - 1.0) < 1e-9)) {
            check(false, "HMM gamma row not normalised");
            break;
        }
    }

    const HmmResult second = stockdesk::native::fit_hmm(
        x.data(), n, initial_mu(), initial_var(), initial_pi(), initial_a(), 80);
    check(first.loglik == second.loglik, "HMM must be deterministic");
    check(first.iterations == second.iterations, "HMM iteration determinism");

    // Exercise the runtime-k fallback branch (the production path is k=3).
    const HmmResult two_state = stockdesk::native::fit_hmm(
        x.data(), n, {-1.0, 1.0}, {1.0, 1.0}, {0.5, 0.5},
        {0.9, 0.1, 0.1, 0.9}, 20);
    check(two_state.mu.size() == 2 && two_state.A.size() == 4 &&
              two_state.gamma.size() == n * 2,
          "HMM k=2 shape");

    try {
        stockdesk::native::fit_hmm(x.data(), 1, initial_mu(), initial_var(),
                                   initial_pi(), initial_a(), 5);
        check(false, "n<2 should throw");
    } catch (const std::invalid_argument &) {
    }
    try {
        stockdesk::native::fit_hmm(x.data(), n, initial_mu(), initial_var(),
                                   initial_pi(), std::vector<double>(4), 5);
        check(false, "wrong A shape should throw");
    } catch (const std::invalid_argument &) {
    }
}

void test_census_and_coverage() {
    const double nan = std::numeric_limits<double>::quiet_NaN();
    const std::vector<double> pct = {1.0, -1.0, 0.0, nan, nan, 5.0};
    const std::vector<double> price = {10, 10, 10, 10, nan, nan};
    const std::vector<double> limits = {10, 10, 10, 10, 10, 10};
    const BreadthResult breadth = stockdesk::native::breadth_census(
        pct.data(), price.data(), limits.data(), pct.size());
    check(breadth.total == 6, "breadth total");
    check(breadth.traded == 4, "breadth traded");
    check(breadth.up == 2, "breadth up");
    check(breadth.down == 1, "breadth down");
    check(breadth.flat == 1, "breadth flat");
    check(breadth.suspended == 1, "breadth suspended");
    check(breadth.missing == 1, "breadth missing");

    const std::vector<long long> codes = {1, 2, 2, 4};
    const std::vector<long long> expected = {1, 2, 3};
    const CoverageResult coverage = stockdesk::native::coverage_audit(
        codes.data(), codes.size(), expected.data(), expected.size(), 20);
    check(coverage.expected == 3, "coverage expected");
    check(coverage.present == 3, "coverage present");
    check(coverage.duplicates == 1, "coverage duplicates");
    check(coverage.missing == 1, "coverage missing");
    check(coverage.extra == 1, "coverage extra");
    check(coverage.missing_sample.size() == 1 && coverage.missing_sample[0] == 3,
          "coverage missing sample");
}

}  // namespace

int main() {
    test_percolation();
    test_hmm();
    test_census_and_coverage();
    if (failures != 0) {
        std::fprintf(stderr, "%d C++ self-test failure(s)\n", failures);
        return 1;
    }
    std::printf("native core self-test ok (percolation, HMM, census, coverage)\n");
    return 0;
}
