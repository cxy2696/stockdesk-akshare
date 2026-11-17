import Foundation
import SwiftUI

struct ChipBucket: Identifiable {
    var price: Double
    var weight: Double
    var id: Double { price }
}

struct ChipResult {
    var current: Double
    var avgCost: Double
    var profitRatio: Double
    var concentration: Double
    var costLow: Double
    var costHigh: Double
    var support: Double
    var resistance: Double
    var peak: Double
    var score: Int
    var verdict: String
    var up: Bool
    var comments: [String]
    var buckets: [ChipBucket]
    var range: ClosedRange<Double>
}

/// Volume-by-price distribution with 45-day half-life decay, computed on-device.
enum ChipEngine {
    static func compute(_ input: [KLine], days: Int = 120, buckets: Int = 56) -> ChipResult? {
        let rows = Array(input.sorted { $0.date < $1.date }.suffix(days))
        guard rows.count >= 20, let current = rows.last?.close else { return nil }
        let lows = rows.map(\.low).filter { $0 > 0 }
        let highs = rows.map(\.high).filter { $0 > 0 }
        guard let lo = lows.min(), let hi = highs.max(), hi > lo else { return nil }
        let step = (hi - lo) / Double(buckets)
        var dist = [Double](repeating: 0, count: buckets)
        let centers = (0..<buckets).map { lo + step * (Double($0) + 0.5) }
        let n = rows.count
        for (i, r) in rows.enumerated() {
            let age = n - 1 - i
            let w = pow(0.5, Double(age) / 45.0)
            var b0 = Int((r.low - lo) / step)
            var b1 = Int((r.high - lo) / step)
            b0 = max(0, min(buckets - 1, b0))
            b1 = max(0, min(buckets - 1, b1))
            let span = Double(b1 - b0 + 1)
            let per = r.volume * w / span
            for b in b0...b1 { dist[b] += per }
        }
        let total = dist.reduce(0, +)
        guard total > 0 else { return nil }
        let avgCost = zip(centers, dist).reduce(0) { $0 + $1.0 * $1.1 } / total
        let profit = zip(centers, dist).reduce(0) { $0 + ($1.0 <= current ? $1.1 : 0) } / total * 100

        let order = dist.indices.sorted { dist[$0] < dist[$1] }
        var keep = Set<Int>()
        var acc = 0.0
        for i in order {
            keep.insert(i)
            acc += dist[i]
            if acc / total >= 0.9 { break }
        }
        let costLow = keep.map { centers[$0] }.min() ?? lo
        let costHigh = keep.map { centers[$0] }.max() ?? hi
        let conc = (costHigh - costLow) / ((costHigh + costLow) / 2) * 100

        let below = (0..<buckets).filter { centers[$0] <= current }
        let above = (0..<buckets).filter { centers[$0] > current }
        let support = below.max { dist[$0] < dist[$1] }.map { centers[$0] } ?? lo
        let resistance = above.max { dist[$0] < dist[$1] }.map { centers[$0] } ?? hi
        let peak = centers[dist.indices.max { dist[$0] < dist[$1] } ?? 0]

        func vwap(_ k: Int) -> Double? {
            let r = Array(rows.suffix(k))
            let vol = r.reduce(0) { $0 + $1.volume }
            guard vol > 0 else { return nil }
            return r.reduce(0) { $0 + (($1.high + $1.low + $1.close) / 3) * $1.volume } / vol
        }
        let migration = ((vwap(60) ?? avgCost) / (vwap(rows.count) ?? avgCost) - 1) * 100
        let premium = (current / avgCost - 1) * 100
        let concLabel = conc < 12 ? "高度集中" : (conc < 22 ? "较为集中" : "相对分散")
        var score = 50 + (profit - 50) * 0.35 + max(-20, min(20, premium * 1.2)) + max(-12, min(12, migration * 1.5))
        score = max(0, min(100, score.rounded()))
        let up = score >= 62
        let verdict = score >= 62 ? "筹码偏多" : (score >= 42 ? "筹码中性" : "筹码偏空")

        var comments: [String] = []
        comments.append("获利比例 \(profit.fmt(1))%，" + (profit >= 70 ? "获利盘占优，注意高位兑现压力。" : (profit <= 30 ? "套牢盘较重，反弹会遇到解套抛压。" : "获利盘与套牢盘相对均衡。")))
        comments.append("现价较平均成本 \(premium.signed(1))%，持仓者整体\(premium >= 0 ? "浮盈" : "浮亏")。")
        comments.append("90% 筹码位于 \(costLow.fmt(2)) ~ \(costHigh.fmt(2)) 元，集中度 \(conc.fmt(1))%（\(concLabel)）。")
        comments.append("最近压力 \(resistance.fmt(2)) 元（\(((resistance / current - 1) * 100).signed(1))%），最近支撑 \(support.fmt(2)) 元（\(((support / current - 1) * 100).signed(1))%）。")
        comments.append("筹码峰在 \(peak.fmt(2)) 元，现价位于峰\(current >= peak ? "上方，峰位可视为回踩支撑。" : "下方，峰位是反弹需要消化的套牢区。")")
        comments.append("近 60 日筹码成本\(migration > 1 ? "上移" : (migration < -1 ? "下移" : "基本平稳")) \(migration.signed(1))%。")

        let bucketsOut = zip(centers, dist).map { ChipBucket(price: $0.0, weight: $0.1) }
        return ChipResult(
            current: current, avgCost: avgCost, profitRatio: profit, concentration: conc,
            costLow: costLow, costHigh: costHigh, support: support, resistance: resistance,
            peak: peak, score: Int(score), verdict: verdict, up: up, comments: comments,
            buckets: bucketsOut, range: lo...hi
        )
    }
}
