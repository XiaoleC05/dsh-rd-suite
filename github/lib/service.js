/**
 * Git/GitHub preflight and issue lifecycle used by the model-facing
 * github_workflow tool. Every operation is bounded, returns a structured
 * result, and turns a blocked prerequisite into a code plus actionable
 * guidance instead of silently skipping the workflow.
 *
 * The module accepts a `run(argv, options)` function so it is unit-testable
 * without the Host subprocess service.
 */

import { statSync } from 'node:fs'
import path from 'node:path'

import {
  buildIssueBody,
  GIT_CLEAR_ENV,
  parseIssueNumber,
  parseRemoteList,
  pickGitHubRemote,
} from './github-remote.js'
import {
  CommandAbortedError,
  CommandTimeoutError,
  CommandUnavailableError,
  describeError,
  firstDiagnosticLine,
} from './process.js'

const GIT_TIMEOUT_MS = 20_000
const GH_TIMEOUT_MS = 30_000

const GH_INSTALL_GUIDANCE =
  'Install the GitHub CLI and make it available on the PATH of the DeepSeek Harness Host, then retry. ' +
  'Windows: `winget install --id GitHub.cli`; macOS: `brew install gh`; Linux: see https://github.com/cli/cli#installation. ' +
  'After installing, run `gh auth login` (or set GH_TOKEN with the `repo` scope) and retry. ' +
  'The issue-first workflow cannot run without gh; do not modify files for this fix yet - report this blocker to the user.'

const REPO_ACCESS_GUIDANCE =
  'Verify that the Git remote points to the expected GitHub repository and that the signed-in GitHub account can access it, then retry. ' +
  'Do not modify files for this fix yet - report this blocker to the user.'

const NETWORK_GUIDANCE =
  'Check network or proxy access to GitHub, then retry. Do not modify files for this fix yet - report this blocker to the user.'

/** @param {string} host - GitHub host. @returns {string} authentication guidance. */
function ghAuthGuidance(host) {
  return (
    `Run \`gh auth login --hostname ${host}\` (or set GH_TOKEN with the \`repo\` scope in the Host environment and restart DeepSeek Harness), then retry. ` +
    'Without GitHub authentication the workflow must stop; do not modify files for this fix yet - report this blocker to the user.'
  )
}

/** @returns {Record<string, string | undefined>} environment overrides for a git invocation. */
function gitEnvironment() {
  const env = { GIT_TERMINAL_PROMPT: '0' }
  for (const key of GIT_CLEAR_ENV) env[key] = undefined
  return env
}

/** @returns {Record<string, string>} environment overrides for a gh invocation. */
function ghEnvironment() {
  const env = {
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    GH_PAGER: '',
    NO_COLOR: '1',
    CLICOLOR: '0',
  }
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    const value = process.env[key]
    if (typeof value === 'string' && value !== '') env[key] = value
  }
  return env
}

/**
 * Drop keys whose value is undefined so the tool result stays tight.
 * @param {Record<string, unknown>} value - result draft.
 * @returns {Record<string, unknown>} the same object without undefined keys.
 */
function compact(value) {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key]
  }
  return value
}

/**
 * A checked, user-facing workflow failure.
 * @param {string} action - tool action.
 * @param {string} code - stable machine code.
 * @param {string} message - what failed.
 * @param {Record<string, unknown>} [extra] - repository identity and guidance.
 * @returns {Record<string, unknown>} structured failure result.
 */
function failure(action, code, message, extra = {}) {
  return compact({ ok: false, action, code, message, ...extra })
}

/**
 * Resolve the file or directory a fix targets.
 * @param {unknown} targetPath - model-supplied path.
 * @param {string | undefined} sessionCwd - session working directory.
 * @returns {{ ok: true; directory: string; target: string }
 *   | { ok: false; code: string; message: string; guidance: string; path?: string }} resolution.
 */
function resolveTargetDirectory(targetPath, sessionCwd) {
  const supplied =
    typeof targetPath === 'string' && targetPath.trim() !== '' ? targetPath.trim() : undefined
  const fallback =
    typeof sessionCwd === 'string' && sessionCwd.trim() !== '' ? sessionCwd.trim() : process.cwd()
  const candidate = supplied ?? fallback
  const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(fallback, candidate)
  let stats
  try {
    stats = statSync(absolute)
  } catch {
    return {
      ok: false,
      code: 'PATH_NOT_FOUND',
      path: absolute,
      message: `Path not found: ${absolute}`,
      guidance:
        'Pass the existing file or directory to fix (or its project directory), then retry. Do not start editing files.',
    }
  }
  if (stats.isFile()) return { ok: true, directory: path.dirname(absolute), target: absolute }
  if (stats.isDirectory()) return { ok: true, directory: absolute, target: absolute }
  return {
    ok: false,
    code: 'PATH_NOT_A_FILE_OR_DIRECTORY',
    path: absolute,
    message: `Path is neither a file nor a directory: ${absolute}`,
    guidance: 'Pass the file or directory to fix, then retry. Do not start editing files.',
  }
}

/**
 * Run one git command in the repository.
 * @param {Function} run - command runner.
 * @param {readonly string[]} args - git arguments.
 * @param {string} cwd - working directory.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<{ exitCode: number | null; signal: string | null; stdout: string; stderr: string; truncated: boolean }>} bounded output.
 */
function runGit(run, args, cwd, signal) {
  return run(['git', ...args], { cwd, signal, timeoutMs: GIT_TIMEOUT_MS, env: gitEnvironment() })
}

/**
 * Run one gh command assigned to a repository.
 * @param {Function} run - command runner.
 * @param {readonly string[]} args - gh arguments.
 * @param {string} cwd - working directory.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<{ exitCode: number | null; signal: string | null; stdout: string; stderr: string; truncated: boolean }>} bounded output.
 */
function runGh(run, args, cwd, signal) {
  return run(['gh', ...args], { cwd, signal, timeoutMs: GH_TIMEOUT_MS, env: ghEnvironment() })
}

/**
 * The signed-in account named by `gh auth status`, when the output names one.
 * @param {string} stdout - command stdout.
 * @param {string} stderr - command stderr.
 * @returns {string | undefined} account login.
 */
function accountFromAuthStatus(stdout, stderr) {
  const text = `${stdout}\n${stderr}`
  const match =
    /Logged in to [^\s]+ account ([A-Za-z0-9-]+)/iu.exec(text) ??
    /account\s+([A-Za-z0-9-]+)/iu.exec(text)
  return match?.[1]
}

/**
 * Translate a gh diagnostic into a stable code and actionable guidance.
 * @param {string} output - stderr, falling back to stdout.
 * @param {string} host - GitHub host for authentication guidance.
 * @returns {{ code: string; diagnostic: string; guidance: string }} classification.
 */
