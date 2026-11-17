# 安装到 iPhone（本地运行）

StockDesk iOS 是**完全本地运行**的原生 App：行情直接请求东方财富公开接口，账户/交易/自选保存在手机沙盒，不需要 Mac 后端，也不需要登录。

## 你需要准备

- 一台 iPhone（iOS 17 或更高）
- 一个 Apple ID（免费即可）
- 一台 Mac（安装 Xcode）或一台 Windows/macOS 电脑（用 Sideloadly）

> iOS 不允许安装未签名 App。仓库里的 `dist/StockDesk-unsigned.ipa` 需要先用你的 Apple ID 重签，才能装到手机上。

## 方式一：Xcode 直接运行（推荐）

1. 打开 `StockDesk.xcodeproj`
2. 选中 `StockDesk` target → **Signing & Capabilities**
3. Team 选择你的 Apple ID；没有就 `Add Account`
4. 把 Bundle Identifier 改成唯一值，例如 `com.yourname.stockdesk`
5. 数据线连接 iPhone，信任电脑；iPhone 打开「设置 → 隐私与安全性 → 开发者模式」
6. Xcode 顶部选择你的 iPhone，按 `⌘R`
7. 首次运行后到 iPhone「设置 → 通用 → VPN 与设备管理」信任你的 Apple ID

免费 Apple ID 签名的 App 有效期为 **7 天**，到期用 Xcode 重新运行一次即可，数据不会丢。

## 方式二：Sideloadly / AltStore 侧载

1. 把 `dist/StockDesk-unsigned.ipa` 传到电脑
2. 打开 [Sideloadly](https://sideloadly.io)，连接 iPhone，拖入 IPA
3. 输入 Apple ID，点击 Start
4. 安装完成后在 iPhone「设置 → 通用 → VPN 与设备管理」信任证书

AltStore / SideStore 同理：用 IPA 作为来源，登录 Apple ID 重签。

## 方式三：先装模拟器看效果（无需签名）

```bash
xcrun simctl boot "iPhone 18 Pro"
xcrun simctl install booted dist/StockDesk-simulator.app
xcrun simctl launch booted com.stockdesk.app
```

## 用脚本装到已连接的真机

```bash
./install_to_iphone.sh <TEAM_ID>
```

Team ID 在 Xcode → Settings → Accounts → 选中 Apple ID → Team ID 查看。

## 数据说明

- 账户、交易、自选、提醒：App 沙盒 `stockdesk.json`，卸载即删除
- 行情缓存：沙盒 Caches，设置页可清空
- 无账号、无服务器、无上传

## 常见问题

**打开提示「未受信任的开发者」**  
设置 → 通用 → VPN 与设备管理 → 信任你的 Apple ID。

**提示「App 不可用」或闪退**  
确认 iOS ≥ 17；免费签名过期后重新签名安装。

**行情加载失败**  
东方财富公开接口需要网络；切换 Wi-Fi/蜂窝网络，或在设置页清空缓存后重试。
