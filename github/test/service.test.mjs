import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { CommandAbortedError, CommandUnavailableError } from '../lib/process.js'
import { RESULT_FIELDS } from '../lib/result-schema.js'
import {
  closeIssue,
  createIssue,
  mergePr,
  openPr,
  prepareBranch,
  precheck,
  prStatus,
  release,
} from '../lib/service.js'

const GITHUB_REMOTE = [
  'origin\thttps://github.com/acme/widgets.git (fetch)',
  'origin\thttps://github.com/acme/widgets.git (push)',
].join('\n')

let workspace
let targetFile

before(() => {
  workspace = mkdtempSync(path.join(tmpdir(), 'ghw-service-'))
  mkdirSync(path.join(workspace, 'src'))
  targetFile = path.join(workspace, 'src', 'login.js')
  writeFileSync(targetFile, 'export {};\n')
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

function ok(stdout = '') {
  return { exitCode: 0, signal: null, stdout, stderr: '', truncated: false }
}

function failed(stderr, exitCode = 1) {
  return { exitCode, signal: null, stdout: '', stderr, truncated: false }
}

/**
 * A fake command runner that dispatches by argv instead of call order.
 * @param {Record<string, Function>} overrides - per-command handlers.
 */
function makeRun(overrides = {}) {
  const calls = []
  const handlers = {
    revParse: () => ok('/work/widgets\n'),
    remoteList: () => ok(GITHUB_REMOTE),
    branch: () => ok('fix/login-retry\n'),
    status: () => ok(''),
    log: () => ok('a1b2c3d fix(toolbar): 修复窄屏溢出 (#12)\n9f8e7d6 feat(memory): 记忆骨架 (#17)\n'),
    authStatus: () => ok('Logged in to github.com account octocat (keyring)\n'),
    repoView: () =>
      ok(
        JSON.stringify({
          nameWithOwner: 'acme/widgets',
          url: 'https://github.com/acme/widgets',
          hasIssuesEnabled: true,
          isArchived: false,
          viewerPermission: 'WRITE',
          defaultBranchRef: { name: 'main' },
        }),
      ),
    rulesets: () => ok('[]\n'),
    branchProtection: () => failed('gh: Branch not protected (HTTP 404)'),
    verifyRef: () => failed(''),
    verifyRemoteRef: () => ok('0123456789abcdef\n'),
    fetch: () => ok(''),
    switchBranch: () => ok(''),
    pushBranch: () => ok(''),
    prList: () => ok('[]\n'),
    prCreate: () => ok('https://github.com/acme/widgets/pull/43\n'),
    prView: () =>
      ok(
        JSON.stringify({
          number: 43,
          url: 'https://github.com/acme/widgets/pull/43',
          state: 'OPEN',
          isDraft: true,
          mergeable: 'MERGEABLE',
          reviewDecision: '',
          statusCheckRollup: [],
          baseRefName: 'main',
          headRefName: 'fix/9-toolbar-overflow',
        }),
      ),
    prMerge: () => ok(''),
    releaseCreate: () => ok('https://github.com/acme/widgets/releases/tag/v1.4.0\n'),
    issueCreate: () => ok('https://github.com/acme/widgets/issues/42\n'),
    issueComment: () => ok(''),
    issueClose: () => ok(''),
    issueView: () =>
      ok(
        JSON.stringify({
          number: 42,
          state: 'OPEN',
          url: 'https://github.com/acme/widgets/issues/42',
        }),
      ),
    ...overrides,
  }
  const run = async (argv, options) => {
    const command = argv.join(' ')
    calls.push({ command, argv: [...argv], options })
    if (/rev-parse --show-toplevel/.test(command)) return handlers.revParse(argv, options)
    if (/rev-parse --verify --quiet refs\/remotes\//.test(command))
      return handlers.verifyRemoteRef(argv, options)
    if (/rev-parse --verify --quiet refs\/heads\//.test(command))
      return handlers.verifyRef(argv, options)
    if (/git -C [^ ]+ fetch /.test(command)) return handlers.fetch(argv, options)
    if (/ remote -v/.test(command)) return handlers.remoteList(argv, options)
    if (/branch --show-current/.test(command)) return handlers.branch(argv, options)
    if (/status --porcelain/.test(command)) return handlers.status(argv, options)
    if (/ log -5 --pretty=/.test(command)) return handlers.log(argv, options)
    if (/gh auth status/.test(command)) return handlers.authStatus(argv, options)
    if (/gh repo view/.test(command)) return handlers.repoView(argv, options)
    if (/gh api repos\/[^ ]+\/rulesets/.test(command)) return handlers.rulesets(argv, options)
    if (/gh api repos\/[^ ]+\/branches\/.+\/protection/.test(command))
      return handlers.branchProtection(argv, options)
    if (/git -C [^ ]+ switch/.test(command)) return handlers.switchBranch(argv, options)
    if (/git -C [^ ]+ push/.test(command)) return handlers.pushBranch(argv, options)
    if (/gh pr list/.test(command)) return handlers.prList(argv, options)
    if (/gh pr create/.test(command)) return handlers.prCreate(argv, options)
    if (/gh pr view/.test(command)) return handlers.prView(argv, options)
    if (/gh pr merge/.test(command)) return handlers.prMerge(argv, options)
    if (/gh release create/.test(command)) return handlers.releaseCreate(argv, options)
    if (/gh issue create/.test(command)) return handlers.issueCreate(argv, options)
    if (/gh issue comment/.test(command)) return handlers.issueComment(argv, options)
    if (/gh issue close/.test(command)) return handlers.issueClose(argv, options)
    if (/gh issue view/.test(command)) return handlers.issueView(argv, options)
    throw new Error(`unexpected command: ${command}`)
  }
  return { run, calls, handlers }
}

const CREATE_INPUT = {
  path: targetFile,
  module: 'auth',
  title: 'Login retries forever',
  symptom: 'The login retry loop never stops after a network failure.',
  files: ['src/login.js'],
  fixPlan: 'Cap retries at three attempts and surface the last failure.',
  labels: ['bug'],
}

test('precheck reports a ready GitHub repository', async () => {
  const { run, calls } = makeRun()
  const result = await precheck(run, { path: targetFile })

  assert.equal(result.ok, true)
  assert.equal(result.action, 'precheck')
  assert.equal(result.workflowRequired, true)
  assert.equal(result.isGitRepository, true)
  assert.equal(result.github, true)
  assert.equal(result.repositoryRoot, '/work/widgets')
  assert.equal(result.slug, 'github.com/acme/widgets')
  assert.equal(result.remoteName, 'origin')
  assert.equal(result.host, 'github.com')
  assert.equal(result.branch, 'fix/login-retry')
  assert.equal(result.workingTreeClean, true)
  assert.equal(result.changedFileCount, 0)
  assert.equal(result.ghAuthenticated, true)
  assert.equal(result.ghAccount, 'octocat')
  assert.equal(result.hasIssuesEnabled, true)
  assert.equal(result.viewerPermission, 'WRITE')
  assert.equal(result.warnings, undefined)

  const auth = calls.find((call) => call.command.startsWith('gh auth status'))
  assert.equal(auth.command, 'gh auth status --hostname github.com')
  assert.equal(auth.options.env.GH_PROMPT_DISABLED, '1')
  assert.equal(auth.options.cwd, '/work/widgets')
})

test('precheck warns about an already dirty working tree', async () => {
  const { run } = makeRun({ status: () => ok(' M src/login.js\n?? notes.txt\n') })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, true)
  assert.equal(result.workingTreeClean, false)
  assert.equal(result.changedFileCount, 2)
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /2 uncommitted change/)
})

test('precheck falls back outside a Git repository', async () => {
  const { run } = makeRun({
    revParse: () =>
      failed('fatal: not a git repository (or any of the parent directories): .git', 128),
  })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, true)
  assert.equal(result.workflowRequired, false)
  assert.equal(result.isGitRepository, false)
  assert.equal(result.github, false)
  assert.match(result.message, /Not a Git repository/)
})

test('precheck falls back when the remote is not GitHub', async () => {
  const { run } = makeRun({
    remoteList: () => ok('origin\thttps://gitlab.com/acme/widgets.git (fetch)\n'),
  })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, true)
  assert.equal(result.workflowRequired, false)
  assert.equal(result.github, false)
  assert.equal(result.isGitRepository, true)
  assert.deepEqual(result.remoteUrls, ['https://gitlab.com/acme/widgets.git'])
  assert.match(result.message, /No Git remote points to GitHub/)
})

