/**
 * 技能版本的验证：语义化版本、表与实况一致、升级逻辑。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bump,
  collectVersions,
  isValidVersion,
  renderTable,
  TABLE_HEADER,
} from '../scripts/skill-version.mjs'

test('语义化版本校验', () => {
  assert.equal(isValidVersion('1.0.0'), true)
  assert.equal(isValidVersion('1.2'), false)
  assert.equal(isValidVersion('v1.0.0'), false)
  assert.equal(isValidVersion(''), false)
})

test('版本升级：patch / minor / major', () => {
  assert.equal(bump('1.2.3', 'patch'), '1.2.4')
  assert.equal(bump('1.2.3', 'minor'), '1.3.0')
  assert.equal(bump('1.2.3', 'major'), '2.0.0')
  assert.equal(bump('bad', 'patch'), '1.0.0', '非法输入回落到 1.0.0')
})

test('真实仓库：每个技能都有合法版本', () => {
  const rows = collectVersions()
  assert.ok(rows.length >= 10, `技能数 ${rows.length}`)
  for (const row of rows) {
    assert.ok(isValidVersion(row.version), `${row.name} 的版本非法：${row.version}`)
    assert.ok(row.lines > 0)
  }
  const versions = rows.map((row) => row.name)
  assert.deepEqual(versions, [...versions].sort(), '按技能名排序，便于比对')
})

test('rd-copy 本轮改过内容，版本高于初始值', () => {
  const rows = collectVersions()
  const copy = rows.find((row) => row.name === 'rd-copy')
  assert.ok(copy !== undefined)
  assert.equal(copy.version, '1.1.0', '改过正文与新增对照库，应当升 minor')
})

test('版本表渲染包含表头与每个技能一行', () => {
  const rows = collectVersions()
  const text = renderTable(rows)
  for (const header of TABLE_HEADER) assert.ok(text.includes(header), `缺表头 ${header}`)
  for (const row of rows)
    assert.ok(text.includes(`| ${row.name} | ${row.version} |`), `缺 ${row.name} 一行`)
  assert.match(text, /不要手改/u, '表要标明由脚本生成')
})
