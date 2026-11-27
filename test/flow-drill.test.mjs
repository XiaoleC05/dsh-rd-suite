/**
 * 全流程演练的验证：七步走通，且关键契约成立。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createFakeRunner, runDrill } from '../scripts/flow-drill.mjs'

test('七步全过，顺序固定', async () => {
  const { steps, problem } = await runDrill()
  assert.equal(
    problem,
    null,
    steps
      .filter((step) => !step.ok)
      .map((step) => `${step.name}:${step.detail}`)
      .join('；'),
  )
  assert.deepEqual(
    steps.map((step) => step.name),
    [
      'precheck',
      'create_issue',
      'prepare_branch',
      'open_pr',
      'pr_status',
      'merge_pr',
      'close_issue',
    ],
  )
  for (const step of steps) assert.ok(step.detail !== '', `${step.name} 要有可读结论`)
})

test('契约：PR 正文自动带关闭关键词，合并用 squash 并删分支，关闭后状态是 CLOSED', async () => {
  const result = await runDrill()
  assert.equal(result.problem, null)
  const detail = Object.fromEntries(result.steps.map((step) => [step.name, step.detail]))
  assert.match(detail.open_pr, /关闭关键词/u)
  assert.match(detail.merge_pr, /squash/u)
  assert.match(detail.merge_pr, /删分支/u)
  assert.equal(detail.close_issue, '状态 CLOSED')
  assert.match(detail.create_issue, /#\d+/u)
})

test('假执行器：分支切换记得住分支名，未知命令要失败', async () => {
  const { run, state } = createFakeRunner()
  await run(['git', '-C', '/x', 'switch', '-c', 'feat/x', 'main'])
  assert.equal(state.branch, 'feat/x', '基点 main 不能覆盖分支名')
  const unknown = await run(['gh', 'nonsense'])
  assert.equal(unknown.exitCode, 1)
})

test('假执行器：issue 编号自增，创建后可查可关', async () => {
  const { run, state } = createFakeRunner()
  const first = await run(['gh', 'issue', 'create', '--repo', 'acme/widgets'])
  const second = await run(['gh', 'issue', 'create', '--repo', 'acme/widgets'])
  assert.match(first.stdout, /issues\/41/u)
  assert.match(second.stdout, /issues\/42/u)
  await run(['gh', 'issue', 'close', '41', '--repo', 'acme/widgets'])
  assert.equal(state.issues.get(41).state, 'CLOSED')
})
