---
name: rd-code-standards
description: 编码规范与代码审查标准：规范优先级、格式化与静态检查的执行方式、通用编码规则、各语言速查、安全编码、人工审查清单与提交粒度。L2/L3 写或改源代码、代码审查时加载；L1 微改不加载。
---
# 编码规范与代码审查

## 1 规范优先级（高 → 低）
1. 项目显式规则与配置：AGENTS.md / CLAUDE.md、.editorconfig、prettier / biome / eslint 配置、pyproject.toml / ruff.toml、rustfmt.toml、golangci 配置、CI 中的检查步骤。
2. 框架官方工具强制的规则（如 eslint-plugin-vue、Android Lint）。
3. 语言官方规范：Go（gofmt + Effective Go）、Python（PEP 8 / PEP 257）、Rust Style Guide、C#（Microsoft 编码约定）。
4. 框架官方建议（没有工具强制的部分）。
5. 工具默认值。
两个权威来源冲突时，在报告中同时列出并请用户决定，不自行发明折中规则。

## 2 格式化与静态检查
- 仓库自带格式化或 lint 命令（package.json scripts、Makefile、pre-commit、CI 配置）时，只对改动文件运行仓库命令。
- 仓库没有相关配置、且语言属于 code-pipeline 支持的 10 种（Go、TypeScript、JavaScript、Python、HTML、CSS、C++、Shell、Makefile、PowerShell）时：先 `code_standardize {paths:[改动文件], mode:"report"}`，看过结果再 `mode:"fix"`。
- code-pipeline 的 JS/TS 预设是单引号、无分号、行宽 100。与仓库既有风格冲突时不要 fix，保持仓库风格。
- 只格式化你改动的文件，不做全仓重排。
- 项目有类型检查就必须运行：`tsc --noEmit`、mypy / pyright、`go vet`、`cargo check`、`dotnet build`。
- 检查工具无法运行时如实说明原因，禁止当作“没有问题”。格式合规与风格合规分开报告，不合并成一个百分比。

## 3 通用编码规则
先读后写；一致性优先于个人偏好；最小变更；先搜索并复用已有实现；一个函数一个职责；有意义的命名（不用 tmp、data、foo）；不用魔法值，提取命名常量；错误必须处理或显式上抛，不吞异常；不保留死代码和注释掉的代码；不引入不必要的依赖；不过度设计（不为想象中的需求增加抽象层）。

## 4 语言速查（项目配置优先）
- Go：gofmt；MixedCaps；缩写大小写一致（URL、ID）；包名为小写单词；导出符号有以其名字开头的注释；错误信息小写且无句末标点；不用 `_` 丢弃错误；普通错误不 panic；用 `%w` 包装错误。
- TypeScript：strict + noUncheckedIndexedAccess；不用显式 any（用 unknown 再收窄）；类型导入用 `import type`；优先 const；类型 PascalCase，变量与函数 camelCase。
- JavaScript：`===` / `!==`；优先 const；无未使用变量；异步错误必须处理。
- Python：ruff format（88 列）；函数与变量 snake_case，类名 CapWords；与 None 比较用 `is`；不用裸 except；公共函数有类型注解与 docstring；路径用 pathlib。
- C / C++：Google 风格、行宽 100；用 RAII，不裸用 new / delete。
- Shell：`set -euo pipefail`；变量展开加引号；首行写 shebang。PowerShell：Verb-Noun 命名并使用批准动词；4 空格缩进；需要在 Windows PowerShell 5.1 运行且含中文的 .ps1 存为 UTF-8 BOM，否则只用 ASCII。
- HTML / CSS：标签与属性小写、属性值用双引号；CSS 一行一个声明，0 值不带单位。
- Rust：rustfmt + clippy。Java / Kotlin：遵循项目配置，否则 google-java-format / ktlint。SQL：见 rd-data。

## 5 安全编码
外部输入在边界处校验；SQL 用参数化查询；调用外部命令时用参数数组或正确转义，不拼接用户输入；密钥只从环境变量或密钥管理读取，不写进代码、日志与提交；最小权限；依赖固定版本；反序列化不可信数据前校验结构。

## 6 人工审查清单（工具查不出，必须看代码判断）
命名是否贴合含义；函数与模块是否单一职责；注释与实现是否一致；业务逻辑是否符合规格卡；分层与依赖方向是否合理；测试是否真正验证行为；错误路径与边界条件；明显的性能问题（循环内 I/O、N+1 查询、无界内存）；向后兼容性与迁移。

## 7 提交（仅在用户要求提交时）
Conventional Commits：`type(scope): 简述`（feat / fix / refactor / test / docs / chore / perf / style）；一个模块或一个独立问题一个提交，只暂存相关文件；提交前验证已通过；正文写明原因与验证方式。不推送、不改写历史，除非用户明确要求。开启 GitHub issue-first 设置时，按 github_workflow 的流程执行。
