/**
 * 工作台页签构成：代码修正是自动的，不该再占一个页签。
 *
 * 这条断言防的是「有人把面板加回来」：能力说明与页签注册必须一起改。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const codePipeline = readFileSync(join(root, 'client-sources', 'code-pipeline.js'), 'utf8')
const hub = readFileSync(join(root, 'client-sources', 'hub-rd.js'), 'utf8')

test('代码修正模块不再注册工作台页签', () => {
  assert.doesNotMatch(codePipeline, /pages\.push\(\{ id: PANEL_ID/u, '代码修正面板应当已退出工作台')
  assert.match(codePipeline, /不再占用工作台页签/u, '要留下为什么去掉的说明')
})

test('工具与字典仍然保留：去掉的是界面，不是能力', () => {
  // 工具定义在服务端模块，字典在客户端：两边都要在。
  const server = readFileSync(join(root, 'code-pipeline', 'index.js'), 'utf8')
  for (const symbol of ['code_standardize', 'code_list_files']) {
    assert.ok(server.includes(symbol), `缺少工具 ${symbol}：移除面板不该连带删掉能力`)
  }
  assert.ok(codePipeline.includes('ctx.locale.register'), '客户端字典注册要保留（概览仍在用）')
})

test('能力说明写清「全自动、不占页签」', () => {
  const zhLine = hub.split('\n').find((line) => line.includes('代码修正|'))
  assert.ok(zhLine !== undefined, '能力列表里应当还有代码修正这一条')
  assert.match(zhLine, /全自动/u)
  assert.doesNotMatch(zhLine, /面板只用来复查/u, '旧说法要一起改掉')
})

test('概览里不再出现指向已删面板的提示', () => {
  assert.doesNotMatch(hub, /代码修正面板不可用/u)
})
