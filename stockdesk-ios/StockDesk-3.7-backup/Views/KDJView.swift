import SwiftUI
import Charts

private struct KTarget: Identifiable {
    let id: String
    let name: String
    let kind: String
    let code: String
    let board: Bool
}

private struct KPoint: Identifiable {
    let id = UUID()
    let i: Int
    let date: String
    let close: Double
    let j: Double
}

private struct KMetrics {
    var k: Double = 0
    var d: Double = 0
    var rsv: Double = 0
    var ma5: Double? = nil
    var ma20: Double? = nil
    var volumeRatio: Double? = nil
    var jChange: Double = 0
    var cross: String = "--"
    var trend: String = "--"
}

private struct KPeriod {
    var points: [KPoint] = []
    var zone: ClosedRange<Double>? = nil
    var j: Double? = nil
    var alert: String = "正常"
    var kValue: Double? = nil
    var dValue: Double? = nil
    var rsv: Double? = nil
    var ma5: Double? = nil
    var ma20: Double? = nil
    var volumeRatio: Double? = nil
    var jChange: Double? = nil
    var cross: String = "--"
    var trend: String = "--"
    var metrics: KMetrics? = nil
    var error: String = ""
}

private let targets: [KTarget] = [
    .init(id: "semi", name: "半导体", kind: "行业", code: "BK1036", board: true),
    .init(id: "comm", name: "通信设备", kind: "行业", code: "BK0448", board: true),
    .init(id: "sse", name: "上证指数", kind: "指数", code: "000001", board: false),
    .init(id: "szse", name: "深证成指", kind: "指数", code: "399001", board: false),
    .init(id: "chinext", name: "创业板指", kind: "指数", code: "399006", board: false),
    .init(id: "hs300", name: "沪深300", kind: "指数", code: "000300", board: false),
    .init(id: "csi500", name: "中证500", kind: "指数", code: "000905", board: false),
    .init(id: "csi1000", name: "中证1000", kind: "指数", code: "000852", board: false),
    .init(id: "star50", name: "科创50", kind: "指数", code: "000688", board: false),
    .init(id: "sse50", name: "上证50", kind: "指数", code: "000016", board: false),
    .init(id: "bse50", name: "北证50", kind: "指数", code: "899050", board: false),
]

private func compute(_ rows: [KLine]) -> ([KPoint], ClosedRange<Double>?, Double?, KMetrics?) {
    guard !rows.isEmpty else { return ([], nil, nil, nil) }
    var k = 50.0, d = 50.0
    var rsvLast = 50.0
    var points: [KPoint] = []
    for (i, r) in rows.enumerated() {
        let w = rows[max(0, i - 8)...i]
        let hi = w.map(\.high).max() ?? r.high
        let lo = w.map(\.low).min() ?? r.low
        let rsv = hi <= lo ? 50 : (r.close - lo) / (hi - lo) * 100
        rsvLast = rsv
        k = (2 * k + rsv) / 3
        d = (2 * d + k) / 3
        points.append(KPoint(i: i, date: r.date, close: r.close, j: 3 * k - 2 * d))
    }
    // Approximate central zone: overlap of the recent swing envelope.
    let recent = Array(rows.suffix(60))
    let hi = recent.map(\.high).sorted()[max(0, recent.count * 2 / 3 - 1)]
    let lo = recent.map(\.low).sorted()[min(recent.count - 1, recent.count / 3)]
    let zone: ClosedRange<Double>? = hi > lo ? lo...hi : nil
    let closes = rows.map(\.close)
    let ma5 = closes.count >= 5 ? closes.suffix(5).reduce(0, +) / 5 : nil
    let ma20 = closes.count >= 20 ? closes.suffix(20).reduce(0, +) / 20 : nil
    let vols = rows.map(\.volume)
    let avgVol = vols.count >= 20 ? vols.suffix(20).reduce(0, +) / 20 : nil
    let vr = avgVol.map { $0 > 0 ? (vols.last ?? 0) / $0 : 0 }
    let prevJ = points.count > 1 ? points[points.count - 2].j : (points.last?.j ?? 0)
    let curJ = points.last?.j ?? 0
    let cross: String = prevJ <= 118 && curJ > 118 ? "上穿超买" : prevJ >= 118 && curJ < 118 ? "回落超买" : prevJ >= -14 && curJ < -14 ? "下穿超卖" : prevJ <= -14 && curJ > -14 ? "回升超卖" : (curJ >= 118 || curJ <= -14) ? "极值持续" : "区间内"
    let trend: String = (ma5 != nil && ma20 != nil && (closes.last ?? 0) > ma5! && ma5! > ma20!) ? "多头" : (ma5 != nil && ma20 != nil && (closes.last ?? 0) < ma5! && ma5! < ma20!) ? "空头" : "震荡"
    return (points, zone, points.last?.j, KMetrics(k: k, d: d, rsv: rsvLast, ma5: ma5, ma20: ma20, volumeRatio: vr, jChange: curJ - prevJ, cross: cross, trend: trend))
}

