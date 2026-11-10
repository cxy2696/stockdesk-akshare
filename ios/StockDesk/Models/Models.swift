import Foundation
import SwiftUI

// MARK: - Market

struct Quote: Codable, Identifiable, Hashable {
    var code: String
    var name: String
    var price: Double?
    var pct: Double?
    var chg: Double?
    var high: Double?
    var low: Double?
    var open: Double?
    var prevClose: Double?
    var volume: Double?
    var amount: Double?
    var turnover: Double?
    var pe: Double?
    var pb: Double?
    var mcap: Double?
    var fcap: Double?
    var volumeRatio: Double?
    var market: String?
    var pct60: Double?
    var pctYtd: Double?
    var mainInflow: Double?
    var amplitude: Double?
    var speed: Double? = nil
    var industry: String? = nil
    var id: String { code }
}

struct KLine: Codable, Identifiable, Hashable {
    var date: String
    var open: Double
    var close: Double
    var high: Double
    var low: Double
    var volume: Double
    var amount: Double
    var pct: Double
    var turnover: Double
    var id: String { date }
}

struct IndexQuote: Codable, Identifiable, Hashable {
    var code: String
    var name: String
    var short: String
    var price: Double?
    var chg: Double?
    var pct: Double?
    var amount: Double?
    var id: String { code }
}

struct Breadth: Codable {
    var up: Int = 0
    var down: Int = 0
    var flat: Int = 0
    var limitUp: Int = 0
    var limitDown: Int = 0
    var total: Int = 0
}

struct Financial: Codable, Identifiable, Hashable {
    var period: String
    var eps: Double?
    var bps: Double?
    var roe: Double?
    var revenueYoy: Double?
    var profitYoy: Double?
    var grossMargin: Double?
    var netMargin: Double?
    var debtRatio: Double?
    var id: String { period }
}

struct CompanyProfile: Codable {
    var orgName: String?
    var industry: String?
    var regCapital: Double?
    var employees: Double?
    var foundDate: String?
    var listingDate: String?
    var profile: String?
    var businessScope: String? = nil
    var mainBusiness: String? = nil
    var address: String? = nil
    var website: String? = nil
    var email: String? = nil
    var tel: String? = nil
    var chairman: String? = nil
    var secretary: String? = nil
    var legalPerson: String? = nil
    var regNum: String? = nil
}

struct StockDetail: Codable {
    var quote: Quote
    var profile: CompanyProfile?
    var financials: [Financial]
    var isWatched: Bool
}

// MARK: - Portfolio

struct Trade: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var code: String
    var name: String
    var side: TradeSide
    var price: Double
    var qty: Int
    var fee: Double
    var tradeDate: String
    var note: String = ""
}

enum TradeSide: String, Codable, CaseIterable {
    case buy, sell
    var label: String { self == .buy ? "买入" : "卖出" }
    var color: Color { self == .buy ? Theme.up : Theme.down }
}

struct Position: Identifiable, Hashable, Codable {
    var code: String
    var name: String
    var qty: Int
    var avgCost: Double
    var cost: Double
    var realized: Double
    var price: Double?
    var pct: Double?
    var marketValue: Double
    var floatPnl: Double
    var floatPct: Double?
    var weight: Double?
    var id: String { code }
}

/// The single anchor: initial assets. Cash is derived from trade flows so the
/// total always equals `cash + market value` and moves with quotes.
struct Account: Codable {
    var assets: Double = 200_000

    init(assets: Double = 200_000) { self.assets = assets }

    enum CodingKeys: String, CodingKey { case assets, capital, cash }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let a = try c.decodeIfPresent(Double.self, forKey: .assets) {
            assets = a
        } else if let cap = try c.decodeIfPresent(Double.self, forKey: .capital) {
            assets = cap          // migrate old {capital, cash} files
        } else {
            assets = 200_000
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(assets, forKey: .assets)
    }
}

struct PortfolioSummary: Codable {
    var cash: Double = 0
    var marketValue: Double = 0
    var total: Double = 0
    var cost: Double = 0
    var floatPnl: Double = 0
    var floatPct: Double = 0
    var realized: Double = 0
    var totalPnl: Double = 0
    var totalPct: Double = 0
    var startCapital: Double = 0
    var positions: [Position] = []
    var hasTrades: Bool = false
}

struct NavPoint: Identifiable {
    var date: String
    var nav: Double
    var total: Double
    var cash: Double
    var mv: Double
    var id: String { date }
}

struct BenchPoint: Identifiable {
    var date: String
    var bench: Double
    var id: String { date }
}

