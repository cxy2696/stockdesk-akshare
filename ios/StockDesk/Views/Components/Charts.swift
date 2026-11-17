import SwiftUI
import Charts

/// Simple filled line sparkline.
struct LineSpark: View {
    let points: [Double]
    var height: CGFloat = 70
    var color: Color = Theme.accent
    var showArea = true

    var body: some View {
        let minV = points.min() ?? 0
        let maxV = points.max() ?? 1
        let span = max(maxV - minV, 0.0001)
        Chart {
            ForEach(Array(points.enumerated()), id: \.offset) { i, v in
                if showArea {
                    AreaMark(
                        x: .value("i", i),
                        yStart: .value("min", minV),
                        yEnd: .value("v", v)
                    )
                    .foregroundStyle(
                        LinearGradient(colors: [color.opacity(0.22), color.opacity(0.01)], startPoint: .top, endPoint: .bottom)
                    )
                    .interpolationMethod(.catmullRom)
                }
                LineMark(x: .value("i", i), y: .value("v", v))
                    .foregroundStyle(color)
                    .lineStyle(StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.catmullRom)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: minV - span * 0.15 ... maxV + span * 0.15)
        .frame(height: height)
    }
}

/// NAV vs benchmark cumulative-return chart.
struct NavLineChart: View {
    let series: [NavPoint]
    let benchmark: [BenchPoint]
    var height: CGFloat = 200

