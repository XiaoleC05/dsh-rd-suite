/**
 * 项目自带工具链的识别与降级。
 *
 * 真实项目多数已经选好格式化器（h3 用 oxlint + oxfmt）；我们的工具若按自己的规则改写，
 * 会产出与项目风格冲突、且项目 CI 会失败的 diff。检测到别人的工具时只报告不改写。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { detectProjectToolchain, shouldDeferToProjectToolchain } from '../code-pipeline/lib/toolchain.js'
import { standardize } from '../code-pipeline/lib/standardize.js'

/** 造一个临时项目。 */
function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rd-toolchain-'))
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf8')
  }
  return dir
}

test('识别配置文件：prettier / oxlint / eslint', () => {
  for (const [file, tool] of [
    ['.prettierrc', 'prettier'],
    ['oxlint.json', 'oxlint'],
    ['.eslintrc.json', 'eslint'],
    ['biome.json', 'biome'],
  ]) {
    const dir = project({ [file]: '{}' })
    const hit = detectProjectToolchain(dir)
    assert.equal(hit?.tool, tool, `${file} 应识别为 ${tool}`)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('从 package.json 的脚本识别', () => {
  const dir = project({
    'package.json': JSON.stringify({ scripts: { fmt: 'oxfmt .', lint: 'oxlint .' } }),
  })
  assert.equal(detectProjectToolchain(dir)?.tool, 'oxfmt')
  rmSync(dir, { recursive: true, force: true })
})

test('从 devDependencies 兜底识别', () => {
  const dir = project({ 'package.json': JSON.stringify({ devDependencies: { prettier: '^3.0.0' } }) })
  assert.equal(detectProjectToolchain(dir)?.tool, 'prettier')
  rmSync(dir, { recursive: true, force: true })
})

test('没有配置的项目不降级', () => {
  const dir = project({ 'package.json': JSON.stringify({ name: 'x' }) })
  assert.equal(detectProjectToolchain(dir), null)
  assert.equal(shouldDeferToProjectToolchain(dir).downgrade, false)
  rmSync(dir, { recursive: true, force: true })
})

test('项目自己就用 biome 时不降级（规则一致）', () => {
  const dir = project({ 'biome.json': '{}' })
  assert.equal(shouldDeferToProjectToolchain(dir).downgrade, false)
  rmSync(dir, { recursive: true, force: true })
})

test('带 .prettierrc 的项目：fix 模式降级为 report，文件不被改写', async () => {
  const dir = project({
    '.prettierrc': '{}',
    'messy.js': 'const  a = { b:1 };\nexport { a }\n',
  })
  const target = join(dir, 'messy.js')
  const before = readFileSync(target, 'utf8')

  const result = await standardize({ root: dir, paths: [target], mode: 'fix' })
  assert.equal(result.mode, 'report', '应当降级')
  assert.ok(result.downgraded !== undefined, '结果要带降级信息')
  assert.equal(result.downgraded.tool, 'prettier')
  assert.match(result.downgraded.reason, /按项目命令格式化/u)
  assert.equal(readFileSync(target, 'utf8'), before, '文件不得被改写')

  rmSync(dir, { recursive: true, force: true })
})

test('没有项目配置时 fix 照常写文件', async () => {
  const dir = project({ 'messy.js': 'const  a = { b:1 };\nexport { a }\n' })
  const target = join(dir, 'messy.js')
  const before = readFileSync(target, 'utf8')
  const result = await standardize({ root: dir, paths: [target], mode: 'fix' })
  assert.equal(result.mode, 'fix')
  assert.equal(result.downgraded, undefined)
  assert.notEqual(readFileSync(target, 'utf8'), before, '应当真的改写')
  rmSync(dir, { recursive: true, force: true })
})
