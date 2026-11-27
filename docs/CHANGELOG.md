# 变更日志

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
