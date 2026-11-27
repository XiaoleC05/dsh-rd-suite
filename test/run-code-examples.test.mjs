/**
 * run_code 示例库的校验：语法必须过得去，工具名必须真实存在。
 *
 * 文档示例最容易腐烂的地方有两个：代码本身语法错（复制就报错）、
 * 引用了早已改名的工具。两者都能用机器查。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const file = join(root, 'skills', 'rd-ecosystem', 'references', 'run-code-examples.md')
const markdown = readFileSync(file, 'utf8')

/** 本包已注册的工具名（与 manifest 测试共用同一事实来源）。 */
const KNOWN_TOOLS = new Set([
  'github_workflow',
  'code_standardize',
  'memory_save',
  'memory_list',
  'memory_search',
  'memory_read',
  'memory_import',
  'memory_export',
  'schedule_create',
  'schedule_edit',
  'schedule_list',
  'schedule_view',
  'subagent_fork',
  'run_code',
])

/** 抽出所有 ```js 代码块。 */
function codeBlocks(text) {
  return [...String(text).matchAll(/```js\r?\n([\s\S]*?)```/gu)].map((match) => match[1])
}

const blocks = codeBlocks(markdown)

test('示例数量足够，且明确写了调用形状的边界', () => {
  assert.ok(blocks.length >= 4, `至少四个示例，实际 ${blocks.length}`)
  assert.match(markdown, /调用形状/u, '要说明示例展示的是调用形状')
  assert.match(markdown, /以当轮工具列表为准/u, '要说明工具可用性以当轮为准')
})

test('每个 js 代码块语法都能解析', () => {
  for (const [index, block] of blocks.entries()) {
    assert.doesNotThrow(
      () => new Function(`return (async () => {\n${block}\n})`),
      `第 ${index + 1} 个示例语法不合法`,
    )
  }
})

test('示例里引用的工具名都真实存在', () => {
  const referenced = new Set(
    [...markdown.matchAll(/tools\.([a-z_]+)\(/gu)].map((match) => match[1]),
  )
  assert.ok(referenced.size >= 3, `示例至少引用三个工具，实际 ${referenced.size}`)
  for (const name of referenced) assert.ok(KNOWN_TOOLS.has(name), `示例引用了不存在的工具：${name}`)
})

test('反例存在且写明了为什么不该那样写', () => {
  assert.match(markdown, /不该这么写/u)
  assert.match(markdown, /反例/u)
  assert.match(markdown, /串行|全量回传/u, '反例要说明问题所在')
})

test('示例说明覆盖「什么时候值得用」与不适用场景', () => {
  assert.match(markdown, /什么时候值得用/u)
  assert.match(markdown, /直接调用更清楚|不适用/u)
})
