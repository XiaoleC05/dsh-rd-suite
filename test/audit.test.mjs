/**
 * 模块级代码审计：报告 → 修正 → 幂等复查。
 *
 * 审计要解决的是「每个文件落盘时都已格式化，但一个模块结束时没人整体检查过」的问题。
 * 这里用真实临时文件跑真实的 preset，不用替身，避免审计逻辑和实际格式化行为分叉。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { auditFiles } from '../code-pipeline/lib/audit.js'

/** 一眼就不是项目风格：引号、分号、缩进、行宽都不符合 preset。 */
const MESSY = `const  answer = { a:1, b:2 , c : [ 1,2,3 ] };
function   add( x,y ){ return x+y }
export {add,answer}
`

let workspace
let messyFile

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-audit-'))
  messyFile = join(workspace, 'messy.js')
  writeFileSync(messyFile, MESSY, 'utf8')
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

test('修正是真的写回文件，而不是只报告', async () => {
  const before = readFileSync(messyFile, 'utf8')
  const audit = await auditFiles([messyFile], { mode: 'fix' })
  assert.equal(audit.checked, 1)
  assert.ok(audit.needsFix >= 1, `expected at least one file needing a fix, got ${audit.needsFix}`)
  assert.ok(audit.fixed >= 1, `expected the audit to fix the file, got ${audit.fixed}`)
  assert.equal(audit.remaining, 0)
  const after = readFileSync(messyFile, 'utf8')
  assert.notEqual(after, before, 'the file content must change')
  assert.ok(after.length > 0)
})

test('第二次审计是幂等的：没有需要修的文件', async () => {
  const audit = await auditFiles([messyFile], { mode: 'fix' })
  assert.equal(audit.checked, 1)
  assert.equal(audit.needsFix, 0)
  assert.equal(audit.fixed, 0)
  assert.equal(audit.remaining, 0)
  assert.deepEqual(audit.files, [])
})

test('report 模式只检查、不改文件', async () => {
  const dirty = join(workspace, 'report-only.js')
  writeFileSync(dirty, MESSY, 'utf8')
  const audit = await auditFiles([dirty], { mode: 'report' })
  assert.equal(audit.checked, 1)
  assert.equal(audit.needsFix, 1)
  assert.equal(audit.fixed, 0)
  assert.equal(readFileSync(dirty, 'utf8'), MESSY, 'report mode must not write')
})

test('没有文件时返回全零，不抛错', async () => {
  const audit = await auditFiles([], { mode: 'fix' })
  assert.deepEqual(audit, { checked: 0, needsFix: 0, fixed: 0, remaining: 0, files: [], cached: 0, byLanguage: [] })
})

test('不存在的路径不会让审计崩掉', async () => {
  const audit = await auditFiles([join(workspace, 'ghost.js')], { mode: 'fix' })
  assert.equal(audit.checked + audit.remaining >= 0, true)
  assert.equal(typeof audit.fixed, 'number')
})

test('按语言分组：不同扩展名各成一组', async () => {
  const { mkdtempSync, writeFileSync: writeFixture, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'rd-audit-lang-'))
  const js = join(dir, 'a.js')
  const py = join(dir, 'b.py')
  const txt = join(dir, 'notes.txt')
  writeFixture(js, 'const  a = { b:1 };\n', 'utf8')
  writeFixture(py, 'x=1\ny =  2\n', 'utf8')
  writeFixture(txt, '不是代码文件。\n', 'utf8')

  const audit = await auditFiles([js, py, txt], { mode: 'report' })
  const languages = audit.byLanguage.map((group) => group.language).sort()
  assert.deepEqual(languages, ['javascript', 'non-code', 'python'])
  const jsGroup = audit.byLanguage.find((group) => group.language === 'javascript')
  assert.equal(jsGroup.checked, 1)
  assert.equal(jsGroup.fixed, 0, 'report 模式不产生修复数')

  rmSync(dir, { recursive: true, force: true })
})

test('语言摘要是一行可读文本', async () => {
  const { describeLanguageGroups } = await import('../code-pipeline/lib/audit.js')
  assert.equal(
    describeLanguageGroups([
      { language: 'javascript', checked: 3, fixed: 1, needsFix: 1 },
      { language: 'python', checked: 1, fixed: 0, needsFix: 0 },
    ]),
    'javascript 3 检 1 修；python 1 检 0 修',
  )
})
