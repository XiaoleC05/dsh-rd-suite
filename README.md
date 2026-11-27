# dsh-rd-suite · 研发工作台

一个 bundle（一个安装项、一个仓库）。侧栏只有一个研发入口「研发工作台」；插件列表只有 **3 行**：

| 行 | 内容 |
|---|---|
| `preset-rd` | 研发模式：官方 `ptc` 预设的超集（含 `run_code` 程序化调用、定时任务、`subagent_fork`），外加分级流水线、验收关卡、独立验收与领域技能 |
| `github-issue-first-workflow`（行 id，历史包名；融合主体） | 一个插件主体：代码标准化工具、**GitHub 固定流程**（G0 预检 → 每模块一个 Issue → 分支 → 原子提交 → 代码审计 → PR/合并 → 关闭 → 发版）与全部界面 |
| `context7-mcp` | context7 文档检索 MCP |

## 界面

- 侧栏「研发工作台」→ 入口页：页内标签「概览」「代码修正」「记忆库」。记忆库可搜索、按类型筛选、查看全文并复制，数据来自 `/dsh-rd-memory/api`。概览顺序为 **状态带 → 三步开始 → S1–S8 流水线（标出 S5/S6 两道关卡）→ 分级与关卡 → 已装能力 → 与其他模式的区别（折叠）**；内容限宽 1040px 居中，窄主区单列，不再横向溢出。
- 标签栏支持方向键 / Home / End 漫游；成员页面（代码修正）首次打开才挂载，切换标签保留勾选与结果；成员页面缺失时给出提示。
- 代码审查与修正分两层，都不用手动触发：写入或修改代码文件后即时按项目规范格式化；每个模块关闭时（`github_workflow` 的 `close_issue`）对本次改动的文件整体审计一次，`checked/fixed/remaining` 直接写进工具结果。面板只用于复查。

## 结构

