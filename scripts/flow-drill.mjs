#!/usr/bin/env node
/**
 * 全流程演练：用有状态的假 git/gh 跑通「建单 → 分支 → PR → 合并 → 关闭」。
 *
 * 单测只验证单个动作；这里验证跨步骤的契约：
 * 建单拿到的编号能不能进分支名、PR 正文有没有自动带关闭关键词、
 * 合并是不是 squash 且删了分支、关闭之后状态是不是真的 closed。
 *
 * 用法：
 *   node scripts/flow-drill.mjs
 *   node scripts/flow-drill.mjs --json
 */

import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

import {
  closeIssue,
  createIssue,
  mergePr,
  openPr,
  prepareBranch,
  precheck,
  prStatus,
} from '../github/lib/service.js'

const FLOW_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/** 假仓库的路径，用它代替真实工作目录。 */
export const FAKE_ROOT = join(FLOW_ROOT, 'fixtures', 'flow-drill', 'src')

const ok = (stdout = '') => ({ exitCode: 0, signal: null, stdout, stderr: '', truncated: false })
const failed = (stderr = '') => ({
  exitCode: 1,
  signal: null,
  stdout: '',
  stderr,
  truncated: false,
})
const json = (value) => ok(`${JSON.stringify(value)}\n`)

/**
 * 造一个有状态的假执行器：issue 编号自增、分支记录、PR 状态可查可改。
 * @returns {{ run: Function; state: object; calls: { command: string }[] }} 执行器与状态
 */
export function createFakeRunner() {
  const state = {
    branch: 'main',
    issues: new Map(),
    nextIssue: 41,
    pull: null,
    releaseTag: null,
  }
  const calls = []

  const run = async (argv) => {
    const command = argv.join(' ')
    calls.push({ command })

    if (/rev-parse --show-toplevel/.test(command)) return ok(`${FAKE_ROOT}\n`)
    if (/remote -v/.test(command))
      return ok('origin\thttps://github.com/acme/widgets.git (fetch)\n')
    if (/branch --show-current/.test(command)) return ok(`${state.branch}\n`)
    if (/status --porcelain/.test(command)) return ok('')
    if (/ log -5 --pretty=/.test(command)) return ok('aaa1111 feat(x): 示例 (#40)\n')
    if (/rev-list --left-right --count/.test(command)) return ok('0\t0\n')
    // 建分支与切分支：'switch -c NAME BASE' 里最后一个词是基点，不是分支名。
    if (/git -C \S+ (?:switch|checkout)\b/.test(command)) {
      const created = /(?:switch|checkout)\s+(?:-c|-b|--create)\s+(\S+)/u.exec(command)
      if (created !== null) state.branch = created[1]
      else {
        const parts = command.split(/\s+/u).filter((part) => !part.startsWith('-'))
        const name = parts[parts.length - 1]
        if (name !== undefined && !name.includes(':')) state.branch = name
      }
      return ok('')
    }
    if (/git -C .* push /.test(command)) return ok('')

    if (/gh auth status/.test(command)) return ok('Logged in to github.com account octocat\n')
    if (/gh repo view/.test(command)) {
      return json({
        nameWithOwner: 'acme/widgets',
        url: 'https://github.com/acme/widgets',
        hasIssuesEnabled: true,
        isArchived: false,
        viewerPermission: 'ADMIN',
        defaultBranchRef: { name: 'main' },
      })
    }
    if (/gh api repos\/.*\/rulesets/.test(command)) return ok('[]\n')
    if (/gh api repos\/.*\/branches\/.*\/protection/.test(command))
      return failed('Branch not protected')

    if (/gh label create/.test(command)) return ok('')
    if (/gh issue create/.test(command)) {
      const number = state.nextIssue
      state.nextIssue += 1
      state.issues.set(number, { number, state: 'OPEN', comments: [] })
      return ok(`https://github.com/acme/widgets/issues/${number}\n`)
    }
    if (/gh issue view/.test(command)) {
      const number = Number(
        command.match(/issues\/(\d+)|\s(\d+)\s/)?.[1] ?? command.match(/\s(\d+)\s/)?.[1],
      )
      const issue = state.issues.get(number)
      if (issue === undefined) return failed('not found')
      return json({
        number: issue.number,
        state: issue.state,
        url: `https://github.com/acme/widgets/issues/${issue.number}`,
      })
    }
    if (/gh issue comment/.test(command)) {
      const number = Number(command.split(/\s+/u).find((part) => /^\d+$/u.test(part)))
      state.issues.get(number)?.comments.push('comment')
      return ok('')
    }
    if (/gh issue close/.test(command)) {
      const number = Number(command.split(/\s+/u).find((part) => /^\d+$/u.test(part)))
      const issue = state.issues.get(number)
      if (issue === undefined) return failed('not found')
      issue.state = 'CLOSED'
      return ok('')
    }

    if (/gh pr create/.test(command)) {
      const title = command.split(' --title ')[1]?.split(' --body ')[0] ?? ''
      const body = command.split(' --body ')[1] ?? ''
      state.pull = {
        number: 77,
        url: 'https://github.com/acme/widgets/pull/77',
        state: 'OPEN',
        isDraft: command.includes('--draft'),
        mergeable: 'MERGEABLE',
        reviewDecision: 'APPROVED',
        statusCheckRollup: [{ name: 'ci/test', conclusion: 'SUCCESS' }],
        baseRefName: 'main',
        headRefName: state.branch,
        title,
        body,
        merged: false,
      }
      return ok('https://github.com/acme/widgets/pull/77\n')
    }
    if (/gh pr list/.test(command)) {
      return json(
        state.pull === null
          ? []
          : [
              {
                number: state.pull.number,
                url: state.pull.url,
                headRefName: state.pull.headRefName,
              },
            ],
      )
    }
    if (/gh pr view/.test(command)) {
      if (state.pull === null) return failed('no pull request')
      if (/autoMergeRequest/.test(command)) return json({ autoMergeRequest: null })
      return json({
        number: state.pull.number,
        url: state.pull.url,
        state: state.pull.merged ? 'MERGED' : state.pull.state,
        isDraft: state.pull.isDraft,
        mergeable: state.pull.mergeable,
        reviewDecision: state.pull.reviewDecision,
        statusCheckRollup: state.pull.statusCheckRollup,
        baseRefName: state.pull.baseRefName,
        headRefName: state.pull.headRefName,
      })
    }
    if (/gh pr merge/.test(command)) {
      if (state.pull === null) return failed('no pull request')
      state.pull.merged = true
      state.pull.state = 'MERGED'
      state.branch = 'main'
      return ok('')
    }
    if (/gh release create/.test(command)) {
      state.releaseTag = command.split(/\s+/u)[2]
      return ok(`https://github.com/acme/widgets/releases/tag/${state.releaseTag}\n`)
    }

    return failed(`unexpected command: ${command}`)
  }

  return { run, state, calls }
}

