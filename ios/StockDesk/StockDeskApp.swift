import SwiftUI

@main
struct StockDeskApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = AppStore()
    @AppStorage("stockdesk.theme") private var themeRaw: String = "hud"
    @AppStorage("stockdesk.themeMigrated") private var themeMigrated = false
    @AppStorage("stockdesk.orientation") private var orientation = "auto"
    @AppStorage("stockdesk.uiScale") private var uiScale = 1.0

    var body: some Scene {
        WindowGroup {
            GeometryReader { geo in
                RootTabView()
                    .frame(width: geo.size.width / uiScale, height: geo.size.height / uiScale)
                    .scaleEffect(uiScale, anchor: .topLeading)
            }
                .id(themeRaw)
                .environmentObject(store)
                .preferredColorScheme(themeRaw == "light" ? .light : .dark)
                .tint(Theme.accent)
                .onAppear {
                    if !themeMigrated {
                        themeRaw = "hud"
                        themeMigrated = true
                    }
                    OrientationManager.shared.apply(orientation)
                }
                .task {
                    try? await Task.sleep(nanoseconds: 800_000_000)
                    OrientationManager.shared.apply(orientation)
                }
        }
    }
}
