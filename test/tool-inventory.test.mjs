/**
 * 工具清单对账的验证：两种注册写法都要抽得到，文档漏写要报出来。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  extractToolNames,
  inventory,
  mentionedTools,
  reconcile,
} from '../scripts/tool-inventory.mjs'

test('defineTool 写法能抽出来', () => {
  const source = `
    const a = defineTool({
      name: 'memory_save',
      description: 'x',
    })
  `
  assert.deepEqual(extractToolNames(source), ['memory_save'])
})

test('ctx.tools.register 写法也能抽出来（缩进不影响）', () => {
  const source = `
    ctx.effect(() =>
      ctx.tools.register({
        name: 'code_list_files',
        description: 'y',
      }),
    )
  `
  assert.deepEqual(extractToolNames(source), ['code_list_files'])
})

test('同一文件多个工具都能抽出来，且不重复', () => {
  const source = `
    ctx.tools.register({ name: 'code_list_files' })
    ctx.tools.register({ name: 'code_standardize' })
    ctx.tools.register({ name: 'code_standardize' })
  `
  assert.deepEqual(extractToolNames(source), ['code_list_files', 'code_standardize'])
})

test('真实仓库：至少九个工具，包含 code_standardize 与 memory_search', () => {
  const names = inventory()
  assert.ok(names.length >= 9, `实际 ${names.length} 个`)
  for (const required of [
    'code_standardize',
    'code_list_files',
    'github_workflow',
    'memory_save',
    'memory_search',
  ]) {
    assert.ok(names.includes(required), `清单缺少 ${required}`)
  }
})

test('文档对账：漏写会被点名', () => {
  const names = ['alpha_tool', 'beta_tool']
  const docs = [{ file: 'README.md', text: '这里只提到 alpha_tool' }]
  const result = reconcile(names, docs)
  assert.deepEqual(result.documented, ['alpha_tool'])
  assert.deepEqual(result.undocumented, ['beta_tool'])
})

test('文档里形如工具名的词才计入', () => {
  const mentioned = mentionedTools('memory_save 与 code_standardize，还有不存在的 ghost_tool')
  assert.deepEqual(mentioned, ['code_standardize', 'memory_save'])
})
