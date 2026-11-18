// pybind11 boundary for the pure C++ model core.
//
// This file validates Python/numpy objects, converts them to plain C++
// containers once, and converts the typed results back to numpy arrays. The
// algorithms in percolation.cpp / hmm.cpp have no Python dependency.
#include <pybind11/gil.h>
#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <algorithm>
#include <climits>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <vector>

#include "core.hpp"

namespace py = pybind11;
using stockdesk::native::HmmResult;
using stockdesk::native::GridResult;

namespace {

py::array_t<double> vector_to_array(const std::vector<double> &values) {
    py::array_t<double> out(static_cast<py::ssize_t>(values.size()));
    std::copy(values.begin(), values.end(), out.mutable_data());
    return out;
}

py::array_t<double> matrix_to_array(const std::vector<double> &values,
                                    py::ssize_t rows, py::ssize_t cols) {
    py::array_t<double> out({rows, cols});
    std::copy(values.begin(), values.end(), out.mutable_data());
    return out;
}

py::dict grid_largest(py::array_t<std::uint8_t, py::array::c_style | py::array::forcecast> grid,
                      py::ssize_t cols) {
    const py::buffer_info info = grid.request();
    if (info.ndim != 1) throw std::invalid_argument("grid must be 1-D");
    if (cols <= 0) throw std::invalid_argument("cols must be > 0");
    if (info.shape[0] > INT_MAX) throw std::invalid_argument("grid is too large for 32-bit indices");

    stockdesk::native::GridResult result;
    {
        // The algorithm is pure and thread-safe; release the GIL so concurrent
        // Python callers can actually run it in parallel.
        py::gil_scoped_release release;
        result = stockdesk::native::analyze_grid(
            static_cast<const std::uint8_t *>(info.ptr),
            static_cast<std::size_t>(info.shape[0]),
            static_cast<std::size_t>(cols));
    }

    py::dict out;
    out["largest"] = result.largest;
    out["sizes"] = result.sizes;
    out["spanning"] = result.spanning;
    return out;
}

py::dict grid_batch(py::array_t<std::uint8_t, py::array::c_style | py::array::forcecast> grids,
                    std::size_t cols) {
    const py::buffer_info info = grids.request();
    if (info.ndim != 2) throw std::invalid_argument("grids must be 2-D");
    const std::size_t n_grids = static_cast<std::size_t>(info.shape[0]);
    const std::size_t n = static_cast<std::size_t>(info.shape[1]);
    stockdesk::native::GridBatchResult result;
    {
        py::gil_scoped_release release;
        result = stockdesk::native::analyze_grid_batch(
            static_cast<const std::uint8_t *>(info.ptr), n_grids, n, cols);
    }
    py::dict out;
    out["largest_size"] = result.largest_size;
    out["spanning"] = result.spanning;
    return out;
}

py::array_t<double> moving_average(py::array_t<double, py::array::c_style | py::array::forcecast> closes,
                                  std::size_t window) {
    const py::buffer_info info = closes.request();
    if (info.ndim != 1) throw std::invalid_argument("closes must be 1-D");
    std::vector<double> out;
    {
        py::gil_scoped_release release;
        out = stockdesk::native::moving_average(static_cast<const double *>(info.ptr),
                                                 static_cast<std::size_t>(info.shape[0]), window);
    }
    return vector_to_array(out);
}

py::array_t<double> rsi(py::array_t<double, py::array::c_style | py::array::forcecast> closes,
                        std::size_t period) {
    const py::buffer_info info = closes.request();
    if (info.ndim != 1) throw std::invalid_argument("closes must be 1-D");
    std::vector<double> out;
    {
        py::gil_scoped_release release;
        out = stockdesk::native::rsi(static_cast<const double *>(info.ptr),
                                     static_cast<std::size_t>(info.shape[0]), period);
    }
    return vector_to_array(out);
}

py::dict macd(py::array_t<double, py::array::c_style | py::array::forcecast> closes,
              int fast, int slow, int signal) {
    const py::buffer_info info = closes.request();
    if (info.ndim != 1) throw std::invalid_argument("closes must be 1-D");
    stockdesk::native::MacdResult r;
    {
        py::gil_scoped_release release;
        r = stockdesk::native::macd(static_cast<const double *>(info.ptr),
                                    static_cast<std::size_t>(info.shape[0]), fast, slow, signal);
    }
    py::dict out;
    out["dif"] = vector_to_array(r.dif);
    out["dea"] = vector_to_array(r.dea);
    out["hist"] = vector_to_array(r.hist);
    return out;
}

py::dict td_counts(py::array_t<double, py::array::c_style | py::array::forcecast> closes,
                   py::array_t<double, py::array::c_style | py::array::forcecast> highs,
                   py::array_t<double, py::array::c_style | py::array::forcecast> lows) {
    const py::buffer_info c = closes.request(), h = highs.request(), l = lows.request();
    if (c.ndim != 1 || h.ndim != 1 || l.ndim != 1 || c.shape[0] != h.shape[0] || c.shape[0] != l.shape[0]) {
        throw std::invalid_argument("closes/highs/lows must be equal-length 1-D arrays");
    }
    stockdesk::native::TdCounts r;
    {
        py::gil_scoped_release release;
        r = stockdesk::native::td_counts(static_cast<const double *>(c.ptr),
                                         static_cast<const double *>(h.ptr),
                                         static_cast<const double *>(l.ptr),
                                         static_cast<std::size_t>(c.shape[0]));
    }
    py::dict out;
    out["buy"] = r.buy;
    out["sell"] = r.sell;
    out["last_buy9"] = r.last_buy9;
    out["last_sell9"] = r.last_sell9;
    out["buy_countdown"] = r.buy_countdown;
    out["sell_countdown"] = r.sell_countdown;
    out["buy_countdown_done"] = r.buy_countdown_done;
    out["sell_countdown_done"] = r.sell_countdown_done;
    out["buy_countdown_last"] = r.buy_countdown_last;
    out["sell_countdown_last"] = r.sell_countdown_last;
    return out;
}

py::dict risk_metrics(py::array_t<double, py::array::c_style | py::array::forcecast> nav,
                      py::array_t<double, py::array::c_style | py::array::forcecast> bench) {
    const py::buffer_info n = nav.request(), b = bench.request();
    if (n.ndim != 1 || b.ndim != 1) throw std::invalid_argument("nav/bench must be 1-D");
    stockdesk::native::RiskResult r;
    {
        py::gil_scoped_release release;
        r = stockdesk::native::risk_metrics(static_cast<const double *>(n.ptr),
                                            static_cast<std::size_t>(n.shape[0]),
                                            static_cast<const double *>(b.ptr),
                                            static_cast<std::size_t>(b.shape[0]));
    }
    py::dict out;
    out["total_return"] = r.total_return;
    out["annual_return"] = r.annual_return;
    out["volatility"] = r.volatility;
    out["sharpe"] = r.sharpe;
    out["max_drawdown"] = r.max_drawdown;
    out["benchmark_return"] = r.benchmark_return;
    out["beta"] = r.beta;
    out["alpha"] = r.alpha;
    out["has_beta"] = r.has_beta;
    return out;
}

py::dict chips(py::array_t<double, py::array::c_style | py::array::forcecast> highs,
               py::array_t<double, py::array::c_style | py::array::forcecast> lows,
               py::array_t<double, py::array::c_style | py::array::forcecast> closes,
               py::array_t<double, py::array::c_style | py::array::forcecast> volumes,
               std::size_t buckets) {
    const py::buffer_info h = highs.request(), l = lows.request(), c = closes.request(), v = volumes.request();
    if (h.ndim != 1 || l.ndim != 1 || c.ndim != 1 || v.ndim != 1 ||
        h.shape[0] != l.shape[0] || h.shape[0] != c.shape[0] || h.shape[0] != v.shape[0]) {
        throw std::invalid_argument("highs/lows/closes/volumes must be equal-length 1-D arrays");
    }
    stockdesk::native::ChipsResult r;
    {
        py::gil_scoped_release release;
        r = stockdesk::native::chips(static_cast<const double *>(h.ptr), static_cast<const double *>(l.ptr),
                                     static_cast<const double *>(c.ptr), static_cast<const double *>(v.ptr),
                                     static_cast<std::size_t>(h.shape[0]), buckets);
    }
    py::dict out;
    out["weights"] = vector_to_array(r.weights);
    out["centers"] = vector_to_array(r.centers);
    out["avg_cost"] = r.avg_cost;
    out["profit_ratio"] = r.profit_ratio;
    out["cost_low"] = r.cost_low;
    out["cost_high"] = r.cost_high;
    out["support"] = r.support;
    out["resistance"] = r.resistance;
    out["peak"] = r.peak;
    out["low"] = r.low;
    out["high"] = r.high;
    return out;
}

py::dict fibonacci(py::array_t<double, py::array::c_style | py::array::forcecast> highs,
                   py::array_t<double, py::array::c_style | py::array::forcecast> lows,
                   py::array_t<double, py::array::c_style | py::array::forcecast> closes) {
    const py::buffer_info h = highs.request(), l = lows.request(), c = closes.request();
    if (h.ndim != 1 || l.ndim != 1 || c.ndim != 1 || h.shape[0] != l.shape[0] || h.shape[0] != c.shape[0]) {
        throw std::invalid_argument("highs/lows/closes must be equal-length 1-D arrays");
    }
    stockdesk::native::FibResult r;
    {
        py::gil_scoped_release release;
        r = stockdesk::native::fibonacci(static_cast<const double *>(h.ptr),
                                         static_cast<const double *>(l.ptr),
                                         static_cast<const double *>(c.ptr),
                                         static_cast<std::size_t>(h.shape[0]));
    }
    py::dict out;
    out["low"] = r.low; out["high"] = r.high; out["current"] = r.current;
    out["position"] = r.position; out["ma20"] = r.ma20; out["ma60"] = r.ma60;
    out["rsi"] = r.rsi; out["levels"] = r.levels;
    return out;
}

py::dict factor_composite(py::array_t<double, py::array::c_style | py::array::forcecast> values,
                            py::array_t<std::int64_t, py::array::c_style | py::array::forcecast> directions,
                            py::array_t<std::int64_t, py::array::c_style | py::array::forcecast> categories,
                            py::array_t<double, py::array::c_style | py::array::forcecast> weights) {
    const py::buffer_info v = values.request(), d = directions.request();
    const py::buffer_info c = categories.request(), w = weights.request();
    if (v.ndim != 2 || d.ndim != 1 || c.ndim != 1 || w.ndim != 1) {
        throw std::invalid_argument("values must be 2-D; directions/categories/weights 1-D");
    }
    const std::size_t rows = static_cast<std::size_t>(v.shape[0]);
    const std::size_t factors = static_cast<std::size_t>(v.shape[1]);
    if (d.shape[0] != v.shape[1] || c.shape[0] != v.shape[1] ||
        w.shape[0] == 0) {
        throw std::invalid_argument("factor vector lengths do not match");
    }
    stockdesk::native::FactorResult result;
    {
        py::gil_scoped_release release;
        result = stockdesk::native::factor_composite(
            static_cast<const double *>(v.ptr), rows, factors,
            static_cast<const std::int64_t *>(d.ptr),
            static_cast<const std::int64_t *>(c.ptr),
            static_cast<std::size_t>(w.shape[0]),
            static_cast<const double *>(w.ptr));
    }
    py::dict out;
    out["category_scores"] = matrix_to_array(result.category_scores,
                                              static_cast<py::ssize_t>(rows),
                                              static_cast<py::ssize_t>(w.shape[0]));
    out["category_hits"] = result.category_hits;
    out["factor_hits"] = result.factor_hits;
    out["composite"] = vector_to_array(result.composite);
    out["percentile"] = vector_to_array(result.percentile);
    return out;
}

py::dict breadth_census(py::array_t<double, py::array::c_style | py::array::forcecast> pct,
                        py::array_t<double, py::array::c_style | py::array::forcecast> price,
                        py::array_t<double, py::array::c_style | py::array::forcecast> limit_pct) {
    const py::buffer_info p = pct.request(), q = price.request(), l = limit_pct.request();
    if (p.ndim != 1 || q.ndim != 1 || l.ndim != 1) throw std::invalid_argument("pct/price/limit must be 1-D");
    if (p.shape[0] != q.shape[0] || p.shape[0] != l.shape[0]) {
        throw std::invalid_argument("pct/price/limit must have the same length");
    }
    stockdesk::native::BreadthResult result;
    {
        py::gil_scoped_release release;
        result = stockdesk::native::breadth_census(
            static_cast<const double *>(p.ptr), static_cast<const double *>(q.ptr),
            static_cast<const double *>(l.ptr), static_cast<std::size_t>(p.shape[0]));
    }
    py::dict out;
    out["total"] = result.total;
    out["traded"] = result.traded;
    out["up"] = result.up;
    out["down"] = result.down;
    out["flat"] = result.flat;
    out["limit_up"] = result.limit_up;
    out["limit_down"] = result.limit_down;
    out["suspended"] = result.suspended;
    out["missing"] = result.missing;
    return out;
}

py::dict coverage_audit(py::array_t<long long, py::array::c_style | py::array::forcecast> codes,
                        py::array_t<long long, py::array::c_style | py::array::forcecast> expected,
                        std::size_t missing_sample) {
    const py::buffer_info c = codes.request(), e = expected.request();
    if (c.ndim != 1 || e.ndim != 1) throw std::invalid_argument("codes/expected must be 1-D");
    stockdesk::native::CoverageResult result;
    {
        py::gil_scoped_release release;
        result = stockdesk::native::coverage_audit(
            static_cast<const long long *>(c.ptr), static_cast<std::size_t>(c.shape[0]),
            static_cast<const long long *>(e.ptr), static_cast<std::size_t>(e.shape[0]),
            missing_sample);
    }
    py::dict out;
    out["expected"] = result.expected;
    out["present"] = result.present;
    out["duplicates"] = result.duplicates;
    out["missing"] = result.missing;
    out["extra"] = result.extra;
    out["missing_sample"] = result.missing_sample;
    return out;
}

py::dict baum_welch(py::array_t<double, py::array::c_style | py::array::forcecast> x,
                    std::vector<double> mu, std::vector<double> var,
                    std::vector<double> pi, std::vector<double> A,
                    int iters) {
    const py::buffer_info info = x.request();
    if (info.ndim != 1) throw std::invalid_argument("x must be 1-D");
    const std::size_t n = static_cast<std::size_t>(info.shape[0]);
    const std::size_t k = mu.size();
    if (A.size() != k * k) throw std::invalid_argument("A must be k*k in row-major order");

    HmmResult result;
    {
        py::gil_scoped_release release;
        result = stockdesk::native::fit_hmm(
            static_cast<const double *>(info.ptr), n, std::move(mu), std::move(var),
            std::move(pi), std::move(A), iters);
    }

    py::dict out;
    out["mu"] = vector_to_array(result.mu);
    out["var"] = vector_to_array(result.var);
    out["pi"] = vector_to_array(result.pi);
    out["A"] = matrix_to_array(result.A, static_cast<py::ssize_t>(k), static_cast<py::ssize_t>(k));
    out["gamma"] = matrix_to_array(result.gamma, static_cast<py::ssize_t>(n), static_cast<py::ssize_t>(k));
    out["loglik"] = result.loglik;
    out["iterations"] = result.iterations;
    out["converged"] = result.converged;
    return out;
}

}  // namespace

