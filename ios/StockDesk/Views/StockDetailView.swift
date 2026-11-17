import SwiftUI

struct StockDetailView: View {
    let code: String
    let name: String

    @EnvironmentObject private var store: AppStore
    @State private var detail: StockDetail?
    @State private var klines: [KLine] = []
    @State private var period = "daily"
    @State private var adjust = "qfq"
    @State private var showTrade = false
    @State private var showAlert = false
    @State private var chip: ChipResult?
    @State private var fib: [FibLevel] = []
    @State private var loading = true

    var q: Quote? { detail?.quote }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                header
                quoteGrid
                if store.hasFlag("-chip"), let chip { chipCard(chip) }
                if store.hasFlag("-fib") && !fib.isEmpty { fibCard }
                chartCard
                if !store.hasFlag("-chip"), let chip { chipCard(chip) }
                if !store.hasFlag("-fib") && !fib.isEmpty { fibCard }
                if let detail {
                    profileCard(detail)
                    financialCard(detail.financials)
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 96)
        }
        .background(Theme.bg)
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showTrade = true } label: { Label("记录交易", systemImage: "plus.circle") }
                    Button {
                        store.toggleWatch(code, name: q?.name ?? name)
                    } label: {
                        Label(store.isWatched(code) ? "移出自选" : "加入自选",
                              systemImage: store.isWatched(code) ? "star.slash" : "star")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showTrade) {
            TradeEditorView(trade: nil, presetCode: code, presetName: q?.name ?? name) { t in
                try? store.addTrade(t)
            }
        }
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(q?.name ?? name).font(.system(size: 22, weight: .bold)).foregroundStyle(Theme.text)
                Text(code).font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.textDim)
                Spacer()
            }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(q?.price.fmt() ?? "--")
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.trendColor(q?.pct))
                Text(q?.chg.map { $0.signed() } ?? "--")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.trendColor(q?.pct))
                Text(q?.pct.pct() ?? "--")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Theme.trendColor(q?.pct).opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 5))
                    .foregroundStyle(Theme.trendColor(q?.pct))
            }
            Text("昨收 \(q?.prevClose.fmt() ?? "--") · 今开 \(q?.open.fmt() ?? "--") · 最高 \(q?.high.fmt() ?? "--") · 最低 \(q?.low.fmt() ?? "--")")
                .font(.system(size: 11)).foregroundStyle(Theme.textDim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
    }

    private var quoteGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            miniCell("成交额", shortMoney(q?.amount))
            miniCell("换手率", q?.turnover.map { String(format: "%.2f%%", $0) } ?? "--")
            miniCell("市盈率", q?.pe.fmt() ?? "--")
            miniCell("市净率", q?.pb.fmt() ?? "--")
            miniCell("总市值", shortMoney(q?.mcap))
            miniCell("量比", q?.volumeRatio.fmt() ?? "--")
        }
    }

    private func miniCell(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(k).font(.system(size: 10)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
    }

    private var chartCard: some View {
        Card(title: "K 线走势", subtitle: "近 60 个交易日") {
            VStack(spacing: 10) {
                HStack(spacing: 6) {
                    seg("日K", "daily")
                    seg("周K", "weekly")
                    seg("月K", "monthly")
                    Spacer()
                    Picker("复权", selection: $adjust) {
                        Text("前复权").tag("qfq")
                        Text("不复权").tag("")
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 120)
                }
                if klines.isEmpty {
                    ProgressView().frame(height: 240)
                } else {
                    CandleChart(rows: klines, height: 240, fib: fib)
                }
            }
        }
        .onChange(of: period) { _, _ in Task { await loadKlines() } }
        .onChange(of: adjust) { _, _ in Task { await loadKlines() } }
    }

    private func seg(_ label: String, _ value: String) -> some View {
        Button {
            period = value
        } label: {
            Text(label)
                .font(.system(size: 12, weight: period == value ? .semibold : .regular))
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(period == value ? Theme.accent.opacity(0.12) : Color.clear)
                .foregroundStyle(period == value ? Theme.accent : Theme.textSub)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
    }

    private func chipCard(_ c: ChipResult) -> some View {
        Card(title: "筹码分布", subtitle: "近 120 日 · 成交量按价格分布") {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    chipMetric("平均成本", c.avgCost.fmt(2))
                    chipMetric("获利比例", c.profitRatio.pct(1), color: c.profitRatio >= 50 ? Theme.up : Theme.down)
                    chipMetric("集中度", c.concentration.fmt(1) + "%")
                }
                HStack(spacing: 8) {
                    chipMetric("90% 成本", c.costLow.fmt(0) + " ~ " + c.costHigh.fmt(0))
                    chipMetric("筹码峰", c.peak.fmt(2))
                    chipMetric("评分", "\(c.score)", color: c.up ? Theme.up : Theme.textSub)
                }

                ChipChart(chip: c, height: 210)

                HStack(spacing: 8) {
                    Text("支撑 " + c.support.fmt(2))
                        .font(.system(size: 10.5, weight: .medium, design: .monospaced))
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(Theme.down.opacity(0.1))
                        .foregroundStyle(Theme.down)
                        .clipShape(RoundedRectangle(cornerRadius: 5))
                    Text("压力 " + c.resistance.fmt(2))
                        .font(.system(size: 10.5, weight: .medium, design: .monospaced))
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(Theme.up.opacity(0.1))
                        .foregroundStyle(Theme.up)
                        .clipShape(RoundedRectangle(cornerRadius: 5))
                    Spacer()
                    Text(c.verdict)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(c.up ? Theme.up : Theme.textSub)
                }

                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(c.comments.enumerated()), id: \.offset) { _, line in
                        Text("· " + line)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.textSub)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                Text("筹码分布为技术参考，不构成投资建议。")
                    .font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func chipMetric(_ k: String, _ v: String, color: Color = Theme.text) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(k).font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundStyle(color).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Theme.cardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private var fibCard: some View {
        Card(title: "黄金分割位", subtitle: "近 120 日高低点") {
            VStack(spacing: 0) {
                HStack {
                    Text("位置").frame(width: 56, alignment: .leading)
                    Text("价格").frame(maxWidth: .infinity, alignment: .trailing)
                    Text("距现价").frame(width: 56, alignment: .trailing)
                    Text("操作参考").frame(width: 86, alignment: .trailing)
                }
                .font(.system(size: 9)).foregroundStyle(Theme.textDim)
                .padding(.vertical, 5)
                SoftDivider()
                ForEach(fib) { l in
                    HStack(spacing: 4) {
                        HStack(spacing: 2) {
                            Text(l.name).font(.system(size: 10.5, weight: .medium))
                            Text(l.kind == "支撑" ? "撑" : "压").font(.system(size: 8))
                                .foregroundStyle(l.kind == "支撑" ? Theme.down : Theme.up)
                        }
                        .frame(width: 56, alignment: .leading)
                        Text(l.price.fmt(2)).font(.system(size: 9.5, design: .monospaced))
                            .lineLimit(1).minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                        Text(l.distance.signed(1) + "%").font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(Theme.trendColor(l.distance)).frame(width: 56, alignment: .trailing)
                        Text(l.action).font(.system(size: 7.5)).foregroundStyle(Theme.accent)
                            .frame(width: 86, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.65)
                    }
                    .foregroundStyle(Theme.text)
                    .padding(.vertical, 6)
                    SoftDivider()
                }
                Text("黄金分割与筹码分布均为技术参考，不构成投资建议。")
                    .font(.system(size: 9)).foregroundStyle(Theme.textDim)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
            }
        }
    }

    private func profileCard(_ d: StockDetail) -> some View {
        Card(title: "公司概况", subtitle: d.profile?.industry) {
            VStack(spacing: 0) {
                StatLine(title: "公司全称", value: d.profile?.orgName ?? "--")
                StatLine(title: "所属行业", value: d.profile?.industry ?? "--")
                StatLine(title: "上市日期", value: d.profile?.listingDate ?? "--")
                StatLine(title: "成立日期", value: d.profile?.foundDate ?? "--")
                StatLine(title: "注册资本", value: d.profile?.regCapital.map { String(format: "%.2f 亿", $0 / 1e4) } ?? "--")
                StatLine(title: "员工人数", value: d.profile?.employees.map { String(format: "%.0f 人", $0) } ?? "--")
                StatLine(title: "董事长", value: d.profile?.chairman ?? "--")
                StatLine(title: "董秘", value: d.profile?.secretary ?? "--")
                StatLine(title: "法人代表", value: d.profile?.legalPerson ?? "--")
                StatLine(title: "统一信用代码", value: d.profile?.regNum ?? "--")
                StatLine(title: "注册地址", value: d.profile?.address ?? "--")
                StatLine(title: "公司网站", value: d.profile?.website ?? "--")
                StatLine(title: "电子邮箱", value: d.profile?.email ?? "--")
                StatLine(title: "联系电话", value: d.profile?.tel ?? "--")
                if let m = d.profile?.mainBusiness, !m.isEmpty {
                    Text("主营：" + m).font(.system(size: 10.5)).foregroundStyle(Theme.textSub)
                        .padding(.top, 6).frame(maxWidth: .infinity, alignment: .leading)
                }
                if let scope = d.profile?.businessScope, !scope.isEmpty {
                    Text("经营范围：" + scope).font(.system(size: 10.5)).foregroundStyle(Theme.textSub)
                        .padding(.top, 4).frame(maxWidth: .infinity, alignment: .leading)
                }
                if let text = d.profile?.profile, !text.isEmpty {
                    Text(text)
                        .font(.system(size: 10.5))
                        .foregroundStyle(Theme.textSub)
                        .lineLimit(8)
                        .padding(.top, 6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func financialCard(_ fins: [Financial]) -> some View {
        Card(title: "财务指标", subtitle: "最近 \(fins.count) 个报告期") {
            if fins.isEmpty {
                Text("暂无财务数据").font(.system(size: 12)).foregroundStyle(Theme.textDim).frame(maxWidth: .infinity, minHeight: 60)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(spacing: 0) {
                        HStack(spacing: 0) {
                            Text("报告期").frame(width: 86, alignment: .leading)
                            Text("EPS").frame(width: 54, alignment: .trailing)
                            Text("ROE").frame(width: 54, alignment: .trailing)
                            Text("营收同比").frame(width: 68, alignment: .trailing)
                            Text("净利同比").frame(width: 68, alignment: .trailing)
                            Text("毛利率").frame(width: 58, alignment: .trailing)
                        }
                        .font(.system(size: 10)).foregroundStyle(Theme.textDim)
                        .padding(.vertical, 6)
                        SoftDivider()
                        ForEach(fins) { f in
                            HStack(spacing: 0) {
                                Text(f.period).font(.system(size: 11.5, weight: .medium)).frame(width: 86, alignment: .leading)
                                Text(f.eps.fmt(2)).frame(width: 54, alignment: .trailing)
                                Text(f.roe.map { String(format: "%.1f%%", $0) } ?? "--")
                                    .foregroundStyle(f.roe.map { $0 >= 10 } == true ? Theme.up : Theme.text)
                                    .frame(width: 54, alignment: .trailing)
                                Text(f.revenueYoy.pct(1)).foregroundStyle(Theme.trendColor(f.revenueYoy)).frame(width: 68, alignment: .trailing)
                                Text(f.profitYoy.pct(1)).foregroundStyle(Theme.trendColor(f.profitYoy)).frame(width: 68, alignment: .trailing)
                                Text(f.grossMargin.map { String(format: "%.0f%%", $0) } ?? "--").frame(width: 58, alignment: .trailing)
                            }
                            .font(.system(size: 11, design: .rounded))
                            .foregroundStyle(Theme.text)
                            .padding(.vertical, 7)
                            SoftDivider()
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        async let d = fetchDetail()
        async let k = fetchKlines()
        detail = await d
        klines = await k
        if let rows = try? await MarketService.shared.klines(code, period: "daily", limit: 160, adjust: "") {
            chip = ChipEngine.compute(rows)
            fib = FibEngine.compute(rows)
        }
    }

    private func fetchDetail() async -> StockDetail? {
        guard let quote = try? await MarketService.shared.quote(code) else { return nil }
        async let p = MarketService.shared.profile(code)
        async let f = MarketService.shared.financials(code)
        return StockDetail(quote: quote, profile: await p, financials: await f, isWatched: store.isWatched(code))
    }

    private func fetchKlines() async -> [KLine] {
        (try? await MarketService.shared.klines(code, period: period, limit: 320, adjust: adjust)) ?? []
    }

    private func loadKlines() async {
        klines = await fetchKlines()
    }
}
