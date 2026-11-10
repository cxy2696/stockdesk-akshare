import SwiftUI

struct BacktestView: View {
    @EnvironmentObject private var store: AppStore
    @State private var code = "600519"
    @State private var strategyID = "ma_cross"
    @State private var params: [String: Double] = ["fast": 5, "slow": 20]
    @State private var capital = "100000"
    @State private var result: BacktestResult?
    @State private var loading = false
    @State private var errorMessage: String?

    private var strategy: Strategy? { Strategies.all.first { $0.id == strategyID } }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                paramsCard
                if loading {
                    ProgressView("正在回测…").padding(.top, 40)
                } else if let r = result {
                    resultView(r)
                } else {
                    emptyCard
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 96)
        }
        .background(Theme.bg)
        .navigationTitle("策略回测")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if store.hasFlag("-autorun"), result == nil { await run() }
        }
    }

    private var paramsCard: some View {
        Card(title: "回测参数", subtitle: "日线 · 次日开盘成交") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: "number").foregroundStyle(Theme.textDim).font(.system(size: 13))
                    TextField("6 位代码", text: $code)
                        .keyboardType(.numberPad)
                        .onChange(of: code) { _, v in code = String(v.filter(\.isNumber).prefix(6)) }
                }
                .padding(10)
                .background(Theme.cardSoft)
                .clipShape(RoundedRectangle(cornerRadius: 9))

                Picker("策略", selection: $strategyID) {
                    ForEach(Strategies.all) { s in Text(s.name).tag(s.id) }
                }
                .pickerStyle(.menu)
                .onChange(of: strategyID) { _, id in
                    if let s = Strategies.all.first(where: { $0.id == id }) {
                        params = Dictionary(uniqueKeysWithValues: s.params.map { ($0.key, $0.value) })
                    }
                }

                if let s = strategy {
                    Text(s.desc).font(.system(size: 11)).foregroundStyle(Theme.textDim)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(s.params) { p in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(p.label).font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                                TextField(p.label, value: Binding(
                                    get: { params[p.key] ?? p.value },
                                    set: { params[p.key] = $0 }
                                ), format: .number)
                                .keyboardType(.decimalPad)
                                .padding(8)
                                .background(Theme.cardSoft)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }

                HStack {
                    Text("初始资金").font(.system(size: 12)).foregroundStyle(Theme.textSub)
                    Spacer()
                    TextField("100000", text: $capital)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .padding(8)
                        .frame(width: 130)
                        .background(Theme.cardSoft)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                Button {
                    Task { await run() }
                } label: {
                    Label("开始回测", systemImage: "flask.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.accent)

                if let errorMessage {
                    Text(errorMessage).font(.system(size: 11.5)).foregroundStyle(Theme.up)
                }
            }
        }
    }

    private var emptyCard: some View {
        Card {
            VStack(spacing: 8) {
                Image(systemName: "flask").font(.system(size: 26)).foregroundStyle(Theme.textDim.opacity(0.5))
                Text("设置参数后点击「开始回测」").font(.system(size: 12)).foregroundStyle(Theme.textDim)
            }
            .frame(maxWidth: .infinity, minHeight: 120)
        }
    }

    private func resultView(_ r: BacktestResult) -> some View {
        VStack(spacing: 12) {
            HStack {
                Text(r.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.text)
                Text(r.code).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.textDim)
                Spacer()
                Text(r.strategyName).font(.system(size: 10.5, weight: .medium))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Theme.accent.opacity(0.1)).foregroundStyle(Theme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                KpiTile(title: "策略收益", value: r.metrics.totalReturn.pct(), color: Theme.trendColor(r.metrics.totalReturn),
                        sub: "买入持有 \(r.metrics.benchmarkReturn.pct())")
                KpiTile(title: "最大回撤", value: r.metrics.maxDrawdown.pct(), color: Theme.down,
                        sub: "夏普 \(String(format: "%.2f", r.metrics.sharpe))")
                KpiTile(title: "交易次数", value: "\(r.metrics.tradeCount)", sub: "胜率 \(r.metrics.winRate.fmt(1))%")
                KpiTile(title: "超额收益", value: r.metrics.excessReturn.pct(), color: Theme.trendColor(r.metrics.excessReturn),
                        sub: "年化 \(r.metrics.annualReturn.pct())")
            }
            Card(title: "资金曲线", subtitle: "策略 vs 买入持有") {
                EquityChart(equity: r.equity, benchmark: r.benchmark, height: 170)
            }
            Card(title: "绩效指标") {
                HStack(alignment: .top, spacing: 16) {
                    VStack {
                        StatLine(title: "年化收益", value: r.metrics.annualReturn.pct())
                        StatLine(title: "波动率", value: r.metrics.volatility.pct())
                        StatLine(title: "索提诺", value: r.metrics.sortino.map { String(format: "%.2f", $0) } ?? "--")
                    }
                    VStack {
                        StatLine(title: "盈亏比", value: r.metrics.profitFactor.map { String(format: "%.2f", $0) } ?? "--")
                        StatLine(title: "平均持仓", value: r.metrics.avgHoldDays.map { String(format: "%.0f 天", $0) } ?? "--")
                        StatLine(title: "交易成本", value: "¥" + r.metrics.costs.fmt(0))
                    }
                }
            }
            Card(title: "交易明细", subtitle: "\(r.metrics.tradeCount) 笔完整交易") {
                VStack(spacing: 0) {
                    ForEach(r.trades.suffix(20).reversed()) { t in
                        HStack {
                            Text(t.type == "buy" ? "买" : "卖")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(t.type == "buy" ? Theme.up : Theme.down)
                                .padding(.horizontal, 5).padding(.vertical, 2)
                                .background((t.type == "buy" ? Theme.up : Theme.down).opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                            Text(t.date).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.textSub)
                            Spacer()
                            Text("\(t.qty)股 @ \(t.price.fmt())").font(.system(size: 11)).foregroundStyle(Theme.text)
                            if let pnl = t.pnl {
                                Text(pnl.signed()).font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(Theme.trendColor(pnl))
                            }
                        }
                        .padding(.vertical, 6)
                        SoftDivider()
                    }
                }
            }
        }
    }

    private func run() async {
        guard code.count == 6 else { errorMessage = "请输入 6 位股票代码"; return }
        errorMessage = nil
        loading = true
        defer { loading = false }
        guard let rows = try? await MarketService.shared.klines(code, period: "daily", limit: 1250, adjust: "qfq"),
              let s = strategy else {
            errorMessage = "行情获取失败"
            return
        }
        let name = (try? await MarketService.shared.quote(code))?.name ?? code
        let cap = Double(capital) ?? 100_000
        result = BacktestEngine.run(code: code, name: name, strategyID: s.id, strategyName: s.name,
                                    params: params, rows: rows, capital: cap)
        if result == nil { errorMessage = "数据不足或回测失败" }
    }
}
