import Foundation

enum Strategies {
    static let all: [Strategy] = [
        Strategy(id: "ma_cross", name: "双均线交叉", desc: "短期均线上穿长期均线买入，下穿卖出。趋势跟随的经典入门策略。", params: [
            StrategyParam(key: "fast", label: "短周期", value: 5, min: 2, max: 120, step: 1),
            StrategyParam(key: "slow", label: "长周期", value: 20, min: 3, max: 250, step: 1),
        ]),
        Strategy(id: "momentum", name: "动量突破", desc: "收盘价突破过去 N 日最高价买入，跌破 M 日最低价卖出。", params: [
            StrategyParam(key: "entry_n", label: "突破周期", value: 20, min: 3, max: 250, step: 1),
            StrategyParam(key: "exit_n", label: "离场周期", value: 10, min: 2, max: 120, step: 1),
        ]),
        Strategy(id: "rsi_reversion", name: "RSI 超卖反转", desc: "RSI 低于超卖阈值买入，高于超买阈值卖出。", params: [
            StrategyParam(key: "n", label: "RSI 周期", value: 14, min: 3, max: 60, step: 1),
            StrategyParam(key: "buy_level", label: "超卖阈值", value: 30, min: 5, max: 45, step: 1),
            StrategyParam(key: "sell_level", label: "超买阈值", value: 65, min: 55, max: 95, step: 1),
        ]),
        Strategy(id: "macd", name: "MACD 金叉", desc: "DIF 上穿 DEA（可选零轴上方）买入，下穿卖出。", params: [
            StrategyParam(key: "fast", label: "快线", value: 12, min: 3, max: 60, step: 1),
            StrategyParam(key: "slow", label: "慢线", value: 26, min: 5, max: 120, step: 1),
            StrategyParam(key: "signal", label: "信号线", value: 9, min: 2, max: 60, step: 1),
            StrategyParam(key: "above_zero", label: "仅零轴上方", value: 1, min: 0, max: 1, step: 1),
        ]),
        Strategy(id: "boll", name: "布林带回归", desc: "价格跌破下轨买入，回到中轨或触及上轨卖出。", params: [
            StrategyParam(key: "n", label: "周期", value: 20, min: 5, max: 120, step: 1),
            StrategyParam(key: "k", label: "带宽倍数", value: 2, min: 0.5, max: 4, step: 0.1),
        ]),
        Strategy(id: "turtle", name: "唐奇安通道", desc: "突破 N 日最高价买入，跌破 M 日最低价卖出。", params: [
            StrategyParam(key: "entry_n", label: "入场周期", value: 20, min: 5, max: 120, step: 1),
            StrategyParam(key: "exit_n", label: "离场周期", value: 10, min: 3, max: 60, step: 1),
        ]),
        Strategy(id: "ma_rsi", name: "均线 + RSI 过滤", desc: "均线金叉且 RSI 未超买时买入，死叉或 RSI 超买时卖出。", params: [
            StrategyParam(key: "fast", label: "短周期", value: 10, min: 2, max: 60, step: 1),
            StrategyParam(key: "slow", label: "长周期", value: 30, min: 5, max: 120, step: 1),
            StrategyParam(key: "rsi_n", label: "RSI 周期", value: 14, min: 5, max: 40, step: 1),
            StrategyParam(key: "max_rsi", label: "买入 RSI 上限", value: 70, min: 50, max: 90, step: 1),
        ]),
        Strategy(id: "boll_break", name: "布林带突破", desc: "收盘突破上轨买入，跌回中轨卖出。", params: [
            StrategyParam(key: "n", label: "周期", value: 20, min: 5, max: 120, step: 1),
            StrategyParam(key: "k", label: "带宽倍数", value: 2, min: 1, max: 4, step: 0.1),
        ]),
        Strategy(id: "kdj", name: "KDJ 金叉", desc: "K 线上穿 D 线且处于低位买入，高位死叉卖出。", params: [
            StrategyParam(key: "n", label: "周期", value: 9, min: 5, max: 40, step: 1),
            StrategyParam(key: "buy", label: "低位阈值", value: 30, min: 5, max: 50, step: 1),
            StrategyParam(key: "sell", label: "高位阈值", value: 75, min: 50, max: 95, step: 1),
        ]),
        Strategy(id: "vol_break", name: "放量突破", desc: "放量突破 20 日高点买入，跌破 10 日低点卖出。", params: [
            StrategyParam(key: "entry_n", label: "突破周期", value: 20, min: 5, max: 120, step: 1),
            StrategyParam(key: "vol_n", label: "均量周期", value: 5, min: 3, max: 30, step: 1),
            StrategyParam(key: "mult", label: "放量倍数", value: 1.5, min: 1, max: 4, step: 0.1),
        ]),
    ]
}

