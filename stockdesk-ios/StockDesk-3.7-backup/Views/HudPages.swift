import SwiftUI

struct HotRankView: View {
    @State private var state: MarketState?
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let s = state {
                    Card(title: "涨幅榜", subtitle: "涨得最多的 10 只") {
                        rows(s.gainers, up: true)
                    }
                    Card(title: "跌幅榜", subtitle: "跌得最多的 10 只") {
                        rows(s.losers, up: false)
                    }
                } else {
                    ProgressView().padding(.top, 80)
                }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("热点榜")
        .navigationBarTitleDisplayMode(.inline)
        .task { state = await MarketService.shared.marketState() }
    }

    private func rows(_ list: [Quote], up: Bool) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(list.prefix(10).enumerated()), id: \.element.id) { i, q in
                NavigationLink {
                    StockDetailView(code: q.code, name: q.name)
                } label: {
                    HStack(spacing: 8) {
                        Text("\(i + 1)").font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim).frame(width: 16, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(q.name).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.text)
                            Text(q.code + " · " + (q.industry ?? "")).font(.system(size: 9)).foregroundStyle(Theme.textDim)
                        }
                        Spacer()
                        Text(q.price.fmt()).font(.system(size: 12, design: .rounded)).foregroundStyle(Theme.text)
                        Text(q.pct.pct()).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(up ? Theme.up : Theme.down).frame(width: 58, alignment: .trailing)
                    }
                    .padding(.vertical, 7)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if q.id != list.prefix(10).last?.id { SoftDivider() }
            }
        }
    }
}

struct FlowTrackView: View {
    @State private var state: MarketState?
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let s = state {
                    Card(title: "个股主力净流入", subtitle: "实时") {
                        flowRows(s.inflow, up: true)
                    }
                    Card(title: "行业主力净流入", subtitle: "资金流入前列") {
                        VStack(spacing: 0) {
                            ForEach(s.industriesIn) { b in
                                HStack {
                                    Text(b.name).font(.system(size: 12)).foregroundStyle(Theme.text)
                                    Spacer()
                                    Text(shortMoney(b.inflow)).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(Theme.up)
                                    Text(b.pct.pct()).font(.system(size: 10)).foregroundStyle(Theme.trendColor(b.pct)).frame(width: 56, alignment: .trailing)
                                }
                                .padding(.vertical, 7)
                                SoftDivider()
                            }
                        }
                    }
                    Card(title: "个股主力净流出", subtitle: "注意风险") {
                        flowRows(s.outflow, up: false)
                    }
                } else {
                    ProgressView().padding(.top, 80)
                }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("主力追踪")
        .navigationBarTitleDisplayMode(.inline)
        .task { state = await MarketService.shared.marketState() }
    }

    private func flowRows(_ list: [Quote], up: Bool) -> some View {
        VStack(spacing: 0) {
            ForEach(list) { q in
                NavigationLink {
                    StockDetailView(code: q.code, name: q.name)
                } label: {
                    HStack {
                        Text(q.name).font(.system(size: 12)).foregroundStyle(Theme.text)
                        Text(q.code).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim)
                        Spacer()
                        Text(shortMoney(q.mainInflow)).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(up ? Theme.up : Theme.down)
                    }
                    .padding(.vertical, 7)
                }
                .buttonStyle(.plain)
                SoftDivider()
            }
        }
    }
}

struct GuideView: View {
    private let items: [(String, String)] = [
        ("MA5/10/20/60", "短中长期均线。价格站上均线且多头排列偏强；跌破 MA20/60 需警惕趋势转弱。"),
        ("RSI(14)", "高于 70 超买、低于 30 超卖；低位钝化后拐头向上，可能是底部反转的早期信号。"),
        ("MACD", "DIF 上穿 DEA 为金叉，绿柱缩短代表下跌动能减弱；零轴上方金叉可靠性更高。"),
        ("九转序列", "连续 9 根收盘价低于/高于 4 日前收盘价，提示下跌/上涨动能衰竭，9 为完整结构。"),
        ("底部钝化", "价格处于 60 日低位，RSI 连续低位数日后拐头，或 MACD 绿柱缩短，属于左侧观察信号。"),
        ("主力净流入", "超大单与大单净额之和。单日易受大单影响，需要结合连续性与行业资金一起看。"),
        ("筹码分布", "按成交量与价格分布估算持仓成本，观察获利盘、套牢盘、集中度与筹码峰。"),
        ("黄金分割", "以前高前低计算 0.236/0.382/0.5/0.618/0.786 支撑压力，作为交易参考而非预测。"),
        ("策略与标的", "形态、量价、资金、流动性综合评分；仅用于缩小观察范围，不构成投资建议。"),
    ]
    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ForEach(items, id: \.0) { item in
                    Card(title: item.0) {
                        Text(item.1).font(.system(size: 11.5)).foregroundStyle(Theme.textSub).lineSpacing(3)
                    }
                }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("指标说明")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct NoteItem: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var text: String
    var date: String
}

