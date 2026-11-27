# 变更日志

## 0.66.2 — 2026-11-27

- 新增 scripts/release-notes.mjs：从 CHANGELOG 取版本块，按新增 / 修复 / 文档分桶，套用户向四段模板；
  「一句话变化」与「需要你做什么」留占位，机器不猜。
- 新增 skills/rd-copy/references/release-notes.md：四段结构与措辞规则（不用「优化 / 完善」，写可观察差异）。
- 用例 527。
## 0.66.1 — 2026-11-27

- 新增 test/package-manifest.test.mjs：枚举 scripts / lib / docs / skills / 三个成员目录的真实文件，
  逐个要求被 files 白名单覆盖；每个脚本必须被测试或文档引用；每个 .mjs 都要过语法检查。
- 新增脚本因此自动纳入检查，不需要改任何清单。用例 522。
## 0.66.0 — 2026-11-27

- 新增 scripts/claim-audit.mjs：逐句找结论性断言，要求邻近行内有证据（命令 / 比例 / 测试输出 /
  文件行号 / 箭头结果）；写「未验证」「未做」的诚实标注不报。
- 协议补一条：交付报告草稿先跑一遍该脚本。
- 用例 518。
## 0.65.3 — 2026-11-27

- 新增 skills/rd-retro/references/pitfall-template.md：踩坑记录五段（现象 / 触发条件 / 根因 / 修复 /
  防复发检查）加适用边界，每段列出不该写的空话。
- 防复发检查必须是可执行断言（测试名 / lint / 脚本 / CI），明确不接受「以后注意」。
- 样例经记忆校验；反例「已修复」被判不通过。用例 511。
## 0.65.2 — 2026-11-27

- 新增 test/report-template.test.mjs：报告模板五个必备字段、验收须写通过比例与未验证项数、
  审计须引三个数字、L0/L1 例外、沉淀的四个记忆类型，逐条固定。
- 交叉校验：子代理返回格式与交付报告都要求写「未验证」，避免虚报完成度。
- 用例 505。
## 0.65.1 — 2026-11-27

- 新增 test/spec-alignment.test.mjs：宪章规格卡五要素与 spec.md 各节一一对应；plan.md 的改动清单必须映射到 AC；
  tasks.md 用可勾选条目并带 AC 引用；三份模板都要存在。
- 用例 498。
## 0.65.0 — 2026-11-27

- 新增 scripts/skill-hits.mjs：按轮次统计技能命中率，区分「引用了技能」「显式没用」「漏记」三类。
- 实测暴露问题：最近 20 轮里 17 轮没记录技能，命中率只有 15%——不是没用技能，是没记账。
- 协议补一条：记账行末尾写 `技能：rd-xxx` 或 `技能：无`，两者都不写算漏记。用例 493。
## 0.64.3 — 2026-11-27

- 新增 scripts/charter-overlap.mjs：只比行文（剔命令 / 代码 / 表格 / 标识符），12 字以上成句重复点名。
- 收敛一处真实重复：rd-spec 的 description 复述了宪章的路由条件，改为只说明它产出什么。
- 用例 487。
## 0.64.2 — 2026-11-27

- 新增 scripts/link-check.mjs：校验 README、docs 与技能正文里的链接与路径，跳过外链与纯锚点，
  技能内 `references/…` 相对技能目录解析；--strict 有断链退出码 1。
- 新增 docs/REGISTRY.md 能力登记簿（工具 / 技能 / 面板路由三张表），补上 rd-ecosystem 引用的文件。
- 修掉 DESIGN 里指向不存在预设文件的表述。用例 483。
## 0.64.1 — 2026-11-27

- 十个 SKILL.md 的 frontmatter 加 `version`（rd-copy 本轮改过内容，1.1.0；其余 1.0.0），
  新增 docs/SKILL-VERSIONS.md 版本表，由 `skill-version.mjs --write` 生成、`--check` 校验。
- 检查器新增 maskCode：反引号与围栏代码块里的词属于引用，不再计入套话——否则「文档里讲规则」会
  被自己的规则判罚。
- 用例 478。
## 0.64.0 — 2026-11-27

- 新增 skills/rd-copy/references/before-after.md：六组对照（README 简介 / 变更日志 / PR 描述 /
  错误提示 / 提交信息 / 对外公告），每组写明改了什么。
- 示例自校验：每组「改后」必须零套话且 90 分以上，「改前」必须被判出问题。
- 顺带补检查器词表：`稍后重试`、`联系管理员` 这类空话型提示，以及 `优化相关`、`完善相关`、`提升整体` 这类空提交词。
- 用例 472。
## 0.63.3 — 2026-11-27

- 新增 scripts/skill-usage.mjs：按可观测引用量（账本 / 变更日志 / README / 宪章 / 其它技能 / 记忆样例）
  给出合并与瘦身建议；口径写明是代理指标而非真实调用次数。
- 实测十个技能引用 2–12 次，没有零引用技能；rd-retro / rd-ecosystem / rd-copy 建议优先拆 references。
- 用例 468。
## 0.63.2 — 2026-11-27

- 新增 scripts/skill-cost.mjs：十个技能分别计量正文（加载成本）与 references（按需读取），
  给出字符 / 行数 / token 粗估并按正文排序；超 3000 字符点名，--json 供脚本消费。
- 现状：正文合计 19818 字符，references 10820 字符，全部在预算内。
- 用例 462。
## 0.63.1 — 2026-11-27

- 新增 test/skill-routing.test.mjs：技能目录与宪章路由表双向校验（提到的必须存在、存在的必须被路由），
  并校对 SKILL.md 的 name 与目录名、description 长度。