test('precheck falls back when the repository has no remote', async () => {
  const { run } = makeRun({ remoteList: () => ok('') })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, true)
  assert.equal(result.workflowRequired, false)
  assert.equal(result.github, false)
  assert.deepEqual(result.remoteUrls, [])
  assert.match(result.message, /no Git remote/)
})

test('precheck blocks with install guidance when gh is unavailable', async () => {
  const { run } = makeRun({
    authStatus: () => {
      throw new CommandUnavailableError('gh', new Error('spawn gh ENOENT'))
    },
  })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'GH_NOT_INSTALLED')
  assert.equal(result.workflowRequired, true)
  assert.equal(result.github, true)
  assert.match(result.guidance, /winget install/)
  assert.match(result.guidance, /gh auth login/)
  assert.match(result.guidance, /do not modify files/i)
})

test('precheck blocks with login guidance when gh is unauthenticated', async () => {
  const { run } = makeRun({
    authStatus: () =>
      failed('You are not logged into any GitHub hosts. Run gh auth login to authenticate.', 1),
  })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'GH_UNAUTHENTICATED')
  assert.equal(result.ghInstalled, true)
  assert.equal(result.ghAuthenticated, false)
  assert.match(result.guidance, /gh auth login --hostname github\.com/)
})

test('precheck blocks on missing repository permission', async () => {
  const { run } = makeRun({
    repoView: () =>
      failed('HTTP 403: Resource not accessible by integration (https://api.github.com)', 1),
  })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'REPO_ACCESS_DENIED')
  assert.equal(result.workflowRequired, true)
  assert.match(result.guidance, /grant/i)
})

