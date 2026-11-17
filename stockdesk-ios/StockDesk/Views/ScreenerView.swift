import SwiftUI

struct ScreenerView: View {
    @EnvironmentObject private var store: AppStore
    @State private var filters = ScreenFilters()
    @State private var rows: [ScreenRow] = []
    @State private var loading = false
    @State private var showFilters = false
    @State private var showSort = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                summaryBar
                if loading && rows.isEmpty {
                    ProgressView("正在扫描全市场…").padding(.top, 60)
                } else if rows.isEmpty {
                    ContentUnavailableView("没有符合条件的股票", systemImage: "magnifyingglass",
                                           description: Text("点「筛选」放宽条件试试"))
                        .padding(.top, 60)
                } else {
                    ForEach(rows) { r in
                        NavigationLink {
                            StockDetailView(code: r.code, name: r.name)
                        } label: {
                            row(r)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 96)
        }
        .background(Theme.bg)
        .navigationTitle("智能选股")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showFilters = true } label: { Label("筛选条件", systemImage: "line.3.horizontal.decrease.circle") }
                    Button { showSort = true } label: { Label("排序", systemImage: "arrow.up.arrow.down") }
                    Button { Task { await run(force: true) } } label: { Label("重新扫描", systemImage: "arrow.clockwise") }
                } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
            }
        }
        .sheet(isPresented: $showFilters) {
            FiltersSheet(filters: filters) { f in
                filters = f
                Task { await run(force: true) }
            }
        }
        .confirmationDialog("排序方式", isPresented: $showSort) {
            ForEach([("score", "综合评分"), ("pct", "涨幅"), ("pct60", "60日动量"),
                     ("turnover", "换手率"), ("inflow", "资金流入"), ("pe", "低 PE"), ("pb", "低 PB"), ("mcap", "市值")], id: \.0) { item in
                Button(item.1) {
                    filters.sort = item.0
                    Task { await run(force: true) }
                }
            }
        }
        .task { await run() }
    }

    private var summaryBar: some View {
        HStack {
            Text("扫描 \(store.spotRows.count) 只 · 命中 \(rows.count) 只")
                .font(.system(size: 11)).foregroundStyle(Theme.textDim)
            Spacer()
            Button { showFilters = true } label: {
                Label("筛选", systemImage: "slider.horizontal.3").font(.system(size: 11, weight: .medium))
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(.top, 4)
    }

    private func row(_ r: ScreenRow) -> some View {
        HStack(spacing: 10) {
            AvatarView(name: r.name)
            VStack(alignment: .leading, spacing: 3) {
                Text(r.name).font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.text)
                Text("\(r.code) · \(r.market)").font(.system(size: 10)).foregroundStyle(Theme.textDim)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                HStack(spacing: 6) {
                    Text(r.price.fmt()).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text)
                    Text(r.pct.pct()).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.trendColor(r.pct))
                }
                HStack(spacing: 8) {
                    Text("PE \(r.pe.fmt(1))").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                    Text("PB \(r.pb.fmt(1))").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                    scoreBadge(r.score)
                }
            }
        }
        .padding(12)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
    }

    private func scoreBadge(_ s: Double) -> some View {
        Text(String(format: "%.0f", s))
            .font(.system(size: 9.5, weight: .bold))
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background((s >= 65 ? Theme.up : s >= 50 ? Theme.amber : Theme.accent).opacity(0.12))
            .foregroundStyle(s >= 65 ? Theme.up : s >= 50 ? Theme.amber : Theme.accent)
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private func run(force: Bool = false) async {
        if !force, !rows.isEmpty { return }
        loading = true
        await store.ensureSpot()
        rows = ScreenerEngine.run(store.spotRows, filters: filters)
        loading = false
    }
}

struct FiltersSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var f: ScreenFilters
    let onApply: (ScreenFilters) -> Void

    init(filters: ScreenFilters, onApply: @escaping (ScreenFilters) -> Void) {
        _f = State(initialValue: filters)
        self.onApply = onApply
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("板块") {
                    ForEach(["沪市主板", "深市主板", "创业板", "科创板", "北交所"], id: \.self) { b in
                        Toggle(b, isOn: Binding(
                            get: { f.boards.contains(b) },
                            set: { on in
                                if on { f.boards.append(b) } else { f.boards.removeAll { $0 == b } }
                            }
                        ))
                    }
                }
                Section("价格 / 市值") {
                    rangeRow("价格（元）", $f.priceMin, $f.priceMax)
                    rangeRow("总市值（亿）", $f.mcapMin, $f.mcapMax)
                }
                Section("估值") {
                    rangeRow("市盈率 PE", $f.peMin, $f.peMax)
                    rangeRow("市净率 PB", $f.pbMin, $f.pbMax)
                }
                Section("交易") {
                    rangeRow("今日涨跌幅（%）", $f.pctMin, $f.pctMax)
                    rangeRow("换手率（%）", $f.turnoverMin, $f.turnoverMax)
                    HStack {
                        Text("主力净流入 ≥（亿）").font(.system(size: 12))
                        Spacer()
                        TextField("不限", value: $f.inflowMin, format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 90)
                    }
                }
                Section {
                    Toggle("排除 ST / 退市", isOn: $f.excludeST)
                    Toggle("排除新股（N / C）", isOn: $f.excludeNew)
                    Toggle("仅盈利公司（PE > 0）", isOn: $f.onlyProfit)
                    TextField("代码 / 名称关键词", text: $f.keyword)
                }
            }
            .navigationTitle("筛选条件")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("重置") { f = ScreenFilters() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("应用") { onApply(f); dismiss() }
                }
            }
        }
    }

    private func rangeRow(_ label: String, _ min: Binding<Double?>, _ max: Binding<Double?>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 11.5)).foregroundStyle(Theme.textSub)
            HStack(spacing: 8) {
                TextField("最小", value: min, format: .number)
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                Text("~").foregroundStyle(Theme.textDim)
                TextField("最大", value: max, format: .number)
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
            }
            .font(.system(size: 13))
        }
    }
}
