# 超限行为

上限定义在 `lib/limits.js` 的 `LIMITS`，超限之后做什么在同一个文件的 `OVERFLOW_POLICY` 里。
`test/overflow-policy.test.mjs` 会校验两边一一对应，并抽查真实行为。

| 上限 | 数值 | 超限后 | 读的人会看到 |
|---|---|---|---|
| `commandOutputBytes` | 1 MiB（1048576） | `truncate` | 保留前 1 MiB，结果标记 truncated |
| `httpBodyBytes` | 2 MiB（2097152） | `reject` | 413 与错误码 `body-too-large` |
| `toolTextChars` | 16000 字符 | `truncate` | 截断并注明「已截断 N 字符」 |
| `listItems` | 200 条 | `page` | 默认前 200 条，用 `offset` 继续取，`total` 给总数 |
| `diagnosticChars` | 400 字符 | `truncate` | 单行诊断加省略号，全文去日志 |

## 三种策略的意思

- **truncate**：保留可用的部分，并**标明截掉了多少**。只说「已截断」而不给数量，读的人无法判断该不该回头取全文。
- **reject**：明确失败并给出错误码。请求体这类东西截断没有意义——半个 JSON 比明确报错更难查。
- **page**：不丢数据，只限制单次返回量。列表类数据一律走这条，`total` 让调用方知道还有多少。

## 新增上限时

1. 在 `LIMITS` 里加一项；
2. 在 `OVERFLOW_POLICY` 里给策略与「读的人会看到什么」；
3. 在本页表格加一行；
4. 跑 `node --test test/overflow-policy.test.mjs`——缺任何一处都会红。
