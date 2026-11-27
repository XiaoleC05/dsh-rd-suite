/**
 * 技能目录的规范检查。
 *
 * 技能是模型按描述路由进来的说明书：frontmatter 不合法、描述超长、正文过胖，
 * 或者引用了仓库里不存在的脚本，都会让模式在真正需要时失效。这里把这些约束固定下来。
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const skillsRoot = join(root, 'skills')

/** 每个技能目录下的 SKILL.md。 */
const skills = readdirSync(skillsRoot)
  .filter((name) => statSync(join(skillsRoot, name)).isDirectory())
  .map((name) => ({ name, file: join(skillsRoot, name, 'SKILL.md') }))
  .filter((entry) => existsSync(entry.file))

/** 拆出 frontmatter 与正文。 */
function parse(file) {
  const text = readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(text)
  assert.ok(match, `${file} 缺少 frontmatter`)
  const front = match[1]
  const body = match[2] ?? ''
  const field = (key) => new RegExp(`^${key}:\\s*(.+)$`, 'mu').exec(front)?.[1]?.trim()
  return { text, body, name: field('name'), description: field('description') }
}

test('技能目录不为空，且每个技能都有 SKILL.md', () => {
  assert.ok(skills.length >= 8, `expected at least 8 skills, found ${skills.length}`)
})

test('frontmatter 合法：name 与目录同名，description 不超过 150 字', () => {
  for (const entry of skills) {
    const parsed = parse(entry.file)
    assert.equal(parsed.name, entry.name, `${entry.name} 的 frontmatter name 必须与目录同名`)
    assert.ok(parsed.description !== undefined, `${entry.name} 缺少 description`)
    assert.ok(
      parsed.description.length <= 150,
      `${entry.name} 的 description 有 ${parsed.description.length} 字，超过 150`,
    )
    assert.ok(parsed.description.length >= 20, `${entry.name} 的 description 太短，写清何时加载`)
  }
})

test('正文不超过 6000 字符：细节应当放进 references/', () => {
  for (const entry of skills) {
    const parsed = parse(entry.file)
    assert.ok(
      parsed.body.length <= 6000,
      `${entry.name} 正文 ${parsed.body.length} 字符，超过 6000`,
    )
  }
})

test('技能里引用的 scripts/ 路径必须真实存在', () => {
  for (const entry of skills) {
    const parsed = parse(entry.file)
    const references = [...parsed.text.matchAll(/`(scripts\/[^`\s]+)`/gu)].map((match) => match[1])
    for (const reference of references) {
      const target = reference.split(/\s+/u)[0]
      assert.ok(existsSync(join(root, target)), `${entry.name} 引用了不存在的 ${target}`)
    }
  }
})

test('文案技能覆盖去 AI 味、AIGC 自检与降重三段', () => {
  const copy = skills.find((entry) => entry.name === 'rd-copy')
  assert.ok(copy, '缺少 rd-copy 技能')
  const { text } = parse(copy.file)
  for (const required of ['去 AI 味', 'AIGC 自检', '降重', 'aigc-check.mjs', '--min-score']) {
    assert.ok(text.includes(required), `rd-copy 缺少 ${required}`)
  }
})

test('记忆与流程接上了：技能与宪章都说清何时读写记忆', () => {
  const read = (relative) => readFileSync(join(root, relative), 'utf8')
  const retro = read('skills/rd-retro/SKILL.md')
  const spec = read('skills/rd-spec/SKILL.md')
  const charter = read('cordis.patch.yml')
  assert.match(retro, /memory_search/u, '复盘要先查记忆')
  assert.match(spec, /memory_search/u, '写方案前要先找现成模板')
  assert.match(charter, /memory_save/u, '宪章的沉淀要写进长期记忆')
  assert.match(charter, /memory_search/u, '开工前要能查到历史做法')
})
