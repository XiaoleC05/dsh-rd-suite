/**
 * 术语一致性检查的验证：命中定位、canonical 不误报、特殊字符转义、空表。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { findVariants, loadGlossary, main } from '../scripts/term-check.mjs'

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-term-'))
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

const RULES = [{ canonical: '研发模式', variants: ['RD 模式', 'RD模式'] }]

test('命中给出文件、行号、变体与应改成的写法', () => {
  const hits = findVariants(
    [{ path: 'a.md', text: '第一行没问题\n第二行用了 RD 模式\n第三行也是 RD模式' }],
    RULES,
  )
  assert.deepEqual(hits, [
    { path: 'a.md', line: 2, variant: 'RD 模式', canonical: '研发模式' },
    { path: 'a.md', line: 3, variant: 'RD模式', canonical: '研发模式' },
  ])
})

test('canonical 本身不算命中', () => {
  assert.deepEqual(findVariants([{ path: 'a.md', text: '这里写研发模式，完全正确。' }], RULES), [])
})

test('正则元字符被转义，不当作模式', () => {
  const rules = [{ canonical: 'A+B', variants: ['A+B'] }]
  assert.equal(findVariants([{ path: 'a.md', text: '写法 A+B' }], rules).length, 1)
  assert.deepEqual(
    findVariants([{ path: 'a.md', text: '写法 AAB' }], rules),
    [],
    'A+B 不能匹配 AAB',
  )
})

test('同一行出现两次只记一条（按行去重）', () => {
  const hits = findVariants([{ path: 'a.md', text: 'RD模式 与 RD模式' }], RULES)
  assert.equal(hits.length, 1)
})

test('词表：默认表可读，非法规则被过滤', () => {
  const rules = loadGlossary()
  assert.ok(rules.length >= 4, '默认词表应至少有四条规则')
  for (const rule of rules) {
    assert.equal(typeof rule.canonical, 'string')
    assert.ok(Array.isArray(rule.variants) && rule.variants.length > 0)
  }

  const file = join(workspace, 'glossary.json')
  writeFileSync(
    file,
    JSON.stringify({
      rules: [
        { canonical: 'ok', variants: ['x'] },
        { canonical: 'bad', variants: [] },
        { variants: ['y'] },
      ],
    }),
    'utf8',
  )
  assert.deepEqual(
    loadGlossary(file).map((rule) => rule.canonical),
    ['ok'],
  )
})

test('命令行：有命中返回 1，无命中返回 0，无参数默认查全仓', () => {
  const dirty = join(workspace, 'dirty.md')
  const clean = join(workspace, 'clean.md')
  writeFileSync(dirty, '这里用了 RD 模式\n', 'utf8')
  writeFileSync(clean, '这里写研发模式\n', 'utf8')
  assert.equal(main([dirty]), 1)
  assert.equal(main([clean]), 0)
  assert.ok([0, 1].includes(main([])), '无参数应给出 0 或 1，而不是用法错误')
})
