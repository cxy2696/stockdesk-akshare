import Foundation

/// Single source of truth for the version shown in the UI.
///
/// The version lives in `project.yml` (`MARKETING_VERSION`) and ends up in
/// Info.plist. Reading it from the bundle avoids the old failure mode where
/// the HUD said 4.1.2 while the project had already moved on.
enum AppInfo {
    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
    }

    static var build: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
    }

    static var versionLabel: String { "v\(version) (\(build))" }
}
