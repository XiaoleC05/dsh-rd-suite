---
name: rd-retro
description: 研发模式的复盘与进化：统计会话 KPI、诊断问题、提出改进并在用户批准后应用、记录版本与变更。仅当用户要求复盘、评估或优化研发模式，或定时任务要求运行复盘时加载。
---
# 复盘与进化（rd-retro）

## 0 路径与边界
模式仓库 = 本技能 Base directory 的上两级目录（包含 package.json 与 preset.patch.yml），下文写作 <模式仓库>。本技能中以 scripts/、evolution/ 开头的路径以及 package.json、preset.patch.yml 都相对 <模式仓库>，不相对 Base directory；只有 references/ 相对 Base directory。运行命令时把 pwsh 的 workdir 设为 <模式仓库>；read、write、edit 一律先拼成绝对路径。所有产物写在 <模式仓库> 内。
除第 5 节第 2 步经用户同意的 set_bundle 外，不修改 DSH profile。不解码、不读取、不输出会话日志原文；只使用 KPI 报告中的聚合数字与结构化标记。

## 1 收集（只读）
1. 生成本期报告（<日期> 为今天的 YYYY-MM-DD）：
   `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/node.ps1 scripts/rd-kpi.mjs --days 7 --out evolution/kpi/<日期>.md --json evolution/kpi/<日期>.json`
   - 退出码为 3（缺少合适的 node），或报告第一段出现“无法解码”：停止并报告，不要根据该报告诊断。
   - 纳入会话为 0（本周没有研发模式会话）：再运行一次 `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/node.ps1 scripts/rd-kpi.mjs --days 7 --presets all`（不带 --out、--json，只看终端输出）作为对照，说明情况后直接进入第 7 节，不提提案。
2. 读取 evolution/kpi/ 中上一期报告（文件名日期最近的一份，不含本期）；还没有时以 baseline-2026-11-19.md 为对照（它统计的是引入本模式前的全部模式）。再读 evolution/feedback.md 与 evolution/CHANGELOG.md 最近 3 条记录。
3. confluence_board 可用时，搜索本周 kind 为 gotcha 或 decision 的记录。

## 2 诊断
对照 references/kpi.md 的指标定义与报告的“目标”列，找出最多 3 个最重要的问题。每个问题都要有证据：指标数值、与上期相比的变化、涉及的会话数。没有证据的猜测写进“观察”，不进入提案。
抽样评审：按 references/kpi.md 的“抽样评审”，依据报告中“抽样会话”表的结构化指标为能判断的项打分；无法判断的项写“需人工查看”，在第 7 节请用户按表中的工作区与开始时间自行打开会话查看（可选）。

## 3 提案（写入 evolution/proposals/<日期>.md）
格式见 evolution/proposals/README.md：问题｜证据｜改动（精确到文件与文本，附 diff）｜预期影响的 KPI 与幅度｜风险｜回滚方式｜变更等级。
- C1 技能或参考文件的内容：低风险，可以合并批准。
- C2 宪章（persona）、预设 YAML、工具配置：中风险，逐条批准，改后必须校验并自检。
- C3 新增或移除插件、MCP、宿主设置：高风险，按 rd-ecosystem 流程执行。
修改宪章时优先改 persona 的 suffix（交付前自检区），保持 prefix 稳定以利用缓存；suffix 不超过 15 行。

## 4 批准
用 ask_user_question 请用户逐条选择：批准 / 修改后批准 / 拒绝（C1 可以合并成一问）。用户没有回应时保留提案文件，不应用任何改动。

## 5 应用（只应用已批准的提案）
1. 修改文件，然后运行 `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/validate.ps1`。结果为 FAIL 时，用 edit 把本次改过的文本逐处改回原文（不要用 git checkout、restore、reset、clean），再运行一次校验确认为 OK，然后报告。
2. C2 改动需要重新组合预设：用 ask_user_question 征得同意后，调用 plugin_manager 依次执行 set_bundle（target=dsh-rd-mode，enabled=false）与 set_bundle（target=dsh-rd-mode，enabled=true）。研发模式是默认模式时，先提醒用户：这两步之间新建会话会失败，完成后即恢复。当前会话没有 plugin_manager 时，请用户在“创造模式”会话中执行这两步。完成后请用户新建一个研发模式会话（工作目录选 <模式仓库>）并输入 /rd-selftest。已有会话保持旧版本，直到应用重启。
3. 更新 package.json 的 version（C1 递增补丁号，C2、C3 递增次版本号），在 evolution/CHANGELOG.md 记录：日期、版本、提案编号、改动摘要、预期 KPI。
4. <模式仓库> 是 git 仓库时提交一次：`chore(rd): apply retro <日期>`。不推送。

## 6 评估效果
下次复盘时，对照上次提案预期的 KPI 检查实际变化。连续两次未达到预期，或出现明显退化时，提出回滚提案（git revert 对应提交，或恢复 CHANGELOG 中记录的旧文本）。

## 7 输出
简短报告：本期 KPI 摘要与上期对比；问题与证据；抽样评审结果（含需人工查看的项）；提案列表及其状态；已应用的变更与新版本号；下一期重点观察的指标。
