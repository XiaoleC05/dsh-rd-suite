/**
 * 回滚演练的验证：真实 git 上跑一次，并检查步骤文案与清理。
 */
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { rollbackSteps, runRollbackDrill } from '../scripts/rollback-drill.mjs'

test('演练通过：树回到上一状态、历史保留、新增文件被清掉', () => {
  const { steps, problem } = runRollbackDrill()
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
      '准备两次提交',
      'revert 后工作树回到上一状态',
      '历史保留（三次提交都在）',
      '文件内容确实被还原',
      '多出来的文件被清掉',
    ],
  )
})

test('步骤文案包含关键命令，且强调保留历史', () => {
  const commands = rollbackSteps('abc1234').map((step) => step.command)
  assert.ok(commands.some((command) => command.includes('git revert --no-edit abc1234')))
  assert.ok(commands.some((command) => command.includes('git log --oneline')))
  assert.ok(
    commands.some((command) => command.includes('preflight.mjs')),
    '回滚后要复验',
  )
  assert.equal(
    commands.some((command) => command.includes('reset --hard')),
    false,
    '回滚步骤里不该出现 reset --hard',
  )
})

test('演练结束不残留临时目录', () => {
  const before = readdirSync(tmpdir()).filter((name) => name.startsWith('rd-rollback-')).length
  runRollbackDrill()
  const after = readdirSync(tmpdir()).filter((name) => name.startsWith('rd-rollback-')).length
  assert.equal(after, before, '临时仓库要清理掉')
})
