// Column standardisation for the automated feature matrix.
#include "core.hpp"

#include <cmath>
#include <limits>
#include <stdexcept>
#include <vector>

namespace stockdesk::native {
std::vector<double> standardize_matrix_fit(const double *values, std::size_t rows,
                                           std::size_t cols, std::size_t fit_rows) {
    if (values == nullptr) throw std::invalid_argument("matrix pointer is null");
    if (rows == 0 || cols == 0) throw std::invalid_argument("matrix dimensions must be > 0");
    if (fit_rows == 0 || fit_rows > rows) throw std::invalid_argument("fit_rows must be in (0, rows]");
    if (rows > std::numeric_limits<std::size_t>::max() / cols) {
        throw std::invalid_argument("matrix is too large");
    }
    std::vector<double> out(rows * cols, 0.0);
    for (std::size_t c = 0; c < cols; ++c) {
        double sum = 0.0, sum2 = 0.0;
        std::size_t n = 0;
        // Fit statistics only on the training prefix; validation/live rows use
        // the same mean/std, preventing look-ahead standardisation.
        for (std::size_t r = 0; r < fit_rows; ++r) {
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

std::vector<double> standardize_matrix(const double *values, std::size_t rows, std::size_t cols) {
    return standardize_matrix_fit(values, rows, cols, rows);
}
}
