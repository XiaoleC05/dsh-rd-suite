/**
 * 交付门禁的验证：聚合逻辑与在真实仓库上的整体运行。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MIN_DOC_SCORE, runPreflight, summarizeGates } from '../scripts/preflight.mjs'

test('聚合：全通过时 ok，计数正确', () => {
  const summary = summarizeGates([
    { name: 'a', ok: true, detail: '' },
    { name: 'b', ok: true, detail: '' },
  ])
  assert.deepEqual(summary, { ok: true, passed: 2, failed: [] })
})

test('聚合：单个失败点名到具体门禁', () => {
  const summary = summarizeGates([
    { name: 'a', ok: true, detail: '' },
    { name: 'b', ok: false, detail: 'x' },
  ])
  assert.equal(summary.ok, false)
  assert.equal(summary.passed, 1)
  assert.deepEqual(summary.failed, ['b'])
})

test('聚合：多个失败按顺序列全', () => {
  const summary = summarizeGates([
    { name: 'a', ok: false, detail: '' },
    { name: 'b', ok: true, detail: '' },
    { name: 'c', ok: false, detail: '' },
  ])
  assert.deepEqual(summary.failed, ['a', 'c'])
})

test('文档阈值是 80', () => {
  assert.equal(MIN_DOC_SCORE, 80)
})

test('在本仓库跑一次：七道门禁全过', async () => {
  const { gates, summary } = await runPreflight()
  assert.deepEqual(
    gates.map((gate) => gate.name),
    ['文档分数', '重复段落', '术语一致', '打包校验', '安装冒烟', '流程演练', '文档示例'],
  )
  for (const gate of gates) assert.ok(gate.detail !== '', `${gate.name} 要有可读的结论行`)
  assert.deepEqual(summary, { ok: true, passed: 7, failed: [] })
  const drill = gates.find((gate) => gate.name === '流程演练')
  assert.match(drill.detail, /7 步全过/u)
})
