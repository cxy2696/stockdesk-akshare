import Foundation

/// Small HTTP client with an on-disk JSON cache (TTL based).
actor Networking {
    static let shared = Networking()

    private let session: URLSession
    private let cacheDir: URL
    private var emBlockedUntil = Date.distantPast

    init() {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 8
        cfg.timeoutIntervalForResource = 20
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.httpAdditionalHeaders = [
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Referer": "https://quote.eastmoney.com/",
            "Accept": "application/json,text/plain,*/*",
        ]
        session = URLSession(configuration: cfg)
        cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("StockDeskHTTP", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    /// GET a URL and decode JSON. Cached for `ttl` seconds when provided.
    func get(_ urlString: String, ttl: TimeInterval? = nil, key: String? = nil) async throws -> Data {
        let cacheKey = key ?? Self.hash(urlString)
        let file = cacheDir.appendingPathComponent(cacheKey + ".json")
        if let ttl, let attrs = try? FileManager.default.attributesOfItem(atPath: file.path),
           let modified = attrs[.modificationDate] as? Date,
           Date().timeIntervalSince(modified) < ttl,
           let data = try? Data(contentsOf: file), !data.isEmpty {
            return data
        }
        guard let url = URL(string: urlString) else { throw APIError.badURL }
        let isEastmoney = url.host?.contains("eastmoney.com") == true
        // Serve the Sina fallbacks immediately after an Eastmoney outage
        // instead of waiting for a fresh socket timeout on every panel.
        if isEastmoney, Date() < emBlockedUntil { throw APIError.http(-2) }
        var req = URLRequest(url: url)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let data: Data
        let resp: URLResponse
        do {
            (data, resp) = try await session.data(for: req)
        } catch {
            if isEastmoney { emBlockedUntil = Date().addingTimeInterval(15) }
            throw error
        }
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            if isEastmoney { emBlockedUntil = Date().addingTimeInterval(15) }
            throw APIError.http((resp as? HTTPURLResponse)?.statusCode ?? -1)
        }
        if !data.isEmpty {
            try? data.write(to: file, options: .atomic)
        }
        return data
    }

    func getText(_ urlString: String, ttl: TimeInterval? = nil, key: String? = nil) async throws -> String {
        let data = try await get(urlString, ttl: ttl, key: key)
        return String(data: data, encoding: .utf8) ?? ""
    }

    func getJSON<T: Decodable>(_ type: T.Type, url: String, ttl: TimeInterval? = nil, key: String? = nil) async throws -> T {
        let data = try await get(url, ttl: ttl, key: key)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decode(String(describing: error))
        }
    }

    func clearCache() {
        try? FileManager.default.removeItem(at: cacheDir)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    nonisolated static func hash(_ s: String) -> String {
        var h: UInt64 = 1469598103934665603
        for b in s.utf8 {
            h ^= UInt64(b)
            h &*= 1099511628211
        }
        return String(h, radix: 16)
    }
}

enum APIError: LocalizedError {
    case badURL
    case http(Int)
    case decode(String)
    case noData

    var errorDescription: String? {
        switch self {
        case .badURL: return "无效的地址"
        case .http(let code): return "网络请求失败（\(code)）"
        case .decode: return "数据解析失败"
        case .noData: return "没有取到数据"
        }
    }
}

extension Data {
    /// Eastmoney returns JSONP-ish payloads occasionally; strip a wrapping callback.
    func cleanedJSON() -> Data {
        guard let s = String(data: self, encoding: .utf8) else { return self }
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("(") && t.hasSuffix(")") { return Data(t.dropFirst().dropLast().utf8) }
        if let r = t.range(of: "("), t.hasSuffix(")") {
            let inner = t[r.upperBound..<t.index(before: t.endIndex)]
            return Data(inner.utf8)
        }
        return self
    }
}
