/**
 * 工作台页签构成：代码修正是自动的，不该占页签；界面删干净后模块只做占位。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const codePipeline = readFileSync(join(root, 'client-sources', 'code-pipeline.js'), 'utf8')
const server = readFileSync(join(root, 'code-pipeline', 'index.js'), 'utf8')
const hub = readFileSync(join(root, 'client-sources', 'hub-rd.js'), 'utf8')

test('客户端模块不再注册页签，也不再有界面代码', () => {
  assert.doesNotMatch(codePipeline, /pages\.push/u, '不该再往页签列表里塞东西')
  for (const symbol of ['PipelinePage', 'FileRow', 'DirRow', 'ResultView', 'FileTable', 'Legend']) {
    assert.equal(codePipeline.includes(symbol), false, `死代码没清干净：${symbol}`)
  }
  assert.ok(codePipeline.length < 2000, `客户端模块应当只剩占位，实际 ${codePipeline.length} 字符`)
})

test('工具仍完整保留在服务端：去掉的是界面，不是能力', () => {
  for (const symbol of ['code_standardize', 'code_list_files']) {
    assert.ok(server.includes(symbol), `缺少工具 ${symbol}`)
  }
})

test('能力说明写清「全自动、不占页签」', () => {
  const zhLine = hub.split('\n').find((line) => line.includes('代码修正|'))
  assert.ok(zhLine !== undefined, '能力列表里应当还有代码修正这一条')
  assert.match(zhLine, /全自动/u)
  assert.doesNotMatch(zhLine, /面板只用来复查/u)
})

test('概览里不再出现指向已删面板的提示', () => {
  assert.doesNotMatch(hub, /代码修正面板不可用/u)
})
