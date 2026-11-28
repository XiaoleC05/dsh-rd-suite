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

## 文档索引

所有文档的入口在 [docs/INDEX.md](docs/INDEX.md)：认识包 / 怎么干活 / 交付发布 / 技能内参考，四类各一张表。

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
| `lib/` | 共享底座：错误码表、体积上限与超限策略、重试与降级判定、工具耗时统计 |
| `locale/` | 面板文案的中英词条（按语言分文件） |
| `icon.svg` | 插件图标源文件（面板内用的是内联 SVG，同一套线条） |
| `README.md` | 本文件：安装、结构、门禁与迭代进度 |
| `docs/` | 设计与明细文档：`DESIGN.md`、`DETAIL.md`、`OVERFLOW.md`、`REGISTRY.md`、`SKILL-VERSIONS.md` |
| `scripts/charter-overlap.mjs` | 宪章与技能的行文重叠检查（12 字以上成句重复） |
| `scripts/ci-parity.mjs` | CI 覆盖度：workflow 是否跑构建 / 测试 / 全量门禁 |
| `scripts/claim-audit.mjs` | 无证据断言审查：结论句必须邻近有证据 |
| `scripts/git-net-check.mjs` | git 凭据与网络自检（凭据助手 / 代理 / TLS 后端） |
| `scripts/link-check.mjs` | 文档引用完整性：链接与仓库路径是否指向存在的文件 |
| `scripts/release-notes.mjs` | 从 CHANGELOG 生成用户向发布说明草稿 |
| `scripts/skill-cost.mjs` | 技能正文与 references 的体积与 token 粗估 |
| `scripts/skill-hits.mjs` | 按轮次统计技能命中率（区分显式没用与漏记） |
| `scripts/skill-usage.mjs` | 按可观测引用量给出技能合并 / 瘦身建议 |
| `scripts/skill-version.mjs` | 技能版本号与版本表生成、校验 |
| `scripts/tool-inventory.mjs` | 工具清单与文档对账 |
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

| `scripts/rd-doctor.mjs` | 七项自检合一个入口：工具清单 / 技能版本 / 宪章重叠 / 引用完整 / git 网络 / CI 覆盖 / 交付门禁 |
| `scripts/perf-budget.mjs` | 给自检入口与全量测试设耗时预算，专抓「悄悄慢一个数量级」 |
| `lib/doc-set.js` | 降重检查共用的默认文档集（README + docs + 技能正文） |
| `scripts/code-dup.mjs` | 源码重复检测（jscpd 包装，重复行占比超 3% 报错） |
| `scripts/near-dup.mjs` | 近似重复检测（SimHash 预筛 + bigram Jaccard，抓机械改写） |
## 降重五层

文本四层（文风 / 术语 / 段落重复 / 机械改写）+ 源码一层（jscpd）。命令与判定口径见 `skills/rd-copy/SKILL.md`；近似与源码两层带 `--strict`。

| 层 | 命令 | 阈值 |
|---|---|---|
| 段落重复 | `node scripts/dup-check.mjs` | 完全相同即报 |
| 机械改写 | `node scripts/near-dup.mjs --strict` | bigram 相似度 ≥ 0.55 |
| 源码重复 | `node scripts/code-dup.mjs --strict` | 重复行占比 > 3% |

深度同义改写（整句换说法）字面算法抓不到——实测改写后相似度只有 0.318，那一层只能人工复核。

## 仓库卫生

换行由 `.gitattributes` 统一为 LF，`test/hygiene.test.mjs` 校验跟踪文件不混用换行、不带 BOM。三个检查脚本（`secret-scan` / `term-check` / `dup-check`）**不带参数时默认扫全仓**，全面体检不必手拼文件列表。

## 一个入口

`node scripts/rd-doctor.mjs` 依次跑工具清单、技能版本、宪章重叠、引用完整、git 网络、CI 覆盖与交付门禁七项，逐项计时并给一行结论；`--json` 供脚本消费。交付前只跑这一条即可。

## 持续集成

`.github/workflows/checks.yml` 在 push 与 PR 上跑同一套门禁：构建产物、测试、`preflight` 七项。命令写死在 workflow 里会漂移，所以 `test/ci-workflow.test.mjs` 断言它逐字等于 `package.json` 的 `test` 脚本，并对齐 Node 22。

## 发布说明

`node scripts/release-notes.mjs --version 0.66.1` 从 CHANGELOG 取版本块，按新增 / 修复 / 文档分桶，套用户向四段模板；「一句话变化」与「需要你做什么」留占位由人补。措辞规则见 `skills/rd-copy/references/release-notes.md`。

## 无证据断言

`node scripts/claim-audit.mjs --strict 草稿.md` 逐句找「已完成 / 全部通过 / 应该可以」这类断言，要求同句或邻近几行里有证据（命令、比例、测试输出、`文件:行`、箭头结果）；写了「未验证 / 未做」的诚实标注不报。**用途是交付报告草稿**，不是历史账本——账本的证据在提交里，不在行内。

