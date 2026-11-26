---
name: rd-selftest
description: 研发模式安装与升级后的自检。用户输入 /rd-selftest 时执行。
disable-model-invocation: true
---
# 研发模式自检

模式仓库 = 本技能 Base directory 的上两级目录（下文用 <模式仓库> 表示它的绝对路径）。本会话的工作目录应当就是 <模式仓库>；不是时，在结果中注明，第 8 项记为“跳过”。除第 6、7 项启动两个只读子代理外，不修改任何文件、不安装任何东西。

## 执行顺序
先完成第 1–5 项与第 8 项；第 6、7 项在同一轮同时发起。子代理调用只会立即返回名称，结果随后以完成通知送达：发起后结束本轮，不轮询、不输出表格；两条完成通知都到达后，判定第 6、7 项，再输出唯一一张结果表。

## 检查项
1. 宪章：用一句话复述四个任务分级（L0–L3），并确认系统提示词末尾能看到“交付前自检”。
2. 应存在的工具：read、write、edit、glob、grep、pwsh（非 Windows 为 bash）、job_output、skill、todo_write、ask_user_question、web_search、web_fetch、subagent、review_agent、create_goal、present。
3. 不应存在的工具：run_code、workflow、schedule_create、subagent_fork、cordis_inspect_query。
4. 技能目录应包含：rd-code-standards、rd-testing、rd-web、rd-data、rd-ai、rd-ecosystem、rd-retro、dsh-doc；不应包含 rd-selftest（它只供用户调用）。宿主还会列出 office、office-docx、office-pptx、office-xlsx、diagnose-windows-sandbox-acl，属正常。
5. 加载 rd-testing：返回的 Base directory 应位于 <模式仓库>\skills\rd-testing。
6. 调用 subagent（不指定 agent_preset），prompt：“只读任务：列出 <模式仓库>\skills 下的子目录名称，按你的固定格式回复。”期望：回复不超过 40 行，包含“结论：”与“关键位置：”，且没有修改任何文件。
7. 调用 review_agent，prompt：“验收任务，工作目录 <模式仓库>。AC-1：运行 `pwsh -NoProfile -ExecutionPolicy Bypass -File <模式仓库>\scripts\validate.ps1; "exit=$LASTEXITCODE"`，输出中以‘结果：’开头的行为‘结果：OK…’，且最后一行为 exit=0。只读，不要修改任何文件。”期望：回复首行为 VERDICT: PASS，且“已运行”中列出该命令。
8. 工具列表中有 code_standardize 且工作目录为 <模式仓库> 时：调用 code_standardize，paths=["scripts/validate-bundle.mjs"]，mode="report"（只报告、不修改）。期望：返回结果且没有 error；报告中的格式问题只记录数量，不算失败。其他情况记为“跳过”。

## 输出
一张表：项目｜期望｜实际｜PASS / FAIL / 跳过。最后一行写“自检 x/8 通过（跳过 y 项）”。失败项写出可能原因，并指向 <模式仓库>\INIT.md 的“排障”一节。
