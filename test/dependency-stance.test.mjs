/**
 * 定位检查：插件不再承诺零依赖或完全离线，文档不得把这两条写成硬约束。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 会读到约束表述的文档。 */
const DOCS = ['README.md', 'docs/REFERENCES.md', 'docs/DESIGN.md', 'cordis.patch.yml']

test('文档里不再把「零依赖 / 完全离线」写成约束', () => {
  for (const file of DOCS) {
    const text = readFileSync(join(root, file), 'utf8')
    for (const phrase of ['零依赖、纯 ESM、离线可用', '约束是零依赖', '必须零依赖']) {
      assert.equal(text.includes(phrase), false, `${file} 仍把零依赖写成约束：${phrase}`)
    }
  }
})

test('README 写清依赖与联网分档', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  assert.match(readme, /## 依赖与联网/u)
  for (const row of ['代码格式化与审计', 'GitHub 流程', '源码重复检测', 'context7']) {
    assert.ok(readme.includes(row), `分档表缺少「${row}」`)
  }
  assert.match(readme, /不承诺零依赖或完全离线/u, '要明确写出这条定位已取消')
})

test('引入依赖的门槛写清三件事', () => {
  const refs = readFileSync(join(root, 'docs/REFERENCES.md'), 'utf8')
  assert.match(refs, /装什么、解决什么问题、没有网络或依赖缺失时降级成什么/u)
})