- 修掉孤儿技能：rd-selftest 一直没进路由，现接在「交付前自检」处；宪章 4983 字符仍在预算内。
- 用例 456。
## 0.63.0 — 2026-11-27

- 新增 scripts/tool-inventory.mjs：从源码抽实际注册的工具（defineTool 与 ctx.tools.register 两种写法），
  与 README 工具表、宪章 §7 对账，漏写点名并给补法；--strict 退出码 1。
- 新增 test/tool-inventory.test.mjs：两种写法抽取、不重复、真实仓库九个工具、文档漏写被点名。
- 用例 453。
## 0.62.2 — 2026-11-27

- 新增 test/brand.test.mjs：图标固定 16×16 且 currentColor、aria-hidden；包名 / 预设 / 侧栏入口三级命名
  各就各位；中英两侧不混用。
- docs/DESIGN.md 增「品牌」一节，写明三级命名与用色规则。
- 用例 447。
## 0.62.1 — 2026-11-27

- 入口页把 `/status` 的 root 与 version 组成 `context` 随 pageProps 传给每个成员页面。
- 记忆库在标题下显示「当前仓库：<路径>」，没有上下文时不显示空壳。
- 用例 443。
## 0.62.0 — 2026-11-27

- 入口页新增命令面板：Ctrl/Cmd+K 或点标题旁按钮打开，合并搜索页签与已装能力，
  上下键选择、回车执行、Esc 关闭；空结果给可读提示而不是空白面板。
- 面板用 dialog / listbox / option 角色并标 aria-selected，输入框带 aria-label。
- 用例 441。
## 0.61.5 — 2026-11-27

- 新增 test/focus-order.test.mjs：禁止正数 tabIndex（roving tabindex 放行）、容器 -1 / 条目 0 分工、
  记忆库可交互元素按「搜索 → 筛选 → 列表」出现。
- 用例 436。
## 0.61.4 — 2026-11-27

- 记忆库「过滤为空」补下一步动作（换关键词或点全部清筛选），中英同步。
- 新增 test/empty-states.test.mjs：空态必须说清原因并含动作提示词，整库为空与过滤为空不得用同一句话。
- 用例 432。
## 0.61.3 — 2026-11-27

- 记忆库两栏改为 minmax(min(240px, 100%), 34%) 1fr：窄容器左栏不再强行占 240px。
- 新增 test/narrow-layout.test.mjs：所有 grid 的像素下限必须被 min(…, 100%) 包住；概览保留 auto-fit。
- 用例 430。
## 0.61.2 — 2026-11-27

- 概览「已装能力」补「记忆库」一条（页签查看删除 + memory_save / memory_search 的分工），中英同步。
- 修掉「GitHub 流程：设置里开关」的过时表述——流程固定、没有开关；断言禁止再出现「开关」。
- 用例 427。
## 0.61.1 — 2026-11-27

- 新增 scripts/ci-parity.mjs：从 workflow 抽 run 命令（三种写法都认），核对构建 / 测试 / 全量门禁三项覆盖，
  --strict 缺项退出码 1。
- preflight 增加第八道门禁「CI 覆盖」，交付时就能发现 workflow 漏跑。
- 用例 426。
## 0.61.0 — 2026-11-27

- 新增插件配置 `auditMode`（fix | report）：report 时模块关闭只查不改，结果标 reportOnly。
- 新增 normalizeAuditMode：非法值回落到 fix 并记警告，不静默接受。
- 测试验证 report 模式下文件内容与 mtime 都不变（同一文件在 fix 模式下确实会被改写）。
- 用例 421。
## 0.60.1 — 2026-11-27

- 新增 scripts/git-net-check.mjs：检查 github 凭据助手 / credential.interactive / 代理 / TLS 后端四项，
  失败项给出可直接执行的修复命令；`--network` 再做 ls-remote 连通性测试。
- 修复本机 git：github 凭据改用 gh（不再弹 GCM 账户选择框）、github 走 127.0.0.1:7890 代理、
  后端由 schannel 换 openssl；fetch 与 push 均已实测通过，本地已对齐远端 56c5b3b。
- README 增「git 凭据与网络」症状对照表。用例 418。
## 0.60.0 — 2026-11-27

- 第 61–70 轮体检入账：用例到 412；技能体积榜首从 rd-retro 换成了 rd-ecosystem（2597 字符）；漂移与打包缺口仍为 0。
- 文档分数全线回升：README 90 / DESIGN 94 / DETAIL 100 / CHANGELOG 85。
- 0.60.0 由脚本推进：第 70 轮落在十的倍数上，这次 minor。

## 0.59.0 — 2026-11-27

- 新增 lib/retry.js：classifyFailure 依据错误码表判定 retry / degrade / stop 并给出建议，
  附 DEGRADE_PATHS（推送改走 API、建单未确认先查列表等）与 withRetry。
- mergePr 的重试改为调用 withRetry，重试逻辑只此一处，行为不变。
- 用例 412。
## 0.58.1 — 2026-11-27

- 新增 lib/tool-timing.js：记录每次工具调用的耗时与成败（环形保留 200 条样本），
  按工具汇总次数 / 均值 / 最大 / 失败数。
- 根插件在注册处包一层计时，对调用方完全透明；抛错也计入失败次数并照常向上抛。
- `/status` 载荷带最慢的前 5 个工具；没有样本时该字段不出现。
- 用例 403。
## 0.58.0 — 2026-11-27

- 新增 skills/rd-ecosystem/references/subagent-templates.md：代码审查 / 资料侦察 / 独立复核三个模板，
  每个含任务、输入、约束、返回四段；返回统一为结论 / 证据 / 未验证 / 建议四栏。
