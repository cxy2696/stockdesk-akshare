# Contributing · 参与贡献

[中文](#中文) · [English](#english)

## 中文

谢谢你愿意一起改进 StockDesk。这个项目更看重“能长期用下去”，所以请优先保证数据正确、界面不遮挡、出错时能看懂。

### 开发流程

1. Fork 仓库，新建一个分支。
2. 尽量保持 `/api/...` 接口兼容；如果必须改，请同时更新文档。
3. 提交前运行：
   ```bash
   python -m compileall desktop/backend us
   python -c "from backend import kdj; print(kdj.snapshot()['thresholds'])"
   cd desktop/frontend && npm run build
   ```
4. UI 改动请附上一张截图，说明改了什么、在哪个主题/缩放下看过。
5. 提交 Pull Request。

### 不要提交

- `data/`、SQLite 数据库和个人账户数据
- `.app`、`.exe`、`.ipa`
- 签名证书、Team ID、Token

### 提交信息

写清楚“改了什么”和“为什么”，例如：

```
fix: keep the HUB admin plate visible at 150% font scale
```

## English

Thanks for helping improve StockDesk. This project values software you can keep using, so correctness, readable layout and clear failure messages matter more than clever tricks.

### Workflow

1. Fork the repository and create a branch.
2. Keep `/api/...` contracts stable when possible; if you must change one, update the docs too.
3. Before committing, run:
   ```bash
   python -m compileall desktop/backend us
   python -c "from backend import kdj; print(kdj.snapshot()['thresholds'])"
   cd desktop/frontend && npm run build
   ```
4. For UI changes, include a screenshot and mention the theme/scale you checked.
5. Open a pull request.

### Please do not commit

- `data/`, SQLite databases or personal account data
- `.app`, `.exe`, `.ipa` artifacts
- Signing certificates, Team IDs or tokens

### Commit messages

Say what changed and why, for example:

```
fix: keep the HUB admin plate visible at 150% font scale
```
