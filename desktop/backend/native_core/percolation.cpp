#include "core.hpp"

#include <algorithm>
#include <climits>
#include <functional>
#include <limits>
#include <numeric>
#include <stdexcept>
#include <vector>

namespace stockdesk::native {
namespace {

// Disjoint-set forest with path halving and union by size. One pass unions
// occupied right/down neighbours; a second pass aggregates component sizes and
// the four border flags touched by each component.
class DisjointSet {
public:
    explicit DisjointSet(std::size_t n) : parent_(n), size_(n, 1) {
        std::iota(parent_.begin(), parent_.end(), std::size_t{0});
    }

    std::size_t find(std::size_t x) {
        while (parent_[x] != x) {
            parent_[x] = parent_[parent_[x]];
            x = parent_[x];
        }
        return x;
    }

    void reset() {
        std::iota(parent_.begin(), parent_.end(), std::size_t{0});
        std::fill(size_.begin(), size_.end(), std::size_t{1});
    }

    void unite(std::size_t a, std::size_t b) {
        a = find(a);
        b = find(b);
        if (a == b) return;
        if (size_[a] < size_[b]) std::swap(a, b);
        parent_[b] = a;
        size_[a] += size_[b];
    }

private:
    std::vector<std::size_t> parent_;
    std::vector<std::size_t> size_;
};

constexpr std::uint8_t kTop = 1U << 0;
constexpr std::uint8_t kBottom = 1U << 1;
constexpr std::uint8_t kLeft = 1U << 2;
constexpr std::uint8_t kRight = 1U << 3;
constexpr std::uint8_t kAllBorders = kTop | kBottom | kLeft | kRight;

}  // namespace

namespace {

void validate_grid(const std::uint8_t *grid, std::size_t n, std::size_t cols) {
    if (grid == nullptr) throw std::invalid_argument("grid pointer is null");
    if (cols == 0) throw std::invalid_argument("cols must be > 0");
    if (n > static_cast<std::size_t>(INT_MAX)) {
        throw std::invalid_argument("grid is too large for 32-bit indices");
    }
}

// One union pass plus one aggregation pass. This is the shared, exact lattice
// interpretation used by both the detailed result and the Monte-Carlo batch.
void build_components(const std::uint8_t *grid, std::size_t n, std::size_t cols,
                      DisjointSet &sets, std::vector<std::size_t> &sizes,
                      std::vector<std::uint8_t> &borders) {
    const std::size_t rows = 1 + (n - 1) / cols;
    std::fill(sizes.begin(), sizes.end(), std::size_t{0});
    std::fill(borders.begin(), borders.end(), std::uint8_t{0});

    for (std::size_t r = 0; r < rows; ++r) {
        const std::size_t row = r * cols;
        const std::size_t max_c = std::min(cols, n - row);
        for (std::size_t c = 0; c < max_c; ++c) {
            const std::size_t i = row + c;
            if (!grid[i]) continue;
            if (c + 1 < max_c && grid[i + 1]) sets.unite(i, i + 1);
            if (r + 1 < rows && i + cols < n && grid[i + cols]) sets.unite(i, i + cols);
        }
    }

    for (std::size_t r = 0; r < rows; ++r) {
        const std::size_t row = r * cols;
        const std::size_t max_c = std::min(cols, n - row);
        for (std::size_t c = 0; c < max_c; ++c) {
            const std::size_t i = row + c;
            if (!grid[i]) continue;
            const std::size_t root = sets.find(i);
            ++sizes[root];
            if (r == 0) borders[root] |= kTop;
            if (r + 1 == rows) borders[root] |= kBottom;
            if (c == 0) borders[root] |= kLeft;
            // Only the real lattice edge counts: the end of a partial last
            // row is not the right border of the rectangle.
            if (c + 1 == cols) borders[root] |= kRight;
        }
    }
}

struct BestComponent {
    std::size_t root = 0;
    std::size_t size = 0;
    bool found = false;
    bool spanning = false;
};

BestComponent find_best(const std::uint8_t *grid, std::size_t n,
                        DisjointSet &sets, const std::vector<std::size_t> &sizes,
                        const std::vector<std::uint8_t> &borders) {
    BestComponent best;
    for (std::size_t i = 0; i < n; ++i) {
        if (!grid[i]) continue;
        const std::size_t root = sets.find(i);
        if (!best.found || sizes[root] > best.size) {
            best.root = root;
            best.size = sizes[root];
            best.found = true;
        }
    }
    best.spanning = best.found && borders[best.root] == kAllBorders;
    return best;
}

}  // namespace

GridResult analyze_grid(const std::uint8_t *grid, std::size_t n, std::size_t cols) {
    GridResult result;
    if (n == 0) return result;
    validate_grid(grid, n, cols);

    DisjointSet sets(n);
    std::vector<std::size_t> sizes(n, 0);
    std::vector<std::uint8_t> borders(n, 0);
    build_components(grid, n, cols, sets, sizes, borders);
    const BestComponent best = find_best(grid, n, sets, sizes, borders);

    if (best.found) {
        result.spanning = best.spanning;
        result.largest.reserve(best.size);
        for (std::size_t i = 0; i < n; ++i) {
            if (grid[i] && sets.find(i) == best.root) result.largest.push_back(static_cast<int>(i));
        }
    }

    // A component root is the only index whose aggregate size is non-zero.
    for (std::size_t i = 0; i < n; ++i) {
        if (sizes[i] > 0) result.sizes.push_back(static_cast<int>(sizes[i]));
    }
    std::sort(result.sizes.begin(), result.sizes.end(), std::greater<int>());
    return result;
}


GridBatchResult analyze_grid_batch(const std::uint8_t *grids, std::size_t n_grids,
                                   std::size_t n, std::size_t cols) {
    if (n_grids == 0) return {};
    if (grids == nullptr) throw std::invalid_argument("grid batch pointer is null");
    if (cols == 0 || n == 0) throw std::invalid_argument("grid batch dimensions must be > 0");
    if (n > static_cast<std::size_t>(INT_MAX)) {
        throw std::invalid_argument("grid is too large for 32-bit indices");
    }
    if (n_grids > std::numeric_limits<std::size_t>::max() / n) {
        throw std::invalid_argument("grid batch is too large");
    }
    GridBatchResult result;
    result.largest_size.reserve(n_grids);
    result.spanning.reserve(n_grids);
    std::vector<std::size_t> sizes(n, 0);
    std::vector<std::uint8_t> borders(n, 0);
    DisjointSet sets(n);
    for (std::size_t i = 0; i < n_grids; ++i) {
        sets.reset();
        const std::uint8_t *grid = grids + i * n;
        build_components(grid, n, cols, sets, sizes, borders);
        const BestComponent best = find_best(grid, n, sets, sizes, borders);
        result.largest_size.push_back(static_cast<int>(best.size));
        result.spanning.push_back(best.spanning ? 1U : 0U);
    }
    return result;
}


}  // namespace stockdesk::native
