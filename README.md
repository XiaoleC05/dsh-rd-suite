# dsh-rd-suite · 研发套件

一个 bundle（一个安装项、一个仓库），插件列表里只有 **3 行**：

| 行 | 内容 |
|---|---|
| `preset-rd` | 研发模式（唯一模式：侦察 → 实现 → 验收是一条完整流程） |
| `github-issue-first-workflow`（融合主体） | 一个插件主体，同时提供代码标准化工具、GitHub Issue 流程与全部界面 |
| `context7-mcp` | context7 文档检索 MCP（MCP 必须通过 @deepseek-ai/dsh-mcp-client 一行） |

侦察与验收不再占用模式位：它们是研发模式内部的子代理角色（`subagent` 与 `review_agent` 都复用同一个 rd 预设）。

## 结构

| 目录 / 文件 | 作用 |
|---|---|
| `index.js` | **融合插件**：把 `code-pipeline/` 与 `github/` 两个成员挂到同一个插件主体，并承载 `client.js` |
| `code-pipeline/` | 代码标准化工具与只读工作区路由（成员实现） |
| `github/` | `github_workflow` 工具与 Issue 优先提示词（成员实现） |
| `client.js` | 合并后的浏览器模块：模式卡片、代码面板、GitHub 设置行 |
| `client-sources/` | 合并前的界面源码；`cards.js` 由 `scripts/vendor-cards.mjs` 从已安装的 DSH 生成 |
| `skills/` | 预设按包名解析到的 rd-* 技能目录 |
| `rd-mode/` | 原研发模式仓库的历史文档、源 patch、周复盘与校验脚本 |
| `cordis.patch.yml` | 上面 3 行的完整声明 |

## 安装与维护

- 安装：`plugin_manager install_bundle target=D:/05_Code/dsh-rd-suite`。
- 改代码工具或 GitHub 流程：直接改 `code-pipeline/`、`github/`，重启 DSH 或重载 bundle。
- 改界面：改 `client-sources/<name>.js`（`cards.js` 用 `node scripts/vendor-cards.mjs` 重新生成），运行 `node scripts/build-client.mjs`，再重载 bundle。
- 加一个新功能：在 `index.js` 里像现有成员一样调用它的 `apply(ctx, 配置段)` 即可——仍然只有一行插件。
- 只停用 GitHub 流程：在设置 → 通用里关掉开关（`githubIssueFirstWorkflow`），不影响代码工具。
- 整体停用：`set_bundle` target=`dsh-rd-suite`，enabled=`false`。

## 注意

- 融合行的行 id 沿用 `github-issue-first-workflow`，因此 profile 里已有的该行配置覆盖继续生效。
- 一个 bundle 只有一个浏览器模块（模块 id = 包名），三个界面必须合成 `client.js`。
- 预设行与 context7 行是 DSH 机制要求的独立行，无法并入融合主体。
- 设计取舍：只保留一个模式，侦察/验收作为角色由宪章约定；换来的是一份完整的流程体验和一个模式入口。
