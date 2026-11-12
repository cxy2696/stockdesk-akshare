StockDesk 1.10.2 · macOS 安装说明

推荐安装方式
1. 双击同目录的「Install-StockDesk.command」。
2. 如果 macOS 提示「无法打开，因为无法验证开发者」，右键该文件 → 打开。
3. 脚本会把 StockDesk.app 复制到 Applications，并清除下载隔离标记，然后自动启动。

手动安装
1. 把 StockDesk.app 拖进 Applications。
2. 打开「终端」，执行：
   xattr -dr com.apple.quarantine /Applications/StockDesk.app
3. 再打开 StockDesk。

为什么需要这一步
当前安装包使用本机 ad-hoc 签名，没有付费 Apple Developer ID，也没有做公证（notarization）。
macOS 会给浏览器下载的文件加上 com.apple.quarantine 标记，Gatekeeper 因此拒绝启动。
上面的脚本只清除这个下载标记，不修改 App 内容，也不会关闭系统的 Gatekeeper。

如果仍然打不开
- 打开「系统设置 → 隐私与安全性」，在「安全性」区域点「仍要打开」。
- 或在终端执行：
  xattr -dr com.apple.quarantine /Applications/StockDesk.app
  open /Applications/StockDesk.app
- 查看日志：
  ~/Library/Application Support/StockDesk/stockdesk.log

数据目录
~/Library/Application Support/StockDesk
更新 App 不会删除账户、交易和自选数据。

系统要求
macOS 12+，Apple Silicon（arm64）。Intel Mac 请从源码运行或使用 Docker。
