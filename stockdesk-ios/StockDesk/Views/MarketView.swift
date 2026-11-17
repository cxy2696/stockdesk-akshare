import SwiftUI

struct MarketView: View {
    @State private var tab = 0
    private let tabs = ["板块跟踪", "市场情绪", "个股热图", "形态选股"]

    init(initialTab: Int = 0) {
        var value = initialTab
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-marketTab"), i + 1 < args.count, let v = Int(args[i + 1]) {
            value = v
        }
        _tab = State(initialValue: value)
    }

    var body: some View {
        VStack(spacing: 10) {
            Picker("", selection: $tab) {
                ForEach(Array(tabs.enumerated()), id: \.offset) { i, t in Text(t).tag(i) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 14)

            Group {
                switch tab {
                case 0: BoardListView()
                case 1: SentimentView()
                case 2: HeatmapView()
                default: PatternView()
                }
            }
        }
        .background(Theme.bg)
        .navigationTitle("板块跟踪")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Boards

struct BoardListView: View {
    @State private var kind = "industry"
    @State private var boards: [Board] = []
    @State private var loading = true
    @State private var selected: Board?
    @State private var stocks: [Quote] = []
    @State private var detailLoading = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                HStack {
                    Picker("", selection: $kind) {
                        Text("行业").tag("industry")
                        Text("概念").tag("concept")
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 150)
                    .onChange(of: kind) { _, _ in Task { await load() } }
                    Spacer()
                    Text("\(boards.count) 个板块").font(.system(size: 10)).foregroundStyle(Theme.textDim)
                }
                if loading && boards.isEmpty {
                    ProgressView().padding(.top, 60)
                } else {
                    VStack(spacing: 0) {
                        ForEach(boards) { b in
                            Button {
                                selected = b
                                Task { await open(b) }
                            } label: {
                                HStack(spacing: 8) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(b.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.text)
                                        Text("领涨 \(b.leader ?? "--") \(b.leaderPct.pct())").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 3) {
                                        Text(b.pct.pct()).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(Theme.trendColor(b.pct))
                                        Text("流入 " + shortMoney(b.inflow)).font(.system(size: 9.5)).foregroundStyle((b.inflow ?? 0) >= 0 ? Theme.up : Theme.down)
                                    }
                                }
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if b.id != boards.last?.id { SoftDivider() }
                        }
                    }
                    .cardStyle()
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 90)
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $selected) { b in
            NavigationStack {
                List {
                    Section {
                        HStack {
                            Text(b.pct.pct()).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Theme.trendColor(b.pct))
                            Spacer()
                            Text("流入 " + shortMoney(b.inflow)).font(.system(size: 11)).foregroundStyle(Theme.textDim)
                        }
                    }
                    Section("成分股") {
                        if detailLoading { ProgressView() }
                        ForEach(stocks) { q in
                            NavigationLink {
                                StockDetailView(code: q.code, name: q.name)
                            } label: {
                                HStack {
                                    Text(q.name).font(.system(size: 13))
                                    Spacer()
                                    Text(q.price.fmt()).font(.system(size: 12, design: .rounded))
                                    Text(q.pct.pct()).font(.system(size: 11)).foregroundStyle(Theme.trendColor(q.pct))
                                }
                            }
                        }
                    }
                }
                .navigationTitle(b.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { selected = nil } } }
            }
        }
    }

    private func load() async {
        loading = true
        boards = (try? await MarketService.shared.boards(kind: kind)) ?? []
        loading = false
    }

    private func open(_ b: Board) async {
        detailLoading = true
        stocks = (try? await MarketService.shared.boardStocks(b.code)) ?? []
        detailLoading = false
    }
}

// MARK: - Sentiment