- 写明「子代理不共享上下文，简报必须自包含」，并列出模板里不该出现的模糊词。
- 新增 test/subagent-templates.test.mjs 校验四段与四栏齐全、模糊词黑名单生效。
- 用例 397。
## 0.57.2 — 2026-11-27

- 新增 OVERFLOW_POLICY 与 docs/OVERFLOW.md：五项上限各自说明超限后是截断 / 拒绝 / 分页，
  以及读的人会看到什么。
- 新增 test/overflow-policy.test.mjs：上限、策略、文档三处一一对应，并抽查了截断、分页与 413 拒绝三种行为。
- 用例 392。
## 0.57.1 — 2026-11-27

- 新增 lib/limits.js：命令输出字节 / HTTP 请求体 / 工具文本字符 / 列表条数 / 诊断字符五项上限集中定义，
  附 truncateText（截断后标明截掉多少）。
- github 的命令输出上限、code-pipeline 的请求体上限、记忆列表条数都改为引用同一份常量；
  github 保留原导出名以免破坏调用方。
- 用例 386。
## 0.57.0 — 2026-11-27

- 新增 skills/rd-ecosystem/references/run-code-examples.md：四个正例（批量读取汇总 / 扇出扫描合并 /
  筛选统计 / 带重试的串行写）与一个反例，说明什么问题不在语法而在「串行 + 全量回传」。
- 新增 test/run-code-examples.test.mjs：代码块语法可解析、引用的工具名必须在已注册清单内、
  文档必须写明「调用形状」与「以当轮工具列表为准」。
- 用例 380。
## 0.56.0 — 2026-11-27

- 新增 test/locale-parity.test.mjs：三个客户端模块的中英字典必须键集一致 / 嵌套子键一致 /
  数组条数一致 / 占位符集合一致 / 值不为空。
- 当前三份字典全部对齐，没有需要补的英文文案。
- 用例 375。
## 0.55.0 — 2026-11-27

- 新增 test/a11y.test.mjs：断言 tablist / tab / tabpanel 三件套与 id 对应、装饰性元素 aria-hidden、
  搜索框 aria-label、筛选按钮 aria-pressed、列表项 role=button 与 tabIndex、错误 alert 与提示 status。
- 断言当场抓到真缺陷：未挂载的页签仍写 `aria-controls`，指向不存在的面板 id。
  修复为「只在面板已挂载时写 aria-controls」。
- 用例 370。
## 0.54.1 — 2026-11-27

- AIGC 自检增加 `--fix-suggest`：每条命中给出文件 / 行号 / 命中内容 / 建议改法。
- 新增 CLICHE_REPLACEMENTS 替换表（26 个套话各有具体改法），结构痕迹复用规则 hint，
  重复片段建议改成斜杠清单。
- 用例 365。
## 0.54.0 — 2026-11-27

- 第 51–60 轮体检：362 个用例，宪章仍 4964 字符，最大技能 rd-retro 2461，漂移与缺口均为 0。
- 体检抓到 README 掉到 81 分：破折号与顿号并列过密 / 看板模板自带行首加粗标签。改文案并修正模板后回到 90 分（README 目前为四个文档中的次低分）。
- release.mjs 在第 60 轮把版本推到 0.54.0。

## 0.53.1 — 2026-11-27

- AIGC 自检增加 `--summary`：逐份分数加一行汇总（份数 / 均分 / 最低分与文件 / 低于阈值几份），
  实跑四份文档得到均分 90、最低 README 81。
- 新增 summarizeScores 纯函数，读不到的文件不计入统计。用例 362。
## 0.53.0 — 2026-11-27

- 新增 .github/workflows/checks.yml：push 与 PR 上跑构建、测试与 preflight 七项，Node 22 + pnpm。
- 新增 test/ci-workflow.test.mjs：断言 workflow 的测试命令与 package.json 的 test 脚本逐字一致、
  Node 版本与 engines.node 对齐、安装排在测试之前。
- package.json 补 engines.node >= 22。用例 359。
## 0.52.1 — 2026-11-27

- 新增 test/audit-idempotent.test.mjs：fix 跑两次第二次零改动 / report 与 fix 结论一致 /
  并发两次审计同一文件内容不截断 / 报告与改写混跑不失真 / 并发下缓存统计不超文件数。
- 用例 354。
## 0.52.0 — 2026-11-27

- 新增 code-pipeline/lib/history.js：每次模块审计追加一条记录（文件数 / 待修 / 已修 / 耗时 / 最慢目录），
  环形保留 50 条，原子写，文件损坏时降级为空历史。
- `/dsh-code-pipeline/api/status` 带上最近三条审计历史；侧栏概览状态区多一格「最近审计」。
- 用例 349。
## 0.51.2 — 2026-11-27

- 审计增加耗时统计：`elapsedMs` 与 `slowestGroup`（最慢目录及毫秒），按目录分组计时；
  修文件那一趟也计入总耗时。
- 顺手修掉变更日志自身的重复表述（顿号并列过多），分数从 79 回到 85。
- 用例 342。
## 0.51.1 — 2026-11-27

- 审计结果增加 `skipped`（含路径、原因码与中文解释）与 `reportOnly`：跳过不再只是「没被修」，
  而是「为什么没修」：不在预设语言范围、不是代码、引擎报错、结果不稳定、写入被拒等。
- 新增 `describeSkipReason` 与 `SKIP_REASONS` 表，未知原因原样返回。
- 用例 340。
## 0.51.0 — 2026-11-27

- 新增 scripts/doc-cmd-check.mjs：从代码块抽 `node scripts/...` 示例，校验脚本存在、参数在源码里有出处；
  含占位符的模板命令跳过参数校验但仍检查脚本是否存在。
