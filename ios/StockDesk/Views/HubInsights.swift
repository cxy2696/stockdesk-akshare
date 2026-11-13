import SwiftUI

struct AssetAnalysisView: View {
    @EnvironmentObject private var store: AppStore
    @State private var result: AnalyticsResult?

    private var summary: PortfolioSummary { store.summary }
    private var cashPct: Double { summary.total > 0 ? summary.cash / summary.total * 100 : 0 }
    private var maxWeight: Double { summary.positions.compactMap(\.weight).max() ?? 0 }

    private let segmentColors: [Color] = [Theme.accent, Color(hex: 0x55D6C2), Color(hex: 0xB08CFF), Color(hex: 0xFF8A5C), Color(hex: 0x6EA8FF)]

    private var habits: [String] {
        var out: [String] = []
        out.append(cashPct > 40 ? "现金占比 \(cashPct.pct(1))，偏防御，等待更明确的机会。" : cashPct < 10 ? "现金仅 \(cashPct.pct(1))，仓位偏满，需保留应对波动的余地。" : "现金占比 \(cashPct.pct(1))，仓位中性。")
        out.append(maxWeight > 40 ? "第一大持仓权重 \(maxWeight.pct(1))，集中度偏高，单票波动会显著影响账户。" : "第一大持仓权重 \(maxWeight.pct(1))，集中度可控。")
        if let wr = result?.stats.winRate {
            out.append("已平仓胜率 \(wr.pct(1))，盈亏比 \(result?.stats.profitFactor?.fmt(2) ?? "--")，\(wr >= 0.5 ? "胜率尚可，重点控制单笔亏损。" : "胜率偏低，减少追高与频繁试错。")")
        }
        out.append(store.trades.count > 30 ? "累计 \(store.trades.count) 笔交易，频率偏高；可把操作集中到少数高确定性机会。" : "累计 \(store.trades.count) 笔交易，节奏偏克制。")
        return out
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Card(title: "资金分配", subtitle: "现金 / 持仓权重") {
                    VStack(alignment: .leading, spacing: 8) {
                        GeometryReader { g in
                            HStack(spacing: 1) {
                                Rectangle().fill(Theme.textDim).frame(width: max(2, g.size.width * cashPct / 100))
                                ForEach(Array(summary.positions.enumerated()), id: \.element.id) { i, p in
                                    Rectangle().fill(segmentColors[i % segmentColors.count])
                                        .frame(width: max(2, g.size.width * (p.weight ?? 0) / 100))
                                }
                            }
                        }.frame(height: 10)
                        HStack { Text("现金").font(.system(size: 10.5)).foregroundStyle(Theme.textSub); Spacer(); Text("¥\(summary.cash.fmt(0)) · \(cashPct.pct(1))").font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Theme.text) }
                        ForEach(summary.positions.sorted { ($0.weight ?? 0) > ($1.weight ?? 0) }.prefix(5)) { p in
                            HStack { Text(p.name).font(.system(size: 11)).foregroundStyle(Theme.text); Spacer(); Text((p.weight ?? 0).pct(1)).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Theme.accent) }
                        }
                    }
                }
                Card(title: "交易偏好与习惯", subtitle: "自动总结 · 不构成投资建议") {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(habits, id: \.self) { Text("· " + $0).font(.system(size: 11)).foregroundStyle(Theme.textSub).lineSpacing(2) }
                    }
                }
                Card(title: "收益趋势", subtitle: "净值化 · 双基准") {
                    if let m = result?.metrics {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            kv("累计收益", m.totalReturn.pct(), Theme.trendColor(m.totalReturn))
                            kv("年化收益", m.annualReturn.pct(), Theme.trendColor(m.annualReturn))
                            kv("最大回撤", m.maxDrawdown.pct(), Theme.up)
                            kv("夏普比率", m.sharpe.fmt(2), Theme.text)
                            kv("卡玛比率", m.calmar?.fmt(2) ?? "--", Theme.text)
                            kv("超额收益", m.excessReturn.pct(), Theme.trendColor(m.excessReturn))
                        }
                    } else { ProgressView() }
                }
                Card(title: "月度收益", subtitle: "按自然月") {
                    ForEach((result?.monthly ?? []).suffix(8).reversed()) { m in
                        HStack { Text(m.month).font(.system(size: 10.5)).foregroundStyle(Theme.textSub); Spacer(); Text(m.ret.pct()).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.trendColor(m.ret)) }
                    }
                }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("资产分析")
        .navigationBarTitleDisplayMode(.inline)
        .task { result = await store.analytics() }
    }

    private func kv(_ k: String, _ v: String, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text(k).font(.system(size: 9)).foregroundStyle(Theme.textDim); Text(v).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(c) }
            .frame(maxWidth: .infinity, alignment: .leading).padding(8).background(Theme.cardSoft).clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

