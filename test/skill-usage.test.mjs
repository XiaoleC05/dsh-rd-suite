/**
 * 技能使用频率的验证：计数口径、自身排除、建议规则与真实结果。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { advise, collect, countUsage, THRESHOLDS } from '../scripts/skill-usage.mjs'

test('countUsage：整词匹配，不吃标识符片段', () => {
  assert.equal(countUsage('用 rd-copy 写文案，rd-copy 很好用', 'rd-copy'), 2)
  assert.equal(countUsage('dsh-rd-suite 与 @local/rd-hub', 'rd-suite'), 0, '前面是连字符就不算')
  assert.equal(countUsage('rd-copys 不是 rd-copy', 'rd-copy'), 1)
  assert.equal(countUsage('', 'rd-copy'), 0)
  assert.equal(countUsage('rd-copy', ''), 0)
})

test('advise：零引用给合并候选', () => {
  assert.match(advise(0, 500, 0), /合并候选/u)
  assert.equal(THRESHOLDS.unused, 1)
})

test('advise：正文大但常用要保留并优先拆 references', () => {
  assert.match(advise(5, 2600, 1.9), /保持/u)
  assert.match(advise(5, 2600, 1.9), /references/u)
})

test('advise：正文大但引用稀时提示可删铺陈', () => {
  assert.match(advise(2, 2600, 0.5), /留意/u)
})

test('advise：普通情况就是保持', () => {
  assert.equal(advise(4, 1200, 3.3), '保持')
})

test('真实仓库：十个技能都有结果，当前没有零引用技能', () => {
  const rows = collect()
  assert.ok(rows.length >= 10, `技能数 ${rows.length}`)
  for (const row of rows) {
    assert.ok(row.chars > 0, `${row.skill} 正文为空`)
    assert.ok(row.refs >= 0)
    assert.ok(row.advice !== '')
  }
  assert.deepEqual(
    rows.filter((row) => row.refs < THRESHOLDS.unused),
    [],
    '当前不应有零引用技能；若出现，说明该技能从未被任何证据面提到',
  )
  // 排序：引用少的排前面，便于一眼看出谁最冷
  const sorted = [...rows].sort((left, right) => left.refs - right.refs || right.chars - left.chars)
  assert.deepEqual(
    rows.map((row) => row.skill),
    sorted.map((row) => row.skill),
  )
})