- preflight 增加第七道门禁「文档示例」，示例失效直接挡住交付。
- 用例 338。
## 0.50.1 — 2026-11-27

- 新增 github/lib/gh-version.js：解析 `gh version x.y.z`，与建议的最低版本 2.30.0 比对；
  precheck 探测版本，过低或读不到只加 warning（说明 autoMergeRequest / statusCheckRollup 可能缺失），不阻断。
- 用例 332。
## 0.50.0 — 2026-11-27

- `open_pr` 在创建 PR 后，对每个关联 Issue 发一条评论回链 PR 链接（`PR #N：<url>`），
  并行推进时从 Issue 侧就能看到有人在做什么；新增 `linkIssues` 参数（默认 true）可关闭。
- 回链失败只记 warning，不影响「PR 已创建」这个事实；返回值带 `commentsPosted`。
- 用例 326。
## 0.49.0 — 2026-11-27

- 第 41–50 轮体检（第五次）：用例 324，宪章 4964 字符，最大技能 rd-retro 2461 / 
  无术语漂移、无打包缺口。
- 体检抓到 README 掉到 81 分（套话「最后」 / 箭头密集 / 一处行首加粗标签），改写后回到 88 分。
- 第 50 轮触发 minor，版本到 0.49.0，看板同步刷新。

## 0.48.2 — 2026-11-27

- 新增 scripts/board.mjs：README 进度块改为生成式，只替换 `rd-board` 标记之间的内容，幂等；
  标记缺失时原样返回并提示，不猜位置。
- README 增「迭代进度」一节并由脚本写入真实数据。
- 测试 +6，全量 324 条。
## 0.48.1 — 2026-11-27

- 新增 scripts/release.mjs：按「每 10 轮 minor、其余 patch」算下一版，patch 到 9 自动进位；
  `--write` 同时改 package.json 并在 CHANGELOG 顶部插入版本标题骨架，重复版本拒绝写入。
- 本轮版本由脚本自己推进：0.48.0 → 0.48.1。
- 测试 +8。

## 0.48.0 — 2026-11-27

- 新增 scripts/rollback-drill.mjs：临时仓库造两次提交，执行 `git revert` 后断言树回到上一状态、
  历史保留三条、新增文件被删除；步骤文案与演练共用一份，避免文档与实操两套说法。
- 协议文档加「回滚」一节：用 revert 不用 reset，先演练再动手。
- 用例 311。
## 0.47.0 — 2026-11-27

- 新增 github/lib/branch-name.js：解析与生成 `<type>/<issue>-<slug>`，并提供并行检查
  （非法名 / 重复名 / 同一 Issue 被多个分支共用）。
- prepareBranch 建分支或复用分支时对不合约定的名字给 warning（不阻断），提示改成可追溯的写法。
- 用例 307。
## 0.46.0 — 2026-11-27

- commit-msg 增加 `--issue <N>`：提交信息必须关闭正好该编号，关错或没有关闭关键词都算不合规。
- 新增 checkIssueLink 纯函数；多个编号里包含目标编号即可通过。
- 协议文档与 README 补用法。测试 +4，全量 300 条。
## 0.45.0 — 2026-11-27

- 新增 scripts/round-report.mjs：生成「做了什么 / 验证数据 / 正向判据 / 结论」四段报告，
  数字取自 collectHealth 与真实门禁运行，账本对应行自动带出。
- 门禁有失败时结论段直接写明「负面迭代不计入轮次」；账本缺该轮时给出补救命令。
- 协议文档加「每轮评估」一节。测试 +6，全量 296 条。
## 0.44.0 — 2026-11-27

- 新增 scripts/ledger.mjs：`--list [状态]` 查条目 / `--mark <编号> <状态> [--issue]` 只改目标行 / 
  `--append-round` 追加轮次（重复轮次与非法轮次拒绝）。
- 协议文档加「记账」一节：账本别手改，用命令改。
- 用在自身：`--mark 022 完成 --issue "#58"` 当场把本条目标为完成，待做 51 → 50 项。
- 测试 +6，全量 290 条。
## 0.43.0 — 2026-11-27

- 新增 scripts/resume.mjs：读账本给出已完成轮次、漏记检测（跳号即报）与下一条待做；
  协议文档加「开工前先跑 resume」。
- 首次运行暴露账本漂移：20 条实质已完成但状态仍写「待做」的条目已校正，待做从 71 项降到 51 项。
- 测试 +6，全量 284 条。
## 0.42.0 — 2026-11-27

- 新增 lib/error-codes.js：41 个错误码集中登记，每条给中文说明、retryable 标记与处理建议；
  附 describeErrorCode / retryableCodes / knownCodes 三个查询接口。
- 新增 test/error-codes.test.mjs：扫源码抽取错误码并断言全部登记（扫描当场补出 15 个漏登的码）。
- README 增「错误码」一节。测试 +5，全量 278 条。
## 0.41.1 — 2026-11-27

- 第 31–40 轮体检（第四次）：用例 273，宪章 4964 字符，最大技能 rd-retro 2461 / 
  文档最低 85 分 / 无术语漂移 / 无打包缺口。
## 0.41.0 — 2026-11-27

- preflight 增加第六道门禁「流程演练」：调用 flow-drill，七步全过才算通过，失败时点名具体步骤。
- CHECKLIST 与 README 从五道改成六道；preflight 测试同步更新为六项。
- 全量 273 条用例保持通过。
## 0.40.0 — 2026-11-27

- 新增 scripts/flow-drill.mjs：内置有状态的假 git/gh 执行器，按顺序跑 precheck → create_issue →
  prepare_branch → open_pr → pr_status → merge_pr → close_issue，并断言跨步骤契约
  （PR 正文自动带关闭关键词 / 合并用 squash 且删分支 / 关闭后状态为 CLOSED）。
