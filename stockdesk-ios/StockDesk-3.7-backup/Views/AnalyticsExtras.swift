import SwiftUI
import Charts

struct ReviewSummaryView: View {
    let r: AnalyticsResult
    let market: MarketState?
    let advice: PositionAdvice?

    var body: some View {
        Card(title: "复盘总结", subtitle: "基于账户与市场数据自动生成") {
            VStack(alignment: .leading, spacing: 8) {
                Text(headline).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.text)
                ForEach(points, id: \.self) { p in
                    Text("· " + p).font(.system(size: 10.5)).foregroundStyle(Theme.textSub)
                }
                HStack(spacing: 0) {
                    benchCell("沪深300", r.metrics.benchmarkReturn, r.metrics.excessReturn)
                    Rectangle().fill(Theme.border).frame(width: 1, height: 30)
                    benchCell("上证指数", r.shReturn, r.shExcess)
                }
                .padding(.top, 4)
                Text(adviceText).font(.system(size: 10.5)).foregroundStyle(Theme.text)
                    .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.accent.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
    }

    private func benchCell(_ name: String, _ ret: Double, _ excess: Double) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(name).font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
            Text(ret.pct()).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(Theme.trendColor(ret))
            Text("超额 " + excess.signed(1) + "pp").font(.system(size: 9)).foregroundStyle(Theme.trendColor(excess))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 6)
    }

    private var headline: String {
        var parts: [String] = []
        parts.append("账户累计 \(r.metrics.totalReturn.pct())")
        parts.append("相对沪深300 \(r.metrics.excessReturn >= 0 ? "跑赢" : "跑输") \(String(format: "%.2f", abs(r.metrics.excessReturn))) 个百分点")
        if r.shReturn != 0 {
            parts.append("相对上证 \(r.shExcess >= 0 ? "跑赢" : "跑输") \(String(format: "%.2f", abs(r.shExcess))) 个百分点")
        }
        return parts.joined(separator: "，") + "。"
    }

    private var points: [String] {
        var p: [String] = []
        p.append("收益：年化 \(r.metrics.annualReturn.pct())，最大回撤 \(r.metrics.maxDrawdown.pct())，夏普 \(String(format: "%.2f", r.metrics.sharpe))。")
        if r.stats.closedCount > 0 {
            p.append("交易：平仓 \(r.stats.closedCount) 笔，胜率 \(r.stats.winRate.map { String(format: "%.1f%%", $0) } ?? "--")，盈亏比 \(r.stats.profitFactor.map { String(format: "%.2f", $0) } ?? "--")。")
        }
        if let top = r.byStock.max(by: { $0.pnl < $1.pnl }), let worst = r.byStock.min(by: { $0.pnl < $1.pnl }) {
            p.append("个股：\(top.name) 贡献 \(top.pnl.signed()) 元，\(worst.name) \(worst.pnl.signed()) 元。")
        }
        if let m = market {
            p.append("市场：\(m.label)（温度 \(m.score)），\(m.reasons.first ?? "")。")
        }
        return p
    }

    private var adviceText: String {
        guard let a = advice else { return "" }
        if a.action == "减仓" {
            return "策略整体跑赢基准，但当前仓位高于建议区间，建议降至 \(a.targetLow)%–\(a.targetHigh)%，优先控制单票集中度。"
        } else if a.action == "加仓" {
            return "当前仓位低于建议区间，可分批提升至 \(a.targetLow)%–\(a.targetHigh)%，优先选择趋势与量价共振的标的。"
        }
        return "维持 \(a.targetLow)%–\(a.targetHigh)% 仓位，单票不超过 \(a.singleCap)%，保留现金应对波动。"
    }
}

struct AdviceCardView: View {
    let a: PositionAdvice
    var body: some View {
        Card(title: "仓位管理推荐", subtitle: "市场温度 × 账户回撤 × 持仓集中度") {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(a.action).font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(a.action == "减仓" ? Theme.up : (a.action == "加仓" ? Theme.down : Theme.accent))
                    Text("· \(a.urgency)").font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                    Spacer()
                    Text("温度 \(a.score)").font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                }
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("当前仓位").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                        Text(String(format: "%.1f%%", a.currentPct)).font(.system(size: 20, weight: .bold, design: .rounded))
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.cardSoft).frame(height: 9)
                            Capsule().fill(Theme.accent.opacity(0.25))
                                .frame(width: geo.size.width * CGFloat(a.targetHigh - a.targetLow) / 100, height: 9)
                                .offset(x: geo.size.width * CGFloat(a.targetLow) / 100)
                            Capsule().fill(Theme.text).frame(width: 3, height: 16)
                                .offset(x: min(geo.size.width - 3, max(0, geo.size.width * CGFloat(a.currentPct) / 100)))
                        }
                        .frame(height: 16)
                    }
                    .frame(height: 16)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("建议仓位").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                        Text("\(a.targetLow)%–\(a.targetHigh)%").font(.system(size: 15, weight: .bold, design: .rounded))
                    }
                }
                HStack(spacing: 14) {
                    metric("单票上限", "\(a.singleCap)%")
                    metric("现金下限", "\(a.cashFloor)%")
                    metric("缺口", String(format: "%+.1fpp", a.gap), Theme.trendColor(a.gap))
                }
                ForEach(a.warnings, id: \.self) { w in
                    Text("⚠ " + w).font(.system(size: 10)).foregroundStyle(Theme.up)
                }
                ForEach(Array(a.actions.enumerated()), id: \.offset) { i, x in
                    Text("\(i + 1). " + x).font(.system(size: 10.5)).foregroundStyle(Theme.text)
                }
            }
        }
    }

    private func metric(_ k: String, _ v: String, _ c: Color = Theme.text) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(c)
        }
    }
}

