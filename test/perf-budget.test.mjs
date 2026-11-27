/**
 * 耗时预算的验证：预算判定、失败标注与真实测量。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluate, measure, TARGETS } from '../scripts/perf-budget.mjs'

test('目标清单：每项都有预算与说明', () => {
  assert.ok(TARGETS.length >= 2)
  for (const target of TARGETS) {
    assert.ok(target.budgetMs > 0, `${target.name} 缺预算`)
    assert.ok(target.note !== '', `${target.name} 缺说明`)
    assert.ok(Array.isArray(target.args) && target.args.length > 0)
  }
})

test('判定：等于预算不算超，超过才算', () => {
  const rows = evaluate([
    { name: '正好', ms: 1000, budgetMs: 1000 },
    { name: '超出', ms: 1001, budgetMs: 1000 },
    { name: '远低', ms: 10, budgetMs: 1000 },
  ])
  assert.deepEqual(
    rows.map((row) => row.over),
    [false, true, false],
  )
})

test('判定：保留原始数值，便于对比', () => {
  const [row] = evaluate([{ name: 'x', ms: 42, budgetMs: 100 }])
  assert.equal(row.ms, 42)
  assert.equal(row.budgetMs, 100)
})

test('实测：返回耗时与成功标记，失败不抛错', () => {
  const ok = measure({ args: ['-e', 'process.exit(0)'] })
  assert.equal(Number.isInteger(ok.ms) && ok.ms >= 0, true)
  assert.equal(ok.ok, true)

  const bad = measure({ args: ['-e', 'process.exit(3)'] })
  assert.equal(bad.ok, false, '失败要标出来而不是抛错')
  assert.equal(bad.ms >= 0, true)
})

test('预算宽松度：设定值至少是实测常见量级的数倍', () => {
  const doctor = TARGETS.find((target) => target.name === '自检入口')
  assert.ok(doctor !== undefined)
  // 自检实测约 0.6 秒；预算给到 15 秒，专门抓「慢一个数量级」而不是卡毫秒
  assert.ok(doctor.budgetMs >= 10_000, `自检预算只有 ${doctor.budgetMs}ms，容易误报`)
})