- 测试 +4，全量 273 条。
## 0.39.0 — 2026-11-27

- 新增 memory/fixtures/recall-cases.json（八条记忆、十条查询）与 scripts/memory-recall.mjs：
  跑 searchEntries 给出 top1 准确率与 MRR，低于 80% 退出码 1。
- 实测 top1 100%、MRR 1.000。
- 测试 +5，全量 269 条。
## 0.38.0 — 2026-11-27

- 新增 scripts/preflight.mjs：一条命令跑五道交付门禁（文档分数 ≥80 / 跨文件重复 / 术语一致 / 
  打包校验、安装冒烟），任一项失败整体退出码 1，支持 --json。
- CHECKLIST 与 README 接上这条命令，交付前不必再逐个脚本记得跑。
- 测试 +5，全量 264 条。
## 0.37.0 — 2026-11-27

- 记忆库面板支持键盘：上下键移动光标（自动滚动到可见） / Enter 打开 / Esc 关闭详情 / 斜杠聚焦搜索。
- 键盘光标与已打开条目分开记录：光标用描边、打开态用底色，两者可同时存在。
- 测试 +2，全量 259 条。
## 0.36.0 — 2026-11-27

- `/stats` 增加命中分布：unused（从未命中的条数） / topHits（命中前 5） / hitless（从未命中的前 5 条）。
- 记忆库面板显示「其中 N 条从未被检索过：…」，给删除或补充提供依据。
- 测试 +1（含空库时两个数组不出现），全量 257 条。
## 0.35.0 — 2026-11-27

- 新增 `POST /dsh-rd-memory/api/forget?id=<id>`：复用同一信任闸门，非 POST 返回 405，
  缺 id 400、找不到 404，成功后落盘并返回剩余条数。
- 记忆库面板详情区加「删除」：第一次点击切到确认态，第二次才真的删；成功后刷新列表。
- 测试 +3，其中删除用例覆盖落盘结果与方法校验，全量 256 条。
## 0.34.0 — 2026-11-27

- 新增 docs/glossary.json 与 scripts/term-check.mjs：词表写「canonical ← variants」，脚本逐个变体
  定位到文件与行号并给出应改成的写法；默认四条规则覆盖研发模式 / 长期记忆 / 固定流程 / 代码审计。
- 本仓库 8 个文档与技能文件实测零命中。
- 补了 6 个用例，全量 254 条。
## 0.33.0 — 2026-11-27

- `/dsh-rd-memory/api/stats` 增加 limit（配置上限）与 usage（0–1 用量）；没配上限时两者不出现。
- 记忆库面板挂载时读一次 stats，用量达 80% 在标题下提示「已用 x/y，再写入会淘汰旧条目」。
- 补了 2 个用例，全量 248 条。
## 0.32.0 — 2026-11-27

- 体检脚本新增 `--row`：直接输出可粘贴进 docs/CHECKLIST.md 的台账行，轮次区间由账本最大轮次推导。
- 第 21–30 行已按实测填入：宪章 4964 / 用例 243 / 最大技能 rd-retro 2461 / 无漂移 / 无打包缺口。
- 本轮用例 +3，累计 246。
## 0.31.0 — 2026-11-27

- 新增 scripts/smoke-install.mjs：按 package.json files[] 把包内容复制到仓库内临时副本，
  动态 import 副本的 index.js 并用最小假 ctx 调 apply()，断言工具与路由都注册上；
  同时校验 cordis.patch.yml 引用的成员在副本里存在，跑完清理副本。
- 冒烟顺带记录了插件真正依赖的宿主能力：subprocess / systemPrompt.section / events / workingDirectory。
- 实测：104 个文件 / 9 个工具 / 8 条路由，通过。
- 测试新增 4 条，总数 243。
## 0.30.0 — 2026-11-27

- 声明 `engines.dsh: >=0.2.2-rc.5`；打包校验把缺失 engines 从提示升级为问题，并新增范围匹配校验。
- 新增语义化版本比较（预发布小于同版本正式版）与范围解析（`>=` `>` `=` `^` `~` 与裸版本）。
- 实测抓到自己的错：初版写成 `>=0.2.2`，而当前安装是 `0.2.2-rc.5`，校验直接判不满足。
- 用例 3 条进账，现 239 条。
## 0.29.0 — 2026-11-27

- 新增 scripts/verify-package.mjs 四项校验：files[] 是否覆盖随包目录与文件、每个技能是否有
  name/description frontmatter / cordis.patch.yml 引用的成员目录是否存在 / client.js 是否比源码新。
- 自用结果：本仓库通过（1 条提示：没有声明 engines.dsh）。
- 补了 6 个用例，全量 236。
## 0.28.0 — 2026-11-27

- 新增 `/dsh-code-pipeline/api/status`：读工作区的 package.json 版本、docs/ITERATIONS.md 的
  账本轮次与行数、CHANGELOG 最新版本；文件缺失时字段缺省并记 warning。
- 侧栏概览新增「当前状态」四格：插件版本 / 已迭代轮次 / 账本行数 / 最新变更；
  拿不到数据时整块不显示，避免空壳。
- 新增 test/status.test.mjs（5 例）与概览渲染断言（1 例）；全量 230/230。
## 0.27.0 — 2026-11-27

- 新增 scripts/dup-check.mjs：按空行切段（跳过标题 / 列表 / 引用 / 代码块），归一化后跨文件比对，
  同一段落出现在两处即报，输出所在文件与行号；有重复时退出码 1。
- rd-copy 的降重一节接上脚本用法；README 工具表补一行。
- 自用结果：README + DESIGN + DETAIL 三份文档无重复段落。
- 本轮用例 +6，累计 224。
## 0.26.0 — 2026-11-27

