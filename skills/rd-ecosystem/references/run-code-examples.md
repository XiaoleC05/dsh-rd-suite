# run_code 示例库

示例展示**调用形状**，不保证每个工具在你这一轮都能用：以当轮工具列表为准。
下面所有工具名都在本包已注册的工具清单里，测试会核对这一点。

## 什么时候值得用

- 一次要读或改 **3 个以上**同类对象（文件、Issue、记忆条目）。
- 需要在中间做筛选、去重、统计、汇总，再把**结果**带回上下文。
- 需要按条件重试，而不是把失败的调用原样交给模型重发。

只调一次工具、或者需要看每一步中间输出时，直接调用更清楚。

## 一、批量读取后汇总

```js
const targets = ['#12', '#13', '#14']
const opened = []
for (const issue of targets) {
  const result = await tools.github_workflow({ action: 'pr_status', pr: issue })
  if (result.ok === true) opened.push({ issue, state: result.state, failed: result.checksFailed ?? 0 })
}
return { total: opened.length, failing: opened.filter((item) => item.failed > 0) }
```

## 二、扇出扫描再合并

```js
const roots = ['code-pipeline', 'github', 'memory']
const audits = await Promise.all(
  roots.map((root) => tools.code_standardize({ root, mode: 'report' })),
)
const needsFix = audits.reduce((sum, audit) => sum + (audit.needsFix ?? 0), 0)
return { scanned: roots.length, needsFix, clean: needsFix === 0 }
```

## 三、筛选与统计替代逐条翻看

```js
const found = await tools.memory_search({ query: '沙箱 ACL', limit: 20 })
const byType = {}
for (const entry of found.entries ?? []) {
  byType[entry.type] = (byType[entry.type] ?? 0) + 1
}
return { hits: found.total ?? 0, byType, top: (found.entries ?? [])[0]?.title ?? null }
```

## 四、带重试的串行写

```js
async function withRetry(call, attempts = 2) {
  let last
  for (let index = 0; index < attempts; index += 1) {
    last = await call()
    if (last.ok === true || last.retryable === false) return last
  }
  return last
}
const saved = await withRetry(() =>
  tools.memory_save({ type: 'pitfall', title: '示例标题', body: '示例正文，够十个字符。' }),
)
return { ok: saved.ok === true }
```

## 不该这么写

```js
// 反例：一个循环里逐条 await，且把全部原始结果带回上下文
const all = []
for (const file of files) all.push(await tools.code_standardize({ root: file, mode: 'report' }))
return all
```

反例的问题不是语法，而是把「批量」写成「串行 + 全量回传」：既慢又把上下文塞满。
正确做法是像示例二那样并发，并且只回传汇总值。
