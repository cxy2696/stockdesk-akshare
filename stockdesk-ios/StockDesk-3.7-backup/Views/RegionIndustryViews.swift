import SwiftUI

private let REGION_CITIES: [String: [String]] = [
    "北京": ["北京"], "天津": ["天津"], "上海": ["上海"], "重庆": ["重庆"],
    "河北": ["石家庄", "唐山", "保定", "廊坊"], "山西": ["太原", "大同", "长治"],
    "辽宁": ["沈阳", "大连", "鞍山"], "吉林": ["长春", "吉林"], "黑龙江": ["哈尔滨", "大庆", "齐齐哈尔"],
    "江苏": ["南京", "苏州", "无锡", "常州", "南通"], "浙江": ["杭州", "宁波", "温州", "绍兴", "嘉兴"],
    "安徽": ["合肥", "芜湖", "滁州"], "福建": ["福州", "厦门", "泉州", "宁德"], "江西": ["南昌", "赣州", "上饶"],
    "山东": ["济南", "青岛", "烟台", "潍坊"], "河南": ["郑州", "洛阳", "许昌"], "湖北": ["武汉", "宜昌", "襄阳"],
    "湖南": ["长沙", "株洲", "湘潭"], "广东": ["广州", "深圳", "东莞", "佛山", "珠海"], "海南": ["海口", "三亚"],
    "四川": ["成都", "绵阳", "宜宾"], "贵州": ["贵阳", "遵义"], "云南": ["昆明", "曲靖"], "陕西": ["西安", "宝鸡", "咸阳"],
    "甘肃": ["兰州", "天水"], "青海": ["西宁"], "台湾": ["台北", "新竹", "台中"],
    "内蒙古": ["呼和浩特", "包头", "鄂尔多斯"], "广西": ["南宁", "柳州", "桂林"], "西藏": ["拉萨"],
    "宁夏": ["银川"], "新疆": ["乌鲁木齐", "昌吉"],
]

struct RegionPreferencesView: View {
    @State private var dist = CompanyDistribution()
    @State private var prefs: [ProvincePreference] = []
    @State private var q = ""

    private var rows: [ProvincePreference] {
        prefs.filter { q.isEmpty || $0.short.contains(q) || (REGION_CITIES[$0.short] ?? []).contains { $0.contains(q) } }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("地域 · 行业偏好").font(.system(size: 20, weight: .bold)).foregroundStyle(Theme.text)
                        Text("全部省份与主要城市 · \(dist.total) 家上市公司").font(.system(size: 9.5)).foregroundStyle(Theme.textDim)
                    }
                    Spacer()
                }
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.textDim)
                    TextField("搜索省份 / 城市", text: $q).font(.system(size: 12)).foregroundStyle(Theme.text)
                }
                .padding(9).background(Theme.card).clipShape(RoundedRectangle(cornerRadius: 3))

                ForEach(rows) { p in
                    Card(title: "\(p.short) · \(p.count) 家", subtitle: (REGION_CITIES[p.short] ?? []).joined(separator: " · ")) {
                        if !p.industries.isEmpty {
                            Text("行业偏好：" + p.industries.joined(separator: " / ")).font(.system(size: 10.5)).foregroundStyle(Theme.accent)
                        }
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
                            SoftDivider()
                        }
                    }
                }
                if rows.isEmpty { ProgressView().padding(.top, 60) }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("地域")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            async let d = MarketService.shared.companyDistribution()
            async let p = MarketService.shared.provinceLeaders()
            dist = await d
            prefs = await p
        }
    }
}

struct IndustryNewsView: View {
    @State private var state: MarketState?
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let s = state {
                    Card(title: "行业情况分析", subtitle: "资金流入前列 · 5/20/60 日趋势") {
                        ForEach(s.industryTrends.prefix(7)) { b in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(b.name).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.text)
                                    Text(b.trend ?? "--").font(.system(size: 8.5)).foregroundStyle(Theme.accent)
                                        .padding(.horizontal, 5).padding(.vertical, 1)
                                        .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(Theme.accent.opacity(0.4)))
                                    Spacer()
                                    Text(b.pct.pct()).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.trendColor(b.pct))
                                }
                                HStack(spacing: 12) {
                                    Text("5日 " + b.pct5.pct()).foregroundStyle(Theme.trendColor(b.pct5))
                                    Text("20日 " + b.pct20.pct()).foregroundStyle(Theme.trendColor(b.pct20))
                                    Text("60日 " + b.pct60.pct()).foregroundStyle(Theme.trendColor(b.pct60))
                                }.font(.system(size: 9.5, design: .monospaced)).foregroundStyle(Theme.textSub)
                            }.padding(.vertical, 6)
                            SoftDivider()
                        }
                        Text("资金更偏向 " + s.industryTrends.prefix(3).map(\.name).joined(separator: "、") + "；趋势与资金同向的行业优先，跌破 MA20 且资金转出时降低暴露。")
                            .font(.system(size: 9.5)).foregroundStyle(Theme.textDim).lineSpacing(2)
                    }
                    Card(title: "行业要闻", subtitle: "消息面与行业相关快讯") {
                        ForEach(s.news.prefix(10)) { n in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(n.title).font(.system(size: 11)).foregroundStyle(Theme.text)
                                Text(n.time).font(.system(size: 9)).foregroundStyle(Theme.textDim)
                            }.padding(.vertical, 4)
                            SoftDivider()
                        }
                    }
                    Card(title: "投资趋势", subtitle: "关注方向与风险") {
                        ForEach(s.industryTrends.prefix(5)) { b in
                            HStack {
                                Text(b.name).font(.system(size: 11)).foregroundStyle(Theme.text)
                                Text(b.trend ?? "--").font(.system(size: 8.5)).foregroundStyle(b.trend == "多头" ? Theme.up : b.trend == "空头" ? Theme.down : Theme.textSub)
                                Spacer()
                                Text("资金 " + shortMoney(b.inflow)).font(.system(size: 9.5, design: .monospaced)).foregroundStyle(Theme.textSub)
                            }.padding(.vertical, 4)
                        }
                    }
                } else { ProgressView().padding(.top, 80) }
            }
            .padding(14)
        }
        .background(Theme.bg)
        .navigationTitle("行业要闻")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            var s = await MarketService.shared.marketState()
            s.news = await MarketService.shared.marketNews()
            state = s
        }
    }
}
