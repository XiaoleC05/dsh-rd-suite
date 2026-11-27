# 迭代账本（100 轮）

协议见 [ITERATION.md](ITERATION.md)。「提交」列填 Issue 号，用 `git log --grep "#16"` 可定位提交。
状态：待做 / 进行中 / 完成 / 重做 / 取消。

## M1 记忆与沉淀（长期记忆是这一轮的主线）

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 001 | 记忆存储骨架：路径、schema、读写、原子写 | 完成 | #17 |
| 002 | `memory_save` 工具：按类型写入并返回 id | 完成 | #17 |
| 003 | `memory_search`：关键词 + 标签 + 类型过滤 | 完成 | #19 |
| 004 | `memory_list`：分页与摘要 | 完成 | #17 |
| 005 | 同键去重与合并：同标题更新而非新增 | 完成 | #17 |
| 006 | 类型字段：技术模板（template）的结构与渲染 | 完成 | #17 |
| 007 | 类型字段：踩坑（pitfall），含现象/根因/规避 | 完成 | #17 |
| 008 | 类型字段：bug 修复（fix），含复现/修复/回归 | 完成 | #17 |
| 009 | 类型字段：策略模式（strategy），含适用/取舍 | 完成 | #17 |
| 010 | 自动沉淀契约：模块关闭时提示写入记忆 | 完成 | #24 |
| 011 | 宿主 HTTP 路由：列表、详情、统计、导出 | 完成 | #20 |
| 012 | 侧栏记忆面板：列表与筛选 | 完成 | #21 |
| 013 | 侧栏记忆面板：详情与复制（删除待做） | 完成 | #21 |
| 014 | 导入导出 JSON（合并与覆盖） | 完成 | #22 |
| 015 | 容量上限与淘汰（按命中与时间） | 完成 | #23 |
| 016 | 命中计数与检索排序加权 | 完成 | #19 |
| 017 | rd-retro 联动：复盘先读记忆 | 完成 | #24 |
| 018 | rd-spec 联动：规格模板复用记忆 | 完成 | #24 |
| 019 | 宪章路由：何时写、何时读、写什么 | 完成 | #24 |
| 020 | 记忆模块测试与用户文档 | 完成 | #46 |

## M2 迭代与流程

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 021 | 每 10 轮横向检查清单 | 完成 | #26 |
| 022 | 账本更新脚本（--mark 编号 状态） | 完成 | #58 |
| 023 | 单轮评估报告模板（证据四段） | 完成 | #59 |
| 024 | Issue 内容模板（症状/范围/AC/计划） | 完成 | #30 |
| 025 | commit-msg 增加 `--issue N` 关联校验 | 完成 | #60 |
| 026 | 推送前远端检查 + 推送回退通道（Git Data API） | 完成 | #18 |
| 027 | 多模块并行的分支命名与合并策略 | 完成 | #61 |
| 028 | 发布节奏：每 10 轮一个 minor | 完成 | #63 |
| 029 | 回滚演练脚本（按迭代回退） | 完成 | #62 |
| 030 | 迭代看板摘要（供 README 引用） | 完成 | #64 |

## M3 GitHub 流程

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 031 | precheck 增加最近提交与保护细节 | 完成 | #27 |
| 032 | open_pr 支持关联多个 Issue | 完成 | #28 |
| 033 | pr_status 输出失败检查项名单 | 完成 | #25 |
| 034 | merge_pr 的 auto 与失败重试 | 完成 | #29 |
| 035 | release 校验 tag 与 CHANGELOG 一致 | 完成 | #31 |
| 036 | Issue 模板与标签兜底创建 | 完成 | #30 |
| 037 | PR 与 Issue 双向提示 | 完成 | #66 |
| 038 | 远端分叉时提示 rebase 步骤 | 完成 | #32 |
| 039 | gh 版本兼容检查 | 完成 | #67 |
| 040 | 流程文档补真实命令示例 | 完成 | #68 |

