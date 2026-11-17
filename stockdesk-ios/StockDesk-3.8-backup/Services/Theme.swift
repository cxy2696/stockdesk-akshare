import SwiftUI

enum Theme {
    private static var mode: String { UserDefaults.standard.string(forKey: "stockdesk.theme") ?? "hud" }
    static var isHUD: Bool { mode == "hud" }
    static var isDark: Bool { mode == "dark" || mode == "hud" }

    static var accent: Color { isHUD ? Color(hex: 0xF2C94C) : (mode == "dark" ? Color(hex: 0x4C8DFF) : Color(hex: 0x2563EB)) }
    static var up: Color { isHUD ? Color(hex: 0xFF5D5D) : Color(hex: 0xE5484D) }
    static var down: Color { isHUD ? Color(hex: 0x35D0A5) : Color(hex: 0x18A058) }
    static var flat: Color { isHUD ? Color(hex: 0x63706C) : Color(hex: 0x8B95A8) }

    static var bg: Color {
        if isHUD { return Color(hex: 0x070A0C) }
        return mode == "dark" ? Color(hex: 0x0B0F17) : Color(hex: 0xF4F6FA)
    }
    static var card: Color {
        if isHUD { return Color(hex: 0x0C1215) }
        return mode == "dark" ? Color(hex: 0x111827) : Color.white
    }
    static var cardSoft: Color {
        if isHUD { return Color(hex: 0x0F161A) }
        return mode == "dark" ? Color(hex: 0x141D2E) : Color(hex: 0xF8FAFC)
    }
    static var border: Color {
        if isHUD { return Color(hex: 0x26302F) }
        return mode == "dark" ? Color(hex: 0x1F2937) : Color(hex: 0xE4E9F2)
    }
    static var borderSoft: Color {
        if isHUD { return Color(hex: 0x182020) }
        return mode == "dark" ? Color(hex: 0x172033) : Color(hex: 0xECF0F7)
    }
    static var text: Color {
        if isHUD { return Color(hex: 0xF4F6F5) }
        return mode == "dark" ? Color(hex: 0xE5E7EB) : Color(hex: 0x0F172A)
    }
    static var textSub: Color {
        if isHUD { return Color(hex: 0xA5B0AD) }
        return mode == "dark" ? Color(hex: 0x9CA3AF) : Color(hex: 0x55627A)
    }
    static var textDim: Color {
        if isHUD { return Color(hex: 0x63706C) }
        return mode == "dark" ? Color(hex: 0x6B7280) : Color(hex: 0x8B95A8)
    }
    static var amber: Color { isHUD ? Color(hex: 0xF2C94C) : Color(hex: 0xD97706) }
    static var purple: Color { isHUD ? Color(hex: 0xB08CFF) : Color(hex: 0x7C3AED) }
    static var cyan: Color { isHUD ? Color(hex: 0x55D6C2) : Color(hex: 0x0891B2) }

    static var heroGradient: LinearGradient {
        LinearGradient(
            colors: isHUD ? [Color(hex: 0x0D1417), Color(hex: 0x080C0F)] : [Color(hex: 0xEAF1FF), Color(hex: 0xF7F9FF)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }
    static var accentGradient: LinearGradient {
        LinearGradient(
            colors: isHUD ? [Color(hex: 0xF2C94C), Color(hex: 0x8A6D14)] : [Color(hex: 0x2563EB), Color(hex: 0x7C3AED)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    static func trendColor(_ v: Double?) -> Color {
        guard let v, v != 0 else { return flat }
        return v > 0 ? up : down
    }

    static func trendArrow(_ v: Double?) -> String {
        guard let v, v != 0 else { return "minus" }
        return v > 0 ? "arrow.up.right" : "arrow.down.right"
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

/// Card container used across screens.
struct Card<Content: View>: View {
    var title: String? = nil
    var subtitle: String? = nil
    var trailing: AnyView? = nil
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if title != nil || trailing != nil {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if let title {
                        Text(title).font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.isHUD ? Theme.accent : Theme.text)
                    }
                    if let subtitle {
                        Text(subtitle).font(.system(size: 11)).foregroundStyle(Theme.textDim)
                    }
                    Spacer()
                    if let trailing { trailing }
                }
            }
            content
        }
        .padding(14)
        .background(
            Group {
                if Theme.isHUD {
                    LinearGradient(colors: [Color(hex: 0x0C1215), Color(hex: 0x080C0F)], startPoint: .top, endPoint: .bottom)
                } else {
                    Theme.card
                }
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.isHUD ? 3 : 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.isHUD ? 3 : 16, style: .continuous)
                .strokeBorder(Theme.isHUD ? Theme.accent.opacity(0.16) : Theme.borderSoft, lineWidth: 1)
        )
        .overlay(alignment: .top) {
            if Theme.isHUD {
                Rectangle().fill(LinearGradient(colors: [.clear, Theme.accent.opacity(0.55), .clear], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 1).padding(.horizontal, 10)
            }
        }
        .shadow(color: Color.black.opacity(Theme.isHUD ? 0.45 : 0.04), radius: Theme.isHUD ? 14 : 10, x: 0, y: Theme.isHUD ? 8 : 4)
    }
}

struct StatLine: View {
    let title: String
    let value: String
    var valueColor: Color = Theme.text
    var body: some View {
        HStack {
            Text(title).font(.system(size: 12.5)).foregroundStyle(Theme.textSub)
            Spacer()
            Text(value).font(.system(size: 12.5, weight: .medium)).foregroundStyle(valueColor)
        }
        .padding(.vertical, 5)
    }
}

struct SoftDivider: View {
    var body: some View {
        Rectangle().fill(Theme.borderSoft).frame(height: 1)
    }
}

extension View {
    func cardStyle() -> some View {
        self
            .padding(14)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.borderSoft, lineWidth: 1))
            .shadow(color: Color.black.opacity(0.04), radius: 10, x: 0, y: 4)
    }
}

extension Double {
    func fmt(_ digits: Int = 2) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = digits
        f.maximumFractionDigits = digits
        return f.string(from: NSNumber(value: self)) ?? "--"
    }

    func pct(_ digits: Int = 2) -> String {
        (self > 0 ? "+" : "") + String(format: "%.\(digits)f%%", self)
    }

    func signed(_ digits: Int = 2) -> String {
        (self > 0 ? "+" : "") + fmt(digits)
    }
}

extension Optional where Wrapped == Double {
    func fmt(_ digits: Int = 2) -> String {
        guard let v = self else { return "--" }
        return v.fmt(digits)
    }
    func pct(_ digits: Int = 2) -> String {
        guard let v = self else { return "--" }
        return v.pct(digits)
    }
}

func shortMoney(_ v: Double?) -> String {
    guard let v else { return "--" }
    let abs = Swift.abs(v)
    if abs >= 1e12 { return String(format: "%.2f万亿", v / 1e12) }
    if abs >= 1e8 { return String(format: "%.2f亿", v / 1e8) }
    if abs >= 1e4 { return String(format: "%.2f万", v / 1e4) }
    return String(format: "%.0f", v)
}

extension View {
    /// Keep long forms/tables readable on iPad while still filling the
    /// available width on iPhone and in landscape.
    func readableWidth(_ maxWidth: CGFloat = 1100) -> some View {
        frame(maxWidth: maxWidth).frame(maxWidth: .infinity)
    }
}
