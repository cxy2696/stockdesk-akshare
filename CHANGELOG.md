# Changelog · 更新记录

[中文](#中文) · [English](#english)

## 中文

### 1.10.2

- KDJ 入口移到 HUB 右侧「行业要闻」下方，和其他右侧白色按键一致。
- 移除全局右侧悬浮按钮和抽屉，改为独立 `/kdj` 页面。
- 上轨 `J ≥ 118` 超买区 → 参考动作：减仓 / 卖出。
- 下轨 `J ≤ -14` 超卖区 → 参考动作：买入 / 低吸。
- 阈值判断改为包含等号；新增中证1000。
- macOS / Windows 重新构建，下载更新到 1.10.2。

### 1.10.1

- KDJ 极值预警移出「量化模型」，改为全局右侧固定白色按键，点击打开独立抽屉。
- 阈值调整为 `J ≥ 118` 超买、`J ≤ -14` 超卖。
- 新增中证1000；覆盖半导体、通信设备与 6 个 A 股指数。
- 面板增加参考操作建议，并注明“非交易指令”。
- macOS / Windows 重新构建；项目页下载区更新到 1.10.1。

### 1.10.0

- 新增 KDJ 极值预警：半导体、通信设备与 5 个 A 股指数。
- 5 分钟 / 30 分钟双周期，绘制近似中枢。
- 展示页字体与图片放大，支持桌面 / 平板 / 手机。
- 展示页增加下载包选择和保存位置选择器。
- 产品影片重制：浅色动态开场、章节、声音、全屏。

### 1.9.0 / iOS 3.6 / 美股 1.0.0

- HUB 收敛到 7 个入口：左侧 3 个、右侧 4 个，管理员名片并入左列。
- 三种主题共用同一套 HUB 首页；每日策略与右侧第二行对齐。
- 字体缩放 100% / 120% / 150%，只改文字，布局自动换行、增行。
- 桌面、设置、iOS 设置、美股顶栏支持中英切换。
- 子页面支持完整长图分享；桌面端调用原生分享。
- 量化模型补充 HMM、渗流最大连通簇、行业临界和个股仓位建议。
- 新增美股版和 A 股 / 美股两个 GHCR 容器。
- macOS 窗口固定从主屏左上角打开；Windows 单文件使用 WebView2。

## English

### 1.10.2

- Moved the KDJ entry into the HUB right column, directly under Industry News.
- Removed the global floating button and drawer; KDJ is now a dedicated `/kdj` page.
- `J >= 118` overbought → reference action: reduce / sell.
- `J <= -14` oversold → reference action: buy / accumulate.
- Threshold checks now include equality; CSI 1000 added.
- Rebuilt macOS / Windows; downloads updated to 1.10.2.

### 1.10.1

- Moved KDJ alerts out of Quant Models into a global white button on the right rail; it opens a dedicated drawer.
- Thresholds are now `J ≥ 118` overbought and `J ≤ -14` oversold.
- Added CSI 1000: semiconductors, communications equipment and six A-share indices.
- Added reference guidance, clearly marked as non-trading instructions.
- Rebuilt macOS / Windows; website downloads updated to 1.10.1.

### 1.10.0

- Added KDJ extreme-zone alerts for semiconductors, communications equipment and five A-share indices.
- 5m / 30m frames with an approximate central zone.
- Larger type and imagery on the project site, with desktop/tablet/mobile layouts.
- Added package selection and a save-location picker to the site.
- Rebuilt the product film with a light motion intro, chapters, sound and fullscreen.

### 1.9.0 / iOS 3.6 / US 1.0.0

- HUB reduced to seven entries: three left, four right, with the admin plate under the left column.
- All three themes share the same HUB home; Daily Plan aligns with the right column.
- Font scaling at 100% / 120% / 150% changes text only; cards wrap and grow.
- Chinese / English switch in the desktop top bar, Settings, iOS Settings and the US top bar.
- Detail pages share a full-page image; desktop uses the native share sheet.
- Quant models include HMM, percolation giant component, industry criticality and position guidance.
- New US edition plus A-share and US GHCR containers.
- macOS opens at the primary display's top-left; Windows uses a native WebView2 window.
