import SwiftUI

struct AnalyticsView: View {
    @EnvironmentObject private var store: AppStore
    var embedded = false
    @State private var result: AnalyticsResult?
    @State private var market: MarketState?
    @State private var advice: PositionAdvice?
    @State private var loading = true

    var body: some View {
        Group {
            if embedded {
                content.navigationTitle("收益复盘")
            } else {
                NavigationStack {
                    content
                        .navigationTitle("收益复盘")
                        .navigationBarTitleDisplayMode(.inline)
                }
            }
        }
    }

    private var content: some View {
        ScrollView {
            VStack(spacing: 12) {
                if loading {
                    ProgressView().padding(.top, 80)
                } else if let r = result, !r.isEmpty {
                    metricsGrid(r)
                    ReviewSummaryView(r: r, market: market, advice: advice)
                    if let advice { AdviceCardView(a: advice) }
                    if let market {
                        Card(title: "趋势分析", subtitle: "净值 vs 20/60 日均线") {
                            NavTrendView(series: r.series)
                        }
                        MarketVerdictView(s: market)
                        MarketSituationView(s: market)
                    }
                    navCard(r)
                    drawdownCard(r)
                    monthlyCard(r)
                    benchmarkCard(r)
                    statsCard(r)
                    if !r.byStock.isEmpty { contributionCard(r) }
                } else {
                    ContentUnavailableView("还没有交易记录", systemImage: "chart.line.uptrend.xyaxis",
                                           description: Text("先到持仓页记录一笔买卖"))
                        .padding(.top, 80)
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 96)
        }
        .background(Theme.bg)
        .refreshable { await load() }
        .task { await load() }
    }

    private func metricsGrid(_ r: AnalyticsResult) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            KpiTile(title: "累计收益率", value: r.metrics.totalReturn.pct(),
                    color: Theme.trendColor(r.metrics.totalReturn), sub: "净值 \(String(format: "%.3f", r.metrics.finalNav)) · \(r.metrics.days) 天")
            KpiTile(title: "年化收益", value: r.metrics.annualReturn.pct(),
                    color: Theme.trendColor(r.metrics.annualReturn), sub: "基准 \(r.metrics.benchmarkReturn.pct())")
            KpiTile(title: "最大回撤", value: r.metrics.maxDrawdown.pct(),
                    color: Theme.down, sub: "夏普 \(String(format: "%.2f", r.metrics.sharpe))")
            KpiTile(title: "超额收益", value: r.metrics.excessReturn.pct(),
                    color: Theme.trendColor(r.metrics.excessReturn),
                    sub: "沪深300 · 上证 \(r.shExcess.signed(1))pp")
        }
    }

    private func navCard(_ r: AnalyticsResult) -> some View {
        Card(title: "净值曲线", subtitle: "累计收益 · 与沪深300对比") {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 12) {
                    legend("账户", Theme.accent)
                    legend("沪深300", Theme.purple)
                }
                NavLineChart(series: r.series, benchmark: r.benchmark, height: 190)
            }
        }
    }

    private func benchmarkCard(_ r: AnalyticsResult) -> some View {
        Card(title: "基准对比", subtitle: "区间收益与超额") {
            HStack(spacing: 0) {
                benchCell("沪深300", r.metrics.benchmarkReturn, r.metrics.excessReturn)
                Rectangle().fill(Theme.border).frame(width: 1, height: 34)
                benchCell("上证指数", r.shReturn, r.shExcess)
            }
        }
    }

    private func benchCell(_ name: String, _ ret: Double, _ excess: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(name).font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
            HStack(spacing: 6) {
                Text(ret.pct()).font(.system(size: 14, weight: .semibold, design: .rounded)).foregroundStyle(Theme.trendColor(ret))
                Text("超额 " + excess.signed(1) + "pp").font(.system(size: 10)).foregroundStyle(Theme.trendColor(excess))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 6)
    }

    private func drawdownCard(_ r: AnalyticsResult) -> some View {
        Card(title: "回撤分析", subtitle: "从历史高点回落") {
            DrawdownChart(points: r.drawdown, height: 130)
        }
    }

    private func monthlyCard(_ r: AnalyticsResult) -> some View {
        Card(title: "月度收益", subtitle: "单位 %") {
            let byYear = Dictionary(grouping: r.monthly) { String($0.month.prefix(4)) }
            VStack(alignment: .leading, spacing: 8) {
                ForEach(byYear.keys.sorted(), id: \.self) { year in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(year).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.textSub)
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 6), spacing: 4) {
                            ForEach(1...12, id: \.self) { m in
                                let key = String(format: "%@-%02d", year, m)
                                let item = r.monthly.first { $0.month == key }
                                monthCell(item?.ret)
                            }
                        }
                    }
                    .padding(.bottom, 4)
                }
            }
        }
    }

    private func monthCell(_ v: Double?) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5)
                .fill(v == nil ? Theme.cardSoft : Theme.trendColor(v).opacity(min(0.95, 0.3 + abs(v ?? 0) / 12)))
            Text(v.map { String(format: "%.1f", $0) } ?? "")
                .font(.system(size: 9.5, weight: .semibold))
                .foregroundStyle(v == nil ? .clear : .white)
        }
        .frame(height: 26)
    }

    private func statsCard(_ r: AnalyticsResult) -> some View {
        Card(title: "交易统计", subtitle: "FIFO 平仓配对") {
            HStack(alignment: .top, spacing: 18) {
                VStack(spacing: 0) {
                    StatLine(title: "平仓笔数", value: "\(r.stats.closedCount)")
                    StatLine(title: "胜率", value: r.stats.winCount > 0 ? (r.stats.winRate?.fmt(1) ?? "--") + "%" : "--",
                             valueColor: (r.stats.winRate ?? 0) >= 50 ? Theme.up : Theme.down)
                    StatLine(title: "盈亏比", value: r.stats.profitFactor.map { String(format: "%.2f", $0) } ?? "--")
                }
                VStack(spacing: 0) {
                    StatLine(title: "平均盈利", value: r.stats.avgWin.signed(), valueColor: Theme.up)
                    StatLine(title: "平均亏损", value: r.stats.avgLoss.signed(), valueColor: Theme.down)
                    StatLine(title: "波动率", value: r.metrics.volatility.pct())
                }
            }
        }
    }

    private func contributionCard(_ r: AnalyticsResult) -> some View {
        Card(title: "个股贡献", subtitle: "已实现盈亏") {
            VStack(spacing: 0) {
                ForEach(r.byStock.prefix(8)) { c in
                    HStack {
                        Text(c.name).font(.system(size: 12.5)).foregroundStyle(Theme.text)
                        Text(c.code).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.textDim)
                        Spacer()
                        Text("\(c.wins)/\(c.count)").font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                        Text(c.pnl.signed()).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.trendColor(c.pnl))
                    }
                    .padding(.vertical, 7)
                    if c.id != r.byStock.prefix(8).last?.id { SoftDivider() }
                }
            }
        }
    }

    private func legend(_ s: String, _ c: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(c).frame(width: 6, height: 6)
            Text(s).font(.system(size: 10.5)).foregroundStyle(Theme.textSub)
        }
    }

    private func load() async {
        loading = true
        async let m = MarketService.shared.marketState()
        let r = await store.analytics()
        result = r
        market = await m
        if let m = market, !r.isEmpty {
            advice = AdviceEngine.compute(summary: store.summary, state: m,
                                         drawdown: (r.drawdown.last?.bench ?? 0) * 100,
                                         volatility: r.metrics.volatility)
        }
        loading = false
    }
}
