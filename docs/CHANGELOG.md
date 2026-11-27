# 变更日志

## 0.31.0 — 2026-11-27

- 新增 scripts/smoke-install.mjs：按 package.json files[] 把包内容复制到仓库内临时副本，
  动态 import 副本的 index.js 并用最小假 ctx 调 apply()，断言工具与路由都注册上；
  同时校验 cordis.patch.yml 引用的成员在副本里存在，跑完清理副本。
- 冒烟顺带记录了插件真正依赖的宿主能力：subprocess、systemPrompt.section、events、workingDirectory。
- 实测：104 个文件、9 个工具、8 条路由，通过。
- 新增 4 例测试；全量 243/243。
## 0.30.0 — 2026-11-27

- 声明 `engines.dsh: >=0.2.2-rc.5`；打包校验把缺失 engines 从提示升级为问题，并新增范围匹配校验。
- 新增语义化版本比较（预发布小于同版本正式版）与范围解析（`>=` `>` `=` `^` `~` 与裸版本）。
- 实测抓到自己的错：初版写成 `>=0.2.2`，而当前安装是 `0.2.2-rc.5`，校验直接判不满足。
- 新增 3 例测试；全量 239/239。
## 0.29.0 — 2026-11-27

- 新增 scripts/verify-package.mjs 四项校验：files[] 是否覆盖随包目录与文件、每个技能是否有
  name/description frontmatter、cordis.patch.yml 引用的成员目录是否存在、client.js 是否比源码新。
- 自用结果：本仓库通过（1 条提示：没有声明 engines.dsh）。
- 新增 6 例测试；全量 236/236。
## 0.28.0 — 2026-11-27

- 新增 `/dsh-code-pipeline/api/status`：读工作区的 package.json 版本、docs/ITERATIONS.md 的
  账本轮次与行数、CHANGELOG 最新版本；文件缺失时字段缺省并记 warning。
- 侧栏概览新增「当前状态」四格：插件版本 / 已迭代轮次 / 账本行数 / 最新变更；
  拿不到数据时整块不显示，避免空壳。
- 新增 test/status.test.mjs（5 例）与概览渲染断言（1 例）；全量 230/230。
## 0.27.0 — 2026-11-27

- 新增 scripts/dup-check.mjs：按空行切段（跳过标题、列表、引用、代码块），归一化后跨文件比对，
  同一段落出现在两处即报，输出所在文件与行号；有重复时退出码 1。
- rd-copy 的降重一节接上脚本用法；README 工具表补一行。
- 自用结果：README + DESIGN + DETAIL 三份文档无重复段落。
- 新增 6 例测试；全量 224/224。
## 0.26.0 — 2026-11-27

- AIGC 自检补六条英文规则：not-just-but、fast-paced 开场、dive-in、heres-the-thing、
  营销形容词堆叠、一行两个以上破折号。
- 新增 minPerLine 阈值：破折号这类密度信号一行不足两个不计。
- 实测：英文套话段落 100 → 29 分；正常英文与中文文案仍为 100 分。
- rd-copy 增加「英文文案的信号」小节；新增 2 例测试。
## 0.25.0 — 2026-11-27

- 入口页每个面板各包一层错误边界：渲染失败只影响自身，显示错误信息与「重新渲染」按钮，
  控制台留完整栈；概览与成员页面互不牵连。
- 测试替身没有 `React.Component` 时边界退化为直通组件，无浏览器测试照常跑。
- 新增 2 例测试（结构断言 + 替身环境渲染）；全量 216/216。
## 0.24.0 — 2026-11-27

- AIGC 自检支持项目自定义禁用词：`analyze(text, { extraCliches })` 与命令行 `--banned <文件>`
  （每行一个词、`#` 注释，或 JSON 数组），与内置表合并去重后同样计入扣分。
- rd-copy 增加「项目自定义禁用词」小节，说明词表随项目走而不写进技能。
- 新增 2 例测试；全量 214/214。
## 0.23.0 — 2026-11-27

- 宪章交付报告模板新增「**审计**」一行：抄 `codeAuditChecked / Fixed / Remaining` 与按语言摘要，
  没跑审计要写「未运行：原因」。
- 新增 `test/charter.test.mjs`（6 例）守住宪章结构：九节标题、S1–S8 与两道关卡、报告五行、
  记忆与 GitHub 流程时机、占位符只有 model、体积 ≤ 5000 字符。
