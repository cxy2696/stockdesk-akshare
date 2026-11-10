import SwiftUI

struct RootTabView: View {
    var body: some View {
        MoreView()
    }
}

struct InvestHudHeader: View {
    @Binding var path: [String]
    @EnvironmentObject private var store: AppStore
    @State private var showSearch = false
    @AppStorage("stockdesk.lang") private var lang = "zh"
    @AppStorage("stockdesk.uiScale") private var uiScale = 1.0
    @State private var showHub = false
    @AppStorage("stockdesk.admin.name") private var adminName = "StockDesk"
    @AppStorage("stockdesk.admin.uid") private var adminUid = "LOCAL-0001"

    private let left: [(String, String, String)] = [
        ("每日策略", "calendar", "daily"),
        ("板块跟踪", "square.grid.3x3.fill", "market"),
        ("收益复盘", "chart.line.uptrend.xyaxis", "analytics"),
    ]
    private let right: [(String, String, String)] = [
        ("策略回测", "flask.fill", "backtest"),
        ("地域", "mappin.and.ellipse", "regions"),
        ("行业要闻", "newspaper.fill", "industry-news"),
        ("量化模型", "brain.head.profile", "models"),
    ]

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 14) {
                icon("gearshape", "settings")
                icon("bell", "anomaly")
                icon("envelope", "notes")
                icon("star", "watchlist")
                Button { showSearch = true } label: {
                    Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(Theme.textSub)
                        .frame(width: 26, height: 26)
                        .background(Theme.cardSoft)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(Theme.borderSoft, lineWidth: 1))
                }
                .buttonStyle(.plain)

                if uiScale < 1.4 {
                    Spacer()
                    Text("COMMAND DECK").font(.system(size: 8, design: .monospaced)).foregroundStyle(Theme.accent).tracking(1.4)
                }
            }
            .padding(.horizontal, 6)

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 8) {
                    VStack(spacing: 7) { ForEach(left.indices, id: \.self) { item(left[$0]) } }
                        .frame(width: 98)
                    hudMap.frame(width: 270, height: 270)
                    VStack(spacing: 7) { ForEach(right.indices, id: \.self) { item(right[$0]) } }
                        .frame(width: 98)
                }
                .frame(minWidth: 700)
                VStack(spacing: 10) {
                    hudMap.frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fit)
                    if uiScale >= 1.4 {
                        VStack(spacing: 7) {
                            ForEach(Array((left + right).enumerated()), id: \.offset) { _, d in item(d) }
                        }
                    } else {
                        HStack(alignment: .top, spacing: 8) {
                            VStack(spacing: 7) {
                                ForEach(left.indices, id: \.self) { item(left[$0]) }
                            }
                            VStack(spacing: 7) {
                                ForEach(right.indices, id: \.self) { item(right[$0]) }
                            }
                        }
                    }
                }
            }

            profile
        }
        .padding(.vertical, 4)
        .sheet(isPresented: $showSearch) {
            SearchSheet(onSelect: { q in path.append("stock:\(q.code)") })
        }
        .confirmationDialog("资产中枢", isPresented: $showHub, titleVisibility: .visible) {
            Button("资产分析") { path.append("asset-analysis") }
            Button("投资建议") { path.append("advice-center") }
            Button("指数分析") { path.append("index-analysis") }
            Button("持仓管理") { path.append("portfolio") }
            Button("取消", role: .cancel) {}
        } message: {
            Text("总资产 ¥\(store.summary.total.fmt()) · 仓位 \((store.summary.total > 0 ? store.summary.marketValue / store.summary.total * 100 : 0).pct(0))")
        }
    }

    private func icon(_ name: String, _ route: String?) -> some View {
        Button {
            if let route { path.append(route) }
        } label: {
            Image(systemName: name).font(.system(size: 11)).foregroundStyle(Theme.textSub)
                .frame(width: 26, height: 26)
                .background(Theme.cardSoft)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(Theme.borderSoft, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func item(_ data: (String, String, String)) -> some View {
        Button {
            path.append(data.2)
        } label: {
            itemLabel(data)
        }
        .buttonStyle(.plain)
    }

    private func itemLabel(_ data: (String, String, String)) -> some View {
        let en = ["每日策略": "Daily Plan", "板块跟踪": "Sectors", "收益复盘": "Review",
                  "策略回测": "Backtest", "地域": "Regions", "行业要闻": "Industry News",
                  "量化模型": "Quant Models"][data.0] ?? data.0
        return HStack(spacing: 7) {
            Image(systemName: data.1).font(.system(size: 12)).foregroundStyle(.black).frame(width: 16)
            Text(lang == "en" ? en : data.0).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(.black).lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(silver)
        .clipShape(HudParallelogram())
    }

    private var silver: LinearGradient {
        LinearGradient(colors: [Color(hex: 0xECECEC), Color(hex: 0xCFCFCF), Color(hex: 0xA8A8A8)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var hudMap: some View {
        ZStack {
            Canvas { ctx, size in
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let r = min(size.width, size.height) / 2 - 2
                let disc = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
                ctx.fill(disc, with: .color(Color(hex: 0x0A0F0E)))
                ctx.stroke(disc, with: .color(Color(hex: 0x30362F)), lineWidth: 1.4)
                ctx.stroke(Path(ellipseIn: CGRect(x: c.x - r * 0.82, y: c.y - r * 0.82, width: r * 1.64, height: r * 1.64)),
                           with: .color(Color(hex: 0x3B4237).opacity(0.7)), style: StrokeStyle(lineWidth: 0.8, dash: [2, 7]))
                func poly(_ pts: [(Double, Double)], fill: Color, stroke: Color) {
                    var p = Path()
                    for (i, pt) in pts.enumerated() {
                        let point = CGPoint(x: c.x + (pt.0 - 0.5) * r * 2, y: c.y + (pt.1 - 0.5) * r * 2)
                        if i == 0 { p.move(to: point) } else { p.addLine(to: point) }
                    }
                    p.closeSubpath()
                    ctx.fill(p, with: .color(fill))
                    ctx.stroke(p, with: .color(stroke), lineWidth: 0.8)
                }
                let g1 = Color(hex: 0x232A22), s1 = Color(hex: 0x3A4136)
                poly([(0.23, 0.26), (0.38, 0.20), (0.47, 0.27), (0.44, 0.40), (0.29, 0.42)], fill: g1, stroke: s1)
                poly([(0.53, 0.18), (0.70, 0.22), (0.74, 0.34), (0.64, 0.42), (0.53, 0.35)], fill: g1, stroke: s1)
                poly([(0.20, 0.52), (0.34, 0.46), (0.46, 0.54), (0.42, 0.70), (0.27, 0.74), (0.18, 0.65)], fill: g1, stroke: s1)
                poly([(0.56, 0.52), (0.70, 0.47), (0.80, 0.57), (0.76, 0.73), (0.61, 0.75), (0.52, 0.66)], fill: g1, stroke: s1)
                let y = Color(hex: 0xB8A63C), ys = Color(hex: 0xE2CF58)
                poly([(0.35, 0.38), (0.48, 0.34), (0.58, 0.40), (0.56, 0.54), (0.43, 0.57), (0.34, 0.50)], fill: y.opacity(0.85), stroke: ys)
                poly([(0.43, 0.57), (0.56, 0.54), (0.62, 0.64), (0.54, 0.73), (0.42, 0.69)], fill: y.opacity(0.8), stroke: ys)
                for (x, col) in [(0.27, Color(hex: 0xF2C94C)), (0.72, Color(hex: 0x55D6C2)), (0.50, Color(hex: 0xB08CFF))] {
                    let dot = Path(ellipseIn: CGRect(x: c.x + (x - 0.5) * r * 1.6, y: c.y - r * 0.55, width: 5, height: 5))
                    ctx.fill(dot, with: .color(col))
                }
            }
            Circle()
                .trim(from: 0, to: 0.10)
                .stroke(Theme.accent.opacity(0.65), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .padding(4)
                .rotationEffect(.degrees(scan ? 360 : 0))
                .animation(.linear(duration: 8).repeatForever(autoreverses: false), value: scan)
            VStack(spacing: 3) {
                Text("资产中枢").font(.system(size: 15, weight: .bold)).tracking(2).foregroundStyle(.white)
                HStack(spacing: 4) {
                    Circle().fill(Theme.accent).frame(width: 4, height: 4)
                    Text("运行中").font(.system(size: 8)).tracking(1.4).foregroundStyle(Theme.accent)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .contentShape(Circle())
        .onTapGesture { path.append("portfolio") }
        .onAppear { scan = true }
    }

    private var profile: some View {
        HStack(spacing: 10) {
            Text("S").font(.system(size: 17, weight: .heavy)).foregroundStyle(.black)
                .frame(width: 40, height: 44)
                .background(LinearGradient(colors: [Theme.accent, Color(hex: 0x8A6D14)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .clipShape(Hexagon())
            VStack(alignment: .leading, spacing: 2) {
                Text(adminName + (lang == "en" ? "  Admin" : " 管理员")).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(Theme.text)
                Text("UID: \(adminUid) · \(lang == "en" ? "Asset level" : "资产等级") \(assetLevel)").font(.system(size: 8, design: .monospaced)).foregroundStyle(Theme.textDim)
                GeometryReader { geo in
                    Capsule().fill(Theme.borderSoft).frame(height: 3)
                        .overlay(alignment: .leading) { Capsule().fill(Theme.accent).frame(width: geo.size.width * 0.62, height: 3) }
                }
                .frame(height: 3)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text((lang == "en" ? "Total assets ¥" : "总资产 ¥") + store.summary.total.fmt()).font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text)
                Text(store.summary.totalPct.pct()).font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.trendColor(store.summary.totalPct))
            }
        }
        .padding(9)
        .background(LinearGradient(colors: [Theme.card, Theme.cardSoft], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(Theme.accent.opacity(0.18), lineWidth: 1))
    }

    @State private var scan = false

    private var assetLevel: Int {
        max(1, String(max(0, Int(store.summary.cash))).count)
    }
}

struct HudParallelogram: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.width * 0.08, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: 0))
        p.addLine(to: CGPoint(x: rect.width * 0.92, y: rect.height))
        p.addLine(to: CGPoint(x: 0, y: rect.height))
        p.closeSubpath()
        return p
    }
}

struct Hexagon: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: 0))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.height * 0.25))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.height * 0.75))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.height))
        p.addLine(to: CGPoint(x: 0, y: rect.height * 0.75))
        p.addLine(to: CGPoint(x: 0, y: rect.height * 0.25))
        p.closeSubpath()
        return p
    }
}

