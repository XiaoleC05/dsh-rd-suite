# 研发模式 · 安装与维护手册（执行者：DSH 中的 DeepSeek V4.1）

本文件是可直接执行的操作规程。按顺序执行，每一步核对“期望结果”；结果不符时按该步的分支处理，分支里没有覆盖的情况一律停止并向用户报告，不要自行发挥。设计原理见 `docs/DESIGN.md`，执行本手册时不需要通读它。下文 <模式仓库> 指 `D:/05_Code/dsh-rd-suite/rd-mode`。

## 0 角色与边界
- 你的任务：把 <模式仓库> 这个已经写好并校验过的 bundle 安装到当前 DSH profile，验证三个预设可用，并按用户意愿完成可选的宿主层调整。
- 不要重新设计，不要修改 `preset.patch.yml` 和 `skills/`；只有本手册明确要求时才改文件。
- 不要手工编辑 `%USERPROFILE%\.dsh\profiles\desktop\` 下的 `package.json`、`cordis.patch.yml`，也不要读取它们（其中含明文密钥），不要在该目录运行 pnpm；所有 profile 变更只通过 `plugin_manager` 工具完成。
- 用户把本手册交给你，即已同意第 1–5 步。第 6 步的每一项都要先用 `ask_user_question` 取得同意（6.4 除外）。
- 这份 bundle 已在 DSH 0.2.2-rc.5 的隔离环境中验证过：插件 schema 校验 0 错误；以 link: 方式安装后，宿主报告 rd、rd-scout、rd-review 三个预设均激活成功（没有 broken）；技能目录表达式能解析到 <模式仓库>/skills。

## 1 前提检查
1. 确认你的工具列表里有 `plugin_manager`。
   - 没有：你可能处在 PTC 模式（它不挂载 plugin_manager）。停止，请用户新建一个“创造模式”会话（工作目录选 <模式仓库>），在新会话中从第 1 步重新开始。
2. 用 read 读取 `<模式仓库>/package.json`，确认 `name` 为 `dsh-rd-mode`，`dsh.bundle.patch` 为 `./preset.patch.yml`。
3. 在 pwsh 中执行 `$env:DSH_INSTALL_DIR`，再用 read 读取该目录下的 `package.json`，确认 `version` ≥ `0.2.2-rc.5`。
   - 低于 0.2.2-rc.5：停止，告诉用户先升级 DeepSeek Harness（bundle 要求 engines.dsh ≥ 0.2.2-rc.5，否则会被静默跳过）。
   - read 失败：跳过此检查，以第 2 步输出中“已按 DSH <版本> 的插件 schema 校验”为准；第 4 步的 incompatible-version 也会拦截过低的版本。

## 2 校验 bundle
执行（pwsh 的 workdir 设为 <模式仓库>）：
```
pwsh -NoProfile -ExecutionPolicy Bypass -File D:/05_Code/dsh-rd-suite/rd-mode/scripts/validate.ps1
```
期望最后一行：`结果：OK（错误 0，警告 0，模式 完整）`。
- 显示 OK 但警告不为 0：继续，并把全部 WARN 行写进最终报告。
- 显示“模式 静态”：当前 shell 没有 DSH 环境变量，只做了静态检查。只要是 OK 就继续，并在最终报告中注明。
- 显示 FAIL：停止，把全部 ERROR 行原样报告给用户，不要尝试修复。
- 没有“结果：”行或命令超时：按第 8 节最后一行处理后重试一次，仍失败则停止并报告。

## 3 版本管理
1. 在 <模式仓库> 运行 `git rev-parse --is-inside-work-tree`。
   - 输出 true：不询问；`git status --porcelain` 有输出时执行 `git add -A` 与 `git commit -m "feat: dsh-rd-mode 0.1.0 初始版本"`。
   - 否则用 `ask_user_question` 询问：“是否把 <模式仓库> 初始化为 git 仓库并做首次提交？复盘的回滚依赖 git。”选项：“是（推荐）”/“否”。选“是”：`git init`、`git add -A`、`git commit -m "feat: dsh-rd-mode 0.1.0 初始版本"`；选“否”：跳过。
2. 任何 git 命令失败（例如没有配置 user.name / user.email）：不要修改任何 git 配置，把错误原样告诉用户，继续第 4 步，并在最终报告中注明“版本管理未建立”。不要推送，不要添加远程仓库。

## 4 安装
调用 `plugin_manager`，参数：`action` = `install_bundle`，`target` = `D:/05_Code/dsh-rd-suite/rd-mode`（绝对路径，正斜杠）。
期望：返回 JSON 中 `application` 为 `applied`（`warnings` 非空时原样写进最终报告）。

| 返回 | 含义 | 处理 |
|---|---|---|
| applied | 已安装并启用 | 进入第 5 步 |
| restart-required | 需要重启 | 告诉用户原因（restartReason），请其完全退出并重新打开 DeepSeek Harness，然后在新的创造模式会话中从第 5 步继续 |
| error.code = already-installed | 之前装过 | 调用 list_bundles，确认 dsh-rd-mode 的 source 为 `link:` 加 <模式仓库> 的绝对路径（正反斜杠与盘符大小写的差异视为相同）；是则执行 7.2 第 2 步的“重新组合”后进入第 5 步；不是则停止并报告 |
| error.code = incompatible-version | DSH 版本过低 | 停止，请用户升级 DSH；不要申请版本豁免 |
| error.code = not-bundle 或 invalid-spec | 路径或清单有误 | 重新核对第 1.2 步与 target 是否为绝对路径；仍失败则停止并报告 |
| failed（其他） | stage=install：安装失败，package.json 与锁文件已自动还原；stage=enable：已安装但启用或加载失败，依赖与选择被保留 | 先 list_bundles 查看 dsh-rd-mode 的 installed、enabled、error；连同 stage、error、nextStep、packageResult.output、packageResult.logPath 一起报告，停止 |

## 5 验证
1. 调用 `plugin_manager`：`action` = `list_bundles`，`limit` = 100。找到 `name` 为 `dsh-rd-mode` 的条目；本页没有且 `nextOffset` 不为 null 时，用 `offset` = nextOffset 继续，直到找到或 nextOffset 为 null。期望 `enabled: true`、`installed: true`、没有 `error`，`rows` 中包含 `preset-rd`、`preset-rd-scout`、`preset-rd-review`。
2. 预设本身激活失败时，安装结果仍可能是 applied，所以下面两项必须由用户确认。向用户逐字转达：
   - “请打开 设置 → 模式（Agent 预设）页面，确认有 研发模式、研发·侦察、研发·验收 三张卡片，且都没有错误提示。”
   - “请新建一个会话：模式选‘研发模式’，工作目录选 D:/05_Code/dsh-rd-suite/rd-mode，发送 /rd-selftest。期望最后一行为‘自检 8/8 通过’（没有 code-pipeline 插件时为 7/8，第 8 项记为跳过）。”
3. 转达后用 `ask_user_question` 询问结果，选项：“卡片正常且自检通过”/“卡片有错误”/“自检未全部通过”/“稍后再做”。
   - 选第 2、3 项：请用户贴出错误信息或自检表格，按第 8 节排障。
   - 选“稍后再做”：继续第 6 步但跳过 6.2，最终报告写“验证待用户执行”。

## 6 可选的宿主层调整（每项先用 ask_user_question 询问，选项为“执行 / 跳过”；6.4 只提醒，不询问）
6.1 启用 Crisp 质量门禁
- 询问时先说明：`@local/crisp-quality-gate` 已安装为 profile 依赖，但不在 bundle 列表中，profile 里为它写的配置被跳过，门禁目前没有运行（最后一条日志是 2026-11-17）。启用后对所有模式生效；当前配置为 guard 模式 + http 评审，每条最终回答会额外发送到外部评审端点（约 1.8k token、0.8 秒），判定为 material 时追加一次完整重写回合。
- 执行：`plugin_manager`，`action` = `set_bundle`，`target` = `@local/crisp-quality-gate`，`enabled` = `true`。期望 `application` 为 `applied`；返回 restart-required 时告诉用户重启后生效。
- 告知用户：建议之后把评审方式改为 `critic: harness`（复用 DSH 自己的模型，不需要单独的 API key）。这项修改由用户自己完成，你不要编辑配置文件。

6.2 设为默认模式
- 只在第 5.3 步用户确认“卡片正常且自检通过”后询问。执行方式：请用户在 设置 → 模式 页面点选“研发模式”卡片设为默认。你不要修改任何配置文件。

6.3 每周自动复盘
- 说明（询问时一并告诉用户）：自动化任务的手动编辑器没有“模式”选项，新会话使用当时的默认模式。研发模式是默认模式时效果最好；不是时，下面的指令也会让模型先读取复盘技能，但应用改动的步骤可能需要用户在创造模式中完成。
- 请用户在侧边栏打开“自动化任务”→ 新建 → 手动创建：
  - 名称：研发模式周复盘
  - 运行方式：每次运行新建会话
  - 关联工作区：dsh-rd-mode（列表中没有时，先在 D:/05_Code/dsh-rd-suite/rd-mode 新建一次会话使其注册为工作区，第 5.2 步的自检会话即可）
  - 运行时间：每周一 09:00
  - 指令：`如果技能目录中没有 rd-retro，先用 read 读取 D:/05_Code/dsh-rd-suite/rd-mode/skills/rd-retro/SKILL.md 并按其执行；否则加载 rd-retro。复盘最近 7 天研发模式的会话：生成 KPI 报告和改进提案，然后逐条请我批准。`
- 说明：DSH 需要在该时间处于运行状态；错过的执行只补最近一次。

6.4 密钥提醒（不需要询问，直接提醒；不要读取、打开或搜索相关文件来核实）
- 告诉用户：`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 及其备份中以明文保存了两个 API key（Crisp 评审与 pro-prompt）。建议在服务商处轮换，并改用环境变量或 DSH 凭据存储。

