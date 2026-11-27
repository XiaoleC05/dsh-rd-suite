/**
 * 状态快照的验证：账本轮次计数、版本提取与缺失文件的降级。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { collectStatus, countRounds, latestVersion } from '../code-pipeline/lib/status.js'

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-status-'))
  writeFileSync(
    join(workspace, 'package.json'),
    JSON.stringify({ name: 'x', version: '0.27.0' }),
    'utf8',
  )
  mkdirSync(join(workspace, 'docs'), { recursive: true })
  writeFileSync(
    join(workspace, 'docs', 'ITERATIONS.md'),
    [
      '# 账本',
      '',
      '| 轮次 | Issue | 模块 | 结论 |',
      '|---|---|---|---|',
      '| 第 1 轮 | #16 | protocol | ok |',
      '| 第 25 轮 | #40 | dup-check | ok |',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(workspace, 'docs', 'CHANGELOG.md'),
    [
      '# 变更日志',
      '',
      '## 0.27.0 — 2026-11-27',
      '',
      '- 新东西',
      '',
      '## 0.26.0 — 2026-11-26',
      '',
    ].join('\n'),
    'utf8',
  )
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

test('账本计轮次：数行数并取最大轮次', () => {
  assert.deepEqual(countRounds('| 第 1 轮 | a |\n| 第 7 轮 | b |\n| 第 3 轮 | c |'), {
    rows: 3,
    lastRound: 7,
  })
  assert.deepEqual(countRounds('没有表格'), { rows: 0, lastRound: 0 })
})

test('版本提取取第一个版本标题，带 v 前缀也算', () => {
  assert.equal(latestVersion('## 1.2.3 — 2026-01-01'), '1.2.3')
  assert.equal(latestVersion('## v2.0.0-rc.1'), '2.0.0-rc.1')
  assert.equal(latestVersion('# 没有标题'), undefined)
})

test('正常仓库里读到版本、轮次与变更日志版本', () => {
  const status = collectStatus({ root: workspace })
  assert.equal(status.version, '0.27.0')
  assert.deepEqual(status.rounds, { rows: 2, lastRound: 25 })
  assert.equal(status.changelogVersion, '0.27.0')
  assert.deepEqual(status.warnings, [])
})

test('文件缺失时字段缺省并记 warning，不抛错', () => {
  const empty = mkdtempSync(join(tmpdir(), 'rd-status-empty-'))
  const status = collectStatus({ root: empty })
  assert.equal(status.version, undefined)
  assert.equal(status.rounds, undefined)
  assert.equal(status.changelogVersion, undefined)
  assert.equal(status.warnings.length, 3)
  rmSync(empty, { recursive: true, force: true })
})

test('package.json 没有 version 时也记 warning', () => {
  const partial = mkdtempSync(join(tmpdir(), 'rd-status-partial-'))
  writeFileSync(join(partial, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8')
  const status = collectStatus({ root: partial })
  assert.equal(status.version, undefined)
  assert.ok(status.warnings.some((warning) => warning.includes('没有 version')))
  rmSync(partial, { recursive: true, force: true })
})