- 全量 212/212。
## 0.22.0 — 2026-11-27

- 审计增加进程内缓存：按 mtime + size 判定文件是否变过，命中且上次干净就直接计为 cached；
  有问题的文件不进缓存，每次复审都要重新报告；`cache: false` 可绕过。
- 新增 `clearAuditCache` / `auditCacheStats` / `mergeLanguageGroups`；返回结果带 `cached`，
  语言分组把命中缓存的文件也统计进去。
- 新增 `test/audit-cache.test.mjs`（5 例）；全量 206/206。
## 0.21.0 — 2026-11-27

- 新增「只审改动文件」入口：`parseGitStatus` / `changedPaths` / `auditChanged`，
  改动来源是 `git status --porcelain`（含未跟踪），删除文件不审、纯文本不进审计；
  命令行 `scripts/audit-changed.mjs --mode report|fix [--json]`。
- git 不可用时按「没有改动」处理，不抛错。
- 新增 `test/audit-changed.test.mjs`（5 例）；全量 201/201。
## 0.20.0 — 2026-11-27

- 审计结果按语言分组：`auditFiles` 返回 `byLanguage`（复用 languages.js 的 classify，无法判定的落 non-code），
  `close_issue` 结果新增 `codeAuditByLanguage`（如「javascript 3 检 1 修；python 1 检 0 修」）。
- 用途：判断是不是某一种语言的预设有问题，报告里也能说清改的是哪类文件。
- 新增 3 例测试；全量 197/197。
## 0.19.1 — 2026-11-27

- `precheck` 用 `git rev-list --left-right --count HEAD...origin/<branch>` 给出 `ahead` / `behind` / `diverged`；
  分叉时 guidance 直接给 rebase 步骤（fetch → rebase → 逐个解决冲突 → `git rebase --continue`），
  落后时提示先 pull，读不到远端分支时字段缺省且不影响预检通过。
- result-schema 声明三个字段；新增 1 例测试覆盖领先/落后/分叉/读不到四种情形；全量 194/194。
## 0.19.0 — 2026-11-27

- 新增 `github/lib/release-check.js`：tag 规范化（去 v 前缀与构建后缀）、与 package.json 版本比对、
  校验 CHANGELOG 是否有对应版本标题（行内提及不算）。
- `release` 发布前做校验，不一致直接返回 `RELEASE_INCONSISTENT` 且不调用 `gh release create`；
  读不到文件时记 warning 并跳过该项，新增 `verify` 参数（默认 true）。
- 新增 8 例纯函数测试与 1 例集成测试；全量 193/193。
## 0.18.0 — 2026-11-27

- Issue 正文改为七段固定模板：现象 / 复现 / 影响 / 受影响文件 / 验收标准 / 计划 / 环境，
  缺的段落给「待补充」占位而不是空标题；`create_issue` 新增 `repro` 与 `acceptance` 参数。
- 标签兜底：创建 Issue 前对每个标签跑 `gh label create --force`，建失败的标签不再传给
  `issue create`（避免整条命令失败），结果里给 `labelsEnsured` 与 `warnings`。
- 新增 3 例测试；全量 185/185。
## 0.17.1 — 2026-11-27

- `merge_pr` 对瞬时失败（超时、连接重置、5xx、限流）重试一次，永久失败不重试；
  重试过会在 guidance 里注明。
- `auto` 模式用 `gh pr view --json autoMergeRequest` 确认是否真的排队，结果带 `autoQueued`。
- result-schema 增加 `autoQueued`；新增 2 例测试；全量 182/182。
## 0.17.0 — 2026-11-27

- `open_pr` 新增 `issues` 数组：一个 PR 收口多个模块时，为每个编号补一行 `Closes #N`，
  正文里已有的不重复补，重复编号只写一次（支持数字与 issue URL）。
- 工具定义同步加 `issues` 参数；新增 1 例测试；全量 180/180。
## 0.16.1 — 2026-11-27

- `precheck` 增加三项：`recentCommits`（最近 5 条 `短sha 标题`）、
  `requiredReviews`（必需审批数）、`requiredChecks`（必需通过的检查名，最多 10 个）；
  后两项只在保护开启且 gh 返回结构化字段时出现。
- 用途：模型不必再为「要几个审批、哪些检查必须绿、最近有没有同类改动」多跑命令。
- result-schema 声明三个字段；新增 1 例测试；全量 179/179。
## 0.16.0 — 2026-11-27

