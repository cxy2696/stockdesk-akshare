import SwiftUI

struct FactorsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var result = FactorResult(rows: [], coverage: [], eligible: 0, total: 0)
    @State private var loading = false
    @State private var rows: [Quote] = []
    @State private var boards: Set<String> = []
    @State private var minScore: Double = 45

    private let boardOptions = ["沪市主板", "深市主板", "创业板", "科创板", "北交所"]

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                header
                if loading && result.rows.isEmpty {
                    ProgressView("正在扫描全市场因子…").padding(.top, 60)
                } else if result.eligible == 0 {
                    ContentUnavailableView("没有可计算的数据", systemImage: "chart.bar.xaxis",
                                           description: Text("下拉刷新，或检查网络后重试"))
                        .padding(.top, 50)
                } else {
                    coverageCard
                    candidates
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 96)
        }
        .background(Theme.bg)
        .navigationTitle("因子筛选")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await run() }
        .task { await run() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("全市场 \(result.total) 只 · 有效 \(result.eligible) 只 · 命中 \(result.rows.count)")
                    .font(.system(size: 11)).foregroundStyle(Theme.textDim)
                Spacer()
                if loading { ProgressView().controlSize(.small) }
            }
            Text("横截面因子，只做排序和缩小观察范围；不伪造历史 IC。")
                .font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
            HStack(spacing: 6) {
                ForEach(boardOptions, id: \.self) { b in
                    Button {
                        if boards.contains(b) { boards.remove(b) } else { boards.insert(b) }
                        result = FactorEngine.run(rows, boards: boards, minScore: minScore)
                    } label: {
                        Text(b.replacingOccurrences(of: "市主板", with: ""))
                            .font(.system(size: 10, weight: .medium))
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .foregroundStyle(boards.contains(b) ? Theme.accent : Theme.textSub)
                            .background((boards.contains(b) ? Theme.accent.opacity(0.12) : Theme.cardSoft))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 10) {
                Text("最低分 \(Int(minScore))").font(.system(size: 10)).foregroundStyle(Theme.textDim)
                Slider(value: $minScore, in: 0...80, step: 5) { _ in
                    result = FactorEngine.run(rows, boards: boards, minScore: minScore)
                }
            }
        }
        .padding(12)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
        .padding(.top, 4)
    }

    private var coverageCard: some View {
        Card(title: "因子覆盖", subtitle: "\(FactorEngine.definitions.count) 个横截面因子 · 按类别透明加权") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(result.coverage) { c in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(c.name).font(.system(size: 10.5, weight: .medium)).foregroundStyle(Theme.text)
                            Spacer()
                            Text(c.category).font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                        }
                        ProgressView(value: c.pct / 100)
                            .tint(c.pct >= 80 ? Theme.accent : Theme.amber)
                        Text("\(c.available)/\(c.total) · \(c.pct.fmt(0))%")
                            .font(.system(size: 8.5, design: .monospaced)).foregroundStyle(Theme.textDim)
                    }
                    .padding(7)
                    .background(Theme.cardSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                }
            }
            Text("总分 = 动量 30% · 价值 20% · 流动性 18% · 资金 15% · 稳定性 10% · 规模 7%；缺失类别自动按剩余权重归一。")
                .font(.system(size: 9)).foregroundStyle(Theme.textDim).lineSpacing(1.6).padding(.top, 5)
        }
    }

    private var candidates: some View {
        VStack(spacing: 8) {
            HStack {
                Text("候选 \(result.rows.count) 只").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.textSub)
                Spacer()
                Text("按综合因子分排序").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
            }
            ForEach(result.rows) { r in
                NavigationLink {
                    StockDetailView(code: r.code, name: r.name)
                } label: {
                    row(r)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 2)
    }

    private func row(_ r: FactorRow) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(r.name).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.text).lineLimit(1)
                    Text(r.code).font(.system(size: 8.5, design: .monospaced)).foregroundStyle(Theme.textDim)
                }
                HStack(spacing: 7) {
                    Text(r.market).font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                    if let ind = r.industry, !ind.isEmpty {
                        Text(ind).font(.system(size: 8.5)).foregroundStyle(Theme.textDim).lineLimit(1)
                    }
                    Text("因子覆盖 \(r.coverage)/\(FactorEngine.definitions.count)")
                        .font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                HStack(spacing: 6) {
                    Text(r.price.fmt()).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text)
                    Text((r.pct ?? 0).pct()).font(.system(size: 10.5, weight: .medium)).foregroundStyle(Theme.trendColor(r.pct ?? 0))
                }
                HStack(spacing: 7) {
                    Text("PE \(r.pe?.fmt(1) ?? "--")").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                    Text("PB \(r.pb?.fmt(1) ?? "--")").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                    Text("\(r.score.fmt(0))").font(.system(size: 10, weight: .bold))
                        .foregroundStyle(r.score >= 65 ? Theme.up : r.score >= 50 ? Theme.amber : Theme.accent)
                }
            }
        }
        .padding(10)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
    }

    private func run() async {
        loading = true
        defer { loading = false }
        // The Sina market-center fast path omits f24/f25/f62/f7. Factor
        // percentiles need those fields, so ask Eastmoney first and fall back
        // to the Sina rows only when the richer feed returns too little.
        if let spot = try? await MarketService.shared.spot(preferSina: false), spot.rows.count > 500 {
            rows = spot.rows
        } else {
            await store.ensureSpot()
            rows = store.spotRows
        }
        result = FactorEngine.run(rows, boards: boards, minScore: minScore)
    }
}
