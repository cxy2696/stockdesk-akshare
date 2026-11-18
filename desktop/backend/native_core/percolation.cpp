#include "core.hpp"

#include <algorithm>
#include <climits>
#include <cstdint>
#include <functional>
#include <limits>
#include <stdexcept>
#include <vector>

namespace stockdesk::native {
namespace {

// 32-bit node ids: the lattice is validated to fit INT_MAX cells, so this
// halves the union-find footprint versus size_t and keeps the parent/size
// arrays in cache for full-market batches.
constexpr std::uint32_t kNoIndex = std::numeric_limits<std::uint32_t>::max();

class DisjointSet {
public:
    explicit DisjointSet(std::size_t n) : parent_(n), size_(n, 1) { reset(); }

    std::uint32_t find(std::uint32_t x) {
        while (parent_[x] != x) {
            parent_[x] = parent_[parent_[x]];
            x = parent_[x];
        }
        return x;
    }

    void reset() {
        for (std::size_t i = 0; i < parent_.size(); ++i) {
            parent_[i] = static_cast<std::uint32_t>(i);
        }
        std::fill(size_.begin(), size_.end(), std::uint32_t{1});
    }

    void unite(std::uint32_t a, std::uint32_t b) {
        a = find(a);
        b = find(b);
        if (a == b) return;
        if (size_[a] < size_[b]) std::swap(a, b);
        parent_[b] = a;
        size_[a] += size_[b];
    }

    std::uint32_t size_of(std::uint32_t root) const { return size_[root]; }

private:
    std::vector<std::uint32_t> parent_;
    std::vector<std::uint32_t> size_;
};

constexpr std::uint8_t kTop = 1U << 0;
constexpr std::uint8_t kBottom = 1U << 1;
constexpr std::uint8_t kLeft = 1U << 2;
constexpr std::uint8_t kRight = 1U << 3;
constexpr std::uint8_t kAllBorders = kTop | kBottom | kLeft | kRight;

struct Workspace {
    explicit Workspace(std::size_t n)
        : sets(n), borders(n, 0), first(n, kNoIndex) {}

    DisjointSet sets;
    std::vector<std::uint8_t> borders;
    std::vector<std::uint32_t> first;
    std::vector<std::uint32_t> roots;

    void reset() {
        sets.reset();
        std::fill(borders.begin(), borders.end(), std::uint8_t{0});
        std::fill(first.begin(), first.end(), kNoIndex);
        roots.clear();
    }
};

struct BestComponent {
    std::uint32_t root = 0;
    std::size_t size = 0;
    std::uint32_t first = 0;
    bool found = false;
    bool spanning = false;
};

void validate_grid(const std::uint8_t *grid, std::size_t n, std::size_t cols) {
    if (grid == nullptr) throw std::invalid_argument("grid pointer is null");
    if (cols == 0) throw std::invalid_argument("cols must be > 0");
    if (n > static_cast<std::size_t>(INT_MAX)) {
        throw std::invalid_argument("grid is too large for 32-bit indices");
    }
}

// One union pass plus one aggregation pass. This is the shared, exact lattice
// interpretation used by both the detailed result and the Monte-Carlo batch.
// `roots` is populated with each component root exactly once, so later scans
// touch components rather than all n cells.
void build_components(const std::uint8_t *grid, std::size_t n, std::size_t cols,
                      Workspace &w) {
    const std::size_t rows = 1 + (n - 1) / cols;

    for (std::size_t r = 0; r < rows; ++r) {
        const std::size_t row = r * cols;
        const std::size_t max_c = std::min(cols, n - row);
        for (std::size_t c = 0; c < max_c; ++c) {
            const std::size_t i = row + c;
            if (!grid[i]) continue;
            const std::uint32_t idx = static_cast<std::uint32_t>(i);
            if (c + 1 < max_c && grid[i + 1]) w.sets.unite(idx, idx + 1);
            if (r + 1 < rows && i + cols < n && grid[i + cols]) {
                w.sets.unite(idx, idx + static_cast<std::uint32_t>(cols));
            }
        }
    }

    for (std::size_t r = 0; r < rows; ++r) {
        const std::size_t row = r * cols;
        const std::size_t max_c = std::min(cols, n - row);
        for (std::size_t c = 0; c < max_c; ++c) {
            const std::size_t i = row + c;
            if (!grid[i]) continue;
            const std::uint32_t idx = static_cast<std::uint32_t>(i);
            const std::uint32_t root = w.sets.find(idx);
            if (w.first[root] == kNoIndex) {
                w.first[root] = idx;
                w.roots.push_back(root);
            }
            if (r == 0) w.borders[root] |= kTop;
            if (r + 1 == rows) w.borders[root] |= kBottom;
            if (c == 0) w.borders[root] |= kLeft;
            // Only the real lattice edge counts: the end of a partial last
            // row is not the right border of the rectangle.
            if (c + 1 == cols) w.borders[root] |= kRight;
        }
    }
}

BestComponent find_best(const Workspace &w) {
    BestComponent best;
    // Only component roots are in `roots`; ties still resolve to the
    // component whose first occupied cell appears earliest in scan order.
    for (const std::uint32_t root : w.roots) {
        const std::size_t size = w.sets.size_of(root);
        if (!best.found || size > best.size ||
            (size == best.size && w.first[root] < best.first)) {
            best.root = root;
            best.size = size;
            best.first = w.first[root];
            best.found = true;
        }
    }
    best.spanning = best.found && w.borders[best.root] == kAllBorders;
    return best;
}

}  // namespace

GridResult analyze_grid(const std::uint8_t *grid, std::size_t n, std::size_t cols) {
    GridResult result;
    if (n == 0) {
        if (cols == 0) throw std::invalid_argument("cols must be > 0");
        return result;
    }
    validate_grid(grid, n, cols);

    Workspace w(n);
    build_components(grid, n, cols, w);
    const BestComponent best = find_best(w);

    if (best.found) {
        result.spanning = best.spanning;
        result.largest.reserve(best.size);
        for (std::size_t i = 0; i < n; ++i) {
            if (grid[i] && w.sets.find(static_cast<std::uint32_t>(i)) == best.root) {
                result.largest.push_back(static_cast<int>(i));
            }
        }
    }

    result.sizes.reserve(w.roots.size());
    for (const std::uint32_t root : w.roots) {
        result.sizes.push_back(static_cast<int>(w.sets.size_of(root)));
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
    Workspace w(n);
    for (std::size_t i = 0; i < n_grids; ++i) {
        w.reset();
        const std::uint8_t *grid = grids + i * n;
        build_components(grid, n, cols, w);
        const BestComponent best = find_best(w);
        result.largest_size.push_back(static_cast<int>(best.size));
        result.spanning.push_back(best.spanning ? 1U : 0U);
    }
    return result;
}

}  // namespace stockdesk::native