## M4 代码审计

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 041 | 审计结果按语言分组 | 完成 | #33 |
| 042 | 只报告模式的独立开关 | 完成 | #87 |
| 043 | 无法格式化的文件给出原因分类 | 完成 | #69 |
| 044 | 只审 git 改动文件 | 完成 | #34 |
| 045 | 审计耗时统计 | 完成 | #70 |
| 046 | 未变化文件跳过（缓存） | 完成 | #35 |
| 047 | 面板展示审计历史 | 完成 | #71 |
| 048 | 审计结果进交付报告模板 | 完成 | #36 |
| 049 | 有 CI 时对齐 CI 命令 | 完成 | #88 |
| 050 | 审计幂等与并发回归测试 | 完成 | #72 |

## M5 文案与 AIGC

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 051 | 词表可配置（项目自定义禁用词） | 完成 | #37 |
| 052 | 英文文案专用规则 | 完成 | #39 |
| 053 | 跨文件重复检测 | 完成 | #40 |
| 054 | 多文件分数汇总报告 | 完成 | #74 |
| 055 | 与 rd-web 的文案分工细化 | 完成 | #51 |
| 056 | `--fix-suggest` 给出改写建议 | 完成 | #76 |
| 057 | 术语一致性检查 | 完成 | #47 |
| 058 | 文案检查纳入 CI | 完成 | #73 |

## M6 入口页与侧栏

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 059 | 概览骨架改为数据驱动 | 完成 | #41 |
| 060 | 记忆面板与概览导航一致 | 完成 | #89 |
| 061 | 窄屏布局二次校验 | 完成 | #90 |
| 062 | 键盘焦点顺序 | 完成 | #92 |
| 063 | 深色主题对比度 | 完成 | #46 |
| 064 | 空状态与加载态统一 | 完成 | #91 |
| 065 | 错误边界：单面板崩溃不拖垮整页 | 完成 | #38 |
| 066 | 命令面板（搜索与跳转） | 完成 | #93 |
| 067 | 面板间共享上下文（仓库/Issue） | 完成 | #94 |
| 068 | 图标与品牌一致性 | 完成 | #95 |
| 069 | 英文文案同步率补全 | 完成 | #78 |
| 070 | aria 断言类可访问性测试 | 完成 | #77 |
| 071 | 锚点与滚动位置记忆 | 完成 | #42 |
| 072 | 侧栏图标顺序与分组 | 完成 | #44 |

## M7 工具与 PTC

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 073 | 工具清单核对与冗余清理 | 完成 | #96 |
| 074 | run_code 示例库 | 完成 | #79 |
| 075 | 工具输出体积上限统一 | 完成 | #80 |
| 076 | 溢出策略说明与验证 | 完成 | #81 |
| 077 | 子代理 prompt 模板库 | 完成 | #82 |
| 078 | 子代理返回格式统一 | 完成 | #82 |
| 079 | 工具失败重试与降级 | 完成 | #84 |
| 080 | 工具耗时统计 | 完成 | #83 |
| 081 | 工具描述瘦身（token） | 完成 | #49 |
| 082 | MCP 与内置工具重叠清理 | 完成 | #52 |

## M8 技能体系

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 083 | 技能目录描述与路由表一致 | 完成 | #97 |
| 084 | 技能体积与加载成本统计 | 待做 | |
| 085 | 按使用频率新增/合并技能 | 待做 | |
| 086 | 技能示例库（before/after） | 待做 | |
| 087 | 技能版本与变更记录 | 待做 | |
| 088 | 引用完整性检查强化 | 待做 | |
| 089 | 技能与宪章分工复查 | 待做 | |
| 090 | 技能命中率观测 | 待做 | |

## M9 宪章与思维链

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 091 | 宪章压到 4200 字符且规则不减 | 完成 | #53 |
| 092 | 分级判定示例库 | 完成 | #56 |
| 093 | 规格卡与 rd-spec 对齐 | 待做 | |
| 094 | 报告模板对齐审计与记忆字段 | 待做 | |
| 095 | 失败复盘模板（pitfall 格式） | 待做 | |
| 096 | 思维链审查：清除无证据断言 | 待做 | |

## M10 打包与发布

| 编号 | 目标 | 状态 | 提交 |
|---|---|---|---|
| 097 | 打包清单测试随新增脚本自动覆盖 | 待做 | |
| 098 | 版本号与 CHANGELOG 一致性脚本 | 完成 | #31 |
| 099 | 面向用户的发布说明模板 | 待做 | |
| 100 | 仓库结构与 README 全面复核 | 待做 | |

