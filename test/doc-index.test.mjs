/**
 * 文档索引：docs 下的每份文档都要在 INDEX 里，索引也不能指向不存在的东西。
 *
 * 另外查技能参考文件的孤儿：references/*.md 必须被自己的 SKILL.md 引用，
 * 否则写了没人读，等于没写。
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const index = readFileSync(join(root, 'docs', 'INDEX.md'), 'utf8')

/** docs 下的全部文档。 */
const docs = readdirSync(join(root, 'docs'))
  .filter((name) => name.endsWith('.md'))
  .sort()

test('每份 docs 文档都在索引里', () => {
  const missing = docs.filter((name) => name !== 'INDEX.md' && !index.includes(name))
  assert.deepEqual(missing, [], `索引缺少：${missing.join('、')}`)
})

test('索引里的链接都指向存在的文件', () => {
  const broken = [...index.matchAll(/\]\(([^)\s]+)\)/gu)]
    .map((match) => match[1])
    .filter((target) => !target.startsWith('http'))
    .filter((target) => {
      try {
        readFileSync(join(root, 'docs', target))
        return false
      } catch {
        return true
      }
    })
  assert.deepEqual(broken, [], `索引里指向不存在的文件：${broken.join('、')}`)
})

test('技能参考文件都被自己的 SKILL.md 引用，不留孤儿', () => {
  const skillsDir = join(root, 'skills')
  const orphans = []
  for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue
    const skillFile = join(skillsDir, skill.name, 'SKILL.md')
    let body = ''
    try {
      body = readFileSync(skillFile, 'utf8')
    } catch {
      continue
    }
    let references = []
    try {
      references = readdirSync(join(skillsDir, skill.name, 'references')).filter((name) =>
        name.endsWith('.md'),
      )
    } catch {
      continue
    }
    for (const name of references) {
      if (!body.includes(name)) orphans.push(`${skill.name}/references/${name}`)
    }
  }
  assert.deepEqual(orphans, [], `没人引用的参考文件：${orphans.join('、')}`)
})

test('索引自己也在列表里可见（不自闭）', () => {
  assert.ok(index.includes('文档索引'))
  assert.ok(docs.length >= 10, `docs 只有 ${docs.length} 份`)
})
