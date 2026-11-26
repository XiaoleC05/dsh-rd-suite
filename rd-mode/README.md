# dsh-rd-mode · 研发模式

DeepSeek Harness 的研发专用模式：任务分级流水线、验收关卡、按需加载的领域技能、独立验收子代理，以及基于会话日志的周度复盘进化。只含配置、技能与脚本，零依赖。

- 设计说明：[docs/DESIGN.md](docs/DESIGN.md)
- 安装、维护与排障（交给 DSH 中的 DeepSeek V4.1 执行）：[INIT.md](INIT.md)
- 变更记录与能力登记：[evolution/](evolution/)

## 快速开始
1. 在 DSH 中打开“创造模式”会话，工作目录选本目录，发送：`按 INIT.md 执行安装`。
2. 新建会话，模式选“研发模式”，工作目录选本目录，发送 `/rd-selftest`。
3. 每周发送 `/rd-retro`（或按 INIT.md 6.3 设置自动化任务）。

## 常用命令（在本目录运行）
| 目的 | 命令 |
|---|---|
| 完整校验（DSH 会话的 pwsh 中） | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/validate.ps1` |
| 静态校验（任意 node） | `node scripts/validate-bundle.mjs` |
| 最近 7 天 KPI（用 DSH 自带运行时） | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/node.ps1 scripts/rd-kpi.mjs --days 7` |
| 全部历史作为对照 | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/node.ps1 scripts/rd-kpi.mjs --days 0 --presets all` |
| KPI 脚本回归测试（node ≥ 22.15） | `node --test scripts/test/rd-kpi.test.mjs` |

## 可选：模式卡片增强
`ui/preset-cards/` 是一个独立的本地 bundle，让研发模式的三张卡片与内置模式一样显示「模式说明 / 如何使用」。安装：

```
plugin_manager install_bundle target=D:/05_Code/dsh-rd-suite/rd-mode/ui/preset-cards
```

DSH 升级后运行 `node scripts/vendor-preset-cards.mjs` 重新生成 `ui/preset-cards/client.js`。实现原理与授权归属见 [ui/preset-cards/docs/DETAIL.md](ui/preset-cards/docs/DETAIL.md)。