struct SentimentView: View {
    @State private var state: MarketState?
    @State private var limits: [Quote] = []

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let s = state {
                    Card(title: "市场温度", subtitle: s.label) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 12) {
                                ZStack {
                                    Circle().stroke(Theme.cardSoft, lineWidth: 9).frame(width: 82, height: 82)
                                    Circle()
                                        .trim(from: 0, to: CGFloat(s.score) / 100)
                                        .stroke(Theme.trendColor(Double(s.score - 50)), style: StrokeStyle(lineWidth: 9, lineCap: .round))
                                        .frame(width: 82, height: 82)
                                        .rotationEffect(.degrees(-90))
                                    Text("\(s.score)").font(.system(size: 24, weight: .bold, design: .rounded))
                                }
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(s.label).font(.system(size: 20, weight: .bold)).foregroundStyle(Theme.trendColor(Double(s.score - 50)))
                                    Text("涨跌比 \(s.breadth.up) : \(s.breadth.down)").font(.system(size: 10.5)).foregroundStyle(Theme.textSub)
                                    HStack(spacing: 4) {
                                        ForEach(s.indices.prefix(5)) { i in
                                            Text("\(i.short) \(i.trend)").font(.system(size: 8.5))
                                                .padding(.horizontal, 4).padding(.vertical, 1)
                                                .background(Theme.cardSoft)
                                                .clipShape(Capsule())
                                        }
                                    }
                                }
                            }
                            ForEach(s.reasons, id: \.self) { r in
                                Text("· " + r).font(.system(size: 10.5)).foregroundStyle(Theme.textSub)
                            }
                        }
                    }

                    Card(title: "涨停池", subtitle: "\(limits.count) 只") {
                        VStack(spacing: 0) {
                            ForEach(limits.prefix(18)) { q in
                                NavigationLink {
                                    StockDetailView(code: q.code, name: q.name)
                                } label: {
                                    HStack {
                                        Text(q.name).font(.system(size: 12.5)).foregroundStyle(Theme.text)
                                        Text(q.code).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim)
                                        Spacer()
                                        Text(q.industry ?? "").font(.system(size: 9)).foregroundStyle(Theme.textDim)
                                        Text(q.pct.pct()).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.up)
                                    }
                                    .padding(.vertical, 6)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } else {
                    ProgressView().padding(.top, 60)
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 90)
        }
        .task { await load() }
    }

    private func load() async {
        state = await MarketService.shared.marketState()
        let spot = (try? await MarketService.shared.spot())?.rows ?? []
        limits = spot.filter { q in
            guard let p = q.pct else { return false }
            let code = q.code
            let name = q.name.uppercased()
            let threshold: Double = name.contains("ST") ? 4.8 : (code.hasPrefix("300") || code.hasPrefix("301") || code.hasPrefix("688") ? 19.7 : (code.hasPrefix("8") || code.hasPrefix("4") ? 29.5 : 9.7))
            return p >= threshold
        }.sorted { ($0.pct ?? 0) > ($1.pct ?? 0) }
    }
}

// MARK: - Heatmap

struct HeatmapView: View {
    @State private var groups: [HeatGroup] = []

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            VStack(alignment: .leading, spacing: 8) {
                if groups.isEmpty {
                    ProgressView().padding(60)
                } else {
                    Canvas { ctx, size in
                        let total = max(groups.reduce(0) { $0 + $1.value }, 1)
                        var x: CGFloat = 0
                        for g in groups {
                            let w = size.width * CGFloat(g.value / total)
                            let rect = CGRect(x: x, y: 0, width: max(w - 2, 1), height: size.height)
                            ctx.fill(Path(rect), with: .color(color(g.pct, group: true)))
                            ctx.draw(Text(g.name).font(.system(size: 8.5, weight: .semibold)).foregroundColor(.white),
                                     at: CGPoint(x: rect.minX + 4, y: 10), anchor: .leading)
                            var y: CGFloat = 20
                            let children = g.children
                            let childTotal = max(children.reduce(0) { $0 + $1.value }, 1)
                            for c in children {
                                let h = (size.height - 22) * CGFloat(c.value / childTotal)
                                let cr = CGRect(x: rect.minX, y: y, width: rect.width, height: max(h - 1, 1))
                                ctx.fill(Path(cr), with: .color(color(c.pct, group: false)))
                                if h > 26 && rect.width > 44 {
                                    ctx.draw(Text(c.name).font(.system(size: 7.5)).foregroundColor(.white),
                                             at: CGPoint(x: cr.minX + 3, y: cr.midY), anchor: .leading)
                                }
                                y += h
                            }
                            x += w
                        }
                    }
                    .frame(width: 1100, height: 560)
                }
                HStack(spacing: 6) {
                    Text("-10%").font(.system(size: 9)).foregroundStyle(Theme.down)
                    LinearGradient(colors: [Theme.down, Color.gray.opacity(0.3), Theme.up], startPoint: .leading, endPoint: .trailing)
                        .frame(width: 120, height: 7).clipShape(Capsule())
                    Text("+10%").font(.system(size: 9)).foregroundStyle(Theme.up)
                    Text("面积=市值 · 颜色=涨跌幅").font(.system(size: 9)).foregroundStyle(Theme.textDim)
                }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .task { await load() }
    }

