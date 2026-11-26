# 研发工作台

一个入口装好整套研发能力：一个研发模式 + 代码修正 + context7 文档检索 + GitHub Issue 流程。

## 侧栏入口页

打开侧栏「研发工作台」可以看到：

- **和其他模式的区别**：标准 / PTC / 极简 / 创造 各自的定位，以及研发模式的关键差异（固定流水线与验收段落、技能按需加载、上下文压缩更早、L3 强制独立验收、内置 GitHub Issue 流程）。
- **它是怎么工作的**：任务分级 L0–L3；流水线 S1 规格卡 → S2 侦察 → S3 计划 → S4 实现 → S5 验证关卡 → S6 独立验收关卡 → S7 交付报告 → S8 沉淀。
- **两道关卡**：S5 每条 AC 要有真实运行证据；S6 由 review_agent 独立复核并输出 VERDICT。
- **已装能力与入口**：「代码修正」已完全迁移为页内标签；**写入/修改代码后自动审查与修正**（无需手动触发，`autoCodeFix` 可关）；context7 工具；GitHub 开关；rd-* 技能。
- **怎么开始**：新建会话选「研发模式」，写出目标与验收标准。

## 包含

- **研发模式**：唯一模式；侦察与验收是流程内的子代理角色（`subagent` / `review_agent` 复用同一个 rd 预设）。
- **融合插件主体**：`code_list_files`、`code_standardize`、代码标准化面板、`github_workflow` 与 Issue 优先提示词。
- **context7 MCP**：文档检索工具。

## 维护

源码全部在本仓库：融合入口 `index.js`，成员在 `code-pipeline/`、`github/`，界面在 `client-sources/`（入口页 `hub-rd.js`，卡片源由 `scripts/vendor-cards.mjs` 生成），技能在 `skills/`。改完界面运行 `node scripts/build-client.mjs`。

## 已知限制

- 界面合并在同一个浏览器模块里，任一界面报错会影响整块界面加载。
- 预设行与 context7 行是 DSH 机制要求的独立行。
- 只有一个模式；不能把侦察/验收当独立模式选择。
