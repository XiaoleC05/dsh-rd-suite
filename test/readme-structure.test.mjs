/**
 * README 结构表与打包清单对账。
 *
 * 手写结构表的失败方式是「新增了没加」：读者按表找文件会找不到，而没有任何检查盯着它。
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** 结构表正文（## 结构 到下一个二级标题之间）。 */
function structureSection() {
  const start = readme.indexOf('## 结构')
  assert.ok(start >= 0, 'README 缺少「结构」一节')
  const rest = readme.slice(start + 4)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
}

const structure = structureSection()

test('结构表覆盖打包清单的每一项', () => {
  const missing = pkg.files
    .map((entry) => entry.replace('/*.json', '/'))
    .filter((entry) => !structure.includes(entry))
  assert.deepEqual(missing, [], `结构表缺少：${missing.join('、')}`)
})

test('结构表提到每个脚本', () => {
  const scripts = readdirSync(join(root, 'scripts')).filter((name) => name.endsWith('.mjs'))
  const missing = scripts.filter((name) => !structure.includes(`scripts/${name}`))
  assert.deepEqual(missing, [], `结构表缺少脚本：${missing.join('、')}`)
})

test('README 必备章节都在', () => {
  for (const section of ['## 安装', '## 结构', '## 迭代进度', '## 注意']) {
    assert.ok(readme.includes(section), `README 缺少 ${section}`)
  }
})

test('结构表不写已经不存在的东西', () => {
  // 只查带目录的路径：表里的裸文件名（github.js、DESIGN.md）是行文里的名字，不是仓库根路径。
  const paths = [...structure.matchAll(/`([\w./-]+\.(?:js|mjs|json|yml|svg|md))`/gu)]
    .map((match) => match[1])
    .filter((path) => path.includes('/'))
  const missing = paths.filter((path) => {
    try {
      readFileSync(join(root, path))
      return false
    } catch {
      return true
    }
  })
  assert.deepEqual(missing, [], `结构表里指向不存在的文件：${missing.join('、')}`)
})