## 技能命中率

`node scripts/skill-hits.mjs --window 20` 从迭代账本读最近若干轮，区分「引用了技能」「显式没用」「漏记」三类并给出命中率。协议要求每轮记账行写明所用技能，否则算漏记。

## 宪章与技能分工

`node scripts/charter-overlap.mjs --strict` 比较宪章与十个技能的**行文**（先剔掉命令、代码、表格与英文标识符），12 字以上的成句重复会被点名——同一句话两边都写，改一处忘一处必然互相矛盾。

## 引用完整性

`node scripts/link-check.mjs --strict` 校验 README、docs 与技能正文里的链接和路径：只认带目录的仓库路径，外链与纯锚点跳过，技能正文里的 `references/…` 相对技能目录解析。能力清单记在 [docs/REGISTRY.md](docs/REGISTRY.md)。

## 技能使用频率

`node scripts/skill-usage.mjs` 统计技能名在各证据面（迭代账本、变更日志、README、宪章、其它技能正文、记忆样例）的引用量，结合正文体积给出「合并候选 / 保持 / 留意」建议。**口径说明**：统计的是可观测引用，不是真实调用次数——客户端不上报，这是能拿到的最强代理指标。

## 技能加载成本

`node scripts/skill-cost.mjs` 列出每个技能的正文体积（加载时进上下文）与 references 体积（按需读取），按正文排序并检查 3000 字符预算；`--json` 供脚本消费。

## 工具清单对账

`node scripts/tool-inventory.mjs --strict` 从源码抽出实际注册的工具（两种注册写法都认），与 README 工具表和宪章 §7 逐一比对；漏写会点名并给出补法。

## CI 覆盖

`node scripts/ci-parity.mjs --strict` 从 `.github/workflows` 抽出所有 `run:` 命令，逐项核对构建、测试与全量门禁是否被 CI 覆盖；缺项时退出码 1。preflight 的第八道门禁就用它，所以「CI 与本地同一套」不再依赖手写断言。

## 审计模式

插件配置 `auditMode` 决定模块关闭时的审计会不会改文件：

| 值 | 行为 |
|---|---|
| `fix`（默认） | 发现格式偏差就改写，并在结果里给出检查数 / 待修 / 已修 |
| `report` | 只查不改，结果标 `reportOnly`，文件内容与 mtime 都不动 |

非法值回落到 `fix` 并记一条警告。测试会验证 `report` 模式下文件**内容与 mtime 都不变**，而不是只看返回值。

## git 凭据与网络

如果每次 git 操作都弹窗要求选 GitHub 账户，或者 push 卡住，先跑：

```
node scripts/git-net-check.mjs --network
```

它检查四项配置并给出可直接粘贴的修复命令：

| 症状 | 根因 | 修法 |
|---|---|---|
| 每次弹窗选账户 | 系统级 `credential.helper=manager`（GCM）在有多个账户时弹框 | `git config --global credential.https://github.com.helper "!gh auth git-credential"` |
| 弹窗等待 | 缺凭据时 GCM 弹框而不是失败 | `git config --global credential.interactive false` |
| `curl 56 / Connection was reset` | git 不走系统代理 | `git config --global http.https://github.com.proxy http://127.0.0.1:7890` |
| `schannel: failed to receive handshake` | schannel 后端在代理下握手失败 | `git config --global http.sslBackend openssl` |

## 超限行为

五项体积上限与超限后的行为（截断 / 拒绝 / 分页）逐项写在 [docs/OVERFLOW.md](docs/OVERFLOW.md)，与 `lib/limits.js` 的 `OVERFLOW_POLICY` 由测试校验一致。

## 错误码

四个成员返回的 code 集中登记在 `lib/error-codes.js`：每条给出中文说明 / 是否可重试 / 遇到该做什么。`test/error-codes.test.mjs` 会扫源码，出现未登记的码直接失败——新加码必须同时写下它的含义。

可重试的只有真正的瞬时失败（超时 / 推送被拒 / 限流 / Issue 与 PR 读取偶发失败）；参数错误、权限不足、仓库状态不对都不在其中。

## 迭代进度

<!-- rd-board:start -->
进度：100/100 轮 · 用例 563 · 版本 1.1.0 · 门禁 六项全过

| 最近三轮 | 做了什么 |
|---|---|
| 第 98 轮 | 文档索引 + 索引不漏不虚 + 技能参考无孤儿；4 例测试 |
| 第 99 轮 | 自检与全量测试耗时预算（实测 0.6 秒 / 1.9 秒）；5 例测试 |
| 第 100 轮 | 第十次体检 + 总复盘 + 1.0.0；545 用例、133 次提交、100 条 Issue |
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
