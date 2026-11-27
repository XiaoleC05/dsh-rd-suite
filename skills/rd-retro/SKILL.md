---
name: rd-retro
description: 研发模式的复盘与进化：汇总会话与交付数据、诊断问题、提出改进并在用户批准后应用、记录版本与变更。仅当用户要求复盘、评估或优化研发模式，或定时任务要求运行复盘时加载。
---
# 复盘与进化（rd-retro）

## 0 路径与边界
模式仓库 = 本技能 Base directory 的上两级目录（含 package.json、cordis.patch.yml、client-sources/、skills/），下文写作 <模式仓库>。本技能中以 docs/、scripts/、client-sources/ 开头的路径以及 package.json、cordis.patch.yml 都相对 <模式仓库>；只有 references/ 相对 Base directory。命令的 workdir 设为 <模式仓库>，read、write、edit 一律先拼绝对路径。产物写在 <模式仓库> 内。
除第 5 节第 2 步经用户同意的 set_bundle 外，不修改 DSH profile。不解码、不读取、不输出会话日志原文，只看会话页展示的用量数字与交付报告。

## 1 收集（只读）
1. 数据来源与本期范围：用户指定的时间窗（默认最近 7 天）。可用的只读来源：
   - 会话列表里的用量显示（上下文、缓存命中、输出、请求数）：按会话挑最大与最异常的几条；
   - 本仓库 `git log --oneline --since=<日期>` 与最近几次交付报告；
   - `confluence_board` 里本周 kind 为 gotcha 或 decision 的记录；
   - 先用 `memory_search` / `memory_list` 过一遍长期记忆：已有的踩坑与策略不重复提案，只补充证据；
   - 用户直接反馈（消息、`confluence_profile` 里的长期偏好）。
   没有可统计的会话时，说明“本期样本为 0”，只做代码与文档层面的巡检，不提 KPI 提案。
2. 读取 `docs/proposals/` 中上一期提案（文件名日期最近的一份，不含本期）与 `docs/CHANGELOG.md` 最近 3 条记录；没有就跳过并注明。

## 2 诊断
对照 references/kpi.md 的指标定义，找出最多 3 个最重要的问题。每个问题都要有证据：具体数字、涉及的会话数、或可复现的失败命令。没有证据的猜测写进「观察」，不进入提案。
抽样评审：按 references/kpi.md 的「抽样评审」为能判断的项打分；无法判断的写「需人工查看」，请用户按工作区与开始时间自行打开会话核对。

## 3 提案（写入 docs/proposals/<日期>.md，目录不存在就新建）
每条提案一段：问题｜证据｜改动（精确到文件与文本，附 diff）｜预期影响的指标与幅度｜风险｜回滚方式｜变更等级。
- C1 技能或参考文件的内容：低风险，可合并批准。
- C2 宪章（persona）、预设 YAML、工具与压缩配置、界面源码：中风险，逐条批准，改后必须校验并自检。
- C3 新增或移除插件、MCP、宿主设置：高风险，按 rd-ecosystem 流程执行。
修改宪章时优先改 persona 的 suffix（交付前自检区），保持 prefix 稳定以利用缓存；suffix 不超过 15 行。

## 4 批准
用 ask_user_question 请用户逐条选择：批准 / 修改后批准 / 拒绝（C1 可以合并成一问）。用户没有回应时保留提案文件，不应用任何改动。

## 5 应用（只应用已批准的提案）
1. 改文件后按改动类型校验：
   - 只改了 skills/ 或 docs/：`grep` 复核引用路径真实存在即可；技能目录被实时监视，下一步生效。
   - 改了 client-sources/：`node scripts/build-client.mjs` 重建 `client.js`，再 `node --check client.js`。
   - 任何改动：`node --test "test/**/*.test.mjs" "code-pipeline/test/*.test.mjs" "github/test/*.test.mjs"` 必须 `# fail 0`。失败时用 edit 把本次改过的文本逐处改回原文（不要用 git checkout、restore、reset、clean），再跑一次确认。
2. C2 改动需要重新组合预设：用 ask_user_question 征得同意后，调用 plugin_manager 依次执行 set_bundle（target=dsh-rd-suite，enabled=false）与 set_bundle（target=dsh-rd-suite，enabled=true）。研发模式是默认模式时先提醒用户：这两步之间新建会话会失败，完成后即恢复。当前会话没有 plugin_manager 时，请用户在「创造模式」会话里执行这两步。完成后请用户刷新页面（浏览器半随页面加载）并新建一个研发模式会话运行 /rd-selftest；已有会话保持旧版本。
3. 更新 package.json 的 version（C1 递增补丁号，C2、C3 递增次版本号），在 `docs/CHANGELOG.md` 记录：日期、版本、提案编号、改动摘要、预期指标。
4. <模式仓库> 是 git 仓库时提交一次：`chore(rd): apply retro <日期>`。不推送。

## 6 评估效果
下次复盘时对照上次提案预期的指标检查实际变化。连续两次未达到预期，或出现明显退化时，提出回滚提案（`git revert` 对应提交，或恢复 CHANGELOG 中记录的旧文本）。

## 7 输出
简短报告：本期样本与指标摘要（含与上期对比）；问题与证据；抽样评审结果（含需人工查看的项）；提案列表及状态；已应用的变更与新版本号；下一期重点观察的指标。
