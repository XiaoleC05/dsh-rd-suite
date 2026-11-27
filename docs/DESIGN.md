# 研发模式设计说明

| 项目 | 内容 |
|---|---|
| 适用 | DeepSeek Harness Desktop 0.2.2-rc.5+（Windows x64 为主） |
| 载体 | 本仓库 `cordis.patch.yml` 的 `preset-rd` 一行 |
| 基线 | 官方 `presets/standard.patch.yml`，并取 `presets/ptc.patch.yml` 的全部能力 |
| 版本 | 见 `package.json` 与 `docs/CHANGELOG.md` |

## 1 设计原则

- **P1 质量 = 规格 × 验证 × 独立复核**，不是靠提高推理强度。
- **P2 成本 ∝ 每次请求的上下文 × 请求次数**。控制上下文长度与往返次数，比追求缓存命中率更重要。
- **P3 结构优于说教**：固定的分级、关卡、模板与输出格式压低方差。
- **P4 常驻最小、细节按需**：宪章只写所有任务都需要的规则，领域细则放进技能。
- **P5 复用已有资产**：已有插件、官方预设与项目自身规则优先，不新造轮子。
- **P6 进化可度量、可审批、可回滚**：没有证据不改，没有批准不改，改了能退回。
- **P7 诚实优先**：没运行就是未验证；检查跑不起来要说出来。

## 2 架构

```
DSH 宿主（profile 全局，所有模式共享）
  模型 deepseek-flash（1M 上下文）· 会话日志 · 溢出存储 · PTC 运行时
  宿主插件：code-pipeline 成员 · GitHub 流程成员 · confluence · context7 MCP
        ▲ 宿主工具与钩子对所有预设可见
dsh-rd-suite bundle
  preset rd        宪章 persona（prefix 约 4.0k 字符 + suffix 交付自检）
                   执行方式：tool-executor-ptc（只有 run_code 可直接调用）
                   工具：pwsh/bash · 文件 · 搜索 · 后台任务 · 网页 · 待办 · 提问
                         目标 · 计划模式 · 交付 · 定时任务 · Office · 插件管理
                   压缩：约 199k 触发，保留 40k 原文，工具结果超 6 KB 先剪头尾
                   委派：subagent / subagent_fork / review_agent（同一 rd 预设）
  skills/          rd-code-standards · rd-testing · rd-web · rd-data · rd-ai
                   rd-ecosystem · rd-retro · rd-selftest（按需加载）
  client-sources/  入口页 · 代码修正面板 · GitHub 设置行 · 模式卡片
```

运行时数据流：用户任务 → 分级 → 规格卡 → 计划 → 实现 → 验证 → （独立验收）→ 交付报告。
进化数据流：会话与交付数据 → rd-retro 诊断 → 提案（`docs/proposals/`）→ 用户批准 → 改 bundle → 校验 → 新会话生效。

## 3 分级与流水线

| 级别 | 判定 | 必经阶段 | 交付 |
|---|---|---|---|
| L0 问答 | 不改文件 | 直接回答，引用 `文件:行` | 不套模板 |
| L1 微改 | ≤2 文件、意图明确、低风险 | 定位 → 改 → 最小验证 | 一行「验证：命令 → 结果」 |
| L2 标准 | 多文件功能或缺陷、需求清楚 | 简版规格卡 → 计划 → 实现 → 验证 | 完整报告 |
| L3 复杂/高风险 | 新模块、架构/接口/数据迁移、安全与权限、并发、CI/部署、需求不清 | 规格卡与计划一次批准 → 分模块实现与验证 → 独立验收 | 完整报告 + 验收结论 |

关卡：**S5 验证**（每条 AC 要有本会话真实运行过的证据，跑不起来写「未验证：原因」）与 **S6 独立验收**（`review_agent` 不带作者上下文、亲自重跑、首行 VERDICT；L3 必做）。

## 4 执行方式：为什么用 PTC

`tool-executor-ptc` 让模型只直接调用 `run_code`，其余工具成为程序内的 SDK 绑定。对研发模式的收益与代价：

