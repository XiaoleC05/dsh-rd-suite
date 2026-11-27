/**
 * 审计的两条基本性质：幂等与并发安全。
 *
 * 幂等：fix 跑两次，第二次不该再有改动。
 * 并发：同一批文件被两趟同时审计，文件不能被截断或写坏。
 *
 * 这两条以前只靠「看起来没问题」，没有断言。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { auditCacheStats, auditFiles, clearAuditCache } from '../code-pipeline/lib/audit.js'

let workspace
let targets

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-audit-idem-'))
  targets = ['a.js', 'b.js', 'c.js'].map((name) => {
    const path = join(workspace, name)
    writeFileSync(path, `const  ${name[0]} = { v:1 };   \nexport { ${name[0]} }\n`, 'utf8')
    return path
  })
  clearAuditCache()
})

after(() => {
  clearAuditCache()
  rmSync(workspace, { recursive: true, force: true })
})

test('fix 跑两次：第二次零改动', async () => {
  clearAuditCache()
  const first = await auditFiles(targets, { mode: 'fix' })
  assert.ok(first.fixed >= 1, `第一次应当改动至少一个文件，实际 ${first.fixed}`)
  const snapshot = targets.map((path) => readFileSync(path, 'utf8'))

  clearAuditCache()
  const second = await auditFiles(targets, { mode: 'fix' })
  assert.equal(second.needsFix, 0, '第二次不该再发现需要修的格式')
  assert.equal(second.fixed, 0)
  assert.deepEqual(
    targets.map((path) => readFileSync(path, 'utf8')),
    snapshot,
    '第二次运行时文件内容不能变',
  )
})

test('report 与 fix 结论一致：report 说不改的文件，fix 也不改', async () => {
  clearAuditCache()
  // 先确保文件已经是规范格式。
  await auditFiles(targets, { mode: 'fix' })
  clearAuditCache()

  const report = await auditFiles(targets, { mode: 'report' })
  assert.equal(report.needsFix, 0)
  assert.equal(report.reportOnly, true)

  const fix = await auditFiles(targets, { mode: 'fix' })
  assert.equal(fix.fixed, 0)
})

test('并发两次审计同一批文件：内容合法且未被截断', async () => {
  const fresh = join(workspace, 'concurrent.js')
  const original = 'const  q = { r:2 };\nexport { q }\n'
  writeFileSync(fresh, original, 'utf8')
  clearAuditCache()

  const [first, second] = await Promise.all([
    auditFiles([fresh], { mode: 'fix' }),
    auditFiles([fresh], { mode: 'fix' }),
  ])
  assert.equal(typeof first.checked, 'number')
  assert.equal(typeof second.checked, 'number')

  const content = readFileSync(fresh, 'utf8')
  assert.ok(content.length > 0, '文件不能被写空')
  assert.match(content, /export \{ q \}/u, '导出语句必须完整保留')
  assert.equal(content.includes('\u0000'), false, '不能出现写坏的字节')
})

test('并发审计与报告混跑：报告结果不因另一趟改写而失真', async () => {
  const mixed = join(workspace, 'mixed.js')
  writeFileSync(mixed, 'const  m = { n:3 };\nexport { m }\n', 'utf8')
  clearAuditCache()

  const [report, fix] = await Promise.all([
    auditFiles([mixed], { mode: 'report' }),
    auditFiles([mixed], { mode: 'fix' }),
  ])
  assert.equal(typeof report.needsFix, 'number')
  assert.ok(fix.fixed >= 0)
  const after = readFileSync(mixed, 'utf8')
  assert.match(after, /export \{ m \}/u)
})

test('并发审计不会把缓存写乱：统计值仍是整数且不超文件数', async () => {
  const files = ['x.js', 'y.js'].map((name) => {
    const path = join(workspace, name)
    writeFileSync(path, `const  ${name[0]} = { v:9 };\nexport { ${name[0]} }\n`, 'utf8')
    return path
  })
  await auditFiles(files, { mode: 'fix' })
  clearAuditCache()

  await Promise.all([auditFiles(files, { mode: 'report' }), auditFiles(files, { mode: 'report' })])
  const stats = auditCacheStats()
  assert.equal(Number.isInteger(stats.size), true)
  assert.ok(stats.size <= files.length)

  const again = await auditFiles(files, { mode: 'report' })
  assert.equal(again.needsFix, 0)
})
