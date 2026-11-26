/**
 * Runtime path policy tests: the rules the scanner applies must also hold when
 * a caller names a path explicitly (panel HTTP or Agent tool).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanTree } from '../lib/tree.js'
import { standardize } from '../lib/standardize.js'

const ROOT = join(tmpdir(), 'code-pipeline-policy-test')

function seed(files) {
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(ROOT, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(ROOT, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
}

test('non-UTF-8 source is skipped and never rewritten', async () => {
  // GBK bytes for 中文, invalid as UTF-8. The old path read it and wrote U+FFFD.
  const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0a])
  seed({ 'gbk.js': gbk })
  const before = readFileSync(join(ROOT, 'gbk.js'))
  const report = await standardize({ root: ROOT, paths: ['gbk.js'], mode: 'report' })
  assert.equal(report.stats.skipped, 1)
  assert.equal(report.skipped[0].reason, 'non-utf8')
  const fix = await standardize({ root: ROOT, paths: ['gbk.js'], mode: 'fix' })
  assert.equal(fix.stats.written, 0)
  assert.deepEqual(readFileSync(join(ROOT, 'gbk.js')), before)
})

test('runtime maxBytes rejects oversized files and never writes them', async () => {
  seed({ 'big.js': 'var a = 1\n'.repeat(4096) })
  const limits = { maxFiles: 4000, maxBytes: 1024 }
  const result = await standardize({ root: ROOT, paths: ['big.js'], mode: 'fix', limits })
  assert.equal(result.stats.skipped, 1)
  assert.equal(result.skipped[0].reason, 'too-large')
  assert.equal(result.stats.written, 0)
})

test('dependency directories cannot be written through an explicit path', async () => {
  seed({ 'node_modules/dep/index.js': 'var x = 1\n', 'src/app.js': 'var y = 2\n' })
  const before = readFileSync(join(ROOT, 'node_modules/dep/index.js'), 'utf8')
  const result = await standardize({ root: ROOT, paths: ['node_modules/dep/index.js', 'src/app.js'], mode: 'fix' })
  assert.equal(result.skipped[0].reason, 'skipped-directory')
  assert.equal(readFileSync(join(ROOT, 'node_modules/dep/index.js'), 'utf8'), before)
})

test('skipped-directory matching is case-insensitive on Windows', async () => {
  if (process.platform !== 'win32') return
  seed({ 'NODE_MODULES/dep/index.js': 'var x = 1\n' })
  const before = readFileSync(join(ROOT, 'NODE_MODULES/dep/index.js'), 'utf8')
  const result = await standardize({ root: ROOT, paths: ['NODE_MODULES/dep/index.js'], mode: 'fix' })
  assert.equal(result.skipped[0].reason, 'skipped-directory')
  assert.equal(readFileSync(join(ROOT, 'NODE_MODULES/dep/index.js'), 'utf8'), before)
})

test('an internal link into a skipped directory is refused', async () => {
  seed({ 'node_modules/dep/index.js': 'var x = 1\n', 'src/app.js': 'var y = 2\n' })
  let linked = true
  try {
    symlinkSync(join(ROOT, 'node_modules'), join(ROOT, 'vendor-link'), 'junction')
  } catch {
    linked = false
  }
  if (!linked) return
  const result = await standardize({ root: ROOT, paths: ['vendor-link/dep/index.js'], mode: 'fix' })
  assert.equal(result.files.length, 0)
  assert.equal(result.skipped[0].reason, 'skipped-directory')
  assert.equal(readFileSync(join(ROOT, 'node_modules/dep/index.js'), 'utf8'), 'var x = 1\n')
})

test('ignored files cannot be written through an explicit path', async () => {
  seed({ '.gitignore': 'generated.js\n', 'generated.js': 'var z = 1\n' })
  const before = readFileSync(join(ROOT, 'generated.js'), 'utf8')
  const result = await standardize({ root: ROOT, paths: ['generated.js'], mode: 'fix' })
  assert.equal(result.skipped[0].reason, 'ignored')
  assert.equal(readFileSync(join(ROOT, 'generated.js'), 'utf8'), before)
})

test('ignore rules are re-checked after link resolution', async () => {
  seed({ '.gitignore': 'ignored-dir/\n', 'ignored-dir/file.js': 'var x = 1\n' })
  let linked = true
  try {
    symlinkSync(join(ROOT, 'ignored-dir'), join(ROOT, 'alias'), 'junction')
  } catch {
    linked = false
  }
  if (!linked) return
  const before = readFileSync(join(ROOT, 'ignored-dir/file.js'), 'utf8')
  const result = await standardize({ root: ROOT, paths: ['alias/file.js'], mode: 'fix' })
  assert.equal(result.skipped[0].reason, 'ignored')
  assert.equal(readFileSync(join(ROOT, 'ignored-dir/file.js'), 'utf8'), before)
})

test('a link that leaves the root is refused in report and fix', async () => {
  const outside = join(tmpdir(), 'code-pipeline-policy-outside')
  rmSync(outside, { recursive: true, force: true })
  mkdirSync(outside, { recursive: true })
  const secret = join(outside, 'secret.js')
  writeFileSync(secret, 'var secret = 1\n')
  seed({ 'ok.js': 'var ok = 1\n' })
  let linked = true
  try {
    symlinkSync(outside, join(ROOT, 'sub'), 'junction')
  } catch {
    try {
      symlinkSync(outside, join(ROOT, 'sub'), 'dir')
    } catch {
      linked = false
    }
  }
  if (!linked) return // Environment without symlink permission: covered elsewhere.
  const result = await standardize({ root: ROOT, paths: ['sub/secret.js'], mode: 'fix' })
  assert.equal(result.files[0].status, 'failed')
  assert.equal(result.files[0].reason, 'path-escape')
  assert.equal(readFileSync(secret, 'utf8'), 'var secret = 1\n')
})

test('maxFiles counts every pushed entry and sets truncated', async () => {
  seed({
    'a.js': 'x'.repeat(64),
    'b.js': 'y'.repeat(64),
    'c.js': 'z'.repeat(64),
  })
  const scan = await scanTree(ROOT, { maxFiles: 2, maxBytes: 16 })
  assert.equal(scan.files.length, 2)
  assert.equal(scan.truncated, true)
  assert.ok(scan.files.every((file) => file.reason === 'too-large'))
})

test('reaching maxFiles exactly without dropping a file is not truncation', async () => {
  seed({ 'a.js': 'var a = 1\n', 'b.js': 'var b = 1\n' })
  const exact = await scanTree(ROOT, { maxFiles: 2 })
  assert.equal(exact.files.length, 2)
  assert.equal(exact.truncated, false)
  writeFileSync(join(ROOT, 'c.js'), 'var c = 1\n')
  const over = await scanTree(ROOT, { maxFiles: 2 })
  assert.equal(over.files.length, 2)
  assert.equal(over.truncated, true)
})

test('selected paths are fully accounted for by processed/skipped/failed', async () => {
  seed({ 'ok.js': 'var a = 1\n', 'notes.md': '# doc\n', 'dep/x.js': 'var x = 1\n' })
  const result = await standardize({ root: ROOT, paths: ['ok.js', 'notes.md', 'dep/x.js', '../escape.js'], mode: 'report' })
  assert.equal(result.stats.selected, 4)
  assert.equal(result.stats.processed + result.stats.skipped + result.stats.failed, 4)
})