- 新增 `scripts/health.mjs`：宪章字符数、技能数量与最大体积、测试文件与用例数、
  文档 AIGC 分数、打包缺口、术语漂移六项指标；`--json` 与 `--fail-on-drift` 可当门禁。
- 新增 `docs/CHECKLIST.md`：脚本覆盖的六项 + 需要人看的四项（术语一致、文档与代码一致、
  测试耗时、宪章趋势），并留十轮台账。
- 首跑修掉 5 处术语漂移：README 行 id 说明、rd-code-standards 里「开启 issue-first 设置」
  等过时表述；术语表同时去掉与界面标签「代码修正」冲突的条目。
- 新增 `test/health.test.mjs`（4 例）；全量 178/178。
## 0.15.1 — 2026-11-27

- `pr_status` 除计数外给出 `failingChecks` 与 `pendingChecks` 名单（各最多 10 条），
  guidance 里直接点名失败的检查；全部通过时不返回这两个字段。
- 检查项名字取 name / context / title，取不到用 `check-N` 兜底。
- 新增 2 例测试；全量 174/174。
## 0.15.0 — 2026-11-27

- 宪章接上长期记忆：S8 沉淀改为先 `memory_save`（四类 + 现象/根因/做法/验证/边界），
  §7 增 `memory_*` 用法，§4 路由要求开工前先 `memory_search`。
- rd-retro 收集阶段先查记忆，已有踩坑与策略不重复提案；
  rd-spec 新增「先找现成做法」，写 plan 前搜 `type=template`。
- 宪章 4,872 字符（仍只有一个 model 占位符）；skills 测试新增接线断言；全量 173/173。
## 0.14.1 — 2026-11-27

- 容量上限改为可解释的淘汰：`retentionScore = hits×10 + 最近 30 天加成 + revisions`，
  超限时按分数淘汰、同分先丢更早更新的、再按 id 稳定排序；
  原来只按 hits 排序截断，hits 都为 0 时等于随机丢弃。
- `evictEntries` 抽成纯函数并接到 `openStore.flush`；非法上限按「不淘汰」处理。
- 新增 `test/memory-evict.test.mjs`（6 例）；全量 172/172。
## 0.14.0 — 2026-11-27

- 新增 `memory_export`（整库导出到 JSON）与 `memory_import`（从文件或内联数组导入）。
- 合并语义（`memory/lib/merge.js`）：按类型 + 归一化标题对齐，正文取 updatedAt 较新者，
  标签取并集、hits 取较大值、revisions 累加、保留较早的 createdAt；
  `replace` 模式整库替换并统计丢弃数。
- 非法条目（缺 type/title、null）在合并前被过滤；读取或写入失败时明确报错且不改库。
- 新增 `test/memory-import.test.mjs`（6 例，含导出后再导入的往返一致）；全量 166/166。
## 0.13.0 — 2026-11-27

- 新增侧栏「记忆库」标页：搜索框、类型筛选、条目列表（标题 + 类型 + 命中次数）、
  详情面板（全文、更新时间、复制正文），空库/过滤为空/读取失败/未授权四种状态都有文案。
- 数据来自只读路由；页面在 hub 的标签里渲染，与「概览」「代码修正」并列。
- 新增 test/memory-page.test.mjs（4 例）；全量 160/160；client.js 4 个 surface。
## 0.12.0 — 2026-11-27

- 新增记忆库只读 HTTP 路由：`/dsh-rd-memory/api/list`（支持 q/type/tag/分页）、
  `/entry`（读全文并累加命中）、`/stats`（按类型计数与最近更新时间）、
  `/export`（整库导出）。
- 信任判定复用 code-pipeline 的 `createRequestGuard`：没有 Connection 服务的部署
  返回 503，未通过闸门返回 401，面板不会拿到数据。
- 新增 `test/memory-routes.test.mjs`（5 例）；全量 156/156。
## 0.11.0 — 2026-11-27

- 新增 `memory_search`：中文按整串 + 二元组分词，标题 6 / 标签 4 / 正文 2 / 范围 1 加权，
  返回分数与命中片段；被检索到的条目累加 hits，同分时按 hits 与更新时间排序。
- 新增 `memory_read`：按 id 读全文并计入一次命中。
- 协议补三条硬规则：fetch 未成功不要 reset、推送后不要再 amend、临时文件不进提交。
## 0.10.1 — 2026-11-27

