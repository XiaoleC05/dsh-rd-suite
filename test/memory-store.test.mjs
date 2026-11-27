/**
 * 记忆库存取层的行为验证。
 *
 * 全部用真实临时文件跑：原子写后能读回、同标题合并而不是新增、类型与长度校验、
 * 列表过滤与分页、损坏文件不覆盖。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import {
  emptyDocument,
  listEntries,
  memoryFile,
  normalizeEntry,
  normalizeTitle,
  readMemory,
  upsertEntry,
  writeMemory,
} from '../memory/lib/store.js'

let workspace
let file

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-memory-'))
  file = join(workspace, 'memory.json')
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

/** 造一条合法输入。 */
function input(overrides = {}) {
  return {
    type: 'pitfall',
    title: 'Windows 路径要转成反斜杠再写沙箱白名单',
    body: '现象：写入被拒。根因：白名单里是正斜杠。做法：统一用 path.resolve 后再比较。',
    tags: ['Windows', 'Sandbox'],
    ...overrides,
  }
}

test('空库读取不报错，文件不存在也有确定结果', () => {
  const { document, notice } = readMemory(file)
  assert.deepEqual(document, emptyDocument())
  assert.equal(notice, null)
})

test('原子写后能原样读回', () => {
  const document = emptyDocument()
  const normalized = normalizeEntry(input())
  assert.equal(normalized.ok, true)
  upsertEntry(document, normalized.entry)
  writeMemory(file, document)
  assert.ok(existsSync(file))
  const again = readMemory(file)
  assert.equal(again.document.entries.length, 1)
  assert.equal(again.document.entries[0].title, input().title)
  assert.deepEqual(again.document.entries[0].tags, ['windows', 'sandbox'])
  assert.equal(existsSync(`${file}.tmp`), false, '临时文件必须被 rename 掉')
})

test('同类型同标题是更新而不是新增', () => {
  // 用干净的文档，避免依赖上一个用例写入的内容。
  const document = emptyDocument()
  const first = upsertEntry(
    document,
    normalizeEntry(input({ body: '第一版正文，够长就行。' })).entry,
  )
  const second = upsertEntry(
    document,
    normalizeEntry(input({ body: '第二版正文，补了根因与验证方式。' })).entry,
  )
  assert.equal(first.id, second.id)
  assert.equal(second.action, 'updated')
  assert.equal(document.entries.length, 1)
  assert.match(document.entries[0].body, /第二版/u)
  assert.equal(document.entries[0].revisions, 1)
})

test('标题归一化后相同的也合并', () => {
  const a = normalizeTitle('Windows  路径，要转！')
  const b = normalizeTitle('windows 路径要转')
  assert.equal(a, b)
})

test('类型、标题长度与正文长度都有校验', () => {
  assert.equal(normalizeEntry(input({ type: 'memo' })).ok, false)
  assert.equal(normalizeEntry(input({ title: '短' })).ok, false)
  assert.equal(normalizeEntry(input({ body: '太短' })).ok, false)
  const long = normalizeEntry(input({ body: '长'.repeat(9000) }))
  assert.equal(long.ok, true)
  assert.ok(long.entry.body.endsWith('（已截断）'))
})

test('列表按类型、标签过滤并支持分页', () => {
  const document = emptyDocument()
  upsertEntry(document, normalizeEntry(input()).entry)
  upsertEntry(
    document,
    normalizeEntry(input({ type: 'template', title: '新增工具的注册骨架', tags: ['dsh'] })).entry,
  )
  upsertEntry(
    document,
    normalizeEntry(input({ type: 'strategy', title: '先报告后修正的两段式', tags: ['audit'] }))
      .entry,
  )

  assert.equal(listEntries(document).total, 3)
  assert.equal(listEntries(document, { type: 'template' }).total, 1)
  assert.equal(listEntries(document, { tag: 'sandbox' }).total, 1)
  const page = listEntries(document, { limit: 2, offset: 1 })
  assert.equal(page.entries.length, 2)
  assert.equal(page.total, 3)
  assert.ok(page.entries[0].excerpt.length <= 160)
})

test('损坏的 JSON 不覆盖原文件', () => {
  const broken = join(workspace, 'broken.json')
  writeFileSync(broken, '{ not json', 'utf8')
  const { document, notice } = readMemory(broken)
  assert.deepEqual(document, emptyDocument())
  assert.match(String(notice), /解析失败/u)
  assert.equal(readFileSync(broken, 'utf8'), '{ not json')
})

test('memoryFile 在给目录时把文件放进目录', () => {
  assert.equal(memoryFile(join(workspace, 'nested')), join(workspace, 'nested', 'memory.json'))
})

test('工具注册：memory_save 与 memory_list 都挂上了，参数契约完整', async () => {
  const { apply, inject, name } = await import('../memory/index.js')
  assert.equal(name, 'rd-memory')
  assert.deepEqual(inject, ['tools'])
  const registered = []
  const ctx = { tools: { register: (definition) => registered.push(definition) } }
  const toolsDir = mkdtempSync(join(tmpdir(), 'rd-memory-tools-'))
  apply(ctx, { directory: toolsDir, maxEntries: 50 })
  assert.deepEqual(registered.map((tool) => tool.name).sort(), [
    'memory_list',
    'memory_read',
    'memory_save',
    'memory_search',
  ])
  const save = registered.find((tool) => tool.name === 'memory_save')
  const properties = save.parameters.properties
  assert.deepEqual([...properties.type.enum], ['template', 'pitfall', 'fix', 'strategy'])
  assert.ok(properties.title !== undefined && properties.body !== undefined, '标题与正文必须是参数')
  assert.match(save.description, /long-term memory/u)

  const saved = await save.execute({
    type: 'template',
    title: '新工具注册三步走',
    body: '先 defineTool，再 register，最后用 when 控制可见性。',
    tags: ['dsh'],
  })
  assert.equal(saved.ok, true)
  assert.match(saved.message, /已新增/u)

  const list = registered.find((tool) => tool.name === 'memory_list')
  const listed = await list.execute({ limit: 10 })
  assert.equal(listed.total, 1)
  assert.equal(listed.entries[0].title, '新工具注册三步走')
  rmSync(toolsDir, { recursive: true, force: true })
})

test('写入参数不合法时不落盘', async () => {
  const { apply } = await import('../memory/index.js')
  const registered = []
  const ctx = { tools: { register: (definition) => registered.push(definition) } }
  const otherDir = mkdtempSync(join(tmpdir(), 'rd-memory-tools-'))
  apply(ctx, { directory: otherDir, maxEntries: 50 })
  const save = registered.find((tool) => tool.name === 'memory_save')
  // 类型枚举由工具 schema 兜住，非法值到不了 execute。
  await assert.rejects(
    () =>
      save.execute({ type: 'memo', title: '随便写点什么', body: '这段正文足够长了但是类型不对。' }),
    /invalid arguments/u,
  )
  rmSync(otherDir, { recursive: true, force: true })
})
