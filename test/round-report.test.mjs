/**
 * 单轮评估报告的验证：四段结构、数字落位与缺证据时的降级。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildRoundReport, findRoundRow, POSITIVE_CRITERIA } from '../scripts/round-report.mjs'

const HEALTH = {
  charter: 4964,
  tests: { files: 38, cases: 290 },
  docScores: [
    { path: 'README.md', score: 100 },
    { path: 'docs/CHANGELOG.md', score: 85 },
  ],
  drifted: [],
  packagingGaps: [],
}

const GATES = [
  { name: '文档分数', ok: true, detail: 'ok' },
  { name: '安装冒烟', ok: true, detail: 'ok' },
]

test('四段齐全，数字来自证据而不是默认值', () => {
  const report = buildRoundReport({
    round: 43,
    ledgerRow: { issue: '#58', note: 'ledger-cli · 账本命令' },
    files: 38,
    health: HEALTH,
    gates: GATES,
  })
  for (const heading of ['### ① 本轮做了什么', '### ② 验证数据', '### ③ 正向判据', '### ④ 结论']) {
    assert.ok(report.includes(heading), `缺少 ${heading}`)
  }
  assert.match(report, /## 第 43 轮评估/u)
  assert.match(report, /ledger-cli · 账本命令/u)
  assert.match(report, /\| 用例数 \| 290 \|/u)
  assert.match(report, /\| 交付门禁 \| 2 项全过 \|/u)
  assert.match(report, /docs\/CHANGELOG\.md 85/u, '取的是最低分那份文档')
  assert.match(report, /\| 打包缺口 \| 无 \|/u)
})

test('五条判据逐项出现且都待勾选', () => {
  const report = buildRoundReport({
    round: 1,
    ledgerRow: null,
    files: 0,
    health: HEALTH,
    gates: GATES,
  })
  for (const criterion of POSITIVE_CRITERIA) {
    assert.ok(report.includes(criterion), `缺少判据：${criterion}`)
  }
  assert.equal((report.match(/待勾选/gu) ?? []).length, POSITIVE_CRITERIA.length)
})

test('账本没有该轮时给出补救命令，而不是静默留空', () => {
  const report = buildRoundReport({
    round: 99,
    ledgerRow: null,
    files: 0,
    health: HEALTH,
    gates: GATES,
  })
  assert.match(report, /--append-round/u)
})

test('有门禁失败时结论段要求先修，不许计入', () => {
  const report = buildRoundReport({
    round: 5,
    ledgerRow: null,
    files: 1,
    health: HEALTH,
    gates: [...GATES, { name: '流程演练', ok: false, detail: 'x' }],
  })
  assert.match(report, /流程演练 未过/u)
  assert.match(report, /负面迭代不计入轮次/u)
})

test('证据缺失时写「未提供」，不留空白', () => {
  const report = buildRoundReport({ round: 2, ledgerRow: null, files: 0, health: {}, gates: [] })
  assert.match(report, /未提供/u)
  assert.equal(/\|\s*\|\s*$/mu.test(report), false, '表格里不应出现空单元格行')
})

test('从账本里取某一轮的记录', () => {
  const text = [
    '| 第 1 轮 | #16 | protocol | ok |',
    '| 第 43 轮 | #58 | ledger-cli | 账本命令 |',
  ].join('\n')
  assert.deepEqual(findRoundRow(text, 43), { issue: '#58', note: 'ledger-cli · 账本命令' })
  assert.equal(findRoundRow(text, 99), null)
})