test('precheck blocks when issues are disabled', async () => {
  const { run } = makeRun({
    repoView: () =>
      ok(
        JSON.stringify({
          nameWithOwner: 'acme/widgets',
          url: 'https://github.com/acme/widgets',
          hasIssuesEnabled: false,
          isArchived: false,
          viewerPermission: 'WRITE',
        }),
      ),
  })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'ISSUES_DISABLED')
  assert.match(result.guidance, /enable Issues/i)
})

test('precheck blocks on a missing path without running commands', async () => {
  let called = false
  const run = async () => {
    called = true
    throw new Error('must not run')
  }
  const result = await precheck(run, { path: path.join(workspace, 'missing.js') })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'PATH_NOT_FOUND')
  assert.equal(called, false)
})

test('precheck reports a cancelled command', async () => {
  const run = async () => {
    throw new CommandAbortedError('git')
  }
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'CANCELLED')
})

test('create_issue files one structured issue for the module', async () => {
  const { run, calls } = makeRun()
  const result = await createIssue(run, CREATE_INPUT)

  assert.equal(result.ok, true)
  assert.equal(result.action, 'create_issue')
  assert.equal(result.issueNumber, 42)
  assert.equal(result.issueUrl, 'https://github.com/acme/widgets/issues/42')
  assert.equal(result.slug, 'github.com/acme/widgets')

  const create = calls.find((call) => call.command.startsWith('gh issue create'))
  assert.ok(create, 'gh issue create was called')
  assert.equal(create.argv[0], 'gh')
  assert.equal(create.argv[1], 'issue')
  assert.equal(create.argv[2], 'create')
  assert.ok(create.argv.includes('--repo'))
  assert.ok(create.argv.includes('github.com/acme/widgets'))
  assert.ok(create.argv.includes('--title'))
  assert.ok(create.argv.includes('Login retries forever'))
  assert.ok(create.argv.includes('--label'))
  const body = create.argv[create.argv.indexOf('--body') + 1]
  assert.match(body, /## Problem/)
  assert.match(body, /## Module\n\nauth/)
  assert.match(body, /## Affected files\n\n- `src\/login\.js`/)
  assert.match(body, /## Fix plan/)
})

test('create_issue validates module fields before touching Git or gh', async () => {
  let called = false
  const run = async () => {
    called = true
    return ok('')
  }
  const result = await createIssue(run, { path: targetFile, title: 'Only a title' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'INVALID_ARGUMENTS')
  assert.match(result.message, /symptom/)
  assert.equal(called, false)
})

test('create_issue refuses without a GitHub project', async () => {
  const { run } = makeRun({
    remoteList: () => ok('origin\thttps://gitlab.com/acme/widgets.git (fetch)\n'),
  })
  const result = await createIssue(run, CREATE_INPUT)
  assert.equal(result.ok, false)
  assert.equal(result.action, 'create_issue')
  assert.equal(result.code, 'NOT_A_GITHUB_PROJECT')
  assert.match(result.guidance, /normal fix flow/)
})

test('create_issue reports a GitHub refusal without claiming creation', async () => {
  const { run } = makeRun({
    issueCreate: () =>
      failed('HTTP 403: Resource not accessible by integration (https://api.github.com)', 1),
  })
  const result = await createIssue(run, CREATE_INPUT)
  assert.equal(result.ok, false)
  assert.equal(result.action, 'create_issue')
  assert.equal(result.code, 'REPO_ACCESS_DENIED')
  assert.match(result.guidance, /No issue was created/)
})

test('create_issue reports an unconfirmed creation when no URL is printed', async () => {
  const { run } = makeRun({ issueCreate: () => ok('something unexpected\n') })
  const result = await createIssue(run, CREATE_INPUT)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'ISSUE_CREATE_UNCONFIRMED')
  assert.match(result.guidance, /do not assume the issue was created/i)
})

test('close_issue comments, closes, and verifies the closed state', async () => {
  let views = 0
  const { run, calls } = makeRun({
    issueView: () => {
      views += 1
      return ok(
        JSON.stringify({
          number: 42,
          state: views === 1 ? 'OPEN' : 'CLOSED',
          url: 'https://github.com/acme/widgets/issues/42',
        }),
      )
    },
  })
  const result = await closeIssue(run, {
    path: targetFile,
    issue: 42,
    comment: 'Fixed with commit abc1234. `npm test` passes.',
  })

  assert.equal(result.ok, true)
  assert.equal(result.action, 'close_issue')
  assert.equal(result.issueNumber, 42)
  assert.equal(result.issueUrl, 'https://github.com/acme/widgets/issues/42')
  assert.equal(result.closed, true)
  assert.equal(result.alreadyClosed, false)
  assert.equal(result.commented, true)

  const comment = calls.find((call) => call.command.startsWith('gh issue comment'))
  assert.ok(comment)
  assert.ok(comment.argv.includes('42'))
  assert.ok(comment.argv.includes('Fixed with commit abc1234. `npm test` passes.'))

  const close = calls.find((call) => call.command.startsWith('gh issue close'))
  assert.ok(close)
  assert.deepEqual(close.argv.slice(-4), [
    '--repo',
    'github.com/acme/widgets',
    '--reason',
    'completed',
  ])
})

test('close_issue treats an already closed issue as done', async () => {
  const { run, calls } = makeRun({
    issueView: () =>
      ok(
        JSON.stringify({
          number: 42,
          state: 'CLOSED',
          url: 'https://github.com/acme/widgets/issues/42',
        }),
      ),
  })
  const result = await closeIssue(run, {
    path: targetFile,
    issue: 'https://github.com/acme/widgets/issues/42',
  })
  assert.equal(result.ok, true)
  assert.equal(result.closed, true)
  assert.equal(result.alreadyClosed, true)
  assert.equal(
    calls.some((call) => call.command.startsWith('gh issue close')),
    false,
  )
  assert.equal(
    calls.some((call) => call.command.startsWith('gh issue comment')),
    false,
  )
})

test('close_issue validates the issue reference before running commands', async () => {
  let called = false
  const run = async () => {
    called = true
    return ok('')
  }
  const result = await closeIssue(run, { path: targetFile, issue: 'not-a-number' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'INVALID_ARGUMENTS')
  assert.equal(called, false)
})

test('close_issue reports an unconfirmed closure', async () => {
  const { run } = makeRun({
    issueView: () =>
      ok(
        JSON.stringify({
          number: 42,
          state: 'OPEN',
          url: 'https://github.com/acme/widgets/issues/42',
        }),
      ),
  })
  const result = await closeIssue(run, { path: targetFile, issue: 42 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'ISSUE_CLOSE_UNCONFIRMED')
  assert.match(result.guidance, /do not claim closure/i)
})

test('every workflow result field is declared in the shared output schema', async () => {
  let views = 0
  const closedRun = makeRun({
    issueView: () => {
      views += 1
      return ok(
        JSON.stringify({
          number: 42,
          state: views === 1 ? 'OPEN' : 'CLOSED',
          url: 'https://github.com/acme/widgets/issues/42',
        }),
      )
    },
  }).run
  const ghMissingRun = makeRun({
    authStatus: () => {
      throw new CommandUnavailableError('gh', new Error('spawn gh ENOENT'))
    },
  }).run

  const results = [
    await precheck(makeRun().run, { path: targetFile }),
    await precheck(makeRun({ remoteList: () => ok('') }).run, { path: targetFile }),
    await precheck(ghMissingRun, { path: targetFile }),
    await createIssue(makeRun().run, CREATE_INPUT),
    await createIssue(ghMissingRun, CREATE_INPUT),
    await closeIssue(closedRun, { path: targetFile, issue: 42, comment: 'Verified.' }),
    await closeIssue(ghMissingRun, { path: targetFile, issue: 42 }),
  ]
  for (const result of results) {
    for (const key of Object.keys(result)) {
      assert.ok(Object.hasOwn(RESULT_FIELDS, key), `undeclared result field "${key}"`)
    }
  }
})

test('precheck requires pull requests when the default branch is protected', async () => {
  const { run } = makeRun({
    rulesets: () =>
      ok(
        JSON.stringify([
          {
            name: 'main-protection',
            target: 'branch',
            enforcement: 'active',
            conditions: { ref_name: { include: ['~DEFAULT_BRANCH'] } },
          },
        ]),
      ),
  })
  const result = await precheck(run, { path: targetFile })
  assert.equal(result.strategy, 'pr')
  assert.equal(result.protection, 'required')
  assert.equal(result.defaultBranch, 'main')
  assert.deepEqual(result.rulesets, ['main-protection'])
  assert.match(result.guidance, /pull request/)
})

test('prepare_branch creates the module branch from the default branch', async () => {
  const { run, calls } = makeRun()
  const result = await prepareBranch(run, { path: targetFile, branch: 'fix/9-toolbar-overflow' })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.ok(result.branchCreated, JSON.stringify(result))
  assert.equal(result.baseBranch, 'main')
  const created = calls.find((call) => / switch -c fix\/9-toolbar-overflow/.test(call.command))
  assert.ok(created, 'expected git switch -c')
  assert.match(created.command, /origin\/main/)
})

test('prepare_branch rejects an invalid branch name without touching Git', async () => {
  const { run, calls } = makeRun()
  const result = await prepareBranch(run, { path: targetFile, branch: '../evil' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'INVALID_ARGUMENTS')
  assert.equal(calls.length, 0)
})

test('open_pr pushes the branch and opens a draft with the closing keyword', async () => {
  const { run, calls } = makeRun({ branch: () => ok('fix/9-toolbar-overflow\n') })
  const result = await openPr(run, {
    path: targetFile,
    title: 'fix(toolbar): 修复窄屏溢出 (#9)',
    body: '把网格改成 minmax(min(300px,100%),1fr)。',
    issue: 42,
  })
  assert.equal(result.ok, true)
  assert.equal(result.prCreated, true)
  assert.equal(result.prNumber, 43)
  assert.equal(result.pushed, true)
  const push = calls.find((call) =>
    /push --set-upstream origin fix\/9-toolbar-overflow/.test(call.command),
  )
  assert.ok(push, 'expected git push with upstream')
  const create = calls.find((call) => /gh pr create/.test(call.command))
  assert.ok(create.argv.includes('--draft'))
  assert.ok(create.argv.some((argument) => argument.includes('Closes #42')))
})

test('open_pr refuses to open a pull request from the default branch', async () => {
  const { run } = makeRun({ branch: () => ok('main\n') })
  const result = await openPr(run, { path: targetFile, title: 'x', body: '' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'DEFAULT_BRANCH_HEAD')
})

test('pr_status counts checks and blocks the merge path while a check fails', async () => {
  const { run } = makeRun({
    prView: () =>
      ok(
        JSON.stringify({
          number: 43,
          url: 'https://github.com/acme/widgets/pull/43',
          state: 'OPEN',
          isDraft: true,
          mergeable: 'MERGEABLE',
          reviewDecision: 'REVIEW_REQUIRED',
          statusCheckRollup: [
            { conclusion: 'SUCCESS' },
            { state: 'FAILURE' },
            { state: 'PENDING' },
          ],
          baseRefName: 'main',
          headRefName: 'fix/9-toolbar-overflow',
        }),
      ),
  })
  const result = await prStatus(run, { path: targetFile, pr: '43' })
  assert.equal(result.ok, true)
  assert.equal(result.checksPassed, 1)
  assert.equal(result.checksFailed, 1)
  assert.equal(result.checksPending, 1)
  assert.match(result.guidance, /failing checks/)
})

test('merge_pr squash-merges, deletes the branch, and reports the merged state', async () => {
  const { run, calls } = makeRun({
    prView: () =>
      ok(
        JSON.stringify({
          number: 43,
          url: 'https://github.com/acme/widgets/pull/43',
          state: 'MERGED',
        }),
      ),
  })
  const result = await mergePr(run, { path: targetFile, pr: '43' })
  assert.equal(result.ok, true)
  assert.equal(result.merged, true)
  assert.equal(result.mergeMethod, 'squash')
  assert.equal(result.branchDeleted, true)
  const merge = calls.find((call) => /gh pr merge/.test(call.command))
  assert.ok(merge.argv.includes('--squash'))
  assert.ok(merge.argv.includes('--delete-branch'))
})

test('release publishes a semantic version tag with generated notes', async () => {
  const { run, calls } = makeRun()
  const result = await release(run, { path: targetFile, tag: 'v1.4.0' })
  assert.equal(result.ok, true)
  assert.equal(result.tag, 'v1.4.0')
  assert.match(String(result.releaseUrl), /releases\/tag\/v1\.4\.0/)
  const created = calls.find((call) => /gh release create/.test(call.command))
  assert.ok(created.argv.includes('--generate-notes'))
})

test('release rejects a tag that is not semantic versioning', async () => {
  const { run, calls } = makeRun()
  const result = await release(run, { path: targetFile, tag: 'latest' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'INVALID_ARGUMENTS')
  assert.equal(calls.length, 0)
})

test('pr_status 点名失败的检查项，全部通过时不给名单', async () => {
  const failing = makeRun({
    prView: () => ok(JSON.stringify({
      number: 43,
      url: 'https://github.com/acme/widgets/pull/43',
      state: 'OPEN',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [
        { name: 'unit', conclusion: 'SUCCESS' },
        { name: 'lint', conclusion: 'FAILURE' },
        { name: 'e2e', status: 'IN_PROGRESS' },
      ],
      baseRefName: 'main',
      headRefName: 'fix/9-toolbar-overflow',
    })),
  })
  const withFailures = await prStatus(failing.run, { path: targetFile, pr: '43' })
  assert.deepEqual(withFailures.failingChecks, ['lint'])
  assert.deepEqual(withFailures.pendingChecks, ['e2e'])
  assert.equal(withFailures.checksFailed, 1)
  assert.match(withFailures.guidance, /Failing: lint/u)

  const green = makeRun({
    prView: () => ok(JSON.stringify({
      number: 43,
      url: 'https://github.com/acme/widgets/pull/43',
      state: 'OPEN',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [
        { name: 'unit', conclusion: 'SUCCESS' },
        { name: 'lint', conclusion: 'SUCCESS' },
      ],
      baseRefName: 'main',
      headRefName: 'fix/9-toolbar-overflow',
    })),
  })
  const clean = await prStatus(green.run, { path: targetFile, pr: '43' })
  assert.equal(clean.failingChecks, undefined)
  assert.equal(clean.pendingChecks, undefined)
  assert.match(clean.guidance, /Ready to merge/u)
})

test('precheck 带上最近提交与保护细节', async () => {
  const plain = makeRun()
  const checked = await precheck(plain.run, { path: targetFile })
  assert.deepEqual(checked.recentCommits, [
    'a1b2c3d fix(toolbar): 修复窄屏溢出 (#12)',
    '9f8e7d6 feat(memory): 记忆骨架 (#17)',
  ])
  assert.equal(checked.requiredReviews, undefined, '未保护时不给审批数')

  const guardedRun = makeRun({
    branchProtection: () => ok(JSON.stringify({
      required_pull_request_reviews: { required_approving_review_count: 2 },
      required_status_checks: { contexts: ['ci/test', 'ci/lint'] },
    })),
  })
  const guarded = await precheck(guardedRun.run, { path: targetFile })
  assert.equal(guarded.protection, 'required')
  assert.equal(guarded.requiredReviews, 2)
  assert.deepEqual(guarded.requiredChecks, ['ci/test', 'ci/lint'])
  assert.equal(guarded.strategy, 'pr')
})
