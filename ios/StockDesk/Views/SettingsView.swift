import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("stockdesk.theme") private var themeRaw = "hud"
    @AppStorage("stockdesk.orientation") private var orientation = "auto"
    @AppStorage("stockdesk.admin.name") private var adminName = "StockDesk"
    @AppStorage("stockdesk.admin.uid") private var adminUid = "LOCAL-0001"
    @AppStorage("stockdesk.uiScale") private var uiScale = 1.0
    @AppStorage("stockdesk.lang") private var lang = "zh"
    @State private var showAccount = false
    @State private var clearing = false

    var body: some View {
        List {
            Section("Language / 语言") {
                Picker("Language", selection: $lang) {
                    Text("中文").tag("zh")
                    Text("English").tag("en")
                }
                .pickerStyle(.segmented)
            }

            Section("外观") {
                Picker("主题", selection: $themeRaw) {
                    Text("指挥舱 HUD").tag("hud")
                    Text("亮色").tag("light")
                    Text("深色").tag("dark")
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            Section("界面缩放") {
                Picker("缩放", selection: $uiScale) {
                    Text("100%").tag(1.0)
                    Text("120%").tag(1.2)
                    Text("150%").tag(1.5)
                }
                .pickerStyle(.segmented)
                Text("缩放应用到全部界面，包括 HUD、列表、图表与详情页。")
                    .font(.system(size: 11)).foregroundStyle(Theme.textDim)
            }

            Section("屏幕方向") {
                Picker("方向", selection: $orientation) {
                    Text("自动旋转").tag("auto")
                    Text("锁定竖屏").tag("portrait")
                    Text("锁定横屏").tag("landscape")
                }
                .pickerStyle(.segmented)
                Text("HUD 指挥舱在横屏下会自动扩展模块布局；修改后立即生效。")
                    .font(.system(size: 11)).foregroundStyle(Theme.textDim)
            }

            Section("账户") {
                Button {
                    showAccount = true
                } label: {
                    HStack {
                        Text("账户参数").foregroundStyle(Theme.text)
                        Spacer()
                        Text("初始资产 ¥\(store.account.assets.fmt(0)) · 总资产 ¥\(store.summary.total.fmt(0))")
                            .font(.system(size: 11.5)).foregroundStyle(Theme.textDim)
                    }
                }
            }

            Section("管理员名片") {
                HStack {
                    Text("名称").foregroundStyle(Theme.text)
                    Spacer()
                    TextField("StockDesk", text: $adminName).multilineTextAlignment(.trailing).foregroundStyle(Theme.textSub)
                }
                HStack {
                    Text("UID").foregroundStyle(Theme.text)
                    Spacer()
                    TextField("LOCAL-0001", text: $adminUid).multilineTextAlignment(.trailing).foregroundStyle(Theme.textSub)
                }
                Text("名称与 UID 显示在 HUD 中枢左下角管理员名片上，立即生效。")
                    .font(.system(size: 11)).foregroundStyle(Theme.textDim)
            }

            Section("数据") {
                HStack {
                    Text("交易记录")
                    Spacer()
                    Text("\(store.trades.count) 笔").foregroundStyle(Theme.textDim)
                }
                HStack {
                    Text("自选股")
                    Spacer()
                    Text("\(store.watchlist.count) 只").foregroundStyle(Theme.textDim)
                }
                Button {
                    clearing = true
                    Task {
                        await Networking.shared.clearCache()
                        await store.refreshAll()
                        clearing = false
                    }
                } label: {
                    HStack {
                        Text("清空行情缓存").foregroundStyle(Theme.accent)
                        if clearing { Spacer(); ProgressView() }
                    }
                }
            }

            Section("关于") {
                HStack {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Theme.accentGradient)
                        .clipShape(RoundedRectangle(cornerRadius: 9))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("StockDesk").font(.system(size: 15, weight: .semibold))
                        Text("完全本地运行 · 无账号 · 无上传")
                            .font(.system(size: 11)).foregroundStyle(Theme.textDim)
                    }
                }
                .padding(.vertical, 2)
                Text("行情、K 线、财务数据来自东方财富公开接口，可能存在延迟，仅用于个人研究，不构成投资建议。所有账户数据保存在本机。")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textDim)
            }
        }
        .scrollContentBackground(.hidden)
        .frame(maxWidth: 900)
        .frame(maxWidth: .infinity)
        .background(Theme.bg)
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showAccount) { AccountEditorView() }
        .onChange(of: orientation) { _, v in OrientationManager.shared.apply(v) }
        .onChange(of: themeRaw) { _, _ in OrientationManager.shared.apply(orientation) }
    }
}
