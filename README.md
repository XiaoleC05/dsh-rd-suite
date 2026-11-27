# dsh-rd-suite · 研发工作台

一个 bundle（一个安装项、一个仓库）。侧栏只有一个研发入口「研发工作台」；插件列表只有 **3 行**：

| 行 | 内容 |
|---|---|
| `preset-rd` | 研发模式：官方 `ptc` 预设的超集（含 `run_code` 程序化调用、定时任务、`subagent_fork`），外加分级流水线、验收关卡、独立验收与领域技能 |
| `github-issue-first-workflow`（融合主体） | 一个插件主体：代码标准化工具、**GitHub 固定流程**（G0 预检 → 每模块一个 Issue → 分支 → 原子提交 → 代码审计 → PR/合并 → 关闭 → 发版）与全部界面 |
| `context7-mcp` | context7 文档检索 MCP |

## 界面

- 侧栏「研发工作台」→ 入口页：页内标签「概览」「代码修正」。概览顺序为 **状态带 → 三步开始 → S1–S8 流水线（标出 S5/S6 两道关卡）→ 分级与关卡 → 已装能力 → 与其他模式的区别（折叠）**；内容限宽 1040px 居中，窄主区单列，不再横向溢出。
- 标签栏支持方向键 / Home / End 漫游；成员页面（代码修正）首次打开才挂载，切换标签保留勾选与结果；成员页面缺失时给出提示。
- 自动代码审查与修正：写入或修改代码文件后，插件按项目规范格式化并写回，不需要手动点按钮；面板按钮保留作按需复查。配置项 `autoCodeFix` 可关闭。

## 结构

| 目录 / 文件 | 作用 |
|---|---|
| `index.js` | **融合插件**：组合 `code-pipeline/` 与 `github/` 两个成员，并在写文件后自动格式化 |
| `code-pipeline/` | 代码标准化工具与只读工作区路由 |
| `github/` | `github_workflow` 工具与 Issue 优先提示词 |
| `client-sources/hub-rd.js` | 研发工作台入口页（唯一侧栏图标 + 概览） |
| `client-sources/code-pipeline.js` · `github.js` · `cards.js` | 代码修正面板、GitHub 设置行、模式卡片增强（`cards.js` 由 `scripts/vendor-cards.mjs` 生成） |
| `client.js` | 合并后的浏览器模块（`node scripts/build-client.mjs` 生成，勿手改） |
| `skills/` | 预设按包名解析到的 rd-* 技能目录 |
| `test/` | 入口页的无浏览器校验（`node --test`） |
| `cordis.patch.yml` | 上面 3 行的完整声明，头部有相对官方 `ptc` 预设的差异表 |
| `docs/` | `DESIGN.md`（设计与成本模型）、`DETAIL.md`（插件详情页）、`CHANGELOG.md` |

## 安装与维护

- 安装：`plugin_manager install_bundle target=D:/05_Code/dsh-rd-suite`。
- 装好后重载：`plugin_manager set_bundle target=dsh-rd-suite enabled=false`，再 `enabled=true`；浏览器半需刷新页面。
- 改宿主代码：直接改 `code-pipeline/`、`github/`，重载 bundle。
- 改界面：改 `client-sources/<name>.js`，运行 `node scripts/build-client.mjs`，刷新页面。
- 跑校验：`npm test`（入口页 + code-pipeline + github 共 88 个用例）与 `node --check client.js`。
- 回到原生工具调用（不含 PTC）：把 `cordis.patch.yml` 里 `tool-executor-ptc` 那行改成 `disabled: true`，重载 bundle。
- 只停用 GitHub 流程：做不到，它属于模式本身。没有 GitHub 远程仓库的项目自动走普通工程流程，其余项目一律按固定流程办。
- 整体停用：`set_bundle` target=`dsh-rd-suite`，enabled=`false`。

## 注意

- 一个 bundle 只有一个浏览器模块（模块 id = 包名）。
- 预设行与 context7 行是 DSH 机制要求的独立行，不能并入融合主体。
- `client-sources/cards.js`、`VENDORED` 常量与 `@local/dsh-rd-mode-cards` 这个客户端插件 id 都是历史命名，改名要同时改 `scripts/vendor-cards.mjs` 并重新生成。
