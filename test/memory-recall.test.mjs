/**
 * 召回基准的验证：指标计算、退化检测与真实用例集是否达标。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { evaluateRecall } from '../scripts/memory-recall.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 两条易区分的条目。 */
const ENTRIES = [
  {
    id: 'a',
    type: 'fix',
    title: '推送卡住改用接口',
    body: 'git push 挂住时走 Git Data API。',
    tags: ['git'],
    hits: 1,
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'b',
    type: 'pitfall',
    title: '宪章预算有限',
    body: '加规则前先删等量表述。',
    tags: ['charter'],
    hits: 9,
    updatedAt: '2026-11-21T00:00:00.000Z',
  },
]

test('全部命中时准确率与 MRR 都是 1', () => {
  const result = evaluateRecall({
    entries: ENTRIES,
    cases: [
      { query: '推送 卡住', expect: 'a' },
      { query: '宪章 预算', expect: 'b' },
    ],
  })
  assert.equal(result.accuracy, 1)
  assert.equal(result.mrr, 1)
  assert.deepEqual(result.misses, [])
})

test('命中但排第二：top1 记 0，MRR 记 0.5', () => {
  // 两条都命中同一个词、分数相同，于是按 hits 排序：b（9 次）在前。
  const tied = [
    { id: 'a', type: 'fix', title: 'alpha 条目', body: '正文一', tags: [], hits: 1, updatedAt: '2026-11-20T00:00:00.000Z' },
    { id: 'b', type: 'fix', title: 'alpha 条目二', body: '正文二', tags: [], hits: 9, updatedAt: '2026-11-21T00:00:00.000Z' },
  ]
  const result = evaluateRecall({ entries: tied, cases: [{ query: 'alpha', expect: 'a' }] })
  assert.equal(result.accuracy, 0, '不在第一位就不算 top1 命中')
  assert.equal(result.mrr, 0.5, '排第二时倒数排名为 1/2')
  assert.deepEqual(result.misses, [], '进了前五就不算落空')
})

test('完全落空时记进 misses 并给出实际第一名', () => {
  const result = evaluateRecall({
    entries: ENTRIES,
    cases: [{ query: '完全无关的词', expect: 'a' }],
  })
  assert.equal(result.accuracy, 0)
  assert.equal(result.misses.length, 1)
  assert.equal(result.misses[0].expect, 'a')
})

test('用例集为空时不除零', () => {
  const empty = evaluateRecall({ entries: [], cases: [] })
  assert.deepEqual(empty, { accuracy: 0, mrr: 0, total: 0, misses: [] })
})

test('真实用例集：top1 准确率达到阈值', () => {
  const fixture = JSON.parse(
    readFileSync(join(root, 'memory', 'fixtures', 'recall-cases.json'), 'utf8'),
  )
  const result = evaluateRecall(fixture)
  assert.equal(result.total, fixture.cases.length)
  assert.ok(
    result.accuracy >= 0.8,
    `top1 准确率 ${result.accuracy}，低于 0.8：${JSON.stringify(result.misses)}`,
  )
})