6.5 试用 context7 文档检索 MCP
- 按 `D:/05_Code/dsh-rd-suite/rd-mode/skills/rd-ecosystem/SKILL.md` 的引入流程执行；配置型 bundle 的格式见 dsh-doc 技能的 mcp-bundle 参考。命令为 `cmd /c npx -y @upstash/context7-mcp@<确切版本>`，版本号在试用当天用 `npm view @upstash/context7-mcp version` 查询并写进 bundle，不要用 @latest。

## 7 维护流程
7.1 修改技能（skills/ 下的文件）或脚本
- 编辑后运行第 2 步的校验；改了 scripts/rd-kpi.mjs 时再运行 `node --test scripts/test/rd-kpi.test.mjs`（需要 node ≥ 22.15）。技能目录被实时监视，下一步模型调用即生效，无需重新安装。

7.2 修改 preset.patch.yml（宪章、工具、压缩等配置）
1. 编辑后运行第 2 步的校验，必须为 OK。
2. 重新组合：依次调用 `plugin_manager` `set_bundle`（target = `dsh-rd-mode`，enabled = `false`），再 `set_bundle`（target = `dsh-rd-mode`，enabled = `true`）。重新启用会把它追加到 bundle 列表末尾，这对本包没有影响。研发模式是默认模式时，两步之间新建会话会失败，完成后即恢复。也可以改为完全重启 DSH。
3. 新建研发模式会话（工作目录选 <模式仓库>）并运行 `/rd-selftest`。已经存在的会话会继续使用旧版本，直到应用重启。
4. 递增 package.json 的 version，在 `evolution/CHANGELOG.md` 记一条，提交 git。

