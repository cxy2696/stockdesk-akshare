import Foundation

// MARK: - Position advice

enum AdviceEngine {
    static func compute(summary: PortfolioSummary, state: MarketState, drawdown: Double = 0, volatility: Double = 0) -> PositionAdvice {
        var a = PositionAdvice()
        a.score = state.score
        a.regime = state.label
        var low: Int, high: Int
        switch state.score {
        case 70...: (low, high) = (70, 85)
        case 58..<70: (low, high) = (60, 75)
        case 45..<58: (low, high) = (45, 60)
        case 32..<45: (low, high) = (30, 45)
        default: (low, high) = (15, 30)
        }
        if drawdown <= -15 { low -= 10; high -= 10 }
        if volatility >= 30 { low -= 5; high -= 5 }
        low = max(10, min(90, low)); high = max(low + 10, min(95, high))
        let cur = summary.total > 0 ? summary.marketValue / summary.total * 100 : 0
        let mid = Double(low + high) / 2
        a.currentPct = cur
        a.targetLow = low; a.targetHigh = high
        a.gap = cur - mid
        a.singleCap = state.score >= 70 ? 25 : (state.score >= 45 ? 20 : 15)
        a.cashFloor = 100 - high
        if a.gap > 8 { a.action = "减仓"; a.urgency = a.gap > 20 ? "高" : "中" }
        else if a.gap < -8 { a.action = "加仓"; a.urgency = a.gap < -20 ? "高" : "中" }
        a.reasons = [
            "市场温度 \(state.score)（\(state.label)），对应建议总仓位 \(low)%–\(high)%。",
            "当前仓位 \(String(format: "%.1f", cur))%（持仓市值 \(summary.marketValue.fmt(0)) 元，可用现金 \(summary.cash.fmt(0)) 元）。",
        ]
        if drawdown < 0 { a.reasons.append("当前回撤 \(String(format: "%.2f", drawdown))%。") }
        if let top = summary.positions.max(by: { ($0.weight ?? 0) < ($1.weight ?? 0) }) {
            a.reasons.append("第一大持仓 \(top.name) 占 \(String(format: "%.1f", top.weight ?? 0))%，单票上限建议 \(a.singleCap)%。")
            if (top.weight ?? 0) > Double(a.singleCap) {
                a.warnings.append("\(top.name) 权重超过单票上限 \(a.singleCap)%，建议分批降至上限以内。")
            }
        }
        if summary.positions.count < 3 && !summary.positions.isEmpty {
            a.warnings.append("持仓少于 3 只，个股风险集中，建议适度分散。")
        }
        if summary.total > 0 && summary.cash / summary.total * 100 < 8 {
            a.warnings.append("现金低于 8%，遇到回撤缺少补仓与机动空间。")
        }
        for p in summary.positions where (p.floatPct ?? 0) <= -15 {
            a.warnings.append("\(p.name) 浮亏 \(String(format: "%.1f", p.floatPct ?? 0))%，检查是否跌破支撑并执行止损纪律。")
        }
        if a.action == "减仓" {
            a.actions = [
                "将总仓位从 \(Int(cur))% 降至 \(low)%–\(high)%，优先减持权重超 \(a.singleCap)% 或跌破支撑的标的。",
                "减仓资金先留作现金，等待市场温度回到 55 以上。",
            ]
        } else if a.action == "加仓" {
            a.actions = [
                "分 2–3 批将总仓位从 \(Int(cur))% 提升至 \(low)%–\(high)%，单次不超过 10% 仓位。",
                "优先选择均线多头、放量突破或九转买入信号，且不追涨停。",
            ]
        } else {
            a.actions = ["维持总仓位 \(low)%–\(high)%，单票不超过 \(a.singleCap)%，现金保留 \(100 - high)% 左右。"]
        }
        a.actions.append("对跌破最近支撑的持仓设置止损；盈利超过 15% 的标的可上移止盈线。")
        return a
    }
}

// MARK: - Fibonacci

struct FibLevel: Identifiable {
    var ratio: Double
    var name: String
    var price: Double
    var kind: String
    var distance: Double
    var action: String
    var id: Double { ratio }
}

enum FibEngine {
    static let ratios: [(Double, String, String)] = [
        (0.0, "前高", "突破买入 / 冲高减仓"),
        (0.236, "0.236", "持有 / 跌破减仓"),
        (0.382, "0.382", "低吸关注"),
        (0.5, "0.5", "观望"),
        (0.618, "0.618", "分批低吸"),
        (0.786, "0.786", "跌破止损"),
        (1.0, "前低", "止损离场"),
    ]