struct NotesView: View {
    @AppStorage("stockdesk.notes") private var raw = "[]"
    @State private var notes: [NoteItem] = []
    @State private var showEditor = false
    @State private var draft = ""

    var body: some View {
        List {
            if notes.isEmpty {
                ContentUnavailableView("还没有笔记", systemImage: "envelope", description: Text("点右上角 + 记录交易想法"))
            }
            ForEach(notes) { n in
                VStack(alignment: .leading, spacing: 4) {
                    Text(n.text).font(.system(size: 12.5)).foregroundStyle(Theme.text)
                    Text(n.date).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim)
                }
                .padding(.vertical, 3)
            }
            .onDelete { idx in
                notes.remove(atOffsets: idx)
                save()
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .navigationTitle("笔记")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { draft = ""; showEditor = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showEditor) {
            NavigationStack {
                TextEditor(text: $draft)
                    .font(.system(size: 13))
                    .padding(10)
                    .background(Theme.card)
                    .navigationTitle("新建笔记")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("取消") { showEditor = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("保存") {
                                let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                                if !text.isEmpty {
                                    let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd HH:mm"
                                    notes.insert(NoteItem(text: text, date: df.string(from: Date())), at: 0)
                                    save()
                                }
                                showEditor = false
                            }
                        }
                    }
            }
        }
        .task { load() }
    }

    private func load() {
        if let data = raw.data(using: .utf8), let items = try? JSONDecoder().decode([NoteItem].self, from: data) {
            notes = items
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(notes), let text = String(data: data, encoding: .utf8) {
            raw = text
        }
    }
}

struct AnomalyView: View {
    @EnvironmentObject private var store: AppStore
    private var items: [(String, String, Color)] {
        var out: [(String, String, Color)] = []
        for i in store.indices {
            if let p = i.pct, abs(p) >= 1.5 {
                out.append(("指数异动 · \(i.name)", "\(i.price.fmt())  \(p.pct())", p > 0 ? Theme.up : Theme.down))
            }
        }
        for p in store.summary.positions {
            if let pct = p.pct, abs(pct) >= 5 {
                out.append(("个股异动 · \(p.name)", "今日 \(pct.pct()) · 持仓 \(p.qty) 股", pct > 0 ? Theme.up : Theme.down))
            }
            if let c = store.chips[p.code], let price = p.price, price < c.support {
                out.append(("跌破支撑 · \(p.name)", "现价 \(price.fmt()) < 支撑 \(c.support.fmt(2))", Theme.up))
            }
            if (p.floatPct ?? 0) <= -15 {
                out.append(("亏损扩大 · \(p.name)", "浮亏 \(p.floatPct.pct())", Theme.up))
            }
        }
        if store.breadth.limitDown >= 10 {
            out.append(("跌停家数偏多", "当前跌停 \(store.breadth.limitDown) 家", Theme.down))
        }
        return out
    }

    var body: some View {
        List {
            Section("触发条件") {
                ForEach([
                    ("指数异动", "任一主要指数当日涨跌幅绝对值 ≥ 1.5%"),
                    ("个股异动", "持仓个股当日涨跌幅绝对值 ≥ 5%"),
                    ("跌破支撑", "现价低于近 20 日支撑位"),
                    ("亏损扩大", "持仓浮亏 ≤ -15%"),
                    ("跌停偏多", "全市场跌停家数 ≥ 10 家"),
                ], id: \.0) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.0).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.text)
                        Text(c.1).font(.system(size: 10)).foregroundStyle(Theme.textDim)
                    }
                    .padding(.vertical, 2)
                }
            }
            if items.isEmpty {
                ContentUnavailableView("暂无异常", systemImage: "bell", description: Text("持仓与市场暂未触发提醒条件"))
            }
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(spacing: 10) {
                    Circle().fill(item.2).frame(width: 7, height: 7)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.0).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.text)
                        Text(item.1).font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                    }
                }
                .padding(.vertical, 3)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .navigationTitle("异常提醒")
        .navigationBarTitleDisplayMode(.inline)
    }
}
