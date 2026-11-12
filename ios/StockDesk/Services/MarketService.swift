import Foundation

/// A dynamically-keyed JSON value for the loosely typed Eastmoney payloads.
struct JVal: Decodable {
    let raw: Any?

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { raw = nil }
        else if let v = try? c.decode(Double.self) { raw = v }
        else if let v = try? c.decode(Int.self) { raw = Double(v) }
        else if let v = try? c.decode(String.self) { raw = v }
        else if let v = try? c.decode(Bool.self) { raw = v }
        else if let v = try? c.decode([String: JVal].self) { raw = v }
        else if let v = try? c.decode([JVal].self) { raw = v }
        else { raw = nil }
    }

    var double: Double? {
        if let d = raw as? Double { return d }
        if let s = raw as? String { return Double(s) }
        return nil
    }
    var string: String? {
        if let s = raw as? String { return s }
        if let d = raw as? Double { return String(format: "%.0f", d) }
        return nil
    }
    var dict: [String: JVal]? { raw as? [String: JVal] }
    var array: [JVal]? { raw as? [JVal] }
}

struct JObj: Decodable {
    let fields: [String: JVal]
    init(from decoder: Decoder) throws {
        fields = try decoder.singleValueContainer().decode([String: JVal].self)
    }
    subscript(key: String) -> JVal? { fields[key] }
}

