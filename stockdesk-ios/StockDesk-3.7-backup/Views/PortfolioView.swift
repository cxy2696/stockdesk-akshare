import SwiftUI

struct PortfolioView: View {
    var embedded = false
    @EnvironmentObject private var store: AppStore
    @State private var tab = 0
    @State private var showEditor = false
    @State private var editingTrade: Trade?
    @State private var showAccount = false
    @State private var pendingTrade: Trade?
    @State private var pendingCode: String?

    var body: some View {
        if embedded {
            portfolioContent
        } else {
            NavigationStack { portfolioContent }
        }
    }

    private var portfolioContent: some View {
            ScrollView {
                VStack(spacing: 12) {
                    summaryCard
                    Picker("", selection: $tab) {
                        Text("持仓").tag(0)
                        Text("交易流水").tag(1)
                    }
                    .pickerStyle(.segmented)

                    if tab == 0 { positionsCard } else { tradesCard }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 96)
            }
            .background(Theme.bg)
            .navigationTitle("持仓账簿")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { editingTrade = nil; showEditor = true } label: { Label("记录交易", systemImage: "plus.circle") }
                        Button { showAccount = true } label: { Label("账户设置", systemImage: "gearshape") }
                    } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showEditor) {
                TradeEditorView(trade: editingTrade) { t in
                    if editingTrade == nil { try? store.addTrade(t) }
                    else { store.updateTrade(t) }
                }
            }
            .sheet(isPresented: $showAccount) { AccountEditorView() }
            .refreshable {
                await store.refreshSummary()
                await store.refreshChips()
            }
            .task {
                await store.refreshSummary()
                await store.refreshChips()
            }
            .confirmationDialog("删除这笔交易？", isPresented: Binding(
                get: { pendingTrade != nil },
                set: { if !$0 { pendingTrade = nil } }
            ), titleVisibility: .visible) {
                Button("删除", role: .destructive) {
                    if let t = pendingTrade { store.deleteTrade(t) }
                    pendingTrade = nil
                }
                Button("取消", role: .cancel) { pendingTrade = nil }
            } message: {
                if let t = pendingTrade {
                    Text("\(t.name) \(t.tradeDate) \(t.side.label) \(t.qty) 股，删除后现金与盈亏会重新计算。")
                }
            }
            .confirmationDialog("删除持仓？", isPresented: Binding(
                get: { pendingCode != nil },
                set: { if !$0 { pendingCode = nil } }
            ), titleVisibility: .visible) {
                Button("删除全部交易", role: .destructive) {
                    if let c = pendingCode { store.deleteTrades(code: c) }
                    pendingCode = nil
                }
                Button("取消", role: .cancel) { pendingCode = nil }
            } message: {
                if let c = pendingCode {
                    Text("将删除 \(c) 的全部买卖记录，该持仓会从账簿中移除。此操作不可撤销。")
                }
            }
    }

    private var summaryCard: some View {
        let s = store.summary
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("总资产").font(.system(size: 11)).foregroundStyle(Theme.textSub)
                    Text("¥ " + s.total.fmt()).font(.system(size: 27, weight: .bold, design: .rounded)).foregroundStyle(Theme.text)
                        .minimumScaleFactor(0.7).lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text("累计收益率").font(.system(size: 11)).foregroundStyle(Theme.textSub)
                    Text(s.totalPct.pct()).font(.system(size: 19, weight: .bold, design: .rounded)).foregroundStyle(Theme.trendColor(s.totalPct))
                }
            }
            HStack(spacing: 0) {
                cell("持仓市值", "¥" + s.marketValue.fmt())
                divider
                cell("可用现金", "¥" + s.cash.fmt())
                divider
                cell("浮动盈亏", s.floatPnl.signed(), Theme.trendColor(s.floatPnl))
                divider
                cell("已实现", s.realized.signed(), Theme.trendColor(s.realized))
            }
        }
        .padding(16)
        .background(Theme.heroGradient)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
    }

    private var divider: some View {
        Rectangle().fill(Theme.border).frame(width: 1, height: 26).padding(.horizontal, 8)
    }

    private func cell(_ k: String, _ v: String, _ c: Color = Theme.text) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(k).font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
            Text(v).font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(c).lineLimit(1)
        }
    }

    private var positionsCard: some View {
        Card(title: "当前持仓", subtitle: "\(store.summary.positions.count) 只") {
            if store.summary.positions.isEmpty {
                empty("暂无持仓，点右上角 + 记录买入", "briefcase")
            } else {
                VStack(spacing: 0) {
                    ForEach(store.summary.positions) { p in
                        HStack(spacing: 2) {
                        NavigationLink {
                            StockDetailView(code: p.code, name: p.name)
                        } label: {
                            HStack(spacing: 10) {
                                AvatarView(name: p.name)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(p.name).font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.text)
                                    Text("\(p.qty) 股 · 成本 \(p.avgCost.fmt())")
                                        .font(.system(size: 10.5))
                                        .foregroundStyle(Theme.textDim)
                                        .lineLimit(1)
                                    if let c = store.chips[p.code] {
                                        HStack(spacing: 6) {
                                            Text("撑 \(c.support.fmt(2))").foregroundStyle(Theme.down)
                                            Text("压 \(c.resistance.fmt(2))").foregroundStyle(Theme.up)
                                        }
                                        .font(.system(size: 9.5))
                                        .lineLimit(1)
                                    }
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 3) {
                                    Text(p.price.fmt()).font(.system(size: 13.5, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text)
                                    Text(p.floatPnl.signed() + "  " + p.floatPct.pct())
                                        .font(.system(size: 10.5, weight: .medium)).foregroundStyle(Theme.trendColor(p.floatPnl))
                                }
                            }
                            .padding(.vertical, 9)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Menu {
                            Button(role: .destructive) { pendingCode = p.code } label: { Label("删除持仓", systemImage: "trash") }
                        } label: {
                            Image(systemName: "ellipsis").font(.system(size: 13)).foregroundStyle(Theme.textDim)
                                .frame(width: 26, height: 30)
                        }
                        }
                        if p.id != store.summary.positions.last?.id { SoftDivider() }
                    }
                }
            }
        }
    }

    private var tradesCard: some View {
        Card(title: "交易流水", subtitle: "\(store.trades.count) 笔") {
            if store.trades.isEmpty {
                empty("还没有交易记录", "list.bullet.rectangle")
            } else {
                VStack(spacing: 0) {
                    ForEach(store.trades.sorted { $0.tradeDate > $1.tradeDate }) { t in
                        HStack(spacing: 4) {
                        Button {
                            editingTrade = t
                            showEditor = true
                        } label: {
                            HStack(spacing: 8) {
                                Text(t.side.label)
                                    .font(.system(size: 10, weight: .semibold))
                                    .padding(.horizontal, 6).padding(.vertical, 3)
                                    .background(t.side.color.opacity(0.1))
                                    .foregroundStyle(t.side.color)
                                    .clipShape(RoundedRectangle(cornerRadius: 5))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.name.isEmpty ? t.code : t.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.text)
                                    Text("\(t.tradeDate) · \(t.qty)股 @ \(t.price.fmt())").font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                                }
                                Spacer()
                                Text("¥" + (t.price * Double(t.qty)).fmt(0))
                                    .font(.system(size: 12, weight: .medium, design: .rounded)).foregroundStyle(Theme.text)
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Button { pendingTrade = t } label: {
                            Image(systemName: "trash").font(.system(size: 12)).foregroundStyle(Theme.down)
                                .frame(width: 30, height: 30)
                        }
                        .buttonStyle(.plain)
                        }
                        if t.id != store.trades.last?.id { SoftDivider() }
                    }
                }
            }
        }
    }

    private func empty(_ text: String, _ icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 22)).foregroundStyle(Theme.textDim.opacity(0.5))
            Text(text).font(.system(size: 12)).foregroundStyle(Theme.textDim)
        }
        .frame(maxWidth: .infinity, minHeight: 100)
    }
}

