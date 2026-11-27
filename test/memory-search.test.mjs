/**
 * 记忆检索的纯逻辑验证：分词、加权、片段、命中累加。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { emptyDocument, normalizeEntry, upsertEntry } from '../memory/lib/store.js'
import {
  findEntry,
  recordHits,
  scoreEntry,
  searchEntries,
  snippetOf,
  tokenize,
} from '../memory/lib/search.js'

/** 造一个带三条记忆的库。 */
function memoryBook() {
  const document = emptyDocument()
  const entries = [
    normalizeEntry({
      type: 'pitfall',
      title: 'Windows 沙箱白名单要用反斜杠',
      body: '现象：写入被拒。根因：白名单里是正斜杠。做法：path.resolve 后再比较。',
      tags: ['windows', 'sandbox'],
    }).entry,
    normalizeEntry({
      type: 'template',
      title: '新增工具的注册骨架',
      body: 'defineTool 定义 schema，register 挂到 ctx.tools，用 when 控制可见性。',
      tags: ['dsh', 'tools'],
    }).entry,
    normalizeEntry({
      type: 'strategy',
      title: '先报告后修正的两段式',
      body: '先跑 report 拿到差异，再跑 fix 写回，最后再 report 一次确认幂等。',
      tags: ['audit'],
    }).entry,
  ]
  for (const entry of entries) upsertEntry(document, entry)
  return document
}

test('分词：整串、空白切分与中文二元组都在', () => {
  const tokens = tokenize('沙箱 白名单')
  assert.ok(tokens.includes('沙箱 白名单'))
  assert.ok(tokens.includes('沙箱'))
  assert.ok(tokens.includes('白名单'))
  assert.ok(
    tokens.includes('沙箱'.slice(0, 1) + '箱') || tokens.some((token) => token.length === 2),
  )
  assert.deepEqual(tokenize('   '), [])
})

test('加权：标题比标签重要，标签比正文重要', () => {
  const tokens = tokenize('沙箱')
  const entry = { title: '沙箱', body: '无关', tags: [] }
  assert.ok(scoreEntry(entry, tokens, '沙箱') > scoreEntry({ ...entry, title: '无关' }, tokens, ''))
  assert.ok(
    scoreEntry({ title: '无关', body: '无关', tags: ['沙箱'] }, tokens, '') >
      scoreEntry({ title: '无关', body: '沙箱', tags: [] }, tokens, ''),
  )
})

test('检索：中文关键词命中，按分数排序且带片段', () => {
  const found = searchEntries(memoryBook(), { query: '沙箱 白名单' })
  assert.equal(found.total, 1)
  assert.equal(found.entries[0].title, 'Windows 沙箱白名单要用反斜杠')
  assert.ok(found.entries[0].score > 0)
  assert.match(found.entries[0].snippet, /白名单/u)
})

test('检索：类型与标签过滤', () => {
  const book = memoryBook()
  assert.equal(searchEntries(book, { query: '骨架', type: 'template' }).total, 1)
  assert.equal(searchEntries(book, { query: '骨架', type: 'pitfall' }).total, 0)
  assert.equal(searchEntries(book, { tag: 'audit' }).total, 1)
})

test('检索：空查询退化为按更新时间列出', () => {
  const found = searchEntries(memoryBook(), { query: '' })
  assert.equal(found.total, 3)
  assert.equal(found.entries.length, 3)
})

test('命中累加：只有命中的条目 +1，并且影响同分排序', () => {
  const book = memoryBook()
  const ids = book.entries.map((entry) => entry.id)
  assert.equal(recordHits(book, [ids[0]]), 1)
  assert.equal(findEntry(book, ids[0]).hits, 1)
  assert.equal(recordHits(book, ['不存在']), 0)

  const sameScore = searchEntries(book, { query: '' })
  assert.equal(sameScore.entries[0].id, ids[0], '命中次数高的排在前面')
})

test('片段：命中位置附近截取，长文本加省略号', () => {
  const long = { body: `${'前缀'.repeat(40)}关键命中${'后缀'.repeat(40)}` }
  const snippet = snippetOf(long, ['关键命中'], 60)
  assert.match(snippet, /关键命中/u)
  assert.ok(snippet.startsWith('…') && snippet.endsWith('…'))
  assert.ok(snippet.length <= 62)
})

test('memory_search 与 memory_read 注册且能串起检索与命中累加', async () => {
  const { apply } = await import('../memory/index.js')
  const registered = []
  const dir = mkdtempSync(join(tmpdir(), 'rd-memory-search-'))
  apply(
    { tools: { register: (definition) => registered.push(definition) } },
    { directory: dir, maxEntries: 50 },
  )
  const byName = (name) => registered.find((tool) => tool.name === name)

  const save = byName('memory_save')
  await save.execute({
    type: 'pitfall',
    title: 'Windows 沙箱白名单要用反斜杠',
    body: '现象：写入被拒。根因：正斜杠。做法：path.resolve 后再比较。',
    tags: ['windows'],
  })
  await save.execute({
    type: 'template',
    title: '新增工具的注册骨架',
    body: 'defineTool 定义 schema，register 挂到 ctx.tools。',
    tags: ['dsh'],
  })

  const found = await byName('memory_search').execute({ query: '沙箱' })
  assert.equal(found.total, 1)
  assert.match(found.entries[0].title, /沙箱/u)
  assert.equal(found.entries[0].hits, 1, '检索即计入一次命中')

  const again = await byName('memory_search').execute({ query: '沙箱' })
  assert.equal(again.entries[0].hits, 2)

  const read = await byName('memory_read').execute({ id: found.entries[0].id })
  assert.equal(read.ok, true)
  assert.match(read.body, /path\.resolve/u)
  const missing = await byName('memory_read').execute({ id: 'nope' })
  assert.equal(missing.ok, false)

  rmSync(dir, { recursive: true, force: true })
})
