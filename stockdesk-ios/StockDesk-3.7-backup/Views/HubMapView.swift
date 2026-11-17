import SwiftUI

struct HubMapView: View {
    @EnvironmentObject private var store: AppStore
    @State private var dist = CompanyDistribution()
    @State private var selected: ProvinceDistribution?
    @State private var daily: MarketState?
    @State private var indexes: [IndexAnalysisRow] = []
    @State private var prefs: [ProvincePreference] = []

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("中国上市公司分布").font(.system(size: 20, weight: .bold)).foregroundStyle(Theme.text)
                        Text("东方财富地域板块 · 沪深京 A 股").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("上市公司总数").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                        Text("\(dist.total)").font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Theme.accent)
                        Text("\(dist.provinces.count) 个地区").font(.system(size: 8.5)).foregroundStyle(Theme.textDim)
                    }
                }

                Card(title: "地域分布地图", subtitle: "双指缩放 / 拖动 · 颜色越亮公司越多") {
                    ChinaMapView(provinces: dist.provinces, selected: $selected)
                        .frame(height: 300)
                }

                if let s = selected {
                    Card(title: "\(s.short) · 地域概览", subtitle: "\(s.count) 家上市公司") {
                        HStack(spacing: 16) {
                            kv("上涨", "\(s.up)", Theme.up)
                            kv("下跌", "\(s.down)", Theme.down)
                            kv("平盘", "\(s.flat)", Theme.textSub)
                            kv("地域涨跌", s.pct.pct(), Theme.trendColor(s.pct))
                        }
                        Text("主力净流入 \(shortMoney(s.inflow))").font(.system(size: 9.5)).foregroundStyle(Theme.textDim).padding(.top, 4)
                    }
                }

                Card(title: "全部省份领涨公司", subtitle: "点击省份展开 / 折叠 · 可滚动") {
                    ForEach(prefs) { p in
                        DisclosureGroup {
                            ForEach(p.leaders) { s in
                                NavigationLink { StockDetailView(code: s.code, name: s.name) } label: {
                                    HStack(spacing: 7) {
                                        Text(s.name).font(.system(size: 11.5, weight: .medium)).foregroundStyle(Theme.text)
                                        Text(s.code).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.textDim)
                                        Text(s.industry).font(.system(size: 9)).foregroundStyle(Theme.textDim).lineLimit(1)
                                        Spacer()
                                        Text(s.pct.pct()).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(Theme.trendColor(s.pct))
                                    }.padding(.vertical, 3)
                                }.buttonStyle(.plain)
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Text(p.short).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.text)
                                Text("\(p.count) 家").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                                Text(p.industries.joined(separator: " / ")).font(.system(size: 9)).foregroundStyle(Theme.accent).lineLimit(1)
                                Spacer()
                            }
                        }
                        .tint(Theme.accent)
                        SoftDivider()
                    }
                    if prefs.isEmpty { ProgressView().padding(.vertical, 10) }
                }

                NavigationLink { AssetAnalysisView() } label: { linkCard("资产分析", "¥\(store.summary.total.fmt(0))", "资金分配 · 交易偏好 · 趋势与习惯") }
                NavigationLink { AdviceCenterView() } label: { linkCard("投资建议", daily?.label ?? "--", "历史总结 · 未来趋势 · 标的推荐") }
                NavigationLink { IndexAnalysisView() } label: { linkCard("指数分析", "\(indexes.count) 个指数", "上证/沪深300/创业板/科创50/美股三大指数") }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("地域")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            async let d = MarketService.shared.companyDistribution()
            async let m = MarketService.shared.marketState()
            async let ix = MarketService.shared.indexAnalysis()
            async let pl = MarketService.shared.provinceLeaders()
            dist = await d
            daily = await m
            indexes = await ix
            prefs = await pl
            if selected == nil { selected = dist.provinces.first }
        }
    }

    private func kv(_ k: String, _ v: String, _ c: Color) -> some View {
        VStack(spacing: 1) { Text(v).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(c); Text(k).font(.system(size: 8.5)).foregroundStyle(Theme.textDim) }
            .frame(maxWidth: .infinity)
    }

    private func linkCard(_ title: String, _ value: String, _ sub: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 10, weight: .medium)).foregroundStyle(Theme.accent)
                Text(value).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.text)
                Text(sub).font(.system(size: 9)).foregroundStyle(Theme.textDim)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(Theme.textDim)
        }
        .padding(12)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(Theme.accent.opacity(0.16), lineWidth: 1))
    }
}