struct MoreView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("stockdesk.lang") private var lang = "zh"
    @State private var path: [String] = []
    @State private var shareImage: UIImage?
    @State private var showShare = false

    private func shareScreenshot() {
        Task { @MainActor in
            if let image = await ScreenCapture.fullImage() {
                shareImage = image
                showShare = true
            }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 12) {
                    InvestHudHeader(path: $path)
                    TimelineView(.periodic(from: .now, by: 1)) { ctx in
                        HStack(spacing: 10) {
                            Image(systemName: "chart.line.uptrend.xyaxis")
                                .foregroundStyle(.black)
                                .frame(width: 34, height: 34)
                                .background(Theme.accentGradient)
                                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("StockDesk").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.text)
                                Text("v3.5 · 数据来自东方财富公开接口").font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                                Text("当前 \(ctx.date.formatted(.dateTime.hour().minute().second())) · 数据更新 \(store.lastRefresh.isEmpty ? "--:--:--" : store.lastRefresh)")
                                    .font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim)
                            }
                            Spacer()
                        }
                    }
                    .padding(12)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.accent.opacity(0.14), lineWidth: 1))
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 90)
            }
            .background(Theme.bg)
            .overlay(alignment: .bottomTrailing) {
                if !path.isEmpty {
                    Button(action: shareScreenshot) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 46, height: 46)
                            .background(Theme.card.opacity(0.96))
                            .clipShape(Circle())
                            .overlay(Circle().strokeBorder(Theme.accent.opacity(0.45), lineWidth: 1))
                    }
                    .padding(.trailing, 18)
                    .padding(.bottom, 18)
                }
            }
            .sheet(isPresented: $showShare) {
                if let shareImage { ActivityView(items: [shareImage]) }
            }
            .navigationTitle(lang == "en" ? "Invest" : "投资")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { route in
                switch route {
                case "dashboard": DashboardView(embedded: true)
                case "daily": DailyView()
                case "market": MarketView()
                case "watchlist": WatchlistView(embedded: true)
                case "portfolio": PortfolioView(embedded: true)
                case "analytics": AnalyticsView(embedded: true)
                case "backtest": BacktestView()
                case "settings": SettingsView()
                case "market-mood": MarketView(initialTab: 1)
                case "market-heat": MarketView(initialTab: 2)
                case "market-pattern": MarketView(initialTab: 3)
                case "hot": HotRankView()
                case "flow": FlowTrackView()
                case "guide": GuideView()
                case "notes": NotesView()
                case "anomaly": AnomalyView()
                case "asset-analysis": AssetAnalysisView()
                case "advice-center": AdviceCenterView()
                case "index-analysis": IndexAnalysisView()
                case "hub-map": HubMapView()
                case "regions": HubMapView()
                case "industry-news": IndustryNewsView()
                case "models": ModelsView()
                default:
                    if route.hasPrefix("stock:") { StockDetailView(code: String(route.dropFirst(6)), name: "") }
                    else { EmptyView() }
                }
                }
            }
        .onAppear {
            if let s = store.debugScreen(), ["backtest", "dashboard", "watchlist", "portfolio", "analytics", "settings", "daily", "market", "asset-analysis", "advice-center", "index-analysis", "hub-map", "regions", "industry-news", "models"].contains(s) {
                path = [s]
            }
        }
    }
}