function classifyGitHubDiagnostic(output, host) {
  const text = String(output ?? '')
  const diagnostic = firstDiagnosticLine(text) || 'no diagnostic output'
  if (
    /gh auth login|not logged in|authentication (?:required|failed)|bad credentials|HTTP 401|token is invalid|requires authentication/iu.test(
      text,
    )
  ) {
    return { code: 'GH_UNAUTHENTICATED', diagnostic, guidance: ghAuthGuidance(host) }
  }
  if (/issues are disabled|has issues disabled/iu.test(text)) {
    return {
      code: 'ISSUES_DISABLED',
      diagnostic,
      guidance:
        'Ask the user to enable Issues in the GitHub repository settings, then retry. Do not start editing files.',
    }
  }
  if (
    /HTTP 403|Resource not accessible|permission denied|forbidden|insufficient scopes|write access/iu.test(
      text,
    )
  ) {
    return {
      code: 'REPO_ACCESS_DENIED',
      diagnostic,
      guidance: `${REPO_ACCESS_GUIDANCE} Ask the repository owner to grant the signed-in account access or approve the required scopes.`,
    }
  }
  if (/Could not resolve to a Repository|HTTP 404|not found/iu.test(text)) {
    return {
      code: 'REPOSITORY_UNAVAILABLE',
      diagnostic,
      guidance:
        'The remote repository was not found for the signed-in account. Verify the Git remote and repository access, then retry. Do not start editing files.',
    }
  }
  if (/rate limit/iu.test(text)) {
    return {
      code: 'RATE_LIMITED',
      diagnostic,
      guidance:
        'The GitHub API rate limit was reached. Wait for it to reset (or authenticate with a token that has a higher limit), then retry. Do not start editing files.',
    }
  }
  if (/could not connect|network|timed out|timeout|TLS|proxy/iu.test(text)) {
    return { code: 'NETWORK_ERROR', diagnostic, guidance: NETWORK_GUIDANCE }
  }
  return {
    code: 'GH_COMMAND_FAILED',
    diagnostic,
    guidance:
      'Report this GitHub CLI failure to the user and retry after it is fixed. Do not start editing files.',
  }
}

/**
 * Convert an unexpected execution failure into a structured workflow result.
 * @param {string} action - tool action.
 * @param {unknown} error - thrown failure.
 * @returns {Record<string, unknown>} structured failure result.
 */
function executionFailure(action, error) {
  if (error instanceof CommandAbortedError) {
    return failure(action, 'CANCELLED', 'The github_workflow call was cancelled.', {
      guidance:
        'Retry when ready; do not start editing files until the workflow preflight finishes.',
    })
  }
  if (error instanceof CommandTimeoutError) {
    return failure(action, 'COMMAND_TIMEOUT', error.message, {
      guidance:
        'Retry the call; if it keeps timing out, check the Git installation and network/proxy access to GitHub. Do not start editing files.',
    })
  }
  if (error instanceof CommandUnavailableError) {
    if (error.command === 'gh') {
      return failure(
        action,
        'GH_NOT_INSTALLED',
        'The GitHub CLI (gh) was not found on the Host PATH.',
        {
          guidance: GH_INSTALL_GUIDANCE,
        },
      )
    }
    return failure(action, 'GIT_NOT_INSTALLED', 'Git was not found on the Host PATH.', {
      guidance:
        'Install Git and make it available on the PATH of the DeepSeek Harness Host, then retry. Do not start editing files.',
    })
  }
  return failure(
    action,
    'INTERNAL_ERROR',
    `The workflow preflight failed: ${describeError(error)}`,
    {
      guidance: 'Report this failure to the user; do not start editing files until it is resolved.',
    },
  )
}

/**
 * Repository identity fields copied into create/close results.
 * @param {Record<string, unknown>} check - successful precheck result.
 * @returns {Record<string, unknown>} identity subset.
 */
function repositoryIdentity(check) {
  return compact({
    path: check.path,
    repositoryRoot: check.repositoryRoot,
    remoteName: check.remoteName,
    remoteUrl: check.remoteUrl,
    host: check.host,
    slug: check.slug,
    workflowRequired: true,
    github: true,
  })
}

/**
 * Normalize optional issue labels.
 * @param {unknown} labels - model input.
 * @returns {string[]} unique non-empty labels.
 */
function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return []
  const seen = new Set()
  const normalized = []
  for (const label of labels) {
    if (typeof label !== 'string') continue
    const value = label.trim()
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}

/**
 * Validate the fields create_issue needs beyond the parameter types.
 * @param {{ title?: unknown; symptom?: unknown; files?: unknown; fixPlan?: unknown }} options - create input.
 * @returns {string | null} violation text, or null when valid.
 */
function validateCreateInput(options) {
  if (typeof options.title !== 'string' || options.title.trim() === '') {
    return '`title` is required: a clear GitHub issue title.'
  }
  if (typeof options.symptom !== 'string' || options.symptom.trim() === '') {
    return '`symptom` is required: what the problem is and how it shows.'
  }
  const files = Array.isArray(options.files)
    ? options.files.filter((file) => typeof file === 'string' && file.trim() !== '')
    : []
  if (files.length === 0) return '`files` is required: at least one affected file path.'
  if (typeof options.fixPlan !== 'string' || options.fixPlan.trim() === '') {
    return '`fix_plan` is required: the expected fix.'
  }
  return null
}

/**
 * Find the created issue URL in `gh issue create` output.
 * @param {string} stdout - command stdout.
 * @returns {string | null} issue URL.
 */
function extractIssueUrl(stdout) {
  const match = /(https?:\/\/[^\s]+\/issues\/\d+)/u.exec(String(stdout ?? ''))
  return match === null ? null : match[1]
}

/**
 * A closing keyword recognized by GitHub for linking a pull request to an
 * issue: close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved,
 * followed by `#N` or `OWNER/REPO#N`. See
 * https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue
 */
