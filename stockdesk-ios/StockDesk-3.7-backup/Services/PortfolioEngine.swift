import Foundation

enum PortfolioEngine {
    /// Moving-average cost basis. Returns open positions only.
    static func positions(from trades: [Trade]) -> [Position] {
        struct Book {
            var name = ""
            var qty = 0
            var cost = 0.0
            var realized = 0.0
        }
        var book: [String: Book] = [:]
        for t in trades.sorted(by: { $0.tradeDate < $1.tradeDate }) {
            var b = book[t.code] ?? Book()
            if !t.name.isEmpty { b.name = t.name }
            if t.side == .buy {
                b.cost += t.price * Double(t.qty) + t.fee
                b.qty += t.qty
            } else {
                guard b.qty > 0 else { book[t.code] = b; continue }
                let avg = b.cost / Double(b.qty)
                let sellQty = min(t.qty, b.qty)
                b.realized += (t.price - avg) * Double(sellQty) - t.fee
                b.cost -= avg * Double(sellQty)
                b.qty -= sellQty
                if b.qty == 0 { b.cost = 0 }
            }
            book[t.code] = b
        }
        return book.compactMap { code, b -> Position? in
            guard b.qty > 0 else { return nil }
            let avg = b.cost / Double(b.qty)
            return Position(
                code: code, name: b.name.isEmpty ? code : b.name, qty: b.qty,
                avgCost: avg, cost: b.cost, realized: b.realized,
                price: nil, pct: nil, marketValue: 0, floatPnl: 0, floatPct: nil, weight: nil
            )
        }
        .sorted { $0.code < $1.code }
    }

    static func netInvested(_ trades: [Trade]) -> Double {
        trades.reduce(0.0) { acc, t in
            let amt = t.price * Double(t.qty) + t.fee
            return acc + (t.side == .buy ? amt : -amt)
        }
    }

    static func summary(trades: [Trade], account: Account, quotes: [String: Quote]) -> PortfolioSummary {
        var positions = positions(from: trades)
        let mv = positions.reduce(0.0) { $0 + (quotes[$1.code]?.price ?? $1.avgCost) * Double($1.qty) }
        let cash = account.assets - netInvested(trades)
        let total = mv + cash
        let cost = positions.reduce(0.0) { $0 + $1.cost }
        let realized = positions.reduce(0.0) { $0 + $1.realized }

        for i in positions.indices {
            let p = positions[i]
            let q = quotes[p.code]
            let price = q?.price ?? p.avgCost
            let value = price * Double(p.qty)
            positions[i].price = price
            positions[i].pct = q?.pct
            positions[i].marketValue = value
            positions[i].floatPnl = value - p.cost
            positions[i].floatPct = p.cost > 0 ? (value / p.cost - 1) * 100 : nil
            positions[i].weight = total > 0 ? value / total * 100 : 0
            if positions[i].name.isEmpty || positions[i].name == p.code {
                positions[i].name = q?.name ?? p.code
            }
        }
        let floatPnl = positions.reduce(0.0) { $0 + $1.floatPnl }
        let totalPnl = total - account.assets
        let hasTrades = !trades.isEmpty
        let base = account.assets > 0 ? account.assets : max(total - totalPnl, 1)
        return PortfolioSummary(
            cash: cash,
            marketValue: mv,
            total: total,
            cost: cost,
            floatPnl: floatPnl,
            floatPct: cost > 0 ? floatPnl / cost * 100 : 0,
            realized: realized,
            totalPnl: totalPnl,
            totalPct: base > 0 ? totalPnl / base * 100 : 0,
            startCapital: base,
            positions: positions,
            hasTrades: hasTrades
        )
    }

    static func todayPnl(positions: [Position]) -> Double {
        positions.reduce(0.0) { acc, p in
            guard let price = p.price, let pct = p.pct else { return acc }
            let prev = price / (1 + pct / 100)
            return acc + (price - prev) * Double(p.qty)
        }
    }
}

