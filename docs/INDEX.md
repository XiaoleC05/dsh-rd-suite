# 文档索引

按「先看什么」排序。每份文档一句话用途，`test/doc-index.test.mjs` 保证不漏、不虚。

## 认识这个包

| 文档 | 用途 |
|---|---|
| [README](../README.md) | 安装、结构、门禁、迭代进度：先读这个 |
| [DESIGN](DESIGN.md) | 设计取舍：为什么是一个模式、为什么分级、品牌命名 |
| [DETAIL](DETAIL.md) | 实现明细：模块、路由、面板与数据流 |
| [REGISTRY](REGISTRY.md) | 能力登记簿：工具 / 技能 / 面板路由三张表 |

## 怎么干活

| 文档 | 用途 |
|---|---|
| [ITERATION](ITERATION.md) | 每轮迭代的固定协议：复盘 → 建单 → 实现 → 验证 → 提交 → 记账 |
| [ITERATIONS](ITERATIONS.md) | 逐轮账本：每轮做了什么、用了哪个技能 |
| [CHECKLIST](CHECKLIST.md) | 十轮一次的横向体检台账 |

## 交付与发布

| 文档 | 用途 |
|---|---|
| [CHANGELOG](CHANGELOG.md) | 开发向变更日志：文件名、函数名、用例数 |
| [SKILL-VERSIONS](SKILL-VERSIONS.md) | 技能版本表（脚本生成） |
| [OVERFLOW](OVERFLOW.md) | 五项体积上限与超限后的行为 |

## 参考与历史

| 文档 | 用途 |
|---|---|
| [REFERENCES](REFERENCES.md) | 外部参考与借鉴来源 |

## 技能内参考

技能正文按需加载的参考文件，都由对应的 `SKILL.md` 引用：

| 技能 | 参考文件 |
|---|---|
| rd-copy | before-after.md（文案对照）、release-notes.md（发布说明模板） |
| rd-ecosystem | candidates.md（能力候选）、run-code-examples.md（批量调用示例）、subagent-templates.md（子代理简报） |
| rd-retro | kpi.md（指标口径）、pitfall-template.md（踩坑五段） |
| rd-spec | spec.md / plan.md / tasks.md（规格三件套模板） |
| rd-web | frontend-checklist.md（前端自检）、landing-copy.md（落地页文案） |
