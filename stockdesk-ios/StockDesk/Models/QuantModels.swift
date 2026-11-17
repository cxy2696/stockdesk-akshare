import Foundation

struct HMMProbability {
    var label: String
    var p: Double
    var mean: Double
    var vol: Double
}

struct HMMSnapshot {
    var state: String
    var stateIndex: Int
    var probabilities: [HMMProbability]
    var transition: [[Double]]
    var expectedDays: Double
    var history: [Int]
    var signal: String
    var interpretation: [String]
}

struct IndustryPercolation: Identifiable {
    var name: String
    var count: Int
    var ratio: Double
    var giant: Double
    var status: String
    var leader: String
    var leaderPct: Double?
    var id: String { name }
}

struct PercolationSnapshot {
    var total: Int
    var up: Int
    var ratio: Double
    var threshold: Double
    var largest: Int
    var giantOccupied: Double
    var clusters: Int
    var status: String
    var cells: [Int]
    var cols: Int
    var robustnessMean: Double
    var robustnessMin: Double
    var robustnessMax: Double
    var industries: [IndustryPercolation]
    var note: String
}

struct CompositeComponent: Identifiable {
    var key: String
    var label: String
    var score: Int
    var weight: Double
    var quality: Int
    var detail: String
    var available: Bool
    var id: String { key }
}

/// Local composite of the three on-device models. Same weights as the backend
/// model registry: HMM 42%, percolation 38%, TD 20%.
struct CompositeScore {
    var score: Int
    var stance: String
    var position: String
    var agreement: Int
    var quality: Int
    var components: [CompositeComponent]
    var drivers: [String]
    var missing: [String]
}

enum QuantModels {
    static let labels = ["弱势", "震荡", "强势"]
    static let percThreshold = 0.592746

    // MARK: - Safe display helpers

    static func num(_ value: Double?, _ digits: Int = 2) -> String {
        guard let value, value.isFinite else { return "--" }
        return value.fmt(digits)
    }

    static func pctText(_ value: Double?, _ digits: Int = 2) -> String {
        guard let value, value.isFinite else { return "--" }
        return value.pct(digits)
    }

    static func percent(_ value: Double?, _ digits: Int = 1) -> String {
        guard let value, value.isFinite else { return "--" }
        return value.fmt(digits) + "%"
    }