| 目录 / 文件 | 作用 |
|---|---|
| `index.js` | **融合插件**：组合 `code-pipeline/` 与 `github/` 两个成员，并在写文件后自动格式化 |
| `code-pipeline/` | 代码标准化工具与只读工作区路由 |
| `github/` | `github_workflow` 工具与 Issue 优先提示词 |
| `memory/` | 长期记忆：技术模板、踩坑、bug 修复方案、策略模式，存 `~/.dsh/rd-suite/memory.json`；工具 `memory_save` / `memory_list` / `memory_search` / `memory_read` / `memory_import` / `memory_export`；只读路由 `/dsh-rd-memory/api/{list,entry,stats,export}` 供侧栏面板使用；`/dsh-code-pipeline/api/status` 给概览提供版本与账本进度 |
| `client-sources/hub-rd.js` | 研发工作台入口页（唯一侧栏图标 + 概览） |
| `client-sources/code-pipeline.js` · `github.js` · `cards.js` | 代码修正面板、GitHub 设置行、模式卡片增强（`cards.js` 由 `scripts/vendor-cards.mjs` 生成） |
| `client.js` | 合并后的浏览器模块（`node scripts/build-client.mjs` 生成，勿手改） |
| `skills/` | 预设按包名解析到的 rd-* 技能目录（含 rd-copy：文案去 AI 味、AIGC 自检、降重） |
| `test/` | 入口页、代码审计、技能规范与 AIGC 检查脚本的校验（`node --test`） |
| `scripts/aigc-check.mjs` | 文案 AIGC 自检：套话、连接词、模板开头、重复片段与句长分布，0–100 分 |
| `scripts/push-via-api.mjs` | `git push` 被链路掐断时的回退：校验快进后用 Git Data API 推送并提示对齐 |
| `scripts/smoke-install.mjs` | 按 files[] 装出最小副本并试加载，验证工具与路由都注册上 |
| `scripts/verify-package.mjs` | 打包校验：files 覆盖、技能 frontmatter、成员目录、client.js 新鲜度 |
| `scripts/dup-check.mjs` | 跨文件重复段落检测（降重的另一半） |
| `scripts/audit-changed.mjs` | 只审 git 改动过的代码文件（交付前的轻量复查） |
| `scripts/flow-drill.mjs` | 全流程演练：假 git/gh 跑通建单、分支、PR、合并、关闭七步 |
| `scripts/memory-recall.mjs` | 记忆召回基准：top1 准确率与 MRR，低于阈值即失败 |
| `scripts/doc-cmd-check.mjs` | 校验文档里的示例命令：脚本存在、参数有出处 |
| `scripts/board.mjs` | 刷新 README 里的迭代进度块（标记之间替换，幂等） |
| `scripts/release.mjs` | 版本推进：每 10 轮 minor，其余 patch，同时改清单与 CHANGELOG 骨架 |
| `scripts/rollback-drill.mjs` | 回滚演练：临时仓库里真跑 revert，验证树还原且历史保留 |
| `scripts/round-report.mjs` | 单轮评估报告：证据四段（做了什么 / 验证数据 / 判据 / 结论） |
| `scripts/ledger.mjs` | 账本维护：`--list` 查状态、`--mark` 改状态、`--append-round` 追加轮次 |
| `scripts/resume.mjs` | 中断恢复摘要：已做轮次、漏记检测、下一条待做 |
| `scripts/preflight.mjs` | 交付门禁：文档分数、重复、术语、打包、冒烟、流程演练六合一 |
| `scripts/term-check.mjs` | 术语一致性：按 docs/glossary.json 查同义词变体 |
| `scripts/health.mjs` | 横向体检：宪章体积、技能、测试、文档分数、打包缺口、术语漂移六项 |
| `scripts/repo-map.mjs` | 仓库地图：文件 + 顶层符号 + 行数，按字符预算输出，给侦察用的骨架 |
| `scripts/secret-scan.mjs` | 提交前密钥扫描：厂商前缀、私钥块、键名 + 高熵值，命中打码输出 |
| `scripts/commit-msg.mjs` | 提交信息校验：类型白名单、header 70+、footnote，并推导 semver 与 CHANGELOG 条目 |
| `docs/REFERENCES.md` | 参考项目调研：取用了哪些高星项目、哪些没取用及理由 |
| `docs/ITERATION.md` · `docs/ITERATIONS.md` · `docs/CHECKLIST.md` | 100 轮迭代协议、逐轮账本与每 10 轮横向检查清单 |
| `cordis.patch.yml` | 上面 3 行的完整声明，头部有相对官方 `ptc` 预设的差异表 |
| `docs/` | `DESIGN.md`（设计与成本模型）、`DETAIL.md`（插件详情页）、`CHANGELOG.md` |

## 持续集成

`.github/workflows/checks.yml` 在 push 与 PR 上跑同一套门禁：构建产物、测试、`preflight` 七项。命令写死在 workflow 里会漂移，所以 `test/ci-workflow.test.mjs` 断言它逐字等于 `package.json` 的 `test` 脚本，并对齐 Node 22。

## 错误码

四个成员返回的 code 集中登记在 `lib/error-codes.js`：每条给出中文说明 / 是否可重试 / 遇到该做什么。`test/error-codes.test.mjs` 会扫源码，出现未登记的码直接失败——新加码必须同时写下它的含义。

可重试的只有真正的瞬时失败（超时 / 推送被拒 / 限流 / Issue 与 PR 读取偶发失败）；参数错误、权限不足、仓库状态不对都不在其中。

## 迭代进度

<!-- rd-board:start -->
进度：63/100 轮 · 用例 375 · 版本 0.56.0 · 门禁 六项全过

| 最近三轮 | 做了什么 |
|---|---|
| 第 61 轮 | 命中处给具体改写建议（套话替换表 / 结构痕迹复用 hint）；3 例测试 |
| 第 62 轮 | 可访问性契约断言（tab/tabpanel/aria-label/aria-pressed）；5 例测试 + 修 aria-controls |
| 第 63 轮 | 中英字典键集 / 嵌套表 / 数组长度 / 占位符四项对齐校验；5 例测试 |
<!-- rd-board:end -->

## 安装

最低 DSH 版本：`0.2.2-rc.5`（`package.json` 的 `engines.dsh`）。低于该版本会在运行期才暴露问题，`node scripts/verify-package.mjs` 会在仓库里直接拦下。
与维护

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
