# 基准任务集（回归评测）

用途：修改宪章或预设配置（C2 及以上）前后各跑一遍，确认没有退化；平时不需要运行。真实使用中的 KPI（rd-kpi.mjs）是主要评价来源，基准任务用来做受控对比。

## 运行方式
1. 首次使用前，在研发模式中把“生成基准夹具”作为一个 L2 任务执行：按下面每张任务卡在 `evolution/bench/fixtures/<编号>/` 生成最小仓库（含 git init 与初始提交），并写 `evolution/bench/check.mjs <编号>` 自动检查脚本。夹具与检查脚本本身也要通过 review_agent 验收。
2. 每次评测：为每张卡新建一个研发模式会话，工作目录设为对应夹具目录，原样粘贴“提示词”。会话结束后在模式仓库运行 `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/node.ps1 evolution/bench/check.mjs <编号>`，再运行 `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/node.ps1 scripts/rd-kpi.mjs --days 1` 记录 token。
3. 结果写入 `evolution/kpi/bench-<YYYY-MM-DD>.md`：每张卡的检查结果（PASS/FAIL）、请求数、上下文 token 合计。运行后用 `git checkout . && git clean -fd` 还原夹具（只在夹具目录内执行）。

## 任务卡
| 编号 | 级别 / 领域 | 夹具 | 提示词 | 自动检查 | 流程检查 |
|---|---|---|---|---|---|
| B1 | L1 / Python | calc.py 中 mean(xs) 对空列表抛 ZeroDivisionError；tests/test_calc.py 已有一个失败用例 | “mean([]) 应该返回 0.0，修复它。” | pytest -q 全部通过；git diff 只涉及 calc.py（以及可选的测试文件） | 最终回答有【L1】与“验证：”行 |
| B2 | L2 / Node CLI | wc.mjs 统计行数，带 node --test 测试 | “给 wc.mjs 加一个 --words 参数统计单词数，并更新 README。” | node --test 通过且有新用例；README 提到 --words | 有规格卡与 AC 表，合计 x/y 通过 |
| B3 | L2 / 网站 | 只有 brief.md：虚构的本地优先 Markdown 笔记应用 NoteLite，主转化动作“免费下载” | “按 brief.md 做一个单页落地页（index.html + styles.css）。” | 只有一个 h1；“免费下载”出现 ≥ 3 次；所有 img 有 alt；html 有 lang；meta description 70–160 字符；不含 references/landing-copy.md 列出的空话词 | 报告列出待替换素材清单；加载过 rd-web |
| B4 | L2 / 数据 | orders.csv 含重复 order_id 与空值；expected.csv 为正确结果 | “按渠道统计每日营收（按 order_id 去重，排除空金额），输出 daily_revenue.csv，并给出数据质量检查。” | 输出与 expected.csv 一致；连续运行两次结果相同 | 报告写明输入输出行数与校验结果；加载过 rd-data |
| B5 | L3 / 重构 | 一个模块的函数签名需要从位置参数改为选项对象，有 3 个调用方与测试 | “把 parse(input, strict, locale) 改成 parse(input, { strict, locale })，保持行为不变。” | 测试全部通过；3 个调用方都已更新 | 规格卡与计划一次提交批准；调用过 review_agent；VERDICT 为 PASS |
| B6 | L0 / 问答 | 一个带 config/ 目录的小项目 | “日志级别是在哪里配置的？” | git status 干净（没有改动） | 回答引用 文件:行；没有调用写入类工具 |

## 判定
- 每张卡的自动检查与流程检查都通过才算 PASS。
- 与上一次评测相比，任何一张卡从 PASS 变为 FAIL，或上下文 token 合计增加超过 30%，都视为退化，对应改动需要回滚或修正后重测。