- AIGC 自检补六条英文规则：not-just-but / fast-paced 开场 / dive-in / heres-the-thing / 
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
- 测试新增 2 条，总数 214。
## 0.23.0 — 2026-11-27

- 宪章交付报告模板新增「**审计**」一行：抄 `codeAuditChecked / Fixed / Remaining` 与按语言摘要，
  没跑审计要写「未运行：原因」。
- 新增 `test/charter.test.mjs`（6 例）守住宪章结构：九节标题 / S1–S8 与两道关卡 / 报告五行 / 
  记忆与 GitHub 流程时机 / 占位符只有 model / 体积 ≤ 5000 字符。
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
- 用例 3 条进账，现 197 条。
## 0.19.1 — 2026-11-27

- `precheck` 用 `git rev-list --left-right --count HEAD...origin/<branch>` 给出 `ahead` / `behind` / `diverged`；
  分叉时 guidance 直接给 rebase 步骤（fetch → rebase → 逐个解决冲突 → `git rebase --continue`），
  落后时提示先 pull，读不到远端分支时字段缺省且不影响预检通过。
- result-schema 声明三个字段；新增 1 例测试覆盖领先/落后/分叉/读不到四种情形；全量 194/194。
## 0.19.0 — 2026-11-27

- 新增 `github/lib/release-check.js`：tag 规范化（去 v 前缀与构建后缀） / 与 package.json 版本比对 / 
  校验 CHANGELOG 是否有对应版本标题（行内提及不算）。
- `release` 发布前做校验，不一致直接返回 `RELEASE_INCONSISTENT` 且不调用 `gh release create`；
  读不到文件时记 warning 并跳过该项，新增 `verify` 参数（默认 true）。
- 新增 8 例纯函数测试与 1 例集成测试；全量 193/193。
## 0.18.0 — 2026-11-27

- Issue 正文改为七段固定模板：现象 / 复现 / 影响 / 受影响文件 / 验收标准 / 计划 / 环境，
  缺的段落给「待补充」占位而不是空标题；`create_issue` 新增 `repro` 与 `acceptance` 参数。
- 标签兜底：创建 Issue 前对每个标签跑 `gh label create --force`，建失败的标签不再传给
  `issue create`（避免整条命令失败），结果里给 `labelsEnsured` 与 `warnings`。
- 补了 3 个用例，全量 185。
## 0.17.1 — 2026-11-27

- `merge_pr` 对瞬时失败（超时 / 连接重置 / 5xx / 限流）重试一次，永久失败不重试；
  重试过会在 guidance 里注明。
- `auto` 模式用 `gh pr view --json autoMergeRequest` 确认是否真的排队，结果带 `autoQueued`。
- result-schema 增加 `autoQueued`；本轮用例 +2，累计 182。
## 0.17.0 — 2026-11-27

- `open_pr` 新增 `issues` 数组：一个 PR 收口多个模块时，为每个编号补一行 `Closes #N`，
  正文里已有的不重复补，重复编号只写一次（支持数字与 issue URL）。
- 工具定义同步加 `issues` 参数；测试新增 1 条，总数 180。
## 0.16.1 — 2026-11-27

- `precheck` 增加三项：`recentCommits`（最近 5 条 `短sha 标题`）、
  `requiredReviews`（必需审批数）、`requiredChecks`（必需通过的检查名，最多 10 个）；
  后两项只在保护开启且 gh 返回结构化字段时出现。
- 用途：模型不必再为「要几个审批 / 哪些检查必须绿 / 最近有没有同类改动」多跑命令。
- result-schema 声明三个字段；用例 1 条进账，现 179 条。
## 0.16.0 — 2026-11-27

- 新增 `scripts/health.mjs`：宪章字符数 / 技能数量与最大体积 / 测试文件与用例数 / 
  文档 AIGC 分数 / 打包缺口 / 术语漂移六项指标；`--json` 与 `--fail-on-drift` 可当门禁。
- 新增 `docs/CHECKLIST.md`：脚本覆盖的六项 + 需要人看的四项（术语一致 / 文档与代码一致 / 
  测试耗时、宪章趋势），并留十轮台账。
- 首跑修掉 5 处术语漂移：README 行 id 说明、rd-code-standards 里「开启 issue-first 设置」
  等过时表述；术语表同时去掉与界面标签「代码修正」冲突的条目。
- 新增 `test/health.test.mjs`（4 例）；全量 178/178。
## 0.15.1 — 2026-11-27

- `pr_status` 除计数外给出 `failingChecks` 与 `pendingChecks` 名单（各最多 10 条），
  guidance 里直接点名失败的检查；全部通过时不返回这两个字段。
- 检查项名字取 name / context / title，取不到用 `check-N` 兜底。
- 补了 2 个用例，全量 174。
## 0.15.0 — 2026-11-27

- 宪章接上长期记忆：S8 沉淀改为先 `memory_save`（四类 + 现象/根因/做法/验证/边界），
  §7 增 `memory_*` 用法，§4 路由要求开工前先 `memory_search`。
- rd-retro 收集阶段先查记忆，已有踩坑与策略不重复提案；
  rd-spec 新增「先找现成做法」，写 plan 前搜 `type=template`。
- 宪章 4,872 字符（仍只有一个 model 占位符）；skills 测试新增接线断言；全量 173/173。
## 0.14.1 — 2026-11-27

- 容量上限改为可解释的淘汰：`retentionScore = hits×10 + 最近 30 天加成 + revisions`，
  超限时按分数淘汰 / 同分先丢更早更新的 / 再按 id 稳定排序；
  原来只按 hits 排序截断，hits 都为 0 时等于随机丢弃。