- 新增推送回退通道：`scripts/push-via-api.mjs` 在 `git push` 的 POST 被掐断时，
  用 Git Data API 上传 blob、建树、建提交并快进 ref；`--dry-run` 先看计划，
  非快进一律拒绝。
- 纯逻辑拆到 `scripts/lib/push-plan.mjs`（解析、建树、快进校验、改动分类），
  由 `test/push-api.test.mjs` 覆盖。
- 协议补「推送失败时的回退」五步；账本 026 完成。
## 0.10.0 — 2026-11-27

- 新增长期记忆模块 `memory/`：技术模板、踩坑、bug 修复方案、策略模式四类，
  存 `~/.dsh/rd-suite/memory.json`（可配置目录与条目上限），原子写、同标题合并。
- 新增 `memory_save`（按类型写入，返回 created/updated 与 id）与 `memory_list`
  （类型/标签过滤、分页、摘要）两个工具，融进融合插件由根 `index.js` 组合。
- 打包清单加入 `memory`，packaging 测试改为遍历全部运行时目录，新增模块
  不会再漏出包。
- 新增 `test/memory-store.test.mjs`（10 例）；全量 136/136。
## 0.9.1 — 2026-11-27

- 修复打包清单：files 补上 scripts，按包安装后 repo-map、secret-scan、
  commit-msg、aigc-check、build-client 都在（#15）。
- 新增 test/packaging.test.mjs：断言 files 覆盖全部运行时脚本、技能目录、
  成员实现与文档；npm pack --dry-run 现为 91 个文件、230 kB（#15）。
## 0.9.0 — 2026-11-27

- 新增 rd-spec 技能与 spec/plan/tasks 三份模板（仿 spec-kit）：
  产物写到 specs/<NNN>-<slug>/，配 clarify（≤3 问）、analyze（AC 与任务交叉核对）、
  checklist（开工前五问）、converge（收尾回填证据）四个动作（#14）。
- rd-copy 增加结构型痕迹一节（对举句式、三连并列、破折号泛滥、
  行首加粗标签、拔高收尾、聊天残留），并给出改写口径（#14）。
- aigc-check 增加五类结构检测与破折号密度；并列铺陈按弱信号处理，
  列表、表格、引用行内的顿号不计入，扣分有上限（#14）。
- 宪章 §4 把 L3 与歧义需求的规格产物路由到 rd-spec（#14）。
- 全量 118/118；本仓库文档在新检测器下分别为 100/94/90/91 分（#14）。
## 0.8.0 — 2026-11-27

- 新增 `scripts/secret-scan.mjs`（仿 gitleaks）：厂商前缀、私钥块、键名 + 凭据值三类规则，
  命中只输出打码片段；`--staged` 扫暂存区，命中返回 1，占位符与 `process.env` 不误报（#13）。
- 新增 `scripts/commit-msg.mjs`（仿 commitlint + release-please）：校验类型白名单、header
  长度、空行与正文行宽，推导 semver 级别并给出 CHANGELOG 条目草稿（#13）。
- 宪章 S5 要求交付前跑 secret-scan；GitHub 流程提示词 G3 加 commit-msg 校验、G7 说明
  按提交类型推导版本级别（#13）。
- 新增 `test/gates.test.mjs`（7 例：命中与打码、占位符豁免、CLI 退出码、提交信息四类
  违规、破坏性变更、CHANGELOG 分组）；全量 115/115（#13）。
## 0.7.0 — 2026-11-27

- 新增 `scripts/repo-map.mjs`（仿 Aider 的 repo map）：输出「文件 + 顶层符号 + 行数」的仓库骨架，支持 `--budget`/`--depth`/`--json`，跳过依赖与构建目录，并只采模块级变量与 .md 标题（#12）。
- 宪章 S2 侦察要求陌生仓库先跑 repo-map 拿骨架再读行段（#12）。
- 新增 `docs/REFERENCES.md`：记录这次调研的高星项目、取用的点、没取用的点与理由，以及「零依赖、只借做法」的判断标准（#12）。
- 新增 `test/repo-map.test.mjs`（符号提取、忽略目录、预算截断、渲染、CLI）；全量 108/108（#12）。
## 0.6.0 — 2026-11-27