@MainActor
private final class KDJStore: ObservableObject {
    @Published var selected = "semi"
    @Published var p5 = [String: KPeriod]()
    @Published var p30 = [String: KPeriod]()
    @Published var updated = ""
    @Published var loading = false

    func load(force: Bool = false) async {
        loading = true
        defer { loading = false }
        let targets = targets.filter { $0.id == selected }
        guard let t = targets.first else { return }
        async let a = fetch(t, period: "5m")
        async let b = fetch(t, period: "30m")
        let (five, thirty) = await (a, b)
        p5[t.id] = five
        p30[t.id] = thirty
        updated = Date().formatted(.dateTime.hour().minute().second())
    }

    private func fetch(_ t: KTarget, period: String) async -> KPeriod {
        do {
            let rows = t.board
                ? try await MarketService.shared.boardKlines(t.code, period: period, limit: 180)
                : try await MarketService.shared.indexKlines(t.code, period: period, limit: 180)
            let (points, zone, j, metrics) = compute(rows)
            let alert = j.map { $0 >= 118 ? "超买" : $0 <= -14 ? "超卖" : "正常" } ?? "正常"
            return KPeriod(points: points, zone: zone, j: j, alert: alert, metrics: metrics, error: rows.isEmpty ? "暂无行情" : "")
        } catch {
            return KPeriod(error: error.localizedDescription)
        }
    }
}

struct KDJView: View {
    @StateObject private var store = KDJStore()

    private var target: KTarget { targets.first { $0.id == store.selected } ?? targets[0] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("KDJ 极值预警")
                    .font(.system(size: 26, weight: .bold, design: .serif))
                Text("上轨 J ≥ 118 超买，下轨 J ≤ -14 超卖。5 分钟偏即时，30 分钟偏质量；只做提示，不是交易指令。")
                    .font(.system(size: 11)).foregroundStyle(Theme.textSub)

                HStack(spacing: 10) {
                    Label("J ≥ 118", systemImage: "arrow.up")
                    Label("J ≤ -14", systemImage: "arrow.down")
                    Spacer()
                    Button { Task { await store.load(force: true) } } label: {
                        Label("刷新", systemImage: "arrow.clockwise")
                    }
                    .font(.system(size: 10))
                }
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(Theme.accent)

                Text("LIVE · 每 60 秒自动刷新 \(store.updated.isEmpty ? "" : "· 更新 \(store.updated)")")
                    .font(.system(size: 8, design: .monospaced))
                    .foregroundStyle(Theme.textDim)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(targets) { t in
                            Button {
                                store.selected = t.id
                                Task { await store.load() }
                            } label: {
                                VStack(spacing: 2) {
                                    Text(t.name).font(.system(size: 10, weight: .semibold))
                                    Text(t.kind).font(.system(size: 7)).opacity(0.6)
                                }
                                .padding(.horizontal, 9).padding(.vertical, 6)
                                .background(store.selected == t.id ? Theme.accent : Theme.cardSoft)
                                .foregroundStyle(store.selected == t.id ? .black : Theme.text)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                periodCard("5 分钟", store.p5[target.id] ?? KPeriod(), period: "5m")
                periodCard("30 分钟", store.p30[target.id] ?? KPeriod(), period: "30m")

                VStack(alignment: .leading, spacing: 4) {
                    Text("参考操作建议 · 非交易指令")
                        .font(.system(size: 11, weight: .semibold))
                    Text("J ≥ 118 超买区 → 参考减仓 / 卖出；J ≤ -14 超卖区 → 参考买入 / 低吸。极值可以持续，不追涨杀跌。")
                        .font(.system(size: 10)).foregroundStyle(Theme.textSub)
                    Text("中枢为最近摆动高低点重叠区的近似值，不是严格缠论中枢。")
                        .font(.system(size: 9)).foregroundStyle(Theme.textDim)
                }
                .padding(12)
                .background(Theme.cardSoft)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("KDJ 预警")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.load()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                await store.load()
            }
        }
    }

