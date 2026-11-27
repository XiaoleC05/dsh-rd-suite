/**
 * 安装冒烟的验证：清单展开（跳过依赖目录）、问题判定，以及在本仓库上真跑一次。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectSmokeProblems, expandFileEntries, smokeInstall } from '../scripts/smoke-install.mjs'

/** 造一个假的文件系统。 */
function fakeFs(tree) {
  const stat = (relative) => {
    const node = tree[relative]
    if (node === undefined) throw new Error('ENOENT ' + relative)
    return { isDirectory: () => node !== null, isFile: () => node === null }
  }
  // 与 readdirSync 一致：只返回直接子项的名字，不带父路径。
  const readDir = (relative) =>
    Object.keys(tree)
      .filter(
        (path) => path.startsWith(`${relative}/`) && !path.slice(relative.length + 1).includes('/'),
      )
      .map((path) => path.slice(relative.length + 1))
  return { stat, readDir }
}

test('清单展开：文件直接收、目录递归收、通配取前缀', () => {
  const { stat, readDir } = fakeFs({
    'index.js': null,
    'client.js': null,
    'code-pipeline': {},
    'code-pipeline/index.js': null,
    'code-pipeline/lib': {},
    'code-pipeline/lib/a.js': null,
    docs: {},
    'docs/x.md': null,
  })
  const files = expandFileEntries(
    ['index.js', 'code-pipeline', 'docs/**', 'missing.js'],
    stat,
    readDir,
  )
  assert.deepEqual(
    files.sort(),
    ['client.js'].length === 0
      ? []
      : ['code-pipeline/index.js', 'code-pipeline/lib/a.js', 'docs/x.md', 'index.js'],
  )
})

test('清单展开：跳过依赖目录', () => {
  const { stat, readDir } = fakeFs({
    github: {},
    'github/index.js': null,
    'github/node_modules': {},
    'github/node_modules/dep': {},
    'github/node_modules/dep/index.js': null,
  })
  assert.deepEqual(expandFileEntries(['github'], stat, readDir), ['github/index.js'])
})

test('问题判定：没有工具、没有路由、缺成员都要报', () => {
  const problems = collectSmokeProblems({
    tools: 0,
    routes: 0,
    members: ['code-pipeline'],
    patchMembers: ['code-pipeline', 'ghost'],
  })
  assert.equal(problems.length, 3)
  assert.ok(problems.some((problem) => problem.includes('没有注册任何工具')))
  assert.ok(problems.some((problem) => problem.includes('ghost')))
  assert.deepEqual(
    collectSmokeProblems({ tools: 3, routes: 2, members: ['a'], patchMembers: ['a'] }),
    [],
  )
})

test('在本仓库上真跑一次：副本能加载并注册齐全', async () => {
  const result = await smokeInstall()
  assert.deepEqual(result.problems, [], `冒烟不通过：${result.problems.join('；')}`)
  assert.ok(result.files > 50, `副本文件数偏少：${result.files}`)
  assert.ok(result.tools >= 9, `注册工具数偏少：${result.tools}`)
  assert.ok(result.routes >= 8, `注册路由数偏少：${result.routes}`)
})
