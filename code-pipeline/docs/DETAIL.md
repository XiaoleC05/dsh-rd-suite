# 代码修正

英文名：Code pipeline。侧边栏面板加两个 Agent 工具，对选中的代码文件套用一套固定的代码风格预设。

## 功能

- **文件树** —— 扫描工作区根目录，按文件夹嵌套展示目录与代码文件，并标注每个文件的语言。
- **选取** —— 可勾选单个文件、多个文件、整个文件夹（选中其下所有可标准化文件），或按 **全选** 选中所有预设覆盖的文件。头部始终显示 `已选 / 可选`。
- **预设** —— 十种内置语言预设：Go、TypeScript、JavaScript、Python、HTML、Makefile、CSS、C++、Shell、PowerShell。每条规则带有来源与分级（T1 官方文本、T2 官方工具默认、T3 事实标准、T0 本地决策）。
- **检查** 只报告将要发生的变更，绝不写盘；**修正** 才写入变更。结果给出每个文件的行数/字节变化，行数未变但字节变化较大时会提示复查。

## 配置

本插件没有 Plugin Manager 配置表单：DSH 0.2.2 的自绘配置页需要 `schemastery` 依赖，而本包无法从 profile 解析它。配置写在 profile 的 `cordis.patch.yml` 行上，改完由宿主 HMR 重载；面板顶部会显示当前上限与配置警告。

```yaml
- id: code-pipeline
  name: dsh-code-pipeline
  config:
    maxFiles: 4000          # 100..20000，默认 4000
    maxBytes: 2097152       # 65536..8388608，默认 2 MiB（单文件）
```

越界或非法值会回退/收敛并在面板显示警告，不会阻止插件启动。

## 使用方法

1. 打开左侧栏，选择 **代码修正**。
2. 若注册了多个工作区，在头部选择目标工作区；切换工作区会清空当前选择与结果。
3. 勾选需要的文件，或点击 **全选**。
4. 先点 **检查** 查看结果，再点 **修正** 写入。修正没有撤销，建议先用 git 确认工作区状态。

在对话中也可以通过 `code_list_files` 与 `code_standardize`（`mode: "report"` 或 `"fix"`）完成同样的工作。

## 安全与边界

- **插件 HTTP 路由走宿主信任门禁。** 面板的三个接口在读取请求体/扫描文件前先调用宿主 Connection 服务校验 Host、Origin 与浏览器凭据：跨站请求 403、无凭据 401、宿主安全服务缺失 503；同源面板请求正常。
- **工作区约束。** 面板只接受已注册工作区；Agent 工具只接受已注册工作区或当前会话工作目录，显式 `root` 不再能指向任意目录。
- **运行期与扫描期同一套规则。** 依赖/构建目录（`node_modules`、`dist` 等）、忽略规则命中的文件、压缩生成物、超过 `maxBytes` 的文件、非 UTF-8 文件、指向工作区之外的链接都不会被读取或写入，即使调用方显式点名路径。忽略规则来自工作区根目录的 `.gitignore` 与 `.dsh-code-pipeline-ignore`（仅支持精确名、`/` 锚点与 `*`；Windows 上大小写不敏感）。
- **只有十种 P0 语言有预设。** 其他代码文件会用 `跳过` 标记列出，复选框禁用，永远不会被修改。报告里也会给出跳过原因列表。
- **非代码文件不会出现。** 二进制资源、图片、压缩包与锁文件在构建树之前就被过滤；`node_modules`、`dist`、`build`、`target`、`.venv` 之类的目录不会被遍历，因此全选不会选中它们。
- **接口与函数级规范化不在范围内。** 预设只包含各自规则文件中列出的规则，不会额外套用其他规则。
- **风格问题只报告、不改写。** Biome 2.6 把几乎全部风格修复（`useConst`、`noDoubleEquals`、`useTemplate`）归类为 *unsafe*，因此 full 深度的预设只格式化文件并列出剩余 lint 诊断（文件、行号、规则、消息），不会自动套用这些修复。问题列表最多回传 40 条（错误优先），每个文件的问题总数单独显示。
- **Makefile 与 PowerShell 没有格式化引擎。** 它们只使用确定性文本规则（Makefile 的 recipe 行 tab 化，PowerShell 的缩进与行尾），报告深度为 `text`。可选格式化引擎缺失时，对应语言降级为同样的文本规则，报告会标记为 `degraded`——不会把没做的工作报告成完整通过。

## 引擎

| 引擎 | 语言 | 包 |
| --- | --- | --- |
| Biome (WASM) | TypeScript、JavaScript、HTML、CSS | `@biomejs/wasm-nodejs` |
| gofmt (WASM) | Go | `@wasm-fmt/gofmt` |
| ruff format (WASM) | Python | `@wasm-fmt/ruff_fmt` |
| clang-format (WASM) | C++ | `@wasm-fmt/clang-format` |
| shfmt (WASM) | Shell | `@wasm-fmt/shfmt` |
| 内置文本规则 | Makefile、PowerShell | — |

每次运行都会复查自己的输出：如果第二遍还会改变文件，该文件会以 `not-idempotent` 报告并且不写入。
