import SwiftUI

struct DecisionView: View {
    @EnvironmentObject private var store: AppStore
    @State private var forecast: MarketForecast?
    @State private var decisions: [StockDecision] = []
    @State private var loading = true
    @State private var decisionsLoading = true
    @State private var updated = ""
    @State private var sampleDate = ""
    @State private var sampleCount = 0
    @State private var loadError: String?
    @AppStorage("stockdesk.decision.scan") private var scanLimit = 8
    @Environment(\.horizontalSizeClass) private var hSize

    private var isPad: Bool { hSize == .regular }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if loading && forecast == nil {
                    ProgressView("正在计算市场预测与持仓判断…").padding(.top, 80)
                } else {
                    Picker("评估数量", selection: $scanLimit) {
                        ForEach([5, 8, 12, 20], id: \.self) { n in Text("\(n) 只").tag(n) }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: isPad ? 520 : .infinity)

                    if let f = forecast {
                        Card(title: "市场预测 · 未来 5 日", subtitle: "沪深300 · HMM 转移 × 状态历史收益") {
                            HStack(spacing: 10) {
                                metric("5 日估算", f.expected5d.map { ($0 * 100).pct(2) } ?? "--", color: moveColor(f.expected5d))
                                metric("上涨概率", f.probUp.map { ($0 * 100).fmt(0) + "%" } ?? "--")
                                metric("当前状态", f.state, color: Theme.stateColor(f.state))
                            }
                            Text(sampleLine)
                                .font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                            ForEach(Array(f.nextProbs.prefix(3)), id: \.0) { item in
                                HStack(spacing: 8) {
                                    Text(item.0).font(.system(size: 10)).foregroundStyle(Theme.textSub).frame(width: 42, alignment: .leading)
                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            Capsule().fill(Theme.cardSoft).frame(height: 6)
                                            Capsule().fill(Theme.stateColor(item.0))
                                                .frame(width: geo.size.width * max(0.02, min(1, item.1)), height: 6)
                                        }
                                    }
                                    .frame(height: 6)
                                    Text((item.1 * 100).pctLevel(1)).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim).frame(width: 42, alignment: .trailing)
                                }
                            }
                            Text(f.caveat).font(.system(size: 9.5)).foregroundStyle(Theme.textDim).lineSpacing(2)
                        }
                    } else {
                        Card(title: "市场预测暂时不可用", subtitle: "沪深300 日线样本不足") {
                            Text(loadError ?? "指数日线没有返回，稍后重试或下拉刷新。")
                                .font(.system(size: 10.5)).foregroundStyle(Theme.textDim).lineSpacing(2)
                            Button {
                                Task { await load() }
                            } label: {
                                Text("重新计算").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.accent)
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 2)
                        }
                    }

                    Card(title: "持仓好坏判断", subtitle: "\(decisions.count) 只 · 按评级好→中→差") {
                        if decisionsLoading && decisions.isEmpty {
                            HStack(spacing: 8) {
                                ProgressView().controlSize(.small)
                                Text("正在评估持仓与自选，最多 \(scanLimit) 只…")
                                    .font(.system(size: 10)).foregroundStyle(Theme.textDim)
                            }
                        } else if decisions.isEmpty {
                            Text("暂无持仓，或行情不足 30 个交易日。")
                                .font(.system(size: 11)).foregroundStyle(Theme.textDim)
                        }
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: isPad ? 2 : 1), spacing: 10) {
                            ForEach(decisions.sorted { rank($0.rating) < rank($1.rating) }) { d in
                                decisionTile(d)
                            }
                        }
                    }

                    Card(title: "怎么用", subtitle: "先看市场，再看持仓") {
                        Text("1. 预测为正、概率 >55%：按每日策略的中上仓位执行。\n2. 预测接近 0、概率 45%–55%：只做结构性机会。\n3. 预测为负、概率 <45%：降低仓位，保留现金。\n个股先看评级与买区，跌破止损先减/清；“好”不等于一定上涨。")
                            .font(.system(size: 10.5)).foregroundStyle(Theme.textSub).lineSpacing(3)
                    }
                    Text("v\(AppInfo.version) · 模型 v2.2.0" + (updated.isEmpty ? "" : " · " + updated))
                        .font(.system(size: 8, design: .monospaced)).foregroundStyle(Theme.textDim)
                }
            }
            .padding(14)
            .readableWidth()
        }
        .background(Theme.bg)
        .navigationTitle("交易决策")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: scanLimit) { await load() }
    }

    private var sampleLine: String {
        guard sampleCount > 0 else { return "样本来不及返回，先显示上一次结果。" }
        return "样本：沪深300 \(sampleCount) 根日线" + (sampleDate.isEmpty ? "" : " · 截至 \(sampleDate) 收盘")
    }

    private func decisionTile(_ d: StockDecision) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 7) {
                Text(d.name).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Theme.text)
                Text(d.code).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim)
                Spacer()
                Text(d.rating).font(.system(size: 10, weight: .bold)).foregroundStyle(ratingColor(d.rating))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(ratingColor(d.rating).opacity(0.12)).clipShape(Capsule())
                Text(d.action).font(.system(size: 10, weight: .medium)).foregroundStyle(Theme.textSub)
            }
            HStack(spacing: 12) {
                kv("买区", "\(d.buyLow.fmt())–\(d.buyHigh.fmt())")
                kv("止损", d.stop.fmt())
                kv("目标", d.target.fmt())
                kv("盈亏比", d.riskReward.fmt(1))
            }
            HStack(spacing: 5) {
                Text("层级").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                Text(d.tier).font(.system(size: 9.5, weight: .semibold)).foregroundStyle(Theme.accent)
                Text("·").foregroundStyle(Theme.textDim)
                Text(d.reasons.prefix(2).joined(separator: " · ")).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineLimit(2)
            }
            if let risk = d.risks.first {
                Text("⚠ " + risk).font(.system(size: 9.5)).foregroundStyle(Theme.accent)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.cardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 0.6))
    }

    private func load() async {
        loading = true
        decisionsLoading = true
        loadError = nil
        async let marketResult = timed(8, fallback: MarketState()) {
            await MarketService.shared.marketState()
        }
        async let klResult: [KLine] = timed(10, fallback: []) {
            (try? await MarketService.shared.klines("000300", limit: 420, adjust: "", secidOverride: "1.000300")) ?? []
        }
        let market = await marketResult
        let kl = await klResult
        let closes = kl.map(\.close)
        var hmm: HMMSnapshot?
        if closes.count > 60 {
            let rets = zip(closes.dropFirst(), closes).map { log($0 / $1) * 100 }
            hmm = QuantModels.hmm(rets)
        }
        forecast = DecisionEngine.forecast(hmm)
        if forecast == nil {
            loadError = "沪深300 日线样本不足（\(kl.count) 根），市场预测暂不可用。"
        }
        sampleDate = kl.last?.date ?? ""
        sampleCount = kl.count
        // Paint the market forecast immediately; the per-stock K-line scan can
        // take several seconds and must not hold the whole page behind a spinner.
        loading = false

        var out: [StockDecision] = []
        var targets: [(String, String, Double)] = []
        var seen = Set<String>()
        for p in store.summary.positions where !seen.contains(p.code) {
            seen.insert(p.code)
            targets.append((p.code, p.name, p.price ?? 0))
        }
        for w in store.watchlist where !seen.contains(w.code) {
            seen.insert(w.code)
            targets.append((w.code, w.name, store.watchQuotes[w.code]?.price ?? 0))
        }
        await withTaskGroup(of: StockDecision?.self) { group in
            for t in targets.prefix(scanLimit) {
                group.addTask {
                    await timed(12, fallback: StockDecision?.none) {
                        let rows = (try? await MarketService.shared.klines(t.0, limit: 160, adjust: "qfq")) ?? []
                        return DecisionEngine.decision(code: t.0, name: t.1,
                                                       price: t.2 > 0 ? t.2 : (rows.last?.close ?? 0),
                                                       rows: rows, marketLabel: market.label)
                    }
                }
            }
            for await d in group {
                if let d { out.append(d) }
            }
        }
        decisions = out
        decisionsLoading = false
        let df = DateFormatter(); df.dateFormat = "HH:mm:ss"
        updated = df.string(from: Date())
    }

    private func timed<T>(_ seconds: Double, fallback: T, _ operation: @escaping () async -> T) async -> T {
        await withTaskGroup(of: T.self) { group in
            group.addTask { await operation() }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return fallback
            }
            let value = await group.next() ?? fallback
            group.cancelAll()
            return value
        }
    }

    private func metric(_ label: String, _ value: String, color: Color = Theme.text) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            Text(value).font(.system(size: 18, weight: .bold, design: .rounded)).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func moveColor(_ v: Double?) -> Color {
        guard let v, abs(v) > 0.00005 else { return Theme.textSub }
        return v > 0 ? Theme.up : Theme.down
    }

    private func kv(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
            Text(value).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.text)
        }
    }

    private func rank(_ rating: String) -> Int {
        rating == "好" ? 0 : (rating == "中" ? 1 : 2)
    }

    private func ratingColor(_ rating: String) -> Color {
        rating == "好" ? Theme.up : (rating == "差" ? Theme.down : Theme.accent)
    }
}