struct AnalyticsMetrics {
    var totalReturn: Double = 0
    var annualReturn: Double = 0
    var maxDrawdown: Double = 0
    var volatility: Double = 0
    var sharpe: Double = 0
    var benchmarkReturn: Double = 0
    var excessReturn: Double = 0
    var beta: Double?
    var alpha: Double?
    var days: Int = 0
    var calmar: Double?
    var finalNav: Double = 1
}

struct ClosedTrade: Identifiable {
    var code: String
    var name: String
    var openDate: String
    var closeDate: String
    var qty: Int
    var pnl: Double
    var ret: Double
    var id: String { "\(code)-\(openDate)-\(closeDate)-\(qty)-\(pnl)" }
}

struct TradeStats {
    var closedCount = 0
    var winCount = 0
    var lossCount = 0
    var winRate: Double? = nil
    var avgWin: Double = 0
    var avgLoss: Double = 0
    var profitFactor: Double? = nil
    var best: ClosedTrade? = nil
    var worst: ClosedTrade? = nil
    var closed: [ClosedTrade] = []
}

struct StockContribution: Identifiable {
    var code: String
    var name: String
    var pnl: Double
    var count: Int
    var wins: Int
    var winRate: Double
    var id: String { code }
}

struct MonthlyReturn: Identifiable {
    var month: String
    var ret: Double
    var id: String { month }
}

struct AnalyticsResult {
    var series: [NavPoint] = []
    var benchmark: [BenchPoint] = []
    var drawdown: [BenchPoint] = []
    var metrics = AnalyticsMetrics()
    var shReturn: Double = 0
    var shExcess: Double = 0
    var monthly: [MonthlyReturn] = []
    var stats = TradeStats()
    var byStock: [StockContribution] = []
    var isEmpty = true
}

// MARK: - Backtest

struct StrategyParam: Identifiable, Hashable {
    var key: String
    var label: String
    var value: Double
    var min: Double
    var max: Double
    var step: Double
    var id: String { key }
}

struct Strategy: Identifiable, Hashable {
    var id: String
    var name: String
    var desc: String
    var params: [StrategyParam]
}

struct BacktestTrade: Identifiable {
    var type: String
    var date: String
    var price: Double
    var qty: Int
    var fee: Double
    var pnl: Double?
    var ret: Double?
    var holdDays: Int?
    var id: String { "\(date)-\(type)-\(price)" }
}

struct BacktestMetrics {
    var totalReturn: Double = 0
    var annualReturn: Double = 0
    var benchmarkReturn: Double = 0
    var excessReturn: Double = 0
    var maxDrawdown: Double = 0
    var volatility: Double = 0
    var sharpe: Double = 0
    var sortino: Double?
    var calmar: Double?
    var tradeCount: Int = 0
    var winRate: Double?
    var profitFactor: Double?
    var avgHoldDays: Double?
    var exposure: Double = 0
    var costs: Double = 0
    var days: Int = 0
    var finalEquity: Double = 0
    var start: String = ""
    var end: String = ""
}

struct EquityPoint: Identifiable {
    var date: String
    var equity: Double
    var bench: Double
    var id: String { date }
}

struct BacktestResult {
    var code: String
    var name: String
    var strategyName: String
    var metrics = BacktestMetrics()
    var equity: [EquityPoint] = []
    var benchmark: [EquityPoint] = []
    var drawdown: [BenchPoint] = []
    var trades: [BacktestTrade] = []
}

// MARK: - Alerts

struct PriceAlert: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var code: String
    var name: String
    var direction: AlertDirection
    var price: Double
    var note: String = ""
    var enabled: Bool = true
    var triggeredAt: String?
    var triggeredPrice: Double?
}

enum AlertDirection: String, Codable, CaseIterable {
    case above, below
    var label: String { self == .above ? "上穿 ≥" : "下破 ≤" }
    var color: Color { self == .above ? Theme.up : Theme.down }
}

struct SignalLog: Codable, Identifiable {
    var id: UUID = UUID()
    var message: String
    var createdAt: String
}

// MARK: - Screener

struct ScreenFilters: Codable, Equatable {
    var boards: [String] = []
    var priceMin: Double?
    var priceMax: Double?
    var mcapMin: Double?
    var mcapMax: Double?
    var peMin: Double?
    var peMax: Double?
    var pbMin: Double?
    var pbMax: Double?
    var pctMin: Double?
    var pctMax: Double?
    var turnoverMin: Double?
    var turnoverMax: Double?
    var inflowMin: Double?
    var excludeST = true
    var excludeNew = true
    var onlyProfit = true
    var keyword = ""
    var sort = "score"
}

struct ScreenRow: Identifiable, Hashable {
    var code: String
    var name: String
    var price: Double?
    var pct: Double?
    var pct60: Double?
    var pe: Double?
    var pb: Double?
    var mcapYi: Double
    var turnover: Double?
    var inflowYi: Double
    var score: Double
    var market: String
    var id: String { code }
}

