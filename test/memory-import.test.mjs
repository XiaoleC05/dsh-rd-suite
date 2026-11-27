/**
 * 记忆库导入导出的验证：合并语义（取较新正文、标签并集、hits 取大）、
 * replace、非法输入不改库、导出后再导入往返一致。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { mergeDocuments } from '../memory/lib/merge.js'
import {
  emptyDocument,
  memoryFile,
  normalizeEntry,
  readMemory,
  upsertEntry,
  writeMemory,
} from '../memory/lib/store.js'

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-memory-merge-'))
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

/** 造一条已存在的条目。 */
function seeded() {
  const document = emptyDocument()
  upsertEntry(
    document,
    normalizeEntry({
      type: 'pitfall',
      title: 'Windows 沙箱白名单要用反斜杠',
      body: '旧正文：只说了要转斜杠。',
      tags: ['windows'],
    }).entry,
  )
  document.entries[0].updatedAt = '2026-11-01T00:00:00.000Z'
  document.entries[0].createdAt = '2026-11-01T00:00:00.000Z'
  document.entries[0].hits = 5
  return document
}

test('合并：同身份取较新正文，标签并集，hits 取大，revisions 累加', () => {
  const result = mergeDocuments(seeded(), {
    entries: [
      {
        type: 'pitfall',
        title: 'windows 沙箱白名单要用反斜杠',
        body: '新正文：path.resolve 之后再比较，附验证命令。',
        tags: ['sandbox'],
        hits: 1,
        updatedAt: '2026-11-20T00:00:00.000Z',
        createdAt: '2026-11-20T00:00:00.000Z',
      },
    ],
  })
  assert.equal(result.created, 0)
  assert.equal(result.updated, 1)
  const entry = result.document.entries[0]
  assert.match(entry.body, /path\.resolve/u)
  assert.deepEqual(entry.tags.sort(), ['sandbox', 'windows'])
  assert.equal(entry.hits, 5)
  assert.equal(entry.revisions, 1)
  assert.equal(entry.createdAt, '2026-11-01T00:00:00.000Z', '保留更早的创建时间')
})

test('合并：外来条目更旧时保留本地正文但计入 kept', () => {
  const result = mergeDocuments(seeded(), {
    entries: [
      {
        type: 'pitfall',
        title: 'Windows 沙箱白名单要用反斜杠',
        body: '更旧的正文。',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  })
  assert.equal(result.kept, 1)
  assert.equal(result.updated, 0)
  assert.match(result.document.entries[0].body, /旧正文/u)
})

test('合并：新条目走 created，未知字段一并保留', () => {
  const result = mergeDocuments(seeded(), {
    entries: [
      {
        type: 'strategy',
        title: '先报告后修正',
        body: 'report → fix → report。',
        tags: ['audit'],
        custom: 1,
      },
    ],
  })
  assert.equal(result.created, 1)
  assert.equal(result.document.entries.length, 2)
  assert.equal(result.document.entries.find((entry) => entry.type === 'strategy').custom, 1)
})

test('replace：整库替换并统计丢弃数量', () => {
  const result = mergeDocuments(
    seeded(),
    { entries: [{ type: 'fix', title: '缺 import', body: '补齐 node:fs。' }] },
    { mode: 'replace' },
  )
  assert.equal(result.created, 1)
  assert.equal(result.dropped, 1)
  assert.equal(result.document.entries.length, 1)
  assert.equal(result.document.entries[0].type, 'fix')
})

test('非法条目被过滤：缺 type 或 title 的不会进来', () => {
  const result = mergeDocuments(seeded(), {
    entries: [{ title: '没有类型', body: 'x' }, { type: 'fix', body: '没有标题' }, null],
  })
  assert.equal(result.created, 0)
  assert.equal(result.document.entries.length, 1)
})

test('导出后再导入往返一致', () => {
  const document = seeded()
  upsertEntry(
    document,
    normalizeEntry({ type: 'template', title: '注册骨架', body: 'defineTool → register → when。' })
      .entry,
  )
  const file = memoryFile(join(workspace, 'roundtrip'))
  writeMemory(file, document)

  const exported = JSON.parse(readFileSync(file, 'utf8'))
  const restored = mergeDocuments(emptyDocument(), exported)
  assert.equal(restored.document.entries.length, document.entries.length)
  assert.deepEqual(
    restored.document.entries.map((entry) => entry.title).sort(),
    document.entries.map((entry) => entry.title).sort(),
  )
  assert.equal(readMemory(file).document.entries.length, document.entries.length)
})