struct NavTrendView: View {
    let series: [NavPoint]
    var body: some View {
        let nav = series.map { ($0.nav - 1) * 100 }
        let ma20 = moving(nav, 20)
        let ma60 = moving(nav, 60)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                legend("净值", Theme.accent)
                legend("MA20", Theme.amber)
                legend("MA60", Theme.purple)
            }
            Chart {
                ForEach(Array(nav.enumerated()), id: \.offset) { i, v in
                    LineMark(x: .value("i", i), y: .value("v", v), series: .value("s", "nav"))
                        .foregroundStyle(Theme.accent)
                        .lineStyle(StrokeStyle(lineWidth: 1.6))
                }
                ForEach(Array(ma20.enumerated()), id: \.offset) { i, v in
                    if let v {
                        LineMark(x: .value("i", i), y: .value("v", v), series: .value("s", "ma20"))
                            .foregroundStyle(Theme.amber)
                            .lineStyle(StrokeStyle(lineWidth: 1))
                    }
                }
                ForEach(Array(ma60.enumerated()), id: \.offset) { i, v in
                    if let v {
                        LineMark(x: .value("i", i), y: .value("v", v), series: .value("s", "ma60"))
                            .foregroundStyle(Theme.purple)
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    }
                }
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { v in
                    AxisGridLine().foregroundStyle(Theme.borderSoft)
                    AxisValueLabel {
                        if let d = v.as(Double.self) { Text(String(format: "%.0f%%", d)).font(.system(size: 9)).foregroundStyle(Theme.textDim) }
                    }
                }
            }
            .frame(height: 180)
        }
    }

    private func moving(_ v: [Double], _ n: Int) -> [Double?] {
        (0..<v.count).map { i in
            guard i >= n - 1 else { return nil }
            return v[(i - n + 1)...i].reduce(0, +) / Double(n)
        }
    }

    private func legend(_ t: String, _ c: Color) -> some View {
        HStack(spacing: 4) {
            Capsule().fill(c).frame(width: 12, height: 3)
            Text(t).font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
        }
    }
}

struct MarketVerdictView: View {
    let s: MarketState
    var body: some View {
        Card(title: "行情判断", subtitle: "指数趋势 + 涨跌家数 + 涨停") {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle().stroke(Theme.cardSoft, lineWidth: 8).frame(width: 70, height: 70)
                        Circle().trim(from: 0, to: CGFloat(s.score) / 100)
                            .stroke(Theme.trendColor(Double(s.score - 50)), style: StrokeStyle(lineWidth: 8, lineCap: .round))
                            .frame(width: 70, height: 70).rotationEffect(.degrees(-90))
                        Text("\(s.score)").font(.system(size: 20, weight: .bold, design: .rounded))
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s.label).font(.system(size: 17, weight: .bold)).foregroundStyle(Theme.trendColor(Double(s.score - 50)))
                        HStack(spacing: 4) {
                            ForEach(s.indices.prefix(5)) { i in
                                Text("\(i.short) \(i.trend)").font(.system(size: 8))
                                    .padding(.horizontal, 4).padding(.vertical, 1)
                                    .background(Theme.cardSoft).clipShape(Capsule())
                            }
                        }
                    }
                }
                ForEach(s.reasons, id: \.self) { r in
                    Text("· " + r).font(.system(size: 10.5)).foregroundStyle(Theme.textSub)
                }
            }
        }
    }
}

struct MarketSituationView: View {
    let s: MarketState
    var body: some View {
        Card(title: "市场情况", subtitle: "全市场 \(s.breadth.total) 只") {
            VStack(alignment: .leading, spacing: 8) {
                let total = max(s.breadth.up + s.breadth.down + s.breadth.flat, 1)
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        Rectangle().fill(Theme.up).frame(width: geo.size.width * CGFloat(s.breadth.up) / CGFloat(total))
                        Rectangle().fill(Theme.textDim.opacity(0.3)).frame(width: geo.size.width * CGFloat(s.breadth.flat) / CGFloat(total))
                        Rectangle().fill(Theme.down).frame(width: geo.size.width * CGFloat(s.breadth.down) / CGFloat(total))
                    }
                }
                .frame(height: 8).clipShape(Capsule())
                HStack {
                    Text("涨 \(s.breadth.up)").foregroundStyle(Theme.up)
                    Spacer()
                    Text("平 \(s.breadth.flat)").foregroundStyle(Theme.textDim)
                    Spacer()
                    Text("跌 \(s.breadth.down)").foregroundStyle(Theme.down)
                }.font(.system(size: 9.5))
                HStack(spacing: 14) {
                    Text("涨停 \(s.breadth.limitUp)").font(.system(size: 10)).foregroundStyle(Theme.up)
                    Text("跌停 \(s.breadth.limitDown)").font(.system(size: 10)).foregroundStyle(Theme.down)
                    Text("成交额 \(shortMoney(s.turnover))").font(.system(size: 10)).foregroundStyle(Theme.textSub)
                }
                HStack(alignment: .top, spacing: 10) {
                    sectorCol("领涨行业", s.top)
                    sectorCol("靠后行业", s.bottom)
                }
            }
        }
    }

    private func sectorCol(_ title: String, _ boards: [Board]) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            ForEach(boards.prefix(4)) { b in
                HStack {
                    Text(b.name).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineLimit(1)
                    Spacer()
                    Text(b.pct.pct()).font(.system(size: 9.5, weight: .semibold)).foregroundStyle(Theme.trendColor(b.pct))
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