enum BacktestEngine {
    static func run(code: String, name: String, strategyID: String, strategyName: String,
                    params: [String: Double], rows: [KLine], capital: Double,
                    commission: Double = 0.00025, slippage: Double = 0.0005) -> BacktestResult? {
        guard rows.count >= 30 else { return nil }
        var data = rows
        if data.count > 1250 { data = Array(data.suffix(1250)) }
        let signals = buildSignals(strategyID, params: params, rows: data)
        guard signals.count == data.count else { return nil }

        var cash = capital
        var shares = 0
        var entryPrice = 0.0
        var entryDate: String? = nil
        var trades: [BacktestTrade] = []
        var curve: [EquityPoint] = []
        var prevWant = signals.first ?? -1
        var longOnlyDays = 0
        _ = data.map(\.close)
        let bh0 = data.first?.close ?? 1

        for i in 0..<data.count {
            let row = data[i]
            let want = signals[i]
            if i > 0, want != prevWant {
                let exec = row.open > 0 ? row.open : row.close
                if want == 1, shares == 0 {
                    let fill = exec * (1 + slippage)
                    var qty = Int(cash / (fill * 100)) * 100
                    if qty == 0, cash > fill { qty = Int(cash / fill / 10) * 10 }
                    if qty > 0 {
                        var cost = Double(qty) * fill
                        var fee = max(5.0, cost * commission)
                        if cost + fee > cash {
                            qty = max(0, Int((cash - 5) / fill / 10) * 10)
                            cost = Double(qty) * fill
                            fee = max(5.0, cost * commission)
                        }
                        if qty > 0, cost + fee <= cash {
                            cash -= cost + fee
                            shares = qty
                            entryPrice = fill
                            entryDate = row.date
                            trades.append(BacktestTrade(type: "buy", date: row.date, price: fill, qty: qty, fee: fee, pnl: nil, ret: nil, holdDays: nil))
                        }
                    }
                } else if want == -1, shares > 0 {
                    let fill = exec * (1 - slippage)
                    let gross = Double(shares) * fill
                    let fee = max(5.0, gross * commission) + gross * 0.0005
                    cash += gross - fee
                    let pnl = (fill - entryPrice) * Double(shares) - fee
                    let hold = entryDate.flatMap { d -> Int? in
                        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
                        guard let a = df.date(from: d), let b = df.date(from: row.date) else { return nil }
                        return Calendar.current.dateComponents([.day], from: a, to: b).day
                    }
                    trades.append(BacktestTrade(type: "sell", date: row.date, price: fill, qty: shares, fee: fee,
                                                pnl: pnl, ret: entryPrice > 0 ? (fill / entryPrice - 1) * 100 : 0, holdDays: hold))
                    shares = 0
                    entryPrice = 0
                    entryDate = nil
                }
            }
            if shares > 0 { longOnlyDays += 1 }
            let equity = cash + Double(shares) * row.close
            curve.append(EquityPoint(date: row.date, equity: equity, bench: row.close / bh0 * capital))
            prevWant = want
        }

        guard let last = curve.last else { return nil }
        let vals = curve.map(\.equity)
        let ddDates = curve.map(\.date)
        let finalEquity = last.equity
        let totalRet = finalEquity / capital - 1
        let years = max(Double(curve.count) / 244, 1.0 / 244)
        let annual = finalEquity > 0 ? pow(finalEquity / capital, 1 / years) - 1 : -1
        var peak = vals[0]
        var mdd = 0.0
        var dd: [BenchPoint] = []
        for v in vals {
            peak = max(peak, v)
            let d = v / peak - 1
            mdd = min(mdd, d)
            dd.append(BenchPoint(date: ddDates[dd.count], bench: d))
        }
        var rets: [Double] = []
        for i in 1..<vals.count { rets.append(vals[i] / vals[i - 1] - 1) }
        let mean = rets.isEmpty ? 0 : rets.reduce(0, +) / Double(rets.count)
        let variance = rets.isEmpty ? 0 : rets.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(rets.count)
        let vol = sqrt(variance) * sqrt(244)
        let sharpe = vol > 0 ? mean * 244 / vol : 0
        let downs = rets.filter { $0 < 0 }
        var sortino: Double? = nil
        if downs.count > 1 {
            let dm = downs.reduce(0, +) / Double(downs.count)
            let dv = downs.reduce(0) { $0 + ($1 - dm) * ($1 - dm) } / Double(downs.count)
            sortino = dv > 0 ? mean * 244 / (sqrt(dv) * sqrt(244)) : nil
        }
        let sells = trades.filter { $0.type == "sell" }
        let wins = sells.filter { ($0.pnl ?? 0) > 0 }
        let grossWin = wins.reduce(0.0) { $0 + ($1.pnl ?? 0) }
        let grossLoss = abs(sells.reduce(0.0) { $0 + (($1.pnl ?? 0) <= 0 ? ($1.pnl ?? 0) : 0) })
        let benchRet = (data.last?.close ?? bh0) / bh0 - 1
        let exposure = Double(longOnlyDays) / Double(max(curve.count, 1))
        let fees = trades.reduce(0.0) { $0 + $1.fee }

        var metrics = BacktestMetrics()
        metrics.totalReturn = totalRet * 100
        metrics.annualReturn = annual * 100
        metrics.benchmarkReturn = benchRet * 100
        metrics.excessReturn = (totalRet - benchRet) * 100
        metrics.maxDrawdown = mdd * 100
        metrics.volatility = vol * 100
        metrics.sharpe = sharpe
        metrics.sortino = sortino
        metrics.calmar = mdd != 0 ? annual / abs(mdd) : nil
        metrics.tradeCount = sells.count
        metrics.winRate = sells.isEmpty ? nil : Double(wins.count) / Double(sells.count) * 100
        metrics.profitFactor = grossLoss > 0 ? grossWin / grossLoss : nil
        let holds = sells.compactMap(\.holdDays)
        metrics.avgHoldDays = holds.isEmpty ? nil : Double(holds.reduce(0, +)) / Double(holds.count)
        metrics.exposure = exposure * 100
        metrics.costs = fees
        metrics.days = curve.count
        metrics.finalEquity = finalEquity
        metrics.start = data.first?.date ?? ""
        metrics.end = data.last?.date ?? ""

        return BacktestResult(
            code: code, name: name, strategyName: strategyName, metrics: metrics,
            equity: curve, benchmark: curve.map { EquityPoint(date: $0.date, equity: $0.bench, bench: 0) },
            drawdown: dd, trades: trades
        )
    }