    var body: some View {
        let benchMap = Dictionary(uniqueKeysWithValues: benchmark.map { ($0.date, $0.bench) })
        var lastB = 1.0
        let benchVals: [Double] = series.map { p in
            if let b = benchMap[p.date] { lastB = b }
            return (lastB - 1) * 100
        }
        let navVals = series.map { ($0.nav - 1) * 100 }
        Chart {
            ForEach(Array(series.enumerated()), id: \.element.id) { i, p in
                LineMark(x: .value("日期", p.date.prefix(7) + "-" + String(p.date.suffix(2))),
                         y: .value("收益", navVals[i]))
                    .foregroundStyle(Theme.accent)
                    .lineStyle(StrokeStyle(lineWidth: 2))
                AreaMark(x: .value("日期", p.date.prefix(7) + "-" + String(p.date.suffix(2))),
                         y: .value("收益", navVals[i]))
                    .foregroundStyle(LinearGradient(colors: [Theme.accent.opacity(0.2), Theme.accent.opacity(0.01)], startPoint: .top, endPoint: .bottom))
            }
            ForEach(Array(series.enumerated()), id: \.element.id) { i, p in
                LineMark(x: .value("日期", p.date.prefix(7) + "-" + String(p.date.suffix(2))),
                         y: .value("基准", benchVals[i]))
                    .foregroundStyle(Theme.purple.opacity(0.8))
                    .lineStyle(StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisValueLabel().font(.system(size: 9)).foregroundStyle(Theme.textDim)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { v in
                AxisGridLine().foregroundStyle(Theme.borderSoft)
                AxisValueLabel {
                    if let d = v.as(Double.self) { Text(String(format: "%.0f%%", d)).font(.system(size: 9)).foregroundStyle(Theme.textDim) }
                }
            }
        }
        .frame(height: height)
    }
}

struct DrawdownChart: View {
    let points: [BenchPoint]
    var height: CGFloat = 140

    var body: some View {
        Chart {
            ForEach(points) { p in
                AreaMark(x: .value("日期", p.date), y: .value("回撤", p.bench * 100))
                    .foregroundStyle(LinearGradient(colors: [Theme.down.opacity(0.05), Theme.down.opacity(0.35)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("日期", p.date), y: .value("回撤", p.bench * 100))
                    .foregroundStyle(Theme.down)
                    .lineStyle(StrokeStyle(lineWidth: 1.4))
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { v in
                AxisGridLine().foregroundStyle(Theme.borderSoft)
                AxisValueLabel {
                    if let d = v.as(Double.self) { Text(String(format: "%.0f%%", d)).font(.system(size: 9)).foregroundStyle(Theme.textDim) }
                }
            }
        }
        .frame(height: height)
    }
}

struct EquityChart: View {
    let equity: [EquityPoint]
    let benchmark: [EquityPoint]
    var height: CGFloat = 180

    var body: some View {
        Chart {
            ForEach(equity) { p in
                LineMark(x: .value("日期", p.date), y: .value("策略", p.equity), series: .value("s", "策略"))
                    .foregroundStyle(Theme.accent)
                    .lineStyle(StrokeStyle(lineWidth: 2))
            }
            ForEach(benchmark) { p in
                LineMark(x: .value("日期", p.date), y: .value("持有", p.equity), series: .value("s", "持有"))
                    .foregroundStyle(Theme.purple.opacity(0.8))
                    .lineStyle(StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { v in
                AxisGridLine().foregroundStyle(Theme.borderSoft)
                AxisValueLabel {
                    if let d = v.as(Double.self) { Text(String(format: "%.0f万", d / 10000)).font(.system(size: 9)).foregroundStyle(Theme.textDim) }
                }
            }
        }
        .frame(height: height)
    }
}

/// Candlestick + moving averages + volume + MACD + TD Sequential (九转).
struct CandleChart: View {
    let rows: [KLine]
    var mas: [Int] = [5, 10, 20]
    var height: CGFloat = 240
    var showMACD = true
    var showTD = true
    var fib: [FibLevel] = []
    @State private var selected: Int? = nil

    private static func ema(_ values: [Double], _ n: Int) -> [Double] {
        guard !values.isEmpty else { return [] }
        let k = 2.0 / (Double(n) + 1)
        var out = [values[0]]
        for i in 1..<values.count { out.append(values[i] * k + out[i - 1] * (1 - k)) }
        return out
    }

    private static func td(_ closes: [Double]) -> (buy: [Int], sell: [Int]) {
        var buy = [Int](repeating: 0, count: closes.count)
        var sell = [Int](repeating: 0, count: closes.count)
        var bc = 0, sc = 0
        guard closes.count >= 5 else { return (buy, sell) }
        for i in 4..<closes.count {
            if closes[i] < closes[i - 4] { bc += 1; sc = 0 }
            else if closes[i] > closes[i - 4] { sc += 1; bc = 0 }
            else { bc = 0; sc = 0 }
            buy[i] = min(bc, 9)
            sell[i] = min(sc, 9)
            if bc >= 9 { bc = 0 }
            if sc >= 9 { sc = 0 }
        }
        return (buy, sell)
    }

    var body: some View {
        let shown = Array(rows.suffix(60))
        let maValues: [Int: [Double?]] = Dictionary(uniqueKeysWithValues: mas.map { ($0, BacktestEngine.sma(rows.map(\.close), $0)) })
        let offset = rows.count - shown.count
        let lo = (shown.map(\.low).min() ?? 0) * (showTD ? 0.97 : 0.995)
        let hi = (shown.map(\.high).max() ?? 1) * (showTD ? 1.035 : 1.005)
        let axisDates = axisLabels(shown)

        let closes = rows.map(\.close)
        let dif = zip(Self.ema(closes, 12), Self.ema(closes, 26)).map { $0 - $1 }
        let dea = Self.ema(dif, 9)
        let hist = zip(dif, dea).map { ($0 - $1) * 2 }
        let tdData = Self.td(closes)

        VStack(spacing: 2) {
            if let sel = selected, shown.indices.contains(sel) {
                let k = shown[sel]
                HStack(spacing: 8) {
                    Text(k.date).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textSub)
                    Text("开\(k.open.fmt(2))").foregroundStyle(Theme.text)
                    Text("高\(k.high.fmt(2))").foregroundStyle(Theme.up)
                    Text("低\(k.low.fmt(2))").foregroundStyle(Theme.down)
                    Text("收\(k.close.fmt(2))").foregroundStyle(Theme.text)
                    Text(k.pct.pct()).foregroundStyle(Theme.trendColor(k.pct))
                    Spacer()
                }
                .font(.system(size: 8.5))
                .padding(.vertical, 4)
                .padding(.horizontal, 4)
                .background(Theme.cardSoft)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            Chart {
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, k in
                    let x = k.date
                    RuleMark(x: .value("日期", x), yStart: .value("低", k.low), yEnd: .value("高", k.high))
                        .foregroundStyle(k.close >= k.open ? Theme.up : Theme.down)
                        .lineStyle(StrokeStyle(lineWidth: 1))
                    RectangleMark(
                        x: .value("日期", x),
                        yStart: .value("开", min(k.open, k.close)),
                        yEnd: .value("收", max(k.open, k.close)),
                        width: .fixed(5)
                    )
                    .foregroundStyle(k.close >= k.open ? Theme.up : Theme.down)
                }
                ForEach(mas, id: \.self) { n in
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, k in
                        if let val = maValues[n]?[offset + i] {
                            LineMark(x: .value("日期", k.date), y: .value("MA", val), series: .value("ma", "MA\(n)"))
                                .foregroundStyle(maColor(n))
                                .lineStyle(StrokeStyle(lineWidth: 1))
                        }
                    }
                }
                if let sel = selected, shown.indices.contains(sel) {
                    RuleMark(x: .value("选中", shown[sel].date))
                        .foregroundStyle(Theme.text.opacity(0.5))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 2]))
                }
                ForEach(fib) { l in
                    RuleMark(y: .value("黄金分割", l.price))
                        .foregroundStyle((l.kind == "压力" ? Theme.purple : Theme.amber).opacity(0.45))
                        .lineStyle(StrokeStyle(lineWidth: 0.8, dash: [3, 3]))
                }
                if showTD {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, k in
                        let b = tdData.buy[offset + i]
                        if b >= 9 {
                            PointMark(x: .value("日期", k.date), y: .value("低", k.low * 0.994))
                                .foregroundStyle(Theme.down.opacity(0.001))
                                .annotation(position: .bottom, spacing: 0) {
                                    Text("\(b)")
                                        .font(.system(size: 8.5, weight: .bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 14, height: 14)
                                        .background(Theme.down.opacity(b == 9 ? 1 : 0.65))
                                        .clipShape(Circle())
                                }
                        }
                        let s = tdData.sell[offset + i]
                        if s >= 9 {
                            PointMark(x: .value("日期", k.date), y: .value("高", k.high * 1.006))
                                .foregroundStyle(Theme.up.opacity(0.001))
                                .annotation(position: .top, spacing: 0) {
                                    Text("\(s)")
                                        .font(.system(size: 8.5, weight: .bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 14, height: 14)
                                        .background(Theme.up.opacity(s == 9 ? 1 : 0.65))
                                        .clipShape(Circle())
                                }
                        }
                    }
                }
            }
            .chartOverlay { proxy in
                GeometryReader { geo in
                    Rectangle().fill(Color.clear).contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { v in
                                    let plot = geo.size.width
                                    let idx = Int((v.location.x / max(plot, 1)) * CGFloat(shown.count))
                                    selected = min(max(idx, 0), shown.count - 1)
                                }
                                .onEnded { _ in selected = nil }
                        )
                }
            }
            .chartYScale(domain: lo...hi)
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { v in
                    AxisGridLine().foregroundStyle(Theme.borderSoft)
                    AxisValueLabel {
                        if let d = v.as(Double.self) { Text(String(format: "%.0f", d)).font(.system(size: 8.5)).foregroundStyle(Theme.textDim) }
                    }
                }
            }
            .frame(height: height)

            Chart {
                ForEach(shown) { k in
                    BarMark(x: .value("日期", k.date), y: .value("量", k.volume))
                        .foregroundStyle((k.close >= k.open ? Theme.up : Theme.down).opacity(0.55))
                }
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .frame(height: 40)

            if showMACD {
                Chart {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, k in
                        let v = hist[offset + i]
                        BarMark(x: .value("日期", k.date), y: .value("MACD", v))
                            .foregroundStyle((v >= 0 ? Theme.up : Theme.down).opacity(0.6))
                    }
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, k in
                        LineMark(x: .value("日期", k.date), y: .value("DIF", dif[offset + i]), series: .value("m", "DIF"))
                            .foregroundStyle(Theme.amber)
                            .lineStyle(StrokeStyle(lineWidth: 1))
                        LineMark(x: .value("日期", k.date), y: .value("DEA", dea[offset + i]), series: .value("m", "DEA"))
                            .foregroundStyle(Theme.purple)
                            .lineStyle(StrokeStyle(lineWidth: 1))
                    }
                }
                .chartXAxis(.hidden)
                .chartYAxis {
                    AxisMarks(position: .trailing, values: .automatic(desiredCount: 2)) { v in
                        AxisGridLine().foregroundStyle(Theme.borderSoft)
                        AxisValueLabel {
                            if let d = v.as(Double.self) { Text(String(format: "%.0f", d)).font(.system(size: 8)).foregroundStyle(Theme.textDim) }
                        }
                    }
                }
                .frame(height: 56)
                HStack(spacing: 10) {
                    Text("MACD(12,26,9)").foregroundStyle(Theme.textDim)
                    Text("DIF").foregroundStyle(Theme.amber)
                    Text("DEA").foregroundStyle(Theme.purple)
                    Spacer()
                }
                .font(.system(size: 8.5))
                .padding(.horizontal, 2)
            }

            HStack {
                Text(String(axisDates.first?.suffix(5) ?? ""))
                Spacer()
                Text(String(axisDates.dropFirst().first?.suffix(5) ?? ""))
                Spacer()
                Text(String(axisDates.last?.suffix(5) ?? ""))
            }
            .font(.system(size: 8.5))
            .foregroundStyle(Theme.textDim)
            .padding(.horizontal, 2)
        }
    }
}

private func maColor(_ n: Int) -> Color {
    switch n {
    case 5: return Theme.amber
    case 10: return Theme.cyan
    case 20: return Theme.purple
    default: return Theme.textDim
    }
}

private func axisLabels(_ rows: [KLine]) -> [String] {
    guard let first = rows.first?.date, let last = rows.last?.date, rows.count > 2 else {
        return rows.map(\.date)
    }
    return [first, rows[rows.count / 2].date, last]
}

/// Volume-by-price chip distribution with current price / support / resistance.
struct ChipChart: View {
    let chip: ChipResult
    var height: CGFloat = 210