enum AnalyticsEngine {
    static func compute(trades: [Trade], account: Account, closes: [String: [String: Double]], benchmark: [String: Double], today: String) -> AnalyticsResult {
        var result = AnalyticsResult()
        guard !trades.isEmpty else { return result }
        result.isEmpty = false
        let start = trades.map(\.tradeDate).min() ?? today
        let end = today < start ? start : today

        // calendar days
        var days: [String] = []
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone(identifier: "Asia/Shanghai")
        if let d0 = df.date(from: start), let d1 = df.date(from: end) {
            var cur = d0
            while cur <= d1 {
                days.append(df.string(from: cur))
                cur = Calendar.current.date(byAdding: .day, value: 1, to: cur) ?? cur.addingTimeInterval(86400)
            }
        }
        if days.isEmpty { days = [start, end] }

        let byDay = Dictionary(grouping: trades, by: \.tradeDate)
        var cash = account.assets
        var qty: [String: Int] = [:]
        var mark: [String: Double] = [:]
        for (code, series) in closes {
            let prior = series.keys.filter { $0 < start }.sorted()
            if let last = prior.last { mark[code] = series[last] }
            else if let first = series.keys.sorted().first { mark[code] = series[first] }
        }
        var b0: Double? = nil
        for d in benchmark.keys.sorted() where d >= start {
            b0 = benchmark[d]
            break
        }
        var benchLast = b0 ?? 1

        var navSeries: [NavPoint] = []
        var benchSeries: [BenchPoint] = []
        var ddSeries: [BenchPoint] = []
        var nav = 1.0
        var peak = 1.0
        var benchBase: Double? = b0

        for d in days {
            var flow = 0.0
            for t in byDay[d] ?? [] {
                if t.side == .buy {
                    let amt = t.price * Double(t.qty) + t.fee
                    flow += amt
                    cash -= amt
                    qty[t.code, default: 0] += t.qty
                } else {
                    let amt = t.price * Double(t.qty) - t.fee
                    flow -= amt
                    cash += amt
                    qty[t.code] = max(0, (qty[t.code] ?? 0) - t.qty)
                }
            }
            for code in closes.keys {
                if let px = closes[code]?[d] { mark[code] = px }
            }
            let mv = qty.reduce(0.0) { $0 + (mark[$1.key] ?? 0) * Double($1.value) }
            let total = cash + mv
            nav = total / max(account.assets, 1)
            if let bv = benchmark[d] { benchLast = bv }
            if benchBase == nil { benchBase = benchLast }
            let bn = benchBase.map { benchLast / $0 } ?? 1
            peak = max(peak, nav)
            navSeries.append(NavPoint(date: d, nav: nav, total: total, cash: cash, mv: mv))
            benchSeries.append(BenchPoint(date: d, bench: bn))
            ddSeries.append(BenchPoint(date: d, bench: nav / peak - 1))
        }

        // metrics
        let n = navSeries.count
        let finalNav = navSeries.last?.nav ?? 1
        let totalRet = finalNav - 1
        let years = max(Double(n) / 244, 1.0 / 244)
        let annual = finalNav > 0 ? pow(finalNav, 1 / years) - 1 : -1
        var rets: [Double] = []
        for i in 1..<max(n, 1) { rets.append(navSeries[i].nav / navSeries[i - 1].nav - 1) }
        let mean = rets.isEmpty ? 0 : rets.reduce(0, +) / Double(rets.count)
        let variance = rets.isEmpty ? 0 : rets.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(rets.count)
        let vol = sqrt(variance) * sqrt(244)
        let sharpe = vol > 0 ? mean * 244 / vol : 0
        let mdd = ddSeries.map(\.bench).min() ?? 0
        let benchRet = (benchSeries.last?.bench ?? 1) - 1
        var beta: Double? = nil
        if rets.count > 1 {
            var brets: [Double] = []
            for i in 1..<benchSeries.count { brets.append(benchSeries[i].bench / benchSeries[i - 1].bench - 1) }
            if brets.count == rets.count {
                let mb = brets.reduce(0, +) / Double(brets.count)
                var cov = 0.0, vb = 0.0
                for i in 0..<rets.count {
                    cov += (rets[i] - mean) * (brets[i] - mb)
                    vb += (brets[i] - mb) * (brets[i] - mb)
                }
                cov /= Double(rets.count)
                vb /= Double(brets.count)
                beta = vb > 0 ? cov / vb : nil
            }
        }
        let benchAnnual = benchRet > -1 ? pow(1 + benchRet, 1 / years) - 1 : -1
        let alpha = beta.map { annual - $0 * benchAnnual }

        result.series = navSeries
        result.benchmark = benchSeries
        result.drawdown = ddSeries
        result.metrics = AnalyticsMetrics(
            totalReturn: totalRet * 100,
            annualReturn: annual * 100,
            maxDrawdown: mdd * 100,
            volatility: vol * 100,
            sharpe: sharpe,
            benchmarkReturn: benchRet * 100,
            excessReturn: (totalRet - benchRet) * 100,
            beta: beta,
            alpha: alpha.map { $0 * 100 },
            days: n,
            calmar: mdd != 0 ? annual / abs(mdd) : nil,
            finalNav: finalNav
        )

        // monthly
        var byMonth: [String: [Double]] = [:]
        for p in navSeries { byMonth[String(p.date.prefix(7)), default: []].append(p.nav) }
        var prevMonth = 1.0
        for m in byMonth.keys.sorted() {
            let vals = byMonth[m] ?? []
            if let last = vals.last {
                result.monthly.append(MonthlyReturn(month: m, ret: (last / prevMonth - 1) * 100))
                prevMonth = last
            }
        }

        let stats = FIFO.stats(trades: trades)
        result.stats = stats.tradeStats
        result.byStock = stats.byStock
        return result
    }