/**
 * 跑一遍全流程。
 * @returns {Promise<{ steps: { name: string; ok: boolean; detail: string }[]; problem: string | null }>} 结果
 */
export async function runDrill() {
  const { run, state, calls } = createFakeRunner()
  const options = { path: FAKE_ROOT }
  const steps = []
  const record = (name, ok, detail) => steps.push({ name, ok, detail })

  let issueNumber = null
  let branch = null

  const check = await precheck(run, options)
  record(
    'precheck',
    check.ok === true,
    check.ok === true ? `strategy=${check.strategy}` : String(check.message),
  )
  if (check.ok !== true) return { steps, problem: 'precheck failed' }

  const issue = await createIssue(run, {
    ...options,
    module: 'toolbar',
    title: 'fix(toolbar): 窄屏溢出',
    symptom: '窄屏下工具栏溢出容器。',
    repro: '把窗口拖到 320px 宽。',
    acceptance: '320px 宽时不出现横向滚动条。',
    files: ['src/toolbar.js'],
    fixPlan: '改成 flex-wrap。',
  })
  if (issue.ok === true) issueNumber = issue.issueNumber
  record('create_issue', issue.ok === true && typeof issueNumber === 'number', `#${issueNumber}`)
  if (issueNumber === null) return { steps, problem: 'create_issue failed' }

  const prepared = await prepareBranch(run, {
    ...options,
    issue: issueNumber,
    branch: 'fix/toolbar',
  })
  if (prepared.ok === true) branch = prepared.branch
  record('prepare_branch', prepared.ok === true, String(branch))
  if (branch === null) return { steps, problem: 'prepare_branch failed' }

  const opened = await openPr(run, {
    ...options,
    title: 'fix(toolbar): 窄屏溢出',
    body: '窄屏下改成 flex-wrap。',
    issue: issueNumber,
    draft: true,
  })
  const bodyHasKeyword = String(state.pull?.body ?? '').includes(`Closes #${issueNumber}`)
  record(
    'open_pr',
    opened.ok === true && bodyHasKeyword,
    bodyHasKeyword ? '正文已带关闭关键词' : '正文缺少关闭关键词',
  )
  if (opened.ok !== true) return { steps, problem: 'open_pr failed' }

  const status = await prStatus(run, { ...options, pr: '77' })
  record(
    'pr_status',
    status.ok === true,
    `通过 ${status.checksPassed ?? 0} / 失败 ${status.checksFailed ?? 0}`,
  )

  const merged = await mergePr(run, { ...options, pr: '77', method: 'squash' })
  const squashUsed = calls.some(
    (call) => /gh pr merge/.test(call.command) && call.command.includes('--squash'),
  )
  const branchDeleted = calls.some(
    (call) => /gh pr merge/.test(call.command) && call.command.includes('--delete-branch'),
  )
  record(
    'merge_pr',
    merged.ok === true && merged.merged === true && squashUsed && branchDeleted,
    squashUsed && branchDeleted ? 'squash + 删分支' : '合并参数不完整',
  )

  const closed = await closeIssue(run, {
    ...options,
    issue: issueNumber,
    comment: '已合并。',
  })
  const finalState = state.issues.get(issueNumber)?.state
  record('close_issue', closed.ok === true && finalState === 'CLOSED', `状态 ${String(finalState)}`)

  return { steps, problem: steps.every((step) => step.ok) ? null : 'some step failed' }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {Promise<number>} 退出码：0 全过、1 有失败
 */
export async function main(argv) {
  const { steps, problem } = await runDrill()
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ steps, problem }, null, 2)}\n`)
  } else {
    for (const step of steps) {
      process.stdout.write(`${step.ok ? '通过' : '失败'}  ${step.name}：${step.detail}\n`)
    }
    process.stdout.write(
      problem === null ? `全流程演练通过（${steps.length} 步）\n` : `全流程演练未过：${problem}\n`,
    )
  }
  return problem === null ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
