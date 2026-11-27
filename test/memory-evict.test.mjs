/**
 * 容量上限与淘汰策略的验证。
 * 保留分 = hits×10 + 最近 30 天加成 + revisions；同分先丢更早更新的。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  emptyDocument,
  evictEntries,
  retentionScore,
  upsertEntry,
  normalizeEntry,
} from '../memory/lib/store.js'

const now = new Date('2026-11-27T12:00:00.000Z')

/** 造一条指定 hits 与更新时间的条目。 */
function entry(type, title, hits, updatedAt) {
  return {
    id: `${type}-${title.length}-${hits}`,
    type,
    title,
    body: '正文够长，用于淘汰测试。',
    tags: [],
    hits,
    revisions: 0,
    createdAt: updatedAt,
    updatedAt,
  }
}

test('保留分：命中次数权重最高，时间越久越低', () => {
  const recent = retentionScore(entry('fix', '最近命中两次', 2, '2026-11-26T12:00:00.000Z'), now)
  const older = retentionScore(entry('fix', '很久命中两次', 2, '2026-09-01T12:00:00.000Z'), now)
  const many = retentionScore(entry('fix', '命中十次', 10, '2026-09-01T12:00:00.000Z'), now)
  assert.ok(recent > older)
  assert.ok(many > recent, '命中次数应当压过时间加成')
})

test('未超限时不动', () => {
  const document = {
    ...emptyDocument(),
    entries: [entry('fix', 'a', 1, '2026-11-20T00:00:00.000Z')],
  }
  const result = evictEntries(document, 5, now)
  assert.deepEqual(result, { kept: 1, evicted: 0 })
  assert.equal(document.entries.length, 1)
})

test('超限时按分数淘汰，命中多的留下', () => {
  const document = {
    ...emptyDocument(),
    entries: [
      entry('fix', '忙条目', 9, '2026-11-20T00:00:00.000Z'),
      entry('fix', '闲置条目一', 0, '2026-11-20T00:00:00.000Z'),
      entry('fix', '闲置条目二', 0, '2026-11-20T00:00:00.000Z'),
      entry('fix', '中间条目', 3, '2026-11-20T00:00:00.000Z'),
    ],
  }
  const result = evictEntries(document, 2, now)
  assert.deepEqual(result, { kept: 2, evicted: 2 })
  const titles = document.entries.map((item) => item.title).sort()
  assert.deepEqual(titles, ['中间条目', '忙条目'])
})

test('同分时先丢更早更新的，再按 id 稳定排序', () => {
  const document = {
    ...emptyDocument(),
    entries: [
      entry('fix', '较早的', 1, '2026-11-01T00:00:00.000Z'),
      entry('fix', '较新的', 1, '2026-11-25T00:00:00.000Z'),
      entry('fix', '中等', 1, '2026-11-15T00:00:00.000Z'),
    ],
  }
  evictEntries(document, 1, now)
  assert.deepEqual(
    document.entries.map((item) => item.title),
    ['较新的'],
  )
})

test('非法上限按「不淘汰」处理，空洞条目不炸', () => {
  const document = {
    ...emptyDocument(),
    entries: [entry('fix', 'a', 0, '2026-11-20T00:00:00.000Z'), null],
  }
  const result = evictEntries(document, 0, now)
  assert.equal(result.evicted, 0)
  assert.equal(document.entries.length, 2)
})

test('真实写入路径会触发淘汰：写入超过上限后条数收敛', () => {
  const document = emptyDocument()
  for (let index = 0; index < 6; index += 1) {
    upsertEntry(
      document,
      normalizeEntry({
        type: 'fix',
        title: `条目 ${'x'.repeat(index + 1)}`,
        body: '正文要够十个字符才能通过校验。',
      }).entry,
    )
  }
  const result = evictEntries(document, 3, now)
  assert.equal(result.evicted, 3)
  assert.equal(document.entries.length, 3)
})
