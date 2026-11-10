import SwiftUI

struct WatchlistView: View {
    @EnvironmentObject private var store: AppStore
    @State private var query = ""
    @State private var showSearch = false
    var embedded = false
    @State private var editing = false
    @State private var path: [String] = []
    @State private var sparks: [String: [Double]] = [:]

    var body: some View {
        if embedded {
            content.navigationTitle("自选")
        } else {
            NavigationStack(path: $path) {
                content
                    .navigationDestination(for: String.self) { code in
                        StockDetailView(code: code, name: store.watchQuotes[code]?.name ?? code)
                    }
                    .onAppear {
                        if store.debugScreen() == "stock", let c = store.debugCode() {
                            path = [c]
                        }
                    }
                    .navigationTitle("自选行情")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button { showSearch = true } label: { Image(systemName: "plus") }
                        }
                    }
                    .sheet(isPresented: $showSearch) { SearchSheet() }
            }
        }
    }

    private var content: some View {
        List {
            if store.breadth.total > 0 {
                Section {
                    HStack {
                        statPill("涨", "\(store.breadth.up)", Theme.up)
                        statPill("跌", "\(store.breadth.down)", Theme.down)
                        statPill("平", "\(store.breadth.flat)", Theme.textSub)
                        Spacer()
                        Text("更新 \(store.lastRefresh)").font(.system(size: 10)).foregroundStyle(Theme.textDim)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 2, leading: 0, bottom: 2, trailing: 0))
                }
            }
            Section {
                ForEach(store.watchlist) { w in
                    NavigationLink {
                        StockDetailView(code: w.code, name: w.name)
                    } label: {
                        row(w)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            store.toggleWatch(w.code, name: w.name)
                        } label: { Label("删除", systemImage: "trash") }
                    }
                }
                .onDelete { idx in
                    for i in idx { store.toggleWatch(store.watchlist[i].code, name: store.watchlist[i].name) }
                }
            } footer: {
                Text("左滑删除 · 点击查看 K 线与财务")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .refreshable {
            await store.refreshAll()
            await loadSparks()
        }
        .task { await loadSparks() }
        .overlay {
            if store.watchlist.isEmpty {
                ContentUnavailableView("自选列表为空", systemImage: "star", description: Text("点右上角 + 添加自选股"))
            }
        }
    }

    private func row(_ w: WatchedStock) -> some View {
        let q = store.watchQuotes[w.code]
        return HStack(spacing: 10) {
            AvatarView(name: w.name)
            VStack(alignment: .leading, spacing: 3) {
                Text(w.name).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.text)
                Text(w.code + (w.note.isEmpty ? "" : " · \(w.note)"))
                    .font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Theme.textDim)
            }
            if let d = sparks[w.code], d.count > 1 {
                HStack(spacing: 6) {
                    spark(d, n: 20)
                    spark(d, n: 60)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(q?.price.fmt() ?? "--")
                    .font(.system(size: 14, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text)
                Text(q?.pct.pct() ?? "--")
                    .font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.trendColor(q?.pct))
            }
        }
        .padding(.vertical, 3)
    }

    private func spark(_ d: [Double], n: Int) -> some View {
        let vals = Array(d.suffix(n))
        let up = vals.last ?? 0 >= (vals.first ?? 0)
        return VStack(spacing: 1) {
            LineSpark(points: vals, height: 20, color: up ? Theme.up : Theme.down, showArea: false)
                .frame(width: n == 20 ? 38 : 48)
            Text("\(n)日").font(.system(size: 7.5)).foregroundStyle(Theme.textDim)
        }
    }

    private func loadSparks() async {
        var out: [String: [Double]] = [:]
        await withTaskGroup(of: (String, [Double]).self) { group in
            for w in store.watchlist.prefix(12) {
                group.addTask {
                    let rows = (try? await MarketService.shared.klines(w.code, period: "daily", limit: 60, adjust: "qfq")) ?? []
                    return (w.code, rows.map(\.close))
                }
            }
            for await (code, vals) in group { out[code] = vals }
        }
        sparks = out
    }

    private func statPill(_ k: String, _ v: String, _ c: Color) -> some View {
        HStack(spacing: 4) {
            Text(k).font(.system(size: 10)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(c)
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(Theme.card)
        .clipShape(Capsule())
    }
}

struct SearchSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var onSelect: ((Quote) -> Void)? = nil
    @State private var query = ""
    @State private var results: [Quote] = []
    @State private var speeders: [Quote] = []
    @State private var searching = false

    var body: some View {
        NavigationStack {
            List {
                if query.isEmpty {
                    Section("热门 · 涨速最高 10 只") {
                        if speeders.isEmpty {
                            HStack { ProgressView(); Text("加载热门…").font(.system(size: 11)).foregroundStyle(Theme.textDim) }
                        }
                        ForEach(speeders) { q in
                            Button {
                                if let onSelect { onSelect(q) } else { store.addWatch(q.code, name: q.name) }
                                dismiss()
                            } label: {
                                HStack(spacing: 8) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(q.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.text)
                                        Text(q.code + " · " + (q.industry ?? "--")).font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                                    }
                                    Spacer()
                                    Text((q.speed ?? 0).pct()).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.trendColor(q.speed ?? 0))
                                    Image(systemName: onSelect == nil ? "plus.circle" : "chevron.right").foregroundStyle(Theme.accent)
                                }
                            }
                        }
                    }
                } else {
                    ForEach(results) { q in
                        Button {
                            if let onSelect {
                                onSelect(q)
                            } else {
                                store.addWatch(q.code, name: q.name)
                            }
                            dismiss()
                        } label: {
                            HStack {
                                AvatarView(name: q.name)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(q.name).font(.system(size: 14)).foregroundStyle(Theme.text)
                                    Text(q.code).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Theme.textDim)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(q.price.fmt()).font(.system(size: 13, weight: .medium))
                                    Text(q.pct.pct()).font(.system(size: 10.5)).foregroundStyle(Theme.trendColor(q.pct))
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "代码或名称")
            .onChange(of: query) { _, newValue in
                Task {
                    searching = true
                    try? await Task.sleep(nanoseconds: 220_000_000)
                    if !newValue.isEmpty {
                        results = await MarketService.shared.search(newValue)
                    } else {
                        results = []
                    }
                    searching = false
                }
            }
            .navigationTitle(onSelect == nil ? "添加自选" : "搜索股票")
        .task {
            if speeders.isEmpty, let sp = try? await MarketService.shared.spot(ttl: 300) {
                speeders = Array(sp.rows.filter { ($0.speed ?? 0) != 0 && !$0.name.contains("退") && !$0.name.uppercased().contains("ST") }.sorted { ($0.speed ?? -999) > ($1.speed ?? -999) }.prefix(10))
            }
        }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
            }
        }
    }
}