    private func color(_ pct: Double, group: Bool) -> Color {
        let v = max(-10, min(10, pct))
        if v > 0.05 { return Theme.up.opacity(min(0.95, (group ? 0.35 : 0.3) + v / 13)) }
        if v < -0.05 { return Theme.down.opacity(min(0.95, (group ? 0.35 : 0.3) + abs(v) / 13)) }
        return Color.gray.opacity(0.35)
    }

    private func load() async {
        let spot = (try? await MarketService.shared.spot())?.rows ?? []
        var buckets: [String: [Quote]] = [:]
        for q in spot where (q.mcap ?? 0) > 0 && q.price != nil {
            buckets[q.industry ?? "其他", default: []].append(q)
        }
        var gs: [HeatGroup] = []
        for (name, list) in buckets {
            let total = list.reduce(0.0) { $0 + ($1.mcap ?? 0) }
            guard total > 0 else { continue }
            let avg = list.reduce(0.0) { $0 + ($1.pct ?? 0) * ($1.mcap ?? 0) } / total
            let children = list.sorted { ($0.mcap ?? 0) > ($1.mcap ?? 0) }.prefix(60).map {
                HeatStock(code: $0.code, name: $0.name, value: ($0.mcap ?? 0) / 1e8, pct: $0.pct ?? 0, price: $0.price)
            }
            gs.append(HeatGroup(name: name, value: total / 1e8, pct: avg, children: Array(children)))
        }
        groups = Array(gs.sorted { $0.value > $1.value }.prefix(26))
    }
}

// MARK: - Patterns

struct PatternView: View {
    @State private var pattern = "ma_bull"
    @State private var hits: [PatternHit] = []
    @State private var loading = false
    @State private var limit = 120

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(PatternEngine.all) { p in
                            Button {
                                pattern = p.id
                                Task { await scan() }
                            } label: {
                                Text(p.name).font(.system(size: 10.5, weight: pattern == p.id ? .semibold : .regular))
                                    .padding(.horizontal, 8).padding(.vertical, 5)
                                    .background(pattern == p.id ? Theme.accent.opacity(0.12) : Theme.card)
                                    .foregroundStyle(pattern == p.id ? Theme.accent : Theme.textSub)
                                    .clipShape(Capsule())
                                    .overlay(Capsule().strokeBorder(Theme.borderSoft, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if let p = PatternEngine.all.first(where: { $0.id == pattern }) {
                    Text(p.desc).font(.system(size: 10)).foregroundStyle(Theme.textDim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack {
                    Text("\(hits.count) 只命中 · 扫描 \(limit) 只").font(.system(size: 10)).foregroundStyle(Theme.textDim)
                    Spacer()
                    Button {
                        limit = limit == 120 ? 200 : 120
                        Task { await scan() }
                    } label: { Text("范围 \(limit)").font(.system(size: 10)) }
                }
                if loading {
                    ProgressView().padding(.top, 40)
                } else {
                    VStack(spacing: 0) {
                        ForEach(hits) { h in
                            NavigationLink {
                                StockDetailView(code: h.code, name: h.name)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(h.name).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.text)
                                        Text(h.reason).font(.system(size: 9.5)).foregroundStyle(Theme.textDim).lineLimit(1)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text(h.pct.pct()).font(.system(size: 11)).foregroundStyle(Theme.trendColor(h.pct))
                                        Text("\(h.score)").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.accent)
                                    }
                                }
                                .padding(.vertical, 7)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if h.id != hits.last?.id { SoftDivider() }
                        }
                    }
                    .cardStyle()
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 90)
        }
        .task { await scan() }
    }

    private func scan() async {
        loading = true
        let spot = (try? await MarketService.shared.spot())?.rows ?? []
        let candidates = spot.sorted { ($0.amount ?? 0) > ($1.amount ?? 0) }
        hits = await PatternEngine.scan(candidates: candidates, pattern: pattern, limit: limit)
        loading = false
    }
}
