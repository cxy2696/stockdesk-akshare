import Foundation

enum ScreenerEngine {
    static func score(_ q: Quote) -> Double {
        var s = 50.0
        if let pe = q.pe, pe > 0 { s += max(-15, min(15, (25 - pe) / 2)) }
        if let pb = q.pb, pb > 0 { s += max(-10, min(10, (3 - pb) * 3)) }
        s += max(-12, min(12, (q.pct60 ?? 0) / 4))
        s += max(-6, min(6, ((q.turnover ?? 0) - 2) * 1.2))
        if let amount = q.amount, amount > 0, let inflow = q.mainInflow {
            s += max(-8, min(8, (inflow / amount * 100) / 2))
        }
        return max(0, min(100, s))
    }

    static func run(_ rows: [Quote], filters: ScreenFilters, limit: Int = 150) -> [ScreenRow] {
        var out: [ScreenRow] = []
        for r in rows {
            let name = r.name
            if filters.excludeST && (name.uppercased().contains("ST") || name.contains("退")) { continue }
            if filters.excludeNew && (name.hasPrefix("N") || name.hasPrefix("C")) { continue }
            if !filters.boards.isEmpty, let m = r.market, !filters.boards.contains(m) { continue }
            guard let px = r.price, px > 0 else { continue }
            if let v = filters.priceMin, px < v { continue }
            if let v = filters.priceMax, px > v { continue }
            let mcapYi = (r.mcap ?? 0) / 1e8
            if let v = filters.mcapMin, mcapYi < v { continue }
            if let v = filters.mcapMax, mcapYi > v { continue }
            if filters.onlyProfit && (r.pe == nil || (r.pe ?? 0) <= 0) { continue }
            if let v = filters.peMin, (r.pe ?? -1e9) < v { continue }
            if let v = filters.peMax, (r.pe ?? 1e9) > v { continue }
            if let v = filters.pbMin, (r.pb ?? -1e9) < v { continue }
            if let v = filters.pbMax, (r.pb ?? 1e9) > v { continue }
            if let v = filters.pctMin, (r.pct ?? -1e9) < v { continue }
            if let v = filters.pctMax, (r.pct ?? 1e9) > v { continue }
            if let v = filters.turnoverMin, (r.turnover ?? -1e9) < v { continue }
            if let v = filters.turnoverMax, (r.turnover ?? 1e9) > v { continue }
            if let v = filters.inflowMin, (r.mainInflow ?? 0) / 1e8 < v { continue }
            let kw = filters.keyword.trimmingCharacters(in: .whitespaces).uppercased()
            if !kw.isEmpty && !r.code.contains(kw) && !name.uppercased().contains(kw) { continue }
            out.append(ScreenRow(
                code: r.code, name: name, price: r.price, pct: r.pct, pct60: r.pct60,
                pe: r.pe, pb: r.pb, mcapYi: mcapYi, turnover: r.turnover,
                inflowYi: (r.mainInflow ?? 0) / 1e8, score: score(r), market: r.market ?? ""
            ))
        }
        let sortKey: (ScreenRow, ScreenRow) -> Bool
        switch filters.sort {
        case "pct": sortKey = { ($0.pct ?? -999) > ($1.pct ?? -999) }
        case "pct60": sortKey = { ($0.pct60 ?? -999) > ($1.pct60 ?? -999) }
        case "turnover": sortKey = { ($0.turnover ?? 0) > ($1.turnover ?? 0) }
        case "mcap": sortKey = { $0.mcapYi > $1.mcapYi }
        case "pe": sortKey = { ($0.pe ?? 1e9) < ($1.pe ?? 1e9) }
        case "pb": sortKey = { ($0.pb ?? 1e9) < ($1.pb ?? 1e9) }
        case "inflow": sortKey = { $0.inflowYi > $1.inflowYi }
        default: sortKey = { $0.score > $1.score }
        }
        out.sort(by: sortKey)
        return Array(out.prefix(limit))
    }
}
