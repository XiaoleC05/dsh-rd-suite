/**
 * 规格卡与 rd-spec 模板的对齐：宪章要求五要素，模板就必须有这五节。
 *
 * 两边命名不一致时，模型写出的规格卡与验收清单对不上，S6 独立验收按宪章逐条核会核不到。
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const charter = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const templatesDir = join(root, 'skills', 'rd-spec', 'references')

/** 宪章规定的规格卡五要素。 */
export const REQUIRED_SECTIONS = ['目标', '范围', '验收标准', '约束', '风险']

/** 读一份模板。 */
function template(name) {
  return readFileSync(join(templatesDir, name), 'utf8')
}

/** 取出二级标题。 */
function headings(text) {
  return [...String(text).matchAll(/^##\s+(.+)$/gmu)].map((match) => match[1].trim())
}

test('宪章写明规格卡五要素，且点名 specs/ 目录', () => {
  assert.match(charter, /规格卡/u)
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(charter.includes(section), `宪章没提到「${section}」`)
  }
  assert.match(charter, /specs\//u, '宪章要写明产物落到 specs/')
})

test('spec.md 的五节与宪章一一对应', () => {
  const found = headings(template('spec.md'))
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(
      found.some((heading) => heading.includes(section)),
      `spec.md 缺少「${section}」一节，现有：${found.join(' / ')}`,
    )
  }
})

test('plan.md 把改动映射到 AC，tasks.md 可勾选且带 AC 引用', () => {
  const plan = template('plan.md')
  assert.match(plan, /对应 AC/u, '改动清单要有「对应 AC」列，否则不知道哪条改动兑现哪条验收')

  const spec = template('spec.md')
  assert.ok(headings(spec).includes('风险'), '风险归规格卡，spec.md 必须有这一节')

  const tasks = template('tasks.md')
  assert.match(tasks, /- \[ \]/u, 'tasks.md 要用可勾选的任务条目')
})

test('三份模板都存在，不靠记忆里的旧路径', () => {
  for (const name of ['spec.md', 'plan.md', 'tasks.md']) {
    assert.ok(existsSync(join(templatesDir, name)), `缺少模板 ${name}`)
  }
})

test('验收标准要求「可重跑」，不是一句「已验证」', () => {
  const spec = template('spec.md')
  assert.match(spec, /判定方式/u)
  assert.match(spec, /重跑|复现/u, '要写明别人能重跑')
})
