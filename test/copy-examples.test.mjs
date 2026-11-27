/**
 * 文案对照库的自校验：改前必须被检查器判差，改后必须零套话且高分。
 *
 * 这把这个文件从「读起来挺有道理」变成「被检查器验证过的规则示例」。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { analyze } from '../scripts/aigc-check.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const markdown = readFileSync(
  join(root, 'skills', 'rd-copy', 'references', 'before-after.md'),
  'utf8',
)

/** 抽出所有 before/after 对。 */
function pairs(text) {
  const found = []
  const pattern =
    /### 改前\r?\n\r?\n([\s\S]*?)\r?\n\r?\n### 改后\r?\n\r?\n([\s\S]*?)(?=\r?\n\r?\n(?:改了：|## ))/gu
  for (const match of text.matchAll(pattern))
    found.push({ before: match[1].trim(), after: match[2].trim() })
  return found
}

const all = pairs(markdown)

test('至少六组对照，每组都非空', () => {
  assert.ok(all.length >= 6, `实际 ${all.length} 组`)
  for (const [index, pair] of all.entries()) {
    assert.ok(pair.before.length > 10, `第 ${index + 1} 组改前太短`)
    assert.ok(pair.after.length > 10, `第 ${index + 1} 组改后太短`)
  }
})

test('改前确实有问题：命中套话或分数偏低', () => {
  for (const [index, pair] of all.entries()) {
    const result = analyze(pair.before)
    const hasIssue = result.hits.cliches.length > 0 || result.score < 90
    assert.ok(
      hasIssue,
      `第 ${index + 1} 组的改前没被判出问题（分数 ${result.score}），示例失去意义`,
    )
  }
})

test('改后必须零套话且分数不低于 90', () => {
  for (const [index, pair] of all.entries()) {
    const result = analyze(pair.after)
    assert.deepEqual(
      result.hits.cliches.map((hit) => hit.word),
      [],
      `第 ${index + 1} 组的改后仍命中套话`,
    )
    assert.ok(result.score >= 90, `第 ${index + 1} 组的改后只有 ${result.score} 分`)
  }
})

test('每组都写清改了什么，而不是只并排放两段', () => {
  const explanations = [...markdown.matchAll(/^改了：/gmu)].length
  assert.equal(explanations, all.length, `对照 ${all.length} 组，说明 ${explanations} 条`)
})
