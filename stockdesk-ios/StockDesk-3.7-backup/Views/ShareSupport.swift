import SwiftUI
import UIKit

enum ScreenCapture {
    static func fullImage() async -> UIImage? {
        guard let window = keyWindow(),
              let scroll = mainScroll(in: window),
              await scroll.bounds.width > 0 else { return visibleImage() }
        let original = await scroll.contentOffset
        let pageHeight = await max(scroll.bounds.height - 1, 1)
        let total = await max(scroll.contentSize.height, pageHeight)
        var offsets: [CGFloat] = []
        var y: CGFloat = 0
        while y < total - 1 && offsets.count < 12 {
            offsets.append(min(y, max(0, total - pageHeight)))
            y += pageHeight
        }
        if offsets.isEmpty { offsets = [0] }
        var tiles: [(CGFloat, UIImage)] = []
        let format = UIGraphicsImageRendererFormat()
        format.scale = await UIScreen.main.scale
        for offset in offsets {
            await scroll.setContentOffset(CGPoint(x: 0, y: offset), animated: false)
            await scroll.layoutIfNeeded()
            try? await Task.sleep(nanoseconds: 80_000_000)
            let renderer = await UIGraphicsImageRenderer(size: scroll.bounds.size, format: format)
            let image = renderer.image { _ in
                scroll.drawHierarchy(in: CGRect(origin: .zero, size: scroll.bounds.size), afterScreenUpdates: true)
            }
            tiles.append((offset, image))
        }
        await scroll.setContentOffset(original, animated: false)
        guard let first = tiles.first else { return nil }
        let width = first.1.size.width
        let height = min(total, CGFloat(tiles.count) * pageHeight)
        let stitched = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { _ in
            for (offset, image) in tiles {
                image.draw(at: CGPoint(x: 0, y: offset))
            }
        }
        return stitched
    }

    static func visibleImage() -> UIImage? {
        guard let window = keyWindow() else { return nil }
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
        return renderer.image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
    }

    private static func keyWindow() -> UIWindow? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
        return scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
    }

    private static func mainScroll(in view: UIView) -> UIScrollView? {
        var best: UIScrollView?
        func walk(_ v: UIView) {
            if let s = v as? UIScrollView, s.bounds.width > 200, s.contentSize.height > s.bounds.height + 10 {
                if best == nil || s.contentSize.height > best!.contentSize.height { best = s }
            }
            for sub in v.subviews { walk(sub) }
        }
        walk(view)
        return best
    }
}

struct ActivityView: UIViewControllerRepresentable {
    var items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
