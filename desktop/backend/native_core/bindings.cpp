// pybind11 boundary for the pure C++ model core.
//
// This file validates Python/numpy objects, converts them to plain C++
// containers once, and converts the typed results back to numpy arrays. The
// algorithms in percolation.cpp / hmm.cpp have no Python dependency.
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

    const auto result = stockdesk::native::analyze_grid(
        static_cast<const std::uint8_t *>(info.ptr),
        static_cast<std::size_t>(info.shape[0]),
        static_cast<std::size_t>(cols));

    py::dict out;
    out["largest"] = result.largest;
    out["sizes"] = result.sizes;
    out["spanning"] = result.spanning;
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
    const auto result = stockdesk::native::breadth_census(
        static_cast<const double *>(p.ptr), static_cast<const double *>(q.ptr),
        static_cast<const double *>(l.ptr), static_cast<std::size_t>(p.shape[0]));
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
    const auto result = stockdesk::native::coverage_audit(
        static_cast<const long long *>(c.ptr), static_cast<std::size_t>(c.shape[0]),
        static_cast<const long long *>(e.ptr), static_cast<std::size_t>(e.shape[0]),
        missing_sample);
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

    const HmmResult result = stockdesk::native::fit_hmm(
        static_cast<const double *>(info.ptr), n, std::move(mu), std::move(var),
        std::move(pi), std::move(A), iters);

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
    m.attr("__version__") = "1.2.0";
    m.def("grid_largest", &grid_largest, py::arg("grid"), py::arg("cols"),
          "Largest four-neighbour lattice component (union-find).");
    m.def("breadth_census", &breadth_census, py::arg("pct"), py::arg("price"), py::arg("limit_pct"),
          "Census every row once: traded/suspended/missing and board-specific limit hits.");
    m.def("coverage_audit", &coverage_audit, py::arg("codes"), py::arg("expected"),
          py::arg("missing_sample") = 20,
          "Compare actual and expected code sets: duplicates, omissions, extras.");
    m.def("baum_welch", &baum_welch, py::arg("x"), py::arg("mu"), py::arg("var"),
          py::arg("pi"), py::arg("A"), py::arg("iters") = 80,
          "Scaled univariate Gaussian Baum-Welch; A is row-major k*k.");
}