    static func money(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "--" }
        return shortMoney(value)
    }

    static func safe(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return value
    }

    // MARK: - Composite score

    static func composite(
        hmm: HMMSnapshot?,
        percolation: PercolationSnapshot?,
        tdBuys: Int,
        tdSells: Int,
        tdTotal: Int,
        tdCompletion: Double? = nil,
        hmmLabel: String = "HMM"
    ) -> CompositeScore? {
        guard hmm != nil || percolation != nil || tdTotal > 0 else { return nil }

        var components: [CompositeComponent] = []
        var drivers: [String] = []
        var missing: [String] = []
        var weighted = 0.0
        var qualityWeighted = 0.0
        var qualitySum = 0.0

        // HMM 42%: state direction tilted by posterior confidence.
        var hmmScore = 50
        var hmmQuality = 0
        if let h = hmm {
            let stateIndex = min(max(h.stateIndex, 0), 2)
            let base = [22.0, 50.0, 80.0][stateIndex]
            let rawConfidence = h.probabilities.map(\.p).max() ?? 0.5
            let confidence = min(max(rawConfidence.isFinite ? rawConfidence : 0.5, 0), 1)
            let direction: Double = base > 55 ? 1 : (base < 45 ? -1 : 0)
            hmmScore = clampScore(base + direction * (confidence - 0.5) * 40)
            hmmQuality = clampScore(20 + (confidence - 1.0 / 3.0) / (2.0 / 3.0) * 80)
            let confidenceText = percent(confidence * 100, 1)
            components.append(CompositeComponent(
                key: "hmm",
                label: hmmLabel,
                score: hmmScore,
                weight: 0.42,
                quality: hmmQuality,
                detail: "\(h.state) · 后验 \(confidenceText) · 预计 \(num(h.expectedDays, 1)) 天",
                available: true
            ))
            weighted += Double(hmmScore) * 0.42
            qualitySum += Double(hmmQuality) * 0.42
            qualityWeighted += 0.42
            drivers.append("HMM \(h.state)，后验 \(confidenceText)")
        } else {
            missing.append("HMM")
            components.append(CompositeComponent(key: "hmm", label: hmmLabel, score: 50, weight: 0.42, quality: 0, detail: "数据缺失 · 按中性 50 计入", available: false))
            weighted += 50 * 0.42
        }

        // Percolation 38%: breadth ratio plus how far the giant cluster is
        // above/below the 0.5927 threshold.
        var percScore = 50
        var percQuality = 0
        if let p = percolation {
            let ratio = p.ratio.isFinite ? p.ratio : 0.5
            let giant = p.giantOccupied.isFinite ? p.giantOccupied : p.threshold
            let ratioScore = 50 + (ratio - 0.5) * 100
            let giantScore = 50 + (giant - p.threshold) * 150
            percScore = clampScore(ratioScore * 0.4 + giantScore * 0.6)
            let robustness = p.robustnessMean.isFinite ? p.robustnessMean : 0.5
            let sample = min(1, max(0, Double(p.total) / 1000))
            percQuality = clampScore(robustness * 100 * 0.7 + sample * 100 * 0.3)
            let ratioText = percent(ratio * 100, 1)
            let giantText = percent(giant * 100, 1)
            components.append(CompositeComponent(
                key: "percolation",
                label: "渗流",
                score: percScore,
                weight: 0.38,
                quality: percQuality,
                detail: "\(p.status) · 上涨 \(ratioText) · 最大簇 \(giantText)",
                available: true
            ))
            weighted += Double(percScore) * 0.38
            qualitySum += Double(percQuality) * 0.38
            qualityWeighted += 0.38
            drivers.append("渗流 \(p.status)，上涨 \(ratioText)，最大簇 \(giantText)")
        } else {
            missing.append("渗流")
            components.append(CompositeComponent(key: "percolation", label: "渗流", score: 50, weight: 0.38, quality: 0, detail: "数据缺失 · 按中性 50 计入", available: false))
            weighted += 50 * 0.38
        }

        // TD 20%: net buy/sell structures across the tracked indices.
        var tdScore = 50
        var tdQuality = 0
        if tdTotal > 0 {
            let buys = max(0, tdBuys)
            let sells = max(0, tdSells)
            let net = Double(buys - sells) / Double(max(tdTotal, 1))
            tdScore = clampScore(50 + net * 50)
            let rawCompletion = tdCompletion ?? (Double(max(buys, sells)) / Double(max(tdTotal, 1)))
            let completion = min(max(rawCompletion.isFinite ? rawCompletion : 0, 0), 1)
            tdQuality = clampScore(20 + completion * 80)
            components.append(CompositeComponent(
                key: "td",
                label: "九转",
                score: tdScore,
                weight: 0.20,
                quality: tdQuality,
                detail: "买 \(buys) / 卖 \(sells) · \(tdTotal) 个指数",
                available: true
            ))
            weighted += Double(tdScore) * 0.20
            qualitySum += Double(tdQuality) * 0.20
            qualityWeighted += 0.20
            drivers.append("九转 买 \(buys) / 卖 \(sells)")
        } else {
            missing.append("九转")
            components.append(CompositeComponent(key: "td", label: "九转", score: 50, weight: 0.20, quality: 0, detail: "数据缺失 · 按中性 50 计入", available: false))
            weighted += 50 * 0.20
        }

        let score = clampScore(weighted)
        let direction = score >= 56 ? 1 : (score <= 44 ? -1 : 0)
        let agreement = [hmmScore, percScore, tdScore].filter { value in
            if direction == 0 { return abs(value - 50) <= 7 }
            let sign = value >= 56 ? 1 : (value <= 44 ? -1 : 0)
            return sign == direction
        }.count
        let stance = stanceFor(score)
        let quality = qualityWeighted > 0 ? clampScore(qualitySum / qualityWeighted) : 0

        return CompositeScore(
            score: score,
            stance: stance,
            position: positionFor(stance),
            agreement: agreement,
            quality: quality,
            components: components,
            drivers: drivers,
            missing: missing
        )
    }

    private static func clampScore(_ value: Double) -> Int {
        guard value.isFinite else { return 50 }
        return Int(min(100, max(0, value.rounded())))
    }

    private static func stanceFor(_ score: Int) -> String {
        if score >= 75 { return "进攻" }
        if score >= 60 { return "均衡偏多" }
        if score >= 45 { return "中性" }
        if score >= 32 { return "均衡偏防守" }
        return "防守"
    }

    private static func positionFor(_ stance: String) -> String {
        switch stance {
        case "进攻": return "60%–80%"
        case "均衡偏多": return "45%–65%"
        case "中性": return "30%–50%"
        case "均衡偏防守": return "15%–30%"
        default: return "0%–15%"
        }
    }

    static func hmm(_ x: [Double], k: Int = 3, iters: Int = 40) -> HMMSnapshot? {
        let n = x.count
        guard n > 60 else { return nil }
        let sorted = x.sorted()
        var mu = [sorted[n / 5], sorted[n / 2], sorted[n * 4 / 5]]
        let overall = max(variance(x), 1e-8)
        var varia = [Double](repeating: overall, count: k)
        let pi = [Double](repeating: 1.0 / Double(k), count: k)
        var A = [[Double]](repeating: [Double](repeating: 0.12 / Double(k - 1), count: k), count: k)
        for i in 0..<k { A[i][i] = 0.88 }

        func emissions() -> [[Double]] {
            (0..<n).map { t in
                (0..<k).map { j in exp(-0.5 * (log(2 * Double.pi * varia[j]) + pow(x[t] - mu[j], 2) / varia[j])) + 1e-300 }
            }
        }

        for _ in 0..<iters {
            let B = emissions()
            var alpha = [[Double]](repeating: [Double](repeating: 0, count: k), count: n)
            var beta = alpha
            alpha[0] = (0..<k).map { pi[$0] * B[0][$0] }
            normalize(&alpha[0])
            for t in 1..<n {
                for j in 0..<k {
                    var s = 0.0
                    for i in 0..<k { s += alpha[t - 1][i] * A[i][j] }
                    alpha[t][j] = s * B[t][j]
                }
                normalize(&alpha[t])
            }
            beta[n - 1] = [Double](repeating: 1, count: k)
            if n > 1 {
                for t in stride(from: n - 2, through: 0, by: -1) {
                    for i in 0..<k {
                        var s = 0.0
                        for j in 0..<k { s += A[i][j] * B[t + 1][j] * beta[t + 1][j] }
                        beta[t][i] = s
                    }
                    normalize(&beta[t])
                }
            }
            var gamma = [[Double]](repeating: [Double](repeating: 0, count: k), count: n)
            for t in 0..<n {
                for j in 0..<k { gamma[t][j] = alpha[t][j] * beta[t][j] }
                normalize(&gamma[t])
            }
            var xi = [[Double]](repeating: [Double](repeating: 0, count: k), count: k)
            var totalXi = 0.0
            for t in 0..<(n - 1) {
                var m = [[Double]](repeating: [Double](repeating: 0, count: k), count: k)
                var sum = 0.0
                for i in 0..<k {
                    for j in 0..<k {
                        let v = alpha[t][i] * A[i][j] * B[t + 1][j] * beta[t + 1][j]
                        m[i][j] = v; sum += v
                    }
                }
                if sum > 0 { for i in 0..<k { for j in 0..<k { xi[i][j] += m[i][j] / sum } } }
                totalXi += sum
            }
            _ = totalXi
            for i in 0..<k {
                let row = xi[i].reduce(0, +)
                for j in 0..<k { A[i][j] = max(row > 0 ? xi[i][j] / row : A[i][j], 1e-4) }
                normalize(&A[i])
            }
            for j in 0..<k {
                let w = max(gamma.reduce(0) { $0 + $1[j] }, 1e-6)
                mu[j] = gamma.enumerated().reduce(0) { $0 + $1.element[j] * x[$1.offset] } / w
                varia[j] = max(gamma.enumerated().reduce(0) { $0 + $1.element[j] * pow(x[$1.offset] - mu[j], 2) } / w, 1e-8)
            }
        }
        // final posterior
        let B = emissions()
        var alpha = [[Double]](repeating: [Double](repeating: 0, count: k), count: n)
        var beta = alpha
        alpha[0] = (0..<k).map { pi[$0] * B[0][$0] }; normalize(&alpha[0])
        for t in 1..<n {
            for j in 0..<k {
                var s = 0.0
                for i in 0..<k { s += alpha[t - 1][i] * A[i][j] }
                alpha[t][j] = s * B[t][j]
            }
            normalize(&alpha[t])
        }
        beta[n - 1] = [Double](repeating: 1, count: k)
        for t in stride(from: n - 2, through: 0, by: -1) {
            for i in 0..<k {
                var s = 0.0
                for j in 0..<k { s += A[i][j] * B[t + 1][j] * beta[t + 1][j] }
                beta[t][i] = s
            }
            normalize(&beta[t])
        }
        var gamma = [[Double]](repeating: [Double](repeating: 0, count: k), count: n)
        for t in 0..<n {
            for j in 0..<k { gamma[t][j] = alpha[t][j] * beta[t][j] }
            normalize(&gamma[t])
        }
        let order = mu.indices.sorted { mu[$0] < mu[$1] }
        let sortedMu = order.map { mu[$0] }
        let sortedVar = order.map { varia[$0] }
        let sortedGamma = gamma.map { row in order.map { row[$0] } }
        var sortedA = [[Double]](repeating: [Double](repeating: 0, count: k), count: k)
        for i in 0..<k { for j in 0..<k { sortedA[i][j] = A[order[i]][order[j]] } }
        let last = sortedGamma[n - 1]
        let current = last.indices.max { last[$0] < last[$1] } ?? 1
        let probs = (0..<k).map { HMMProbability(label: labels[$0], p: round(last[$0] * 10000) / 10000, mean: round(sortedMu[$0] * 10000) / 10000, vol: round(sqrt(sortedVar[$0]) * 10000) / 10000) }
        let trans = (0..<k).map { i in (0..<k).map { j in round(sortedA[i][j] * 10000) / 10000 } }
        let duration = 1 / max(1 - sortedA[current][current], 1e-4)
        let history = sortedGamma.suffix(60).map { row in row.indices.max { row[$0] < row[$1] } ?? 1 }
        let signal = current == 2 ? "趋势延续概率较高，可维持现有仓位并关注成交额" : current == 0 ? "状态偏弱，优先控制回撤，等待概率转向震荡/强势" : "震荡状态，降低交易频率，区间操作"
        let interpretation = [
            "当前处于\(labels[current])状态，后验概率 \((last[current] * 100).fmt(1))%；该状态历史日均收益 \(sortedMu[current].fmt(3))%、日均波动 \(sqrt(sortedVar[current]).fmt(2))%。",
            "状态自持概率 \((sortedA[current][current] * 100).fmt(1))%，预计持续约 \(duration.fmt(1)) 个交易日；状态切换通常滞后于价格。",
            "下一交易日最可能仍是\(labels[maxIndex(sortedA[current])])（\((sortedA[current].max()! * 100).fmt(1))%），但低概率切换需要风控预案。",
            "HMM 使用收益与波动的联合分布，不直接预测点位；应结合仓位、支撑压力与成交额使用。",
        ]
        return HMMSnapshot(state: labels[current], stateIndex: current, probabilities: probs, transition: trans, expectedDays: round(duration * 10) / 10, history: Array(history), signal: signal, interpretation: interpretation)
    }

    static func percolation(_ rows: [Quote]) -> PercolationSnapshot? {
        let valid = rows.filter { ($0.price ?? 0) > 0 && ($0.amount ?? 0) > 0 && !$0.name.contains("退") && !$0.name.uppercased().contains("ST") }
        let n = valid.count
        guard n > 100 else { return nil }
        let cols = Int(ceil(sqrt(Double(n))))
        var grid = [Int](repeating: 0, count: cols * cols)
        for (i, q) in valid.enumerated() { grid[i] = (q.pct ?? 0) > 0 ? 1 : 0 }
        var seen = [Bool](repeating: false, count: grid.count)
        var largest: [Int] = []
        var clusters: [Int] = []
        for i in 0..<grid.count where grid[i] == 1 && !seen[i] {
            var q = [i]; var head = 0; seen[i] = true; var comp: [Int] = []
            while head < q.count {
                let v = q[head]; head += 1; comp.append(v)
                let r = v / cols, c = v % cols
                for (nr, nc) in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)] where nr >= 0 && nr < cols && nc >= 0 && nc < cols {
                    let w = nr * cols + nc
                    if grid[w] == 1 && !seen[w] { seen[w] = true; q.append(w) }
                }
            }
            clusters.append(comp.count)
            if comp.count > largest.count { largest = comp }
        }
        let up = grid.filter { $0 == 1 }.count
        let ratio = Double(up) / Double(n)
        let giantOcc = Double(largest.count) / Double(max(up, 1))
        let status = giantOcc >= percThreshold ? "超临界 · 扩散" : (giantOcc >= percThreshold - 0.08 ? "临界附近" : "亚临界 · 分裂")
        let largeSet = Set(largest)
        var cells = [Int](repeating: 0, count: grid.count)
        for i in 0..<n { cells[i] = largeSet.contains(i) ? 2 : (grid[i] == 1 ? 1 : 0) }
        var robust: [Double] = []
        for offset in [7, 17, 29] {
            var g = [Int](repeating: 0, count: grid.count)
            for i in 0..<n { g[i] = grid[(i + offset) % n] }
            let comps = components(g, cols: cols)
            robust.append(Double(comps.max() ?? 0) / Double(max(up, 1)))
        }
        let grouped = Dictionary(grouping: valid) { $0.industry?.isEmpty == false ? $0.industry! : "其他" }
        var industries: [IndustryPercolation] = []
        for (name, group) in grouped where group.count >= 8 && name != "其他" {
            let gc = Int(ceil(sqrt(Double(group.count))))
            var g = [Int](repeating: 0, count: gc * gc)
            var upCount = 0
            for (i, q) in group.enumerated() where (q.pct ?? 0) > 0 { g[i] = 1; upCount += 1 }
            let comps = components(g, cols: gc)
            let giant = Double(comps.max() ?? 0) / Double(max(upCount, 1))
            let st = giant >= percThreshold ? "超临界 · 扩散" : (giant >= percThreshold - 0.08 ? "临界附近" : "亚临界 · 分裂")
            let leader = group.max { ($0.pct ?? -999) < ($1.pct ?? -999) }
            industries.append(IndustryPercolation(name: name, count: group.count, ratio: Double(upCount) / Double(group.count), giant: giant, status: st, leader: leader?.name ?? "--", leaderPct: leader?.pct))
        }
        industries.sort { $0.count > $1.count }
        return PercolationSnapshot(total: n, up: up, ratio: ratio, threshold: percThreshold, largest: largest.count, giantOccupied: giantOcc, clusters: clusters.count, status: status, cells: cells, cols: cols, robustnessMean: robust.reduce(0, +) / 3, robustnessMin: robust.min() ?? 0, robustnessMax: robust.max() ?? 0, industries: Array(industries.prefix(20)), note: "将股票按代码顺序映射为二维格点，上涨=占据；统计最大 4 邻接连通簇。仅衡量广度扩散，不代表真实空间关系。")
    }

    private static func components(_ grid: [Int], cols: Int) -> [Int] {
        var seen = [Bool](repeating: false, count: grid.count)
        var sizes: [Int] = []
        for i in 0..<grid.count where grid[i] == 1 && !seen[i] {
            var q = [i]; var head = 0; seen[i] = true; var count = 0
            while head < q.count {
                let v = q[head]; head += 1; count += 1
                let r = v / cols, c = v % cols
                for (nr, nc) in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)] where nr >= 0 && nr < cols && nc >= 0 && nc < cols {
                    let w = nr * cols + nc
                    if grid[w] == 1 && !seen[w] { seen[w] = true; q.append(w) }
                }
            }
            sizes.append(count)
        }
        return sizes
    }

    private static func maxIndex(_ arr: [Double]) -> Int { arr.indices.max { arr[$0] < arr[$1] } ?? 0 }

    private static func normalize(_ arr: inout [Double]) {
        let s = arr.reduce(0, +)
        if s > 0 { for i in arr.indices { arr[i] /= s } }
    }
    private static func variance(_ x: [Double]) -> Double {
        let m = x.reduce(0, +) / Double(max(x.count, 1))
        return x.reduce(0) { $0 + pow($1 - m, 2) } / Double(max(x.count, 1))
    }
}
