/**
 * 技能目录与路由表的双向一致性。
 *
 * 只查一个方向不够：漏写路由 → 技能永远不被加载；留着已删技能 → 模型会去找不存在的东西。
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const skillsDir = join(root, 'skills')
const charter = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

/** 技能目录名。 */
const directories = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

/** 读取 SKILL.md 的 frontmatter 字段。 */
function frontmatterOf(name) {
  const text = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)
  assert.ok(match !== null, `${name}/SKILL.md 缺少 frontmatter`)
  const fields = {}
  for (const line of match[1].split(/\r?\n/u)) {
    const field = /^([a-zA-Z_]+):\s*(.*)$/u.exec(line.trim())
    if (field !== null) fields[field[1]] = field[2].trim()
  }
  return fields
}

/** 宪章路由表里提到的技能名（只看正文，注释里的模块 id 不算）。 */
function routedSkills() {
  const body = charter
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  const found = new Set()
  // 前面不能紧跟连字符或斜杠：否则 dsh-rd-suite 会被误当成 rd-suite。
  for (const match of body.matchAll(/(?<![\w/-])rd-[a-z][a-z-]*[a-z]\b/gu)) found.add(match[0])
  return [...found].sort()
}

test('每个技能目录都有 SKILL.md，name 与目录名一致', () => {
  assert.ok(directories.length >= 10, `技能数量 ${directories.length}`)
  for (const name of directories) {
    const fields = frontmatterOf(name)
    assert.equal(fields.name, name, `${name} 的 name 与目录名不一致`)
    assert.ok(String(fields.description ?? '').trim() !== '', `${name} 缺少 description`)
    assert.ok(String(fields.description).length <= 200, `${name} 的 description 超过 200 字符`)
  }
})

test('宪章路由表提到的技能都真实存在', () => {
  const missing = routedSkills().filter((name) => !directories.includes(name))
  assert.deepEqual(missing, [], `宪章里提到但不存在的技能：${missing.join('、')}`)
})

test('每个技能都被路由到，没有孤儿技能', () => {
  const routed = routedSkills()
  const orphans = directories.filter((name) => !routed.includes(name))
  assert.deepEqual(orphans, [], `没有被路由的技能：${orphans.join('、')}`)
})