- **收益**：互不依赖的调用可以写进同一个程序并行执行，把 N 次模型往返压成 1 次。历史数据里每条用户消息平均触发 35.5 次请求，往返次数是成本的主项，所以这一项通常比前缀大小更重要。中间结果留在程序里，只有需要的字段进入对话。
- **代价**：每次请求要带一份生成式 SDK 文本（按可见工具定义线性增长）。同一模型内无法一部分工具走原生、一部分走 PTC，所以这是模式级选择。
- **回滚**：把 `cordis.patch.yml` 里 `tool-executor-ptc` 那行改成 `disabled: true`，重载 bundle，即回到原生工具调用。
- **额度**：`maxSubCallsPerMinute: 512`（默认超时 2 分钟即 1024 次调用额度）；`maxParallelSubCalls: 8` 限制并行安全的子调用并发。额度用尽会终止整个程序，用来兜住写错的死循环。

## 5 GitHub 固定流程

不是设置项，也不随项目偏好关闭。依据 GitHub 官方文档的三处约定：[GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow)（分支 → 提交 → PR → 评审 → 合并 → 删分支）、[关闭关键词](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)（close/fix/resolve 系列；同仓库 `KEYWORD #N`，跨仓库 `KEYWORD OWNER/REPO#N`）、[受保护分支与 rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository)（决定是否强制走 PR）。

| 步骤 | 工具动作 | 产物 |
|---|---|---|
| G0 预检 | `precheck` | `strategy`（pr / direct）、`defaultBranch`、`protection`、未提交改动警告 |
| G1 模块建档 | `create_issue` | 一个模块一个 Issue：现象、影响、复现、范围、AC、计划 |
| G2 分支 | `prepare_branch` | `<type>/<issue>-<slug>`，从默认分支切出 |
| G3 提交 | git | 一个模块一次原子提交，`<type>(<module>): <summary> (#N)` + `Closes #N` |
| G4 代码审计 | `code_standardize` | 改动文件格式检查与修正（见 §7） |
| G5 PR 与合并 | `open_pr` → `pr_status` → `merge_pr` | draft PR 带 `Closes #N`；检查绿、评审落定后 squash 合并并删分支 |
| G6 关闭 | `close_issue` | direct 策略下由它关闭；PR 已关闭时补验证评论 |
| G7 发版 | `release` | SemVer tag + 生成的发布说明，只在验证过的默认分支上发 |

`strategy` 的决定方式：默认分支有生效的 ruleset 或经典分支保护 → `pr`；读取不到保护状态 → `direct` 但提示共享仓库优先走分支与 PR；不是 GitHub 远程仓库 → 流程不适用，按普通工程流程走并在报告里说明。工具结果只报它真正确认的状态：合并、关闭、发布都以 `gh` 的复查为准，失败按 `classifyGitHubDiagnostic` 给出可执行的下一步。

### 5.1 模块级代码审计

格式化分两层，都不需要手动触发：

1. **写文件即格式化**：`write`/`edit` 成功后宿主立刻按项目预设校对该文件，变更写回并给出「自动审查：已修正 X」。
2. **模块关闭整体审计**：`close_issue` 成功时，宿主对本次模块改动过的文件先跑 report 再跑 fix，把 `codeAuditChecked`、`codeAuditFixed`、`codeAuditRemaining`、`codeAuditFiles` 合并进工具结果。本轮没有改过文件就跳过。

审计是幂等的：第二次跑同一批文件 `needsFix` 为 0；report 模式不写文件，供只读场合使用；无法格式化的文件计入 `codeAuditRemaining` 并在提示里要求逐个确认，不会静默通过。面板退化为复查入口。
## 6 Token 与成本杠杆

| 杠杆 | 取值 | 依据 |
|---|---|---|
| 宪章 prefix | 约 4.0k 字符（从 5.2k 压到 4.0k，规则要点逐条保留） | 常驻成本的主项，只能靠压缩措辞与服务 P4 |
| 提前压缩 | `thresholdRatio 0.19`（约 199k）、`retainTokens 40000`、摘要 32000 | 默认阈值约 727k 几乎不触发 |
| 工具结果剪裁 | 超过 6144 字符的结果剪成头 3072 + 尾 768 | 超长输出仍是上下文膨胀的主因 |
| 单次读取 | `readMaxBytes 32768` | 超限以截断提示结束，用 offset 续读 |
| 搜索 | grep 150 条、每行 600 字节 | 限制一次检索的体量 |
| 网页 | 抓取 6 万字符、搜索 8 条 | 新闻与文档页常常几千行 |
| 技能按需 | 目录每条描述 ≤300 字符；正文只在 L2/L3 相关任务加载 | 领域规则不占常驻前缀 |
| 时间上下文 | 刷新间隔 1 小时 | 小项，零风险 |
| PTC 批量 | 见 §4 | 减少往返次数 |

