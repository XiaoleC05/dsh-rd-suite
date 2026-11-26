# dsh-rd-suite · 研发套件

一个 bundle（一个安装项、一个仓库），插件列表里只出现 **5 行**：

| 行 | 内容 |
|---|---|
| `preset-rd` / `preset-rd-scout` / `preset-rd-review` | 三个研发模式预设（DSH 机制要求每个预设各一行） |
| `github-issue-first-workflow`（融合主体） | 一个插件主体，同时提供代码标准化工具、GitHub Issue 流程与全部界面 |
| `context7-mcp` | context7 文档检索 MCP（MCP 必须通过 @deepseek-ai/dsh-mcp-client 一行） |

## 结构

| 目录 / 文件 | 作用 |
|---|---|
| `index.js` | **融合插件**：把 `code-pipeline/` 与 `github/` 两个成员挂到同一个插件主体，并承载 `client.js` |
| `code-pipeline/` | 代码标准化工具与只读工作区路由（成员实现） |
| `github/` | `github_workflow` 工具与 Issue 优先提示词（成员实现） |
| `client.js` | 合并后的浏览器模块：模式卡片、代码面板、GitHub 设置行 |
| `client-sources/` | 三个界面合并前的源码（卡片由 scripts/vendor-preset-cards.mjs 生成） |
| `skills/` | 预设按包名解析到的 rd-* 技能目录 |
| `rd-mode/` | 原研发模式仓库的文档、源 patch、周复盘与校验脚本 |
| `cordis.patch.yml` | 上面 5 行的完整声明 |

## 安装与维护

- 安装：`plugin_manager install_bundle target=D:/05_Code/dsh-rd-suite`。
- 改代码工具或 GitHub 流程：直接改 `code-pipeline/`、`github/`，重启 DSH 或重载 bundle。
- 改界面：改 `client-sources/<name>.js`，运行 `node scripts/build-client.mjs`，再重载 bundle。
- 加一个新功能：在 `index.js` 里像现有成员一样调用它的 `apply(ctx, 配置段)` 即可——仍然只有一行插件。
- 只停用 GitHub 流程：在设置 → 通用里关掉开关（`githubIssueFirstWorkflow`），不影响代码工具。
- 整体停用：`set_bundle` target=`dsh-rd-suite`，enabled=`false`。

## 注意

- 融合行的行 id 沿用 `github-issue-first-workflow`，因此 profile 里已有的该行配置覆盖继续生效。
- 一个 bundle 只有一个浏览器模块（模块 id = 包名），三个界面必须合成 `client.js`。
- 预设行与 context7 行是 DSH 机制要求的独立行，无法并入融合主体。
- 融合只减少插件条目，不改变每轮请求的工具数量与 token 成本。
