# 研发工作台

一个入口装好整套研发能力：一个研发模式（含 PTC 程序化工具调用）+ 代码修正 + context7 文档检索 + GitHub Issue 流程。

## 侧栏入口页

打开侧栏「研发工作台」可以看到：

- **状态带**：PTC 执行、压缩阈值约 199k、两道关卡、8 个按需技能——一眼看清这个模式的关键事实。
- **三步开始**：新建会话选研发模式 → 写清目标与验收标准 → 照验收表核对结果。
- **流水线 S1–S8**：规格卡 → 侦察 → 计划 → 实现 → 验证 → 独立验收 → 交付报告 → 沉淀；S5、S6 标为「关卡」。
- **两道关卡**：S5 每条 AC 要有本会话真实运行过的证据；S6 由 `review_agent` 独立复核并先给 VERDICT。
- **已装能力**：PTC 执行、代码修正、context7、GitHub 流程、定时任务、领域技能。
- **GitHub 固定流程**：有 GitHub 远程仓库时，每个模块都要先建 Issue，再按 `strategy` 决定是否走分支与 Pull Request；提交用 Conventional Commits 并在正文写 `Closes #N`，合并用 squash 并删分支，发版走 SemVer。默认收起，点开才展开；它不是设置项，不能关。
- **和其他模式的区别**：研发模式已包含 PTC 模式的能力，并在其上加了分级、关卡、独立验收、领域技能与固定的 GitHub 流程。

「代码修正」不占页签、不需要手动点：写入/修改代码后自动按项目规范格式化，模块关闭时再对本次改动整体审计并把 `checked/fixed/remaining` 写进工具结果（面板保留作复查）。

## 包含

- **研发模式**：唯一模式；侦察与验收是流程内的子代理角色（`subagent` / `review_agent` 复用同一个 rd 预设）。
- **入口页**：状态带、三步开始、S1–S8 流水线、GitHub 固定流程 G0–G7、分级与关卡、已装能力、可折叠的模式差异。
- **融合插件主体**：`code_list_files`、`code_standardize`（无面板，全自动）、`github_workflow`（8 个动作）与固定流程提示词。
- **context7 MCP**：文档检索工具。

## 维护

源码全部在本仓库：融合入口 `index.js`，成员在 `code-pipeline/`、`github/`，界面在 `client-sources/`（入口页 `hub-rd.js`，卡片源由 `scripts/vendor-cards.mjs` 生成），技能在 `skills/`，测试在 `test/`。改完界面运行 `node scripts/build-client.mjs`；`npm test` 跑全部用例。

## 已知限制

- 界面合并在同一个浏览器模块里，任一界面报错会影响整块界面加载。
- 预设行与 context7 行是 DSH 机制要求的独立行。
- 只有一个模式；不能把侦察/验收当独立模式选择。
- 浏览器半随页面加载，改完界面要刷新页面才生效；宿主半重载 bundle 即可。
