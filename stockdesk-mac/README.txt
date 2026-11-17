StockDesk for macOS 1.12.0
- 双击 StockDesk.app，打开独立原生窗口。
- 中央「资产中枢」点击直接进入持仓管理（持仓总览 / 资产分析 / 投资建议 / 交易流水）。
- 右侧入口：策略回测 / 地域 / 指数分析 / 量化模型 / KDJ预警；每日策略已合并行业要闻。
- 如果 macOS 提示「无法打开 / 已损坏」：右键 App -> 打开，或执行：
  xattr -dr com.apple.quarantine /Applications/StockDesk.app
- Ollama 辅助默认关闭；需要时在设置里填 http://127.0.0.1:11434 和 deepseek-r1:8b，测试连接后开启。
- 数据目录：~/Library/Application Support/StockDesk（与原版本共用，不需要迁移）
- 旧版备份：StockDesk-1.11.0.app（仓库内）、StockDesk-1.11.0-installed.app（原 /Applications 版本），更早的 1.10.3 也保留
- 启动失败日志：~/Library/Application Support/StockDesk/stockdesk.log
