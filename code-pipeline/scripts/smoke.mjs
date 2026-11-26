/**
 * Local smoke test: builds a fixture workspace, scans it, classifies every file,
 * then runs the standardization pipeline in report mode and prints the outcome.
 *
 * Usage: node scripts/smoke.mjs [--fix]
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanTree, buildTree } from '../lib/tree.js'
import { standardize } from '../lib/standardize.js'
import { listPresets, describePreset } from '../lib/presets.js'
import { probeEngines } from '../lib/engines/index.js'

const fixMode = process.argv.includes('--fix')

const fixtures = {
  'main.go': 'package main\n\nimport (\n    "fmt"\n)\n\nfunc main() {\n\tfmt.Println("hi")\n}\n',
  'src/app.ts': "const greeting: string = \"hello\"\n\nexport function greet(name: string): string {\n  return greeting + name\n}\n",
  'src/index.js': "var x = 1\nif (x == 1) {\n    console.log( 'ok' )\n}\n",
  'scripts/util.py': 'def add(a,b):\r\n\treturn a+b   \r\n\r\n\r\n\r\n',
  'web/page.html': '<!doctype html>\n<html>\n<body>\n<p>hi</p>\n</body>\n</html>\n',
  Makefile: 'build:\n    go build -o app .\n\ntest:\n    go test ./...\n',
  'web/style.css': '.a{color:red;margin:0px}\n',
  'native/main.cpp': 'int main(){return 0;}\n',
  'scripts/build.sh': '#!/bin/bash\nif [ -f a ]; then\n  echo yes\nfi\n',
  'scripts/deploy.ps1': 'function Do-Thing {\r\n\tWrite-Host "x"\r\n}\r\n',
  'native/lib.rs': 'fn main() {}\n',
  'assets/logo.png': 'not-a-real-png',
  'node_modules/dep/index.js': 'module.exports = 1\n',
  'README.md': '# hi\n',
}

const root = join(tmpdir(), 'code-pipeline-fixture')
rmSync(root, { recursive: true, force: true })
for (const [relPath, content] of Object.entries(fixtures)) {
  const abs = join(root, relPath)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

const engines = await probeEngines()
console.log('=== engines installed ===')
console.log(engines)

const presets = listPresets()
console.log('\n=== presets ===', presets.length)
for (const preset of presets) {
  console.log(`  ${preset.id.padEnd(12)} ${preset.engine.padEnd(13)} depth=${preset.depth.padEnd(7)} rules=${preset.ruleCount}`)
}

const scan = await scanTree(root)
console.log(`\n=== scan === files=${scan.files.length} dirs=${scan.dirCount} truncated=${scan.truncated}`)
for (const file of scan.files) {
  const tag = file.supported ? `P0:${file.language}` : `skip:${file.reason ?? file.display}`
  console.log(`  ${file.path.padEnd(28)} ${String(file.size).padStart(5)}B  ${tag}`)
}

const tree = buildTree(scan.files)
console.log('\n=== tree (top level) ===')
for (const node of tree) {
  console.log(`  ${node.type === 'dir' ? '[dir]' : '[file]'} ${node.name}${node.type === 'dir' ? ` (${node.children.length})` : ''}`)
}

const selectable = scan.files.filter((file) => file.supported).map((file) => file.path)
console.log(`\n=== standardization (${fixMode ? 'fix' : 'report'}) over ${selectable.length} files ===`)

const result = await standardize({ root, paths: selectable, mode: fixMode ? 'fix' : 'report' })
console.log('stats:', result.stats)
for (const file of result.files) {
  const flags = [file.status, file.engine, file.depth, file.degraded ? 'DEGRADED' : ''].filter(Boolean).join(' / ')
  console.log(`  ${file.path.padEnd(24)} ${flags}`)
  if (file.status === 'changed') {
    console.log(`      ${file.deltaLines >= 0 ? '+' : ''}${file.deltaLines} lines, ${file.deltaBytes >= 0 ? '+' : ''}${file.deltaBytes} bytes`)
  }
}
console.log('skipped:', result.skipped)

const goPreset = describePreset('go')
console.log('\n=== go preset ===')
console.log(JSON.stringify({ id: goPreset.id, engine: goPreset.engine, categories: goPreset.categories }, null, 0))

process.exitCode = result.ok ? 0 : 1
