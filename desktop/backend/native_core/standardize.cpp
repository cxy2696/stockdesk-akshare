// Column standardisation for the automated feature matrix.
#include "core.hpp"

#include <cmath>
#include <limits>
#include <stdexcept>
#include <vector>

namespace stockdesk::native {
std::vector<double> standardize_matrix(const double *values, std::size_t rows, std::size_t cols) {
    if (values == nullptr) throw std::invalid_argument("matrix pointer is null");
    if (rows == 0 || cols == 0) throw std::invalid_argument("matrix dimensions must be > 0");
    if (rows > std::numeric_limits<std::size_t>::max() / cols) {
        throw std::invalid_argument("matrix is too large");
    }
    std::vector<double> out(rows * cols, 0.0);
    for (std::size_t c = 0; c < cols; ++c) {
        double sum = 0.0, sum2 = 0.0;
        std::size_t n = 0;
        for (std::size_t r = 0; r < rows; ++r) {
            const double v = values[r * cols + c];
            if (!std::isfinite(v)) continue;
            sum += v; sum2 += v * v; ++n;
        }
        const double mean = n ? sum / static_cast<double>(n) : 0.0;
        const double var = n ? std::max(0.0, sum2 / static_cast<double>(n) - mean * mean) : 0.0;
        const double std = std::sqrt(var);
        const double inv = std > 1e-12 ? 1.0 / std : 0.0;
        for (std::size_t r = 0; r < rows; ++r) {
            const double v = values[r * cols + c];
            out[r * cols + c] = std::isfinite(v) ? (v - mean) * inv : 0.0;
        }
    }
    return out;
}
}
