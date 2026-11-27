/**
 * 版本推进的验证：语义化进位、每 10 轮 minor、显式覆盖与 CHANGELOG 骨架。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bumpVersion,
  insertChangelogHeading,
  MINOR_EVERY,
  planRelease,
} from '../scripts/release.mjs'

test('patch 与 minor 各自推进，major 清零', () => {
  assert.equal(bumpVersion('0.48.0', 'patch'), '0.48.1')
  assert.equal(bumpVersion('0.48.0', 'minor'), '0.49.0')
  assert.equal(bumpVersion('0.48.3', 'major'), '1.0.0')
})

test('patch 到 9 之后进位到下一个 minor', () => {
  assert.equal(bumpVersion('0.48.9', 'patch'), '0.49.0')
  assert.equal(bumpVersion('1.9.9', 'patch'), '1.10.0')
})

test('版本号非法直接抛错', () => {
  assert.throws(() => bumpVersion('v1.0', 'patch'), /格式不对/u)
  assert.throws(() => bumpVersion('', 'patch'), /格式不对/u)
})

test('每 10 轮自动升 minor，其余升 patch', () => {
  assert.equal(planRelease({ current: '0.48.0', round: 49 }).kind, 'patch')
  assert.equal(planRelease({ current: '0.48.0', round: 50 }).kind, 'minor')
  assert.equal(planRelease({ current: '0.48.0', round: 50 }).version, '0.49.0')
  assert.equal(planRelease({ current: '0.48.0', round: 49 }).version, '0.48.1')
  assert.equal(MINOR_EVERY, 10)
})

test('显式指定覆盖默认规则，并在理由里说明', () => {
  const plan = planRelease({ current: '0.48.0', round: 48, kind: 'minor' })
  assert.equal(plan.kind, 'minor')
  assert.match(plan.reason, /显式指定/u)
})

test('轮次非法要抛错', () => {
  assert.throws(() => planRelease({ current: '0.1.0', round: 0 }), /正整数/u)
  assert.throws(() => planRelease({ current: '0.1.0', round: 1.5 }), /正整数/u)
})

test('CHANGELOG 骨架插在标题之后，已有版本时不重复插', () => {
  const changelog = '# 变更日志\n\n## 0.48.0 — 2026-11-27\n\n- 旧内容\n'
  const result = insertChangelogHeading(changelog, '0.48.1', '2026-11-28')
  assert.equal(result.inserted, true)
  assert.match(
    result.text,
    /^# 变更日志\n\n## 0\.48\.1 — 2026-11-28\n\n- 本轮改动：\n\n## 0\.48\.0/u,
  )

  const again = insertChangelogHeading(result.text, '0.48.1', '2026-11-29')
  assert.equal(again.inserted, false, '同一版本不能插两次')
  assert.equal(again.text, result.text)
})

test('没有标准标题时也能插入', () => {
  const result = insertChangelogHeading('随便写的日志\n', '1.0.0', '2026-01-01')
  assert.equal(result.inserted, true)
  assert.match(result.text, /## 1\.0\.0 — 2026-01-01/u)
})
