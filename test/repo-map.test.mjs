/**
 * 仓库地图的行为验证。
 *
 * 断言的是「能不能用」：常见语言的顶层符号要被抓到，忽略目录不进入，预算能截断，
 * 渲染结果里有文件、行数与符号分组。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { buildMap, extractSymbols, main, renderMap } from '../scripts/repo-map.mjs'

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-repo-map-'))
  mkdirSync(join(workspace, 'src'), { recursive: true })
  mkdirSync(join(workspace, 'docs'), { recursive: true })
  mkdirSync(join(workspace, 'node_modules', 'junk'), { recursive: true })
  writeFileSync(
    join(workspace, 'src', 'config.mjs'),
    'export function loadConfig() {}\nexport class ConfigStore {}\nexport const DEFAULTS = {}\n',
    'utf8',
  )
  writeFileSync(
    join(workspace, 'src', 'worker.py'),
    'import os\n\nclass Worker:\n    pass\n\ndef run_job():\n    pass\n',
    'utf8',
  )
  writeFileSync(join(workspace, 'docs', 'guide.md'), '# 使用说明\n\n正文。\n', 'utf8')
  writeFileSync(
    join(workspace, 'node_modules', 'junk', 'index.js'),
    'export function ignored() {}\n',
    'utf8',
  )
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

test('常见语言的顶层符号能被提取', () => {
  const js = extractSymbols(
    'export function loadConfig() {}\nexport class ConfigStore {}\nexport const DEFAULTS = {}\n',
  )
  assert.deepEqual(
    js.map((symbol) => symbol.name),
    ['loadConfig', 'ConfigStore', 'DEFAULTS'],
  )
  const py = extractSymbols('class Worker:\n    pass\n\ndef run_job():\n    pass\n')
  assert.deepEqual(
    py.map((symbol) => symbol.name),
    ['Worker', 'run_job'],
  )
  const go = extractSymbols('func main() {}\ntype Server struct{}\n')
  assert.deepEqual(
    go.map((symbol) => symbol.name),
    ['main', 'Server'],
  )
  const md = extractSymbols('# 使用说明\n## 安装\n')
  assert.deepEqual(
    md.map((symbol) => symbol.kind),
    ['h', 'h'],
  )
})

test('忽略目录不进入地图', () => {
  const map = buildMap({ root: workspace })
  const paths = map.files.map((file) => file.path)
  assert.ok(paths.includes('src/config.mjs'))
  assert.ok(paths.includes('src/worker.py'))
  assert.ok(paths.includes('docs/guide.md'))
  assert.ok(!paths.some((path) => path.includes('node_modules')), 'node_modules must be skipped')
})

test('预算是硬上限：超出就截断并标注', () => {
  const small = buildMap({ root: workspace, budget: 30 })
  assert.equal(small.truncated, true)
  assert.ok(
    small.files.length < 3,
    `expected fewer files under a 30-char budget, got ${small.files.length}`,
  )
  const large = buildMap({ root: workspace, budget: 100_000 })
  assert.equal(large.truncated, false)
  assert.equal(large.files.length, 3)
})

test('渲染结果包含文件、行数与符号分组', () => {
  const text = renderMap(buildMap({ root: workspace }))
  assert.match(text, /仓库地图/)
  assert.match(text, /src\/config\.mjs \(\d+ 行\)/)
  assert.match(text, /f loadConfig/)
  assert.match(text, /c ConfigStore/)
})

test('命令行：默认目录与 --json 都可运行', () => {
  assert.equal(main([workspace]), 0)
  assert.equal(main([workspace, '--json', '--budget', '200']), 0)
})
