---
name: rd-selftest
description: 研发模式安装或升级后的自检。用户输入 /rd-selftest 时执行。
disable-model-invocation: true
---
# 研发模式自检

模式仓库 = 本技能 Base directory 的上两级目录（下文用 <模式仓库> 表示它的绝对路径，正常是 DSH 里以 link 安装的 dsh-rd-suite）。本会话的工作目录应当就是 <模式仓库>；不是时在结果里注明，第 7 项记为“跳过”。除第 6、8 项发起两个只读子代理外，不修改任何文件、不安装任何东西、不运行会写文件的命令（`node scripts/build-client.mjs` 属于写文件，不在这里运行）。

## 执行顺序
先完成第 1–5 与第 7 项；第 6、8 项在同一轮同时发起。子代理调用只立即返回名称，结果随后以完成通知送达：发起后结束本轮，不轮询、不输出表格；两条通知都到达后再判定，并输出唯一一张结果表。

## 检查项
1. 宪章：一句话复述四个任务分级（L0–L3），并确认系统提示词末尾能看到「交付前自检」。
2. 执行方式（PTC）：工具列表里**只有** `run_code` 可直接调用；SDK 里能取到 read、write、edit、glob、grep、pwsh（非 Windows 为 bash）、job_output、web_search、web_fetch、todo_write、ask_user_question、review_agent、subagent、subagent_fork、schedule_create、present。直接调用 `read` 之类应当报 unknown tool。
3. 不存在的工具：`workflow`、`cordis_inspect_query`、`plugin_market` 之外的宿主开发工具不应出现；`workflow` 在本模式被有意关闭。
4. 技能目录：应含 rd-code-standards、rd-testing、rd-web、rd-data、rd-ai、rd-ecosystem、rd-retro、dsh-doc；不含 rd-selftest（只供用户调用）。宿主另列 office、office-docx、office-pptx、office-xlsx、diagnose-windows-sandbox-acl 属正常。
5. 加载 rd-testing：返回的 Base directory 应位于 `<模式仓库>\skills\rd-testing`。
6. 调用 subagent（不指定 agent_preset），prompt：「只读任务：列出 `<模式仓库>\skills` 下的子目录名称，按你的固定格式回复。」期望：≤40 行，含「结论：」与「关键位置：」，没有修改任何文件。
7. 只读校验（前台，预计 <2 分钟，设 timeoutMs: 600000）：
   - `node --check client.js`
   - `node --test "test/**/*.test.mjs" "code-pipeline/test/*.test.mjs" "github/test/*.test.mjs"`
   期望两条都 exit 0。另外用 grep 确认 `cordis.patch.yml` 中同时存在 `tool-executor-ptc`、`tool-schedule`、`tool-subagent-fork`、`tool-review-agent`。
8. 调用 review_agent，prompt：「验收任务，工作目录 <模式仓库>。AC-1：运行 `node --test "test/**/*.test.mjs" "code-pipeline/test/*.test.mjs" "github/test/*.test.mjs"`，输出末行 satisfy `# fail 0` 且 exit=0。AC-2：`node --check client.js` exit=0。只读，不要修改任何文件。」期望：首行 VERDICT，PASS 时「已运行」里列出这两条命令。

## 输出
一张表：项目｜期望｜实际｜PASS / FAIL / 跳过。最后一行写「自检 x/8 通过（跳过 y 项）」。失败项写出可能原因：工具缺失先查 `plugin_manager` 里 bundle 是否启用、预设行是否报错；界面类问题先看浏览器控制台，再重建 `client.js`。
