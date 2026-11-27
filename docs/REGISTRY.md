# 能力登记簿

本文件记录本包当前对外提供的能力，供 `rd-ecosystem` 判断「已有 / 该新增 / 该合并」。
三张表都由脚本核对，改代码不改这里会被测试发现。

## 工具

九个，源码即事实，`node scripts/tool-inventory.mjs --strict` 与文档对账：

| 工具 | 作用 |
|---|---|
| `code_list_files` | 列出工作区代码文件与语言，判断 P0 预设是否支持 |
| `code_standardize` | 按语言预设格式化，report 只查、fix 改写 |
| `github_workflow` | 预检 / 建单 / 开分支 / 开 PR / 合 PR / 关单 / 发版 |
| `memory_save` | 写入四类长期记忆（技术模板 / 踩坑 / 修复方案 / 策略） |
| `memory_list` | 分页列出记忆，按类型与关键词筛选 |
| `memory_search` | 开工前检索可复用做法 |
| `memory_read` | 读取单条记忆全文 |
| `memory_import` | 导入外部记忆集 |
| `memory_export` | 导出为可迁移文本 |

## 技能

十个，版本表由 `node scripts/skill-version.mjs --write` 生成，见 [SKILL-VERSIONS.md](SKILL-VERSIONS.md)。
路由表在宪章 §4，`test/skill-routing.test.mjs` 保证「提到的都存在、存在的都被路由」。

## 面板路由

| 路由 | 作用 |
|---|---|
| `/status` | 版本、轮次、审计历史与工具耗时 |
| `/list`、`/entry` | 记忆库列表与单条全文 |
| `/stats` | 容量、未使用条目、命中排行 |
| `/export`、`/forget` | 导出与删除 |

## 维护方式

新增能力时按顺序改三处：源码 → 本文件对应表 → 跑对应的对账脚本。
三处不一致时，`tool-inventory`、`skill-version`、`skill-routing` 三个测试会分别报出来。
