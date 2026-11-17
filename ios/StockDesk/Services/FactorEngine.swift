import Foundation

// MARK: - Factor definitions

struct FactorDefinition: Identifiable, Hashable {
    var key: String
    var name: String
    var category: String
    var desc: String
    var higherBetter: Bool
    var id: String { key }
}

struct FactorCoverage: Identifiable, Hashable {
    var key: String
    var name: String
    var category: String
    var available: Int
    var total: Int
    var id: String { key }
    var pct: Double { total > 0 ? Double(available) / Double(total) * 100 : 0 }
}

struct FactorRow: Identifiable, Hashable {
    var code: String
    var name: String
    var market: String
    var price: Double
    var pct: Double?
    var pe: Double?
    var pb: Double?
    var mcap: Double?
    var inflow: Double?
    var amount: Double?
    var industry: String?
    var score: Double
    var coverage: Int
    var factorScores: [String: Double]
    var id: String { code }
}

struct FactorResult {
    var rows: [FactorRow]
    var coverage: [FactorCoverage]
    var eligible: Int
    var total: Int
}

enum FactorEngine {
    static let definitions: [FactorDefinition] = [
        FactorDefinition(key: "mom1", name: "当日动量", category: "动量", desc: "当日涨跌幅在全体候选中的分位。", higherBetter: true),
        FactorDefinition(key: "mom60", name: "60 日动量", category: "动量", desc: "近 60 个交易日涨跌幅分位。", higherBetter: true),
        FactorDefinition(key: "momYtd", name: "年初至今", category: "动量", desc: "年初至今涨跌幅分位。", higherBetter: true),
        FactorDefinition(key: "pe", name: "市盈率", category: "价值", desc: "PE 越低分位越高；仅统计 PE > 0 的公司。", higherBetter: false),
        FactorDefinition(key: "pb", name: "市净率", category: "价值", desc: "PB 越低分位越高；仅统计 PB > 0 的公司。", higherBetter: false),
        FactorDefinition(key: "mcap", name: "总市值", category: "规模", desc: "总市值越小分位越高，捕捉小盘弹性。", higherBetter: false),
        FactorDefinition(key: "amount", name: "成交额", category: "流动性", desc: "当日成交额越大分位越高。", higherBetter: true),
        FactorDefinition(key: "turnover", name: "换手率", category: "流动性", desc: "当日换手率分位；过高也意味着拥挤。", higherBetter: true),
        FactorDefinition(key: "flow", name: "主力净流入", category: "资金", desc: "主力净流入 / 成交额，反映大单方向。", higherBetter: true),
        FactorDefinition(key: "stability", name: "低振幅", category: "稳定性", desc: "当日振幅越低分位越高，波动更可控。", higherBetter: false),
    ]

    static let categoryWeights: [(String, Double)] = [
        ("动量", 0.30), ("价值", 0.20), ("流动性", 0.18),
        ("资金", 0.15), ("稳定性", 0.10), ("规模", 0.07),
    ]

    static func run(_ quotes: [Quote], boards: Set<String> = [], minScore: Double = 0) -> FactorResult {
        var eligible: [Quote] = []
        for q in quotes {
            guard let px = q.price, px > 0, let amount = q.amount, amount >= 10_000_000 else { continue }
            let name = q.name.uppercased()
            if name.contains("ST") || q.name.contains("退") || q.name.hasPrefix("N") || q.name.hasPrefix("C") {
                continue
            }
            if !boards.isEmpty, let m = q.market, !boards.contains(m) { continue }
            eligible.append(q)
        }

        var raw: [String: [String: Double]] = [:]
        for q in eligible {
            var values: [String: Double] = [:]
            if let v = q.pct, v.isFinite { values["mom1"] = v }
            if let v = q.pct60, v.isFinite { values["mom60"] = v }
            if let v = q.pctYtd, v.isFinite { values["momYtd"] = v }
            if let v = q.pe, v.isFinite, v > 0 { values["pe"] = v }
            if let v = q.pb, v.isFinite, v > 0 { values["pb"] = v }
            if let v = q.mcap, v.isFinite, v > 0 { values["mcap"] = v }
            if let v = q.amount, v.isFinite, v > 0 { values["amount"] = v }
            if let v = q.turnover, v.isFinite { values["turnover"] = v }
            if let a = q.amount, a > 0, let f = q.mainInflow, f.isFinite {
                values["flow"] = f / a * 100
            }
            if let v = q.amplitude, v.isFinite { values["stability"] = v }
            raw[q.code] = values
        }

        var percentiles: [String: [String: Double]] = [:]
        var coverage: [FactorCoverage] = []
        for def in definitions {
            let pairs: [(String, Double)] = eligible.compactMap { q in
                guard let v = raw[q.code]?[def.key] else { return nil }
                return (q.code, v)
            }
            coverage.append(FactorCoverage(key: def.key, name: def.name, category: def.category,
                                           available: pairs.count, total: eligible.count))
            guard pairs.count > 1 else { continue }
            let sorted = pairs.sorted { $0.1 < $1.1 }
            var ranks: [String: Double] = [:]
            for (index, pair) in sorted.enumerated() {
                let pct = sorted.count > 1 ? Double(index) / Double(sorted.count - 1) * 100 : 50
                ranks[pair.0] = def.higherBetter ? pct : 100 - pct
            }
            percentiles[def.key] = ranks
        }

        var out: [FactorRow] = []
        for q in eligible {
            var factorScores: [String: Double] = [:]
            for def in definitions {
                if let v = percentiles[def.key]?[q.code] { factorScores[def.key] = v }
            }
            // Category score, then a transparent weighted composite over the
            // categories that actually have data for this stock.
            var categoryScores: [(String, Double)] = []
            for (category, _) in categoryWeights {
                let defs = definitions.filter { $0.category == category }
                let vals = defs.compactMap { factorScores[$0.key] }
                if !vals.isEmpty { categoryScores.append((category, vals.reduce(0, +) / Double(vals.count))) }
            }
            var weighted = 0.0, weight = 0.0
            for (category, score) in categoryScores {
                if let w = categoryWeights.first(where: { $0.0 == category })?.1 {
                    weighted += score * w
                    weight += w
                }
            }
            let score = weight > 0 ? weighted / weight : 0
            guard score >= minScore else { continue }
            out.append(FactorRow(
                code: q.code, name: q.name, market: q.market ?? MarketService.marketOf(q.code),
                price: q.price ?? 0, pct: q.pct, pe: q.pe, pb: q.pb, mcap: q.mcap,
                inflow: q.mainInflow, amount: q.amount, industry: q.industry,
                score: score, coverage: factorScores.count, factorScores: factorScores
            ))
        }
        out.sort { ($0.score, $0.code) > ($1.score, $1.code) }
        return FactorResult(rows: Array(out.prefix(200)), coverage: coverage,
                            eligible: eligible.count, total: quotes.count)
    }
}
