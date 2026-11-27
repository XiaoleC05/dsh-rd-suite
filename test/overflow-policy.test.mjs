/**
 * 超限行为的验证：上限、策略、文档三处必须一一对应，行为也要抽查。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { LIMITS, OVERFLOW_POLICIES, OVERFLOW_POLICY, truncateText } from '../lib/limits.js'
import { searchEntries } from '../memory/lib/search.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const doc = readFileSync(join(root, 'docs', 'OVERFLOW.md'), 'utf8')

test('每个上限都有策略，没有多余的策略', () => {
  assert.deepEqual(Object.keys(OVERFLOW_POLICY).sort(), Object.keys(LIMITS).sort())
})

test('策略值都来自允许集合，且给出「读的人会看到什么」', () => {
  for (const [key, entry] of Object.entries(OVERFLOW_POLICY)) {
    assert.ok(OVERFLOW_POLICIES.includes(entry.policy), `${key} 的策略不在允许集合内`)
    assert.ok(
      typeof entry.effect === 'string' && entry.effect.trim() !== '',
      `${key} 缺少 effect 说明`,
    )
  }
})

test('文档逐项写了上限、数值与策略', () => {
  for (const [key, value] of Object.entries(LIMITS)) {
    assert.ok(doc.includes(`\`${key}\``), `OVERFLOW.md 缺少 ${key}`)
    assert.ok(
      doc.includes(String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ' ')) ||
        doc.includes(String(value)),
      `OVERFLOW.md 缺少 ${key} 的数值`,
    )
    assert.ok(doc.includes(OVERFLOW_POLICY[key].policy), `OVERFLOW.md 缺少 ${key} 的策略名`)
  }
})

test('行为抽查：truncateText 走截断策略', () => {
  const result = truncateText('a'.repeat(LIMITS.toolTextChars + 10))
  assert.equal(result.truncated, true)
  assert.match(result.text, /已截断 10 字符/u)
})

test('行为抽查：列表走分页策略，offset 能继续取', () => {
  const entries = Array.from({ length: 5 }, (_, index) => ({
    id: 'e' + index,
    type: 'fix',
    title: '标题' + index,
    body: '正文够长，用于分页测试。',
    tags: [],
    hits: 0,
    updatedAt: '2026-11-01T00:00:00.000Z',
  }))
  const document = { version: 1, entries }
  const first = searchEntries(document, { limit: 2 })
  const second = searchEntries(document, { limit: 2, offset: 2 })
  assert.equal(first.entries.length, 2)
  assert.equal(second.entries.length, 2)
  assert.notEqual(first.entries[0].id, second.entries[0].id, 'offset 必须真的换一批')
  assert.equal(first.total, 5, 'total 要让调用方知道还有多少')
})

test('行为抽查：请求体超限走明确拒绝而非截断', () => {
  assert.equal(OVERFLOW_POLICY.httpBodyBytes.policy, 'reject')
  const source = readFileSync(join(root, 'code-pipeline', 'index.js'), 'utf8')
  assert.match(source, /body-too-large/u, '超限必须返回明确错误码')
  assert.match(source, /413/u, '超限必须用 413 状态码')
})