    enum FIFO {
        struct Lot { var qty: Int; var price: Double; var feePS: Double; var date: String }

        static func stats(trades: [Trade]) -> (tradeStats: TradeStats, byStock: [StockContribution]) {
            var lots: [String: [Lot]] = [:]
            var closed: [ClosedTrade] = []
            for t in trades.sorted(by: { $0.tradeDate < $1.tradeDate }) {
                if t.side == .buy {
                    let feePS = t.qty > 0 ? t.fee / Double(t.qty) : 0
                    lots[t.code, default: []].append(Lot(qty: t.qty, price: t.price, feePS: feePS, date: t.tradeDate))
                } else {
                    var need = t.qty
                    let feePS = t.qty > 0 ? t.fee / Double(t.qty) : 0
                    while need > 0, var list = lots[t.code], !list.isEmpty {
                        var lot = list[0]
                        let take = min(need, lot.qty)
                        let pnl = (t.price - lot.price - lot.feePS - feePS) * Double(take)
                        closed.append(ClosedTrade(
                            code: t.code, name: t.name, openDate: lot.date, closeDate: t.tradeDate,
                            qty: take, pnl: pnl,
                            ret: lot.price > 0 ? (t.price / lot.price - 1) * 100 : 0
                        ))
                        lot.qty -= take
                        need -= take
                        if lot.qty <= 0 { list.removeFirst() } else { list[0] = lot }
                        lots[t.code] = list
                    }
                }
            }
            let wins = closed.filter { $0.pnl > 0 }
            let losses = closed.filter { $0.pnl <= 0 }
            let grossWin = wins.reduce(0.0) { $0 + $1.pnl }
            let grossLoss = abs(losses.reduce(0.0) { $0 + $1.pnl })
            var ts = TradeStats()
            ts.closedCount = closed.count
            ts.winCount = wins.count
            ts.lossCount = losses.count
            ts.winRate = closed.isEmpty ? nil : Double(wins.count) / Double(closed.count) * 100
            ts.avgWin = wins.isEmpty ? 0 : grossWin / Double(wins.count)
            ts.avgLoss = losses.isEmpty ? 0 : -grossLoss / Double(losses.count)
            ts.profitFactor = grossLoss > 0 ? grossWin / grossLoss : nil
            ts.best = closed.max { $0.pnl < $1.pnl }
            ts.worst = closed.min { $0.pnl < $1.pnl }
            ts.closed = Array(closed.suffix(60))

            var agg: [String: StockContribution] = [:]
            for c in closed {
                var a = agg[c.code] ?? StockContribution(code: c.code, name: c.name, pnl: 0, count: 0, wins: 0, winRate: 0)
                a.pnl += c.pnl
                a.count += 1
                if c.pnl > 0 { a.wins += 1 }
                agg[c.code] = a
            }
            let byStock = agg.values.map { a -> StockContribution in
                var x = a
                x.winRate = x.count > 0 ? Double(x.wins) / Double(x.count) * 100 : 0
                return x
            }.sorted { $0.pnl > $1.pnl }
            return (ts, byStock)
        }
    }
}
