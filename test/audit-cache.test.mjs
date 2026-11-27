/**
 * 审计缓存的验证：命中、失效、清空与不存在的路径。
 * 关键不是「缓存生效」，而是「文件一改就失效」——否则会把旧判定当成新结论。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { auditCacheStats, auditFiles, clearAuditCache } from '../code-pipeline/lib/audit.js'

let workspace
let cleanFile

before(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-audit-cache-'))
  cleanFile = join(workspace, 'clean.js')
  writeFileSync(cleanFile, 'export const answer = 42\n', 'utf8')
  clearAuditCache()
  // 先跑一次，让这个文件进入「已判定干净」的状态。
  await auditFiles([cleanFile], { mode: 'report' })
})

after(() => {
  clearAuditCache()
  rmSync(workspace, { recursive: true, force: true })
})

test('同一文件第二次审计命中缓存', async () => {
  clearAuditCache()
  const first = await auditFiles([cleanFile], { mode: 'report' })
  assert.equal(first.cached, 0)
  const second = await auditFiles([cleanFile], { mode: 'report' })
  assert.equal(second.cached, 1)
  assert.equal(second.checked, 1, '命中缓存的文件仍然计入检查数')
  assert.equal(second.needsFix, 0)
  assert.equal(auditCacheStats().size >= 1, true)
})

test('文件改动后缓存失效', async () => {
  clearAuditCache()
  await auditFiles([cleanFile], { mode: 'report' })
  writeFileSync(cleanFile, 'export const answer = 43\n', 'utf8')
  const later = new Date(Date.now() + 5_000)
  utimesSync(cleanFile, later, later)
  const after = await auditFiles([cleanFile], { mode: 'report' })
  assert.equal(after.cached, 0, '改过的文件必须重新解析')
})

test('cache: false 时不使用也不写缓存', async () => {
  clearAuditCache()
  await auditFiles([cleanFile], { mode: 'report' })
  const bypass = await auditFiles([cleanFile], { mode: 'report', cache: false })
  assert.equal(bypass.cached, 0)
})

test('有问题的文件不进缓存：修好之前每次都要报告', async () => {
  clearAuditCache()
  const dirty = join(workspace, 'dirty.js')
  writeFileSync(dirty, 'const  a = { b:1 };\n', 'utf8')
  const first = await auditFiles([dirty], { mode: 'report' })
  assert.equal(first.needsFix, 1)
  const second = await auditFiles([dirty], { mode: 'report' })
  assert.equal(second.cached, 0, '有问题的文件不缓存')
  assert.equal(second.needsFix, 1)
})

test('不存在的路径不写缓存也不抛错', async () => {
  clearAuditCache()
  const ghost = join(workspace, 'ghost.js')
  const audit = await auditFiles([ghost], { mode: 'report' })
  assert.equal(typeof audit.checked, 'number')
  assert.equal(auditCacheStats().size, 0)
})
