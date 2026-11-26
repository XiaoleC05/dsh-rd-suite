# 研发套件

一个插件主体 + 三个预设行 + 一个 MCP 行，装好整套研发能力。

## 包含

- **融合插件主体**（1 行）：`code_list_files`、`code_standardize` 与侧栏代码标准化面板；`github_workflow` 工具与 Issue 优先提示词（开关在设置 → 通用）；模式卡片增强（三张研发卡片的「模式说明 / 如何使用」）。
- **三个预设行**：研发模式（rd）、研发·侦察（rd-scout）、研发·验收（rd-review），含技能与宪章。
- **context7 MCP 行**：`resolve-library-id` 与 `query-docs` 等文档检索工具。

## 用法

安装后在 设置 → 模式 选择「研发模式」。代码工具与文档检索对所有模式可用；GitHub 流程在 设置 → 通用 里开关。想关掉某个功能，现在用设置项而不是单独停用插件行。

## 维护

源码全部在本仓库：融合入口 `index.js`，成员在 `code-pipeline/`、`github/`，界面在 `client-sources/` 并生成 `client.js`，技能在 `skills/`。改完界面运行 `node scripts/build-client.mjs`；改完代码重启 DSH 或把 bundle 关再开。

## 已知限制

- 三个界面合并在同一个浏览器模块里，任一界面报错会影响整块界面加载。
- 预设行与 context7 行是 DSH 机制要求的独立行，不能并入融合主体。
- 融合后不能再单独停用"代码工具"或"GitHub 流程"中的一部分（GitHub 有设置开关；代码工具随整组启用）。
