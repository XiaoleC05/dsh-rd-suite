# 研发套件

一个研发模式 + 一个融合插件主体 + 一个 context7 MCP 行，装好整套研发能力。

## 包含

- **研发模式**（唯一模式）：任务分级 L0–L3、流水线 S1–S8、验收关卡与交付报告；侦察与验收是流程内的子代理角色（`subagent` 只读侦察、`review_agent` 独立验收，都复用同一个 rd 预设），不再单独占模式位。
- **融合插件主体**（1 行）：`code_list_files`、`code_standardize` 与侧栏代码标准化面板；`github_workflow` 工具与 Issue 优先提示词（开关在设置 → 通用）。
- **context7 MCP 行**：`resolve-library-id` 与 `query-docs` 等文档检索工具。

## 用法

安装后在 设置 → 模式 只会看到一张「研发模式」卡片，且带「模式说明 / 如何使用」。研发流程里需要侦察时让子代理只读调查，需要独立验收时调用 `review_agent`；GitHub 流程在 设置 → 通用 里开关。

## 维护

源码全部在本仓库：融合入口 `index.js`，成员在 `code-pipeline/`、`github/`，界面在 `client-sources/` 并生成 `client.js`（卡片源由 `scripts/vendor-cards.mjs` 生成），技能在 `skills/`。改完界面运行 `node scripts/build-client.mjs`；改完代码重启 DSH 或把 bundle 关再开。

## 已知限制

- 三个界面合并在同一个浏览器模块里，任一界面报错会影响整块界面加载。
- 预设行与 context7 行是 DSH 机制要求的独立行，不能并入融合主体。
- 只有一个模式：不能像以前那样把「研发·侦察」「研发·验收」当作独立模式选择；它们现在是子代理角色。