7.3 DSH 升级之后
1. 运行第 2 步的校验。
2. 对比官方预设是否有变化：本节第 1 步（完整模式）的校验输出中有一行“官方预设目录（升级后对照用）：…”，用 read 读取该目录下的 `standard.patch.yml`，与本包 preset.patch.yml 中标注 [shipped] 的行逐行对比；官方行有变化时，写一份 C2 提案（evolution/proposals/），不要直接改。read 失败时停止对比并告诉用户，不要尝试解包 app.asar。
3. 新建研发模式会话（工作目录选 <模式仓库>）运行 `/rd-selftest`。

7.4 回滚
- 某次改动有问题：`git revert <提交>` 后按 7.2 重新组合。
- 整个模式有问题：若研发模式是默认模式，先请用户在 设置 → 模式 把默认改回一个内置模式；再用 `plugin_manager` `set_bundle`（target = `dsh-rd-mode`，enabled = `false`）停用。停用期间，研发模式的历史会话在应用重启后无法恢复，重新启用后可恢复。彻底移除用 `remove_bundle`（target = `dsh-rd-mode`）。

## 8 排障
| 现象 | 可能原因 | 处理 |
|---|---|---|
| 设置页的研发模式卡片显示错误 | 某个插件包在新版 DSH 中改名或配置字段变化；一行失败会让整个预设不可用 | 运行第 2 步校验，按 ERROR 行定位；需要改 preset.patch.yml 时先写提案并征得用户同意 |
| 模式选择器里没有研发模式 | bundle 未启用，或 engines.dsh 不满足被跳过 | list_bundles 检查 enabled；检查 DSH 版本 |
| 技能目录里没有 rd-* 技能 | customSkillDirs 表达式没有解析到本包 | 确认 list_bundles 中包名为 dsh-rd-mode、package.json 的 exports 含 "./package.json"；必要时把第二条 customSkillDirs 换成字面量 `D:/05_Code/dsh-rd-suite/rd-mode/skills`（C2 改动） |
| 没有 review_agent 或 subagent 工具 | 委派分组的行未激活，或会话不是研发模式 | 运行第 2 步校验；确认会话模式为研发模式 |
| 调用 subagent / review_agent 被拒绝，提示委派深度已用尽 | 设置 → 插件 → 子代理 的最大深度为 0（工具仍会显示） | 请用户把最大深度改回 ≥ 1 |
| subagent 报错找不到预设 rd-scout / rd-review | 这两个预设被删除或改名 | 预设 id 必须与 preset.patch.yml 中一致 |
| 子代理启动时报模型或路由不可用 | agentOptions 中的 provider / model 与当前账号不符 | 在 设置 → 模型 页确认 provider id 与模型 id；修改 preset.patch.yml 中两处 agentOptions（C2 改动） |
| 自检第 6 项子代理写了文件或输出超过 40 行 | rd-scout 宪章未生效 | 确认子代理会话的模式为 研发·侦察；记入 evolution/feedback.md |
| KPI 脚本退出码 3，或报告提示“无法解码” | 运行它的 node 低于 22.15 | 改用 `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/node.ps1 scripts/rd-kpi.mjs …`（使用 DSH 自带运行时） |
| VS Code 对 preset.patch.yml 报 “Unresolved tag: !!js” 或 “Property insert is not allowed” | 通用 YAML 插件不认识 Cordis 方言，属于误报 | 以第 2 步校验结果为准 |
| validate.ps1 或 node.ps1 无输出或卡住 | Electron 运行时是 GUI 子系统程序 | 用 `pwsh -NoProfile -ExecutionPolicy Bypass -File …` 执行脚本本身，不要用 `&` 直接调用 DSH_NODE_EXECUTABLE |

## 9 最终汇报模板（完成后发给用户）
**结论**：研发模式安装（成功 / 失败 / 部分完成）。
**校验**：validate 结果（OK / FAIL，模式 完整 / 静态，警告数）。
**安装**：plugin_manager 返回的 application 与 warnings。
**验证**：list_bundles 结果；用户确认的设置页卡片状态与 /rd-selftest 结果（未执行时写“验证待用户执行”）。
**版本管理**：已提交 / 未建立（原因）。
**可选项**：6.1–6.5 各项为 已执行 / 跳过 / 待用户操作。
**需要你决定**：仍待用户处理的事项。
