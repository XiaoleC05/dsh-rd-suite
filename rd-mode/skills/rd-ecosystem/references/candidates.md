# 候选能力清单（2026-11-19 盘点，DSH 0.2.2-rc.5）

试用前按 SKILL.md 的评估卡打分；采纳或拒绝后更新模式仓库的 evolution/registry.md，并在这里标注状态。

## A 本机已有、DSH 尚未发现的技能
DSH 只扫描这些位置：`<项目根>\.dsh\skills`、`<项目根>\.agents\skills`、预设的 customSkillDirs、`%USERPROFILE%\.dsh\skills`、`%USERPROFILE%\.agents\skills`。下面的目录都不在其中，目前 0 个用户技能可见。

| 位置 | 内容 | 说明 |
|---|---|---|
| D:\01_DevTools\opencode-data\config\skills | 35 个（superpowers 14 个、planning-with-files 7 个等） | 格式与 DSH 兼容；多个正文超过 8000 字符（planning-with-files 28 KB、writing-skills 26 KB、subagent-driven-development 21.6 KB），直接接入会在压缩时被裁掉中段 |
| D:\01_DevTools\piagent-data\agent\skills | 同上 35 个的副本 | 不要重复接入 |
| D:\06_Projects\Skills | 10 个：brand-guidelines、caveman、code-review、concrete-first-teaching、design-taste-frontend、find-skills、frontend-design、humanizer、vercel-react-best-practices、writing-shape | design-taste-frontend 39 KB、humanizer 32.7 KB 需要拆分到 references/ |

建议的试用顺序与理由：
1. vercel-react-best-practices（7.4 KB，体积合格）：React / Next.js 项目的性能规范，补充 rd-web。
2. verification-before-completion（4.2 KB）：与本模式 S5 关卡高度一致，可对比后决定合并或放弃。
3. design-taste-frontend：网站视觉质量，价值高，但需要先把正文压到 6000 字符以内、细节拆进 references/。
接入方式：复制（不要链接）到 `%USERPROFILE%\.agents\skills\<名称>\`（用户级，所有模式可见）或模式仓库 skills\（只给研发模式，随版本管理）。注意与 rd-* 技能的描述不要重叠，否则模型会同时加载两份。

## B DSH 官方可选插件（已随 Desktop 安装，默认关闭）
| bundle | 增加的能力 | 常驻成本 | 备注 |
|---|---|---|---|
| @deepseek-ai/dsh-experimental-session-search | session_search 等 5 个工具：检索本工作区的历史会话 | 约 940 token/请求，作用于所有模式 | 实验性；复盘脚本已能直接统计日志，暂不需要 |
| @deepseek-ai/dsh-experimental-tool-worktree | create_worktree：在 git worktree 中隔离高风险的多文件改动 | 约 160 token/请求 | 实验性；适合 L3 任务 |
| @deepseek-ai/dsh-experimental-terminal-bundle | 6 个持久终端工具：REPL、调试器、交互式输入 | 约 610 token/请求 | 仅当确实需要交互式进程时 |
| @local/crisp-quality-gate（用户自研） | 最终回答的质量门禁与 JSONL 质量日志 | 不增加工具；每次最终回答约 1.8k token 评审 | 已安装但未加入 dsh.profile.bundles，目前没有运行 |

## C MCP 服务器（来自用户 Claude Code 的配置，DSH 中尚未接入）
| 服务器 | 命令 | 工具数 | 价值与建议 |
|---|---|---|---|
| context7 | cmd /c npx -y @upstash/context7-mcp@4.7.3 | 2 | 查询库的最新官方文档，价值高、成本低，第一优先试用。**2026-11-20 已采纳**：安装为宿主层 bundle @local/context7-mcp（见 evolution/registry.md 与 CHANGELOG 0.2.0） |
| playwright（用户未配置） | cmd /c npx -y @playwright/mcp@<确切版本> | 约 20+ | 真实浏览器，用于网站验证；常驻成本高，建议做成单独的网站验证模式或按需启用 |
| github | cmd /c npx -y @modelcontextprotocol/server-github | 26 | 需要 GITHUB_PERSONAL_ACCESS_TOKEN；大部分场景用 git + gh 命令即可 |
| codebase-memory | codebase-memory-mcp | 14 | 大型仓库的代码图谱检索；仓库很大时再试 |
| filesystem / terminal / git | — | 14 / 11 / 28 | 与 DSH 自带的 read、grep、pwsh 重复，不建议接入 |

## D 当前 Desktop 版本没有、无法直接安装
dsh-tool-lsp（跳转定义、查找引用）、browser-use 系列、dsh-hooks-claude-code、dsh-llm-replay 在 0.2.2-rc.5 Desktop 中未随包提供。类型错误与 lint 诊断通过 pwsh 运行 tsc、eslint、ruff、mypy、go vet 等命令获得。
