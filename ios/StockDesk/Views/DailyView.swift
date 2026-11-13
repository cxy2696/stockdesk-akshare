import SwiftUI

struct DailyView: View {
    @EnvironmentObject private var store: AppStore
    @State private var state: MarketState?
    @State private var advice: PositionAdvice?
    @State private var picks: [PatternHit] = []
    @State private var loading = true
    @State private var picking = true
    @State private var news: [NewsItem] = []

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if loading && state == nil {
                    ProgressView().padding(.top, 80)
                } else if let s = state {
                    summaryCard(s)
                    analysisCard(s)
                    levelsCard(s)
                    industryTrendCard(s)
                    flowCard(s)
                    hotCard(s)
                    newsCard(s)
                    adviceCard
                    picksCard
                    indicatorNotes
                    disclaimer
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 96)
            .readableWidth()
        }
        .background(Theme.bg)
        .navigationTitle("每日策略")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func summaryCard(_ s: MarketState) -> some View {
        Card(title: "每日行情", subtitle: dateText) {
            VStack(alignment: .leading, spacing: 12) {
                Text(summaryText(s))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.text)
                    .lineSpacing(3)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.accent.opacity(0.07))
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 6) {
                    ForEach(s.indices) { i in
                        VStack(spacing: 2) {
                            Text(i.short).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineLimit(1)
                            Text(i.price.fmt(0)).font(.system(size: 11.5, weight: .semibold, design: .rounded)).lineLimit(1)
                            Text(i.pct.pct()).font(.system(size: 9.5, weight: .medium)).foregroundStyle(Theme.trendColor(i.pct))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(Theme.cardSoft)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                }

                breadthBar(s.breadth)

                HStack(spacing: 16) {
                    kv("涨停", "\(s.breadth.limitUp)", Theme.up)
                    kv("跌停", "\(s.breadth.limitDown)", Theme.down)
                    kv("成交额", shortMoney(s.turnover), Theme.text)
                    kv("温度", "\(s.score)", Theme.trendColor(Double(s.score - 50)))
                    kv("结论", s.label, Theme.trendColor(Double(s.score - 50)))
                }

                HStack(alignment: .top, spacing: 10) {
                    sectorCol("领涨行业", s.top, positive: true)
                    sectorCol("靠后行业", s.bottom, positive: false)
                    sectorCol("领涨概念", s.concepts, positive: true)
                }
            }
        }
    }

    private var adviceCard: some View {
        Group {
            if let a = advice {
                Card(title: "仓位管理推荐", subtitle: "市场温度 × 账户回撤 × 持仓集中度") {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(a.action).font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(a.action == "减仓" ? Theme.up : (a.action == "加仓" ? Theme.down : Theme.accent))
                            Text("· \(a.urgency)").font(.system(size: 11)).foregroundStyle(Theme.textDim)
                            Spacer()
                            Text("温度 \(a.score)").font(.system(size: 11)).foregroundStyle(Theme.textDim)
                        }
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("当前仓位").font(.system(size: 10)).foregroundStyle(Theme.textDim)
                                Text(String(format: "%.1f%%", a.currentPct)).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(Theme.text)
                            }
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Theme.cardSoft).frame(height: 10)
                                    Capsule().fill(Theme.accent.opacity(0.25))
                                        .frame(width: geo.size.width * CGFloat(a.targetHigh - a.targetLow) / 100, height: 10)
                                        .offset(x: geo.size.width * CGFloat(a.targetLow) / 100)
                                    Capsule().fill(Theme.text)
                                        .frame(width: 3, height: 18)
                                        .offset(x: min(geo.size.width - 3, max(0, geo.size.width * CGFloat(a.currentPct) / 100)))
                                }
                                .frame(height: 18)
                            }
                            .frame(height: 18)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("建议仓位").font(.system(size: 10)).foregroundStyle(Theme.textDim)
                                Text("\(a.targetLow)%–\(a.targetHigh)%").font(.system(size: 16, weight: .bold, design: .rounded)).foregroundStyle(Theme.text)
                            }
                        }
                        HStack(spacing: 14) {
                            kv("单票上限", "\(a.singleCap)%")
                            kv("现金下限", "\(a.cashFloor)%")
                            kv("仓位缺口", String(format: "%+.1fpp", a.gap), Theme.trendColor(a.gap))
                        }
                        ForEach(a.reasons, id: \.self) { r in
                            Text("· " + r).font(.system(size: 10.5)).foregroundStyle(Theme.textSub)
                        }
                        ForEach(a.warnings, id: \.self) { w in
                            Text("⚠ " + w).font(.system(size: 10.5)).foregroundStyle(Theme.up)
                        }
                        ForEach(Array(a.actions.enumerated()), id: \.offset) { i, act in
                            Text("\(i + 1). " + act).font(.system(size: 11)).foregroundStyle(Theme.text)
                        }
                    }
                }
            }
        }
    }

    private var picksCard: some View {
        Card(title: "今日标的推荐", subtitle: picking ? "扫描中…" : "形态 + 量价 + 流动性综合评分") {
            if picking && picks.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 20)
            } else if picks.isEmpty {
                Text("暂无命中，稍后重试").font(.system(size: 12)).foregroundStyle(Theme.textDim)
            } else {
                VStack(spacing: 0) {
                    ForEach(picks) { h in
                        NavigationLink {
                            StockDetailView(code: h.code, name: h.name)
                        } label: {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(h.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.text)
                                    Text(h.signals.joined(separator: " · ")).font(.system(size: 9.5)).foregroundStyle(Theme.accent).lineLimit(1)
                                    Text(h.reason).font(.system(size: 9.5)).foregroundStyle(Theme.textDim).lineLimit(1)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 3) {
                                    Text(h.price.fmt()).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text)
                                    Text(h.pct.pct()).font(.system(size: 10)).foregroundStyle(Theme.trendColor(h.pct))
                                }
                                Text("\(h.score)").font(.system(size: 12, weight: .bold, design: .rounded))
                                    .foregroundStyle(Theme.accent)
                                    .frame(width: 30)
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if h.id != picks.last?.id { SoftDivider() }
                    }
                }
            }
        }
    }

    private var disclaimer: some View {
        Text("仓位建议与标的推荐由技术指标自动生成，仅作参考，不构成投资建议。")
            .font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func breadthBar(_ b: Breadth) -> some View {
        let total = max(b.up + b.down + b.flat, 1)
        return VStack(spacing: 4) {
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(Theme.up).frame(width: geo.size.width * CGFloat(b.up) / CGFloat(total))
                    Rectangle().fill(Theme.textDim.opacity(0.3)).frame(width: geo.size.width * CGFloat(b.flat) / CGFloat(total))
                    Rectangle().fill(Theme.down).frame(width: geo.size.width * CGFloat(b.down) / CGFloat(total))
                }
            }
            .frame(height: 8)
            .clipShape(Capsule())
            HStack {
                Text("涨 \(b.up)").foregroundStyle(Theme.up)
                Spacer()
                Text("平 \(b.flat)").foregroundStyle(Theme.textDim)
                Spacer()
                Text("跌 \(b.down)").foregroundStyle(Theme.down)
            }
            .font(.system(size: 9.5))
        }
    }

    private func sectorCol(_ title: String, _ boards: [Board], positive: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
            ForEach(boards.prefix(4)) { b in
                HStack(spacing: 3) {
                    Text(b.name).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineLimit(1)
                    Spacer(minLength: 2)
                    Text(b.pct.pct()).font(.system(size: 9.5, weight: .semibold)).foregroundStyle(Theme.trendColor(b.pct))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func kv(_ k: String, _ v: String, _ c: Color = Theme.text) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(c).lineLimit(1)
        }
    }

    private var dateText: String {
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        return df.string(from: Date())
    }

    private func summaryText(_ s: MarketState) -> String {
        let sh = s.indices.first
        var t = "今日 A 股\(s.label)，上证指数 \(sh?.pct.pct() ?? "--") 收于 \(sh?.price.fmt() ?? "--")，"
        t += "全市场 \(s.breadth.up) 家上涨、\(s.breadth.down) 家下跌，涨停 \(s.breadth.limitUp) 家、跌停 \(s.breadth.limitDown) 家，"
        t += "成交额约 \(shortMoney(s.turnover))。"
        if let top = s.top.first { t += "领涨行业：\(top.name)。" }
        t += "市场温度 \(s.score)，建议总仓位 \(advice?.targetLow ?? 0)%–\(advice?.targetHigh ?? 0)%。"
        return t
    }


    private func levelsCard(_ s: MarketState) -> some View {
        Card(title: "明日关注", subtitle: "近 20 日支撑 / 压力 · MA20 / MA60") {
            VStack(spacing: 7) {
                ForEach(s.indices) { i in
                    HStack(spacing: 8) {
                        Text(i.name).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.text).frame(width: 64, alignment: .leading)
                        Text(i.price.fmt()).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Theme.textSub).frame(width: 62, alignment: .trailing)
                        Spacer()
                        Text("支撑 " + i.support.fmt()).font(.system(size: 9.5, design: .monospaced)).foregroundStyle(Theme.up)
                        Text("压力 " + i.resistance.fmt()).font(.system(size: 9.5, design: .monospaced)).foregroundStyle(Theme.down)
                    }
                    .padding(.vertical, 5)
                    .overlay(alignment: .bottom) { SoftDivider() }
                }
                Text("站上压力位视为转强信号；跌破支撑位应降低仓位。")
                    .font(.system(size: 9)).foregroundStyle(Theme.textDim).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
    private func analysisCard(_ s: MarketState) -> some View {
        Card(title: "行情分析", subtitle: "7/20/30/60 日 · MACD · RSI · 九转 · 钝化") {
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        Text("指数").frame(width: 44, alignment: .leading)
                        Text("点位").frame(width: 62, alignment: .trailing)
                        Text("涨跌").frame(width: 52, alignment: .trailing)
                        Text("7日").frame(width: 44, alignment: .trailing)
                        Text("20日").frame(width: 44, alignment: .trailing)
                        Text("30日").frame(width: 44, alignment: .trailing)
                        Text("60日").frame(width: 44, alignment: .trailing)
                        Text("MA20").frame(width: 48, alignment: .trailing)
                        Text("MA60").frame(width: 48, alignment: .trailing)
                        Text("RSI").frame(width: 34, alignment: .trailing)
                        Text("MACD").frame(width: 76, alignment: .trailing)
                        Text("九转").frame(width: 40, alignment: .trailing)
                        Text("钝化").frame(width: 40, alignment: .trailing)
                        Text("支撑").frame(width: 48, alignment: .trailing)
                        Text("压力").frame(width: 48, alignment: .trailing)
                    }
                    .font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                    .padding(.vertical, 5)
                    SoftDivider()
                    ForEach(s.indices) { i in
                        HStack(spacing: 0) {
                            Text(i.short).font(.system(size: 9.5, weight: .semibold)).frame(width: 44, alignment: .leading)
                            Text(i.price.fmt(0)).font(.system(size: 9.5, design: .rounded)).frame(width: 62, alignment: .trailing)
                            Text(i.pct.pct()).font(.system(size: 9.5)).foregroundStyle(Theme.trendColor(i.pct)).frame(width: 52, alignment: .trailing)
                            Text(i.pct7.pct()).font(.system(size: 8.5)).foregroundStyle(Theme.trendColor(i.pct7)).frame(width: 44, alignment: .trailing)
                            Text(i.pct20.pct()).font(.system(size: 8.5)).foregroundStyle(Theme.trendColor(i.pct20)).frame(width: 44, alignment: .trailing)
                            Text(i.pct30.pct()).font(.system(size: 8.5)).foregroundStyle(Theme.trendColor(i.pct30)).frame(width: 44, alignment: .trailing)
                            Text(i.pct60.pct()).font(.system(size: 8.5)).foregroundStyle(Theme.trendColor(i.pct60)).frame(width: 44, alignment: .trailing)
                            Text(i.ma20?.fmt(0) ?? "--").font(.system(size: 9, design: .monospaced)).frame(width: 48, alignment: .trailing)
                            Text(i.ma60?.fmt(0) ?? "--").font(.system(size: 9, design: .monospaced)).frame(width: 48, alignment: .trailing)
                            Text(i.rsi.map { String(format: "%.0f", $0) } ?? "--").font(.system(size: 9)).frame(width: 34, alignment: .trailing)
                            Text((i.macdDif.map { String(format: "%.0f", $0) } ?? "--") + "/" + (i.macdDea.map { String(format: "%.0f", $0) } ?? "--"))
                                .font(.system(size: 8, design: .monospaced)).frame(width: 76, alignment: .trailing)
                            Text(i.tdBuy > 0 ? "买\(i.tdBuy)" : (i.tdSell > 0 ? "卖\(i.tdSell)" : "--"))
                                .font(.system(size: 8.5)).foregroundStyle(i.tdBuy > 0 ? Theme.down : (i.tdSell > 0 ? Theme.up : Theme.textDim)).frame(width: 40, alignment: .trailing)
                            Text(i.bottomDull ? "钝化" : "--").font(.system(size: 8)).foregroundStyle(i.bottomDull ? Theme.up : Theme.textDim).frame(width: 40, alignment: .trailing)
                            Text(i.support?.fmt(0) ?? "--").font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.down).frame(width: 48, alignment: .trailing)
                            Text(i.resistance?.fmt(0) ?? "--").font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.up).frame(width: 48, alignment: .trailing)
                        }
                        .foregroundStyle(Theme.text)
                        .padding(.vertical, 6)
                        SoftDivider()
                    }
                }
            }
        }
    }

    private func hotCard(_ s: MarketState) -> some View {
        Card(title: "热点榜", subtitle: "涨跌最多的 10 只股票") {
            HStack(alignment: .top, spacing: 12) {
                hotColumn("涨幅榜", s.gainers, up: true)
                hotColumn("跌幅榜", s.losers, up: false)
            }
        }
    }

    private func hotColumn(_ title: String, _ list: [Quote], up: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            ForEach(Array(list.prefix(10).enumerated()), id: \.element.id) { i, q in
                NavigationLink {
                    StockDetailView(code: q.code, name: q.name)
                } label: {
                    HStack(spacing: 3) {
                        Text("\(i + 1)").font(.system(size: 8)).foregroundStyle(Theme.textDim).frame(width: 10, alignment: .leading)
                        Text(q.name).font(.system(size: 10)).foregroundStyle(Theme.text).lineLimit(1)
                        Spacer(minLength: 2)
                        Text(q.pct.pct()).font(.system(size: 9.5, weight: .semibold)).foregroundStyle(Theme.trendColor(q.pct))
                    }
                    .padding(.vertical, 2)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func flowCard(_ s: MarketState) -> some View {
        Card(title: "主力追踪", subtitle: "个股 / 行业主力净流入") {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("个股净流入").font(.system(size: 9)).foregroundStyle(Theme.textDim)
                        ForEach(s.inflow.prefix(6)) { q in
                            NavigationLink {
                                StockDetailView(code: q.code, name: q.name)
                            } label: {
                                HStack(spacing: 3) {
                                    Text(q.name).font(.system(size: 10)).foregroundStyle(Theme.text).lineLimit(1)
                                    Spacer(minLength: 2)
                                    Text(shortMoney(q.mainInflow)).font(.system(size: 9, design: .rounded)).foregroundStyle(Theme.up)
                                }
                                .padding(.vertical, 2)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("行业净流入").font(.system(size: 9)).foregroundStyle(Theme.textDim)
                        ForEach(s.industriesIn.prefix(6)) { b in
                            HStack(spacing: 3) {
                                Text(b.name).font(.system(size: 10)).foregroundStyle(Theme.text).lineLimit(1)
                                Spacer(minLength: 2)
                                Text(shortMoney(b.inflow)).font(.system(size: 9, design: .rounded)).foregroundStyle(Theme.up)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack(spacing: 5) {
                    ForEach(s.industriesIn.prefix(4)) { b in
                        Text("行业推荐 · \(b.name)").font(.system(size: 8.5))
                            .padding(.horizontal, 5).padding(.vertical, 3)
                            .background(Theme.accent.opacity(0.08))
                            .foregroundStyle(Theme.accent)
                            .clipShape(Capsule())
                    }
                }
                if !s.outflow.isEmpty {
                    HStack(spacing: 6) {
                        Text("净流出").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                        ForEach(s.outflow.prefix(3)) { q in
                            Text(q.name).font(.system(size: 8.5)).foregroundStyle(Theme.down)
                        }
                    }
                }
            }
        }
    }

    private func industryTrendCard(_ s: MarketState) -> some View {
        Card(title: "行业趋势", subtitle: "资金流入前列行业 · 多周期") {
            VStack(spacing: 0) {
                HStack {
                    Text("行业").frame(maxWidth: .infinity, alignment: .leading)
                    Text("5日").frame(width: 46, alignment: .trailing)
                    Text("20日").frame(width: 46, alignment: .trailing)
                    Text("60日").frame(width: 46, alignment: .trailing)
                    Text("趋势").frame(width: 40, alignment: .trailing)
                }
                .font(.system(size: 8.5)).foregroundStyle(Theme.textDim).padding(.vertical, 4)
                ForEach(s.industryTrends) { b in
                    HStack {
                        Text(b.name).font(.system(size: 10.5)).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                        Text(b.pct5.pct()).font(.system(size: 9)).foregroundStyle(Theme.trendColor(b.pct5)).frame(width: 46, alignment: .trailing)
                        Text(b.pct20.pct()).font(.system(size: 9)).foregroundStyle(Theme.trendColor(b.pct20)).frame(width: 46, alignment: .trailing)
                        Text(b.pct60.pct()).font(.system(size: 9)).foregroundStyle(Theme.trendColor(b.pct60)).frame(width: 46, alignment: .trailing)
                        Text(b.trend ?? "震荡").font(.system(size: 8.5)).foregroundStyle(b.trend == "多头" ? Theme.up : (b.trend == "空头" ? Theme.down : Theme.textDim)).frame(width: 40, alignment: .trailing)
                    }
                    .padding(.vertical, 5)
                    SoftDivider()
                }
                HStack(spacing: 5) {
                    ForEach(s.industriesIn.prefix(4)) { b in
                        Text("关注 · \(b.name)").font(.system(size: 8.5))
                            .padding(.horizontal, 5).padding(.vertical, 3)
                            .background(Theme.accent.opacity(0.08)).foregroundStyle(Theme.accent)
                            .clipShape(Capsule())
                    }
                }
                .padding(.top, 6)
            }
        }
    }

    private func newsCard(_ s: MarketState) -> some View {
        Card(title: "行情要闻", subtitle: "7×24 快讯 · 推荐关注") {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(news.prefix(6)) { n in
                    Link(destination: URL(string: n.url ?? "") ?? URL(string: "https://finance.eastmoney.com/")!) {
                        HStack(alignment: .top, spacing: 6) {
                            Text(String(n.time.suffix(5))).font(.system(size: 8.5, design: .monospaced)).foregroundStyle(Theme.textDim)
                            Text(n.title).font(.system(size: 10.5)).foregroundStyle(Theme.text).lineLimit(2)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 2)
                    }
                }
                HStack(spacing: 5) {
                    ForEach(s.top.prefix(4)) { b in
                        Text("关注 · \(b.name)").font(.system(size: 8.5))
                            .padding(.horizontal, 5).padding(.vertical, 3)
                            .background(Theme.up.opacity(0.07)).foregroundStyle(Theme.up)
                            .clipShape(Capsule())
                    }
                }
                .padding(.top, 4)
            }
        }
    }

    private var indicatorNotes: some View {
        Card(title: "指标说明与分析逻辑", subtitle: "怎么看这些数字") {
            VStack(alignment: .leading, spacing: 5) {
                ForEach([
                    "MA5/10/20/60：短中长期均线，价格站上且多头排列偏强，跌破 MA20/60 警惕。",
                    "RSI(14)：>70 超买、<30 超卖；低位钝化后拐头可能是底部信号，需量价确认。",
                    "MACD：DIF 上穿 DEA 为金叉，绿柱缩短代表下跌动能减弱，零轴上方金叉更可靠。",
                    "九转：连续 9 根收盘价低于/高于 4 日前收盘价，提示下跌/上涨动能衰竭。",
                    "底部钝化：60 日低位 + RSI 连续低位数日后拐头，或 MACD 绿柱缩短，属于左侧观察信号。",
                    "主力净流入：超大单+大单净额，单日易受大单影响，需结合连续性。",
                ], id: \.self) { line in
                    Text("· " + line).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineSpacing(2)
                }
            }
        }
    }

    private func load() async {
        loading = true
        let s = await MarketService.shared.marketState()
        state = s
        advice = AdviceEngine.compute(summary: store.summary, state: s)
        news = await MarketService.shared.marketNews(limit: 8)
        loading = false
        picking = true
        let spot = (try? await MarketService.shared.spot())?.rows ?? []
        let candidates = spot.sorted { ($0.amount ?? 0) > ($1.amount ?? 0) }
        picks = await PatternEngine.picks(candidates: candidates, limit: 80, top: 12)
        picking = false
    }
}