    static func compute(_ rows: [KLine]) -> [FibLevel] {
        let r = Array(rows.suffix(120))
        guard let hi = r.map(\.high).max(), let lo = r.map(\.low).min(), hi > lo, let current = r.last?.close else { return [] }
        return ratios.map { ratio, name, action in
            let price = hi - (hi - lo) * ratio
            return FibLevel(ratio: ratio, name: name, price: price,
                            kind: price <= current ? "支撑" : "压力",
                            distance: (price / current - 1) * 100, action: action)
        }
    }
}

// MARK: - Patterns

enum PatternEngine {
    static let all: [PatternDef] = [
        PatternDef(id: "ma_bull", name: "均线多头排列", desc: "收盘价站上 MA5，且 MA5 > MA10 > MA20 > MA60，MA20 向上。", tag: "趋势"),
        PatternDef(id: "macd_golden", name: "MACD 金叉", desc: "DIF 最近 2 个交易日内上穿 DEA。", tag: "动能"),
        PatternDef(id: "volume_break", name: "放量突破", desc: "收盘突破近 20 日最高价，成交量放大至 5 日均量 1.5 倍。", tag: "突破"),
        PatternDef(id: "pullback_ma20", name: "缩量回踩 20 日线", desc: "回踩 20 日线 ±2%，缩量且 MA20 向上。", tag: "回踩"),
        PatternDef(id: "double_bottom", name: "双底 / W 底", desc: "60 日内两个低点接近并突破颈线。", tag: "形态"),
        PatternDef(id: "platform_break", name: "平台突破", desc: "20 日振幅收窄至 8% 内，放量突破平台高点。", tag: "突破"),
        PatternDef(id: "td_buy_9", name: "九转买入（9）", desc: "TD 买入结构连续 9 根。", tag: "九转"),
        PatternDef(id: "td_sell_9", name: "九转卖出（9）", desc: "TD 卖出结构连续 9 根。", tag: "九转"),
        PatternDef(id: "bottom_dull", name: "底部钝化", desc: "60 日低位，RSI 连续低位数日后拐头，或 MACD 绿柱缩短。", tag: "反转"),
        PatternDef(id: "rsi_rebound", name: "RSI 超卖反弹", desc: "RSI14 近 5 日跌破 30 后重新站上 30。", tag: "反转"),
        PatternDef(id: "boll_rebound", name: "布林下轨反弹", desc: "价格触及布林下轨后重新回到下轨上方。", tag: "反转"),
    ]

    static func sma(_ v: [Double], _ n: Int) -> [Double?] {
        guard v.count >= n else { return Array(repeating: nil, count: v.count) }
        var out = [Double?](repeating: nil, count: v.count)
        var sum = 0.0
        for i in 0..<v.count {
            sum += v[i]
            if i >= n { sum -= v[i - n] }
            if i >= n - 1 { out[i] = sum / Double(n) }
        }
        return out
    }

    static func ema(_ v: [Double], _ n: Int) -> [Double] {
        guard !v.isEmpty else { return [] }
        let k = 2.0 / (Double(n) + 1)
        var out = [v[0]]
        for i in 1..<v.count { out.append(v[i] * k + out[i - 1] * (1 - k)) }
        return out
    }

    static func rsi(_ v: [Double], _ n: Int = 14) -> [Double] {
        guard v.count > n else { return Array(repeating: 50, count: v.count) }
        var out = [Double](repeating: 50, count: v.count)
        var g = 0.0, l = 0.0
        for i in 1..<v.count {
            let ch = v[i] - v[i - 1]
            g = (g * Double(n - 1) + max(ch, 0)) / Double(n)
            l = (l * Double(n - 1) + max(-ch, 0)) / Double(n)
            out[i] = l == 0 ? 100 : 100 - 100 / (1 + g / l)
        }
        return out
    }

    static func td(_ closes: [Double]) -> (buy: [Int], sell: [Int]) {
        var buy = [Int](repeating: 0, count: closes.count)
        var sell = [Int](repeating: 0, count: closes.count)
        var bc = 0, sc = 0
        for i in 4..<closes.count {
            if closes[i] < closes[i - 4] { bc += 1; sc = 0 }
            else if closes[i] > closes[i - 4] { sc += 1; bc = 0 }
            else { bc = 0; sc = 0 }
            buy[i] = min(bc, 9); sell[i] = min(sc, 9)
            if bc >= 9 { bc = 0 }
            if sc >= 9 { sc = 0 }
        }
        return (buy, sell)
    }

