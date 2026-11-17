import SwiftUI

struct DashboardView: View {
    var embedded = false
    @EnvironmentObject private var store: AppStore
    @State private var showSearch = false
    @State private var ranking: [Quote] = []
    @State private var inflows: [Quote] = []

    private var s: PortfolioSummary { store.summary }

    var body: some View {
        if embedded {
            dashboardContent
        } else {
            NavigationStack { dashboardContent }
        }
    }

    private var dashboardContent: some View {
            ScrollView {
                VStack(spacing: 12) {
                    hero
                    kpis
                    navCard
                    watchCard
                    rankings
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 96)
            }
            .background(Theme.bg)
            .refreshable { await store.refreshAll(); await loadRankings() }
            .navigationTitle("投资总览")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSearch = true } label: { Image(systemName: "magnifyingglass") }
                }
            }
            .sheet(isPresented: $showSearch) { SearchSheet() }
            .task { await loadRankings() }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("总资产 · 股票账户").font(.system(size: 11.5)).foregroundStyle(Theme.textSub)
                    Text("¥ " + s.total.fmt())
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.text)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
                Spacer()
                Text("实时")
                    .font(.system(size: 10, weight: .medium))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.white.opacity(0.7))
                    .clipShape(Capsule())
                    .foregroundStyle(Theme.accent)
            }
            HStack(spacing: 8) {
                Image(systemName: Theme.trendArrow(s.totalPnl))
                    .font(.system(size: 11, weight: .bold))
                Text(s.totalPnl.signed())
                Text(s.totalPct.pct())
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Theme.trendColor(s.totalPct).opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 5))
                Spacer()
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.trendColor(s.totalPnl))

            HStack(alignment: .top) {
                miniStat("持仓市值", "¥" + s.marketValue.fmt())
                Spacer()
                miniStat("可用现金", "¥" + s.cash.fmt())
                Spacer()
                miniStat("今日盈亏", s.hasTrades ? PortfolioEngine.todayPnl(positions: s.positions).signed() : "0.00",
                         color: Theme.trendColor(PortfolioEngine.todayPnl(positions: s.positions)))
                Spacer()
                miniStat("持仓", "\(s.positions.count) 只")
            }
        }
        .padding(16)
        .background(Theme.heroGradient)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
    }

    private func miniStat(_ k: String, _ v: String, color: Color = Theme.text) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(k).font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(color)
        }
    }

    private var kpis: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            KpiTile(title: "浮动盈亏", value: s.floatPnl.signed(), color: Theme.trendColor(s.floatPnl),
                    sub: "成本 ¥\(s.cost.fmt())")
            KpiTile(title: "已实现盈亏", value: s.realized.signed(), color: Theme.trendColor(s.realized),
                    sub: "卖出落地收益")
            KpiTile(title: "累计收益率", value: s.totalPct.pct(), color: Theme.trendColor(s.totalPct),
                    sub: "初始资产 ¥\(s.startCapital.fmt())")
            KpiTile(title: "现金仓位", value: s.total > 0 ? String(format: "%.1f%%", s.cash / s.total * 100) : "--",
                    color: Theme.text, sub: "可用 ¥\(s.cash.fmt())")
        }
    }

    private var navCard: some View {
        NavigationLink { AnalyticsView(embedded: true) } label: {
            Card(title: "账户净值", subtitle: "与沪深300对比") {
                NavMiniChart()
            }
        }
        .buttonStyle(.plain)
    }

    private var watchCard: some View {
        Card(title: "自选观察", subtitle: "\(store.watchlist.count) 只",
             trailing: AnyView(NavigationLink("全部") { WatchlistView(embedded: true) }.font(.system(size: 12)))) {
            if store.watchlist.isEmpty {
                Text("还没有自选股").font(.system(size: 12)).foregroundStyle(Theme.textDim).frame(maxWidth: .infinity, minHeight: 60)
            } else {
                VStack(spacing: 0) {
                    ForEach(store.watchlist.prefix(5)) { w in
                        NavigationLink {
                            StockDetailView(code: w.code, name: w.name)
                        } label: {
                            HStack {
                                AvatarView(name: w.name)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(w.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.text)
                                    Text(w.code).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Theme.textDim)
                                }
                                Spacer()
                                let q = store.watchQuotes[w.code]
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(q?.price.fmt() ?? "--").font(.system(size: 13, weight: .semibold, design: .rounded))
                                    Text(q?.pct.pct() ?? "--").font(.system(size: 11)).foregroundStyle(Theme.trendColor(q?.pct))
                                }
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if w.id != store.watchlist.prefix(5).last?.id { SoftDivider() }
                    }
                }
            }
        }
    }

    private var rankings: some View {
        HStack(alignment: .top, spacing: 10) {
            Card(title: "今日涨幅", subtitle: "全市场") {
                VStack(spacing: 7) {
                    ForEach(ranking.prefix(5)) { q in
                        NavigationLink { StockDetailView(code: q.code, name: q.name) } label: {
                            HStack {
                                Text(q.name).font(.system(size: 12)).foregroundStyle(Theme.text).lineLimit(1)
                                Spacer()
                                Text(q.pct.pct()).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(Theme.trendColor(q.pct))
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    if ranking.isEmpty { ProgressView().controlSize(.small) }
                }
            }
            Card(title: "资金流入", subtitle: "主力") {
                VStack(spacing: 7) {
                    ForEach(inflows.prefix(5)) { q in
                        NavigationLink { StockDetailView(code: q.code, name: q.name) } label: {
                            HStack {
                                Text(q.name).font(.system(size: 12)).foregroundStyle(Theme.text).lineLimit(1)
                                Spacer()
                                Text(shortMoney(q.mainInflow)).font(.system(size: 10.5, weight: .medium))
                                    .foregroundStyle(Theme.trendColor(q.mainInflow))
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    if inflows.isEmpty { ProgressView().controlSize(.small) }
                }
            }
        }
    }

    private func loadRankings() async {
        ranking = await MarketService.shared.ranking(by: "pct", limit: 5)
        inflows = await MarketService.shared.ranking(by: "inflow", limit: 5)
    }
}

struct KpiTile: View {
    let title: String
    let value: String
    var color: Color = Theme.text
    let sub: String
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 11)).foregroundStyle(Theme.textSub)
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(color)
                .minimumScaleFactor(0.7).lineLimit(1)
            Text(sub).font(.system(size: 10)).foregroundStyle(Theme.textDim).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
    }
}

struct AvatarView: View {
    let name: String
    var body: some View {
        Text(String(name.prefix(1)))
            .font(.system(size: 12, weight: .bold))
            .frame(width: 30, height: 30)
            .background(Theme.accent.opacity(0.1))
            .foregroundStyle(Theme.accent)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

/// Compact NAV sparkline used on the dashboard.
struct NavMiniChart: View {
    @State private var result: AnalyticsResult?
    @EnvironmentObject private var store: AppStore

    var body: some View {
        Group {
            if let r = result, !r.isEmpty, r.series.count > 2 {
                LineSpark(points: r.series.map(\.nav), height: 90)
                    .overlay(alignment: .topTrailing) {
                        Text(r.metrics.totalReturn.pct())
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.trendColor(r.metrics.totalReturn))
                    }
            } else {
                HStack {
                    Spacer()
                    VStack(spacing: 6) {
                        Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 22)).foregroundStyle(Theme.textDim.opacity(0.5))
                        Text(result == nil ? "加载中…" : "记录交易后显示净值").font(.system(size: 11)).foregroundStyle(Theme.textDim)
                    }
                    Spacer()
                }
                .frame(height: 90)
            }
        }
        .task { result = await store.analytics() }
    }
}