PYBIND11_MODULE(_native, m) {
    m.doc() = "StockDesk C++ model core: lattice percolation + univariate Gaussian HMM";
    m.attr("__version__") = "1.4.0";
    m.def("grid_largest", &grid_largest, py::arg("grid"), py::arg("cols"),
          "Largest four-neighbour lattice component (union-find).");
    m.def("grid_batch", &grid_batch, py::arg("grids"), py::arg("cols"),
          "Batched largest-component summaries for Monte-Carlo lattices.");
    m.def("moving_average", &moving_average, py::arg("closes"), py::arg("window"));
    m.def("rsi", &rsi, py::arg("closes"), py::arg("period"));
    m.def("macd", &macd, py::arg("closes"), py::arg("fast"), py::arg("slow"), py::arg("signal"));
    m.def("td_counts", &td_counts, py::arg("closes"), py::arg("highs"), py::arg("lows"));
    m.def("risk_metrics", &risk_metrics, py::arg("nav"), py::arg("bench"));
    m.def("chips", &chips, py::arg("highs"), py::arg("lows"), py::arg("closes"), py::arg("volumes"), py::arg("buckets"));
    m.def("fibonacci", &fibonacci, py::arg("highs"), py::arg("lows"), py::arg("closes"));
    m.def("factor_composite", &factor_composite, py::arg("values"), py::arg("directions"),
          py::arg("categories"), py::arg("weights"));
    m.def("breadth_census", &breadth_census, py::arg("pct"), py::arg("price"), py::arg("limit_pct"),
          "Census every row once: traded/suspended/missing and board-specific limit hits.");
    m.def("coverage_audit", &coverage_audit, py::arg("codes"), py::arg("expected"),
          py::arg("missing_sample") = 20,
          "Compare actual and expected code sets: duplicates, omissions, extras.");
    m.def("baum_welch", &baum_welch, py::arg("x"), py::arg("mu"), py::arg("var"),
          py::arg("pi"), py::arg("A"), py::arg("iters") = 80,
          "Scaled univariate Gaussian Baum-Welch; A is row-major k*k.");
}
