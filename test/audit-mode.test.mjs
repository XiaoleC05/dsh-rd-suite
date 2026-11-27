/**
 * 审计模式开关的验证：默认 fix、显式 report、非法值回落，以及 report 真的不写文件。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { normalizeAuditMode } from '../index.js'
import { clearAuditCache, auditFiles } from '../code-pipeline/lib/audit.js'

test('默认是 fix，显式 report 生效', () => {
  assert.deepEqual(normalizeAuditMode(undefined), { mode: 'fix' })
  assert.deepEqual(normalizeAuditMode('fix'), { mode: 'fix' })
  assert.deepEqual(normalizeAuditMode('report'), { mode: 'report' })
})

test('非法值回落到 fix 并说明原因', () => {
  const result = normalizeAuditMode('dry-run')
  assert.equal(result.mode, 'fix')
  assert.match(String(result.warning), /只接受 fix 或 report/u)
  assert.match(String(result.warning), /dry-run/u)
})

test('report 模式真的不写文件：内容与 mtime 都不变', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'rd-audit-mode-'))
  const target = join(workspace, 'messy.js')
  const original = 'const  x = { y:1 };   \nexport { x }\n'
  writeFileSync(target, original, 'utf8')
  // 把 mtime 固定在明显不同的过去，任何写入都会让它变。
  const past = new Date('2020-01-01T00:00:00.000Z')
  utimesSync(target, past, past)
  const before = statSync(target).mtimeMs
  clearAuditCache()

  const audit = await auditFiles([target], { mode: normalizeAuditMode('report').mode })
  assert.equal(audit.reportOnly, true, 'report 模式要标明只报告')
  assert.ok(audit.needsFix >= 1, '示例文件确实不规范，应当报告出来')
  assert.equal(readFileSync(target, 'utf8'), original, '内容不能变')
  assert.equal(statSync(target).mtimeMs, before, 'mtime 不能变')

  // 同一文件在 fix 模式下会被改写，说明上面「没变」不是因为文件本来就合规。
  clearAuditCache()
  const fixed = await auditFiles([target], { mode: 'fix' })
  assert.ok(fixed.fixed >= 1)
  assert.notEqual(readFileSync(target, 'utf8'), original)
  rmSync(workspace, { recursive: true, force: true })
})
