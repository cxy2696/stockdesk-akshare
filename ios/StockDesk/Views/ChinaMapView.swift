import SwiftUI

private struct ChinaFeature {
    var name: String
    var polygons: [[[[Double]]]]   // [polygon][ring][point][lon,lat]
}

struct ChinaMapView: View {
    let provinces: [ProvinceDistribution]
    @Binding var selected: ProvinceDistribution?
    @State private var features: [ChinaFeature] = []
    @State private var zoom: CGFloat = 1
    @State private var lastZoom: CGFloat = 1
    @State private var pan: CGSize = .zero
    @State private var lastPan: CGSize = .zero

    private let lonMin = 73.0, lonMax = 135.0, latMin = 17.0, latMax = 54.0

    var body: some View {
        GeometryReader { geo in
            Canvas { ctx, size in
                guard !features.isEmpty else { return }
                let s = min(size.width / (lonMax - lonMin), size.height / (latMax - latMin))
                let ox = (size.width - (lonMax - lonMin) * s) / 2
                let oy = (size.height - (latMax - latMin) * s) / 2
                func pt(_ lon: Double, _ lat: Double) -> CGPoint {
                    CGPoint(x: ox + (lon - lonMin) * s, y: oy + (latMax - lat) * s)
                }
                let maxCount = max(1, provinces.map(\.count).max() ?? 1)
                for f in features {
                    let dist = provinces.first { $0.name == f.name }
                    let t = dist.map { sqrt(Double($0.count) / Double(maxCount)) } ?? 0
                    let fill = Color(red: 0.07 + 0.90 * t, green: 0.11 + 0.66 * t, blue: 0.09 + 0.22 * t)
                    var path = Path()
                    for poly in f.polygons {
                        for ring in poly {
                            guard ring.count > 2 else { continue }
                            path.move(to: pt(ring[0][0], ring[0][1]))
                            for p in ring.dropFirst() { path.addLine(to: pt(p[0], p[1])) }
                            path.closeSubpath()
                        }
                    }
                    ctx.fill(path, with: .color(fill))
                    let isSelected = selected?.name == f.name
                    ctx.stroke(path, with: .color(isSelected ? Theme.accent : Color(hex: 0x39433a)), lineWidth: isSelected ? 1.6 : 0.5)
                }
                // top province labels
                for p in provinces.prefix(8) {
                    guard let f = features.first(where: { $0.name == p.name }) else { continue }
                    let points = f.polygons.flatMap { $0.flatMap { $0 } }
                    guard !points.isEmpty else { continue }
                    let lon = points.map { $0[0] }.reduce(0, +) / Double(points.count)
                    let lat = points.map { $0[1] }.reduce(0, +) / Double(points.count)
                    let c = pt(lon, lat)
                    ctx.draw(Text(p.short).font(.system(size: 7, weight: .medium)).foregroundColor(Color(hex: 0x0c100d)), at: c)
                }
            }
            .scaleEffect(zoom)
            .offset(pan)
            .clipped()
            .gesture(
                MagnificationGesture()
                    .onChanged { v in zoom = min(4, max(1, lastZoom * v)) }
                    .onEnded { _ in lastZoom = zoom; if zoom == 1 { pan = .zero; lastPan = .zero } }
            )
            .simultaneousGesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { v in
                        guard zoom > 1 else { return }
                        pan = CGSize(width: lastPan.width + v.translation.width, height: lastPan.height + v.translation.height)
                    }
                    .onEnded { _ in lastPan = pan }
            )
            .overlay(alignment: .topTrailing) {
                VStack(spacing: 6) {
                    Button { zoom = min(4, zoom + 0.3); lastZoom = zoom } label: { Image(systemName: "plus").font(.system(size: 11, weight: .bold)) }
                    Button { zoom = max(1, zoom - 0.3); lastZoom = zoom; if zoom == 1 { pan = .zero; lastPan = .zero } } label: { Image(systemName: "minus").font(.system(size: 11, weight: .bold)) }
                    Button { zoom = 1; lastZoom = 1; pan = .zero; lastPan = .zero } label: { Image(systemName: "arrow.counterclockwise").font(.system(size: 10)) }
                }
                .foregroundStyle(Theme.text)
                .padding(6)
                .background(Theme.card.opacity(0.92))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .padding(6)
            }
            .onAppear { if features.isEmpty { load() } }
        }
    }

    private func load() {
        guard let url = Bundle.main.url(forResource: "china", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let fs = obj["features"] as? [[String: Any]] else { return }
        var out: [ChinaFeature] = []
        for f in fs {
            guard let props = f["properties"] as? [String: Any], let name = props["name"] as? String,
                  let geom = f["geometry"] as? [String: Any], let coords = geom["coordinates"] else { continue }
            let type = geom["type"] as? String ?? ""
            var polys: [[[[Double]]]] = []
            if type == "Polygon", let rings = coords as? [[[Double]]] {
                polys = [rings]
            } else if type == "MultiPolygon", let mp = coords as? [[[[Double]]]] {
                polys = mp.map { $0 }
            }
            if !polys.isEmpty { out.append(ChinaFeature(name: name, polygons: polys)) }
        }
        features = out
    }
}
