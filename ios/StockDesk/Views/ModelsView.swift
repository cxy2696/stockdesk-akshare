import SwiftUI

struct StockPlan: Identifiable {
    var code: String
    var name: String
    var price: Double
    var weight: Double
    var targetPct: Double
    var floatPct: Double?
    var action: String
    var shares: Int
    var amount: Double
    var buyZone: String
    var sellZone: String
    var stop: String
    var reason: String
    var id: String { code }
}

struct IndexHMM: Identifiable {
    var name: String
    var snapshot: HMMSnapshot
    var asOf: String
    var samples: Int
    var id: String { name }
}

struct IndexTD: Identifiable {
    var name: String
    var buy: Int
    var sell: Int
    var label: String
    var id: String { name }
}

struct ModelsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var hmms: [IndexHMM] = []
    @State private var selectedName = "沪深300"
    @State private var perc: PercolationSnapshot?
    @State private var tds: [IndexTD] = []
    @State private var loading = true
    @State private var refreshing = false
    @State private var refreshedAt = ""
    @State private var asOf = ""
    @State private var spotAsOf = ""
    @State private var loadError: String?
    @State private var spotError: String?

    private static let indexDefs: [(name: String, code: String, secid: String)] = [
        ("上证", "000001", "1.000001"),
        ("沪深300", "000300", "1.000300"),
        ("创业板", "399006", "0.399006"),
        ("深证", "399001", "0.399001"),
        ("科创50", "000688", "1.000688"),
    ]

    private struct IndexLoad {
        var name: String
        var hmm: HMMSnapshot
        var td: IndexTD
        var asOf: String
        var samples: Int
    }

    private var selectedHMM: IndexHMM? {
        hmms.first { $0.name == selectedName } ?? hmms.first
    }

    private var hmm: HMMSnapshot? { selectedHMM?.snapshot }

    private var regime: String {
        guard let p = perc else { return "等待" }
        return p.giantOccupied >= p.threshold ? "扩散" : p.giantOccupied >= p.threshold - 0.08 ? "临界" : "分裂"
    }

    private var composite: CompositeScore? {
        QuantModels.composite(
            hmm: hmm,
            percolation: perc,
            tdBuys: tds.filter { $0.buy >= 7 }.count,
            tdSells: tds.filter { $0.sell >= 7 }.count,
            tdTotal: tds.count,
            tdCompletion: tds.isEmpty
                ? nil
                : Double(tds.reduce(0) { $0 + max($1.buy, $1.sell) }) / Double(tds.count * 9),
            hmmLabel: "HMM · " + (selectedHMM?.name ?? "指数")
        )
    }

    private var stance: String { composite?.stance ?? "等待数据" }
    private var positionText: String { composite?.position ?? "--" }

    /// Mid-point of the composite position range.  The old version used the
    /// upper bound, so a “0%–15%” defence stance planned for 15% and the
    /// per-stock targets silently contradicted the displayed range.
    private var targetRange: (low: Double, high: Double) {
        switch stance {
        case "进攻": return (60, 80)
        case "均衡偏多": return (45, 65)
        case "中性": return (30, 50)
        case "均衡偏防守": return (15, 30)
        case "防守": return (0, 15)
        default: return (0, 0)
        }
    }

    private var targetPositionPct: Double { (targetRange.low + targetRange.high) / 2 }

    private var stockPlans: [StockPlan] {
        let positions = store.summary.positions
        guard !positions.isEmpty, composite != nil else { return [] }
        let total = max(store.summary.total, 1)
        let cash = max(store.summary.cash, 0)
        let target = min(0.18, targetPositionPct / 100 / Double(max(positions.count, 1)))
        let defensive = stance == "防守" || stance == "均衡偏防守"

        return positions.map { p in
            let price = p.price ?? 0
            let weight = (p.weight ?? 0) / 100
            let held = max(p.qty, 0)
            guard price > 0 else {
                return StockPlan(code: p.code, name: p.name, price: 0, weight: p.weight ?? 0,
                                 targetPct: target * 100, floatPct: p.floatPct,
                                 action: "数据不足", shares: 0, amount: 0,
                                 buyZone: "--", sellZone: "--", stop: "--",
                                 reason: "行情源暂时没有现价，等价格回来再算")
            }

            let deltaValue = (target - weight) * total
            var shares = Int((abs(deltaValue) / price / 100).rounded()) * 100
            var action = "持有"
            var reason = "仓位与目标匹配，继续观察"

            if (p.floatPct ?? 0) <= -15 && (p.pct ?? 0) < 0 {
                action = "止损"
                shares = held
                reason = "浮亏超过 15% 且当日继续走弱，先清仓控制回撤"
            } else if weight > 0.22 {
                action = "减仓"
                reason = "单票权重 \(weight.pctLevel(1))，超过 22% 的集中度上限"
            } else if defensive && weight > max(target, 0.08) {
                action = "减仓"
                reason = "模型处于防守状态，先把风险暴露降下来"
            } else if target - weight > 0.02 && (p.pct ?? 0) > -3 && !defensive {
                action = "加仓"
                reason = "总仓位低于目标，个股当天没有破位"
            } else if deltaValue < 0 {
                action = "减仓"
                reason = "权重大于目标仓位，回到模型目标区间"
            }

            if action == "减仓" {
                shares = min(shares, held)
                if shares == 0 {
                    if held > 0 && (held < 100 || weight - target > 0.02) {
                        shares = held
                        reason = "目标仓位低于当前持仓，清掉零股"
                    } else {
                        action = "持有"
                        reason = "与目标仓位相差不到 1 手，先不动"
                    }
                }
            }
            if action == "加仓" {
                let affordable = Int((cash / price / 100).rounded(.down)) * 100
                shares = min(shares, max(affordable, 0))
                if shares == 0 {
                    action = "持有"
                    reason = "目标仓位折算不到 1 手，先不动"
                }
            }
            if action == "持有" { shares = 0 }

            let signed = action == "减仓" || action == "止损" ? -shares : action == "加仓" ? shares : 0
            let amount = abs(Double(signed) * price)
            return StockPlan(
                code: p.code, name: p.name, price: price, weight: weight * 100,
                targetPct: target * 100, floatPct: p.floatPct, action: action,
                shares: signed, amount: amount,
                buyZone: "\( (price * 0.97).fmt())–\(price.fmt())",
                sellZone: "\( (price * 1.05).fmt())–\( (price * 1.08).fmt())",
                stop: (price * 0.92).fmt(),
                reason: reason
            )
        }
    }

    private var buyAmount: Double {
        stockPlans.filter { $0.shares > 0 }.reduce(0) { $0 + $1.amount }
    }

    private var sellAmount: Double {
        stockPlans.filter { $0.shares < 0 }.reduce(0) { $0 + $1.amount }
    }

    private var styleText: String {
        guard composite != nil else { return "模型数据未就绪，暂不给出方向。" }
        guard let state = hmm?.state else { return "HMM 暂不可用，先按全市场广度与九转结构控制节奏。" }
        if state == "强势" && regime == "扩散" { return "趋势跟随，优先超临界行业龙头，回踩 MA20 低吸。" }
        if state == "弱势" && regime == "分裂" { return "防守，红利/现金为主，不做弱势行业补涨。" }
        if state == "强势" { return "只做最强 2–3 个行业，降低非龙头暴露。" }
        if regime == "扩散" { return "行业轮动低吸，买强不买弱。" }
        return "控制频率，等待状态与广度同时转强。"
    }

    private var errorText: String? {
        let parts = [loadError, spotError].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                header
                statusBar

                if let errorText {
                    errorBanner(errorText)
                }

                if !hmms.isEmpty {
                    indexStrip
                }

                if loading && hmms.isEmpty && perc == nil {
                    loadingCard
                } else {
                    compositeCard
                    strategyCard
                    stockPlanCard
                    hmmCard
                    percolationCard
                    tdCard
                    industryCard
                    criticalCard
                    mappingCard
                    notesCard
                }
            }
            .padding(14)
            .readableWidth()
        }
        .background(Theme.bg)
        .navigationTitle("量化模型")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loadModels() }
        .task {
            await loadModels()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 300_000_000_000)
                if Task.isCancelled { break }
                await loadModels()
            }
        }
    }

    // MARK: - Header / status

    private var header: some View {
        Text("HMM 定仓位，渗流定行业，九转定买卖点。三个模型各管一段，都不预测点位。")
            .font(.system(size: 9.5))
            .foregroundStyle(Theme.textDim)
            .lineSpacing(2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var statusBar: some View {
        HStack(alignment: .center, spacing: 6) {
            Text("模型 v2.2.0 · " + (asOf.isEmpty ? "样本日期 --" : "样本截至 \(asOf) 收盘") + " · " + (refreshedAt.isEmpty ? "刷新 --" : "刷新 \(refreshedAt)"))
                .lineLimit(2)
                .minimumScaleFactor(0.75)
            Spacer(minLength: 4)
            if refreshing {
                ProgressView().controlSize(.mini)
            }
            Button {
                Task { await loadModels() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 24, height: 24)
                    .background(Theme.cardSoft)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(Theme.border, lineWidth: 0.7))
            }
            .buttonStyle(.plain)
            .disabled(refreshing)
            .accessibilityLabel("刷新模型")
        }
        .font(.system(size: 8.5, design: .monospaced))
        .foregroundStyle(Theme.textDim)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var indexStrip: some View {
        VStack(spacing: 4) {
            HStack(spacing: 5) {
                ForEach(hmms) { item in
                    Button {
                        selectedName = item.name
                    } label: {
                        VStack(spacing: 2) {
                            Text(item.name)
                                .font(.system(size: 8.5))
                                .foregroundStyle(item.name == selectedName ? Theme.accent : Theme.textDim)
                                .lineLimit(1)
                            Text(item.snapshot.state)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(Theme.stateColor(item.snapshot.state))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(item.name == selectedName ? Theme.accent.opacity(0.08) : Theme.card)
                        .overlay(Rectangle().strokeBorder(item.name == selectedName ? Theme.accent.opacity(0.5) : Theme.border, lineWidth: 0.6))
                    }
                    .buttonStyle(.plain)
                }
            }
            let counts = Dictionary(grouping: hmms, by: { $0.snapshot.state }).mapValues(\.count)
            Text("\(hmms.count)/\(Self.indexDefs.count) 个核心指数：强势 \(counts["强势"] ?? 0) · 震荡 \(counts["震荡"] ?? 0) · 弱势 \(counts["弱势"] ?? 0)")
                .font(.system(size: 9))
                .foregroundStyle(Theme.textSub)
        }
    }

    private var loadingCard: some View {
        Card(title: "量化模型加载中", subtitle: "\(Self.indexDefs.count) 个指数日线 + 全市场快照") {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("首次计算通常需要 5–15 秒；失败时保留上一次结果。")
                    .font(.system(size: 10)).foregroundStyle(Theme.textDim)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 9)).foregroundStyle(Theme.up).padding(.top, 2)
            Text(text)
                .font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                .lineSpacing(1.6)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button("重试") { Task { await loadModels() } }
                .font(.system(size: 9.5, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .buttonStyle(.plain)
                .disabled(refreshing)
        }
        .padding(9)
        .background(Theme.up.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Theme.up.opacity(0.18), lineWidth: 0.8))
    }

    // MARK: - Cards

    @ViewBuilder
    private var compositeCard: some View {
        if let c = composite {
            Card(title: "综合评分", subtitle: "HMM 42% · 渗流 38% · 九转 20% · 透明加权") {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(c.score)")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.accent)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(c.stance).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.text)
                        Text("一致度 \(c.agreement)/3 · 数据质量 \(c.quality) · \(c.missing.isEmpty ? "三项齐全" : "缺 " + c.missing.joined(separator: "/"))")
                            .font(.system(size: 9)).foregroundStyle(Theme.textDim)
                    }
                    Spacer()
                }
                ForEach(c.components) { comp in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 7) {
                            Text(comp.label)
                                .font(.system(size: 9.5))
                                .foregroundStyle(comp.available ? Theme.textSub : Theme.textDim)
                                .frame(width: 96, alignment: .leading)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Theme.borderSoft).frame(height: 5)
                                    Capsule().fill(comp.available ? Theme.accent : Theme.textDim)
                                        .frame(width: geo.size.width * CGFloat(max(0, min(100, comp.score))) / 100, height: 5)
                                }
                            }.frame(height: 5)
                            Text("\(comp.score)")
                                .font(.system(size: 9.5, design: .monospaced))
                                .foregroundStyle(comp.available ? Theme.text : Theme.textDim)
                                .frame(width: 26, alignment: .trailing)
                        }
                        Text(comp.detail)
                            .font(.system(size: 8))
                            .foregroundStyle(Theme.textDim)
                            .lineLimit(1)
                            .padding(.leading, 103)
                    }
                    .padding(.vertical, 2)
                }
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(c.drivers.prefix(4).enumerated()), id: \.offset) { _, d in
                        Text("· " + d).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineLimit(2)
                    }
                    if !c.missing.isEmpty {
                        Text("缺失项按中性 50 计入，不把缺数据当成看空或看多。")
                            .font(.system(size: 8.5)).foregroundStyle(Theme.textDim).padding(.top, 2)
                    }
                }.padding(.top, 3)
            }
        } else {
            Card(title: "综合评分", subtitle: "等待可用模型") {
                Text("指数状态、全市场广度或九转至少有一项返回后才会生成综合评分。可点上方刷新重试。")
                    .font(.system(size: 10)).foregroundStyle(Theme.textDim).lineSpacing(2)
            }
        }
    }

    private var strategyCard: some View {
        Card(title: "模型组合策略", subtitle: "HMM 决定仓位 · 渗流决定行业与标的") {
            if composite == nil {
                Text("模型数据未就绪，暂不给出仓位与行业建议。")
                    .font(.system(size: 10.5)).foregroundStyle(Theme.textDim).lineSpacing(2)
            } else {
                HStack(spacing: 12) {
                    strategyKV("策略", stance)
                    strategyKV("建议仓位", positionText)
                    strategyKV("组合", (hmm?.state ?? "--") + " × " + (perc == nil ? "广度缺失" : regime))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("选股方向：" + styleText).font(.system(size: 10)).foregroundStyle(Theme.textSub).lineSpacing(1.8)
                    if let p = perc, !p.industries.isEmpty {
                        let strong = p.industries.sorted { $0.ratio > $1.ratio }.prefix(3)
                        Text("优先行业：" + strong.map { "\($0.name) \((($0.ratio * 100)).pctLevel(0))" }.joined(separator: " · "))
                            .font(.system(size: 10)).foregroundStyle(Theme.textSub)
                    } else {
                        Text("优先行业：行情源未返回行业分类，先按指数状态与全市场广度执行。")
                            .font(.system(size: 10)).foregroundStyle(Theme.textDim)
                    }
                    Text("买入：状态概率同向、行业广度 ≥ 60%、最大簇未收缩、个股站上 MA20。").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                    Text("卖出：弱势概率上升、最大簇跌破阈值、行业广度回落或个股跌破 MA20/支撑。").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                }.padding(.top, 6)
            }
        }
    }

    private var stockPlanCard: some View {
        Card(title: "个股仓位建议",
             subtitle: composite == nil ? "等待模型结论" : "结合持仓与模型状态 · 目标总仓位 \(targetPositionPct.pctLevel(0))") {
            if composite == nil {
                Text("等待模型结论后再计算个股仓位。")
                    .font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
            } else if store.summary.positions.isEmpty {
                Text("当前无持仓，等待建仓信号").font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
            } else if stockPlans.isEmpty {
                Text("持仓行情暂不可用，稍后刷新重试。").font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
            } else {
                ForEach(stockPlans) { p in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(p.name).font(.system(size: 11.5, weight: .medium)).foregroundStyle(Theme.text)
                            Text(p.code).font(.system(size: 8.5, design: .monospaced)).foregroundStyle(Theme.textDim)
                            Spacer(minLength: 4)
                            Text(p.action)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(actionColor(p.action))
                            Text(shareText(p))
                                .font(.system(size: 9.5, weight: .medium, design: .monospaced))
                                .foregroundStyle(p.action == "数据不足" ? Theme.textDim : Theme.text)
                        }
                        Text("现价 \(p.price.fmt()) · 权重 \(p.weight.pctLevel(1)) · 目标 \(p.targetPct.pctLevel(1))")
                            .font(.system(size: 8.5)).foregroundStyle(Theme.textSub)
                        Text("买区 \(p.buyZone) · 卖区 \(p.sellZone) · 止损 \(p.stop)")
                            .font(.system(size: 8.3)).foregroundStyle(Theme.textDim)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Text(p.reason).font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                    }.padding(.vertical, 4)
                    SoftDivider()
                }
                Text(planFooter)
                    .font(.system(size: 8))
                    .foregroundStyle(Theme.textDim)
                    .lineSpacing(1.5)
                    .padding(.top, 3)
            }
        }
    }

    private var planFooter: String {
        let tail = "股数按 100 股取整，执行前请核对可用现金与涨跌停限制。"
        if buyAmount > 0 && sellAmount > 0 {
            return "计划买入 \(buyAmount.fmt(0)) 元、卖出 \(sellAmount.fmt(0)) 元；\(tail)"
        }
        if sellAmount > 0 { return "计划卖出 \(sellAmount.fmt(0)) 元；\(tail)" }
        if buyAmount > 0 { return "计划买入 \(buyAmount.fmt(0)) 元；\(tail)" }
        return "当前无需调仓；\(tail)"
    }

    private func shareText(_ p: StockPlan) -> String {
        if p.action == "持有" || p.action == "数据不足" || p.shares == 0 { return "0 股" }
        return (p.shares > 0 ? "+" : "") + "\(p.shares) 股"
    }

    private func actionColor(_ action: String) -> Color {
        switch action {
        case "加仓": return Theme.up
        case "减仓", "止损": return Theme.down
        case "数据不足": return Theme.textDim
        default: return Theme.accent
        }
    }

    private var hmmCard: some View {
        Card(title: "隐马尔可夫 · \(selectedHMM?.name ?? "市场状态")",
             subtitle: "日收益 · 3 状态 HMM" + (selectedHMM.map { " · \($0.samples) 根" } ?? "")) {
            if let h = hmm {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("当前状态").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                        Text(h.state).font(.system(size: 24, weight: .bold)).foregroundStyle(Theme.stateColor(h.state))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        Text("预计持续 \(h.expectedDays.fmt(1)) 个交易日").font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                        if let next = nextState(h) {
                            Text("下一状态 \(next.0) \((next.1 * 100).pctLevel(1))").font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                        }
                    }
                }
                ForEach(Array(h.probabilities.enumerated()), id: \.element.label) { _, p in
                    HStack(spacing: 6) {
                        Text(p.label).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).frame(width: 30, alignment: .leading)
                        GeometryReader { g in
                            Capsule().fill(Theme.borderSoft).frame(height: 6)
                                .overlay(alignment: .leading) {
                                    Capsule().fill(Theme.stateColor(p.label))
                                        .frame(width: g.size.width * max(0, min(1, p.p)), height: 6)
                                }
                        }.frame(height: 6)
                        Text((p.p * 100).pctLevel(1)).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textSub).frame(width: 46, alignment: .trailing)
                    }
                }
                HStack(spacing: 1) {
                    ForEach(Array(h.history.enumerated()), id: \.offset) { _, v in
                        let idx = min(max(v, 0), 2)
                        Rectangle().fill(Theme.stateColor(QuantModels.labels[idx])).frame(maxWidth: .infinity).frame(height: 10)
                    }
                }.padding(.top, 6)
                Text("近 60 个交易日状态（左旧右新）").font(.system(size: 8)).foregroundStyle(Theme.textDim)
                Text(h.signal).font(.system(size: 10)).foregroundStyle(Theme.textSub).padding(.top, 2)
                ForEach(h.interpretation, id: \.self) { line in
                    Text("· " + line).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineSpacing(1.7)
                }
                if h.transition.count == 3 {
                    Text("状态转移矩阵 · 行当前 / 列下一交易日").font(.system(size: 9)).foregroundStyle(Theme.textDim).padding(.top, 6)
                    HStack(spacing: 4) {
                        Text("").frame(width: 34)
                        ForEach(QuantModels.labels, id: \.self) { label in
                            Text(label).font(.system(size: 8)).foregroundStyle(Theme.textDim).frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                    ForEach(0..<3, id: \.self) { i in
                        HStack(spacing: 4) {
                            Text(QuantModels.labels[i]).font(.system(size: 9)).foregroundStyle(Theme.stateColor(QuantModels.labels[i])).frame(width: 34, alignment: .leading)
                            ForEach(0..<3, id: \.self) { j in
                                Text(h.transition[i].count == 3 ? (h.transition[i][j] * 100).pctLevel(1) : "--")
                                    .font(.system(size: 8.5, design: .monospaced))
                                    .foregroundStyle(i == j ? Theme.text : Theme.textSub)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                }
                if let selectedHMM, !selectedHMM.asOf.isEmpty {
                    Text("样本截至 \(selectedHMM.asOf) 收盘").font(.system(size: 8)).foregroundStyle(Theme.textDim).padding(.top, 4)
                }
            } else if loading || refreshing {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 10)
            } else {
                Text("指数日线未返回，HMM 暂不可用；可点上方刷新重试。")
                    .font(.system(size: 10)).foregroundStyle(Theme.textDim)
            }
        }
    }

    private func nextState(_ h: HMMSnapshot) -> (String, Double)? {
        guard h.transition.count == 3,
              let row = QuantModels.labels.firstIndex(of: h.state),
              row < h.transition.count,
              h.transition[row].count == 3 else { return nil }
        let values = h.transition[row]
        guard let j = values.indices.max(by: { values[$0] < values[$1] }) else { return nil }
        return (QuantModels.labels[j], values[j])
    }

    private var percolationCard: some View {
        Card(title: "渗流模型 · 广度扩散", subtitle: "上涨格点 · 4 邻接簇 · 阈值 " + (perc.map { ($0.threshold * 100).pctLevel(2) } ?? "59.27%")) {
            if let p = perc {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("当前结构").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                        Text(p.status)
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(regimeColor(p.giantOccupied, p.threshold))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        Text("上涨占比 " + (p.ratio * 100).pctLevel(1)).font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                        Text("最大簇/上涨 " + (p.giantOccupied * 100).pctLevel(1)).font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                    }
                }
                Canvas { ctx, size in
                    let cell = min(size.width, size.height) / CGFloat(max(p.cols, 1))
                    for i in 0..<p.cells.count {
                        let r = i / max(p.cols, 1), c = i % max(p.cols, 1)
                        let color: Color = p.cells[i] == 2 ? Theme.accent : (p.cells[i] == 1 ? Theme.accent.opacity(0.35) : Color(hex: 0x18231d))
                        ctx.fill(Path(CGRect(x: CGFloat(c) * cell, y: CGFloat(r) * cell, width: cell - 0.6, height: cell - 0.6)), with: .color(color))
                    }
                }
                .aspectRatio(1, contentMode: .fit)
                .frame(maxHeight: 250)
                HStack(spacing: 12) {
                    legend(Theme.accent, "最大连通簇")
                    legend(Theme.accent.opacity(0.35), "其他上涨")
                    legend(Color(hex: 0x18231d), "平盘 / 下跌")
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    kv("上涨家数", "\(p.up) / \(p.total)")
                    kv("最大连通簇", "\(p.largest) 只")
                    kv("连通簇数量", "\(p.clusters) 个")
                    kv("阈值", (p.threshold * 100).pctLevel(2))
                }
                HStack(spacing: 6) {
                    Text("随机重排最大簇").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                    Spacer()
                    Text("均值 \((p.robustnessMean * 100).pctLevel(1)) · 区间 \((p.robustnessMin * 100).pctLevel(1))–\((p.robustnessMax * 100).pctLevel(1))")
                        .font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textSub)
                }
                Text(p.note).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineSpacing(1.8).padding(.top, 2)
                if !spotAsOf.isEmpty {
                    Text("广度为 \(spotAsOf) 抓取 · 有效样本 \(p.total) 只").font(.system(size: 8)).foregroundStyle(Theme.textDim).padding(.top, 2)
                }
            } else if loading || refreshing {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 10)
            } else {
                Text(spotError ?? "全市场行情未返回，渗流暂不可用；可点上方刷新重试。")
                    .font(.system(size: 10)).foregroundStyle(Theme.textDim)
            }
        }
    }

    private func regimeColor(_ giant: Double, _ threshold: Double) -> Color {
        giant >= threshold ? Theme.up : giant >= threshold - 0.08 ? Theme.amber : Theme.down
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 4) {
            Rectangle().fill(color).frame(width: 8, height: 8)
            Text(text).font(.system(size: 8)).foregroundStyle(Theme.textDim)
        }
    }

    private var tdCard: some View {
        Card(title: "九转模型分析", subtitle: "TD Sequential · 建仓 9 根 / 倒计时 13 根") {
            if tds.isEmpty {
                Text("指数日线样本不足，九转暂不可用；可点上方刷新重试。")
                    .font(.system(size: 10)).foregroundStyle(Theme.textDim)
            } else {
                let buys = tds.filter { $0.buy >= 7 }.count
                let sells = tds.filter { $0.sell >= 7 }.count
                Text("当前 \(buys) 个指数进入买入结构（≥7/9）、\(sells) 个进入卖出结构（≥7/9）。9 转只说明这一段动能累了，不是反转保证；要等放量收阳或跌破 5 日线来确认。")
                    .font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineSpacing(2)
                ForEach(tds) { t in
                    HStack(spacing: 8) {
                        Text(t.name).font(.system(size: 10)).frame(width: 52, alignment: .leading)
                        Text("买 \(t.buy)/9").font(.system(size: 9, design: .monospaced)).foregroundStyle(t.buy > 0 ? Theme.up : Theme.textDim)
                        Text("卖 \(t.sell)/9").font(.system(size: 9, design: .monospaced)).foregroundStyle(t.sell > 0 ? Theme.down : Theme.textDim)
                        Spacer()
                        Text(t.label).font(.system(size: 9)).foregroundStyle(t.buy >= 9 ? Theme.up : (t.sell >= 9 ? Theme.down : Theme.textDim))
                    }
                    .padding(.vertical, 3)
                    SoftDivider()
                }
                Text("怎么用：买结构完成先观察，不抢下跌中的刀；卖结构完成且跌破 5 日线，先减一半。倒计时 13 比 9 更严格，出现时更需要成交量配合。")
                    .font(.system(size: 9)).foregroundStyle(Theme.textDim).lineSpacing(1.8).padding(.top, 3)
                if !asOf.isEmpty {
                    Text("样本截至 \(asOf) 收盘").font(.system(size: 8)).foregroundStyle(Theme.textDim)
                }
            }
        }
    }

    private var industryCard: some View {
        Card(title: "细分行业渗流", subtitle: "按行业分组 · 上涨占比与最大簇 · Top 20") {
            if let p = perc {
                if p.industries.isEmpty {
                    Text("当前行情源未返回行业分类；全市场渗流结果仍有效。")
                        .font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                } else {
                    ForEach(p.industries) { x in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(x.name).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.text)
                                Text("\(x.count) 只").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                                Spacer()
                                Text(x.status).font(.system(size: 8.5)).foregroundStyle(regimeColor(x.giant, p.threshold))
                            }
                            HStack {
                                Text("上涨 \((x.ratio * 100).pctLevel(1)) · 最大簇 \((x.giant * 100).pctLevel(1))")
                                    .font(.system(size: 9)).foregroundStyle(Theme.textSub)
                                Spacer()
                                Text("领涨 \(x.leader) \(x.leaderPct.pct())").font(.system(size: 9)).foregroundStyle(Theme.textDim)
                            }
                        }.padding(.vertical, 5)
                        SoftDivider()
                    }
                    Text("行业分组股票数较少，临界值仅作为扩散强弱参考，不能与全市场格点直接比较。").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                }
            } else {
                Text("等待全市场行情返回后再做行业分组。").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
            }
        }
    }

    private var criticalCard: some View {
        Card(title: "行业临界与关键标的", subtitle: "临界行业与领涨公司") {
            if let p = perc, !p.industries.isEmpty {
                let crit = p.industries.filter { abs($0.ratio - p.threshold) <= 0.08 }
                let shown = crit.isEmpty ? Array(p.industries.sorted { abs($0.ratio - p.threshold) < abs($1.ratio - p.threshold) }.prefix(5)) : crit
                Text("阈值 " + (perc.map { ($0.threshold * 100).pctLevel(2) } ?? "59.27%") + " · " + (crit.isEmpty ? "当前无正式临界行业，以下为最接近阈值的行业" : "临界行业 \(crit.count) 个"))
                    .font(.system(size: 9)).foregroundStyle(crit.isEmpty ? Theme.textDim : Theme.up)
                ForEach(shown) { x in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(x.name).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.text)
                            Text(x.status).font(.system(size: 8)).foregroundStyle(regimeColor(x.giant, p.threshold))
                            Spacer()
                            Text("上涨 \((x.ratio * 100).pctLevel(1)) · 最大簇 \((x.giant * 100).pctLevel(1))")
                                .font(.system(size: 8.5, design: .monospaced)).foregroundStyle(Theme.textSub)
                        }
                        Text("关键标的：\(x.leader) \(x.leaderPct.pct())").font(.system(size: 9)).foregroundStyle(Theme.textDim)
                    }.padding(.vertical, 4)
                    SoftDivider()
                }
                let leaders = shown.reduce(into: [IndustryPercolation]()) { acc, x in
                    if !acc.contains(where: { $0.leader == x.leader }) { acc.append(x) }
                }
                if !leaders.isEmpty {
                    Text("关键标的汇总").font(.system(size: 9)).foregroundStyle(Theme.textDim).padding(.top, 4)
                    ForEach(leaders) { x in
                        HStack {
                            Text(x.leader).font(.system(size: 9.5)).foregroundStyle(Theme.text)
                            Spacer()
                            Text(x.leaderPct.pct()).font(.system(size: 9.5, design: .monospaced)).foregroundStyle(Theme.trendColor(x.leaderPct))
                        }
                    }
                }
            } else {
                Text("行业分类未返回，暂不能计算临界行业与关键标的。")
                    .font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
            }
        }
    }

    private var mappingCard: some View {
        Card(title: "策略映射与买卖时机", subtitle: "把模型状态翻译成可执行规则") {
            VStack(alignment: .leading, spacing: 8) {
                Text("HMM 市场状态").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.accent)
                Text("强势：趋势延续，持有龙头，回踩 MA20 加仓；震荡：降低频率，区间低吸高抛；弱势：控制仓位，反弹减仓，等待弱势概率下降。")
                    .font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineSpacing(2)
                Text("渗流结构").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.accent).padding(.top, 2)
                Text("扩散：广度连通，可在超临界行业找龙头；临界：方向未定，降低仓位；分裂：上涨孤立，只做最强主线。")
                    .font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineSpacing(2)
                Text("组合与纪律").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.accent).padding(.top, 2)
                Text("强势+扩散：进攻 60%–80%；强势/震荡+临界：40%–60%；弱势+分裂：0%–20%。单行业 ≤30%，单票 ≤15%；模型切换先减仓再确认。")
                    .font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineSpacing(2)
            }
        }
    }

    private var notesCard: some View {
        Card(title: "模型说明", subtitle: "使用边界") {
            VStack(alignment: .leading, spacing: 5) {
                Text("HMM 用日收益的三状态高斯隐马尔可夫模型识别市场状态，输出后验概率与状态转移，状态切换存在滞后。渗流模型把上涨股票映射到二维格点并寻找最大连通簇，用于观察上涨广度是扩散还是分裂，阈值采用二维方格点渗流临界值 0.5927。为什么选择最大邻接连通簇：上涨家数只描述广度，最大簇衡量上涨是否连成一片，对应渗流理论的 giant component；簇越大扩散越真实，簇越小上涨越孤立。两者均为统计描述，不构成投资建议。")
                    .font(.system(size: 10)).foregroundStyle(Theme.textSub).lineSpacing(3)
                Text("本页为本地计算，App v\(AppInfo.version) · 模型口径 v2.2.0；样本日期见各卡片页脚。")
                    .font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
            }
        }
    }

    // MARK: - Shared small views

    private func strategyKV(_ k: String, _ v: String) -> some View {
        VStack(spacing: 2) {
            Text(k).font(.system(size: 8)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.accent).lineLimit(1).minimumScaleFactor(0.7)
        }.frame(maxWidth: .infinity)
    }

    private func kv(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            Spacer()
            Text(v).font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundStyle(Theme.text)
        }
        .padding(7).background(Theme.cardSoft).clipShape(RoundedRectangle(cornerRadius: 3))
    }

    // MARK: - Loading

    private func loadModels() async {
        guard !refreshing else { return }
        refreshing = true
        if hmms.isEmpty && perc == nil { loading = true }
        loadError = nil

        var loaded: [IndexLoad] = []
        var failedIndices = 0
        await withTaskGroup(of: IndexLoad?.self) { group in
            for def in Self.indexDefs {
                group.addTask {
                    guard let kl = try? await MarketService.shared.klines(def.code, limit: 420, adjust: "", secidOverride: def.secid),
                          kl.count > 61 else { return nil }
                    let closes = kl.map(\.close)
                    let rets = (1..<closes.count).map { log(closes[$0] / closes[$0 - 1]) * 100 }
                    guard let snapshot = QuantModels.hmm(rets) else { return nil }
                    let td = PatternEngine.td(closes)
                    let b = min(td.buy.last ?? 0, 9)
                    let sk = min(td.sell.last ?? 0, 9)
                    let label = b >= 9 ? "买入九转 9/9" : (sk >= 9 ? "卖出九转 9/9" : (b >= 7 ? "下跌结构 \(b)/9" : (sk >= 7 ? "上涨结构 \(sk)/9" : "无有效结构")))
                    return IndexLoad(
                        name: def.name,
                        hmm: snapshot,
                        td: IndexTD(name: def.name, buy: b, sell: sk, label: label),
                        asOf: kl.last?.date ?? "",
                        samples: closes.count
                    )
                }
            }
            for await item in group {
                if let item { loaded.append(item) } else { failedIndices += 1 }
            }
        }

        let order = Dictionary(uniqueKeysWithValues: Self.indexDefs.enumerated().map { ($1.name, $0) })
        loaded.sort { (order[$0.name] ?? 0) < (order[$1.name] ?? 0) }

        if loaded.isEmpty {
            loadError = hmms.isEmpty ? "5 个指数日线均未返回，检查网络后重试。" : "指数刷新失败，保留上一次结果。"
        } else {
            hmms = loaded.map { IndexHMM(name: $0.name, snapshot: $0.hmm, asOf: $0.asOf, samples: $0.samples) }
            tds = loaded.map(\.td)
            if !loaded.contains(where: { $0.name == selectedName }) {
                selectedName = loaded.first?.name ?? selectedName
            }
            asOf = loaded.compactMap { $0.asOf.isEmpty ? nil : $0.asOf }.max() ?? asOf
            refreshedAt = Date().formatted(.dateTime.hour().minute().second())
            if failedIndices > 0 {
                loadError = "\(failedIndices) 个指数本次未更新，已显示其余 \(loaded.count) 个。"
            }
        }

        var rows: [Quote] = []
        var spotDate = ""
        var usedStaleSpot = false
        if let snapshot = try? await MarketService.shared.spot(ttl: 300) {
            rows = snapshot.rows
            spotDate = snapshot.date
        }
        if rows.count <= 100, store.spotRows.count > 100 {
            rows = store.spotRows
            spotDate = store.spotDate
            usedStaleSpot = true
        }
        if let p = QuantModels.percolation(rows) {
            perc = p
            if !spotDate.isEmpty { spotAsOf = spotDate }
            spotError = usedStaleSpot ? "全市场快照刷新失败，暂用上一次结果。" : nil
            if refreshedAt.isEmpty {
                refreshedAt = Date().formatted(.dateTime.hour().minute().second())
            }
        } else {
            spotError = rows.isEmpty ? "全市场行情未返回，渗流结果无法更新。" : "全市场有效样本不足 100 只，渗流结果无法更新。"
            if perc == nil, !spotDate.isEmpty { spotAsOf = spotDate }
        }

        loading = false
        refreshing = false
    }
}