struct AdviceCenterView: View {
    @EnvironmentObject private var store: AppStore
    @State private var state: MarketState?
    @State private var picks: [PatternHit] = []

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let s = state {
                    Card(title: "市场历史总结", subtitle: s.label + " · 温度 \(s.score)") {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(s.reasons, id: \.self) { Text("· " + $0).font(.system(size: 11)).foregroundStyle(Theme.textSub) }
                            if !s.top.isEmpty { Text("领涨行业：" + s.top.prefix(3).map(\.name).joined(separator: "、")).font(.system(size: 10.5)).foregroundStyle(Theme.up) }
                            if !s.bottom.isEmpty { Text("靠后行业：" + s.bottom.map(\.name).joined(separator: "、")).font(.system(size: 10.5)).foregroundStyle(Theme.down) }
                        }
                    }
                    Card(title: "未来趋势", subtitle: "基于温度、均线与资金") {
                        let above = s.indices.filter(\.above20).count
                        VStack(alignment: .leading, spacing: 5) {
                            Text("站上 MA20：\(above) / \(s.indices.count) 个指数").font(.system(size: 11)).foregroundStyle(Theme.text)
                            Text(s.score >= 58 ? "趋势偏强，若成交额同步放大，可维持偏积极仓位。" : s.score <= 42 ? "趋势偏弱，优先控制回撤，等待放量转强。" : "震荡市，保持中性仓位，减少追涨杀跌。")
                                .font(.system(size: 11)).foregroundStyle(Theme.textSub).lineSpacing(2)
                            Text("涨停 \(s.breadth.limitUp) / 跌停 \(s.breadth.limitDown) · 成交额 \(shortMoney(s.turnover))")
                                .font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.textDim)
                        }
                    }
                    Card(title: "要闻与风险", subtitle: "影响市场的主要信息") {
                        ForEach(s.news.prefix(6)) { n in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(n.title).font(.system(size: 11)).foregroundStyle(Theme.text)
                                Text(n.time).font(.system(size: 9)).foregroundStyle(Theme.textDim)
                            }.padding(.vertical, 4)
                            SoftDivider()
                        }
                    }
                    Card(title: "标的推荐", subtitle: "形态 + 量价 + 资金") {
                        if picks.isEmpty { ProgressView() }
                        ForEach(picks.prefix(8)) { h in pickRow(h) }
                    }
                } else { ProgressView().padding(.top, 80) }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("投资建议")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            var s = await MarketService.shared.marketState()
            s.news = await MarketService.shared.marketNews()
            state = s
            let candidates = store.spotRows.isEmpty ? s.gainers : Array(store.spotRows.prefix(200))
            picks = await PatternEngine.picks(candidates: candidates, top: 10)
        }
    }

    private func pickRow(_ h: PatternHit) -> some View {
        NavigationLink {
            StockDetailView(code: h.code, name: h.name)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(h.name).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.text)
                    Spacer()
                    Text("\(h.score)").font(.system(size: 13, weight: .bold, design: .rounded)).foregroundStyle(Theme.accent)
                }
                Text(h.code).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim)
                Text(h.reason).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            }
            .padding(.vertical, 5)
        }
        .buttonStyle(.plain)
    }
}

struct IndexAnalysisView: View {
    @State private var rows: [IndexAnalysisRow] = []

    private var aRows: [IndexAnalysisRow] { rows.filter { $0.region == "A股" } }
    private var usRows: [IndexAnalysisRow] { rows.filter { $0.region != "A股" } }
    private var bull: Int { aRows.filter { $0.bias == "偏多" }.count }
    private var bear: Int { aRows.filter { $0.bias == "偏空" }.count }
    private var neutral: Int { aRows.count - bull - bear }
    private var avgScore: Double { aRows.isEmpty ? 0 : Double(aRows.reduce(0) { $0 + $1.score }) / Double(aRows.count) }

