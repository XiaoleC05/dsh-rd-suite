/**
 * 横向体检脚本的纯逻辑验证：宪章字符数、用例计数、术语漂移判定。
 * 指标本身由 scripts/health.mjs 在真实仓库上跑，这里只测判定规则。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { charterChars, countTests, findLegacyTerms, formatRow, roundWindow } from '../scripts/health.mjs'

const PATCH = [
  '        plugins:',
  '          - id: persona',
  '            config:',
  '              prefix: |-',
  '                第一行宪章',
  '                第二行宪章',
  '              suffix: |-',
  '                自检',
].join('\n')

test('宪章字符数只数 prefix 块，去掉 YAML 缩进', () => {
  assert.equal(charterChars(PATCH), '第一行宪章\n第二行宪章'.length)
  assert.equal(charterChars('没有 prefix 的文本'), 0)
})

test('用例计数只认行首的 test(', () => {
  const text = [
    "test('a', () => {})",
    "  test('缩进的不算', () => {})",
    'test(skip)',
    "// test('注释不算')",
  ].join('\n')
  assert.equal(countTests(text), 1)
  assert.equal(countTests(''), 0)
})

test('术语漂移：命中给出文件、词与建议，历史记录豁免', () => {
  const files = [
    { path: 'README.md', text: '这里还写着开启 GitHub issue-first 设置' },
    { path: 'docs/CHANGELOG.md', text: '开启 GitHub issue-first 设置' },
    { path: 'skills/x/SKILL.md', text: '代码修正页已经迁移' },
    { path: 'docs/DESIGN.md', text: '干净文档' },
  ]
  const found = findLegacyTerms(files)
  assert.deepEqual(
    found.map((item) => `${item.path}:${item.term}`),
    ['README.md:开启 GitHub issue-first 设置', 'skills/x/SKILL.md:代码修正页'],
  )
  assert.match(found[0].instead, /固定流程/u)
})

test('术语漂移：同一文件出现多次要计次', () => {
  const found = findLegacyTerms([{ path: 'README.md', text: '代码修正页 与 代码修正页' }])
  assert.equal(found[0].count, 2)
})

test('台账行：列数与 CHECKLIST 表格一致', () => {
  const row = formatRow(
    {
      charter: 4964,
      tests: { cases: 243 },
      skills: { largest: { name: 'rd-retro', chars: 2461 } },
      drifted: [],
      packagingGaps: [],
    },
    { from: 21, to: 30 },
  )
  assert.equal(row, '| 21–30 | 4964 | 243 | rd-retro 2461 | 0 | 无 |')
  assert.equal(row.split('|').length, 8, '六列表格行应有 8 个竖线分段')
})

test('台账行：漂移与打包缺口如实写出', () => {
  const row = formatRow(
    {
      charter: 100,
      tests: { cases: 1 },
      skills: { largest: null },
      drifted: [{ path: 'a', term: 'x' }],
      packagingGaps: ['memory', 'scripts'],
    },
    { from: 1, to: 10 },
  )
  assert.equal(row, '| 1–10 | 100 | 1 | 无 | 1 | memory、scripts |')
})

test('十轮区间：从账本最大轮次推导', () => {
  assert.deepEqual(roundWindow('| 第 1 轮 | a |\n| 第 7 轮 | b |'), { from: 1, to: 10, lastRound: 7 })
  assert.deepEqual(roundWindow('| 第 25 轮 | a |'), { from: 21, to: 30, lastRound: 25 })
  assert.deepEqual(roundWindow('| 第 30 轮 | a |'), { from: 21, to: 30, lastRound: 30 })
  assert.deepEqual(roundWindow('| 第 31 轮 | a |'), { from: 31, to: 40, lastRound: 31 })
  assert.deepEqual(roundWindow('没有账本'), { from: 1, to: 10, lastRound: 0 })
})
