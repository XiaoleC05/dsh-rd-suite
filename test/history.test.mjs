/**
 * 审计历史的验证：环形保留、原子写、损坏降级与状态载荷。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import {
  appendAuditRecord,
  auditHistoryFile,
  HISTORY_LIMIT,
  readAuditHistory,
} from '../code-pipeline/lib/history.js'
import { collectStatus } from '../code-pipeline/lib/status.js'

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-history-'))
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

const file = () => join(workspace, 'audit-history.json')

test('追加一条记录：新的在前，字段齐全', () => {
  const first = appendAuditRecord(file(), {
    checked: 3,
    needsFix: 1,
    fixed: 1,
    elapsedMs: 12,
    slowest: '/a',
  })
  assert.deepEqual(first, { appended: true, total: 1 })
  const records = readAuditHistory(file())
  assert.equal(records.length, 1)
  assert.equal(records[0].checked, 3)
  assert.equal(records[0].fixed, 1)
  assert.equal(records[0].slowest, '/a')
  assert.match(records[0].at, /^\d{4}-\d{2}-\d{2}T/u)
})

test('环形保留：超过上限只留最新的若干条', () => {
  rmSync(file(), { force: true })
  for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
    appendAuditRecord(file(), { checked: index })
  }
  const records = readAuditHistory(file())
  assert.equal(records.length, HISTORY_LIMIT)
  assert.equal(records[0].checked, HISTORY_LIMIT + 4, '最新的在最前')
  assert.equal(existsSync(`${file()}.tmp`), false, '临时文件不残留')
})

test('文件损坏时降级为空历史，不抛错', () => {
  const broken = join(workspace, 'broken.json')
  writeFileSync(broken, '{不是合法 JSON', 'utf8')
  assert.deepEqual(readAuditHistory(broken), [])

  const wrongShape = join(workspace, 'shape.json')
  writeFileSync(wrongShape, JSON.stringify({ records: 'not-an-array' }), 'utf8')
  assert.deepEqual(readAuditHistory(wrongShape), [])
})

test('写不进去时返回未追加，不抛错', () => {
  const result = appendAuditRecord(join(workspace, 'no-such-dir', '\u0000bad.json'), { checked: 1 })
  assert.equal(result.appended, false)
})

test('状态载荷带上最近三条审计历史', () => {
  const historyFile = join(workspace, 'status-history.json')
  for (const checked of [1, 2, 3, 4]) appendAuditRecord(historyFile, { checked })

  const status = collectStatus({ root: workspace, historyFile })
  assert.equal(status.auditHistory.length, 3, '只给最近三条')
  assert.equal(status.auditHistory[0].checked, 4)

  const withoutHistory = collectStatus({ root: workspace })
  assert.equal(withoutHistory.auditHistory, undefined, '没配历史文件时字段不出现')
})

test('默认路径落在 ~/.dsh/rd-suite 下', () => {
  assert.equal(
    auditHistoryFile('/home/me'),
    join('/home/me', '.dsh', 'rd-suite', 'audit-history.json'),
  )
})

test('目录中的临时文件在成功后不残留', () => {
  rmSync(file(), { force: true })
  appendAuditRecord(file(), { checked: 1 })
  assert.deepEqual(
    readdirSync(workspace).filter((name) => name.endsWith('.tmp')),
    [],
  )
  assert.ok(readFileSync(file(), 'utf8').includes('"records"'))
})
