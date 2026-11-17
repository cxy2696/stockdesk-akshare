#include "core.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>

namespace stockdesk::native {
namespace {

constexpr double kTwoPi = 6.283185307179586476925286766559;
constexpr double kTiny = 1e-300;
constexpr double kVarFloor = 1e-8;
constexpr double kMaxIterations = 10000;

bool finite(double v) { return std::isfinite(v); }

void require_finite(const std::vector<double> &values, const char *name) {
    for (double v : values) {
        if (!finite(v)) throw std::invalid_argument(std::string(name) + " contains a non-finite value");
    }
}

void normalise(std::vector<double> &values, const char *name) {
    double sum = 0;
    for (double v : values) {
        if (!finite(v) || v < 0) throw std::invalid_argument(std::string(name) + " must be finite and >= 0");
        sum += v;
    }
    if (!(sum > 0) || !finite(sum)) throw std::invalid_argument(std::string(name) + " must sum to a positive value");
    for (double &v : values) v /= sum;
}

void normalise_rows(std::vector<double> &A, std::size_t k) {
    for (std::size_t i = 0; i < k; ++i) {
        double sum = 0;
        for (std::size_t j = 0; j < k; ++j) {
            const double v = A[i * k + j];
            if (!finite(v) || v < 0) throw std::invalid_argument("A must be finite and >= 0");
            sum += v;
        }
        if (!(sum > 0) || !finite(sum)) throw std::invalid_argument("each A row must sum to a positive value");
        for (std::size_t j = 0; j < k; ++j) A[i * k + j] /= sum;
    }
}

void require_finite_result(const HmmResult &r) {
    auto check = [](const std::vector<double> &values, const char *name) {
        for (double v : values) {
            if (!finite(v)) throw std::runtime_error(std::string("HMM produced non-finite ") + name);
        }
    };
    check(r.mu, "mu");
    check(r.var, "var");
    check(r.pi, "pi");
    check(r.A, "A");
    check(r.gamma, "gamma");
    if (!finite(r.loglik)) throw std::runtime_error("HMM produced a non-finite log-likelihood");
}

}  // namespace

HmmResult fit_hmm(const double *x, std::size_t n,
                  std::vector<double> mu, std::vector<double> var,
                  std::vector<double> pi, std::vector<double> A,
                  int iters) {
    if (x == nullptr) throw std::invalid_argument("x pointer is null");
    if (n < 2) throw std::invalid_argument("need n >= 2");
    const std::size_t k = mu.size();
    if (k < 2) throw std::invalid_argument("need k >= 2");
    if (k > 64) throw std::invalid_argument("k is unreasonably large");
    if (n > std::numeric_limits<std::size_t>::max() / k) throw std::invalid_argument("n*k is too large");
    if (var.size() != k || pi.size() != k) throw std::invalid_argument("mu/var/pi must have the same length");
    if (A.size() != k * k) throw std::invalid_argument("A must be k*k");
    if (iters < 1 || iters > static_cast<int>(kMaxIterations)) {
        throw std::invalid_argument("iters must be in [1, 10000]");
    }

    for (std::size_t t = 0; t < n; ++t) {
        if (!finite(x[t])) throw std::invalid_argument("x contains a non-finite value");
    }
    require_finite(mu, "mu");
    require_finite(var, "var");
    for (double &v : var) {
        if (v <= 0) throw std::invalid_argument("var must be > 0");
        v = std::max(v, kVarFloor);
    }
    normalise(pi, "pi");
    normalise_rows(A, k);

    std::vector<double> B(n * k), alpha(n * k), beta(n * k), gamma(n * k), c(n);
    std::vector<double> pi2 = pi;
    std::vector<double> xi(k * k), scratch(k * k);
    double last = -std::numeric_limits<double>::infinity();
    int used = 0;
    bool converged = false;

    for (int it = 0; it < iters; ++it) {
        for (std::size_t t = 0; t < n; ++t) {
            for (std::size_t j = 0; j < k; ++j) {
                const double d = x[t] - mu[j];
                B[t * k + j] = std::exp(-0.5 * (std::log(kTwoPi * var[j]) + d * d / var[j])) + kTiny;
            }
        }

        for (std::size_t j = 0; j < k; ++j) alpha[j] = pi[j] * B[j];
        c[0] = std::max(kTiny, std::accumulate(alpha.begin(), alpha.begin() + k, 0.0));
        for (std::size_t j = 0; j < k; ++j) alpha[j] /= c[0];
        for (std::size_t t = 1; t < n; ++t) {
            for (std::size_t j = 0; j < k; ++j) {
                double sum = 0;
                for (std::size_t i = 0; i < k; ++i) sum += alpha[(t - 1) * k + i] * A[i * k + j];
                alpha[t * k + j] = sum * B[t * k + j];
            }
            double sum = 0;
            for (std::size_t j = 0; j < k; ++j) sum += alpha[t * k + j];
            c[t] = std::max(kTiny, sum);
            for (std::size_t j = 0; j < k; ++j) alpha[t * k + j] /= c[t];
        }

        for (std::size_t j = 0; j < k; ++j) beta[(n - 1) * k + j] = 1.0;
        for (std::size_t t = n - 1; t-- > 0;) {
            for (std::size_t i = 0; i < k; ++i) {
                double sum = 0;
                for (std::size_t j = 0; j < k; ++j) {
                    sum += A[i * k + j] * B[(t + 1) * k + j] * beta[(t + 1) * k + j];
                }
                beta[t * k + i] = sum / std::max(c[t + 1], kTiny);
            }
        }

        for (std::size_t t = 0; t < n; ++t) {
            double sum = 0;
            for (std::size_t j = 0; j < k; ++j) {
                gamma[t * k + j] = alpha[t * k + j] * beta[t * k + j];
                sum += gamma[t * k + j];
            }
            sum = std::max(sum, kTiny);
            for (std::size_t j = 0; j < k; ++j) gamma[t * k + j] /= sum;
        }

        // Accumulate xi without an O(n*k*k) tensor: one k*k matrix per pass.
        std::fill(xi.begin(), xi.end(), 0.0);
        for (std::size_t t = 0; t + 1 < n; ++t) {
            double total = 0;
            for (std::size_t i = 0; i < k; ++i) {
                for (std::size_t j = 0; j < k; ++j) {
                    const double v = alpha[t * k + i] * A[i * k + j] *
                                     B[(t + 1) * k + j] * beta[(t + 1) * k + j];
                    scratch[i * k + j] = v;
                    total += v;
                }
            }
            total = std::max(total, kTiny);
            for (std::size_t i = 0; i < k * k; ++i) xi[i] += scratch[i] / total;
        }

        double weight_sum = 0;
        for (std::size_t j = 0; j < k; ++j) weight_sum += gamma[j];
        pi2.assign(k, 0.0);
        for (std::size_t j = 0; j < k; ++j) pi2[j] = gamma[j] / std::max(weight_sum, kTiny);

        for (std::size_t i = 0; i < k; ++i) {
            double row_sum = 0;
            for (std::size_t j = 0; j < k; ++j) row_sum += xi[i * k + j];
            row_sum = std::max(row_sum, kTiny);
            double norm = 0;
            for (std::size_t j = 0; j < k; ++j) {
                A[i * k + j] = std::max(1e-4, xi[i * k + j] / row_sum);
                norm += A[i * k + j];
            }
            if (!(norm > 0)) norm = 1.0;
            for (std::size_t j = 0; j < k; ++j) A[i * k + j] /= norm;
        }

        for (std::size_t j = 0; j < k; ++j) {
            double weight = 1e-6;
            for (std::size_t t = 0; t < n; ++t) weight += gamma[t * k + j];
            double mean = 0;
            for (std::size_t t = 0; t < n; ++t) mean += gamma[t * k + j] * x[t];
            mean /= weight;
            double variance = 0;
            for (std::size_t t = 0; t < n; ++t) {
                const double d = x[t] - mean;
                variance += gamma[t * k + j] * d * d;
            }
            mu[j] = mean;
            var[j] = std::max(kVarFloor, variance / weight);
        }

        double loglik = 0;
        for (std::size_t t = 0; t < n; ++t) loglik += std::log(c[t]);
        used = it + 1;

        if (it > 0 && std::abs(loglik - last) < std::max(1e-3, std::abs(loglik) * 1e-4)) {
            converged = true;
            last = loglik;
            break;
        }
        last = loglik;
        pi = pi2;
    }

    HmmResult result;
    result.mu = std::move(mu);
    result.var = std::move(var);
    result.pi = std::move(pi2);
    result.A = std::move(A);
    result.gamma = std::move(gamma);
    result.loglik = last;
    result.iterations = used;
    result.converged = converged;
    require_finite_result(result);
    return result;
}

}  // namespace stockdesk::native
