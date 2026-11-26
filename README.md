# dsh-rd-suite · 研发套件

一个 DSH bundle（一个安装项，一个仓库）。研发相关的五个插件现在是这个包里的目录与一个合并后的浏览器模块，不再依赖任何外部插件包。

## 组成

| 目录 / 文件 | 来源 | 提供 |
|---|---|---|
| `rd-mode/` | 原 dsh-rd-mode 仓库 | 三个预设的源 patch、技能文档、周复盘与校验脚本 |
| `skills/` | 同上 | 研发模式运行时加载的 rd-* 技能（预设按包名解析到本目录） |
| `code-pipeline/` | 原 code-pipeline | `code_list_files`、`code_standardize` 与代码标准化侧栏 |
| `github/` | 原 github-issue-first-workflow | `github_workflow` 与 Issue 优先流程提示词（默认关闭） |
| `client-sources/cards.js` | 原模式卡片增强 | 内置 Agent 预设页的 vendored 客户端（MIT，见文件头） |
| `client.js` | 生成 | 三个界面合成的唯一浏览器模块 |
| `index.js` | — | 卡片行的宿主半（空实现，仅用于挂载客户端） |
| `cordis.patch.yml` | 手写 | 所有 loader 行（预设 3 行 + 卡片 + context7 + 代码工具 + GitHub 流程） |

## 安装

```
plugin_manager install_bundle target=D:/05_Code/dsh-rd-suite
```

## 维护

- 改 `code-pipeline/` 或 `github/` 的宿主代码：直接改，重启 DSH 或在插件页把 `dsh-rd-suite` 关再开。
- 改三个界面之一：改 `client-sources/<name>.js`，然后运行 `node scripts/build-client.mjs` 重新生成 `client.js`，再重载 bundle。
- 改预设：改 `rd-mode/preset.patch.yml`（源），把对应内容同步进根 `cordis.patch.yml`（DSH 实际读取的是根文件）；或直接改根文件。
- 增删一个成员：改根 `cordis.patch.yml` 的行；若涉及界面，再改 `scripts/build-client.mjs` 的 `SOURCES`。
- 只停用其中一项：`set_plugin` 关闭对应行（行 id 未变）。
- 整体停用：`set_bundle` target=`dsh-rd-suite`，enabled=`false`。

## 注意

- 一个 bundle 只有一个客户端模块（模块 id = 包名），所以三个界面必须合成 `client.js`；任一界面报错都会影响这个模块的加载。
- 宿主行用包内子路径入口（`dsh-rd-suite/code-pipeline`、`dsh-rd-suite/github`），预设行仍引用 DSH 自带的包。
- 合并只减少安装项数量，不改变每轮请求的工具定义与提示词成本。
- 旧仓库（dsh-rd-mode、code-pipeline、github-issue-first-workflow 等）已不再被 DSH 引用，仅作为历史保留。