    // MARK: - indicators

    static func sma(_ values: [Double], _ n: Int) -> [Double?] {
        var out: [Double?] = Array(repeating: nil, count: values.count)
        guard n > 0 else { return out }
        var sum = 0.0
        for i in 0..<values.count {
            sum += values[i]
            if i >= n { sum -= values[i - n] }
            if i >= n - 1 { out[i] = sum / Double(n) }
        }
        return out
    }

    static func ema(_ values: [Double], _ n: Int) -> [Double] {
        guard !values.isEmpty else { return [] }
        let k = 2.0 / (Double(n) + 1)
        var out = [values[0]]
        for i in 1..<values.count { out.append(values[i] * k + out[i - 1] * (1 - k)) }
        return out
    }

    static func rsi(_ values: [Double], _ n: Int) -> [Double] {
        guard values.count > 1 else { return Array(repeating: 50, count: values.count) }
        var out = Array(repeating: 50.0, count: values.count)
        var gain = 0.0, loss = 0.0
        for i in 1..<values.count {
            let ch = values[i] - values[i - 1]
            let g = max(ch, 0), l = max(-ch, 0)
            if i <= n {
                gain += g; loss += l
                if i == n {
                    gain /= Double(n); loss /= Double(n)
                }
            } else {
                gain = (gain * Double(n - 1) + g) / Double(n)
                loss = (loss * Double(n - 1) + l) / Double(n)
            }
            if i >= n {
                out[i] = loss == 0 ? 100 : 100 - 100 / (1 + gain / loss)
            }
        }
        return out
    }