## 7 相对官方 `ptc` 预设的差异

| 差异 | rd 的取值 | 原因 |
|---|---|---|
| 执行方式 | 挂 `tool-executor-ptc` | 取 PTC 全部能力 |
| 额外工具 | `review_agent`、`code_*`、rd-* 技能、插件市场条件挂载 | 流程与验收的载体 |
| 常驻前缀 | 宪章 + 交付自检 suffix | 分级、关卡、模板、红线 |
| 上下文治理 | 压缩阈值、读取与搜索上限、剪裁阈值都更紧 | 长会话成本 |
| 委派 | 同一 rd 预设承担 `subagent` / `subagent_fork` / `review_agent` | 侦察与验收是角色，不是模式 |
| 不挂 | `workflow` | 官方文案限定只在用户明确要求时使用；用 todo + 子代理覆盖同类需求 |

## 8 KPI 与目标

指标定义见 `skills/rd-retro/references/kpi.md`。目标值：

| 指标 | 目标 |
|---|---|
| K1 平均每次请求上下文 | ≤120,000 |
| K2 p90 每次请求上下文 | ≤200,000 |
| K3 超过 200k 的请求占比 | ≤5% |
| K4 每条用户消息的上下文 token | ≤8,500,000 |
| K5 每条用户消息成本指数 | ≤10,000,000 |
| K6 工具调用失败率 | ≤2% |
| K7 每 100 次调用中超 2 万字符的结果 | ≤1 |
| K8 每 100 次 read 中重复读取 | ≤2 |
| K9 改文件任务段标注分级占比 | ≥90% |
| K10 交付带验收段落占比 | ≥90% |
| K11 L3 经 review_agent 占比 | ≥90% |
| K12 返工信号占比 | ≤6% |

## 9 风险与未验证

- **PTC 前缀大小未在本机实测**：官方文档明确「不承诺普遍减少成本」，取决于可见工具定义。用新会话首轮请求的用量数字核对，超过 22k 就从工具集或宪章里减。
- **插件与 MCP 工具在 PTC 下的可达性**：`code_*`、`github_workflow`、`confluence_*`、context7 的 SDK 绑定由同一套投影生成，`ToolDefinition.output` 是必填项，因此不会因为缺输出声明导致提示词组装失败；但实际调用要由 `/rd-selftest` 第 2、3 项核对。
- **验收员与作者同模型**：独立性由不同上下文、只读工具集与强制重跑保证，关键项目仍需人工复看。
- **压缩会丢细节**：199k 是起点而不是最优值；K8 上升时先调 `retainTokens`。
- **K9–K12 是启发式指标**：依赖回答中的固定标记与关键词，只看趋势。
- **同一浏览器模块**：任一界面报错会影响整块界面加载；改完必须 `node scripts/build-client.mjs` 并刷新页面。

## 10 变更流程

| 等级 | 范围 | 审批 | 生效 |
|---|---|---|---|
| C1 | 技能与文档内容 | 可合并批准 | 技能目录实时监视，下一步生效 |
| C2 | 宪章、预设 YAML、工具与压缩配置、界面源码 | 逐条批准 + 校验 + 自检 | `set_bundle` 关再开后新建会话；界面刷新页面 |
| C3 | 新增或移除插件、MCP、宿主设置 | 按 rd-ecosystem 逐步批准 | 视插件而定 |

校验命令：`node --check client.js`、`node --test "test/**/*.test.mjs" "code-pipeline/test/*.test.mjs" "github/test/*.test.mjs"`（期望 `# fail 0`），以及 `/rd-selftest` 的 8 项。
