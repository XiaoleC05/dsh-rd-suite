/**
 * 技能加载成本的验证：度量口径、references 不计入、排序与预算判定。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BODY_BUDGET, collect, measure, overBudget } from '../scripts/skill-cost.mjs'

test('measure：字符、行数与 token 粗估', () => {
  const measured = measure('第一行\ntwo\n')
  assert.equal(measured.lines, 3, '末尾换行也算一行')
  assert.ok(measured.chars > 0)
  assert.ok(measured.tokens > 0)
  assert.deepEqual(measure(''), { chars: 0, lines: 0, tokens: 0 })
})

test('measure：中文按一字一 token 估，英文按四字符一 token 估', () => {
  const cjk = measure('测试中')
  assert.equal(cjk.tokens, 3, '三个汉字约三个 token')
  const latin = measure('abcd')
  assert.equal(latin.tokens, 1, '四个英文字符约一个 token')
})

test('真实仓库：十个技能都有度量，按正文从大到小排序', () => {
  const rows = collect()
  assert.equal(rows.length, 10, `技能数 ${rows.length}`)
  for (const row of rows) {
    assert.ok(row.chars > 0, `${row.skill} 正文为空`)
    assert.equal(Number.isInteger(row.refFiles), true)
  }
  const sorted = [...rows].sort((left, right) => right.chars - left.chars)
  assert.deepEqual(
    rows.map((row) => row.skill),
    sorted.map((row) => row.skill),
    '必须按正文降序',
  )
})

test('references 单独计量，不混进加载成本', () => {
  const rows = collect()
  const withRefs = rows.filter((row) => row.refFiles > 0)
  assert.ok(withRefs.length >= 2, '至少两个技能带 references')
  for (const row of withRefs)
    assert.ok(row.refChars > 0, `${row.skill} 的 references 字符数应大于 0`)
  const totalBody = rows.reduce((sum, row) => sum + row.chars, 0)
  const totalRefs = rows.reduce((sum, row) => sum + row.refChars, 0)
  assert.ok(totalRefs < totalBody * 2, '两个体积分开统计，不该把 references 算进正文')
})

test('预算判定：全部在 3000 字符内', () => {
  assert.deepEqual(overBudget(collect()), [])
  assert.equal(BODY_BUDGET, 3000)
})

test('预算判定：超限的会被点名', () => {
  const rows = [
    { skill: 'big', chars: 4000 },
    { skill: 'small', chars: 100 },
  ]
  assert.deepEqual(overBudget(rows), [{ skill: 'big', chars: 4000 }])
  assert.deepEqual(overBudget(rows, 5000), [])
})
