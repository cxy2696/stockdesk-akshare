# FAQ · 常见问题

[中文](#中文) · [English](#english)

## 中文

### 这个仓库会影响我正在用的 StockDesk 吗？

不会。`stockdesk-akshare` 是独立的源码和文档副本，不覆盖本地数据库、端口或正在运行的进程。美股版也使用单独端口 8770。

### Windows 版为什么是独立窗口，不是浏览器标签？

Windows 10/11 上使用 pywebview + Edge WebView2，打开的是独立原生窗口。Windows 7/8 没有可用的 WebView2，程序会退回默认浏览器。

### macOS 打开后没看到窗口怎么办？

先看看 macOS 顶部菜单栏是否已经切换到 StockDesk；窗口会固定从主屏左上角打开。如果仍然异常，查看 `~/Library/Application Support/StockDesk/stockdesk.log`。

### 下载时可以选择保存位置吗？

可以。项目页下载区在 Chrome / Edge 里会调用浏览器的保存位置选择器；Safari、Firefox 和手机浏览器不支持时，会直接保存到默认下载目录。iOS 的 IPA 未签名，需要用自己的 Apple ID 重签。

### KDJ 预警为什么移到了右侧？

它是独立预警层，不属于量化模型页面。HUB 右侧「行业要闻」下方的白色 **KDJ预警** 按键会进入独立页面；阈值是 `J ≥ 118` 超买、`J ≤ -14` 超卖。

### 字体缩放会拉伸地图或图表吗？

不会。桌面端只调整文字字号，按钮和卡片会随文字自动增高，表格自动换行。地图、K 线和固定图形保持原来的几何比例。

### 为什么用最大连通簇？

上涨家数只能说明市场“有多热”，最大连通簇能说明上涨是否“连成片”。簇越大，扩散越真实；簇越小，越可能只是少数股票在动。0.592746 是二维方格点渗流的临界值，行业样本小的时候只适合做相对比较。

### 这个项目提供投资建议吗？

不提供。行情可能延迟、缺失或出错，任何交易决定和风险都由你自己承担。

## English

### Will this repository affect the StockDesk I am already using?

No. `stockdesk-akshare` is a separate source and documentation snapshot. It does not replace your local database, ports or running process. The US edition uses its own port, 8770.

### Why does the Windows app open a native window instead of a browser tab?

On Windows 10/11 it uses pywebview with Edge WebView2, so you get a standalone native window. Windows 7/8 has no usable WebView2, so the app falls back to your default browser.

### I opened the macOS app but cannot see a window.

Check the macOS menu bar first — StockDesk may already be active. The window opens at the top-left of the primary display. If something still looks wrong, check `~/Library/Application Support/StockDesk/stockdesk.log`.

### Can I choose where downloads are saved?

Yes. In Chrome/Edge, the site download cards open the browser's save-location picker. Safari, Firefox and mobile browsers fall back to the default Downloads folder. The iOS IPA is unsigned and needs re-signing with your own Apple ID.

### Why is KDJ on the right side?

It is an independent warning layer, not part of Quant Models. The white **KDJ** button under Industry News opens a dedicated page; thresholds are `J >= 118` overbought and `J <= -14` oversold.

### Does font scaling stretch maps or charts?

No. The desktop app changes text size only. Buttons and cards grow with the text, and tables wrap or add rows. Maps, candles and fixed graphics keep their geometry.

### Why use the largest connected cluster?

The number of rising stocks tells you how warm the market is; the largest cluster tells you whether the strength is connected. A bigger cluster means broader diffusion; a smaller one suggests only a few names are moving. The 0.592746 threshold is the 2-D square-site percolation value and is best treated as a relative guide for small industry samples.

### Does this project give investment advice?

No. Quotes can be delayed, missing or wrong. Every trading decision and its risk are yours.
