# 研发套件

一个安装项装好整套研发能力：研发模式三个预设、模式卡片增强、context7 文档检索、代码格式化与 GitHub Issue 优先流程。

## 包含

- **三个预设**：研发模式（rd）、研发·侦察（rd-scout）、研发·验收（rd-review），含技能与宪章。
- **模式卡片**：三张卡片显示「模式说明 / 如何使用」，与内置模式一致。
- **文档检索**：context7 MCP 的 `resolve-library-id` 与 `query-docs`（以及资源工具）。
- **代码工具**：`code_list_files`、`code_standardize` 与侧栏代码标准化面板。
- **GitHub 流程**：`github_workflow` 与 Issue 优先提示词（默认关闭，可在设置里开启）。

## 用法

安装后在设置 → 模式里选择「研发模式」；代码工具与文档检索对所有模式可用。想只关掉其中一项，用插件页对应行的单行开关即可。

## 维护

本 bundle 的源码全部在本仓库内（`code-pipeline/`、`github/`、`skills/`、`rd-mode/`、`client-sources/`），不依赖其他插件仓库。修改界面代码后运行 `node scripts/build-client.mjs`；修改 loader 行则编辑根 `cordis.patch.yml`，然后重载 bundle。

## 已知限制

- 三个界面合并在同一个浏览器模块里，任一界面报错会影响整块界面的加载。
- 预设与浏览器模块的模块 id 固定为包名 `dsh-rd-suite`，改名需同步改 `client.js` 与预设里的技能目录表达式。
