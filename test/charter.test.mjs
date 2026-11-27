/**
 * 宪章的结构守卫。
 *
 * 宪章是模式的核心资产，却一直只靠人工检查：少一节、丢一条关卡、报告模板缺字段，
 * 都不会有任何测试报警。这里把「必须存在的段落与规则」固定下来。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

/**
 * 取出 preset-rd 的 persona prefix 文本。
 * @returns {string} 宪章正文
 */
function charter() {
  const match = /prefix:\s*\|-\r?\n([\s\S]*?)\r?\n\s+suffix:/u.exec(patch)
  assert.ok(match, 'cordis.patch.yml 里找不到 persona prefix')
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s{16}/u, ''))
    .join('\n')
}

const text = charter()

test('九节标题齐全', () => {
  for (const heading of [
    '# 1 优先级',
    '# 2 分级',
    '# 3 流水线与关卡',
    '# 4 领域技能',
    '# 5 Token 与工具纪律',
    '# 6 交付报告',
    '# 7 已装能力',
    '# 8 安全红线',
  ]) {
    assert.ok(text.includes(heading), `宪章缺少 ${heading}`)
  }
  assert.ok(text.includes('# 5 Token 与工具纪律'), '纪律一节不能改名丢内容')
})

test('流水线八步与两道关卡都在', () => {
  for (let step = 1; step <= 8; step += 1) assert.ok(text.includes(`S${step} `), `缺少 S${step}`)
  assert.match(text, /S5 验证【关卡】/u)
  assert.match(text, /S6 独立验收【关卡】/u)
  assert.match(text, /VERDICT/u, 'S6 要求先给 VERDICT')
})

test('报告模板含验收、审计与风险三行', () => {
  const report = text.slice(text.indexOf('# 6 交付报告'))
  for (const item of ['**结论**', '**改动**', '**验收**', '**审计**', '**风险与未完成**']) {
    assert.ok(report.includes(item), `报告模板缺少 ${item}`)
  }
  assert.match(report, /codeAuditChecked/u, '审计行要指名实际字段')
  assert.match(report, /未运行：原因/u, '审计没跑时要写原因')
})

test('记忆与 GitHub 流程都写清了读写时机', () => {
  assert.match(text, /memory_save/u)
  assert.match(text, /memory_search/u)
  assert.match(text, /开工前先 memory_search/u)
  for (const step of ['G0', 'G1', 'G3', 'G4', 'G5', 'G7'])
    assert.ok(text.includes(step), `缺少 ${step}`)
  assert.match(text, /precheck 返回 ok:false 就停下报告/u)
})

test('占位符只允许 model，且不出现花括号残留', () => {
  const placeholders = [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((match) => match[1])
  assert.deepEqual(placeholders, ['model'])
})

test('体积在预算内', () => {
  assert.ok(text.length <= 5000, `宪章 ${text.length} 字符，超过 5000 预算`)
})
