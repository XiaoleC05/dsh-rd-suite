/**
 * 横向体检脚本的纯逻辑验证：宪章字符数、用例计数、术语漂移判定。
 * 指标本身由 scripts/health.mjs 在真实仓库上跑，这里只测判定规则。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { charterChars, countTests, findLegacyTerms } from '../scripts/health.mjs'

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
