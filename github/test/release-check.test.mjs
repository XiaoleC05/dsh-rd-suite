/**
 * 发版一致性校验的验证：版本号规范化、tag 与 package.json 对比、CHANGELOG 标题匹配。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  checkReleaseConsistency,
  normalizeVersion,
  readReleaseFacts,
} from '../lib/release-check.js'

const here = dirname(fileURLToPath(import.meta.url))

test('版本号规范化：去 v 前缀与构建后缀', () => {
  assert.equal(normalizeVersion('v1.4.0'), '1.4.0')
  assert.equal(normalizeVersion('1.4.0'), '1.4.0')
  assert.equal(normalizeVersion('v1.4.0-rc.1'), '1.4.0')
  assert.equal(normalizeVersion(' v2.0.0+build.7 '), '2.0.0')
  assert.equal(normalizeVersion(''), '')
})

test('三项一致时通过', () => {
  const verdict = checkReleaseConsistency({
    tag: 'v1.4.0',
    version: '1.4.0',
    changelog: '# 变更日志\n\n## 1.4.0 — 2026-11-27\n\n- 修了一处。\n',
  })
  assert.equal(verdict.ok, true)
  assert.deepEqual(verdict.errors, [])
  assert.equal(verdict.version, '1.4.0')
})

test('版本号不一致时报错并说明两个值', () => {
  const verdict = checkReleaseConsistency({
    tag: 'v1.4.0',
    version: '1.3.2',
    changelog: '## 1.4.0\n',
  })
  assert.equal(verdict.ok, false)
  assert.match(verdict.errors[0], /1\.3\.2.*1\.4\.0/u)
})

test('CHANGELOG 缺版本标题时报错', () => {
  const verdict = checkReleaseConsistency({
    tag: 'v1.4.0',
    version: '1.4.0',
    changelog: '# 变更日志\n\n## 1.3.9 — 2026-11-01\n',
  })
  assert.equal(verdict.ok, false)
  assert.match(verdict.errors[0], /CHANGELOG 里没有 1\.4\.0/u)
})

test('带 v 前缀的标题也认，行内出现不算标题', () => {
  assert.equal(checkReleaseConsistency({ tag: '1.4.0', changelog: '## v1.4.0\n' }).ok, true)
  const inline = checkReleaseConsistency({ tag: '1.4.0', changelog: '本次发布 1.4.0 版本\n' })
  assert.equal(inline.ok, false, '正文里提到版本号不算条目')
})

test('读不到的信息记 warning，不冒充通过也不阻断', () => {
  const verdict = checkReleaseConsistency({ tag: 'v1.4.0' })
  assert.equal(verdict.ok, true)
  assert.equal(verdict.warnings.length, 2)

  const empty = checkReleaseConsistency({ tag: '' })
  assert.equal(empty.ok, false)
  assert.match(empty.errors[0], /tag/u)
})

test('readReleaseFacts 从仓库根读 package.json 与 docs/CHANGELOG.md', () => {
  const readText = (file) => readFileSync(file, 'utf8')
  const facts = readReleaseFacts(join(here, '..', '..').split('\\').join('/'), readText)
  assert.match(String(facts.version), /^\d+\.\d+\.\d+/u)
  assert.match(String(facts.changelog), /## /u)
  assert.deepEqual(facts.warnings, [])
})

test('readReleaseFacts 缺文件时给 warning 而不是抛错', () => {
  const facts = readReleaseFacts('/nowhere/at/all', () => {
    throw new Error('ENOENT')
  })
  assert.equal(facts.version, undefined)
  assert.equal(facts.changelog, undefined)
  assert.equal(facts.warnings.length, 2)
})
