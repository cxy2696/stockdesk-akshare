import Foundation
import SwiftUI

struct Persisted: Codable {
    var trades: [Trade] = []
    var watchlist: [WatchedStock] = []
    var alerts: [PriceAlert] = []
    var signals: [SignalLog] = []
    var account: Account = Account()
}

struct WatchedStock: Codable, Identifiable, Hashable {
    var code: String
    var name: String
    var note: String = ""
    var addedAt: String = ""
    var id: String { code }
}

@MainActor
final class AppStore: ObservableObject {
    @Published var trades: [Trade] = []
    @Published var watchlist: [WatchedStock] = []
    @Published var alerts: [PriceAlert] = []
    @Published var signals: [SignalLog] = []
    @Published var account = Account()

    @Published var indices: [IndexQuote] = []
    @Published var breadth = Breadth()
    @Published var watchQuotes: [String: Quote] = [:]
    @Published var summary = PortfolioSummary()
    @Published var chips: [String: ChipResult] = [:]
    @Published var spotLoaded = false
    @Published var spotRows: [Quote] = []
    @Published var spotDate = ""

    @Published var loading = false
    @Published var lastRefresh = ""

    private let market = MarketService.shared
    private let fileURL: URL
    private let summaryCacheKey = "stockdesk.summary.cache.v1"

