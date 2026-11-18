#include "core.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>
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

template <std::size_t FixedK>
HmmResult fit_hmm_impl(const double *x, std::size_t n,
                       std::vector<double> mu, std::vector<double> var,
                       std::vector<double> pi, std::vector<double> A,
                       int iters) {
    if (x == nullptr) throw std::invalid_argument("x pointer is null");
    if (n < 2) throw std::invalid_argument("need n >= 2");
    const std::size_t k = FixedK == 0 ? mu.size() : FixedK;
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
    std::vector<double> xi(k * k), scratch(k * k), bB(k);
    std::vector<double> log_coeff(k), inv_half_var(k);
    std::vector<double> weight(k), weighted_sum(k);
    double last = -std::numeric_limits<double>::infinity();
    int used = 0;
    bool converged = false;

    const double *xp = x;
    double *Bp = B.data();
    double *ap = alpha.data();
    double *bp = beta.data();
    double *gp = gamma.data();
    double *dp = A.data();
    double *scp = scratch.data();
    double *xip = xi.data();

    for (int it = 0; it < iters; ++it) {
        // Half-log normalisation and half-inverse variance are constant per
        // state for the whole iteration.  Fold the -0.5 factor in once so the
        // emission loop only does one multiply and one add per state/bar.
        for (std::size_t j = 0; j < k; ++j) {
            log_coeff[j] = -0.5 * std::log(kTwoPi * var[j]);
            inv_half_var[j] = -0.5 / var[j];
        }
        for (std::size_t t = 0; t < n; ++t) {
            const double xt = xp[t];
            double *bt = Bp + t * k;
            if constexpr (FixedK == 3) {
                const double d0 = xt - mu[0], d1 = xt - mu[1], d2 = xt - mu[2];
                bt[0] = std::exp(log_coeff[0] + d0 * d0 * inv_half_var[0]) + kTiny;
                bt[1] = std::exp(log_coeff[1] + d1 * d1 * inv_half_var[1]) + kTiny;
                bt[2] = std::exp(log_coeff[2] + d2 * d2 * inv_half_var[2]) + kTiny;
            } else {
                for (std::size_t j = 0; j < k; ++j) {
                    const double d = xt - mu[j];
                    bt[j] = std::exp(log_coeff[j] + d * d * inv_half_var[j]) + kTiny;
                }
            }
        }

        // Forward pass with reciprocal normalisation (multiply, don't divide).
        for (std::size_t j = 0; j < k; ++j) ap[j] = pi[j] * Bp[j];
        {
            double sum = 0;
            for (std::size_t j = 0; j < k; ++j) sum += ap[j];
            c[0] = std::max(sum, kTiny);
            const double inv = 1.0 / c[0];
            for (std::size_t j = 0; j < k; ++j) ap[j] *= inv;
        }
        for (std::size_t t = 1; t < n; ++t) {
            const double *prev = ap + (t - 1) * k;
            double *cur = ap + t * k;
            const double *bt = Bp + t * k;
            if constexpr (FixedK == 3) {
                const double p0 = prev[0], p1 = prev[1], p2 = prev[2];
                cur[0] = (p0 * dp[0] + p1 * dp[3] + p2 * dp[6]) * bt[0];
                cur[1] = (p0 * dp[1] + p1 * dp[4] + p2 * dp[7]) * bt[1];
                cur[2] = (p0 * dp[2] + p1 * dp[5] + p2 * dp[8]) * bt[2];
                const double sum = cur[0] + cur[1] + cur[2];
                c[t] = std::max(sum, kTiny);
                const double inv = 1.0 / c[t];
                cur[0] *= inv;
                cur[1] *= inv;
                cur[2] *= inv;
            } else {
                for (std::size_t j = 0; j < k; ++j) {
                    double sum = 0;
                    for (std::size_t i = 0; i < k; ++i) sum += prev[i] * dp[i * k + j];
                    cur[j] = sum * bt[j];
                }
                double sum = 0;
                for (std::size_t j = 0; j < k; ++j) sum += cur[j];
                c[t] = std::max(sum, kTiny);
                const double inv = 1.0 / c[t];
                for (std::size_t j = 0; j < k; ++j) cur[j] *= inv;
            }
        }

        // Backward pass.  Cache B*beta for the next bar once per t instead of
        // re-reading and re-multiplying it inside the state loop.
        for (std::size_t j = 0; j < k; ++j) bp[(n - 1) * k + j] = 1.0;
        for (std::size_t t = n - 1; t-- > 0;) {
            const double *bn = bp + (t + 1) * k;
            const double *bBn = Bp + (t + 1) * k;
            for (std::size_t j = 0; j < k; ++j) bB[j] = bBn[j] * bn[j];
            const double inv_c = 1.0 / std::max(c[t + 1], kTiny);
            double *cur = bp + t * k;
            if constexpr (FixedK == 3) {
                cur[0] = (dp[0] * bB[0] + dp[1] * bB[1] + dp[2] * bB[2]) * inv_c;
                cur[1] = (dp[3] * bB[0] + dp[4] * bB[1] + dp[5] * bB[2]) * inv_c;
                cur[2] = (dp[6] * bB[0] + dp[7] * bB[1] + dp[8] * bB[2]) * inv_c;
            } else {
                for (std::size_t i = 0; i < k; ++i) {
                    const double *arow = dp + i * k;
                    double sum = 0;
                    for (std::size_t j = 0; j < k; ++j) sum += arow[j] * bB[j];
                    cur[i] = sum * inv_c;
                }
            }
        }

        // Smoothed posterior, row-normalised in one pass.
        for (std::size_t t = 0; t < n; ++t) {
            const double *at = ap + t * k;
            const double *bt = bp + t * k;
            double *gt = gp + t * k;
            double sum = 0;
            for (std::size_t j = 0; j < k; ++j) {
                const double v = at[j] * bt[j];
                gt[j] = v;
                sum += v;
            }
            const double inv = 1.0 / std::max(sum, kTiny);
            for (std::size_t j = 0; j < k; ++j) gt[j] *= inv;
        }

        // Accumulate xi without an O(n*k*k) tensor: one k*k scratch matrix
        // per transition, then fold it into the k*k accumulator.
        std::fill(xi.begin(), xi.end(), 0.0);
        for (std::size_t t = 0; t + 1 < n; ++t) {
            const double *at = ap + t * k;
            const double *bBn = Bp + (t + 1) * k;
            const double *bn = bp + (t + 1) * k;
            for (std::size_t j = 0; j < k; ++j) bB[j] = bBn[j] * bn[j];
            if constexpr (FixedK == 3) {
                const double a0 = at[0], a1 = at[1], a2 = at[2];
                const double v00 = a0 * dp[0] * bB[0], v01 = a0 * dp[1] * bB[1], v02 = a0 * dp[2] * bB[2];
                const double v10 = a1 * dp[3] * bB[0], v11 = a1 * dp[4] * bB[1], v12 = a1 * dp[5] * bB[2];
                const double v20 = a2 * dp[6] * bB[0], v21 = a2 * dp[7] * bB[1], v22 = a2 * dp[8] * bB[2];
                const double total = v00 + v01 + v02 + v10 + v11 + v12 + v20 + v21 + v22;
                const double inv = 1.0 / std::max(total, kTiny);
                xip[0] += v00 * inv; xip[1] += v01 * inv; xip[2] += v02 * inv;
                xip[3] += v10 * inv; xip[4] += v11 * inv; xip[5] += v12 * inv;
                xip[6] += v20 * inv; xip[7] += v21 * inv; xip[8] += v22 * inv;
            } else {
                double total = 0;
                for (std::size_t i = 0; i < k; ++i) {
                    const double ai = at[i];
                    const double *arow = dp + i * k;
                    double *srow = scp + i * k;
                    for (std::size_t j = 0; j < k; ++j) {
                        const double v = ai * arow[j] * bB[j];
                        srow[j] = v;
                        total += v;
                    }
                }
                const double inv = 1.0 / std::max(total, kTiny);
                for (std::size_t i = 0; i < k * k; ++i) xip[i] += scp[i] * inv;
            }
        }

        // Initial-state distribution from the first posterior row. The old pi
        // is no longer needed after the forward pass, so update it in place
        // instead of keeping a second k-vector in sync.
        {
            double weight_sum = 0;
            for (std::size_t j = 0; j < k; ++j) weight_sum += gp[j];
            const double inv = 1.0 / std::max(weight_sum, kTiny);
            for (std::size_t j = 0; j < k; ++j) pi[j] = gp[j] * inv;
        }

        // Transition matrix: floor then row-normalise with reciprocal.
        for (std::size_t i = 0; i < k; ++i) {
            double row_sum = 0;
            for (std::size_t j = 0; j < k; ++j) row_sum += xip[i * k + j];
            row_sum = std::max(row_sum, kTiny);
            double norm = 0;
            for (std::size_t j = 0; j < k; ++j) {
                const double v = std::max(1e-4, xip[i * k + j] / row_sum);
                dp[i * k + j] = v;
                norm += v;
            }
            const double inv = norm > 0 ? 1.0 / norm : 1.0;
            for (std::size_t j = 0; j < k; ++j) dp[i * k + j] *= inv;
        }

        // State weights/means in one t-major pass (cache friendly for small
        // k), then the variance around the new mean in a second pass.  This
        // keeps the stable two-pass variance while avoiding 2*k separate
        // strides through gamma.
        std::fill(weight.begin(), weight.end(), 1e-6);
        std::fill(weighted_sum.begin(), weighted_sum.end(), 0.0);
        for (std::size_t t = 0; t < n; ++t) {
            const double xt = xp[t];
            const double *gt = gp + t * k;
            for (std::size_t j = 0; j < k; ++j) {
                const double g = gt[j];
                weight[j] += g;
                weighted_sum[j] += g * xt;
            }
        }
        for (std::size_t j = 0; j < k; ++j) {
            mu[j] = weighted_sum[j] / weight[j];
            var[j] = 0.0;
        }
        for (std::size_t t = 0; t < n; ++t) {
            const double xt = xp[t];
            const double *gt = gp + t * k;
            for (std::size_t j = 0; j < k; ++j) {
                const double d = xt - mu[j];
                var[j] += gt[j] * d * d;
            }
        }
        for (std::size_t j = 0; j < k; ++j) {
            var[j] = std::max(kVarFloor, var[j] / weight[j]);
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
    }

    HmmResult result;
    result.mu = std::move(mu);
    result.var = std::move(var);
    result.pi = std::move(pi);
    result.A = std::move(A);
    result.gamma = std::move(gamma);
    result.loglik = last;
    result.iterations = used;
    result.converged = converged;
    require_finite_result(result);
    return result;
}

HmmResult fit_hmm(const double *x, std::size_t n,
                  std::vector<double> mu, std::vector<double> var,
                  std::vector<double> pi, std::vector<double> A,
                  int iters) {
    // k=3 is the production configuration.  Instantiating the generic loop
    // with a compile-time K lets the compiler unroll the state loops and turn
    // t*k into a shift while keeping a runtime fallback for other k.
    if (mu.size() == 3) {
        return fit_hmm_impl<3>(x, n, std::move(mu), std::move(var),
                               std::move(pi), std::move(A), iters);
    }
    return fit_hmm_impl<0>(x, n, std::move(mu), std::move(var),
                           std::move(pi), std::move(A), iters);
}

}  // namespace stockdesk::native
