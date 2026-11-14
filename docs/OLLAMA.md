# Ollama 本地辅助判断（macOS / Windows） · Local Ollama

[中文](#中文) · [English](#english)

## 中文

StockDesk 可以把当前市场、量化模型和账户汇总发给**本机 Ollama**，生成一段结构化的辅助判断：倾向、参考仓位、依据、风险和动作。它不预测点位，也不联网调用云端模型。

> **仅 macOS / Windows 支持，默认关闭。** iOS 不集成 Ollama；没有安装 Ollama 或没有选中模型时，StockDesk 不会启用这个功能，也不影响其他页面。

### 1. 安装与启动

**macOS / Linux**

```bash
brew install ollama        # 或从 https://ollama.com/download 下载
ollama serve               # 常驻服务，默认 http://127.0.0.1:11434
ollama pull deepseek-r1:8b # 推荐：8B，20–60 秒出结果
```

**Windows**

1. 从 <https://ollama.com/download> 下载 `OllamaSetup.exe` 安装；安装后托盘会出现 Ollama。
2. 打开 PowerShell，执行 `ollama pull deepseek-r1:8b`。
3. 默认服务地址 `http://127.0.0.1:11434`；StockDesk 设置里填同一地址即可。
4. 如果 11434 被占用或需要局域网访问，先 `setx OLLAMA_HOST 0.0.0.0:11434`，退出托盘里的 Ollama 再重开。

显存/内存充足可以用 `deepseek-r1:14b`，结果更稳但更慢。也可以用任意 Ollama 支持的聊天模型，只要在设置里填对模型名。

### 2. 在 StockDesk 中启用

1. 打开「设置 → Ollama 本地辅助」。
2. 打开开关。
3. 地址保持 `http://127.0.0.1:11434`（Ollama 与本机 StockDesk 在同一台机器时）。
4. 模型选择 `deepseek-r1:8b`，点「测试连接」，看到「已连接 / 模型可用」后保存。
5. 回到「每日策略」或「量化模型」，点「生成判断」。第一次约 20–60 秒，结果缓存 10 分钟。

Ollama 与 StockDesk 在同一台机器时不需要改监听地址。只有在同一局域网的另一台 Mac/Windows 上访问时，才需要：

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

并在防火墙放行 11434。不要把 Ollama 暴露到公网。

### 3. 发送了什么

只发送聚合数据：

- 指数涨跌、市场温度、涨跌家数、成交额、领涨/靠后行业；
- HMM 状态与置信度、渗流最大簇、九转计数、综合评分；
- 账户总资产、仓位、前 8 只持仓的名称/权重/浮动盈亏；
- 当日要闻标题（不含正文）。

不发送：交易备注、完整交易流水、自选股备注、本机文件路径。所有请求只到你自己配置的 Ollama 地址。

### 4. 输出与边界

返回一个 JSON，界面展示为：

- 倾向（进攻 / 均衡偏多 / 中性 / 均衡偏防守 / 防守）与参考仓位；
- 一段总结；
- 3–5 条依据、2–3 条风险、2–4 条动作、关注方向。

本地 8B 模型会出现判断粗糙、仓位与量化基线不一致、偶尔不按 JSON 返回的情况。界面会标出「缓存 / 模型 / 耗时」，解析失败时显示原文。它只是辅助，不构成投资建议。

### 5. 常见问题

| 现象 | 处理 |
| --- | --- |
| 连接不上 | `ollama serve` 是否在跑；地址端口是否为 11434 |
| 模型不存在 | `ollama pull deepseek-r1:8b`，或在设置里选 `ollama list` 中已有的模型 |
| 响应超时 | 换 8B 模型、把超时调到 180–240 秒，或减少最大输出 tokens |
| 返回不是 JSON | 重新生成；界面会显示原文，量化模型结论仍然可用 |
| 另一台机器连不上 | 用运行 Ollama 的机器局域网 IP；`OLLAMA_HOST=0.0.0.0:11434`；防火墙放行 |

## English

StockDesk can send the current market snapshot, quant-model summary and a compact portfolio summary to a **local Ollama** instance and turn the reply into a structured second opinion: stance, reference exposure, rationale, risks and actions. It never calls a cloud model.

> **macOS / Windows only, off by default.** iOS does not integrate Ollama; when Ollama or the selected model is missing, StockDesk leaves the feature disabled and the rest of the app works normally.

### Quick start

```bash
brew install ollama
ollama serve
ollama pull deepseek-r1:8b
```

Open Settings → Local Ollama, enable it, keep `http://127.0.0.1:11434`, choose `deepseek-r1:8b`, test the connection and save. To use Ollama from another machine on the LAN, start it with `OLLAMA_HOST=0.0.0.0:11434` and use that machine's LAN address.

Only aggregate data is sent: index moves, breadth, sector leaders, model states, account totals and the top eight positions by weight. Trade notes and full trade history are not sent.

The local 8B model can be rough and occasionally returns malformed JSON; the UI marks cache/model/latency and falls back to the raw text. It is an assistant, not investment advice.
