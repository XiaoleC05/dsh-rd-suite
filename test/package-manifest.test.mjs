/**
 * 打包清单：新增脚本自动被纳入检查，不需要改任何列表。
 *
 * 手写白名单的失败方式是「忘了加」——发布后才发现缺文件。这里反过来：
 * 枚举磁盘上的真实文件，逐个要求被白名单覆盖。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** 需要被白名单覆盖的目录。 */
const DIRECTORIES = ['scripts', 'lib', 'docs', 'skills', 'code-pipeline', 'github', 'memory']

/**
 * 递归列出目录下的文件（相对仓库根）。
 * @param {string} directory - 目录
 * @returns {string[]} 相对路径
 */
function walk(directory) {
  const found = []
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      found.push(...walk(path))
    } else {
      found.push(path.split('\\').join('/'))
    }
  }
  return found
}

/** 白名单是否覆盖某个路径。 */
function covered(path) {
  return pkg.files.some((pattern) => {
    if (pattern === path) return true
    if (pattern.endsWith('/*.json'))
      return path.startsWith(pattern.slice(0, -6)) && path.endsWith('.json')
    return path === pattern || path.startsWith(`${pattern}/`)
  })
}

test('白名单覆盖每个目录下的文件', () => {
  for (const directory of DIRECTORIES) {
    for (const path of walk(directory)) {
      assert.ok(covered(path), `${path} 不在 package.json 的 files 里，发布后会缺文件`)
    }
  }
})

test('每个脚本都被测试或文档引用，不留孤儿', () => {
  const corpus = [
    ...readdirSync(join(root, 'test')).map((name) =>
      readFileSync(join(root, 'test', name), 'utf8'),
    ),
    readFileSync(join(root, 'README.md'), 'utf8'),
    readFileSync(join(root, 'docs', 'ITERATION.md'), 'utf8'),
    ...readdirSync(join(root, 'docs'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => readFileSync(join(root, 'docs', name), 'utf8')),
  ].join('\n')

  const orphans = []
  for (const path of walk('scripts')) {
    const name = relative('scripts', path).split('\\').join('/')
    if (!corpus.includes(name) && !corpus.includes(path)) orphans.push(path)
  }
  assert.deepEqual(orphans, [], `没人引用的脚本：${orphans.join('、')}`)
})

test('每个 .mjs 都能通过语法检查', () => {
  const scripts = walk('scripts').filter((path) => path.endsWith('.mjs'))
  for (const path of scripts) {
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ['--check', join(root, path)], { stdio: 'pipe' }),
      `${path} 语法不合法`,
    )
  }
})

test('脚本数量与目录实况一致（防止白名单式硬编码）', () => {
  const onDisk = walk('scripts').filter((path) => path.endsWith('.mjs')).length
  assert.ok(onDisk >= 33, `脚本只有 ${onDisk} 个，少了说明有文件未被枚举`)
})