const CLOSING_KEYWORD =
  /(?:^|\s)(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:#\d+|[\w.-]+\/[\w.-]+#\d+)/iu

/**
 * Ensure the body carries a closing keyword for the module's issue.
 * @param {string} body - model-supplied pull request body.
 * @param {unknown} issue - issue number or URL, when the module has one.
 * @returns {string} body guaranteed to close the issue on merge.
 */
function ensureClosingKeyword(body, issue) {
  const number = parseIssueNumber(issue)
  const text = typeof body === 'string' ? body.trim() : ''
  if (number === null) return text
  if (CLOSING_KEYWORD.test(text)) return text
  return text === '' ? `Closes #${number}` : `${text}\n\nCloses #${number}`
}

/**
 * Find the pull request number in a pull request URL.
 * @param {string | null} url - pull request URL.
 * @returns {number | null} pull request number.
 */
function pullNumberFromUrl(url) {
  if (typeof url !== 'string') return null
  const match = /\/pull\/(\d+)(?:[?#][^\s]*)?$/u.exec(url.trim())
  if (match === null) return null
  const parsed = Number(match[1])
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Find the pull request URL in `gh pr create` or `gh pr view` output.
 * @param {string} stdout - command stdout.
 * @returns {string | null} pull request URL.
 */
function extractPullUrl(stdout) {
  const match = /(https?:\/\/[^\s]+\/pull\/\d+)/u.exec(String(stdout ?? ''))
  return match === null ? null : match[1]
}

/**
 * Find the release URL in `gh release create` output.
 * @param {string} stdout - command stdout.
 * @returns {string | null} release URL.
 */
function extractReleaseUrl(stdout) {
  const match = /(https?:\/\/[^\s]+\/releases\/tag\/[^\s]+)/u.exec(String(stdout ?? ''))
  return match === null ? null : match[1]
}

/**
 * The `OWNER/REPO` form that `gh api` paths need. Precheck reports the
 * host-qualified slug (`github.com/OWNER/REPO`), which `gh api` does not accept.
 * @param {unknown} slug - repository slug from precheck.
 * @returns {string} `OWNER/REPO`.
 */
function apiSlug(slug) {
  const value = String(slug ?? '')
  const parts = value.split('/').filter((part) => part !== '')
  return parts.length >= 3 ? parts.slice(-2).join('/') : value
}

/**
 * Names of rulesets whose branch rules apply to the default branch, best effort.
 * A failed call is not a blocker: it only downgrades the protection decision to
 * `unknown`, which keeps the direct-commit path available.
 * @param {Function} run - command runner.
 * @param {string} slug - owner/repo.
 * @param {string} branch - default branch name.
 * @param {string} cwd - repository root.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<{ known: boolean; names: string[]; protectedBranch: boolean }>} ruleset states.
 */
async function readRulesets(run, slug, branch, cwd, signal) {
  try {
    const result = await runGh(run, ['api', `repos/${apiSlug(slug)}/rulesets`], cwd, signal)
    if (result.exitCode !== 0) return { known: false, names: [], protectedBranch: false }
    const parsed = JSON.parse(result.stdout)
    if (!Array.isArray(parsed)) return { known: false, names: [], protectedBranch: false }
    const names = []
    let protectedBranch = false
    for (const entry of parsed) {
      if (entry === null || typeof entry !== 'object') continue
      if (entry.enforcement !== 'active') continue
      if (entry.target !== undefined && entry.target !== 'branch') continue
      names.push(String(entry.name ?? entry.id ?? 'ruleset'))
      if (rulesetCoversBranch(entry, branch)) protectedBranch = true
    }
    return { known: true, names, protectedBranch }
  } catch {
    return { known: false, names: [], protectedBranch: false }
  }
}

/**
 * Whether a ruleset's ref-name conditions match one branch.
 * @param {Record<string, unknown>} entry - ruleset payload.
 * @param {string} branch - branch name without the refs/heads/ prefix.
 * @returns {boolean} true when the ruleset applies.
 */
function rulesetCoversBranch(entry, branch) {
  const include = entry?.conditions?.ref_name?.include
  if (!Array.isArray(include) || include.length === 0) return true
  const ref = `refs/heads/${branch}`
  return include.some((pattern) => {
    if (typeof pattern !== 'string' || pattern === '') return false
    if (pattern === '~ALL' || pattern === '~DEFAULT_BRANCH' || pattern === ref) return true
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*')
    try {
      return new RegExp(`^${escaped}$`, 'u').test(ref)
    } catch {
      return false
    }
  })
}

/**
 * Decide whether the module must travel through a pull request.
 * @param {Function} run - command runner.
 * @param {string} slug - owner/repo.
 * @param {string} branch - default branch name.
 * @param {string} cwd - repository root.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<{ protection: 'required' | 'none' | 'unknown'; rulesets: string[] }>} protection state.
 */
async function resolveProtection(run, slug, branch, cwd, signal) {
  const rulesets = await readRulesets(run, slug, branch, cwd, signal)
  if (rulesets.protectedBranch) return { protection: 'required', rulesets: rulesets.names }
  try {
    const classic = await runGh(
      run,
      ['api', `repos/${apiSlug(slug)}/branches/${encodeURIComponent(branch)}/protection`],
      cwd,
      signal,
    )
    if (classic.exitCode === 0) {
      let requiredReviews
      let requiredChecks
      try {
        const info = JSON.parse(classic.stdout)
        const reviews = info?.required_pull_request_reviews?.required_approving_review_count
        if (typeof reviews === 'number' && reviews >= 0) requiredReviews = reviews
        const contexts = info?.required_status_checks?.contexts
        if (Array.isArray(contexts) && contexts.length > 0)
          requiredChecks = contexts.slice(0, 10).map(String)
      } catch {
        // 老版本 gh 只回 "Branch protected"，没有结构化字段：保持 undefined。
      }
      return { protection: 'required', rulesets: rulesets.names, requiredReviews, requiredChecks }
    }
    const diagnostic = `${classic.stderr}\n${classic.stdout}`
    if (rulesets.known && /Branch not protected|Not Found|404/iu.test(diagnostic)) {
      return { protection: 'none', rulesets: rulesets.names }
    }
  } catch {
    // Fall through to the unknown state below.
  }
  return { protection: rulesets.known ? 'none' : 'unknown', rulesets: rulesets.names }
}

/**
 * Run the shared preflight and turn a non-GitHub target into a checked failure.
 * @param {Function} run - command runner.
 * @param {object} options - target options.
 * @param {string} action - current tool action.
 * @returns {Promise<{ blocked?: Record<string, unknown>; check?: Record<string, unknown> }>} gate result.
 */
async function ready(run, options, action) {
  const check = await precheck(run, options)
  if (check.ok === false) return { blocked: { ...check, action } }
  if (check.workflowRequired !== true) {
    return {
      blocked: failure(
        action,
        'NOT_A_GITHUB_PROJECT',
        `${String(check.message ?? 'No GitHub remote.')} The GitHub workflow only runs in projects with a GitHub remote.`,
        {
          guidance: String(
            check.guidance ?? 'Use the normal project flow; github_workflow does not apply here.',
          ),
        },
      ),
    }
  }
  return { check }
}

/**
 * Validate a branch name before it reaches Git.
 * @param {unknown} value - model-supplied branch.
 * @returns {string | null} violation text, or null when usable.
 */
function validateBranchName(value) {
  if (typeof value !== 'string' || value.trim() === '') return '`branch` is required.'
  const branch = value.trim()
  if (branch.length > 120) return '`branch` is longer than 120 characters.'
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(branch)) {
    return '`branch` may only contain letters, digits, dot, underscore, slash and hyphen, and must start with a letter or digit.'
  }
  if (
    branch.includes('..') ||
    branch.includes('//') ||
    branch.endsWith('/') ||
    branch.endsWith('.')
  ) {
    return '`branch` is not a valid Git ref.'
  }
  return null
}

/**
 * Switch branches, falling back to `git checkout` on Git versions without `switch`.
 * @param {Function} run - command runner.
 * @param {string} root - repository root.
 * @param {string[]} switchArgs - arguments after `switch`.
 * @param {string[]} checkoutArgs - equivalent arguments after `checkout`.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<{ exitCode: number | null; stdout: string; stderr: string }>} the command outcome.
 */
async function switchBranch(run, root, switchArgs, checkoutArgs, signal) {
  const first = await runGit(run, ['-C', root, 'switch', ...switchArgs], root, signal)
  if (first.exitCode === 0) return first
  if (
    !/unknown subcommand|unknown command|not a git command/iu.test(
      `${first.stderr}\n${first.stdout}`,
    )
  )
    return first
  return runGit(run, ['-C', root, 'checkout', ...checkoutArgs], root, signal)
}

/**
 * Push one branch and set its upstream.
 * @param {Function} run - command runner.
 * @param {string} root - repository root.
 * @param {string} branch - branch to publish.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<{ pushed: boolean; diagnostic?: string }>} push outcome.
 */
async function pushBranch(run, root, branch, signal) {
  const result = await runGit(
    run,
    ['-C', root, 'push', '--set-upstream', 'origin', branch],
    root,
    signal,
  )
  if (result.exitCode === 0) return { pushed: true }
  return {
    pushed: false,
    diagnostic:
      firstDiagnosticLine(result.stderr) ||
      firstDiagnosticLine(result.stdout) ||
      `git push exited ${String(result.exitCode)}`,
  }
}

/**
 * Inspect the Git/GitHub preconditions for the issue-first workflow.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal }} [options] - target and cancellation.
 * @returns {Promise<Record<string, unknown>>} structured preflight result.
 */
export async function precheck(run, options = {}) {
  const action = 'precheck'
  try {
    const target = resolveTargetDirectory(options.path, options.sessionCwd)
    if (target.ok === false)
      return failure(action, target.code, target.message, {
        guidance: target.guidance,
        path: target.path,
      })

    const revParse = await runGit(
      run,
      ['-C', target.directory, 'rev-parse', '--show-toplevel'],
      target.directory,
      options.signal,
    )
    if (revParse.exitCode !== 0) {
      const diagnostic =
        firstDiagnosticLine(revParse.stderr) ||
        firstDiagnosticLine(revParse.stdout) ||
        'git rev-parse failed'
      if (/not a git repository/iu.test(diagnostic)) {
        return compact({
          ok: true,
          action,
          workflowRequired: false,
          isGitRepository: false,
          github: false,
          path: target.target,
          message: `Not a Git repository: ${target.directory}`,
          guidance:
            'This project has no Git repository. Use the normal fix flow; do not create a GitHub issue.',
        })
      }
      return failure(
        action,
        'GIT_COMMAND_FAILED',
        `git rev-parse --show-toplevel failed (exit ${String(revParse.exitCode)}): ${diagnostic}`,
        {
          path: target.target,
          guidance:
            'Check the repository and the Git installation, then retry. Do not start editing files.',
        },
      )
    }
    const repositoryRoot = revParse.stdout.trim()
    if (repositoryRoot === '') {
      return failure(
        action,
        'GIT_COMMAND_FAILED',
        'git rev-parse --show-toplevel returned an empty repository root.',
        {
          path: target.target,
          guidance: 'Check the repository state, then retry. Do not start editing files.',
        },
      )
    }

    const remotesOutput = await runGit(
      run,
      ['-C', repositoryRoot, 'remote', '-v'],
      repositoryRoot,
      options.signal,
    )
    if (remotesOutput.exitCode !== 0) {
      const diagnostic = firstDiagnosticLine(remotesOutput.stderr) || 'git remote -v failed'
      return failure(action, 'GIT_COMMAND_FAILED', `git remote -v failed: ${diagnostic}`, {
        path: target.target,
        repositoryRoot,
        guidance:
          'Check the repository remotes and the Git installation, then retry. Do not start editing files.',
      })
    }
    const remotes = parseRemoteList(remotesOutput.stdout)
    const remote = pickGitHubRemote(remotes)
    if (remote === null) {
      return compact({
        ok: true,
        action,
        workflowRequired: false,
        isGitRepository: true,
        github: false,
        path: target.target,
        repositoryRoot,
        remoteUrls: remotes.map((entry) => entry.url),
        message:
          remotes.length === 0
            ? 'The repository has no Git remote.'
            : 'No Git remote points to GitHub.',
        guidance:
          'Use the normal fix flow; the issue-first workflow applies only to projects with a GitHub remote.',
      })
    }

    const [branchResult, statusResult, logResult] = await Promise.all([
      runGit(
        run,
        ['-C', repositoryRoot, 'branch', '--show-current'],
        repositoryRoot,
        options.signal,
      ),
      runGit(
        run,
        ['-C', repositoryRoot, 'status', '--porcelain=v1'],
        repositoryRoot,
        options.signal,
      ),
      runGit(
        run,
        ['-C', repositoryRoot, 'log', '-5', '--pretty=%h %s'],
        repositoryRoot,
        options.signal,
      ),
    ])
    // 最近提交：让模型先看到提交风格与是否已有同类改动，少跑两三次命令。
    const recentCommits =
      logResult.exitCode === 0
        ? logResult.stdout
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter((line) => line !== '')
            .slice(0, 5)
        : []
    const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : ''
    const changedFileCount =
      statusResult.exitCode === 0
        ? statusResult.stdout.split(/\r?\n/u).filter((line) => line.trim() !== '').length
        : 0
    const warnings = []
    if (statusResult.exitCode !== 0) {
      warnings.push(
        `git status failed: ${firstDiagnosticLine(statusResult.stderr) || 'unknown error'}; uncommitted-change detection is unavailable.`,
      )
    } else if (changedFileCount > 0) {
      warnings.push(
        `The working tree already has ${changedFileCount} uncommitted change(s). Commit or stash them before starting a module so unrelated changes never share the issue's atomic commit.`,
      )
    }

    const identity = compact({
      path: target.target,
      repositoryRoot,
      remoteName: remote.remoteName,
      remoteUrl: remote.url,
      host: remote.host,
      slug: remote.slug,
      workflowRequired: true,
      github: true,
    })

    let auth
    try {
      auth = await runGh(
        run,
        ['auth', 'status', '--hostname', remote.host],
        repositoryRoot,
        options.signal,
      )
    } catch (error) {
      if (error instanceof CommandUnavailableError) {
        return failure(
          action,
          'GH_NOT_INSTALLED',
          'The GitHub CLI (gh) was not found on the Host PATH.',
          {
            ...identity,
            ghInstalled: false,
            guidance: GH_INSTALL_GUIDANCE,
          },
        )
      }
      throw error
    }
    if (auth.exitCode !== 0) {
      const diagnostic =
        firstDiagnosticLine(auth.stderr) ||
        firstDiagnosticLine(auth.stdout) ||
        'gh auth status failed'
      return failure(
        action,
        'GH_UNAUTHENTICATED',
        `GitHub CLI is not authenticated for ${remote.host}: ${diagnostic}`,
        {
          ...identity,
          ghInstalled: true,
          ghAuthenticated: false,
          guidance: ghAuthGuidance(remote.host),
        },
      )
    }
    const account = accountFromAuthStatus(auth.stdout, auth.stderr)

    let repoView
    try {
      repoView = await runGh(
        run,
        [
          'repo',
          'view',
          remote.slug,
          '--json',
          'nameWithOwner,url,hasIssuesEnabled,isArchived,viewerPermission,defaultBranchRef',
        ],
        repositoryRoot,
        options.signal,
      )
    } catch (error) {
      if (error instanceof CommandUnavailableError) {
        return failure(
          action,
          'GH_NOT_INSTALLED',
          'The GitHub CLI (gh) was not found on the Host PATH.',
          {
            ...identity,
            ghInstalled: false,
            guidance: GH_INSTALL_GUIDANCE,
          },
        )
      }
      throw error
    }
    if (repoView.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(repoView.stderr || repoView.stdout, remote.host)
      return failure(
        action,
        classified.code,
        `gh repo view ${remote.slug} failed: ${classified.diagnostic}`,
        {
          ...identity,
          ghInstalled: true,
          ghAuthenticated: true,
          ...(account === undefined ? {} : { ghAccount: account }),
          guidance: classified.guidance,
        },
      )
    }
    let info = null
    try {
      info = JSON.parse(repoView.stdout)
    } catch {
      info = null
    }
    if (info === null || typeof info !== 'object' || Array.isArray(info)) {
      return failure(
        action,
        'REPOSITORY_UNAVAILABLE',
        `gh repo view ${remote.slug} returned an unreadable response.`,
        {
          ...identity,
          ghInstalled: true,
          ghAuthenticated: true,
          ...(account === undefined ? {} : { ghAccount: account }),
          guidance: 'Verify repository access and retry. Do not start editing files.',
        },
      )
    }
    if (info.isArchived === true) {
      return failure(action, 'REPOSITORY_ARCHIVED', `Repository ${remote.slug} is archived.`, {
        ...identity,
        ghInstalled: true,
        ghAuthenticated: true,
        ...(account === undefined ? {} : { ghAccount: account }),
        guidance:
          'Archived repositories do not accept issue work. Ask the user to unarchive the repository or choose another target, then retry. Do not start editing files.',
      })
    }
    if (info.hasIssuesEnabled === false) {
      return failure(action, 'ISSUES_DISABLED', `Issues are disabled for ${remote.slug}.`, {
        ...identity,
        ghInstalled: true,
        ghAuthenticated: true,
        ...(account === undefined ? {} : { ghAccount: account }),
        guidance:
          'Ask the user to enable Issues in the repository settings, then retry. Do not start editing files.',
      })
    }

    const defaultBranch =
      typeof info.defaultBranchRef?.name === 'string' && info.defaultBranchRef.name !== ''
        ? info.defaultBranchRef.name
        : undefined
    const guarded =
      defaultBranch === undefined
        ? { protection: 'unknown', rulesets: [] }
        : await resolveProtection(run, remote.slug, defaultBranch, repositoryRoot, options.signal)
    if (guarded.protection === 'unknown') {
      // An unreadable protection state is not an error: the guidance below still
      // steers shared repositories through a branch and a pull request.
      warnings.push(
        'Could not read the default branch protection rules. In a shared repository, run prepare_branch and open_pr instead of committing on the default branch.',
      )
    }
    const strategy = guarded.protection === 'required' ? 'pr' : 'direct'

    return compact({
      ok: true,
      action,
      ...identity,
      isGitRepository: true,
      github: true,
      ...(branch === '' ? {} : { branch }),
      ...(defaultBranch === undefined ? {} : { defaultBranch }),
      strategy,
      protection: guarded.protection,
      ...(guarded.rulesets.length === 0 ? {} : { rulesets: guarded.rulesets }),
      ...(guarded.requiredReviews === undefined
        ? {}
        : { requiredReviews: guarded.requiredReviews }),
      ...(guarded.requiredChecks === undefined ? {} : { requiredChecks: guarded.requiredChecks }),
      ...(recentCommits.length === 0 ? {} : { recentCommits }),
      workingTreeClean: statusResult.exitCode === 0 ? changedFileCount === 0 : false,
      changedFileCount,
      ghInstalled: true,
      ghAuthenticated: true,
      ...(account === undefined ? {} : { ghAccount: account }),
      hasIssuesEnabled: info.hasIssuesEnabled !== false,
      ...(typeof info.viewerPermission === 'string'
        ? { viewerPermission: info.viewerPermission }
        : {}),
      ...(warnings.length === 0 ? {} : { warnings }),
      message: `GitHub repository ${remote.slug} is ready; strategy: ${strategy}.`,
      guidance:
        strategy === 'pr'
          ? `The default branch ${String(defaultBranch)} is protected, so every module travels through a pull request: create_issue, prepare_branch (\`<type>/<issue>-<slug>\`), implement, commit, open_pr, merge_pr.`
          : 'Split the work into modules and create one GitHub issue per module before editing, then make one atomic commit per module. For a shared repository, prefer prepare_branch and open_pr over committing on the default branch.',
    })
  } catch (error) {
    return executionFailure(action, error)
  }
}

/**
 * Create one structured GitHub issue for one module.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; module?: string; title?: string; symptom?: string; files?: string[]; fixPlan?: string; labels?: string[] }} options - issue content and target.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function createIssue(run, options = {}) {
  const action = 'create_issue'
  const invalid = validateCreateInput(options)
  if (invalid !== null)
    return failure(action, 'INVALID_ARGUMENTS', invalid, {
      guidance: 'Call create_issue again with the missing fields; do not start editing files.',
    })

  const check = await precheck(run, options)
  if (check.ok === false) return { ...check, action }
  if (check.workflowRequired !== true) {
    return failure(
      action,
      'NOT_A_GITHUB_PROJECT',
      `${String(check.message ?? 'No GitHub remote.')} No GitHub issue can be filed for this target.`,
      {
        guidance: String(
          check.guidance ??
            'Use the normal fix flow; github_workflow only files issues in GitHub-remote projects.',
        ),
      },
    )
  }

  try {
    const body = buildIssueBody({
      module: options.module,
      symptom: options.symptom,
      files: options.files,
      fixPlan: options.fixPlan,
    })
    const argv = [
      'issue',
      'create',
      '--repo',
      check.slug,
      '--title',
      options.title.trim(),
      '--body',
      body,
    ]
    for (const label of normalizeLabels(options.labels)) argv.push('--label', label)
    const result = await runGh(run, argv, check.repositoryRoot, options.signal)
    if (result.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(result.stderr || result.stdout, check.host)
      return failure(
        action,
        classified.code,
        `gh issue create failed for ${check.slug}: ${classified.diagnostic}`,
        {
          ...repositoryIdentity(check),
          guidance: `${classified.guidance} No issue was created; do not start editing.`,
        },
      )
    }
    const issueUrl = extractIssueUrl(result.stdout)
    if (issueUrl === null) {
      return failure(
        action,
        'ISSUE_CREATE_UNCONFIRMED',
        `gh issue create exited successfully but printed no issue URL. Check \`gh issue list --repo ${check.slug}\` before editing.`,
        {
          ...repositoryIdentity(check),
          guidance:
            'Verify on GitHub whether the issue exists and report the actual state; do not assume the issue was created.',
        },
      )
    }
    const issueNumber = parseIssueNumber(issueUrl)
    return compact({
      ok: true,
      action,
      ...repositoryIdentity(check),
      ...(issueNumber === null ? {} : { issueNumber }),
      issueUrl,
      message: `Created GitHub issue ${issueUrl}.`,
      guidance: `Fix only this module, then commit with a Conventional Commit containing \`Closes #${String(issueNumber ?? '<number>')}\` and close the issue with close_issue after verification.`,
    })
  } catch (error) {
    return executionFailure(action, error)
  }
}

/**
 * Comment on and close the issue that owns a finished module.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; issue?: unknown; comment?: string; reason?: string }} options - issue identity and closure copy.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function closeIssue(run, options = {}) {
  const action = 'close_issue'
  const issueNumber = parseIssueNumber(options.issue)
  if (issueNumber === null) {
    return failure(
      action,
      'INVALID_ARGUMENTS',
      '`issue` must be a positive issue number or its full GitHub issue URL.',
      {
        guidance:
          'Call close_issue again with the number returned by create_issue; do not start editing files.',
      },
    )
  }
  const reason = options.reason ?? 'completed'
  if (reason !== 'completed' && reason !== 'not_planned') {
    return failure(action, 'INVALID_ARGUMENTS', '`reason` must be "completed" or "not_planned".')
  }
  const comment = typeof options.comment === 'string' ? options.comment.trim() : ''

  const check = await precheck(run, options)
  if (check.ok === false) return { ...check, action }
  if (check.workflowRequired !== true) {
    return failure(
      action,
      'NOT_A_GITHUB_PROJECT',
      `${String(check.message ?? 'No GitHub remote.')} No GitHub issue can be closed for this target.`,
      {
        guidance: String(
          check.guidance ??
            'Use the normal fix flow; github_workflow only closes issues in GitHub-remote projects.',
        ),
      },
    )
  }

  try {
    const identity = repositoryIdentity(check)
    const view = await runGh(
      run,
      ['issue', 'view', String(issueNumber), '--repo', check.slug, '--json', 'number,state,url'],
      check.repositoryRoot,
      options.signal,
    )
    if (view.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(view.stderr || view.stdout, check.host)
      return failure(
        action,
        'ISSUE_LOOKUP_FAILED',
        `gh issue view #${issueNumber} failed for ${check.slug}: ${classified.diagnostic}`,
        {
          ...identity,
          guidance: `${classified.guidance} The issue was not changed; do not claim closure.`,
        },
      )
    }
    let info = null
    try {
      info = JSON.parse(view.stdout)
    } catch {
      info = null
    }
    if (info === null || typeof info !== 'object' || Array.isArray(info)) {
      return failure(
        action,
        'ISSUE_LOOKUP_FAILED',
        `gh issue view #${issueNumber} returned an unreadable response.`,
        {
          ...identity,
          guidance: 'Verify the issue on GitHub and report the actual state; do not claim closure.',
        },
      )
    }
    const issueUrl = typeof info.url === 'string' ? info.url : undefined

    if (info.state === 'CLOSED') {
      return compact({
        ok: true,
        action,
        ...identity,
        issueNumber,
        ...(issueUrl === undefined ? {} : { issueUrl }),
        closed: true,
        alreadyClosed: true,
        message: `Issue #${issueNumber} is already closed.`,
        guidance:
          'No closure action is needed. Include the issue link, commit, and verification evidence in the final report.',
      })
    }

    let commented = false
    if (comment !== '') {
      const commentResult = await runGh(
        run,
        ['issue', 'comment', String(issueNumber), '--repo', check.slug, '--body', comment],
        check.repositoryRoot,
        options.signal,
      )
      if (commentResult.exitCode !== 0) {
        const classified = classifyGitHubDiagnostic(
          commentResult.stderr || commentResult.stdout,
          check.host,
        )
        return failure(
          action,
          'ISSUE_COMMENT_FAILED',
          `gh issue comment #${issueNumber} failed: ${classified.diagnostic}`,
          {
            ...identity,
            issueNumber,
            ...(issueUrl === undefined ? {} : { issueUrl }),
            guidance: `${classified.guidance} The issue is still open; do not claim closure.`,
          },
        )
      }
      commented = true
    }

    const closeResult = await runGh(
      run,
      ['issue', 'close', String(issueNumber), '--repo', check.slug, '--reason', reason],
      check.repositoryRoot,
      options.signal,
    )
    if (closeResult.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(
        closeResult.stderr || closeResult.stdout,
        check.host,
      )
      return failure(
        action,
        'ISSUE_CLOSE_FAILED',
        `gh issue close #${issueNumber} failed: ${classified.diagnostic}`,
        {
          ...identity,
          issueNumber,
          ...(issueUrl === undefined ? {} : { issueUrl }),
          guidance: `${classified.guidance} The issue is still open; do not claim closure.`,
        },
      )
    }

    const after = await runGh(
      run,
      ['issue', 'view', String(issueNumber), '--repo', check.slug, '--json', 'state,url'],
      check.repositoryRoot,
      options.signal,
    )
    let afterInfo = null
    try {
      afterInfo = JSON.parse(after.stdout)
    } catch {
      afterInfo = null
    }
    if (
      after.exitCode !== 0 ||
      afterInfo === null ||
      typeof afterInfo !== 'object' ||
      afterInfo.state !== 'CLOSED'
    ) {
      return failure(
        action,
        'ISSUE_CLOSE_UNCONFIRMED',
        `gh issue close exited successfully but issue #${issueNumber} does not read as CLOSED.`,
        {
          ...identity,
          issueNumber,
          ...(issueUrl === undefined ? {} : { issueUrl }),
          guidance:
            'Verify the issue state on GitHub and report the actual state; do not claim closure.',
        },
      )
    }
    const confirmedUrl = typeof afterInfo.url === 'string' ? afterInfo.url : issueUrl
    return compact({
      ok: true,
      action,
      ...identity,
      issueNumber,
      ...(confirmedUrl === undefined ? {} : { issueUrl: confirmedUrl }),
      closed: true,
      alreadyClosed: false,
      commented,
      message: `Closed issue #${issueNumber}${commented ? ' with a verification comment' : ''}.`,
      guidance:
        'Include the issue URL, the commit hash and subject, and the verification evidence in the final report.',
    })
  } catch (error) {
    return executionFailure(action, error)
  }
}

/**
 * Count the states of a pull request status-check rollup.
 * @param {unknown} rollup - `statusCheckRollup` from `gh pr view`.
 * @returns {{ passed: number; failed: number; pending: number }} check counts.
 */
function summarizeChecks(rollup) {
  const counts = { passed: 0, failed: 0, pending: 0, failing: [], pendingNames: [] }
  if (!Array.isArray(rollup)) return counts
  const FAILED_STATES = new Set([
    'FAILURE',
    'ERROR',
    'CANCELLED',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'STARTUP_FAILURE',
    'STALE',
  ])
  for (const [index, entry] of rollup.entries()) {
    if (entry === null || typeof entry !== 'object') continue
    const state = String(entry.conclusion ?? entry.state ?? '').toUpperCase()
    // 检查项的名字可能在 name / context 上，取不到就用序号，至少能定位到第几项。
    const label = String(entry.name ?? entry.context ?? entry.title ?? `check-${index + 1}`)
    if (state === '') {
      counts.pending += 1
      counts.pendingNames.push(label)
    } else if (state === 'SUCCESS' || state === 'NEUTRAL' || state === 'SKIPPED') {
      counts.passed += 1
    } else if (FAILED_STATES.has(state)) {
      counts.failed += 1
      counts.failing.push(label)
    } else {
      counts.pending += 1
      counts.pendingNames.push(label)
    }
  }
  return counts
}

/**
 * Create or reuse the branch that carries one module.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; branch?: unknown; base?: unknown }} options - branch identity and target.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function prepareBranch(run, options = {}) {
  const action = 'prepare_branch'
  const invalid = validateBranchName(options.branch)
  if (invalid !== null) {
    return failure(action, 'INVALID_ARGUMENTS', invalid, {
      guidance:
        'Call prepare_branch again with `branch` set to `<type>/<issue>-<slug>`, for example `fix/9-toolbar-overflow`.',
    })
  }
  const branch = String(options.branch).trim()
  const gate = await ready(run, options, action)
  if (gate.blocked !== undefined) return gate.blocked
  const check = gate.check
  const root = check.repositoryRoot

  try {
    const existing = await runGit(
      run,
      ['-C', root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
      root,
      options.signal,
    )
    if (existing.exitCode === 0) {
      const switched = await switchBranch(run, root, [branch], [branch], options.signal)
      if (switched.exitCode !== 0) {
        const diagnostic =
          firstDiagnosticLine(switched.stderr) ||
          firstDiagnosticLine(switched.stdout) ||
          'unknown error'
        return failure(
          action,
          'BRANCH_SWITCH_FAILED',
          `git switch ${branch} failed: ${diagnostic}`,
          {
            ...repositoryIdentity(check),
            branch,
            guidance:
              'Commit, stash, or discard the conflicting changes, then retry prepare_branch.',
          },
        )
      }
      return compact({
        ok: true,
        action,
        ...repositoryIdentity(check),
        branch,
        ...(check.defaultBranch === undefined ? {} : { baseBranch: check.defaultBranch }),
        branchCreated: false,
        branchReused: true,
        message: `Switched to the existing branch ${branch}.`,
        guidance: 'Implement this module, commit once, then open_pr.',
      })
    }

    const base =
      typeof options.base === 'string' && options.base.trim() !== ''
        ? options.base.trim()
        : (check.defaultBranch ?? 'HEAD')
    await runGit(run, ['-C', root, 'fetch', 'origin', base], root, options.signal)
    const remoteRef = await runGit(
      run,
      ['-C', root, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`],
      root,
      options.signal,
    )
    const startPoint = remoteRef.exitCode === 0 ? `origin/${base}` : base
    const created = await switchBranch(
      run,
      root,
      ['-c', branch, startPoint],
      ['-b', branch, startPoint],
      options.signal,
    )
    if (created.exitCode !== 0) {
      const diagnostic =
        firstDiagnosticLine(created.stderr) ||
        firstDiagnosticLine(created.stdout) ||
        'unknown error'
      return failure(
        action,
        'BRANCH_CREATE_FAILED',
        `git switch -c ${branch} ${startPoint} failed: ${diagnostic}`,
        {
          ...repositoryIdentity(check),
          branch,
          baseBranch: base,
          guidance:
            'Fix the reported Git problem, then retry prepare_branch. Do not start editing yet.',
        },
      )
    }
    return compact({
      ok: true,
      action,
      ...repositoryIdentity(check),
      branch,
      baseBranch: base,
      branchCreated: true,
      message: `Created branch ${branch} from ${startPoint}.`,
      guidance:
        'Implement this module, commit once with `Closes #<issue>` in the body, then open_pr.',
    })
  } catch (error) {
    return executionFailure(action, error)
  }
}

/**
 * Push the module branch and open one draft pull request.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; title?: unknown; body?: unknown; base?: unknown; head?: unknown; draft?: unknown; issue?: unknown }} options - pull request content.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function openPr(run, options = {}) {
  const action = 'open_pr'
  const title = typeof options.title === 'string' ? options.title.trim() : ''
  if (title === '') {
    return failure(action, 'INVALID_ARGUMENTS', '`title` is required for a pull request.', {
      guidance: 'Pass the Conventional Commit subject as `title`, then retry open_pr.',
    })
  }
  const gate = await ready(run, options, action)
  if (gate.blocked !== undefined) return gate.blocked
  const check = gate.check
  const root = check.repositoryRoot
  const head =
    typeof options.head === 'string' && options.head.trim() !== ''
      ? options.head.trim()
      : (check.branch ?? '')
  if (head === '') {
    return failure(
      action,
      'INVALID_ARGUMENTS',
      'Cannot determine which branch to open the pull request from.',
      {
        guidance: 'Call prepare_branch first so the module has its own branch, then retry open_pr.',
      },
    )
  }
  const base =
    typeof options.base === 'string' && options.base.trim() !== ''
      ? options.base.trim()
      : (check.defaultBranch ?? 'main')
  if (head === base) {
    return failure(
      action,
      'DEFAULT_BRANCH_HEAD',
      `Branch ${head} is the default branch, so it cannot be the head of a pull request.`,
      {
        ...repositoryIdentity(check),
        branch: head,
        baseBranch: base,
        guidance: 'Call prepare_branch first, then open_pr from the module branch.',
      },
    )
  }
  const body = ensureClosingKeyword(options.body, options.issue)
  const draft = options.draft !== false

  try {
    const existing = await runGh(
      run,
      [
        'pr',
        'list',
        '--repo',
        check.slug,
        '--head',
        head,
        '--state',
        'open',
        '--json',
        'number,url,isDraft',
      ],
      root,
      options.signal,
    )
    if (existing.exitCode === 0) {
      let rows = null
      try {
        rows = JSON.parse(existing.stdout)
      } catch {
        rows = null
      }
      const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
      if (first !== null && typeof first === 'object') {
        return compact({
          ok: true,
          action,
          ...repositoryIdentity(check),
          branch: head,
          baseBranch: base,
          ...(typeof first.number === 'number' ? { prNumber: first.number } : {}),
          ...(typeof first.url === 'string' ? { prUrl: first.url } : {}),
          prDraft: first.isDraft === true,
          prCreated: false,
          message: `A pull request for ${head} is already open.`,
          guidance:
            'Do not open a second pull request. Check pr_status, then merge_pr after verification.',
        })
      }
    }

    const push = await pushBranch(run, root, head, options.signal)
    if (!push.pushed) {
      return failure(action, 'PUSH_FAILED', `git push ${head} failed: ${String(push.diagnostic)}`, {
        ...repositoryIdentity(check),
        branch: head,
        pushed: false,
        guidance:
          'Fix the remote or credential problem, then retry open_pr. Do not claim a pull request exists.',
      })
    }

    const argv = [
      'pr',
      'create',
      '--repo',
      check.slug,
      '--base',
      base,
      '--head',
      head,
      '--title',
      title,
      '--body',
      body,
    ]
    if (draft) argv.push('--draft')
    const created = await runGh(run, argv, root, options.signal)
    if (created.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(created.stderr || created.stdout, check.host)
      return failure(
        action,
        classified.code,
        `gh pr create failed for ${check.slug}: ${classified.diagnostic}`,
        {
          ...repositoryIdentity(check),
          branch: head,
          baseBranch: base,
          pushed: true,
          guidance: `${classified.guidance} The branch is pushed; fix the reported problem and retry open_pr.`,
        },
      )
    }
    const prUrl = extractPullUrl(created.stdout)
    const prNumber = pullNumberFromUrl(prUrl)
    return compact({
      ok: true,
      action,
      ...repositoryIdentity(check),
      branch: head,
      baseBranch: base,
      ...(prNumber === null ? {} : { prNumber }),
      ...(prUrl === null ? {} : { prUrl }),
      prDraft: draft,
      prCreated: true,
      pushed: true,
      message: `Opened pull request${prUrl === null ? '' : ` ${prUrl}`}.`,
      guidance:
        'Check pr_status, then merge_pr (squash, delete branch) once the checks are green. The closing keyword closes the issue on merge.',
    })
  } catch (error) {
    return executionFailure(action, error)
  }
}

/**
 * Read one pull request's review, merge, and check state.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; pr?: unknown }} options - pull request target.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function prStatus(run, options = {}) {
  const action = 'pr_status'
  const gate = await ready(run, options, action)
  if (gate.blocked !== undefined) return gate.blocked
  const check = gate.check
  const target =
    typeof options.pr === 'string' && options.pr.trim() !== ''
      ? options.pr.trim()
      : (check.branch ?? '')
  if (target === '') {
    return failure(action, 'INVALID_ARGUMENTS', 'Cannot determine which pull request to read.', {
      guidance: 'Pass `pr` (number or URL) or run open_pr first.',
    })
  }

  try {
    const view = await runGh(
      run,
      [
        'pr',
        'view',
        target,
        '--repo',
        check.slug,
        '--json',
        'number,url,state,isDraft,mergeable,reviewDecision,statusCheckRollup,baseRefName,headRefName',
      ],
      check.repositoryRoot,
      options.signal,
    )
    if (view.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(view.stderr || view.stdout, check.host)
      return failure(
        action,
        'PR_LOOKUP_FAILED',
        `gh pr view ${target} failed: ${classified.diagnostic}`,
        {
          ...repositoryIdentity(check),
          guidance: `${classified.guidance} Do not claim any pull request state.`,
        },
      )
    }
    let info = null
    try {
      info = JSON.parse(view.stdout)
    } catch {
      info = null
    }
    if (info === null || typeof info !== 'object' || Array.isArray(info)) {
      return failure(
        action,
        'PR_LOOKUP_FAILED',
        `gh pr view ${target} returned an unreadable response.`,
        {
          ...repositoryIdentity(check),
          guidance: 'Verify the pull request on GitHub, then retry pr_status.',
        },
      )
    }
    const counts = summarizeChecks(info.statusCheckRollup)
    const state = typeof info.state === 'string' ? info.state : undefined
    const blocked = counts.failed > 0 || info.mergeable === 'CONFLICTING'
    return compact({
      ok: true,
      action,
      ...repositoryIdentity(check),
      ...(typeof info.headRefName === 'string' ? { branch: info.headRefName } : {}),
      ...(typeof info.baseRefName === 'string' ? { baseBranch: info.baseRefName } : {}),
      ...(typeof info.number === 'number' ? { prNumber: info.number } : {}),
      ...(typeof info.url === 'string' ? { prUrl: info.url } : {}),
      ...(state === undefined ? {} : { prState: state }),
      prDraft: info.isDraft === true,
      ...(typeof info.mergeable === 'string' ? { mergeable: info.mergeable } : {}),
      ...(typeof info.reviewDecision === 'string' ? { reviewDecision: info.reviewDecision } : {}),
      checksPassed: counts.passed,
      checksFailed: counts.failed,
      checksPending: counts.pending,
      ...(counts.failing.length === 0 ? {} : { failingChecks: counts.failing.slice(0, 10) }),
      ...(counts.pendingNames.length === 0
        ? {}
        : { pendingChecks: counts.pendingNames.slice(0, 10) }),
      message: `Pull request ${String(info.number ?? target)} is ${String(state ?? 'unknown')}; checks: ${counts.passed} passed, ${counts.failed} failed, ${counts.pending} pending.`,
      guidance: blocked
        ? `Resolve the failing checks or conflicts before merging.${counts.failing.length > 0 ? ` Failing: ${counts.failing.slice(0, 5).join(', ')}.` : ''} Report what the branch still needs instead of merging anyway.`
        : counts.pending > 0
          ? 'Checks are still running. Wait for them or use merge_pr with auto=true, and do not claim a merge before it happens.'
          : 'Ready to merge: call merge_pr (squash, delete branch).',
    })
  } catch (error) {
    return executionFailure(action, error)
  }
}

/**
 * Merge one pull request and delete its branch.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; pr?: unknown; method?: unknown; deleteBranch?: unknown; auto?: unknown }} options - merge settings.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function mergePr(run, options = {}) {
  const action = 'merge_pr'
  const method = typeof options.method === 'string' ? options.method : 'squash'
  if (method !== 'squash' && method !== 'merge' && method !== 'rebase') {
    return failure(action, 'INVALID_ARGUMENTS', '`method` must be squash, merge, or rebase.', {
      guidance:
        'Omit `method` to use squash, which keeps the default branch linear with one commit per pull request.',
    })
  }
  const gate = await ready(run, options, action)
  if (gate.blocked !== undefined) return gate.blocked
  const check = gate.check
  const target =
    typeof options.pr === 'string' && options.pr.trim() !== ''
      ? options.pr.trim()
      : (check.branch ?? '')
  if (target === '') {
    return failure(action, 'INVALID_ARGUMENTS', 'Cannot determine which pull request to merge.', {
      guidance: 'Pass `pr` (number or URL) or run open_pr first.',
    })
  }
  const deleteBranch = options.deleteBranch !== false

  try {
    const argv = ['pr', 'merge', target, '--repo', check.slug, `--${method}`]
    if (deleteBranch) argv.push('--delete-branch')
    if (options.auto === true) argv.push('--auto')
    const merged = await runGh(run, argv, check.repositoryRoot, options.signal)
    if (merged.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(merged.stderr || merged.stdout, check.host)
      return failure(
        action,
        classified.code,
        `gh pr merge ${target} failed: ${classified.diagnostic}`,
        {
          ...repositoryIdentity(check),
          mergeMethod: method,
          guidance: `${classified.guidance} Run pr_status to see what the branch still needs, and do not claim a merge.`,
        },
      )
    }

    const after = await runGh(
      run,
      ['pr', 'view', target, '--repo', check.slug, '--json', 'number,url,state'],
      check.repositoryRoot,
      options.signal,
    )
    let info = null
    try {
      info = JSON.parse(after.stdout)
    } catch {
      info = null
    }
    const state = info !== null && typeof info.state === 'string' ? info.state : undefined
    const done = state === 'MERGED'
    return compact({
      ok: true,
      action,
      ...repositoryIdentity(check),
      ...(info !== null && typeof info.number === 'number' ? { prNumber: info.number } : {}),
      ...(info !== null && typeof info.url === 'string' ? { prUrl: info.url } : {}),
      ...(state === undefined ? {} : { prState: state }),
      merged: done,
      mergeMethod: method,
      branchDeleted: deleteBranch && done,
      message: done
        ? `Merged pull request ${target} with a ${method} commit.`
        : `Merge accepted; the pull request is ${String(state ?? 'not yet merged')}.`,
      guidance: done
        ? 'The closing keyword closes the issue on merge. Confirm the issue state with close_issue only when it is still open.'
        : 'Auto-merge is queued. Check pr_status later and report the pending state instead of claiming a merge.',
    })
  } catch (error) {
    return executionFailure(action, error)
  }
}

/**
 * Publish one semantic-version release.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; tag?: unknown; title?: unknown; notes?: unknown; draft?: unknown }} options - release content.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function release(run, options = {}) {
  const action = 'release'
  const tag = typeof options.tag === 'string' ? options.tag.trim() : ''
  if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(tag)) {
    return failure(
      action,
      'INVALID_ARGUMENTS',
      '`tag` must be a semantic version such as `v1.4.0`.',
      {
        guidance: 'Pass the version tag to publish, then retry release.',
      },
    )
  }
  const gate = await ready(run, options, action)
  if (gate.blocked !== undefined) return gate.blocked
  const check = gate.check
  const title =
    typeof options.title === 'string' && options.title.trim() !== '' ? options.title.trim() : tag
  const notes = typeof options.notes === 'string' ? options.notes.trim() : ''

  try {
    const argv = ['release', 'create', tag, '--repo', check.slug, '--title', title]
    if (notes === '') argv.push('--generate-notes')
    else argv.push('--notes', notes)
    if (options.draft === true) argv.push('--draft')
    const created = await runGh(run, argv, check.repositoryRoot, options.signal)
    if (created.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(created.stderr || created.stdout, check.host)
      return failure(
        action,
        classified.code,
        `gh release create ${tag} failed: ${classified.diagnostic}`,
        {
          ...repositoryIdentity(check),
          tag,
          guidance: `${classified.guidance} Do not claim a release exists.`,
        },
      )
    }
    const releaseUrl = extractReleaseUrl(created.stdout)
    return compact({
      ok: true,
      action,
      ...repositoryIdentity(check),
      tag,
      ...(releaseUrl === null ? {} : { releaseUrl }),
      message: `Published release ${tag}.`,
      guidance:
        'Record the tag and release URL in the delivery report. Publish only versions whose checks already passed.',
    })
  } catch (error) {
    return executionFailure(action, error)
  }
}

/**
 * Bind the service to one command runner.
 * @param {{ run: Function }} dependencies - runner produced by lib/process.js.
 * @returns {Record<string, Function>} bound operations, one per tool action.
 */
export function createWorkflow({ run }) {
  return {
    precheck: (options) => precheck(run, options),
    createIssue: (options) => createIssue(run, options),
    prepareBranch: (options) => prepareBranch(run, options),
    openPr: (options) => openPr(run, options),
    prStatus: (options) => prStatus(run, options),
    mergePr: (options) => mergePr(run, options),
    closeIssue: (options) => closeIssue(run, options),
    release: (options) => release(run, options),
  }
}