- 新增 rd-copy 技能：去 AI 味（禁用词表、句长节奏、结论先行、具体依据）、AIGC 自检（脚本 + 三项人工复核）、降重（换视角/换结构/换例子/换粒度，8 汉字或 4 英文词重复不超过 1 处）（#10）。
- 新增 `scripts/aigc-check.mjs`：零依赖启发式扫描，输出 0–100 人味分、套话/连接词/英文词藻/模板开头/重复片段/句长变异系数，支持 `--json` 与 `--min-score`；散文外内容（代码块、行内代码、链接）不计入重复（#10）。
- 宪章 §4 把文案与文档路由到 rd-copy 并要求交付前跑到 80 分；入口页能力卡新增「文案质检」（#10）。
- 新增 `test/aigc-check.test.mjs` 与 `test/skills.test.mjs`：前者验证套话识别、分数差距、重复片段与 CLI 退出码，后者固定 frontmatter、150 字描述、6000 字符正文与 scripts/ 引用存在的约束（#10）。
## 0.5.0 — 2026-11-27

- 代码修正从「手动面板」变成固定流程的两层自动行为：写文件即格式化；每个模块关闭时对本次改动整体审计，`checked/fixed/remaining/files` 直接进 `github_workflow` 的 close_issue 结果（#11）。
- 新增 `code-pipeline/lib/audit.js`（report → fix → 幂等复查），`test/audit.test.mjs` 用真实临时文件验证改写、幂等、report 不写盘与空输入（#11）。
- 去掉 `autoCodeFix` 开关的实际门控（字段保留仅为兼容旧 profile），宪章 S5 要求把审计数字抄进验收表，§7 的代码工具说明改为「面板只作复查」（#11）。

## 0.4.0 — 2026-11-27

- GitHub 流程改为模式固定流程，不再是设置开关：删掉设置 → 通用里的开关行与成员包的 client 半，提示词与工具常驻（#9）。
- `github_workflow` 从 3 个动作扩到 8 个：precheck（新增 strategy / defaultBranch / protection / ruleset 判定）、create_issue、prepare_branch、open_pr、pr_status、merge_pr、close_issue、release；范式按 GitHub 官方文档的 flow、关闭关键词与受保护分支约定编写（#9）。
- 入口页新增「GitHub 固定流程」G0–G7 区块；docs/DESIGN.md 新增该流程的说明与出处（#9）。

## 0.3.0 — 2026-11-27

- 研发模式成为官方 `ptc` 预设的超集：挂 `tool-executor-ptc`（`run_code` 程序化调用，`maxSubCallsPerMinute 512` / `maxParallelSubCalls 8`），补 `tool-schedule` 与 `tool-subagent-fork`（#6）。
- 宪章 prefix 从 5,238 字符压到 4,010（−23%），新增 §5.9 PTC 执行纪律与 §7 `schedule_*` 使用约束；61 条规则要点逐条保留（#6）。
- 收紧单次输出：工具结果剪裁 6144/3072/768，网页抓取上限 80000 → 60000（#6）。
- 侧栏入口页重排：状态带 → 三步开始 → S1–S8 流水线（标关卡）→ 分级与关卡 → 能力 → 折叠的差异对比；统一字号与间距刻度、限宽 1040px、窄主区单列；标签栏补 aria 关联与方向键漫游；成员页面按需挂载并保留状态；代码修正页内嵌时不再重复标题（#7）。
- 新增 `test/hub-client.test.mjs`（5 个用例）与 `npm run build` / `npm test` 脚本（#7）。
- 删除旧研发模式工作区与仓内 `rd-mode/` 历史目录（36 文件），修正 rd-retro / rd-selftest / rd-ecosystem 里指向已不存在脚本的引用；成员包去掉失效的 `./client` 导出与 `client.js` 声明，删掉过期的 `client-sim` 用例，全量测试 78/78 通过（#8）。
- 新增 `docs/DESIGN.md` 与本次日志。

## 0.2.0 — 2026-11-27

- 融合为一个插件主体：代码标准化 + GitHub Issue 流程 + 合并浏览器模块（#2、#1）。
- 三个研发预设合并为唯一「研发模式」，侦察与验收改为流程内的子代理角色（#2）。
- 入口页新增模式说明，代码修正页迁移为页内标签（#3、#4）。
- 写文件后自动按项目规范格式化（`autoCodeFix`）（#5）。

## 0.1.0 — 2026-11-19

- 仓库建立：研发模式预设、领域技能、设计文档。