/// Eastmoney public quote client (same data source as the desktop build).
actor MarketService {
    static let shared = MarketService()
    private let net = Networking.shared

    private let listURL = "https://push2.eastmoney.com/api/qt/clist/get"
    private let quoteURL = "https://push2.eastmoney.com/api/qt/stock/get"
    private let hisURL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
    private let fsA = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
    private let spotFields = "f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f22,f23,f24,f25,f11,f62,f100"

    // MARK: - helpers

    nonisolated static func secid(_ code: String) -> String {
        // index codes share the 6-digit namespace with stocks
        let indexMap = ["000300": "1.000300", "000688": "1.000688", "000016": "1.000016"]
        if let idx = indexMap[code] { return idx }
        if code.hasPrefix("6") || code.hasPrefix("5") || code.hasPrefix("9") { return "1.\(code)" }
        return "0.\(code)"
    }

    static func marketOf(_ code: String) -> String {
        if code.hasPrefix("688") { return "科创板" }
        if code.hasPrefix("60") || code.hasPrefix("900") { return "沪市主板" }
        if code.hasPrefix("300") || code.hasPrefix("301") { return "创业板" }
        if code.hasPrefix("00") || code.hasPrefix("200") { return "深市主板" }
        if code.hasPrefix("8") || code.hasPrefix("4") || code.hasPrefix("92") { return "北交所" }
        return "其他"
    }

    nonisolated static func quoteFrom(_ f: [String: JVal]) -> Quote {
        let code = f["f12"]?.string ?? ""
        return Quote(
            code: code,
            name: f["f14"]?.string ?? "",
            price: f["f2"]?.double,
            pct: f["f3"]?.double,
            chg: f["f4"]?.double,
            high: f["f15"]?.double,
            low: f["f16"]?.double,
            open: f["f17"]?.double,
            prevClose: f["f18"]?.double,
            volume: f["f5"]?.double,
            amount: f["f6"]?.double,
            turnover: f["f8"]?.double,
            pe: f["f9"]?.double,
            pb: f["f23"]?.double,
            mcap: f["f20"]?.double,
            fcap: f["f21"]?.double,
            volumeRatio: f["f10"]?.double,
            market: Self.marketOf(code),
            pct60: f["f24"]?.double,
            pctYtd: f["f25"]?.double,
            mainInflow: f["f62"]?.double,
            amplitude: f["f7"]?.double,
            speed: f["f22"]?.double,
            industry: f["f100"]?.string
        )
    }

    // MARK: - spot

    private func sinaSpot(ttl: TimeInterval) async -> (rows: [Quote], date: String) {
        var all: [Quote] = []
        for start in stride(from: 1, through: 56, by: 8) {
            await withTaskGroup(of: [Quote].self) { group in
                for page in start...min(start + 7, 56) {
                    group.addTask {
                        let url = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=\(page)&num=100&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=page"
                        guard let arr = try? await self.net.getJSON([JVal].self, url: url, ttl: ttl, key: "sina-spot-\(page)") else { return [] }
                        var rows: [Quote] = []
                        for item in arr {
                            guard let d = item.dict, let code = d["code"]?.string, let name = d["name"]?.string else { continue }
                            rows.append(Quote(code: code, name: name, price: d["trade"]?.double, pct: d["changepercent"]?.double,
                                              chg: d["pricechange"]?.double, high: d["high"]?.double,
                                              low: d["low"]?.double, open: d["open"]?.double,
                                              prevClose: d["settlement"]?.double, volume: d["volume"]?.double,
                                              amount: d["amount"]?.double, turnover: d["turnoverratio"]?.double,
                                              pe: d["per"]?.double, pb: d["pb"]?.double,
                                              mcap: d["mktcap"]?.double, fcap: d["nmc"]?.double,
                                              market: Self.marketOf(code)))
                        }
                        return rows
                    }
                }
                for await rows in group { all.append(contentsOf: rows) }
            }
        }
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        return (all.sorted { ($0.amount ?? 0) > ($1.amount ?? 0) }, df.string(from: Date()))
    }

    func spot(ttl: TimeInterval = 180) async throws -> (rows: [Quote], date: String) {
        let sina = await sinaSpot(ttl: ttl)
        if sina.rows.count > 100 { return sina }
        var all: [[String: JVal]] = []
        var total = 0
        var page = 1
        while page <= 70 {
            let url = "\(listURL)?po=1&np=1&fltt=2&invt=2&fid=f3&fs=\(fsA.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? fsA)&fields=\(spotFields)&pn=\(page)&pz=100"
            let obj = try await net.getJSON(JObj.self, url: url, ttl: ttl, key: "spot2-p\(page)")
            guard let data = obj["data"]?.dict else { break }
            total = Int(data["total"]?.double ?? 0)
            let diff = data["diff"]?.array ?? []
            for item in diff {
                if let d = item.dict { all.append(d) }
            }
            if all.count >= total || diff.isEmpty { break }
            page += 1
        }
        let rows = all.compactMap { d -> Quote? in
            let q = Self.quoteFrom(d)
            return q.code.isEmpty ? nil : q
        }
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        if rows.count < 500 {
            let fallback = await sinaSpot(ttl: ttl)
            if fallback.rows.count > rows.count { return fallback }
        }
        if rows.isEmpty { return await sinaSpot(ttl: ttl) }
        return (rows, df.string(from: Date()))
    }

    // MARK: - quote

    private func sinaStockQuote(_ code: String) async -> Quote? {
        let symbol = sinaSymbol(code)
        guard let data = try? await net.get("https://hq.sinajs.cn/list=\(symbol)", ttl: 8, key: "sina-q-\(symbol)"),
              let text = String(data: data, encoding: .isoLatin1),
              let payload = text.split(separator: "=\"").dropFirst().first?.split(separator: "\"").first else { return nil }
        let p = payload.split(separator: ",").map(String.init)
        guard p.count > 9, let price = Double(p[3]), let prev = Double(p[2]), prev > 0 else { return nil }
        return Quote(code: code, name: "", price: price, pct: (price / prev - 1) * 100,
                     chg: price - prev, high: Double(p[4]), low: Double(p[5]), open: Double(p[1]),
                     prevClose: prev, volume: Double(p[8]), amount: Double(p[9]),
                     market: Self.marketOf(code))
    }

    func quote(_ code: String) async throws -> Quote {
        let fields = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171,f50"
        let url = "\(quoteURL)?secid=\(Self.secid(code))&fltt=2&invt=2&fields=\(fields)"
        guard let obj = try? await net.getJSON(JObj.self, url: url, ttl: 20, key: "q-\(code)") else {
            if let q = await sinaStockQuote(code) { return q }
            throw APIError.noData
        }
        guard let d = obj["data"]?.dict else {
            if let q = await sinaStockQuote(code) { return q }
            throw APIError.noData
        }
        return Quote(
            code: d["f57"]?.string ?? code,
            name: d["f58"]?.string ?? "",
            price: d["f43"]?.double,
            pct: d["f170"]?.double,
            chg: d["f169"]?.double,
            high: d["f44"]?.double,
            low: d["f45"]?.double,
            open: d["f46"]?.double,
            prevClose: d["f60"]?.double,
            volume: d["f47"]?.double,
            amount: d["f48"]?.double,
            turnover: d["f168"]?.double,
            pe: d["f162"]?.double,
            pb: d["f167"]?.double,
            mcap: d["f116"]?.double,
            fcap: d["f117"]?.double,
            volumeRatio: d["f50"]?.double,
            market: Self.marketOf(code),
            amplitude: d["f171"]?.double
        )
    }

    func quotes(_ codes: [String]) async -> [String: Quote] {
        var out: [String: Quote] = [:]
        let unique = Array(Set(codes))
        // two passes: the public quote endpoint occasionally drops one of many
        // concurrent requests, so retry the misses once
        for pass in 0..<2 {
            let missing = unique.filter { out[$0] == nil }
            if missing.isEmpty { break }
            if pass == 1 { try? await Task.sleep(nanoseconds: 250_000_000) }
            await withTaskGroup(of: (String, Quote?).self) { group in
                for code in missing {
                    group.addTask { (code, try? await self.quote(code)) }
                }
                for await (code, q) in group {
                    if let q { out[code] = q }
                }
            }
        }
        return out
    }

    // MARK: - klines

    // MARK: - Sina fallback (Eastmoney is frequently rate-limited)

    private func sinaSymbol(_ code: String, _ secid: String? = nil) -> String {
        let sec = secid ?? Self.secid(code)
        if sec.hasPrefix("1.") { return "sh" + code }
        if sec.hasPrefix("0.") { return (code.hasPrefix("399") || code.hasPrefix("899")) ? "sz" + code : "sz" + code }
        return "sz" + code
    }

    private struct SinaK: Decodable {
        let day: String
        let open: String
        let high: String
        let low: String
        let close: String
        let volume: String?
        let amount: String?
    }

    private func sinaKlines(_ code: String, period: String, limit: Int, secid: String? = nil) async -> [KLine] {
        let symbol = sinaSymbol(code, secid)
        let scale = ["5m": "5", "30m": "30", "60m": "60"][period] ?? "240"
        let url = "https://quotes.sina.cn/cn/api/jsonp_v2.php/=/CN_MarketDataService.getKLineData?symbol=\(symbol)&scale=\(scale)&ma=no&datalen=\(max(10, limit))"
        guard let data = try? await net.get(url, ttl: 60, key: "sina-k-\(symbol)-\(scale)"),
              var text = String(data: data, encoding: .utf8) else { return [] }
        if let start = text.firstIndex(of: "["), let end = text.lastIndex(of: "]") {
            text = String(text[start...end])
        }
        guard let d = text.data(using: .utf8),
              let vals = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] else { return [] }
        var rows: [KLine] = []
        var prev: Double? = nil
        for v in vals {
            guard let close = Double(v["close"] as? String ?? ""),
                  let open = Double(v["open"] as? String ?? ""),
                  let high = Double(v["high"] as? String ?? ""),
                  let low = Double(v["low"] as? String ?? "") else { continue }
            let pct = prev.map { (close / $0 - 1) * 100 } ?? 0
            rows.append(KLine(date: v["day"] as? String ?? "", open: open, close: close, high: high, low: low,
                              volume: Double(v["volume"] as? String ?? "") ?? 0,
                              amount: Double(v["amount"] as? String ?? "") ?? 0,
                              pct: pct, turnover: 0))
            prev = close
        }
        return Array(rows.suffix(max(10, limit)))
    }

    func klines(_ code: String, period: String = "daily", limit: Int = 320, adjust: String = "qfq", secidOverride: String? = nil) async throws -> [KLine] {
        // Sina first: Eastmoney often hangs or rate-limits on mobile networks.
        let sina = await sinaKlines(code, period: period, limit: limit, secid: secidOverride)
        if !sina.isEmpty { return sina }
        return try await klinesEM(code, period: period, limit: limit, adjust: adjust, secidOverride: secidOverride)
    }

    func indexKlines(_ code: String, period: String = "daily", limit: Int = 2000) async throws -> [KLine] {
        let sec = Self.indexDefs.first { $0.code == code }?.secid ?? "1.\(code)"
        let sina = await sinaKlines(code, period: period, limit: limit, secid: sec)
        if !sina.isEmpty { return sina }
        return try await indexKlinesEM(code, period: period, limit: limit)
    }

    func klinesEM(_ code: String, period: String = "daily", limit: Int = 320, adjust: String = "qfq", secidOverride: String? = nil) async throws -> [KLine] {
        let klt = ["daily": 101, "weekly": 102, "monthly": 103, "5m": 5, "30m": 30][period] ?? 101
        let fqt = ["": 0, "qfq": 1, "hfq": 2][adjust] ?? 1
        let url = "\(hisURL)?secid=\(secidOverride ?? Self.secid(code))&ut=fa5fd1943c7b386f172d6893dbfba10b&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=\(klt)&fqt=\(fqt)&beg=19900101&end=20500101&lmt=\(max(10, limit))"
        let obj = try await net.getJSON(JObj.self, url: url, ttl: period == "daily" ? 600 : 60, key: "k-\(secidOverride ?? code)-\(period)-\(adjust)-\(limit)")
        guard let data = obj["data"]?.dict, let lines = data["klines"]?.array else { return [] }
        var rows: [KLine] = []
        for it in lines {
            guard let s = it.string else { continue }
            let p = s.split(separator: ",").map(String.init)
            guard p.count >= 11,
                  let o = Double(p[1]), let c = Double(p[2]), let h = Double(p[3]), let l = Double(p[4]) else { continue }
            rows.append(KLine(
                date: p[0], open: o, close: c, high: h, low: l,
                volume: Double(p[5]) ?? 0, amount: Double(p[6]) ?? 0,
                pct: Double(p[8]) ?? 0, turnover: Double(p[10]) ?? 0
            ))
        }
        rows = Array(rows.suffix(max(10, limit)))
        if rows.contains(where: { $0.close < 0 }) {
            return try await klines(code, period: period, limit: limit, adjust: "")
        }
        return rows
    }

    /// Index klines need an explicit secid because 000001 is also 平安银行.
    func indexKlinesEM(_ code: String, period: String = "daily", limit: Int = 2000) async throws -> [KLine] {
        let klt = ["daily": 101, "weekly": 102, "monthly": 103, "5m": 5, "30m": 30][period] ?? 101
        let sec = Self.indexDefs.first { $0.code == code }?.secid ?? (code.hasPrefix("399") || code.hasPrefix("899") ? "0.\(code)" : "1.\(code)")
        let url = "\(hisURL)?secid=\(sec)&ut=fa5fd1943c7b386f172d6893dbfba10b&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=\(klt)&fqt=0&beg=19900101&end=20500101&lmt=\(max(10, limit))"
        let obj = try await net.getJSON(JObj.self, url: url, ttl: 600, key: "ki-\(code)-\(period)")
        guard let data = obj["data"]?.dict, let lines = data["klines"]?.array else { return [] }
        var rows: [KLine] = []
        for it in lines {
            guard let s = it.string else { continue }
            let p = s.split(separator: ",").map(String.init)
            guard p.count >= 11,
                  let o = Double(p[1]), let c = Double(p[2]), let h = Double(p[3]), let l = Double(p[4]) else { continue }
            rows.append(KLine(date: p[0], open: o, close: c, high: h, low: l,
                              volume: Double(p[5]) ?? 0, amount: Double(p[6]) ?? 0,
                              pct: Double(p[8]) ?? 0, turnover: Double(p[10]) ?? 0))
        }
        return Array(rows.suffix(max(10, limit)))
    }

    func boardKlines(_ code: String, period: String = "daily", limit: Int = 160) async throws -> [KLine] {
        let klt = ["daily": 101, "weekly": 102, "monthly": 103, "5m": 5, "30m": 30][period] ?? 101
        let url = "\(hisURL)?secid=90.\(code)&ut=fa5fd1943c7b386f172d6893dbfba10b&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=\(klt)&fqt=0&beg=19900101&end=20500101&lmt=\(limit)"
        let obj = try await net.getJSON(JObj.self, url: url, ttl: period == "daily" ? 300 : 60, key: "bk-\(code)-\(period)")
        guard let data = obj["data"]?.dict, let lines = data["klines"]?.array else { return [] }
        var rows: [KLine] = []
        for it in lines {
            guard let s = it.string else { continue }
            let p = s.split(separator: ",").map(String.init)
            guard p.count >= 11, let o = Double(p[1]), let c = Double(p[2]), let h = Double(p[3]), let l = Double(p[4]) else { continue }
            rows.append(KLine(date: p[0], open: o, close: c, high: h, low: l,
                              volume: Double(p[5]) ?? 0, amount: Double(p[6]) ?? 0,
                              pct: Double(p[8]) ?? 0, turnover: Double(p[10]) ?? 0))
        }
        return Array(rows.suffix(max(10, limit)))
    }

    func boardTrends(limit: Int = 6) async -> [Board] {
        guard let all = try? await boards(kind: "industry") else { return [] }
        let top = all.sorted { ($0.inflow ?? -1e18) > ($1.inflow ?? -1e18) }.prefix(limit)
        var out: [Board] = []
        for b in top {
            guard let rows = try? await boardKlines(b.code), rows.count > 25 else { continue }
            let c = rows.map(\.close)
            let p5 = c.count > 5 ? (c.last! / c[c.count - 6] - 1) * 100 : nil
            let p20 = c.count > 20 ? (c.last! / c[c.count - 21] - 1) * 100 : nil
            let p60 = c.count > 60 ? (c.last! / c[c.count - 61] - 1) * 100 : nil
            let ma20 = c.count >= 20 ? c.suffix(20).reduce(0, +) / 20 : nil
            let ma60 = c.count >= 60 ? c.suffix(60).reduce(0, +) / 60 : nil
            var trend = "震荡"
            if let m20 = ma20, let m60 = ma60 {
                if c.last! > m20 && m20 > m60 { trend = "多头" }
                else if c.last! < m20 && m20 < m60 { trend = "空头" }
            }
            var nb = b
            nb.pct5 = p5; nb.pct20 = p20; nb.pct60 = p60; nb.trend = trend
            out.append(nb)
        }
        return out
    }

    func marketNews(limit: Int = 12) async -> [NewsItem] {
        let url = "https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_50_1_.html"
        guard let text = try? await net.getText(url, ttl: 120, key: "market-news"),
              let eq = text.firstIndex(of: "=") else { return [] }
        let json = String(text[text.index(after: eq)...]).trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: ";"))
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = obj["LivesList"] as? [[String: Any]] else { return [] }
        return list.prefix(limit).map { x in
            NewsItem(title: x["title"] as? String ?? "", time: x["showtime"] as? String ?? "",
                     summary: x["digest"] as? String, url: (x["url_w"] as? String) ?? (x["url_unique"] as? String))
        }
    }

    // MARK: - indices

    static let indexDefs: [(code: String, secid: String, name: String, short: String)] = [
        ("000001", "1.000001", "上证指数", "上证"),
        ("399001", "0.399001", "深证成指", "深证"),
        ("399006", "0.399006", "创业板指", "创业板"),
        ("000300", "1.000300", "沪深300", "沪深300"),
        ("000688", "1.000688", "科创50", "科创50"),
    ]

    private func sinaIndexQuote(_ def: (code: String, secid: String, name: String, short: String)) async -> IndexQuote {
        let symbol = sinaSymbol(def.code, def.secid)
        guard let data = try? await net.get("https://hq.sinajs.cn/list=\(symbol)", ttl: 8, key: "sina-iq-\(symbol)"),
              let text = String(data: data, encoding: .isoLatin1),
              let payload = text.split(separator: "=\"").dropFirst().first?.split(separator: "\"").first else {
            return IndexQuote(code: def.code, name: def.name, short: def.short)
        }
        let p = payload.split(separator: ",").map(String.init)
        guard p.count > 9, let price = Double(p[3]), let prev = Double(p[2]), prev > 0 else {
            return IndexQuote(code: def.code, name: def.name, short: def.short)
        }
        return IndexQuote(code: def.code, name: def.name, short: def.short, price: price,
                          chg: price - prev, pct: (price / prev - 1) * 100, amount: Double(p[9]))
    }

    func indexQuote(_ def: (code: String, secid: String, name: String, short: String)) async -> IndexQuote {
        let url = "\(quoteURL)?secid=\(def.secid)&fltt=2&invt=2&fields=f43,f44,f45,f46,f57,f58,f60,f169,f170,f48"
        guard let obj = try? await net.getJSON(JObj.self, url: url, ttl: 30, key: "idx-\(def.code)"),
              let d = obj["data"]?.dict else {
            return await sinaIndexQuote(def)
        }
        return IndexQuote(
            code: def.code,
            name: d["f58"]?.string ?? def.name,
            short: def.short,
            price: d["f43"]?.double,
            chg: d["f169"]?.double,
            pct: d["f170"]?.double,
            amount: d["f48"]?.double
        )
    }

    func indices() async -> [IndexQuote] {
        await withTaskGroup(of: (Int, IndexQuote).self) { group in
            for (i, def) in Self.indexDefs.enumerated() {
                group.addTask { (i, await self.indexQuote(def)) }
            }
            var tmp: [(Int, IndexQuote)] = []
            for await item in group { tmp.append(item) }
            return tmp.sorted { $0.0 < $1.0 }.map(\.1)
        }
    }

    func breadth() async -> Breadth {
        guard let spot = try? await spot(ttl: 600) else { return Breadth() }
        var b = Breadth()
        for r in spot.rows {
            guard let p = r.pct else { continue }
            b.total += 1
            if p > 0.01 { b.up += 1 } else if p < -0.01 { b.down += 1 } else { b.flat += 1 }
            if p >= 9.8 { b.limitUp += 1 }
            if p <= -9.8 { b.limitDown += 1 }
        }
        return b
    }

    // MARK: - search / ranking

    func search(_ keyword: String, limit: Int = 20) async -> [Quote] {
        let kw = keyword.trimmingCharacters(in: .whitespaces).uppercased()
        guard !kw.isEmpty else { return [] }
        guard let spot = try? await spot() else { return [] }
        var starts: [Quote] = []
        var contains: [Quote] = []
        for r in spot.rows {
            let code = r.code
            let name = r.name.uppercased()
            if code == kw || code.hasPrefix(kw) || name.hasPrefix(kw) { starts.append(r) }
            else if code.contains(kw) || name.contains(kw) { contains.append(r) }
            if starts.count + contains.count > 80 { break }
        }
        return Array((starts + contains).prefix(limit))
    }

    func ranking(by: String = "pct", limit: Int = 20) async -> [Quote] {
        guard let spot = try? await spot() else { return [] }
        let key: (Quote) -> Double = { q in
            switch by {
            case "turnover": return q.turnover ?? 0
            case "amount": return q.amount ?? 0
            case "inflow": return q.mainInflow ?? 0
            default: return q.pct ?? -999
            }
        }
        return Array(spot.rows.filter { $0.price != nil }.sorted { key($0) > key($1) }.prefix(limit))
    }

    // MARK: - boards / market state

    func boards(kind: String = "industry") async throws -> [Board] {
        let fs = kind == "industry" ? "m:90+t:2" : "m:90+t:3"
        let fields = "f12,f14,f3,f62,f104,f105,f128,f140,f136"
        let url = "\(listURL)?pn=1&pz=120&po=1&np=1&fltt=2&invt=2&fid=f3&fs=\(fs)&fields=\(fields)"
        let obj = try await net.getJSON(JObj.self, url: url, ttl: 60, key: "boards-\(kind)")
        let diff = obj["data"]?.dict?["diff"]?.array ?? []
        return diff.compactMap { item in
            guard let d = item.dict else { return nil }
            return Board(
                code: d["f12"]?.string ?? "", name: d["f14"]?.string ?? "",
                pct: d["f3"]?.double, inflow: d["f62"]?.double,
                up: d["f104"]?.double.map { Int($0) }, down: d["f105"]?.double.map { Int($0) },
                leader: d["f128"]?.string, leaderCode: d["f140"]?.string,
                leaderPct: d["f136"]?.double, kind: kind
            )
        }
    }

    func boardStocks(_ code: String) async throws -> [Quote] {
        let fields = "f12,f14,f2,f3,f20,f100"
        let url = "\(listURL)?pn=1&pz=40&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:\(code)&fields=\(fields)"
        let obj = try await net.getJSON(JObj.self, url: url, ttl: 60, key: "board-\(code)")
        let diff = obj["data"]?.dict?["diff"]?.array ?? []
        return diff.compactMap { item in
            guard let d = item.dict, let c = d["f12"]?.string else { return nil }
            return Quote(code: c, name: d["f14"]?.string ?? "", price: d["f2"]?.double,
                         pct: d["f3"]?.double, mcap: d["f20"]?.double,
                         market: Self.marketOf(c), industry: d["f100"]?.string)
        }
    }

    func provinceLeaders() async -> [ProvincePreference] {
        let dist = await companyDistribution()
        let base = listURL
        var out: [(Int, ProvincePreference)] = []
        await withTaskGroup(of: (Int, ProvincePreference?).self) { group in
            for (idx, p) in dist.provinces.enumerated() {
                group.addTask {
                    let url = "\(base)?pn=1&pz=10&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:\(p.code)&fields=f12,f14,f2,f3,f62,f100"
                    guard let obj = try? await Networking.shared.getJSON(JObj.self, url: url, ttl: 600, key: "prov-\(p.code)"),
                          let rows = obj["data"]?.dict?["diff"]?.array else { return (idx, nil) }
                    var leaders: [ProvinceLeader] = []
                    var counts: [String: Int] = [:]
                    for r in rows {
                        guard let d = r.dict else { continue }
                        let ind = d["f100"]?.string ?? ""
                        if !ind.isEmpty { counts[ind, default: 0] += 1 }
                        if leaders.count < 3 {
                            leaders.append(ProvinceLeader(code: d["f12"]?.string ?? "", name: d["f14"]?.string ?? "", price: d["f2"]?.double, pct: d["f3"]?.double, inflow: d["f62"]?.double, industry: ind))
                        }
                    }
                    let industries = counts.sorted { $0.value > $1.value }.prefix(3).map(\.key)
                    return (idx, ProvincePreference(name: p.name, short: p.short, code: p.code, count: p.count, industries: industries, leaders: leaders))
                }
            }
            for await (idx, p) in group { if let p { out.append((idx, p)) } }
        }
        return out.sorted { $0.0 < $1.0 }.map(\.1)
    }

    func companyDistribution() async -> CompanyDistribution {
        let aliases: [String: String] = [
            "北京": "北京市", "天津": "天津市", "上海": "上海市", "重庆": "重庆市",
            "河北": "河北省", "山西": "山西省", "辽宁": "辽宁省", "吉林": "吉林省",
            "黑龙江": "黑龙江省", "江苏": "江苏省", "浙江": "浙江省", "安徽": "安徽省",
            "福建": "福建省", "江西": "江西省", "山东": "山东省", "河南": "河南省",
            "湖北": "湖北省", "湖南": "湖南省", "广东": "广东省", "海南": "海南省",
            "四川": "四川省", "贵州": "贵州省", "云南": "云南省", "陕西": "陕西省",
            "甘肃": "甘肃省", "青海": "青海省", "台湾": "台湾省",
            "内蒙古": "内蒙古自治区", "广西": "广西壮族自治区", "西藏": "西藏自治区",
            "宁夏": "宁夏回族自治区", "新疆": "新疆维吾尔自治区",
        ]
        let fs = "m:90+t:1".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "m:90+t:1"
        let url = "\(listURL)?pn=1&pz=60&po=1&np=1&fltt=2&invt=2&fid=f3&fs=\(fs)&fields=f12,f14,f3,f62,f104,f105,f106"
        guard let obj = try? await net.getJSON(JObj.self, url: url, ttl: 600, key: "company-map-v1"),
              let rows = obj["data"]?.dict?["diff"]?.array else { return CompanyDistribution() }
        var items: [ProvinceDistribution] = []
        for item in rows {
            guard let d = item.dict else { continue }
            let raw = (d["f14"]?.string ?? "").replacingOccurrences(of: "板块", with: "")
            let up = Int(d["f104"]?.double ?? 0), down = Int(d["f105"]?.double ?? 0), flat = Int(d["f106"]?.double ?? 0)
            let total = up + down + flat
            guard total > 0 else { continue }
            items.append(ProvinceDistribution(
                name: aliases[raw] ?? raw, short: raw, code: d["f12"]?.string ?? raw,
                count: total, up: up, down: down, flat: flat,
                pct: d["f3"]?.double, inflow: d["f62"]?.double
            ))
        }
        items.sort { $0.count > $1.count }
        return CompanyDistribution(total: items.reduce(0) { $0 + $1.count }, provinces: items)
    }

    func indexAnalysis() async -> [IndexAnalysisRow] {
        let defs: [(String, String, String, String, String, String, String)] = [
            ("000001", "上证指数", "1.000001", "A股", "综合", "沪市全市场加权指数，权重股与金融、能源占比高。", "关注权重股与成交额；政策与流动性变化会放大波动。"),
            ("399001", "深证成指", "0.399001", "A股", "综合", "深市核心指数，制造业与科技成长权重更高。", "弹性大于上证，需结合创业板与中小盘风格判断。"),
            ("399006", "创业板指", "0.399006", "A股", "成长", "创业板龙头指数，新能源、医药、半导体权重高。", "波动大，趋势反转时常伴随估值快速压缩。"),
            ("000688", "科创50", "1.000688", "A股", "硬科技", "科创板市值与流动性代表，半导体权重高。", "高弹性、高估值敏感，注意流动性与解禁压力。"),
            ("000300", "沪深300", "1.000300", "A股", "大盘", "沪深两市大盘蓝筹基准，机构与北向资金常用基准。", "风格切换时相对强弱更明显，适合观察机构态度。"),
            ("000016", "上证50", "1.000016", "A股", "大盘价值", "沪市龙头蓝筹，金融、消费、能源权重集中。", "防御属性较强，但成长行情中可能跑输。"),
            ("000905", "中证500", "1.000905", "A股", "中盘", "剔除沪深300后的中盘代表，制造与周期较多。", "关注中盘风格与盈利修复，流动性弱于大盘。"),
            ("000852", "中证1000", "1.000852", "A股", "小盘", "小市值代表，题材与量化资金敏感。", "波动与换手高，注意微盘流动性和风格拥挤。"),
            ("899050", "北证50", "0.899050", "A股", "北交所", "北交所核心指数，专精特新与小微盘占比高。", "流动性较主板弱，单日波动与情绪影响更大。"),
            ("000510", "中证A500", "1.000510", "A股", "宽基", "覆盖各行业龙头的均衡宽基，行业分布更分散。", "适合观察全市场龙头整体表现与风格均衡度。"),
            ("399303", "国证2000", "0.399303", "A股", "小微盘", "小微盘综合指数，题材与活跃资金相关。", "高波动、高换手，需警惕流动性与退潮风险。"),
            ("000015", "红利指数", "1.000015", "A股", "红利", "高股息、低估值风格代表，防御属性突出。", "利率上行或成长风格占优时可能阶段性跑输。"),
            ("SPX", "标普500", "100.SPX", "美股", "美股宽基", "美国大盘基准，科技与消费权重高。", "隔夜美股受汇率与时差影响；关注利率与盈利预期。"),
            ("NDX", "纳斯达克", "100.NDX", "美股", "科技成长", "美国科技成长代表，对利率敏感。", "波动通常大于标普500，注意隔夜跳空。"),
            ("DJIA", "道琼斯", "100.DJIA", "美股", "价值蓝筹", "美国传统蓝筹与工业权重指数。", "趋势较稳但弹性有限，适合观察风险偏好。"),
        ]
        var out: [IndexAnalysisRow] = []
        for (code, name, sec, region, style, desc, note) in defs {
            let rows = (try? await klines(code, limit: 280, adjust: "", secidOverride: sec)) ?? []
            let closes = rows.map(\.close)
            guard !closes.isEmpty else {
                out.append(IndexAnalysisRow(code: code, name: name, region: region, style: style, desc: desc, price: nil, pct: nil, trend: "无数据", note: note)); continue
            }
            func ma(_ n: Int) -> Double? { closes.count >= n ? closes.suffix(n).reduce(0, +) / Double(n) : nil }
            func ret(_ n: Int) -> Double? { closes.count > n ? (closes.last! / closes[closes.count - 1 - n] - 1) * 100 : nil }
            let m5 = ma(5), m10 = ma(10), m20 = ma(20), m60 = ma(60), m120 = ma(120)
            let price = closes.last!
            var trend = "震荡"
            if let m20, let m60 {
                if price > m20 && m20 > m60 { trend = "多头" }
                else if price < m20 && m20 < m60 { trend = "空头" }
                else if price > m20 { trend = "偏强" }
                else if price < m20 { trend = "偏弱" }
            }
            var gains = 0.0, losses = 0.0
            for j in max(1, closes.count - 14)..<closes.count {
                let ch = closes[j] - closes[j - 1]
                if ch > 0 { gains += ch } else { losses -= ch }
            }
            let rsi = losses == 0 ? 100.0 : 100 - 100 / (1 + gains / losses)
            let e12 = ema(closes, 12), e26 = ema(closes, 26)
            let dif = e12.last! - e26.last!
            let dea = ema(zip(e12, e26).map { $0 - $1 }, 9).last!
            let hist = (dif - dea) * 2
            let rets = (max(1, closes.count - 20)..<closes.count).map { (closes[$0] / closes[$0 - 1] - 1) * 100 }
            let avgR = rets.reduce(0, +) / Double(max(rets.count, 1))
            let vol20 = sqrt(rets.reduce(0) { $0 + pow($1 - avgR, 2) } / Double(max(rets.count, 1)))
            let pct20 = ret(20) ?? 0
            let pct5 = ret(5) ?? 0
            var score = 50.0
            score += (m20 != nil && price > m20!) ? 10 : -10
            score += (m20 != nil && m60 != nil && m20! > m60!) ? 10 : -10
            score += max(-10, min(10, pct20 / 2))
            score += max(-8, min(8, (rsi - 50) * 0.32))
            score += max(-6, min(6, pct5))
            score = max(0, min(100, score))
            let bias: String
            let action: String
            if score >= 65 { bias = "偏多"; action = "趋势偏多，可维持中性偏积极仓位；跌破 MA20 时减仓。" }
            else if score <= 40 { bias = "偏空"; action = "结构偏弱，优先降低仓位，等待重新站上 MA20。" }
            else { bias = "中性"; action = "震荡格局，控制仓位，等待放量突破压力或回踩支撑。" }
            out.append(IndexAnalysisRow(
                code: code, name: name, region: region, style: style, desc: desc,
                price: price, pct: rows.last?.pct, pct1: ret(1), pct5: ret(5), pct7: ret(7), pct20: ret(20), pct60: ret(60), pct120: ret(120),
                ma5: m5, ma10: m10, ma20: m20, ma60: m60, ma120: m120, trend: trend,
                support: rows.suffix(20).map(\.low).min(), resistance: rows.suffix(20).map(\.high).max(),
                high52: closes.suffix(250).max(), low52: closes.suffix(250).min(),
                rsi: rsi, dif: dif, dea: dea, macdHist: hist, vol20: vol20, bias20: m20 != nil ? (price / m20! - 1) * 100 : 0,
                score: Int(score.rounded()), bias: bias, action: action,
                conclusion: "\(trend)结构 · \(bias)（\(Int(score.rounded()))分）。\(action)",
                note: note, date: rows.last?.date ?? ""
            ))
        }
        return out
    }

    private func ema(_ values: [Double], _ n: Int) -> [Double] {
        guard !values.isEmpty else { return [] }
        let k = 2.0 / Double(n + 1)
        var out: [Double] = []
        var prev = values[0]
        for v in values { prev = v * k + prev * (1 - k); out.append(prev) }
        return out
    }

    func marketState() async -> MarketState {
        var st = MarketState()
        let idx = await indices()
        let br = await breadth()
        let spot = try? await spot(ttl: 300)
        st.breadth = br
        st.turnover = (spot?.rows ?? []).reduce(0) { $0 + ($1.amount ?? 0) }

        var trends: [IndexTrend] = []
        for (i, def) in Self.indexDefs.enumerated() {
            let rows = (try? await indexKlines(def.code, limit: 160)) ?? []
            let closes = rows.map(\.close)
            let ma5 = closes.count >= 5 ? closes.suffix(5).reduce(0, +) / 5 : nil
            let ma10 = closes.count >= 10 ? closes.suffix(10).reduce(0, +) / 10 : nil
            let ma20 = closes.count >= 20 ? closes.suffix(20).reduce(0, +) / 20 : nil
            let ma60 = closes.count >= 60 ? closes.suffix(60).reduce(0, +) / 60 : nil
            var dif: Double? = nil
            var dea: Double? = nil
            if closes.count > 35 {
                let e12 = PatternEngine.ema(closes, 12)
                let e26 = PatternEngine.ema(closes, 26)
                let d = zip(e12, e26).map { $0 - $1 }
                let s = PatternEngine.ema(d, 9)
                dif = d.last; dea = s.last
            }
            let lows20 = rows.suffix(20).map(\.low)
            let highs20 = rows.suffix(20).map(\.high)
            let price = idx[safe: i]?.price ?? closes.last
            var trend = "震荡"
            if let p = price, let m20 = ma20, let m60 = ma60 {
                if p > m20 && m20 > m60 { trend = "多头" }
                else if p < m20 && m20 < m60 { trend = "空头" }
            }
            var rsi: Double? = nil
            if closes.count > 14 {
                var g = 0.0, l = 0.0
                for j in (closes.count - 14)..<closes.count {
                    let ch = closes[j] - closes[j - 1]
                    if ch > 0 { g += ch } else { l -= ch }
                }
                rsi = l == 0 ? 100 : 100 - 100 / (1 + g / l)
            }
            let pct5 = closes.count > 5 ? (closes.last! / closes[closes.count - 6] - 1) * 100 : nil
            let pct7 = closes.count > 7 ? (closes.last! / closes[closes.count - 8] - 1) * 100 : nil
            let pct20 = closes.count > 20 ? (closes.last! / closes[closes.count - 21] - 1) * 100 : nil
            let pct30 = closes.count > 30 ? (closes.last! / closes[closes.count - 31] - 1) * 100 : nil
            let pct60 = closes.count > 60 ? (closes.last! / closes[closes.count - 61] - 1) * 100 : nil
            let tds = PatternEngine.td(closes)
            var dull = false
            if closes.count >= 60, let rn = rsi {
                let low60 = rows.suffix(60).map(\.low).min() ?? 0
                let rs = PatternEngine.rsi(closes)
                let lowDays = rs.suffix(5).filter { $0 < 35 }.count
                dull = (closes.last ?? 0) <= low60 * 1.04 && lowDays >= 3 && rs.last! > rs[rs.count - 2]
                _ = rn
            }
            trends.append(IndexTrend(
                code: def.code, name: def.name, short: def.short, price: price, pct: idx[safe: i]?.pct,
                ma5: ma5, ma10: ma10, ma20: ma20, ma60: ma60,
                macdDif: dif, macdDea: dea,
                support: lows20.min(), resistance: highs20.max(),
                rsi: rsi, pct5: pct5, pct20: pct20,
                trend: trend, above20: (price ?? 0) > (ma20 ?? .infinity),
                pct7: pct7, pct30: pct30, pct60: pct60,
                tdBuy: tds.buy.last ?? 0, tdSell: tds.sell.last ?? 0, bottomDull: dull
            ))
        }
        st.indices = trends

        let up = br.up, down = br.down
        let ratio = Double(up) / Double(max(up + down, 1))
        let pcts = trends.compactMap(\.pct)
        let avg = pcts.isEmpty ? 0 : pcts.reduce(0, +) / Double(pcts.count)
        let above = trends.filter(\.above20).count
        let total = max(br.total, 1)
        let limitRatio = Double(br.limitUp - br.limitDown) / Double(total)
        var score = 50 + (ratio - 0.5) * 70 + avg * 6 + Double(above - 2) * 3 + limitRatio * 150
        score = max(0, min(100, score))
        st.score = Int(score.rounded())
        if st.score >= 70 { st.label = "强势"; st.tone = "up" }
        else if st.score >= 58 { st.label = "偏强"; st.tone = "up" }
        else if st.score >= 45 { st.label = "震荡"; st.tone = "flat" }
        else if st.score >= 32 { st.label = "偏弱"; st.tone = "down" }
        else { st.label = "弱势"; st.tone = "down" }
        st.reasons = [
            "上涨 \(up) 家 / 下跌 \(down) 家，赚钱效应\(ratio > 0.55 ? "较好" : (ratio > 0.45 ? "一般" : "偏弱"))",
            "主要指数平均 \(String(format: "%+.2f", avg))%，\(above)/5 站上 20 日线",
            "涨停 \(br.limitUp) 家 / 跌停 \(br.limitDown) 家",
            "全市场成交额约 \(Int(st.turnover / 1e8)) 亿元",
        ]
        if let inds = try? await boards(kind: "industry") {
            st.top = inds.sorted { ($0.pct ?? -99) > ($1.pct ?? -99) }.prefix(5).map { $0 }
            st.bottom = inds.sorted { ($0.pct ?? 99) < ($1.pct ?? 99) }.prefix(3).map { $0 }
            st.industriesIn = inds.sorted { ($0.inflow ?? -1e18) > ($1.inflow ?? -1e18) }.prefix(6).map { $0 }
        }
        if let rows = spot?.rows {
            let valid = rows.filter { ($0.price ?? 0) > 0 && ($0.amount ?? 0) > 0 }
            st.gainers = valid.sorted { ($0.pct ?? -999) > ($1.pct ?? -999) }.prefix(10).map { $0 }
            st.losers = valid.sorted { ($0.pct ?? 999) < ($1.pct ?? 999) }.prefix(10).map { $0 }
            st.inflow = valid.sorted { ($0.mainInflow ?? -1e18) > ($1.mainInflow ?? -1e18) }.prefix(8).map { $0 }
            st.outflow = valid.sorted { ($0.mainInflow ?? 1e18) < ($1.mainInflow ?? 1e18) }.prefix(6).map { $0 }
            st.speeders = valid.sorted { ($0.speed ?? -999) > ($1.speed ?? -999) }.prefix(10).map { $0 }
        }
        if let cons = try? await boards(kind: "concept") {
            let skip = ["昨日", "涨停", "跌停", "连板", "首板", "破净", "融资", "MSCI", "标准普尔"]
            st.concepts = cons.filter { b in !skip.contains { (b.name).contains($0) } }
                .sorted { ($0.pct ?? -99) > ($1.pct ?? -99) }.prefix(5).map { $0 }
        }
        st.industryTrends = await boardTrends()
        return st
    }

    // MARK: - fundamentals

    func financials(_ code: String, periods: Int = 8) async -> [Financial] {
        let cols = "SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_DATE_NAME,EPSJB,BPS,ROEJQ,TOTALOPERATEREVETZ,PARENTNETPROFITTZ,XSMLL,XSJLL,ZCFZL"
        let url = "https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=\(cols)&filter=(SECURITY_CODE%3D%22\(code)%22)&sortColumns=REPORT_DATE&sortTypes=-1&page=1&pageSize=\(periods)&source=HSF10&client=PC"
        guard let obj = try? await net.getJSON(JObj.self, url: url, ttl: 43200, key: "fin-\(code)"),
              let result = obj["result"]?.dict, let data = result["data"]?.array else { return [] }
        return data.compactMap { item in
            guard let d = item.dict else { return nil }
            return Financial(
                period: d["REPORT_DATE_NAME"]?.string ?? String((d["REPORT_DATE"]?.string ?? "").prefix(10)),
                eps: d["EPSJB"]?.double,
                bps: d["BPS"]?.double,
                roe: d["ROEJQ"]?.double,
                revenueYoy: d["TOTALOPERATEREVETZ"]?.double,
                profitYoy: d["PARENTNETPROFITTZ"]?.double,
                grossMargin: d["XSMLL"]?.double,
                netMargin: d["XSJLL"]?.double,
                debtRatio: d["ZCFZL"]?.double
            )
        }
    }

    func profile(_ code: String) async -> CompanyProfile? {
        let cols = "SECURITY_CODE,ORG_NAME,INDUSTRYCSRC1,REG_CAPITAL,EMP_NUM,FOUND_DATE,LISTING_DATE,ORG_PROFILE,BUSINESS_SCOPE,MAIN_BUSINESS,REG_ADDRESS,ORG_WEB,ORG_EMAIL,ORG_TEL,CHAIRMAN,SECRETARY,LEGAL_PERSON,REG_NUM"
        let url = "https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_BASIC_ORGINFO&columns=\(cols)&filter=(SECURITY_CODE%3D%22\(code)%22)&page=1&pageSize=1&source=HSF10&client=PC"
        guard let obj = try? await net.getJSON(JObj.self, url: url, ttl: 604800, key: "org-\(code)"),
              let result = obj["result"]?.dict, let data = result["data"]?.array, let first = data.first?.dict else { return nil }
        return CompanyProfile(
            orgName: first["ORG_NAME"]?.string,
            industry: first["INDUSTRYCSRC1"]?.string,
            regCapital: first["REG_CAPITAL"]?.double,
            employees: first["EMP_NUM"]?.double,
            foundDate: String((first["FOUND_DATE"]?.string ?? "").prefix(10)),
            listingDate: String((first["LISTING_DATE"]?.string ?? "").prefix(10)),
            profile: first["ORG_PROFILE"]?.string,
            businessScope: first["BUSINESS_SCOPE"]?.string,
            mainBusiness: first["MAIN_BUSINESS"]?.string,
            address: first["REG_ADDRESS"]?.string,
            website: first["ORG_WEB"]?.string,
            email: first["ORG_EMAIL"]?.string,
            tel: first["ORG_TEL"]?.string,
            chairman: first["CHAIRMAN"]?.string,
            secretary: first["SECRETARY"]?.string,
            legalPerson: first["LEGAL_PERSON"]?.string,
            regNum: first["REG_NUM"]?.string
        )
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
