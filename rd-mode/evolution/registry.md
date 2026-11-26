# 能力登记表

记录本模式采纳、暂缓和拒绝的能力及理由。引入或移除能力时（rd-ecosystem 流程）必须更新本表，并在 CHANGELOG 记一条。候选清单见 skills/rd-ecosystem/references/candidates.md。

## 已采纳（rd 预设内）
| 能力 | 行 id | 理由 |
|---|---|---|
| 宪章 persona（prefix + suffix） | persona | 常驻的流程、关卡与红线；suffix 放交付前自检，利用系统提示词末尾的位置提高遵守率 |
| 项目规则文件 | agent-instructions | 读取 AGENTS.md / CLAUDE.md；上限 24 KB / 链 |
| 原生文件、搜索、Shell、后台任务工具 | tool-fs、tool-fs-search、tool-pwsh/tool-bash、tool-jobs | 研发基础能力；输出上限收紧 |
| 技能目录与加载 | skill-filesystem、tool-skill | 领域标准按需加载，平时只占目录行 |
| 计划模式、目标 | planning、command-goal、tool-goal | 大改动先审批计划；/goal 长任务自动续跑 |
| 压缩 | compaction（compaction-basic、command-compact、tool-result-pruner） | 阈值提前到约 199k，是最大的成本杠杆 |
| 子代理 | tool-subagent（subagent）、tool-review-agent（review_agent）、tool-subagent-control | 侦察隔离上下文；独立验收不带作者上下文 |
| 提问、待办、网页、交付物 | tool-ask-user、tool-todo、tool-web、present | 澄清、计划跟踪、查资料、交付 |
| Office 工具 | tool-office | 只在加载 office 技能后出现，平时零成本 |
| 插件管理与插件市场 | tool-plugin-manager、tool-plugin-market | 生态引入流程需要；市场工具只在用户启用市场插件后出现 |

## 已采纳（宿主层 bundle）
| 能力 | bundle／行 id | 理由 |
|---|---|---|
| context7 文档检索 MCP | @local/context7-mcp／context7-mcp（@deepseek-ai/dsh-mcp-client，serverName=context7，stdio：`cmd /c npx -y @upstash/context7-mcp@4.7.3`） | 库与框架的最新官方文档检索；2 个服务器工具 + 3 个资源工具，约 +750 token/请求；2026-11-20 试用通过（resolve-library-id 返回真实库 ID）后保留。评估卡合计 8（必要性 2、成本 1、风险 1、重叠 2、可逆性 2），无 0 分项 |
| 研发模式卡片增强 | @local/dsh-rd-mode-cards／rd-mode-cards（客户端插件，替换设置页 agent-presets 槽位） | 让 rd / rd-scout / rd-review 卡片显示「模式说明 / 如何使用」，与内置模式一致；内置按钮只对四个内置 id 硬编码、预设声明无对应字段，故用 vendoring 客户端插件实现。可停用/移除，DSH 升级后需运行 scripts/vendor-preset-cards.mjs 重建 |

## 暂缓或拒绝
| 能力 | 状态 | 理由与重新评估条件 |
|---|---|---|
| PTC 执行器（run_code） | 暂缓 | 实测首轮固定前缀 ptc 约 18.3k vs standard 约 10.3k；run_code 失败 61/1,445；Confluence 工具在 PTC 下的可达性未验证。可作为 A/B 实验：复制 rd 为 rd-ptc 运行两周后比较 K1、K6 |
| workflow 工具 | 拒绝 | 工具定义约 834 token/请求；官方文案限定“仅在用户明确要求时使用”；subagent 已能满足常见并行需求 |
| schedule 工具 | 拒绝 | 4 个工具约 1,138 token/请求；周度复盘通过“自动化任务”界面创建，无需模型工具 |
| subagent_fork | 拒绝 | 把整段父上下文复制进子代理，成本高且不独立 |
| list_subagent_models / modelSelection | 拒绝 | 子代理模型与 effort 已由 agentOptions 固定；省下工具定义 |
| cordis_inspect_*（tool-cordis） | 拒绝 | 历史日志中占全部工具输出字符的 6.3%（约 1.3 万字符 / 次）；DSH 内部开发交给“创造模式” |
| 实验性 Auto review 权限模式 | 拒绝 | 每次工具调用多一次完整上下文的模型请求；它是权限审查，不是质量审查 |
| 官方插件推荐（plugin-recommendations） | 拒绝 | 每次加载约 2.6 万字符；plugin_manager list_bundles 已能列出官方插件 |