- `evictEntries` 抽成纯函数并接到 `openStore.flush`；非法上限按「不淘汰」处理。
- 新增 `test/memory-evict.test.mjs`（6 例）；全量 172/172。
## 0.14.0 — 2026-11-27

- 新增 `memory_export`（整库导出到 JSON）与 `memory_import`（从文件或内联数组导入）。
- 合并语义（`memory/lib/merge.js`）：按类型 + 归一化标题对齐，正文取 updatedAt 较新者，
  标签取并集 / hits 取较大值 / revisions 累加 / 保留较早的 createdAt；
  `replace` 模式整库替换并统计丢弃数。
- 非法条目（缺 type/title、null）在合并前被过滤；读取或写入失败时明确报错且不改库。
- 新增 `test/memory-import.test.mjs`（6 例，含导出后再导入的往返一致）；全量 166/166。
## 0.13.0 — 2026-11-27

- 新增侧栏「记忆库」标页：搜索框 / 类型筛选 / 条目列表（标题 + 类型 + 命中次数） / 
  详情面板（全文 / 更新时间 / 复制正文），空库/过滤为空/读取失败/未授权四种状态都有文案。
- 数据来自只读路由；页面在 hub 的标签里渲染，与「概览」「代码修正」并列。
- 新增 test/memory-page.test.mjs（4 例）；全量 160/160；client.js 4 个 surface。
## 0.12.0 — 2026-11-27

- 新增记忆库只读 HTTP 路由：`/dsh-rd-memory/api/list`（支持 q/type/tag/分页）、
  `/entry`（读全文并累加命中） / `/stats`（按类型计数与最近更新时间） / 
  `/export`（整库导出）。
- 信任判定复用 code-pipeline 的 `createRequestGuard`：没有 Connection 服务的部署
  返回 503，未通过闸门返回 401，面板不会拿到数据。
- 新增 `test/memory-routes.test.mjs`（5 例）；全量 156/156。
## 0.11.0 — 2026-11-27

- 新增 `memory_search`：中文按整串 + 二元组分词，标题 6 / 标签 4 / 正文 2 / 范围 1 加权，
  返回分数与命中片段；被检索到的条目累加 hits，同分时按 hits 与更新时间排序。
- 新增 `memory_read`：按 id 读全文并计入一次命中。
- 协议补三条硬规则：fetch 未成功不要 reset / 推送后不要再 amend / 临时文件不进提交。
## 0.10.1 — 2026-11-27

- 新增推送回退通道：`scripts/push-via-api.mjs` 在 `git push` 的 POST 被掐断时，
  用 Git Data API 上传 blob / 建树 / 建提交并快进 ref；`--dry-run` 先看计划，
  非快进一律拒绝。
- 纯逻辑拆到 `scripts/lib/push-plan.mjs`（解析 / 建树 / 快进校验 / 改动分类），
  由 `test/push-api.test.mjs` 覆盖。
- 协议补「推送失败时的回退」五步；账本 026 完成。
## 0.10.0 — 2026-11-27

- 新增长期记忆模块 `memory/`：技术模板 / 踩坑 / bug 修复方案 / 策略模式四类，
  存 `~/.dsh/rd-suite/memory.json`（可配置目录与条目上限），原子写、同标题合并。
- 新增 `memory_save`（按类型写入，返回 created/updated 与 id）与 `memory_list`
  （类型/标签过滤 / 分页 / 摘要）两个工具，融进融合插件由根 `index.js` 组合。
- 打包清单加入 `memory`，packaging 测试改为遍历全部运行时目录，新增模块
  不会再漏出包。
- 新增 `test/memory-store.test.mjs`（10 例）；全量 136/136。
## 0.9.1 — 2026-11-27

- 修复打包清单：files 补上 scripts，按包安装后 repo-map / secret-scan / 
  commit-msg / aigc-check / build-client 都在（#15）。
- 新增 test/packaging.test.mjs：断言 files 覆盖全部运行时脚本 / 技能目录 / 
  成员实现与文档；npm pack --dry-run 现为 91 个文件、230 kB（#15）。
## 0.9.0 — 2026-11-27

- 新增 rd-spec 技能与 spec/plan/tasks 三份模板（仿 spec-kit）：
  产物写到 specs/<NNN>-<slug>/，配 clarify（≤3 问） / analyze（AC 与任务交叉核对） / 
  checklist（开工前五问）、converge（收尾回填证据）四个动作（#14）。
- rd-copy 增加结构型痕迹一节（对举句式 / 三连并列 / 破折号泛滥 / 
  行首加粗标签 / 拔高收尾 / 聊天残留），并给出改写口径（#14）。
- aigc-check 增加五类结构检测与破折号密度；并列铺陈按弱信号处理，
  列表 / 表格 / 引用行内的顿号不计入，扣分有上限（#14）。
- 宪章 §4 把 L3 与歧义需求的规格产物路由到 rd-spec（#14）。
- 全量 118/118；本仓库文档在新检测器下分别为 100/94/90/91 分（#14）。
## 0.8.0 — 2026-11-27

- 新增 `scripts/secret-scan.mjs`（仿 gitleaks）：厂商前缀 / 私钥块 / 键名 + 凭据值三类规则，
  命中只输出打码片段；`--staged` 扫暂存区，命中返回 1，占位符与 `process.env` 不误报（#13）。
- 新增 `scripts/commit-msg.mjs`（仿 commitlint + release-please）：校验类型白名单、header
  长度、空行与正文行宽，推导 semver 级别并给出 CHANGELOG 条目草稿（#13）。
- 宪章 S5 要求交付前跑 secret-scan；GitHub 流程提示词 G3 加 commit-msg 校验、G7 说明
  按提交类型推导版本级别（#13）。