    private var summaryText: String {
        if bull >= 6 { return "多数 A 股指数转多，可逐步提高仓位，但仍以 MA20 为防守。" }
        if bear >= 6 { return "多数 A 股指数偏空，优先控制回撤，等待指数重新站上 MA20。" }
        return "A 股指数分化，保持中性仓位，关注强势宽基与防守风格的相对强弱。"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if rows.isEmpty {
                    ProgressView("加载 15 个指数…")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 100)
                } else {
                Card(title: "A股主要宽基 · 综合结论", subtitle: "共 \(aRows.count) 个指数") {
                    HStack(alignment: .top) {
                        Text(summaryText).font(.system(size: 12)).foregroundStyle(Theme.text).lineSpacing(2)
                        Spacer()
                        VStack(spacing: 0) {
                            Text("\(Int(avgScore.rounded()))").font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(Theme.accent)
                            Text("/100").font(.system(size: 8)).foregroundStyle(Theme.textDim)
                        }
                    }
                    Text("偏多 \(bull) · 中性 \(neutral) · 偏空 \(bear)").font(.system(size: 9.5)).foregroundStyle(Theme.textSub).padding(.top, 4)
                }

                sectionTitle("A股指数 · \(aRows.count) 个")
                ForEach(aRows) { x in indexCard(x) }

                sectionTitle("海外指数 · 隔夜参考")
                ForEach(usRows) { x in indexCard(x) }
                }
            }
            .padding(14)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("指数分析")
        .navigationBarTitleDisplayMode(.inline)
        .task { rows = await MarketService.shared.indexAnalysis() }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.system(size: 10, weight: .medium)).foregroundStyle(Theme.textDim).tracking(0.8).frame(maxWidth: .infinity, alignment: .leading)
    }

    private func indexCard(_ x: IndexAnalysisRow) -> some View {
        Card(title: "\(x.name) · \(x.style)", subtitle: x.code) {
            HStack {
                Text(x.price.fmt()).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Theme.text)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(x.pct.pct()).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.trendColor(x.pct))
                    Text("\(x.bias) · \(x.score)分").font(.system(size: 9, weight: .semibold)).foregroundStyle(biasColor(x.bias))
                }
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 3) {
                metric("趋势", x.trend, Theme.text)
                metric("1日", x.pct1.pct(), Theme.trendColor(x.pct1))
                metric("5日", x.pct5.pct(), Theme.trendColor(x.pct5))
                metric("20日", x.pct20.pct(), Theme.trendColor(x.pct20))
                metric("60日", x.pct60.pct(), Theme.trendColor(x.pct60))
                metric("120日", x.pct120.pct(), Theme.trendColor(x.pct120))
                metric("MA20", x.ma20.fmt(), Theme.text)
                metric("MA60", x.ma60.fmt(), Theme.text)
                metric("MA120", x.ma120.fmt(), Theme.text)
                metric("RSI14", x.rsi.fmt(1), Theme.text)
                metric("MACD", x.macdHist.fmt(2), (x.macdHist ?? 0) >= 0 ? Theme.up : Theme.down)
                metric("20日波动", (x.vol20 ?? 0).fmt(2) + "%", Theme.textSub)
                metric("支撑", x.support.fmt(), Theme.up)
                metric("压力", x.resistance.fmt(), Theme.down)
                metric("52周高", x.high52.fmt(), Theme.down)
                metric("52周低", x.low52.fmt(), Theme.up)
            }
            .padding(.top, 6)
            Text(x.desc).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineSpacing(2).padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(x.conclusion).font(.system(size: 10.5, weight: .medium)).foregroundStyle(Theme.text).lineSpacing(2)
                Text("注意：" + x.note).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineSpacing(1.8)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.accent.opacity(0.06))
            .overlay(alignment: .leading) { Rectangle().fill(Theme.accent).frame(width: 2) }
            .padding(.top, 6)
        }
    }

    private func metric(_ k: String, _ v: String, _ c: Color) -> some View {
        HStack {
            Text(k).font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
            Spacer()
            Text(v).font(.system(size: 9.5, weight: .medium, design: .monospaced)).foregroundStyle(c)
        }
    }

    private func biasColor(_ b: String) -> Color {
        b == "偏多" ? Theme.up : b == "偏空" ? Theme.down : Theme.accent
    }
}