    var body: some View {
        Canvas { ctx, size in
            let span = max(chip.range.upperBound - chip.range.lowerBound, 0.001)
            let maxW = max(chip.buckets.map(\.weight).max() ?? 1, 0.001)
            let pad: CGFloat = 10
            let plotH = max(size.height - pad * 2, 1)
            let barH = max(1.0, plotH / CGFloat(chip.buckets.count) - 0.6)
            let plotW = size.width - 46

            for b in chip.buckets {
                let y = pad + (1 - CGFloat((b.price - chip.range.lowerBound) / span)) * plotH
                let w = CGFloat(b.weight / maxW) * plotW
                let rect = CGRect(x: 0, y: y - barH / 2, width: max(w, 0.6), height: barH)
                let color = b.price <= chip.current ? Theme.up.opacity(0.55) : Theme.down.opacity(0.45)
                ctx.fill(Path(rect), with: .color(color))
            }

            func yFor(_ price: Double) -> CGFloat {
                pad + (1 - CGFloat((price - chip.range.lowerBound) / span)) * plotH
            }
            func line(_ price: Double, _ color: Color, _ dash: [CGFloat]) {
                var p = Path()
                let y = yFor(price)
                p.move(to: CGPoint(x: 0, y: y))
                p.addLine(to: CGPoint(x: size.width - 44, y: y))
                ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: 1, dash: dash))
            }
            line(chip.current, Theme.text.opacity(0.7), [3, 2])
            line(chip.support, Theme.down.opacity(0.7), [2, 3])
            line(chip.resistance, Theme.up.opacity(0.7), [2, 3])

            // price ticks on the right
            for i in 0...4 {
                let price = chip.range.lowerBound + span * Double(i) / 4
                let y = yFor(price)
                ctx.draw(
                    Text(String(format: "%.0f", price))
                        .font(.system(size: 8.5))
                        .foregroundColor(Theme.textDim),
                    at: CGPoint(x: size.width - 20, y: y),
                    anchor: .center
                )
            }
        }
        .frame(height: height)
    }
}


