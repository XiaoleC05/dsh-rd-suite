/**
 * 分支命名约定的验证：解析、生成与并行检查。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { branchNameFor, checkBranchPlan, parseBranchName } from '../lib/branch-name.js'

test('解析：合法名字给出三段', () => {
  assert.deepEqual(parseBranchName('fix/60-commit-msg'), {
    type: 'fix',
    issue: 60,
    slug: 'commit-msg',
  })
  assert.deepEqual(parseBranchName('feat/100-final-review'), {
    type: 'feat',
    issue: 100,
    slug: 'final-review',
  })
})

test('解析：不合约定的返回 null', () => {
  for (const name of [
    'fix-toolbar',
    '62-fix-login',
    'fix/abc-toolbar',
    'unknown/1-x',
    'fix/1-',
    '',
    undefined,
  ]) {
    assert.equal(parseBranchName(name), null, `${String(name)} 不该被当成合法分支名`)
  }
})

test('生成：slug 会规范成小写连字符', () => {
  assert.equal(
    branchNameFor({ type: 'fix', issue: 27, slug: 'Multi Module Plan' }),
    'fix/27-multi-module-plan',
  )
  assert.equal(branchNameFor({ type: 'docs', issue: '7', slug: '--ledger--' }), 'docs/7-ledger')
})

test('生成：参数非法直接抛错，不生成看着对的名字', () => {
  assert.throws(() => branchNameFor({ type: 'banana', issue: 1, slug: 'x' }), /type/u)
  assert.throws(() => branchNameFor({ type: 'fix', issue: 0, slug: 'x' }), /issue/u)
  assert.throws(() => branchNameFor({ type: 'fix', issue: 1, slug: '   ' }), /slug/u)
})

test('并行检查：全部合规时没有问题', () => {
  const plan = checkBranchPlan(['fix/27-branch-naming', 'feat/28-memory-panel'])
  assert.deepEqual(plan.problems, [])
  assert.equal(plan.parsed.length, 2)
})

test('并行检查：非法名、重复名、Issue 复用都要报', () => {
  const plan = checkBranchPlan(['fix/27-a', 'fix/27-a', 'toolbar', 'feat/27-b'])
  assert.ok(plan.problems.some((problem) => problem.includes('不符合')))
  assert.ok(plan.problems.some((problem) => problem.includes('重复')))
  assert.ok(
    plan.problems.some((problem) => problem.includes('Issue #27 被 3 个分支共用')),
    '重复名也算一次复用',
  )
})

test('并行检查：空计划不报错', () => {
  assert.deepEqual(checkBranchPlan([]).problems, [])
  assert.deepEqual(checkBranchPlan(undefined).problems, [])
})