// MARK: - Market board / sentiment / patterns

struct Board: Identifiable, Hashable {
    var code: String
    var name: String
    var pct: Double?
    var inflow: Double?
    var up: Int?
    var down: Int?
    var leader: String?
    var leaderCode: String?
    var leaderPct: Double?
    var kind: String
    var pct5: Double? = nil
    var pct20: Double? = nil
    var pct60: Double? = nil
    var trend: String? = nil
    var id: String { code }
}

struct HeatStock: Identifiable {
    var code: String
    var name: String
    var value: Double
    var pct: Double
    var price: Double?
    var id: String { code }
}

struct HeatGroup: Identifiable {
    var name: String
    var value: Double
    var pct: Double
    var children: [HeatStock]
    var id: String { name }
}

struct IndexTrend: Identifiable {
    var code: String
    var name: String
    var short: String
    var price: Double?
    var pct: Double?
    var ma5: Double?
    var ma10: Double?
    var ma20: Double?
    var ma60: Double?
    var macdDif: Double?
    var macdDea: Double?
    var support: Double?
    var resistance: Double?
    var rsi: Double?
    var pct5: Double?
    var pct20: Double?
    var trend: String
    var above20: Bool
    var pct7: Double? = nil
    var pct30: Double? = nil
    var pct60: Double? = nil
    var tdBuy: Int = 0
    var tdSell: Int = 0
    var bottomDull: Bool = false
    var id: String { code }
}

struct MarketState {
    var score: Int = 50
    var label = "震荡"
    var tone = "flat"
    var reasons: [String] = []
    var indices: [IndexTrend] = []
    var breadth = Breadth()
    var turnover: Double = 0
    var top: [Board] = []
    var bottom: [Board] = []
    var concepts: [Board] = []
    var industriesIn: [Board] = []
    var gainers: [Quote] = []
    var losers: [Quote] = []
    var inflow: [Quote] = []
    var outflow: [Quote] = []
    var speeders: [Quote] = []
    var industryTrends: [Board] = []
    var news: [NewsItem] = []
}

struct NewsItem: Identifiable {
    var title: String
    var time: String
    var summary: String?
    var url: String?
    var id: String { time + title }
}

struct PositionAdvice {
    var score: Int = 50
    var regime = "震荡"
    var currentPct: Double = 0
    var targetLow: Int = 45
    var targetHigh: Int = 60
    var gap: Double = 0
    var action = "持有"
    var urgency = "低"
    var singleCap: Int = 20
    var cashFloor: Int = 40
    var reasons: [String] = []
    var warnings: [String] = []
    var actions: [String] = []
}

struct PatternDef: Identifiable, Hashable {
    var id: String
    var name: String
    var desc: String
    var tag: String
}

struct PatternHit: Identifiable {
    var code: String
    var name: String
    var price: Double?
    var pct: Double?
    var industry: String?
    var score: Int
    var signals: [String]
    var reason: String
    var id: String { code }
}


struct IndexAnalysisRow: Identifiable, Hashable {
    var code: String
    var name: String
    var region: String
    var style: String = ""
    var desc: String = ""
    var price: Double?
    var pct: Double?
    var pct1: Double?
    var pct5: Double?
    var pct7: Double?
    var pct20: Double?
    var pct60: Double?
    var pct120: Double?
    var ma5: Double?
    var ma10: Double?
    var ma20: Double?
    var ma60: Double?
    var ma120: Double?
    var trend: String
    var support: Double?
    var resistance: Double?
    var high52: Double?
    var low52: Double?
    var rsi: Double?
    var dif: Double?
    var dea: Double?
    var macdHist: Double?
    var vol20: Double?
    var bias20: Double?
    var score: Int = 50
    var bias: String = "中性"
    var action: String = ""
    var conclusion: String = ""
    var note: String
    var date: String = ""
    var id: String { code }
}

struct ProvinceDistribution: Identifiable, Hashable {
    var name: String
    var short: String
    var code: String
    var count: Int
    var up: Int
    var down: Int
    var flat: Int
    var pct: Double?
    var inflow: Double?
    var id: String { code }
}

struct CompanyDistribution {
    var total: Int = 0
    var provinces: [ProvinceDistribution] = []
}


struct ProvinceLeader: Identifiable, Hashable {
    var code: String
    var name: String
    var price: Double?
    var pct: Double?
    var inflow: Double?
    var industry: String
    var id: String { code }
}

struct ProvincePreference: Identifiable, Hashable {
    var name: String
    var short: String
    var code: String
    var count: Int
    var industries: [String]
    var leaders: [ProvinceLeader]
    var id: String { code }
}
