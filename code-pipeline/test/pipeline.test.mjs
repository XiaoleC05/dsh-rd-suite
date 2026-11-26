/**
 * Pipeline tests mapped to the acceptance criteria:
 *  - the tree shows expandable directories with a language per file
 *  - select-all covers every P0 code file exactly once (no miss, no duplicate)
 *  - non-P0 and non-code files are never standardized
 *  - report mode never writes; fix mode writes and is idempotent
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanTree, buildTree } from '../lib/tree.js'
import { standardize } from '../lib/standardize.js'
import { classify } from '../lib/languages.js'
import { listPresets } from '../lib/presets.js'

const ROOT = join(tmpdir(), 'code-pipeline-test')

function seed(files) {
  rmSync(ROOT, { recursive: true, force: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(ROOT, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
}

function collectSelectable(nodes, out = []) {
  for (const node of nodes) {
    if (node.type === 'dir') collectSelectable(node.children, out)
    else if (node.supported) out.push(node.path)
  }
  return out
}

test('ten P0 languages all have a preset', () => {
  const ids = new Set(listPresets().map((preset) => preset.id))
  const expected = ['go', 'typescript', 'javascript', 'python', 'html', 'makefile', 'css', 'cpp', 'shell', 'powershell']
  for (const id of expected) assert.ok(ids.has(id), `missing preset: ${id}`)
  assert.equal(listPresets().length, expected.length)
})

test('classification: P0 vs non-P0 vs non-code', () => {
  assert.equal(classify('a/b.go').supported, true)
  assert.equal(classify('Makefile').language, 'makefile')
  assert.equal(classify('x.rs').supported, false)
  assert.equal(classify('x.rs').reason, 'outside-p0')
  assert.equal(classify('logo.png').kind, 'non-code')
  assert.equal(classify('data.bin').kind, 'non-code')
})

test('scan skips dependency dirs and binary assets', async () => {
  seed({
    'main.go': 'package main\n',
    'node_modules/dep/index.js': 'x\n',
    'dist/out.js': 'y\n',
    'assets/logo.png': 'bin',
    'notes.rs': 'fn main(){}\n',
  })
  const scan = await scanTree(ROOT)
  const paths = scan.files.map((file) => file.path).sort()
  assert.deepEqual(paths, ['main.go', 'notes.rs'])
})

test('tree keeps every selectable file and select-all has no duplicate or omission', async () => {
  seed({
    'a.go': 'package a\n',
    'src/b.ts': 'const b = 1\n',
    'src/c.js': 'const c = 1\n',
    'src/deep/d.py': 'x = 1\n',
    'native/e.cpp': 'int main(){return 0;}\n',
    'scripts/f.sh': '#!/bin/sh\n',
    'scripts/g.ps1': 'Write-Host 1\n',
    'web/h.html': '<p>x</p>\n',
    'web/i.css': '.a{color:red}\n',
    'Makefile': 'all:\n\techo hi\n',
    'skip/j.rs': 'fn main(){}\n',
    'skip/k.md': '# doc\n',
  })
  const scan = await scanTree(ROOT)
  const tree = buildTree(scan.files)
  const fromTree = collectSelectable(tree)

  assert.equal(new Set(fromTree).size, fromTree.length, 'select-all produced duplicates')
  const fromScan = scan.files.filter((file) => file.supported).map((file) => file.path)
  assert.deepEqual([...fromTree].sort(), [...fromScan].sort(), 'tree and scan disagree on the selectable set')
  assert.equal(fromTree.length, 10, 'expected the ten P0 fixtures')
  for (const path of fromTree) assert.ok(!path.endsWith('.rs') && !path.endsWith('.md'))
})

test('directories nest and are expandable', async () => {
  seed({ 'src/deep/d.py': 'x = 1\n' })
  const tree = buildTree((await scanTree(ROOT)).files)
  const src = tree.find((node) => node.name === 'src')
  assert.equal(src.type, 'dir')
  const deep = src.children.find((node) => node.name === 'deep')
  assert.equal(deep.type, 'dir')
  assert.equal(deep.children[0].path, 'src/deep/d.py')
})

test('report never writes, fix writes once, second fix is a no-op', async () => {
  seed({
    'a.go': 'package main\n\nfunc main() {\n    println(1)\n}\n',
    'b.py': 'def f(a,b):\r\n\treturn a+b   \r\n',
    'c.js': 'var x = {a:1,b:2}\n',
  })
  const paths = ['a.go', 'b.py', 'c.js']
  const before = Object.fromEntries(paths.map((p) => [p, readFileSync(join(ROOT, p), 'utf8')]))

  const report = await standardize({ root: ROOT, paths, mode: 'report' })
  assert.equal(report.mode, 'report')
  for (const path of paths) {
    assert.equal(readFileSync(join(ROOT, path), 'utf8'), before[path], `report mode wrote ${path}`)
  }

  const fix = await standardize({ root: ROOT, paths, mode: 'fix' })
  assert.ok(fix.stats.written > 0, 'fix mode wrote nothing')
  for (const path of paths) {
    assert.notEqual(readFileSync(join(ROOT, path), 'utf8'), before[path], `fix mode did not change ${path}`)
  }

  const again = await standardize({ root: ROOT, paths, mode: 'fix' })
  assert.equal(again.stats.changed, 0, 'second fix was not idempotent')
  assert.equal(again.stats.written, 0)
  assert.equal(again.stats.failed, 0)
})

test('Makefile recipes are converted to tabs, continuations keep their backslash', async () => {
  seed({ Makefile: 'build:\n    go build \\\n      -o app .\n' })
  const result = await standardize({ root: ROOT, paths: ['Makefile'], mode: 'fix' })
  assert.equal(result.stats.failed, 0)
  const text = readFileSync(join(ROOT, 'Makefile'), 'utf8')
  assert.ok(text.includes('\tgo build \\'), `recipe line is not tab-indented:\n${text}`)
  assert.ok(text.includes('\\\n'), 'continuation backslash was lost')
})

test('non-P0 files are skipped and recorded, never touched', async () => {
  seed({ 'x.rs': 'fn main(){  }\n', 'y.md': '# t\n' })
  const before = readFileSync(join(ROOT, 'x.rs'), 'utf8')
  const result = await standardize({ root: ROOT, paths: ['x.rs', 'y.md'], mode: 'fix' })
  assert.equal(result.skipped.length, 2)
  assert.ok(result.skipped.every((item) => item.reason === 'outside-p0'))
  assert.equal(result.stats.processed, 0)
  assert.equal(readFileSync(join(ROOT, 'x.rs'), 'utf8'), before)
})

test('a path escaping the root is refused and reported as a failure', async () => {
  seed({ 'ok.go': 'package ok\n' })
  const result = await standardize({ root: ROOT, paths: ['../escape.go'], mode: 'fix' })
  assert.equal(result.files.length, 1)
  assert.equal(result.files[0].status, 'failed')
  assert.equal(result.files[0].reason, 'path-escape')
  assert.equal(result.stats.processed, 0)
})

test('style findings are reported but never auto-applied', async () => {
  // Biome 2.6 classifies the useConst / noDoubleEquals fixes as unsafe, so a
  // full-depth preset must report them instead of silently rewriting the code.
  seed({ 'style.js': 'if (a == b) {\n  go()\n}\n' })
  const before = readFileSync(join(ROOT, 'style.js'), 'utf8')
  const result = await standardize({ root: ROOT, paths: ['style.js'], mode: 'fix' })
  assert.equal(result.stats.failed, 0)
  assert.ok(result.stats.lintFindings > 0, 'expected lint findings to be reported')
  const finding = result.files[0].findings[0]
  assert.ok(typeof finding.rule === 'string' && finding.rule.startsWith('lint/'))
  assert.ok(Number.isFinite(finding.line) && finding.line > 0)
  assert.equal(readFileSync(join(ROOT, 'style.js'), 'utf8'), before, 'a style finding must not rewrite the file')
})
