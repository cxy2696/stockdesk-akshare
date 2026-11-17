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
    m.attr("__version__") = "1.1.0";
    m.def("grid_largest", &grid_largest, py::arg("grid"), py::arg("cols"),
          "Largest four-neighbour lattice component (union-find).");
    m.def("baum_welch", &baum_welch, py::arg("x"), py::arg("mu"), py::arg("var"),
          py::arg("pi"), py::arg("A"), py::arg("iters") = 80,
          "Scaled univariate Gaussian Baum-Welch; A is row-major k*k.");
}