    static func buildSignals(_ id: String, params: [String: Double], rows: [KLine]) -> [Int] {
        let close = rows.map(\.close)
        var sig = Array(repeating: -1, count: rows.count)
        func p(_ k: String, _ d: Double) -> Double { params[k] ?? d }

        switch id {
        case "ma_cross":
            var f = Int(p("fast", 5)), s = Int(p("slow", 20))
            if f >= s { let t = f; f = s; s = t }
            if f == s { s = f + 1 }
            let mf = sma(close, f), ms = sma(close, s)
            for i in 0..<rows.count {
                if let a = mf[i], let b = ms[i] { sig[i] = a > b ? 1 : -1 }
            }
        case "momentum":
            let nIn = Int(p("entry_n", 20)), nOut = Int(p("exit_n", 10))
            var state = -1
            for i in 0..<rows.count {
                let hi = i >= nIn ? close[i - nIn..<i].max() : nil
                let lo = i >= nOut ? close[i - nOut..<i].min() : nil
                if let hi, close[i] > hi { state = 1 }
                else if let lo, close[i] < lo { state = -1 }
                sig[i] = state
            }
        case "rsi_reversion":
            let n = Int(p("n", 14)), lo = p("buy_level", 30), hi = p("sell_level", 65)
            let r = rsi(close, n)
            var state = -1
            for i in 0..<rows.count {
                if r[i] < lo { state = 1 } else if r[i] > hi { state = -1 }
                sig[i] = state
            }
        case "macd":
            let f = Int(p("fast", 12)), s = Int(p("slow", 26)), g = Int(p("signal", 9))
            let above = p("above_zero", 1) >= 1
            let ef = ema(close, f), es = ema(close, s)
            let dif = zip(ef, es).map { $0 - $1 }
            let dea = ema(dif, g)
            for i in 0..<rows.count {
                let crossUp = dif[i] > dea[i]
                if above {
                    sig[i] = (crossUp && dif[i] > 0) ? 1 : -1
                } else {
                    sig[i] = crossUp ? 1 : -1
                }
            }
        case "turtle":
            let nIn = Int(p("entry_n", 20)), nOut = Int(p("exit_n", 10))
            let highs = rows.map(\.high), lows = rows.map(\.low)
            var state = -1
            for i in 0..<rows.count {
                let hi = i >= nIn ? highs[i - nIn..<i].max() : nil
                let lo = i >= nOut ? lows[i - nOut..<i].min() : nil
                if let hi, close[i] > hi { state = 1 }
                else if let lo, close[i] < lo { state = -1 }
                sig[i] = state
            }
        case "ma_rsi":
            var f = Int(p("fast", 10)), s = Int(p("slow", 30))
            if f >= s { let t = f; f = s; s = t }
            let rn = Int(p("rsi_n", 14)), maxR = p("max_rsi", 70)
            let mf = sma(close, f), ms = sma(close, s)
            let r = rsi(close, rn)
            var state = -1
            for i in 0..<rows.count {
                if let a = mf[i], let b = ms[i] {
                    if a > b && r[i] < maxR { state = 1 }
                    else if a < b { state = -1 }
                }
                sig[i] = state
            }
        case "boll_break":
            let n = Int(p("n", 20)), k = p("k", 2)
            let mid = sma(close, n)
            var state = -1
            for i in 0..<rows.count {
                guard let m = mid[i] else { sig[i] = state; continue }
                let window = close[max(0, i - n + 1)...i]
                let mean = window.reduce(0, +) / Double(window.count)
                let varSum = window.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(window.count)
                let sd = sqrt(varSum)
                if close[i] > m + k * sd { state = 1 }
                else if close[i] < m { state = -1 }
                sig[i] = state
            }
        case "kdj":
            let n = Int(p("n", 9)), lo = p("buy", 30), hi = p("sell", 75)
            var kPrev = 50.0, dPrev = 50.0
            var state = -1
            for i in 0..<rows.count {
                let window = rows[max(0, i - n + 1)...i]
                let hh = window.map(\.high).max() ?? 1
                let ll = window.map(\.low).min() ?? 0
                let rsv = hh > ll ? (close[i] - ll) / (hh - ll) * 100 : 50
                let k = kPrev * 2 / 3 + rsv / 3
                let d = dPrev * 2 / 3 + k / 3
                if i > n {
                    if k > d && d < lo { state = 1 }
                    else if k < d && d > hi { state = -1 }
                }
                kPrev = k; dPrev = d
                sig[i] = state
            }
        case "vol_break":
            let nIn = Int(p("entry_n", 20)), vn = Int(p("vol_n", 5)), mult = p("mult", 1.5)
            let highs = rows.map(\.high), volumes = rows.map(\.volume)
            var state = -1
            for i in 0..<rows.count {
                let hh = i >= nIn ? highs[i - nIn..<i].max() : nil
                let vma = i >= vn ? volumes[i - vn..<i].reduce(0, +) / Double(vn) : nil
                if let hh, let vma, close[i] > hh, volumes[i] > mult * vma { state = 1 }
                else if i >= 10, close[i] < (close[i - 10..<i].min() ?? 0) { state = -1 }
                sig[i] = state
            }
        case "boll":
            let n = Int(p("n", 20)), k = p("k", 2)
            let mid = sma(close, n)
            var state = -1
            for i in 0..<rows.count {
                guard let m = mid[i] else { sig[i] = state; continue }
                let window = close[max(0, i - n + 1)...i]
                let mean = window.reduce(0, +) / Double(window.count)
                let varSum = window.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(window.count)
                let sd = sqrt(varSum)
                if close[i] < m - k * sd { state = 1 }
                else if close[i] >= m || close[i] > m + k * sd { state = -1 }
                sig[i] = state
            }
        default:
            break
        }
        if !sig.isEmpty { sig[0] = -1 }
        return sig
    }
}
