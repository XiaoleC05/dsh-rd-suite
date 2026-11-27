/**
 * 无证据断言审查的验证。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { auditClaims, CLAIMS, hasEvidence, HONEST } from '../scripts/claim-audit.mjs'

test('hasEvidence：认得命令、比例、测试输出、文件行与箭头', () => {
  assert.equal(hasEvidence('跑 `node --test`'), true)
  assert.equal(hasEvidence('通过 8/8'), true)
  assert.equal(hasEvidence('# fail 0'), true)
  assert.equal(hasEvidence('index.js:42 出错'), true)
  assert.equal(hasEvidence('命令 → 结果'), true)
  assert.equal(hasEvidence('看起来挺好'), false)
})

test('有证据的断言不报', () => {
  const text = ['全量测试：', '- `node --test` → 511/511 通过', '验收全部通过。'].join('\n')
  assert.deepEqual(auditClaims(text), [])
})

test('没证据的断言必报', () => {
  const findings = auditClaims('功能已完成，体验良好。')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].claim, '已完成')
  assert.equal(findings[0].line, 1)
})

test('诚实标注不报：未验证 / 未做 / 未运行', () => {
  for (const word of HONEST) {
    const text = `本次${word}：原因是缺少目标环境。`
    assert.deepEqual(auditClaims(text), [], `${word} 不该被当成虚报`)
  }
})

test('证据在上一行或下两行也算数', () => {
  const above = ['`node scripts/preflight.mjs` 输出如下：', '交付门禁全部通过。'].join('\n')
  assert.deepEqual(auditClaims(above), [])
  const below = ['验收已通过。', '', '证据：', '- `# fail 0`'].join('\n')
  assert.deepEqual(auditClaims(below), [])
})

test('标题行不参与判定', () => {
  assert.deepEqual(auditClaims('## 已完成的部分'), [])
})

test('断言词表不为空，避免规则被清空后静默失效', () => {
  assert.ok(CLAIMS.length >= 8)
  assert.ok(HONEST.length >= 5)
})
