#!/usr/bin/env node
/**
 * 回滚演练：在临时仓库里真的执行一次回滚，证明步骤有效。
 *
 * 约定是「用 revert 不用 reset」，但约定本身不会自动成立。这里造两次提交，
 * 按文档化的步骤回滚，然后断言两件事：工作树回到上一状态、历史没有被抹掉。
 *
 * 用法：
 *   node scripts/rollback-drill.mjs
 *   node scripts/rollback-drill.mjs --json
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * 回滚步骤（文档与演练共用同一份文案，避免两处说法不一致）。
 * @param {string} commit - 要回滚的提交
 * @returns {{ step: string; command: string }[]} 步骤
 */
export function rollbackSteps(commit = '<commit>') {
  return [
    { step: '确认要回滚的提交', command: `git log --oneline -5` },
    { step: '保留历史地反向提交', command: `git revert --no-edit ${commit}` },
    { step: '确认工作树回到预期状态', command: 'node scripts/preflight.mjs' },
    {
      step: '推送（走 API 回退通道时用 push-via-api）',
      command: 'node scripts/push-via-api.mjs --parent <远端完整 sha>',
    },
  ]
}

/** 在指定目录跑 git，返回 stdout。 */
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * 跑一次回滚演练。
 * @returns {{ steps: { name: string; ok: boolean; detail: string }[]; problem: string | null }} 结果
 */
export function runRollbackDrill() {
  const workspace = mkdtempSync(join(tmpdir(), 'rd-rollback-'))
  const steps = []
  const record = (name, ok, detail) => steps.push({ name, ok, detail })

  try {
    git(workspace, ['init', '-q'])
    git(workspace, ['config', 'user.email', 'drill@example.com'])
    git(workspace, ['config', 'user.name', 'drill'])

    writeFileSync(join(workspace, 'a.txt'), '第一版\n', 'utf8')
    git(workspace, ['add', '.'])
    git(workspace, ['commit', '-q', '-m', 'feat(a): 第一版'])
    const goodTree = git(workspace, ['rev-parse', 'HEAD^{tree}'])

    writeFileSync(join(workspace, 'a.txt'), '第二版（有问题）\n', 'utf8')
    writeFileSync(join(workspace, 'b.txt'), '多余文件\n', 'utf8')
    git(workspace, ['add', '.'])
    git(workspace, ['commit', '-q', '-m', 'feat(a): 第二版'])
    const badHead = git(workspace, ['rev-parse', '--short', 'HEAD'])
    record('准备两次提交', true, `可疑提交 ${badHead}`)

    git(workspace, ['revert', '--no-edit', 'HEAD'])
    const revertedTree = git(workspace, ['rev-parse', 'HEAD^{tree}'])
    record(
      'revert 后工作树回到上一状态',
      revertedTree === goodTree,
      `tree ${revertedTree.slice(0, 8)}`,
    )

    const count = Number(git(workspace, ['rev-list', '--count', 'HEAD']))
    record('历史保留（三次提交都在）', count === 3, `${count} 条提交`)

    const content = readFileSync(join(workspace, 'a.txt'), 'utf8').trim()
    record('文件内容确实被还原', content === '第一版', content)

    // revert 会把那次新增的文件一并删掉，不是留一个空文件。
    const stillThere = existsSync(join(workspace, 'b.txt'))
    record('多出来的文件被清掉', !stillThere, stillThere ? '文件仍在' : '已删除')

    const problem = steps.every((step) => step.ok) ? null : '部分断言未过'
    return { steps, problem }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 演练通过、1 未过
 */
export function main(argv) {
  const { steps, problem } = runRollbackDrill()
  if (argv.includes('--json')) {
    process.stdout.write(
      `${JSON.stringify({ steps, problem, commands: rollbackSteps() }, null, 2)}\n`,
    )
    return problem === null ? 0 : 1
  }
  for (const step of steps)
    process.stdout.write(`${step.ok ? '通过' : '失败'}  ${step.name}：${step.detail}\n`)
  process.stdout.write('回滚命令：\n')
  for (const item of rollbackSteps()) process.stdout.write(`  ${item.step}：${item.command}\n`)
  process.stdout.write(problem === null ? '回滚演练通过\n' : `回滚演练未过：${problem}\n`)
  return problem === null ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