    static func detect(_ rows: [KLine], _ id: String) -> (Bool, String, Int) {
        guard rows.count >= 70 else { return (false, "", 0) }
        let close = rows.map(\.close), high = rows.map(\.high), low = rows.map(\.low), vol = rows.map(\.volume)
        let last = close.last ?? 0
        let m5 = sma(close, 5), m10 = sma(close, 10), m20 = sma(close, 20), m60 = sma(close, 60)
        func val(_ a: [Double?], _ i: Int) -> Double {
            guard let outer = a[safe: i] else { return 0 }
            return outer ?? 0
        }

        switch id {
        case "ma_bull":
            let ok = last > val(m5, close.count - 1) && val(m5, close.count - 1) > val(m10, close.count - 1) &&
                val(m10, close.count - 1) > val(m20, close.count - 1) && val(m20, close.count - 1) > val(m60, close.count - 1) &&
                val(m20, close.count - 1) > val(m20, close.count - 6)
            return (ok, String(format: "MA5 %.2f > MA10 %.2f > MA20 %.2f > MA60 %.2f",
                               val(m5, close.count - 1), val(m10, close.count - 1), val(m20, close.count - 1), val(m60, close.count - 1)), 78)
        case "macd_golden":
            let dif = zip(ema(close, 12), ema(close, 26)).map { $0 - $1 }
            let dea = ema(dif, 9)
            let n = dif.count
            let ok = dif[n - 2] <= dea[n - 2] && dif[n - 1] > dea[n - 1]
            return (ok, String(format: "DIF %.2f / DEA %.2f", dif[n - 1], dea[n - 1]), 70)
        case "volume_break":
            let hh = high.suffix(21).dropLast().max() ?? 0
            let vma = vol.suffix(6).dropLast().reduce(0, +) / 5
            let ok = last > hh && (vol.last ?? 0) > 1.5 * vma
            return (ok, String(format: "突破 20 日高点 %.2f，量比 %.1f", hh, vma > 0 ? (vol.last ?? 0) / vma : 0), 76)
        case "pullback_ma20":
            let m = val(m20, close.count - 1)
            let ok = m > 0 && abs(last / m - 1) < 0.02 && m > val(m20, close.count - 6) &&
                (vol.last ?? 0) < 0.8 * (vol.suffix(5).reduce(0, +) / 5) && last > val(m60, close.count - 1)
            return (ok, String(format: "现价距 MA20 %+.1f%%，缩量回踩", (last / max(m, 0.01) - 1) * 100), 68)
        case "double_bottom":
            let win = Array(rows.suffix(60))
            let lows = win.map(\.low)
            var idx: [Int] = []
            for i in 2..<(lows.count - 2) where lows[i] <= lows[i - 1] && lows[i] <= lows[i + 1] && lows[i] <= lows[i - 2] && lows[i] <= lows[i + 2] {
                idx.append(i)
            }
            for a in idx {
                for b in idx where b - a >= 10 && abs(lows[a] / lows[b] - 1) < 0.03 {
                    let neck = win[a...b].map(\.high).max() ?? 0
                    if last > neck { return (true, String(format: "双底 %.2f / %.2f，颈线 %.2f 已突破", lows[a], lows[b], neck), 82) }
                }
            }
            return (false, "", 0)
        case "platform_break":
            let win = Array(rows.suffix(21))
            let rng = ((win.map(\.high).max() ?? 0) / max(win.map(\.low).min() ?? 1, 0.01) - 1) * 100
            let hh = win.dropLast().map(\.high).max() ?? 0
            let vma = vol.suffix(6).dropLast().reduce(0, +) / 5
            let ok = rng < 8 && last > hh && (vol.last ?? 0) > 1.3 * vma
            return (ok, String(format: "20 日振幅 %.1f%%，平台高点 %.2f", rng, hh), 72)
        case "td_buy_9", "td_sell_9":
            let t = td(close)
            let buy = t.buy.suffix(3).max() ?? 0
            let sell = t.sell.suffix(3).max() ?? 0
            if id == "td_buy_9" { return (buy == 9, "TD 买入结构 \(buy)", 74) }
            return (sell == 9, "TD 卖出结构 \(sell)", 74)
        case "bottom_dull":
            let r = rsi(close)
            let low60 = low.suffix(60).min() ?? 0
            let rsiLow = r.suffix(5).filter { $0 < 35 }.count >= 3
            let rsiTurn = r.last! > r[r.count - 2]
            let dif = zip(ema(close, 12), ema(close, 26)).map { $0 - $1 }
            let dea = ema(dif, 9)
            let hist = zip(dif, dea).map { ($0 - $1) * 2 }
            let histTurn = hist.last! > hist[hist.count - 2] && hist.last! < 0
            let ok = last <= low60 * 1.04 && rsiLow && (rsiTurn || histTurn)
            return (ok, String(format: "60 日低位，RSI %.1f 钝化%@", r.last!, rsiTurn ? "回升" : "，绿柱缩短"), 72)
        case "rsi_rebound":
            let r = rsi(close)
            let n = r.count
            let ok = r[(n - 6)..<(n - 1)].contains { $0 < 30 } && r[n - 1] > 30
            return (ok, String(format: "RSI14 %.1f，超卖后回升", r[n - 1]), 66)
        case "boll_rebound":
            let mid = sma(close, 20)
            let sd: [Double] = (0..<close.count).map { i in
                guard let m = mid[i] else { return 0 }
                let slice = close[max(0, i - 19)...i]
                let v = slice.reduce(0) { $0 + pow($1 - m, 2) } / Double(slice.count)
                return sqrt(v)
            }
            let lower = (0..<close.count).map { (mid[$0] ?? close[$0]) - 2 * sd[$0] }
            let n = close.count
            let touched = (0..<5).contains { low[n - 1 - $0] < lower[n - 1 - $0] }
            let ok = touched && last > lower[n - 1]
            return (ok, String(format: "布林下轨 %.2f 附近止跌", lower[n - 1]), 64)
        default:
            return (false, "", 0)
        }
    }

