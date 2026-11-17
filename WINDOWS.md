# StockDesk Windows 单文件版

下载：[StockDesk.exe](dist/StockDesk.exe)

- 单文件，无需安装 Python；首次启动会解压到临时目录，并打开独立原生窗口（Edge WebView2），不是浏览器标签页。
- 双击后在本机启动服务，并打开独立原生窗口。若系统缺少 WebView2，则回退到默认浏览器。
- 数据目录：`%LOCALAPPDATA%\StockDesk`。
- 浏览器要求：Chrome / Edge / Firefox；Windows 7/8 不要使用 IE。
- Windows 7 需要 64 位 SP1，并安装 KB2533623、KB2999226。

构建与验证：
- 构建环境：GitHub Actions `windows-2022`，Python 3.8.10，PyInstaller 5.13.2。
- 已在 Windows Server 2022 上通过启动及 `/api/health` 冒烟测试。
- Windows 10/11 已通过打包、WebView2 导入与后端启动冒烟测试。
- Windows 7/8 未取得实机测试；这两个系统没有可用的 Edge WebView2，程序会回退到浏览器界面，不是原生窗口。
- SHA-256：`6feefcae127557f0537a3839699be8b2e7df5251a63cbad03c860b9fef5497d2`
