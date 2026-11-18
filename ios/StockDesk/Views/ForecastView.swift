import SwiftUI

struct ForecastView: View {
    @State private var hmm: HMMSnapshot?
    @State private var forecast: MarketForecast?
    @State private var loading = true
    @State private var updated = ""
    @State private var sampleDate = ""
    @State private var sampleCount = 0
    @State private var error: String?
    @State private var refreshError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if loading && forecast == nil {
                    ProgressView("正在计算 HMM 状态与 5 日预测…").padding(.top, 80)
                } else if let f = forecast {
                    if let refreshError {
                        errorBanner(refreshError)
                    }

                    Card(title: "未来 5 日 · 状态条件估算", subtitle: "HMM 转移矩阵 × 状态历史收益与波动") {
                        HStack(spacing: 10) {
                            metric("5 日估算", f.expected5d.map { ($0 * 100).pct(2) } ?? "--",
                                   color: moveColor(f.expected5d))
                            metric("上涨概率", f.probUp.map { ($0 * 100).fmt(0) + "%" } ?? "--")
                            metric("当前状态", f.state, color: Theme.stateColor(f.state))
                        }
                        if let c = f.confidence {
                            Text("状态置信度 \((c * 100).pctLevel(1))")
                                .font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                        }
                        Text(sampleLine)
                            .font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                        ForEach(Array(f.nextProbs.prefix(3)), id: \.0) { item in
                            HStack(spacing: 8) {
                                Text(item.0).font(.system(size: 10)).foregroundStyle(Theme.textSub).frame(width: 42, alignment: .leading)
                                GeometryReader { geo in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(Theme.cardSoft).frame(height: 6)
                                        Capsule().fill(Theme.stateColor(item.0))
                                            .frame(width: geo.size.width * max(0.02, min(1, item.1)), height: 6)
                                    }
                                }.frame(height: 6)
                                Text((item.1 * 100).pctLevel(1))
                                    .font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim).frame(width: 44, alignment: .trailing)
                            }
                        }
                        Text(f.caveat).font(.system(size: 9.5)).foregroundStyle(Theme.textDim).lineSpacing(2)
                    }

                    if let h = hmm {
                        Card(title: "HMM 当前状态", subtitle: "沪深300 · 后验概率越高越确定") {
                            HStack(spacing: 8) {
                                Text(h.state).font(.system(size: 24, weight: .bold)).foregroundStyle(Theme.stateColor(h.state))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("预计持续 \(h.expectedDays.fmt(1)) 个交易日")
                                        .font(.system(size: 10)).foregroundStyle(Theme.textSub)
                                    Text(h.signal).font(.system(size: 9.5)).foregroundStyle(Theme.textDim).lineLimit(2)
                                }
                                Spacer()
                            }
                            ForEach(h.probabilities, id: \.label) { p in
                                HStack(spacing: 8) {
                                    Text(p.label).font(.system(size: 10)).foregroundStyle(Theme.stateColor(p.label)).frame(width: 42, alignment: .leading)
                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            Capsule().fill(Theme.cardSoft).frame(height: 5)
                                            Capsule().fill(Theme.stateColor(p.label)).frame(width: geo.size.width * max(0.01, min(1, p.p)), height: 5)
                                        }
                                    }.frame(height: 5)
                                    Text((p.p * 100).pctLevel(1))
                                        .font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim).frame(width: 44, alignment: .trailing)
                                }
                            }
                            Text(sampleLine).font(.system(size: 8.5)).foregroundStyle(Theme.textDim).padding(.top, 4)
                        }
                        Card(title: "状态转移", subtitle: "行 = 当前，列 = 下一交易日") {
                            if h.transition.count == 3 {
                                VStack(spacing: 3) {
                                    HStack(spacing: 4) {
                                        Text("当前 ↓").font(.system(size: 8)).foregroundStyle(Theme.textDim).frame(width: 44, alignment: .leading)
                                        ForEach(QuantModels.labels, id: \.self) { label in
                                            Text(label).font(.system(size: 8)).foregroundStyle(Theme.textDim).frame(maxWidth: .infinity)
                                        }
                                    }
                                    ForEach(Array(h.transition.enumerated()), id: \.offset) { i, row in
                                        HStack(spacing: 4) {
                                            Text(QuantModels.labels[i]).font(.system(size: 9.5)).foregroundStyle(Theme.stateColor(QuantModels.labels[i])).frame(width: 44, alignment: .leading)
                                            ForEach(Array(row.enumerated()), id: \.offset) { _, v in
                                                Text((v * 100).pctLevel(1))
                                                    .font(.system(size: 9, design: .monospaced))
                                                    .foregroundStyle(Theme.textSub)
                                                    .frame(maxWidth: .infinity)
                                                    .padding(.vertical, 4)
                                                    .background(Theme.accent.opacity(max(0.02, min(0.18, v * 0.18))))
                                                    .clipShape(RoundedRectangle(cornerRadius: 3))
                                            }
                                        }
                                    }
                                }
                            } else {
                                Text("转移矩阵暂时不可用").font(.system(size: 10)).foregroundStyle(Theme.textDim)
                            }
                        }
                    }

                    Card(title: "怎么用", subtitle: "先看市场环境，再决定总仓位") {
                        Text("1. 估算为正、概率 >55%：可以按每日策略的中上仓位执行。\n2. 估算接近 0、概率 45%–55%：只做结构性机会。\n3. 估算为负、概率 <45%：降低总仓位，保留现金。\n这是状态条件收益，不是点位预测；个股买卖仍看交易决策页。")
                            .font(.system(size: 10.5)).foregroundStyle(Theme.textSub).lineSpacing(3)
                    }
                    Text("v\(AppInfo.version) · 模型 v2.2.0 · " + (updated.isEmpty ? "" : updated))
                        .font(.system(size: 8, design: .monospaced)).foregroundStyle(Theme.textDim)
                } else {
                    VStack(spacing: 12) {
                        ContentUnavailableView("预测暂时不可用", systemImage: "waveform.path.ecg",
                                               description: Text(error ?? "指数日线样本不足，稍后重试"))
                        Button("重新计算") { Task { await load() } }
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.accent)
                    }
                    .padding(.top, 70)
                }
            }
            .padding(14)
            .readableWidth()
        }
        .background(Theme.bg)
        .navigationTitle("市场预测")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private var sampleLine: String {
        guard sampleCount > 0 else { return "样本来不及返回，先显示上一次结果。" }
        return "样本：沪深300 \(sampleCount) 根日线" + (sampleDate.isEmpty ? "" : " · 截至 \(sampleDate) 收盘")
    }

    private func metric(_ title: String, _ value: String, color: Color = Theme.text) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            Text(value).font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.65)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Theme.cardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }

    private func moveColor(_ v: Double?) -> Color {
        guard let v, abs(v) > 0.00005 else { return Theme.textSub }
        return v > 0 ? Theme.up : Theme.down
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 9)).foregroundStyle(Theme.up).padding(.top, 2)
            Text(text).font(.system(size: 9.5)).foregroundStyle(Theme.textSub).lineSpacing(1.6)
            Spacer(minLength: 0)
        }
        .padding(9)
        .background(Theme.up.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func load() async {
        loading = true
        defer { loading = false }
        let kl = (try? await MarketService.shared.klines("000300", limit: 420, adjust: "", secidOverride: "1.000300")) ?? []
        guard kl.count > 60 else {
            if forecast == nil {
                error = "指数日线样本不足（\(kl.count) 根），稍后重试"
                hmm = nil
                forecast = nil
            } else {
                refreshError = "本次刷新失败，继续显示上一次结果。"
            }
            return
        }
        let closes = kl.map(\.close)
        let rets = zip(closes.dropFirst(), closes).map { log($0 / $1) * 100 }
        let snapshot = QuantModels.hmm(rets)
        hmm = snapshot
        forecast = DecisionEngine.forecast(snapshot)
        error = nil
        refreshError = nil
        sampleDate = kl.last?.date ?? ""
        sampleCount = kl.count
        let df = DateFormatter(); df.dateFormat = "HH:mm:ss"
        updated = df.string(from: Date())
    }
}
