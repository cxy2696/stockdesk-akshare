import SwiftUI

struct StockPlan: Identifiable {
    var code: String
    var name: String
    var price: Double
    var weight: Double
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
    @State private var sel = 1
    @State private var perc: PercolationSnapshot?
    @State private var tds: [IndexTD] = []
    @State private var loading = true
    @State private var lastUpdated = ""
    @State private var loadError: String?

    private var hmm: HMMSnapshot? { hmms.indices.contains(sel) ? hmms[sel].snapshot : hmms.first?.snapshot }

    private let colors: [Color] = [Theme.down, Theme.accent, Theme.up]

    private var regime: String {
        guard let p = perc else { return "等待" }
        return p.giantOccupied >= p.threshold ? "扩散" : p.giantOccupied >= p.threshold - 0.08 ? "临界" : "分裂"
    }
    private var modelStance: String {
        let state = hmm?.state ?? "震荡"
        if state == "强势" && regime == "扩散" { return "进攻" }
        if state == "弱势" && regime != "扩散" { return "防守" }
        if state == "强势" || regime == "扩散" { return "均衡偏多" }
        return "均衡偏防守"
    }
    private var modelPositionText: String {
        let state = hmm?.state ?? "震荡"
        if state == "强势" && regime == "扩散" { return "60%–80%" }
        if state == "强势" && regime == "临界" { return "50%–70%" }
        if state == "弱势" && regime == "分裂" { return "0%–15%" }
        if state == "弱势" { return "15%–30%" }
        if regime == "扩散" { return "50%–70%" }
        return "30%–50%"
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
            hmmLabel: "HMM · " + (hmms.indices.contains(sel) ? hmms[sel].name : "指数")
        )
    }
    private var stance: String { composite?.stance ?? modelStance }
    private var positionText: String { composite?.position ?? modelPositionText }
    private var targetPositionPct: Double {
        switch stance {
        case "进攻": return 80
        case "均衡偏多": return 62
        case "中性": return 45
        case "均衡偏防守": return 30
        case "防守": return 15
        default: return 50
        }
    }

    private var stockPlans: [StockPlan] {
        let positions = store.summary.positions
        guard !positions.isEmpty else { return [] }
        let total = max(store.summary.total, 1)
        let target = min(0.18, targetPositionPct / 100 / Double(max(positions.count, 1)))
        return positions.map { p in
            let price = p.price ?? 0
            guard price > 0 else { return StockPlan(code: p.code, name: p.name, price: 0, weight: p.weight ?? 0, floatPct: p.floatPct, action: "数据不足", shares: 0, amount: 0, buyZone: "--", sellZone: "--", stop: "--", reason: "等待行情") }
            let weight = (p.weight ?? 0) / 100
            var action = "持有"
            var reason = "仓位与趋势匹配，继续观察"
            if (p.floatPct ?? 0) <= -15 && (p.pct ?? 0) < 0 {
                action = "止损"; reason = "浮亏超过 15% 且当日走弱，优先控制回撤"
            } else if weight > 0.22 {
                action = "减仓"; reason = "单票权重超过 22%，集中度偏高"
            } else if stance == "防守" && weight > 0.08 {
                action = "减仓"; reason = "模型处于防守状态，降低风险暴露"
            } else if target - weight > 0.02 && (p.pct ?? 0) > -3 && stance != "防守" {
                action = "加仓"; reason = "总仓位低于目标，个股未破位"
            }
            let deltaValue = (target - weight) * total
            let shares = Int((abs(deltaValue) / price / 100).rounded()) * 100
            let signed = action == "减仓" || action == "止损" ? -shares : shares
            return StockPlan(code: p.code, name: p.name, price: price, weight: weight * 100, floatPct: p.floatPct, action: action, shares: signed, amount: abs(Double(signed) * price), buyZone: "\( (price * 0.97).fmt())–\(price.fmt())", sellZone: "\( (price * 1.05).fmt())–\( (price * 1.08).fmt())", stop: (price * 0.92).fmt(), reason: reason)
        }
    }

    private var styleText: String {
        let state = hmm?.state ?? "震荡"
        if state == "强势" && regime == "扩散" { return "趋势跟随，优先超临界行业龙头，回踩 MA20 低吸。" }
        if state == "弱势" && regime == "分裂" { return "防守，红利/现金为主，不做弱势行业补涨。" }
        if state == "强势" { return "只做最强 2–3 个行业，降低非龙头暴露。" }
        if regime == "扩散" { return "行业轮动低吸，买强不买弱。" }
        return "控制频率，等待状态与广度同时转强。"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Text("HMM 定仓位，渗流定行业，九转定买卖点。三个模型各管一段，都不预测点位。")
                    Spacer()
                    Text("v2.2.0 \(lastUpdated.isEmpty ? "" : "· " + lastUpdated)")
                        .font(.system(size: 8, design: .monospaced)).foregroundStyle(Theme.textDim)
                }
                    .font(.system(size: 9.5)).foregroundStyle(Theme.textDim).lineSpacing(2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if !hmms.isEmpty {
                    HStack(spacing: 5) {
                        ForEach(Array(hmms.enumerated()), id: \.element.id) { i, item in
                            Button { sel = i } label: {
                                VStack(spacing: 2) {
                                    Text(item.name).font(.system(size: 8.5)).foregroundStyle(i == sel ? Theme.accent : Theme.textDim).lineLimit(1)
                                    Text(item.snapshot.state).font(.system(size: 10, weight: .semibold)).foregroundStyle(colors[item.snapshot.stateIndex])
                                }
                                .frame(maxWidth: .infinity).padding(.vertical, 6)
                                .background(i == sel ? Theme.accent.opacity(0.08) : Theme.card)
                                .overlay(Rectangle().strokeBorder(i == sel ? Theme.accent.opacity(0.5) : Theme.border, lineWidth: 0.6))
                            }.buttonStyle(.plain)
                        }
                    }
                    let counts = Dictionary(grouping: hmms, by: { $0.snapshot.state }).mapValues(\.count)
                    Text("5 个 A 股核心指数：强势 \(counts["强势"] ?? 0) · 震荡 \(counts["震荡"] ?? 0) · 弱势 \(counts["弱势"] ?? 0)").font(.system(size: 9)).foregroundStyle(Theme.textSub)
                }

                if let c = composite {
                    Card(title: "综合评分", subtitle: "HMM 42% · 渗流 38% · 九转 20% · 透明加权") {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("\(c.score)")
                                .font(.system(size: 30, weight: .bold, design: .rounded))
                                .foregroundStyle(Theme.accent)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(c.stance).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.text)
                                Text("一致度 \(c.agreement)/3 · 质量 \(c.quality) · \(c.missing.isEmpty ? "三项齐全" : "缺 " + c.missing.joined(separator: "/"))")
                                    .font(.system(size: 9)).foregroundStyle(Theme.textDim)
                            }
                            Spacer()
                        }
                        ForEach(c.components) { comp in
                            HStack(spacing: 7) {
                                Text(comp.label).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).frame(width: 96, alignment: .leading).lineLimit(1)
                                GeometryReader { geo in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(Theme.borderSoft).frame(height: 5)
                                        Capsule().fill(comp.available ? Theme.accent : Theme.textDim)
                                            .frame(width: geo.size.width * CGFloat(max(0, min(100, comp.score))) / 100, height: 5)
                                    }
                                }.frame(height: 5)
                                Text("\(comp.score)").font(.system(size: 9.5, design: .monospaced)).foregroundStyle(Theme.text).frame(width: 26, alignment: .trailing)
                            }
                            .padding(.vertical, 2)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(c.drivers.prefix(4).enumerated()), id: \.offset) { _, d in
                                Text("· " + d).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineLimit(2)
                            }
                        }.padding(.top, 3)
                    }
                }

                Card(title: "模型组合策略", subtitle: "HMM 决定仓位 · 渗流决定行业与标的") {
                    HStack(spacing: 12) {
                        strategyKV("策略", stance)
                        strategyKV("建议仓位", positionText)
                        strategyKV("组合", (hmm?.state ?? "震荡") + " × " + regime)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("选股方向：" + styleText).font(.system(size: 10)).foregroundStyle(Theme.textSub).lineSpacing(1.8)
                        Text("优先行业：" + ((perc?.industries ?? []).prefix(3).map { "\($0.name) \(($0.ratio * 100).fmt(0))%" }.joined(separator: " · "))).font(.system(size: 10)).foregroundStyle(Theme.textSub)
                        Text("买入：状态概率同向、行业广度 ≥ 60%、最大簇未收缩、个股站上 MA20。").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                        Text("卖出：弱势概率上升、最大簇跌破阈值、行业广度回落或个股跌破 MA20/支撑。").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                    }.padding(.top, 6)
                }

                Card(title: "个股仓位建议", subtitle: "结合持仓、HMM 状态与行业渗流 · 目标总仓位 \(Int(targetPositionPct))%") {
                    if stockPlans.isEmpty {
                        Text("当前无持仓，等待建仓信号").font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                    } else {
                        ForEach(stockPlans) { p in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(p.name).font(.system(size: 11.5, weight: .medium)).foregroundStyle(Theme.text)
                                    Text(p.code).font(.system(size: 8.5, design: .monospaced)).foregroundStyle(Theme.textDim)
                                    Spacer()
                                    Text(p.action).font(.system(size: 9, weight: .semibold)).foregroundStyle(p.action == "加仓" ? Theme.up : p.action == "减仓" || p.action == "止损" ? Theme.down : Theme.accent)
                                    Text(p.shares == 0 ? "0 股" : "\(p.shares > 0 ? "+" : "") \(p.shares) 股").font(.system(size: 9.5, weight: .medium, design: .monospaced)).foregroundStyle(Theme.text)
                                }
                                HStack {
                                    Text("现价 \(p.price.fmt()) · 权重 \(p.weight.fmt(1))%").font(.system(size: 8.5)).foregroundStyle(Theme.textSub)
                                    Spacer()
                                    Text("买入 \(p.buyZone) · 卖出 \(p.sellZone) · 止损 \(p.stop)").font(.system(size: 8.3)).foregroundStyle(Theme.textDim)
                                }
                                Text(p.reason).font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                            }.padding(.vertical, 4)
                            SoftDivider()
                        }
                    }
                    Text("建议股数按 100 股取整；加仓/减仓金额约 \(stockPlans.reduce(0) { $0 + $1.amount }.fmt(0)) 元。执行前请核对可用现金与涨跌停限制。").font(.system(size: 8)).foregroundStyle(Theme.textDim).padding(.top, 3)
                }

                Card(title: "隐马尔可夫 · \(hmms.indices.contains(sel) ? hmms[sel].name : "市场状态")", subtitle: "日收益 · 3 状态高斯 HMM") {
                    if let h = hmm {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("当前状态").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                                Text(h.state).font(.system(size: 24, weight: .bold)).foregroundStyle(colors[h.stateIndex])
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 3) {
                                Text("预计持续 \(h.expectedDays.fmt(1)) 天").font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                                Text("下一状态 " + h.probabilities.max { $0.p < $1.p }!.label).font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                            }
                        }
                        ForEach(Array(h.probabilities.enumerated()), id: \.element.label) { i, p in
                            HStack(spacing: 6) {
                                Text(p.label).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).frame(width: 30, alignment: .leading)
                                GeometryReader { g in
                                    Capsule().fill(Theme.borderSoft).frame(height: 6)
                                        .overlay(alignment: .leading) { Capsule().fill(colors[i]).frame(width: g.size.width * p.p, height: 6) }
                                }.frame(height: 6)
                                Text((p.p * 100).fmt(1) + "%").font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textSub).frame(width: 46, alignment: .trailing)
                            }
                        }
                        HStack(spacing: 1) {
                            ForEach(Array(h.history.enumerated()), id: \.offset) { _, v in
                                Rectangle().fill(colors[v]).frame(maxWidth: .infinity).frame(height: 10)
                            }
                        }.padding(.top, 6)
                        Text(h.signal).font(.system(size: 10)).foregroundStyle(Theme.textSub).padding(.top, 2)
                        ForEach(h.interpretation, id: \.self) { line in
                            Text("· " + line).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineSpacing(1.7)
                        }
                        Text("状态转移矩阵").font(.system(size: 9)).foregroundStyle(Theme.textDim).padding(.top, 6)
                        ForEach(0..<3, id: \.self) { i in
                            HStack(spacing: 4) {
                                Text(QuantModels.labels[i]).font(.system(size: 9)).foregroundStyle(Theme.text).frame(width: 34, alignment: .leading)
                                ForEach(0..<3, id: \.self) { j in
                                    Text((h.transition[i][j] * 100).fmt(1) + "%").font(.system(size: 8.5, design: .monospaced)).foregroundStyle(Theme.textSub).frame(maxWidth: .infinity)
                                }
                            }
                        }
                    } else { ProgressView().frame(maxWidth: .infinity) }
                }

                Card(title: "渗流模型 · 广度扩散", subtitle: "上涨股票格点 · 4 邻接连通簇 · 阈值 0.5927") {
                    if let p = perc {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("当前结构").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                                Text(p.status).font(.system(size: 18, weight: .bold)).foregroundStyle(p.giantOccupied >= p.threshold ? Theme.up : Theme.accent)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 3) {
                                Text("上涨占比 " + (p.ratio * 100).pct(1)).font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                                Text("最大簇/上涨 " + (p.giantOccupied * 100).pct(1)).font(.system(size: 9.5)).foregroundStyle(Theme.textSub)
                            }
                        }
                        Canvas { ctx, size in
                            let cell = min(size.width, size.height) / CGFloat(p.cols)
                            for i in 0..<p.cells.count {
                                let r = i / p.cols, c = i % p.cols
                                let color: Color = p.cells[i] == 2 ? Theme.accent : (p.cells[i] == 1 ? Theme.accent.opacity(0.35) : Color(hex: 0x18231d))
                                ctx.fill(Path(CGRect(x: CGFloat(c) * cell, y: CGFloat(r) * cell, width: cell - 0.6, height: cell - 0.6)), with: .color(color))
                            }
                        }
                        .aspectRatio(1, contentMode: .fit)
                        .frame(maxHeight: 250)
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                            kv("上涨家数", "\(p.up) / \(p.total)")
                            kv("最大连通簇", "\(p.largest) 只")
                            kv("连通簇数量", "\(p.clusters) 个")
                            kv("阈值", p.threshold.fmt(4))
                        }
                        HStack(spacing: 6) {
                            Text("随机重排最大簇").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                            Spacer()
                            Text("均值 \( (p.robustnessMean * 100).fmt(1))% · 区间 \( (p.robustnessMin * 100).fmt(1))%–\( (p.robustnessMax * 100).fmt(1))%").font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textSub)
                        }
                        Text(p.note).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineSpacing(1.8).padding(.top, 2)
                    } else { ProgressView().frame(maxWidth: .infinity) }
                }

                Card(title: "九转模型分析", subtitle: "TD Sequential · 建仓 9 根 / 倒计时 13 根") {
                    if tds.isEmpty {
                        Text("九转结构计算中…").font(.system(size: 10)).foregroundStyle(Theme.textDim)
                    } else {
                        let buys = tds.filter { $0.buy >= 7 }.count
                        let sells = tds.filter { $0.sell >= 7 }.count
                        Text("当前 \(buys) 个指数出现买入结构、\(sells) 个出现卖出结构。9 转说明这一段动能累了，不是反转保证；要等放量收阳或跌破 5 日线来确认。")
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
                    }
                }

                Card(title: "细分行业渗流", subtitle: "按行业分组 · 上涨占比与最大簇 · Top 20") {
                    if let p = perc {
                        if p.industries.isEmpty {
                            Text("当前行情源未返回行业分类；全市场渗流结果仍有效。")
                                .font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                        }
                        ForEach(p.industries) { x in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(x.name).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.text)
                                    Text("\(x.count) 只").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                                    Spacer()
                                    Text(x.status).font(.system(size: 8.5)).foregroundStyle(x.giant >= p.threshold ? Theme.up : Theme.accent)
                                }
                                HStack {
                                    Text("上涨 \( (x.ratio * 100).fmt(1))% · 最大簇 \( (x.giant * 100).fmt(1))%").font(.system(size: 9)).foregroundStyle(Theme.textSub)
                                    Spacer()
                                    Text("领涨 \(x.leader) \(x.leaderPct.pct())").font(.system(size: 9)).foregroundStyle(Theme.textDim)
                                }
                            }.padding(.vertical, 5)
                            SoftDivider()
                        }
                        Text("行业分组股票数较少，临界值仅作为扩散强弱参考，不能与全市场格点直接比较。").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                    }
                }

                Card(title: "行业临界与关键标的", subtitle: "上涨广度接近 59.27% 的行业与领涨公司") {
                    if let p = perc {
                        let crit = p.industries.filter { abs($0.ratio - p.threshold) <= 0.08 }
                        let shown = crit.isEmpty ? Array(p.industries.sorted { abs($0.ratio - p.threshold) < abs($1.ratio - p.threshold) }.prefix(5)) : crit
                        Text(crit.isEmpty ? "当前无正式临界行业，以下为最接近阈值的行业" : "临界行业 \(crit.count) 个")
                            .font(.system(size: 9)).foregroundStyle(crit.isEmpty ? Theme.textDim : Theme.up)
                        ForEach(shown) { x in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(x.name).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.text)
                                    Text(x.status).font(.system(size: 8)).foregroundStyle(x.giant >= p.threshold ? Theme.up : Theme.accent)
                                    Spacer()
                                    Text("上涨 \((x.ratio * 100).fmt(1))% · 最大簇 \((x.giant * 100).fmt(1))%").font(.system(size: 8.5, design: .monospaced)).foregroundStyle(Theme.textSub)
                                }
                                Text("关键标的：\(x.leader) \(x.leaderPct.pct())").font(.system(size: 9)).foregroundStyle(Theme.textDim)
                            }.padding(.vertical, 4)
                            SoftDivider()
                        }
                        Text("关键标的汇总").font(.system(size: 9)).foregroundStyle(Theme.textDim).padding(.top, 4)
                        let seen = NSMutableSet()
                        ForEach(shown) { x in
                            if seen.contains(x.leader) == false {
                                let _ = seen.add(x.leader)
                                HStack { Text(x.leader).font(.system(size: 9.5)).foregroundStyle(Theme.text); Spacer(); Text(x.leaderPct.pct()).font(.system(size: 9.5, design: .monospaced)).foregroundStyle(Theme.trendColor(x.leaderPct)) }
                            }
                        }
                    }
                }

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

                Card(title: "模型说明", subtitle: "使用边界") {
                    Text("HMM 用日收益的三状态高斯隐马尔可夫模型识别市场状态，输出后验概率与状态转移，状态切换存在滞后。渗流模型把上涨股票映射到二维格点并寻找最大连通簇，用于观察上涨广度是扩散还是分裂，阈值采用二维方格点渗流临界值 0.5927。为什么选择最大邻接连通簇：上涨家数只描述广度，最大簇衡量上涨是否连成一片，对应渗流理论的 giant component；簇越大扩散越真实，簇越小上涨越孤立。两者均为统计描述，不构成投资建议。")
                        .font(.system(size: 10)).foregroundStyle(Theme.textSub).lineSpacing(3)
                }
            }
            .padding(14)
            .readableWidth()
        }
        .background(Theme.bg)
        .navigationTitle("量化模型")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadModels()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 300_000_000_000)
                await loadModels()
            }
        }
    }

    private func loadModels() async {
        lastUpdated = Date().formatted(.dateTime.hour().minute().second())
        let defs: [(String, String, String)] = [("上证", "000001", "1.000001"), ("沪深300", "000300", "1.000300"), ("创业板", "399006", "0.399006"), ("深证", "399001", "0.399001"), ("科创50", "000688", "1.000688")]
        var built: [IndexHMM] = []
        var builtTD: [IndexTD] = []
        for (name, code, sec) in defs {
            let kl = (try? await MarketService.shared.klines(code, limit: 420, adjust: "", secidOverride: sec)) ?? []
            let closes = kl.map(\.close)
            guard closes.count > 61 else { continue }
            let rets = (1..<closes.count).map { (log(closes[$0] / closes[$0 - 1])) * 100 }
            if let h = QuantModels.hmm(rets) { built.append(IndexHMM(name: name, snapshot: h)) }
            let td = PatternEngine.td(closes)
            let b = min(td.buy.last ?? 0, 9)
            let sk = min(td.sell.last ?? 0, 9)
            let label = b >= 9 ? "买入九转 9/9" : (sk >= 9 ? "卖出九转 9/9" : (b >= 7 ? "下跌结构 \(b)/9" : (sk >= 7 ? "上涨结构 \(sk)/9" : "无有效结构")))
            builtTD.append(IndexTD(name: name, buy: b, sell: sk, label: label))
        }
        hmms = built
        tds = builtTD
        let rows: [Quote]
        if store.spotRows.count > 100 { rows = store.spotRows }
        else { rows = (try? await MarketService.shared.spot(ttl: 300).rows) ?? [] }
        perc = QuantModels.percolation(rows)
        loading = false
    }

    private func strategyKV(_ k: String, _ v: String) -> some View {
        VStack(spacing: 2) {
            Text(k).font(.system(size: 8)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.accent).lineLimit(1).minimumScaleFactor(0.7)
        }.frame(maxWidth: .infinity)
    }

    private func kv(_ k: String, _ v: String) -> some View {
        HStack { Text(k).font(.system(size: 9)).foregroundStyle(Theme.textDim); Spacer(); Text(v).font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundStyle(Theme.text) }
            .padding(7).background(Theme.cardSoft).clipShape(RoundedRectangle(cornerRadius: 3))
    }
}