    private func periodCard(_ title: String, _ p: KPeriod, period: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.system(size: 12, weight: .semibold))
                Text("J \(p.j.map { String(format: "%.2f", $0) } ?? "--")")
                    .font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textSub)
                Spacer()
                Text(p.alert)
                    .font(.system(size: 8, weight: .semibold))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(p.alert == "超买" ? Color.red.opacity(0.15) : p.alert == "超卖" ? Color.green.opacity(0.15) : Theme.cardSoft)
                    .foregroundStyle(p.alert == "超买" ? .red : p.alert == "超卖" ? .green : Theme.textSub)
                    .clipShape(Capsule())
            }
            if p.points.isEmpty {
                Text(p.error.isEmpty ? "该周期暂无行情" : p.error)
                    .font(.system(size: 10)).foregroundStyle(Theme.textDim)
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                Chart {
                    if let zone = p.zone {
                        RectangleMark(yStart: .value("low", zone.lowerBound), yEnd: .value("high", zone.upperBound))
                            .foregroundStyle(Color.yellow.opacity(0.10))
                    }
                    ForEach(p.points) { pt in
                        LineMark(x: .value("i", pt.i), y: .value("close", pt.close))
                            .foregroundStyle(Theme.accent)
                            .lineStyle(StrokeStyle(lineWidth: 1.2))
                    }
                }
                .chartXAxis(.hidden)
                .chartYAxis { AxisMarks(position: .leading) { _ in AxisValueLabel().font(.system(size: 7)) } }
                .frame(height: 130)

                Chart {
                    RuleMark(y: .value("upper", 118)).foregroundStyle(.red.opacity(0.4)).lineStyle(StrokeStyle(dash: [3]))
                    RuleMark(y: .value("lower", -14)).foregroundStyle(.green.opacity(0.4)).lineStyle(StrokeStyle(dash: [3]))
                    ForEach(p.points) { pt in
                        LineMark(x: .value("i", pt.i), y: .value("j", pt.j))
                            .foregroundStyle(.yellow)
                            .lineStyle(StrokeStyle(lineWidth: 1))
                    }
                }
                .chartYScale(domain: -40...140)
                .chartXAxis(.hidden)
                .chartYAxis { AxisMarks(position: .leading) { _ in AxisValueLabel().font(.system(size: 6)) } }
                .frame(height: 82)
            }
            if let m = p.metrics {
                HStack(spacing: 7) {
                    Text("K \(m.k, specifier: "%.1f")"); Text("D \(m.d, specifier: "%.1f")"); Text("RSV \(m.rsv, specifier: "%.0f")")
                    Text("MA20 \(m.ma20.map { String(format: "%.2f", $0) } ?? "--")")
                    Text("量比 \(m.volumeRatio.map { String(format: "%.2f", $0) } ?? "--")")
                }
                .font(.system(size: 7.5, design: .monospaced))
                .foregroundStyle(Theme.textSub)
                HStack(spacing: 8) {
                    Text("J变化 \(m.jChange > 0 ? "+" : "")\(m.jChange, specifier: "%.1f")")
                    Text(m.cross); Text(m.trend)
                }
                .font(.system(size: 7.5, design: .monospaced))
                .foregroundStyle(Theme.textDim)
            }
            Text("东方财富分钟线 · \(p.points.count) 根")
                .font(.system(size: 7, design: .monospaced)).foregroundStyle(Theme.textDim)
        }
        .padding(10)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
