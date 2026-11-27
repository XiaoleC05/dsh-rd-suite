/**
 * 宪章与技能分工的验证：行文口径、n-gram 判定与真实仓库无成句重复。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collect, GRAM, grams, MAX_HITS, overlap, proseOf } from '../scripts/charter-overlap.mjs'

test('proseOf：去掉代码块、行内代码、命令与表格', () => {
  const text = [
    '# 标题',
    '正常的一句话。',
    'node scripts/health.mjs',
    '| 表格 | 行 |',
    '用 `memory_save` 写入。',
    '```',
    '代码块',
    '```',
  ].join('\n')
  const prose = proseOf(text)
  assert.match(prose, /正常的一句话/u)
  assert.doesNotMatch(prose, /node scripts/u, '命令行不算行文')
  assert.doesNotMatch(prose, /memory_save/u, '行内代码不算行文')
  assert.doesNotMatch(prose, /代码块/u)
  assert.doesNotMatch(prose, /表格/u)
})

test('grams：12 字窗口，且不跨标点拼接出假句子', () => {
  const set = grams('一二三四五六七八九十甲乙丙丁戊己庚辛')
  assert.ok(set.size >= 5, `实际 ${set.size} 个片段`)
  for (const gram of set) assert.equal([...gram].length, GRAM)
})

test('overlap：找出交集并按序返回', () => {
  const left = grams('交付前先跑一遍文案检查，把总分抬到八十分以上再交付')
  const right = grams('交付前先跑一遍文案检查，把总分抬到九十分以上再交付')
  const shared = overlap(left, right)
  assert.ok(shared.length >= 1)
  assert.deepEqual(shared, [...shared].sort())
})

test('真实仓库：没有技能与宪章成句重复', () => {
  const rows = collect()
  assert.equal(rows.length, 10)
  const over = rows.filter((row) => row.hits > MAX_HITS)
  assert.deepEqual(
    over.map((row) => `${row.skill}(${row.hits})`),
    [],
    '宪章与技能不该出现 12 字以上的成句重复',
  )
})
