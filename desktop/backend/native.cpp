// StockDesk C++ core: lattice union-find + univariate Gaussian Baum-Welch.
// Python keeps the API/response shaping and falls back to the previous NumPy
// implementation when this optional extension is not built.
#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
#include <stdexcept>
#include <vector>

namespace py = pybind11;

namespace {

std::vector<int> component_labels(const std::vector<uint8_t> &grid, int cols,
                                  std::vector<int> &sizes, bool &spanning,
                                  std::vector<int> &largest) {
    int n = (int)grid.size();
    int rows = cols > 0 ? (n + cols - 1) / cols : 0;
    std::vector<int> labels(n, -1);
    sizes.clear();
    largest.clear();
    spanning = false;
    std::vector<int> stack;
    int label = 0;
    for (int i = 0; i < n; ++i) {
        if (!grid[i] || labels[i] >= 0) continue;
        labels[i] = label;
        stack.clear();
        stack.push_back(i);
        int size = 0;
        bool top = false, bottom = false, left = false, right = false;
        while (!stack.empty()) {
            int v = stack.back();
            stack.pop_back();
            ++size;
            int r = v / cols, c = v % cols;
            top |= r == 0;
            bottom |= r == rows - 1;
            left |= c == 0;
            right |= c == cols - 1;
            const int dr[4] = {-1, 1, 0, 0};
            const int dc[4] = {0, 0, -1, 1};
            for (int k = 0; k < 4; ++k) {
                int nr = r + dr[k], nc = c + dc[k];
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                int w = nr * cols + nc;
                if (w < n && grid[w] && labels[w] < 0) {
                    labels[w] = label;
                    stack.push_back(w);
                }
            }
        }
        sizes.push_back(size);
        if (size > (int)largest.size()) {
            largest.clear();
            for (int j = 0; j < n; ++j) if (labels[j] == label) largest.push_back(j);
            spanning = top && bottom && left && right;
        }
        ++label;
    }
    std::sort(sizes.begin(), sizes.end(), std::greater<int>());
    return labels;
}

py::dict grid_largest(py::array_t<uint8_t, py::array::c_style | py::array::forcecast> grid,
                      int cols) {
    auto info = grid.request();
    if (info.ndim != 1) throw std::invalid_argument("grid must be 1-D");
    std::vector<uint8_t> cells((uint8_t *)info.ptr, (uint8_t *)info.ptr + info.shape[0]);
    std::vector<int> sizes, largest;
    bool spanning = false;
    component_labels(cells, cols, sizes, spanning, largest);
    py::dict out;
    out["largest"] = largest;
    out["sizes"] = sizes;
    out["spanning"] = spanning;
    return out;
}


py::dict baum_welch(py::array_t<double, py::array::c_style | py::array::forcecast> x,
                    std::vector<double> mu, std::vector<double> var,
                    std::vector<double> pi, std::vector<std::vector<double>> A,
                    int iters) {
    auto info = x.request();
    if (info.ndim != 1) throw std::invalid_argument("x must be 1-D");
    int n = (int)info.shape[0], k = (int)mu.size();
    if (n < 2 || k < 2) throw std::invalid_argument("need n>=2, k>=2");
    const double *xs = (const double *)info.ptr;
    std::vector<double> B((size_t)n * k), alpha((size_t)n * k), beta((size_t)n * k), gamma((size_t)n * k), c(n), pi2 = pi;
    std::vector<double> scratch(k * k);
    std::vector<std::vector<double>> Am = A;
    double last = -std::numeric_limits<double>::infinity();
    int used = 0;
    for (int it = 0; it < iters; ++it) {
        for (int t = 0; t < n; ++t) for (int j = 0; j < k; ++j) {
            double d = xs[t] - mu[j];
            B[t * k + j] = std::exp(-0.5 * (std::log(6.283185307179586 * var[j]) + d * d / var[j])) + 1e-300;
        }
        for (int j = 0; j < k; ++j) alpha[j] = pi[j] * B[j];
        c[0] = std::max(1e-300, std::accumulate(&alpha[0], &alpha[0] + k, 0.0));
        for (int j = 0; j < k; ++j) alpha[j] /= c[0];
        for (int t = 1; t < n; ++t) {
            for (int j = 0; j < k; ++j) {
                double s = 0;
                for (int i = 0; i < k; ++i) s += alpha[(t - 1) * k + i] * Am[i][j];
                alpha[t * k + j] = s * B[t * k + j];
            }
            double s = 0;
            for (int j = 0; j < k; ++j) s += alpha[t * k + j];
            c[t] = std::max(1e-300, s);
            for (int j = 0; j < k; ++j) alpha[t * k + j] /= c[t];
        }
        for (int j = 0; j < k; ++j) beta[(n - 1) * k + j] = 1.0;
        for (int t = n - 2; t >= 0; --t) {
            for (int i = 0; i < k; ++i) {
                double s = 0;
                for (int j = 0; j < k; ++j) s += Am[i][j] * B[(t + 1) * k + j] * beta[(t + 1) * k + j];
                beta[t * k + i] = s / std::max(c[t + 1], 1e-300);
            }
        }
        for (int t = 0; t < n; ++t) {
            double s = 0;
            for (int j = 0; j < k; ++j) {
                gamma[t * k + j] = alpha[t * k + j] * beta[t * k + j];
                s += gamma[t * k + j];
            }
            s = std::max(s, 1e-300);
            for (int j = 0; j < k; ++j) gamma[t * k + j] /= s;
        }
        // Accumulate xi directly into a k×k matrix; no O(T·k²) storage.
        std::vector<std::vector<double>> xi(k, std::vector<double>(k, 0.0));
        for (int t = 0; t + 1 < n; ++t) {
            double total = 0;
            for (int i = 0; i < k; ++i) for (int j = 0; j < k; ++j) {
                scratch[i * k + j] = alpha[t * k + i] * Am[i][j] * B[(t + 1) * k + j] * beta[(t + 1) * k + j];
                total += scratch[i * k + j];
            }
            total = std::max(total, 1e-300);
            for (int i = 0; i < k; ++i) for (int j = 0; j < k; ++j) xi[i][j] += scratch[i * k + j] / total;
        }
        double wsum = 0;
        for (int j = 0; j < k; ++j) wsum += gamma[j];
        pi2.assign(k, 0.0);
        for (int j = 0; j < k; ++j) pi2[j] = gamma[j] / std::max(wsum, 1e-300);
        for (int i = 0; i < k; ++i) {
            double row = 0;
            for (int j = 0; j < k; ++j) row += xi[i][j];
            row = std::max(row, 1e-300);
            for (int j = 0; j < k; ++j) Am[i][j] = std::max(1e-4, xi[i][j] / row);
            double norm = 0;
            for (int j = 0; j < k; ++j) norm += Am[i][j];
            for (int j = 0; j < k; ++j) Am[i][j] /= norm;
        }
        for (int j = 0; j < k; ++j) {
            double w = 1e-6;
            for (int t = 0; t < n; ++t) w += gamma[t * k + j];
            double mean = 0;
            for (int t = 0; t < n; ++t) mean += gamma[t * k + j] * xs[t];
            mean /= w;
            double vv = 0;
            for (int t = 0; t < n; ++t) { double d = xs[t] - mean; vv += gamma[t * k + j] * d * d; }
            mu[j] = mean;
            var[j] = std::max(1e-8, vv / w);
        }
        double ll = 0;
        for (int t = 0; t < n; ++t) ll += std::log(c[t]);
        used = it + 1;
        if (it > 0 && std::abs(ll - last) < std::max(1e-3, std::abs(ll) * 1e-4)) { last = ll; break; }
        last = ll;
        pi = pi2;
    }
    py::dict out;
    out["mu"] = py::array_t<double>(mu.size(), mu.data());
    out["var"] = py::array_t<double>(var.size(), var.data());
    out["pi"] = py::array_t<double>(pi2.size(), pi2.data());
    out["A"] = py::array_t<double>(k * k);
    auto arr = out["A"].cast<py::array_t<double>>();
    double *dst = arr.mutable_data();
    for (int i = 0; i < k; ++i) for (int j = 0; j < k; ++j) dst[i * k + j] = Am[i][j];
    out["gamma"] = py::array_t<double>(gamma.size(), gamma.data());
    out["loglik"] = last;
    out["iterations"] = used;
    return out;
}

}  // namespace

PYBIND11_MODULE(_native, m) {
    m.doc() = "StockDesk C++ core: lattice percolation + univariate Gaussian HMM";
    m.attr("__version__") = "1.0.0";
    m.def("grid_largest", &grid_largest, py::arg("grid"), py::arg("cols"));
    m.def("baum_welch", &baum_welch, py::arg("x"), py::arg("mu"), py::arg("var"),
          py::arg("pi"), py::arg("A"), py::arg("iters") = 80);
}