## 已完成

| 轮次 | Issue | 模块 | 结论 |
|---|---|---|---|
| 第 1 轮 | #16 | iteration-protocol | 九阶段协议 + 100 条账本；5 例测试断言协议与账本结构 |
| 第 2 轮 | #17 | memory-core | 记忆库 v1（原子写、同标题合并）+ memory_save / memory_list；10 例测试 |
| 第 3 轮 | #18 | push-fallback | 快进校验 + Git Data API 推送回退（--dry-run/--json）；4 例纯逻辑测试 |
| 第 4 轮 | #19 | memory-search（补记：漏建单） | 中文分词（整串 + 二元组）、四段加权、片段截取、命中累加与同分排序；memory_search / memory_read；8 例测试 |
| 第 5 轮 | #20 | memory-routes | 四个只读路由（list/entry/stats/export），复用 code-pipeline 的信任闸门；5 例测试 |
| 第 6 轮 | #21 | memory-panel | 侧栏「记忆库」标页：搜索、类型筛选、列表、详情与复制；4 例渲染测试 |
| 第 7 轮 | #22 | memory-import | merge（取较新正文、标签并集、hits 取大、revisions 累加）与 replace 两种导入、导出工具；6 例测试 |
| 第 8 轮 | #23 | memory-evict | 保留分 = hits×10 + 30 天内加成 + revisions；超限按分数淘汰、同分先丢更早的；6 例测试 |
| 第 9 轮 | #24 | memory-workflow | 宪章 S8/§7/§4 与 rd-retro、rd-spec 接上 memory_*；新增 1 例接线测试 |
| 第 10 轮 | #25 | pr-checks | pr_status 给出 failingChecks / pendingChecks 名单并在 guidance 点名；2 例测试 |
| 第 11 轮 | #26 | health-check | scripts/health.mjs 六项指标 + docs/CHECKLIST.md 四项人工项；首跑修掉 5 处术语漂移；4 例测试 |
| 第 12 轮 | #27 | precheck-details | precheck 增加 requiredReviews / requiredChecks / recentCommits；1 例测试 |
| 第 13 轮 | #28 | multi-issue-pr | open_pr 支持 issues 数组，逐个补 Closes 且去重；1 例测试 |
| 第 14 轮 | #29 | merge-retry | 瞬时失败重试一次、永久失败不重试、auto 排队确认；2 例测试 |
| 第 15 轮 | #30 | issue-template | 七段固定模板（缺段给占位）+ 标签兜底创建与 warning；3 例测试 |
| 第 16 轮 | #31 | release-check | 发版前校验版本号与 CHANGELOG 标题，不一致拒绝发布；8 例纯函数测试 + 1 例集成 |
| 第 17 轮 | #32 | divergence-hint | precheck 给出 ahead/behind/diverged 并在分叉时给 rebase 步骤；1 例测试（四种情形） |
| 第 18 轮 | #33 | audit-grouping | auditFiles 返回 byLanguage 与一行摘要，close_issue 带 codeAuditByLanguage；3 例测试 |
| 第 19 轮 | #34 | audit-changed | parseGitStatus / changedPaths / auditChanged + scripts/audit-changed.mjs；5 例测试 |
| 第 20 轮 | #35 | audit-cache | 按 mtime+size 的进程内缓存，只缓存干净判定；5 例测试 |
| 第 21 轮 | #36 | charter-audit-line | 报告模板加审计行 + test/charter.test.mjs 六项结构守卫 |
| 第 22 轮 | #37 | copy-banned-words | analyze 支持 extraCliches，CLI 加 --banned（换行或 JSON 词表）；2 例测试 |
| 第 23 轮 | #38 | panel-error-boundary | 每个 pane 包一层 PanelBoundary（getDerivedStateFromError + 重试），无 Component 时退化；2 例测试 |
| 第 24 轮 | #39 | copy-english-rules | 六条英文 AI 腔规则（含破折号密度）+ rd-copy 英文小节；2 例测试 |
| 第 25 轮 | #40 | dup-check | splitParagraphs / normalizeParagraph / findDuplicates + 命令行；6 例测试 |
| 第 26 轮 | #41 | overview-status | /api/status 读版本与账本轮次，概览显示四个真实指标；6 例测试 |
| 第 27 轮 | #42 | verify-package | files/技能 frontmatter/成员目录/client 新鲜度四项校验；6 例测试 |
| 第 28 轮 | #43 | engines-declaration | 声明 engines.dsh 并让校验必填 + 语义化版本比较；3 例测试 |
| 第 29 轮 | #44 | smoke-install | 按 files[] 复制到临时副本并真加载，断言 9 工具 8 路由；4 例测试 |
| 第 30 轮 | #45 | health-row | health --row 直出台账行 + roundWindow 推十轮区间；3 例测试；第三次横向体检 |
| 第 31 轮 | #46 | memory-capacity | stats 带上限与用量，面板达八成时提示；2 例测试 |
| 第 32 轮 | #47 | term-check | docs/glossary.json 四条规则 + term-check 脚本；6 例测试 |
| 第 33 轮 | #48 | memory-forget | POST /forget 路由 + 面板两段式删除；3 例测试 |
| 第 34 轮 | #49 | memory-hit-stats | stats 给 unused / topHits / hitless，面板显示从未命中的条目；1 例测试 |
| 第 35 轮 | #50 | memory-keyboard | 上下键移动光标、Enter 打开、Esc 关闭、斜杠聚焦搜索；2 例测试 |
| 第 36 轮 | #51 | preflight | 五道门禁合一（分数/重复/术语/打包/冒烟）；5 例测试 |
| 第 37 轮 | #52 | memory-recall | 10 条查询的召回基准 + top1/MRR 阈值；5 例测试 |
| 第 38 轮 | #53 | flow-drill | 有状态假执行器 + 七步演练与契约断言；4 例测试 |
| 第 39 轮 | #54 | preflight-drill | 流程演练并入交付门禁，六项全过；2 处测试断言更新 |
| 第 40 轮 | #55 | health-round-40 | 第四次横向体检：宪章 4964、用例 273、文档最低 85、无漂移无缺口 |
| 第 41 轮 | #56 | error-codes | 41 个错误码统一登记 + 源码扫描校验；5 例测试 |
| 第 42 轮 | #57 | resume | 进度摘要脚本 + 账本漂移校正（20 行由「待做」改「完成」）；6 例测试 |
| 第 43 轮 | #58 | ledger-cli | 账本维护三命令（list/mark/append-round）+ 自用回填 022；6 例测试 |
| 第 44 轮 | #59 | round-report | 证据四段报告生成器（真跑门禁）；6 例测试 |
| 第 45 轮 | #60 | commit-issue-check | commit-msg --issue 校验关联；4 例测试 |
| 第 46 轮 | #61 | branch-naming | 分支名解析/生成/并行检查 + prepareBranch 命名提醒；7 例测试 |
| 第 47 轮 | #62 | rollback-drill | 临时仓库真跑 revert 并断言树还原/历史保留；3 例测试 |
| 第 48 轮 | #63 | release-cadence | 版本推进脚本（每 10 轮 minor）+ CHANGELOG 骨架；8 例测试 |
| 第 49 轮 | #64 | board | README 进度块自动刷新（标记替换幂等）；6 例测试 |
| 第 50 轮 | #65 | health-round-50 | 第五次体检：宪章 4964、用例 324、README 81→88、升 0.49.0 |
| 第 51 轮 | #66 | pr-issue-link | open_pr 在 Issue 上回链 PR（可关闭）；2 例测试 |
| 第 52 轮 | #67 | gh-version | 解析 gh 版本并在过低时提示缺字段；5+1 例测试 |
| 第 53 轮 | #68 | doc-cmd-check | 文档示例命令校验并并入 preflight 第七道门禁；6 例测试 |
| 第 54 轮 | #69 | audit-reasons | 跳过文件带原因分类 + reportOnly 标记；2 例测试 |
| 第 55 轮 | #70 | audit-timing | 审计按目录计时 + 总耗时与最慢分组；2 例测试 |
| 第 56 轮 | #71 | audit-history | 审计历史落盘（环形 50 条）+ 状态载荷带最近三条 + 概览显示；7 例测试 |
| 第 57 轮 | #72 | audit-idempotent | 幂等/并发/缓存三组回归断言（5 例） |
| 第 58 轮 | #73 | ci-workflow | GitHub Actions 复用同一套门禁 + 一致性断言；5 例测试 |
| 第 59 轮 | #74 | aigc-summary | 批量分数汇总（均分/最低/低于阈值清单）；3 例测试 |
| 第 60 轮 | #75 | health-round-60 | 第六次体检：宪章 4964、用例 362、README 81→90、升 0.54.0 |
| 第 61 轮 | #76 | aigc-fix-suggest | 命中处给具体改写建议（套话替换表 / 结构痕迹复用 hint）；3 例测试 |
| 第 62 轮 | #77 | a11y-contract | 可访问性契约断言（tab/tabpanel/aria-label/aria-pressed）；5 例测试 + 修 aria-controls |
| 第 63 轮 | #78 | locale-parity | 中英字典键集 / 嵌套表 / 数组长度 / 占位符四项对齐校验；5 例测试 |
| 第 64 轮 | #79 | run-code-examples | run_code 示例库（四个正例 + 一个反例）+ 语法与工具名校验；5 例测试 |
| 第 65 轮 | #80 | limits | 体积上限集中到 lib/limits.js + truncateText；6 例测试 |
| 第 66 轮 | #81 | overflow-policy | 超限策略表 + OVERFLOW.md + 行为抽查；6 例测试 |
| 第 67 轮 | #82 | subagent-templates | 三个简报模板 + 统一四栏返回格式，含模糊词黑名单；5 例测试 |
| 第 68 轮 | #83 | tool-timing | 工具调用耗时统计（包装 register，失败也记）+ status 暴露前 5；6 例测试 |
| 第 69 轮 | #84 | retry-policy | classifyFailure 三选一 + withRetry，mergePr 改用它；9 例测试 |
| 第 70 轮 | #85 | health-round-70 | 第七次体检：用例 412、最大技能 rd-ecosystem 2597、升 0.60.0 |
| 第 71 轮 | #86 | git-net-check | 消除 GCM 账户弹窗 + 代理与 TLS 后端修复，脚本自检四项；6 例测试 |
| 第 72 轮 | #87 | audit-mode | auditMode 配置（fix/report）+ 归一化与 warning；3 例测试 |
| 第 73 轮 | #88 | ci-parity | CI run 命令抽取 + 三项覆盖判定，接入 preflight 第八道门禁；5 例测试 |
| 第 74 轮 | #89 | overview-nav-consistency | 概览补记忆库能力、修掉「流程是开关」旧表述；断言 1 例 |
| 第 75 轮 | #90 | narrow-layout | 记忆库两栏改 min(240px,100%)；三例静态断言守住像素下限；3 例测试 |
| 第 76 轮 | #91 | empty-states | 空态统一为「原因 + 下一步」；过滤为空给出放宽动作；2 例测试 |
| 第 77 轮 | #92 | focus-order | 禁止正数 tabIndex（放行 roving）+ 记忆库元素顺序断言；4 例测试 |
| 第 78 轮 | #93 | command-palette | Ctrl+K 命令面板：页签与能力两组合并搜索、上下选择、回车执行；5 例测试 |
| 第 79 轮 | #94 | shared-context | 入口页把 root/version 作为 context 传给成员页面，记忆库显示当前仓库；2 例测试 |
| 第 80 轮 | #95 | brand-consistency | 图标规格（16×16 / currentColor / aria-hidden）与三级命名断言；4 例测试 |
| 第 81 轮 | #96 | tool-inventory | 抽取两种注册写法的工具名并与文档对账，9 个工具全覆盖；6 例测试 |
| 第 82 轮 | #97 | skill-routing | 技能目录与路由表双向一致；补上孤儿 rd-selftest 路由；3 例测试 |
| 第 83 轮 | #98 | skill-cost | 技能正文与 references 分开计量，token 粗估与 3000 字符预算；6 例测试 |