- 新增 `test/gates.test.mjs`（7 例：命中与打码 / 占位符豁免 / CLI 退出码 / 提交信息四类
  违规 / 破坏性变更 / CHANGELOG 分组）；全量 115/115（#13）。
## 0.7.0 — 2026-11-27

- 新增 `scripts/repo-map.mjs`（仿 Aider 的 repo map）：输出「文件 + 顶层符号 + 行数」的仓库骨架，支持 `--budget`/`--depth`/`--json`，跳过依赖与构建目录，并只采模块级变量与 .md 标题（#12）。
- 宪章 S2 侦察要求陌生仓库先跑 repo-map 拿骨架再读行段（#12）。
- 新增 `docs/REFERENCES.md`：记录这次调研的高星项目 / 取用的点 / 没取用的点与理由，以及「零依赖 / 只借做法」的判断标准（#12）。
- 新增 `test/repo-map.test.mjs`（符号提取 / 忽略目录 / 预算截断 / 渲染 / CLI）；全量 108/108（#12）。
## 0.6.0 — 2026-11-27

- 新增 rd-copy 技能：去 AI 味（禁用词表 / 句长节奏 / 结论先行 / 具体依据） / AIGC 自检（脚本 + 三项人工复核） / 降重（换视角/换结构/换例子/换粒度，8 汉字或 4 英文词重复不超过 1 处）（#10）。
- 新增 `scripts/aigc-check.mjs`：零依赖启发式扫描，输出 0–100 人味分 / 套话/连接词/英文词藻/模板开头/重复片段/句长变异系数，支持 `--json` 与 `--min-score`；散文外内容（代码块 / 行内代码 / 链接）不计入重复（#10）。
- 宪章 §4 把文案与文档路由到 rd-copy 并要求交付前跑到 80 分；入口页能力卡新增「文案质检」（#10）。
- 新增 `test/aigc-check.test.mjs` 与 `test/skills.test.mjs`：前者验证套话识别 / 分数差距 / 重复片段与 CLI 退出码，后者固定 frontmatter / 150 字描述 / 6000 字符正文与 scripts/ 引用存在的约束（#10）。
## 0.5.0 — 2026-11-27

- 代码修正从「手动面板」变成固定流程的两层自动行为：写文件即格式化；每个模块关闭时对本次改动整体审计，`checked/fixed/remaining/files` 直接进 `github_workflow` 的 close_issue 结果（#11）。
- 新增 `code-pipeline/lib/audit.js`（report → fix → 幂等复查），`test/audit.test.mjs` 用真实临时文件验证改写 / 幂等 / report 不写盘与空输入（#11）。
- 去掉 `autoCodeFix` 开关的实际门控（字段保留仅为兼容旧 profile），宪章 S5 要求把审计数字抄进验收表，§7 的代码工具说明改为「面板只作复查」（#11）。

## 0.4.0 — 2026-11-27

- GitHub 流程改为模式固定流程，不再是设置开关：删掉设置 → 通用里的开关行与成员包的 client 半，提示词与工具常驻（#9）。
- `github_workflow` 从 3 个动作扩到 8 个：precheck（新增 strategy / defaultBranch / protection / ruleset 判定） / create_issue / prepare_branch / open_pr / pr_status / merge_pr / close_issue / release；范式按 GitHub 官方文档的 flow / 关闭关键词与受保护分支约定编写（#9）。
- 入口页新增「GitHub 固定流程」G0–G7 区块；docs/DESIGN.md 新增该流程的说明与出处（#9）。

## 0.3.0 — 2026-11-27

- 研发模式成为官方 `ptc` 预设的超集：挂 `tool-executor-ptc`（`run_code` 程序化调用，`maxSubCallsPerMinute 512` / `maxParallelSubCalls 8`），补 `tool-schedule` 与 `tool-subagent-fork`（#6）。
- 宪章 prefix 从 5,238 字符压到 4,010（−23%），新增 §5.9 PTC 执行纪律与 §7 `schedule_*` 使用约束；61 条规则要点逐条保留（#6）。
- 收紧单次输出：工具结果剪裁 6144/3072/768，网页抓取上限 80000 → 60000（#6）。
- 侧栏入口页重排：状态带 → 三步开始 → S1–S8 流水线（标关卡）→ 分级与关卡 → 能力 → 折叠的差异对比；统一字号与间距刻度 / 限宽 1040px / 窄主区单列；标签栏补 aria 关联与方向键漫游；成员页面按需挂载并保留状态；代码修正页内嵌时不再重复标题（#7）。
- 新增 `test/hub-client.test.mjs`（5 个用例）与 `npm run build` / `npm test` 脚本（#7）。
- 删除旧研发模式工作区与仓内 `rd-mode/` 历史目录（36 文件），修正 rd-retro / rd-selftest / rd-ecosystem 里指向已不存在脚本的引用；成员包去掉失效的 `./client` 导出与 `client.js` 声明，删掉过期的 `client-sim` 用例，全量测试 78/78 通过（#8）。
- 新增 `docs/DESIGN.md` 与本次日志。

## 0.2.0 — 2026-11-27

- 融合为一个插件主体：代码标准化 + GitHub Issue 流程 + 合并浏览器模块（#2、#1）。
- 三个研发预设合并为唯一「研发模式」，侦察与验收改为流程内的子代理角色（#2）。
- 入口页新增模式说明，代码修正页迁移为页内标签（#3、#4）。
- 写文件后自动按项目规范格式化（`autoCodeFix`）（#5）。

## 0.1.0 — 2026-11-19

- 仓库建立：研发模式预设 / 领域技能 / 设计文档。
