# dsh-rd-suite · 研发工作台

一个 bundle（一个安装项、一个仓库）。侧栏只有一个研发入口「研发工作台」；插件列表只有 **3 行**：

| 行 | 内容 |
|---|---|
| `preset-rd` | 研发模式（唯一模式：侦察 → 实现 → 验收是一条完整流程） |
| `github-issue-first-workflow`（融合主体） | 一个插件主体：代码标准化工具、GitHub Issue 流程与全部界面 |
| `context7-mcp` | context7 文档检索 MCP |

## 界面

- 侧栏「研发工作台」→ 入口页：说明模式怎么工作、与其他模式的区别、已装能力与开始方式，并提供「打开代码修正」按钮。
- 代码修正页、模式卡片、GitHub 设置开关仍然在内，由同一个 `client.js` 提供；旧插件的侧栏图标已收进入口页。

## 结构

| 目录 / 文件 | 作用 |
|---|---|
| `index.js` | **融合插件**：组合 `code-pipeline/` 与 `github/` 两个成员 |
| `code-pipeline/` | 代码标准化工具与只读工作区路由 |
| `github/` | `github_workflow` 工具与 Issue 优先提示词 |
| `client-sources/hub-rd.js` | 研发工作台入口页（唯一侧栏图标 + 模式概览） |
| `client-sources/cards.js` | 模式卡片增强（由 `scripts/vendor-cards.mjs` 生成） |
| `client.js` | 合并后的浏览器模块（入口页 + 卡片 + 代码面板 + GitHub 设置行） |
| `skills/` | 预设按包名解析到的 rd-* 技能目录 |
| `rd-mode/` | 原研发模式仓库的历史文档、源 patch、周复盘与校验脚本 |
| `cordis.patch.yml` | 上面 3 行的完整声明 |

## 安装与维护

- 安装：`plugin_manager install_bundle target=D:/05_Code/dsh-rd-suite`。
- 改宿主代码：直接改 `code-pipeline/`、`github/`，重启 DSH 或重载 bundle。
- 改界面：改 `client-sources/<name>.js`（`cards.js` 用 `node scripts/vendor-cards.mjs` 重新生成），运行 `node scripts/build-client.mjs`，再重载 bundle。
- 只停用 GitHub 流程：设置 → 通用 里关掉开关（`githubIssueFirstWorkflow`）。
- 整体停用：`set_bundle` target=`dsh-rd-suite`，enabled=`false`。

## 注意

- 旧插件的侧栏图标通过 `globalThis.__DSH_SUITE_INTEGRATED_UI` 关闭，主区页面保留，便于入口页跳转。
- 一个 bundle 只有一个浏览器模块（模块 id = 包名）。
- 预设行与 context7 行是 DSH 机制要求的独立行，不能并入融合主体。
