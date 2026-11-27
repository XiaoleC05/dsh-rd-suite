/**
 * 只审改动文件的验证：porcelain 解析与「未改动文件不参与审计」。
 * 用真实临时文件跑真实 preset，git 输出用注入的执行器模拟，避免测试依赖 git 仓库状态。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { auditChanged, changedPaths, parseGitStatus } from '../code-pipeline/lib/audit.js'

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-audit-changed-'))
  mkdirSync(join(workspace, 'src'), { recursive: true })
  writeFileSync(join(workspace, 'src', 'changed.js'), 'const  a = { b:1 };\n', 'utf8')
  writeFileSync(join(workspace, 'src', 'untouched.js'), 'export const fine = 1;\n', 'utf8')
  writeFileSync(join(workspace, 'src', 'notes.txt'), '不是代码。\n', 'utf8')
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

test('porcelain 解析：修改、新增、未跟踪、重命名都算，删除不算', () => {
  const text = [
    ' M src/a.js',
    'A  src/b.js',
    '?? src/c.js',
    'R  src/old.js -> src/new.js',
    ' D src/gone.js',
    'M  README.md',
    '',
  ].join('\n')
  assert.deepEqual(parseGitStatus(text), [
    'src/a.js',
    'src/b.js',
    'src/c.js',
    'src/new.js',
    'README.md',
  ])
})

test('changedPaths 保留可标准化的后缀，丢掉纯文本', () => {
  const run = () => [' M src/a.js', '?? src/notes.txt', 'M  docs/guide.md'].join('\n')
  const paths = changedPaths({ root: workspace, run }).map((path) => path.split('\\').join('/'))
  assert.ok(paths.some((path) => path.endsWith('src/a.js')))
  assert.ok(paths.some((path) => path.endsWith('docs/guide.md')), 'markdown 有预设，照样审')
  assert.equal(paths.some((path) => path.endsWith('.txt')), false, '纯文本不进审计')
})

test('auditChanged 只审改动文件，未改动文件不出现', async () => {
  const run = () => ' M src/changed.js'
  const audit = await auditChanged({ root: workspace, mode: 'report', run })
  assert.equal(audit.checked, 1)
  assert.equal(audit.files.length >= 0, true)
  const languages = audit.byLanguage.map((group) => group.language)
  assert.deepEqual(languages, ['javascript'])
})

test('没有改动时返回全零，且不报错', async () => {
  const audit = await auditChanged({ root: workspace, mode: 'report', run: () => '' })
  assert.deepEqual(audit, {
    checked: 0,
    needsFix: 0,
    fixed: 0,
    remaining: 0,
    files: [],
    byLanguage: [],
  })
})

test('git 不可用时按「没有改动」处理，不抛错', async () => {
  const audit = await auditChanged({
    root: workspace,
    mode: 'report',
    run: () => {
      throw new Error('git not found')
    },
  })
  assert.equal(audit.checked, 0)
})
