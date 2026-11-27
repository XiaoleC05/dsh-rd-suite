/**
 * 报告模板与沉淀要求的对齐。
 *
 * 模板只在宪章里写一遍，没有任何东西盯着它：字段被删、L0/L1 例外被漏写、
 * 沉淀的记忆类型与模板脱节，报告照样「看起来完整」。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const charter = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

/** 报告模板必须包含的字段。 */
export const REQUIRED_FIELDS = ['**结论**', '**改动**', '**验收**', '**审计**', '**风险与未完成**']

test('报告模板五个必备字段都在', () => {
  for (const field of REQUIRED_FIELDS) assert.ok(charter.includes(field), `报告模板缺少 ${field}`)
})

test('「需要你决定」是按需出现，不是常驻字段', () => {
  assert.ok(charter.includes('**需要你决定**'))
  assert.match(charter, /仅.*待决/u, '要写明只在确有待决事项时出现')
})

test('验收要给出通过数与未验证数，不是一句「已验证」', () => {
  assert.match(charter, /合计\s*x\/y/u, '验收要写通过比例')
  assert.match(charter, /未验证\s*z\s*项/u, '验收要写未验证项数')
})

test('审计字段引用工具返回的三个数字', () => {
  assert.match(charter, /codeAuditChecked/u)
  assert.match(charter, /Remaining/u)
  assert.match(charter, /未运行/u, '没有审计要写明原因，不能空着')
})

test('分级例外写明：L0 不套模板，L1 简化', () => {
  assert.match(charter, /L0 不套模板/u)
  assert.match(charter, /L1.*验证：命令/u, 'L1 要写明用一行验证代替表格')
})

test('沉淀环节点名四个记忆类型与 memory_save', () => {
  assert.match(charter, /memory_save/u)
  for (const type of ['template', 'pitfall', 'fix', 'strategy']) {
    assert.ok(charter.includes(type), `沉淀要写明记忆类型 ${type}`)
  }
})

test('子代理返回格式与报告口径一致：都要「未验证」', () => {
  const templates = readFileSync(
    join(root, 'skills', 'rd-ecosystem', 'references', 'subagent-templates.md'),
    'utf8',
  )
  assert.match(templates, /未验证/u)
  assert.match(charter, /未验证/u, '两侧都要承认「没验证的部分」，否则报告会虚报完成度')
})
