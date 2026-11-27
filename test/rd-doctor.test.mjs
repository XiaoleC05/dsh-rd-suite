/**
 * 自检入口的验证：编排、失败归类、耗时统计与真实仓库全过。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHECKS, runChecks, runScript } from '../scripts/rd-doctor.mjs'

test('清单覆盖门禁与专项审查，且都有脚本路径', () => {
  assert.ok(CHECKS.length >= 7, `实际 ${CHECKS.length} 项`)
  for (const check of CHECKS) {
    assert.match(check.script, /^scripts\/[\w-]+\.mjs$/u, `${check.name} 的脚本路径不对`)
    assert.ok(check.name !== '')
  }
  const names = CHECKS.map((check) => check.name)
  assert.ok(names.includes('交付门禁'), '必须包含交付门禁')
})

test('编排：按清单顺序执行，逐项计时', () => {
  const calls = []
  const results = runChecks((check) => {
    calls.push(check.name)
    return { ok: true, detail: 'ok' }
  })
  assert.deepEqual(
    calls,
    CHECKS.map((check) => check.name),
  )
  assert.equal(results.length, CHECKS.length)
  for (const item of results) {
    assert.equal(item.ok, true)
    assert.equal(Number.isInteger(item.ms), true)
  }
})

test('编排：抛错被归为失败，不让整批中断', () => {
  const results = runChecks((check) => {
    if (check.name === '宪章重叠') throw new Error('炸了\n第二行')
    return { ok: true, detail: 'ok' }
  })
  const failed = results.filter((item) => !item.ok)
  assert.equal(failed.length, 1)
  assert.equal(failed[0].name, '宪章重叠')
  assert.match(failed[0].detail, /炸了/u, '只留首行，不铺整段堆栈')
})

test('编排：执行器返回 ok:false 也算失败', () => {
  const results = runChecks(() => ({ ok: false, detail: '有缺项' }))
  assert.equal(
    results.every((item) => item.ok === false),
    true,
  )
})

test('真实仓库：七项自检全过', () => {
  const results = runChecks(runScript)
  const failed = results.filter((item) => !item.ok)
  assert.deepEqual(
    failed.map((item) => `${item.name}: ${item.detail}`),
    [],
    '自检应当全过',
  )
})