    init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        fileURL = dir.appendingPathComponent("stockdesk.json")
        load()
        if summary.total == 0 { recomputeSummary() }
    }

    // MARK: - persistence

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let p = try? JSONDecoder().decode(Persisted.self, from: data) else {
            seedIfEmpty()
            return
        }
        trades = p.trades
        watchlist = p.watchlist
        alerts = p.alerts
        signals = p.signals
        account = p.account
        if let data = UserDefaults.standard.data(forKey: summaryCacheKey),
           let cached = try? JSONDecoder().decode(PortfolioSummary.self, from: data),
           !cached.positions.isEmpty || cached.total > 0 {
            summary = cached
        }
        if trades.isEmpty && watchlist.isEmpty {
            seedIfEmpty()
        }
    }

    func save() {
        let p = Persisted(trades: trades, watchlist: watchlist, alerts: alerts, signals: signals, account: account)
        if let data = try? JSONEncoder().encode(p) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    /// Launch-time deep link used for screenshots / quick links:
    /// `-screen backtest`, `-screen screener`, ... `-tab 2`
    func debugScreen() -> String? {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-screen"), i + 1 < args.count { return args[i + 1] }
        return nil
    }

    func debugCode() -> String? {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-code"), i + 1 < args.count { return args[i + 1] }
        return nil
    }

    func hasFlag(_ name: String) -> Bool {
        ProcessInfo.processInfo.arguments.contains(name)
    }

    func debugTab() -> Int? {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-tab"), i + 1 < args.count { return Int(args[i + 1]) }
        return nil
    }

    private func seedIfEmpty() {
        if trades.isEmpty && watchlist.isEmpty {
            seedDemoTrades()
            let demo: [WatchedStock] = [
                WatchedStock(code: "600519", name: "贵州茅台", note: "核心"),
                WatchedStock(code: "300750", name: "宁德时代", note: "成长"),
                WatchedStock(code: "600036", name: "招商银行", note: "红利"),
                WatchedStock(code: "000858", name: "五粮液", note: "消费"),
                WatchedStock(code: "601318", name: "中国平安", note: "金融"),
            ]
            watchlist = demo
            save()
        }
    }

    private func seedDemoTrades() {
        let demo: [(String, String, TradeSide, Double, Int, String, String)] = [
            ("601318", "中国平安", .buy, 66.40, 800, "2026-01-15", "保险板块底仓"),
            ("600036", "招商银行", .buy, 38.36, 1000, "2026-02-24", "低估值高股息"),
            ("600519", "贵州茅台", .buy, 1376.05, 100, "2026-03-09", "核心仓位，长期持有"),
            ("300750", "宁德时代", .buy, 440.89, 400, "2026-04-21", "新能源龙头，趋势买入"),
            ("000858", "五粮液", .buy, 87.66, 500, "2026-05-14", "消费复苏逻辑"),
            ("600519", "贵州茅台", .buy, 1252.03, 100, "2026-06-15", "中报前加仓"),
            ("000001", "平安银行", .buy, 9.90, 2000, "2026-06-30", "银行补涨"),
            ("600036", "招商银行", .sell, 37.38, 500, "2026-07-03", "波段减仓"),
            ("300750", "宁德时代", .sell, 399.84, 200, "2026-08-12", "部分止盈"),
            ("000858", "五粮液", .sell, 71.60, 500, "2026-09-22", "调整仓位"),
        ]
        for (code, name, side, price, qty, date, note) in demo {
            trades.append(Trade(code: code, name: name, side: side, price: price, qty: qty,
                                fee: 5, tradeDate: date, note: note))
        }
        account = Account(assets: 500_000)
        if alerts.isEmpty {
            alerts = [
                PriceAlert(code: "600519", name: "贵州茅台", direction: .above, price: 1500, note: "回到 1500 减仓观察"),
                PriceAlert(code: "300750", name: "宁德时代", direction: .below, price: 230, note: "跌破 230 提示"),
            ]
        }
        save()
    }

    // MARK: - market refresh

    func refreshAll() async {
        loading = true
        async let idx = market.indices()
        async let br = market.breadth()
        let codes = Set(watchlist.map(\.code) + trades.map(\.code))
        async let qs = market.quotes(Array(codes))
        let (i, b, q) = await (idx, br, qs)
        indices = i
        breadth = b
        watchQuotes = q
        let df = DateFormatter()
        df.dateFormat = "HH:mm:ss"
        lastRefresh = df.string(from: Date())
        recomputeSummary()
        loading = false
        await checkAlerts()
        await refreshChips()
    }

    func refreshSummary() async {
        let codes = Set(trades.map(\.code))
        let qs = await market.quotes(Array(codes))
        watchQuotes.merge(qs) { a, _ in a }
        recomputeSummary()
    }

    private func recomputeSummary() {
        let next = PortfolioEngine.summary(trades: trades, account: account, quotes: watchQuotes)
        // avoid replacing a populated cache with a transient empty snapshot
        if next.total > 0 || summary.total == 0 {
            summary = next
            if !watchQuotes.isEmpty, let data = try? JSONEncoder().encode(next) {
                UserDefaults.standard.set(data, forKey: summaryCacheKey)
            }
        }
    }

    /// On-device chip distribution for each holding (support / resistance).
    func refreshChips() async {
        var out: [String: ChipResult] = [:]
        for p in summary.positions {
            if let rows = try? await market.klines(p.code, period: "daily", limit: 160, adjust: ""),
               let c = ChipEngine.compute(rows) {
                out[p.code] = c
            }
        }
        chips = out
    }

    func ensureSpot() async {
        guard !spotLoaded else { return }
        if let spot = try? await market.spot() {
            spotRows = spot.rows
            spotDate = spot.date
            spotLoaded = true
        }
    }

    // MARK: - watchlist

    func isWatched(_ code: String) -> Bool { watchlist.contains { $0.code == code } }

    func toggleWatch(_ code: String, name: String) {
        if let i = watchlist.firstIndex(where: { $0.code == code }) {
            watchlist.remove(at: i)
        } else {
            watchlist.append(WatchedStock(code: code, name: name, addedAt: todayString()))
        }
        save()
    }

    func addWatch(_ code: String, name: String) {
        guard !isWatched(code) else { return }
        watchlist.append(WatchedStock(code: code, name: name, addedAt: todayString()))
        save()
        Task { await refreshWatchQuotes() }
    }

    func refreshWatchQuotes() async {
        let qs = await market.quotes(watchlist.map(\.code))
        watchQuotes.merge(qs) { _, b in b }
    }

    // MARK: - trades

    func addTrade(_ t: Trade) throws {
        if t.side == .sell {
            let pos = PortfolioEngine.positions(from: trades).first { $0.code == t.code }
            let held = pos?.qty ?? 0
            guard held >= t.qty else {
                throw NSError(domain: "StockDesk", code: 1, userInfo: [NSLocalizedDescriptionKey: "卖出数量超过持仓（当前持有 \(held) 股）"])
            }
        }
        trades.append(t)
        trades.sort { $0.tradeDate < $1.tradeDate }
        if watchQuotes[t.code] == nil {
            Task {
                if let q = try? await market.quote(t.code) { watchQuotes[t.code] = q }
                recomputeSummary()
            }
        }
        save()
        recomputeSummary()
    }

    func updateTrade(_ t: Trade) {
        if let i = trades.firstIndex(where: { $0.id == t.id }) {
            trades[i] = t
            trades.sort { $0.tradeDate < $1.tradeDate }
            save()
            recomputeSummary()
        }
    }

    func deleteTrade(_ t: Trade) {
        trades.removeAll { $0.id == t.id }
        save()
        recomputeSummary()
    }

    /// Remove a holding by deleting every trade for that code.
    func deleteTrades(code: String) {
        trades.removeAll { $0.code == code }
        chips[code] = nil
        save()
        recomputeSummary()
    }

    func setAccount(assets: Double) {
        account = Account(assets: assets)
        save()
        recomputeSummary()
    }

    // MARK: - analytics

    func analytics() async -> AnalyticsResult {
        let codes = Array(Set(trades.map(\.code)))
        var closes: [String: [String: Double]] = [:]
        for code in codes {
            if let rows = try? await market.klines(code, period: "daily", limit: 1600, adjust: "") {
                closes[code] = Dictionary(uniqueKeysWithValues: rows.map { ($0.date, $0.close) })
            }
        }
        var bench: [String: Double] = [:]
        if let rows = try? await market.indexKlines("000300") {
            bench = Dictionary(uniqueKeysWithValues: rows.map { ($0.date, $0.close) })
        }
        var result = AnalyticsEngine.compute(trades: trades, account: account, closes: closes, benchmark: bench, today: todayString())
        if let start = result.series.first?.date, let end = result.series.last?.date,
           let rows = try? await market.indexKlines("000001") {
            let win = rows.filter { $0.date >= start && $0.date <= end }
            if let f = win.first, let l = win.last, f.close > 0 {
                result.shReturn = (l.close / f.close - 1) * 100
                result.shExcess = result.metrics.totalReturn - result.shReturn
            }
        }
        return result
    }

    // MARK: - alerts

    func addAlert(_ a: PriceAlert) {
        alerts.insert(a, at: 0)
        save()
    }

    func deleteAlert(_ a: PriceAlert) {
        alerts.removeAll { $0.id == a.id }
        save()
    }

    func toggleAlert(_ a: PriceAlert) {
        if let i = alerts.firstIndex(where: { $0.id == a.id }) {
            alerts[i].enabled.toggle()
            if alerts[i].enabled {
                alerts[i].triggeredAt = nil
                alerts[i].triggeredPrice = nil
            }
            save()
        }
    }

    func checkAlerts() async {
        let active = alerts.filter { $0.enabled }
        guard !active.isEmpty else { return }
        let qs = await market.quotes(active.map(\.code))
        let df = DateFormatter()
        df.dateFormat = "MM-dd HH:mm"
        for a in active {
            guard let px = qs[a.code]?.price else { continue }
            let hit = (a.direction == .above && px >= a.price) || (a.direction == .below && px <= a.price)
            guard hit, let i = alerts.firstIndex(where: { $0.id == a.id }) else { continue }
            alerts[i].enabled = false
            alerts[i].triggeredAt = df.string(from: Date())
            alerts[i].triggeredPrice = px
            let msg = "\(a.name)(\(a.code)) \(a.direction == .above ? "突破" : "跌破") \(String(format: "%.2f", a.price))，现价 \(String(format: "%.2f", px))"
            signals.insert(SignalLog(message: msg, createdAt: df.string(from: Date())), at: 0)
        }
        save()
    }

    // MARK: - helpers

    func todayString() -> String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone(identifier: "Asia/Shanghai")
        return df.string(from: Date())
    }

    func marketStatus() -> (label: String, open: Bool) {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        let now = Date()
        let comps = cal.dateComponents([.weekday, .hour, .minute], from: now)
        let minutes = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
        if let wd = comps.weekday, wd == 1 || wd == 7 { return ("休市", false) }
        if minutes >= 570 && minutes <= 690 || minutes >= 780 && minutes <= 900 { return ("交易中", true) }
        if minutes > 690 && minutes < 780 { return ("午间休市", false) }
        return ("已收盘", false)
    }
}
