// Standalone micro-benchmark for the pure C++ core.
//
//   cmake -S backend/native_core -B build/native-cpp -DCMAKE_BUILD_TYPE=Release
//   cmake --build build/native-cpp -j
//   ./build/native-cpp/native_bench
//
// Times are wall-clock medians over a small number of repetitions; they are
// meant for relative comparisons on the same machine, not absolute promises.
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <limits>
#include <random>
#include <string>
#include <vector>

#include "core.hpp"

namespace {

using Clock = std::chrono::steady_clock;

template <typename Fn>
double bench_ms(Fn &&fn, int repeat) {
    fn();
    std::vector<double> samples;
    samples.reserve(static_cast<std::size_t>(repeat));
    for (int i = 0; i < repeat; ++i) {
        const auto start = Clock::now();
        fn();
        const auto end = Clock::now();
        samples.push_back(std::chrono::duration<double, std::milli>(end - start).count());
    }
    std::sort(samples.begin(), samples.end());
    return samples[samples.size() / 2];
}

void report(const std::string &label, double ms) {
    std::printf("%-30s %8.3f ms\n", label.c_str(), ms);
}

}  // namespace

int main() {
    std::mt19937 rng(7);
    std::bernoulli_distribution occupied(0.5);
    std::normal_distribution<double> normal(0.0, 1.0);

    const std::size_t cols = 75;
    const std::size_t cells = cols * cols;
    std::vector<std::uint8_t> grid(cells);
    for (auto &cell : grid) cell = occupied(rng) ? 1 : 0;

    std::vector<std::uint8_t> batch(15 * cells);
    for (auto &cell : batch) cell = occupied(rng) ? 1 : 0;

    const std::size_t n = 420;
    std::vector<double> x(n);
    for (auto &v : x) v = normal(rng);
    const std::vector<double> mu = {-1.0, 0.0, 1.0};
    const std::vector<double> var = {1.0, 1.0, 1.0};
    const std::vector<double> pi = {1.0 / 3, 1.0 / 3, 1.0 / 3};
    const std::vector<double> a = {0.8, 0.1, 0.1,
                                   0.1, 0.8, 0.1,
                                   0.1, 0.1, 0.8};

    const std::size_t market = 5500;
    std::vector<double> pct(market), price(market), limits(market, 10.0);
    for (std::size_t i = 0; i < market; ++i) {
        pct[i] = normal(rng) * 2.0;
        price[i] = 10.0 + static_cast<double>(i % 100) * 0.01;
    }
    std::vector<long long> codes(market), expected(market);
    for (std::size_t i = 0; i < market; ++i) {
        codes[i] = static_cast<long long>(i);
        expected[i] = static_cast<long long>(i);
    }

    std::size_t sink = 0;
    report("grid_largest 75x75", bench_ms([&] {
        sink += stockdesk::native::analyze_grid(grid.data(), cells, cols).largest.size();
    }, 500));
    report("grid_batch 15x75x75", bench_ms([&] {
        sink += stockdesk::native::analyze_grid_batch(batch.data(), 15, cells, cols)
                    .largest_size.size();
    }, 100));
    report("HMM 420 bars / 80 iters", bench_ms([&] {
        sink += stockdesk::native::fit_hmm(x.data(), n, mu, var, pi, a, 80).gamma.size();
    }, 100));
    report("breadth_census 5500", bench_ms([&] {
        sink += stockdesk::native::breadth_census(
                    pct.data(), price.data(), limits.data(), market).total;
    }, 500));
    report("coverage_audit 5500", bench_ms([&] {
        sink += stockdesk::native::coverage_audit(
                    codes.data(), market, expected.data(), market, 20).present;
    }, 50));
    std::printf("sink %zu\n", sink);
    return 0;
}
