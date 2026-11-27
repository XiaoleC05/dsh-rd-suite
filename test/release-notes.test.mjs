/**
 * 发布说明草稿的验证：版本块解析、分桶、四段齐全与真实 CHANGELOG。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { draft, groupItems, versionBlock } from '../scripts/release-notes.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const SAMPLE = [
  '# 变更日志',
  '',
  '## 0.2.0 — 2026-11-01',
  '',
  '- 新增 auditMode 配置，支持只查不改。',
  '- 修复推送遇到瞬时失败时不再重试三次的问题。',
  '- 文档补了一节品牌说明。',
  '- 用例 478。',
  '',
  '## 0.1.0 — 2026-10-01',
  '',
  '- 首个版本。',
].join('\n')

test('版本块：默认取最新，也可以指定版本', () => {
  assert.equal(versionBlock(SAMPLE).version, '0.2.0')
  assert.equal(versionBlock(SAMPLE).items.length, 4)
  assert.deepEqual(versionBlock(SAMPLE, '0.1.0').items, ['- 首个版本。'])
  assert.deepEqual(versionBlock(SAMPLE, '9.9.9').items, [])
})

test('分桶：新增 / 修复 / 文档，未命中的进「其他」', () => {
  const groups = groupItems(versionBlock(SAMPLE).items)
  const keys = groups.map((group) => group.key)
  assert.ok(keys.includes('新增'))
  assert.ok(keys.includes('修复'))
  assert.ok(keys.includes('文档与流程'))
  assert.ok(keys.includes('其他'), '用例数这类条目应落到其他')
})

test('草稿四段齐全，占位段落交给人工补', () => {
  const text = draft(versionBlock(SAMPLE))
  for (const section of [
    '## 一句话变化',
    '## 你会遇到什么不同',
    '## 需要你做什么',
    '## 已知问题',
  ]) {
    assert.ok(text.includes(section), `缺少 ${section}`)
  }
  assert.match(text, /<一句话说清/u, '一句话变化要留占位，脚本不该编')
  assert.match(text, /无需操作/u, '要提示「不用动手写无需操作」')
  assert.match(text, /已知问题：无/u)
})

test('主题化：标题带版本号', () => {
  assert.match(draft(versionBlock(SAMPLE)), /^# 0\.2\.0 发布说明/u)
})

test('真实 CHANGELOG：最新版本能生成非空草稿', () => {
  const changelog = readFileSync(join(root, 'docs', 'CHANGELOG.md'), 'utf8')
  const block = versionBlock(changelog)
  assert.ok(block.version !== '', '没解析出版本号')
  assert.ok(block.items.length > 0, '最新版本没有条目')
  assert.match(draft(block), /发布说明/u)
})
