import Foundation

struct MarketForecast {
    var state: String
    var expected5d: Double?
    var probUp: Double?
    var confidence: Double?
    var nextProbs: [(String, Double)]
    var caveat: String
}

struct StockDecision: Identifiable {
    var code: String
    var name: String
    var price: Double
    var rating: String
    var action: String
    var tier: String
    var buyLow: Double
    var buyHigh: Double
    var stop: Double
    var target: Double
    var riskReward: Double
    var score: Double
    var reasons: [String]
    var risks: [String]
    var id: String { code }
}

enum DecisionEngine {
    static func normalCDF(_ x: Double) -> Double {
        guard x.isFinite else { return 0.5 }
        return 0.5 * (1 + erf(x / sqrt(2)))
    }

    static func forecast(_ hmm: HMMSnapshot?) -> MarketForecast? {
        guard let hmm, !hmm.probabilities.isEmpty else { return nil }
        let labels = QuantModels.labels
        let current = Array(repeating: 0.0, count: labels.count)
        var p = current
        for item in hmm.probabilities {
            if let i = labels.firstIndex(of: item.label) {
                p[i] = max(0, item.p)
            }
        }
        let sum = p.reduce(0, +)
        if sum > 0 { p = p.map { $0 / sum } }
        var A = hmm.transition
        if A.count != labels.count {
            A = Array(repeating: Array(repeating: 1.0 / Double(labels.count), count: labels.count), count: labels.count)
        }
        var p5 = p
        for _ in 0..<4 {
            var next = Array(repeating: 0.0, count: labels.count)
            for i in 0..<labels.count {
                for j in 0..<labels.count {
                    next[j] += p5[i] * (A[i][j].isFinite ? A[i][j] : 0)
                }
            }
            let s = next.reduce(0, +)
            p5 = s > 0 ? next.map { $0 / s } : next
        }
        var expected = 0.0
        var variance = 0.0
        var mass = 0.0
        var byLabel: [(String, Double)] = []
        for (i, label) in labels.enumerated() {
            guard let item = hmm.probabilities.first(where: { $0.label == label }) else { continue }
            let mean5 = item.mean * 5 / 100
            let vol5 = item.vol * sqrt(5) / 100
            expected += p5[i] * mean5
            variance += p5[i] * (vol5 * vol5 + mean5 * mean5)
            mass += p5[i]
            byLabel.append((label, p5[i]))
        }
        if mass > 0 {
            expected /= mass
            variance = max(0, variance / mass - expected * expected)
        }
        let prob = variance > 0 ? normalCDF(expected / sqrt(variance)) : nil
        return MarketForecast(
            state: hmm.state,
            expected5d: mass > 0 ? expected : nil,
            probUp: prob,
            confidence: hmm.probabilities.map(\.p).max(),
            nextProbs: byLabel.sorted { $0.1 > $1.1 },
            caveat: "状态条件估算，不是点位预测；样本不足时只作弱参考。"
        )
    }

    static func decision(code: String, name: String, price: Double, rows: [KLine],
                         marketLabel: String) -> StockDecision? {
        let closes = rows.map(\.close).filter { $0 > 0 }
        guard closes.count >= 30, price > 0 else { return nil }
        let ma20 = closes.suffix(20).reduce(0, +) / Double(min(20, closes.count))
        let ma60 = closes.count >= 60 ? closes.suffix(60).reduce(0, +) / 60 : nil
        let pct20 = closes.count > 21 ? (price / closes[closes.count - 21] - 1) * 100 : 0
        let pct5 = closes.count > 6 ? (price / closes[closes.count - 6] - 1) * 100 : 0
        let highs = rows.map(\.high)
        let lows = rows.map(\.low)
        let support = lows.suffix(20).min() ?? price * 0.94
        let resistance = highs.suffix(20).max() ?? price * 1.06
        var trs: [Double] = []
        for i in max(1, closes.count - 14)..<closes.count {
            trs.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))
        }
        let atr = (trs.isEmpty ? price * 0.025 : trs.reduce(0, +) / Double(trs.count)) / price
        var gains = 0.0, losses = 0.0
        for i in max(1, closes.count - 14)..<closes.count {
            let ch = closes[i] - closes[i - 1]
            gains += max(ch, 0); losses += max(-ch, 0)
        }
        let rsi = losses == 0 ? 100.0 : 100 - 100 / (1 + gains / losses)
        var score = 50.0
        if price > ma20 { score += 9 }
        if let ma60, ma20 > ma60 { score += 9 }
        if let ma60, price < ma60 { score -= 8 }
        score += min(10, max(-10, pct20 / 3))
        if rsi >= 35 && rsi <= 62 { score += 5 }
        if rsi >= 78 { score -= 10 }
        score = min(100, max(0, score))
        let trendUp = ma60 != nil && price > ma20 && ma20 > ma60!
        let trendDown = ma60 != nil && price < ma20 && ma20 < ma60!
        let low = min(price * 0.995, max(support, price * (1 - min(0.06, max(0.02, atr * 0.8)))))
        let high = min(price * 1.02, max(price, low * 1.015))
        let stop = min(price * 0.985, max(price * 0.90, min(support * 0.985, price * (1 - min(0.10, max(0.03, atr * 2.2))))))
        let target = max(price * 1.03, min(price * 1.20, max(resistance, price * (1 + min(0.20, max(0.06, atr * 4))))))
        let rr = (target - price) / max(0.0001, price - stop)
        let extended = pct20 > 30
        let good = score >= 66 && !trendDown && rr >= 1.5 && !extended
        let bad = score < 44 || trendDown || rr < 0.9
        let rating = good ? "好" : (bad ? "差" : "中")
        let weak = marketLabel == "弱势" || marketLabel == "偏弱"
        var action = "观察"
        if good { action = weak ? "等待企稳" : (pct5 > 5 ? "回调买入" : "买入") }
        else if rating == "差" { action = trendDown ? "回避" : "减仓/回避" }
        let tier = good ? (weak || extended ? "确认" : "执行") : (score >= 55 ? "预警" : "观察")
        var reasons = [
            String(format: "价格 %.2f，MA20 %.2f", price, ma20),
            String(format: "20日 %+.1f%%，RSI %.0f，趋势%@", pct20, rsi, trendUp ? "向上" : (trendDown ? "向下" : "震荡")),
            String(format: "形态评分 %.0f", score),
        ]
        if let ma60 { reasons.append(String(format: "MA60 %.2f", ma60)) }
        var risks: [String] = []
        if rsi >= 75 { risks.append("RSI 偏高，追高风险") }
        if price < ma20 { risks.append("价格在 MA20 下方") }
        if trendDown { risks.append("均线空头排列") }
        if extended { risks.append("20 日涨幅偏大") }
        if rr < 1.5 { risks.append(String(format: "盈亏比仅 %.1f，不足 1.5", rr)) }
        if risks.isEmpty { risks.append("暂无硬性风险，仍需按止损执行") }
        return StockDecision(code: code, name: name, price: price, rating: rating, action: action,
                             tier: tier, buyLow: low, buyHigh: high, stop: stop, target: target,
                             riskReward: rr, score: score, reasons: reasons, risks: risks)
    }
}