    static func scan(candidates: [Quote], pattern: String, limit: Int = 120) async -> [PatternHit] {
        let picks = Array(candidates.prefix(limit))
        var hits: [PatternHit] = []
        await withTaskGroup(of: PatternHit?.self) { group in
            for q in picks {
                group.addTask {
                    guard let rows = try? await MarketService.shared.klines(q.code, period: "daily", limit: 160, adjust: "qfq") else { return nil }
                    let (ok, reason, score) = detect(rows, pattern)
                    guard ok else { return nil }
                    return PatternHit(code: q.code, name: q.name, price: q.price, pct: q.pct,
                                      industry: q.industry, score: score,
                                      signals: [PatternEngine.all.first { $0.id == pattern }?.name ?? pattern],
                                      reason: reason)
                }
            }
            for await h in group { if let h { hits.append(h) } }
        }
        return hits.sorted { $0.score > $1.score }
    }

    static func picks(candidates: [Quote], limit: Int = 120, top: Int = 12) async -> [PatternHit] {
        let picks = Array(candidates.prefix(limit))
        var hits: [PatternHit] = []
        await withTaskGroup(of: PatternHit?.self) { group in
            for q in picks {
                if (q.name.contains("ST")) { continue }
                if (q.pct ?? 0) >= 9.5 { continue }
                group.addTask {
                    guard let rows = try? await MarketService.shared.klines(q.code, period: "daily", limit: 160, adjust: "qfq"), rows.count > 70 else { return nil }
                    var sigs: [String] = [], reasons: [String] = [], best = 0
                    for p in PatternEngine.all where p.id != "td_sell_9" {
                        let (ok, reason, score) = detect(rows, p.id)
                        if ok { sigs.append(p.name); reasons.append(reason); best = max(best, score) }
                    }
                    guard !sigs.isEmpty else { return nil }
                    let close = rows.map(\.close)
                    let pct5 = close.count > 5 ? (close.last! / close[close.count - 6] - 1) * 100 : nil
                    if let p5 = pct5, p5 > 45 { return nil }
                    var score = Double(best + 4 * (sigs.count - 1))
                    if let p5 = pct5 { score += max(-3, min(4, p5 / 8)); if p5 > 25 { score -= (p5 - 25) * 0.35 } }
                    return PatternHit(code: q.code, name: q.name, price: q.price, pct: q.pct,
                                      industry: q.industry, score: Int(max(0, min(99, score))),
                                      signals: sigs, reason: reasons.joined(separator: "；"))
                }
            }
            for await h in group { if let h { hits.append(h) } }
        }
        return Array(hits.sorted { $0.score > $1.score }.prefix(top))
    }
}