struct TradeEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let trade: Trade?
    var presetCode = ""
    var presetName = ""
    var onSave: (Trade) -> Void

    @State private var code = ""
    @State private var name = ""
    @State private var side: TradeSide = .buy
    @State private var price = ""
    @State private var qty = "100"
    @State private var fee = "5"
    @State private var date = Date()
    @State private var note = ""
    @State private var errorMessage: String?
    @State private var looking = false

    init(trade: Trade?, presetCode: String = "", presetName: String = "", onSave: @escaping (Trade) -> Void) {
        self.trade = trade
        self.presetCode = presetCode
        self.presetName = presetName
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("标的") {
                    TextField("6 位代码", text: $code)
                        .keyboardType(.numberPad)
                        .onChange(of: code) { _, v in
                            code = String(v.filter(\.isNumber).prefix(6))
                            if code.count == 6 { Task { await lookup() } }
                        }
                    TextField("名称（自动获取）", text: $name)
                    if looking { ProgressView() }
                }
                Section("交易") {
                    Picker("方向", selection: $side) {
                        ForEach(TradeSide.allCases, id: \.self) { s in Text(s.label).tag(s) }
                    }
                    .pickerStyle(.segmented)
                    TextField("成交价", text: $price).keyboardType(.decimalPad)
                    TextField("数量（股）", text: $qty).keyboardType(.numberPad)
                    TextField("手续费", text: $fee).keyboardType(.decimalPad)
                    DatePicker("交易日期", selection: $date, displayedComponents: .date)
                }
                Section("备注") {
                    TextField("买入理由 / 计划", text: $note, axis: .vertical).lineLimit(2...4)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(Theme.up).font(.system(size: 12)) }
                }
                if side == .sell, let pos = store.summary.positions.first(where: { $0.code == code }) {
                    Section { Text("当前持有 \(pos.qty) 股").font(.system(size: 12)).foregroundStyle(Theme.textSub) }
                }
            }
            .navigationTitle(trade == nil ? "记录交易" : "编辑交易")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") { save() }.fontWeight(.semibold)
                }
            }
            .onAppear(perform: prefill)
        }
    }

    private func prefill() {
        if let t = trade {
            code = t.code; name = t.name; side = t.side
            price = String(t.price); qty = String(t.qty); fee = String(t.fee); note = t.note
            if let d = DateFormatter.ymd.date(from: t.tradeDate) { date = d }
        } else if !presetCode.isEmpty {
            code = presetCode; name = presetName
            Task { await lookup(fillPrice: true) }
        }
    }

    private func lookup(fillPrice: Bool = false) async {
        looking = true
        defer { looking = false }
        if let q = try? await MarketService.shared.quote(code) {
            if name.isEmpty { name = q.name }
            if fillPrice, price.isEmpty, let p = q.price { price = String(format: "%.2f", p) }
            await store.refreshWatchQuotes()
        }
    }

    private func save() {
        guard code.count == 6 else { errorMessage = "请输入 6 位股票代码"; return }
        guard let p = Double(price), p > 0 else { errorMessage = "请输入有效成交价"; return }
        guard let q = Int(qty), q > 0 else { errorMessage = "请输入有效数量"; return }
        let f = Double(fee) ?? 0
        let t = Trade(id: trade?.id ?? UUID(), code: code, name: name, side: side, price: p, qty: q,
                      fee: f, tradeDate: DateFormatter.ymd.string(from: date), note: note)
        onSave(t)
        dismiss()
    }
}

struct AccountEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var assets = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("当前资产") {
                    let s = store.summary
                    LabeledContent("总资产", value: "¥ " + s.total.fmt())
                    LabeledContent("持仓市值", value: "¥ " + s.marketValue.fmt())
                    LabeledContent("可用现金", value: "¥ " + s.cash.fmt())
                }
                Section("初始资产（收益基准）") {
                    TextField("初始资产", text: $assets).keyboardType(.decimalPad)
                    Text("总资产 = 可用现金 + 持仓市值，会随行情涨跌自动变化。初始资产只用于计算累计收益率。")
                        .font(.system(size: 12)).foregroundStyle(Theme.textSub)
                }
            }
            .navigationTitle("账户设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        let a = Double(assets) ?? store.account.assets
                        store.setAccount(assets: a)
                        dismiss()
                    }
                }
            }
            .onAppear {
                assets = String(format: "%.0f", store.account.assets)
            }
        }
    }
}

extension DateFormatter {
    static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "Asia/Shanghai")
        return f
    }()
}
