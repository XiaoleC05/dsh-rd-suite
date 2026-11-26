/**
 * Git/GitHub preflight and issue lifecycle used by the model-facing
 * github_workflow tool. Every operation is bounded, returns a structured
 * result, and turns a blocked prerequisite into a code plus actionable
 * guidance instead of silently skipping the workflow.
 *
 * The module accepts a `run(argv, options)` function so it is unit-testable
 * without the Host subprocess service.
 */

import { statSync } from 'node:fs';
import path from 'node:path';

import {
  buildIssueBody,
  GIT_CLEAR_ENV,
  parseIssueNumber,
  parseRemoteList,
  pickGitHubRemote,
} from './github-remote.js';
import {
  CommandAbortedError,
  CommandTimeoutError,
  CommandUnavailableError,
  describeError,
  firstDiagnosticLine,
} from './process.js';

const GIT_TIMEOUT_MS = 20_000;
const GH_TIMEOUT_MS = 30_000;

const GH_INSTALL_GUIDANCE = 'Install the GitHub CLI and make it available on the PATH of the DeepSeek Harness Host, then retry. '
  + 'Windows: `winget install --id GitHub.cli`; macOS: `brew install gh`; Linux: see https://github.com/cli/cli#installation. '
  + 'After installing, run `gh auth login` (or set GH_TOKEN with the `repo` scope) and retry. '
  + 'The issue-first workflow cannot run without gh; do not modify files for this fix yet - report this blocker to the user.';

const REPO_ACCESS_GUIDANCE = 'Verify that the Git remote points to the expected GitHub repository and that the signed-in GitHub account can access it, then retry. '
  + 'Do not modify files for this fix yet - report this blocker to the user.';

const NETWORK_GUIDANCE = 'Check network or proxy access to GitHub, then retry. Do not modify files for this fix yet - report this blocker to the user.';

/** @param {string} host - GitHub host. @returns {string} authentication guidance. */
function ghAuthGuidance(host) {
  return `Run \`gh auth login --hostname ${host}\` (or set GH_TOKEN with the \`repo\` scope in the Host environment and restart DeepSeek Harness), then retry. `
    + 'Without GitHub authentication the workflow must stop; do not modify files for this fix yet - report this blocker to the user.';
}

/** @returns {Record<string, string | undefined>} environment overrides for a git invocation. */
function gitEnvironment() {
  const env = { GIT_TERMINAL_PROMPT: '0' };
  for (const key of GIT_CLEAR_ENV) env[key] = undefined;
  return env;
}

/** @returns {Record<string, string>} environment overrides for a gh invocation. */
function ghEnvironment() {
  const env = {
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    GH_PAGER: '',
    NO_COLOR: '1',
    CLICOLOR: '0',
  };
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    const value = process.env[key];
    if (typeof value === 'string' && value !== '') env[key] = value;
  }
  return env;
}

/**
 * Drop keys whose value is undefined so the tool result stays tight.
 * @param {Record<string, unknown>} value - result draft.
 * @returns {Record<string, unknown>} the same object without undefined keys.
 */
function compact(value) {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
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
  return compact({ ok: false, action, code, message, ...extra });
}

/**
 * Resolve the file or directory a fix targets.
 * @param {unknown} targetPath - model-supplied path.
 * @param {string | undefined} sessionCwd - session working directory.
 * @returns {{ ok: true; directory: string; target: string }
 *   | { ok: false; code: string; message: string; guidance: string; path?: string }} resolution.
 */
function resolveTargetDirectory(targetPath, sessionCwd) {
  const supplied = typeof targetPath === 'string' && targetPath.trim() !== '' ? targetPath.trim() : undefined;
  const fallback = typeof sessionCwd === 'string' && sessionCwd.trim() !== '' ? sessionCwd.trim() : process.cwd();
  const candidate = supplied ?? fallback;
  const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(fallback, candidate);
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return {
      ok: false,
      code: 'PATH_NOT_FOUND',
      path: absolute,
      message: `Path not found: ${absolute}`,
      guidance: 'Pass the existing file or directory to fix (or its project directory), then retry. Do not start editing files.',
    };
  }
  if (stats.isFile()) return { ok: true, directory: path.dirname(absolute), target: absolute };
  if (stats.isDirectory()) return { ok: true, directory: absolute, target: absolute };
  return {
    ok: false,
    code: 'PATH_NOT_A_FILE_OR_DIRECTORY',
    path: absolute,
    message: `Path is neither a file nor a directory: ${absolute}`,
    guidance: 'Pass the file or directory to fix, then retry. Do not start editing files.',
  };
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
  return run(['git', ...args], { cwd, signal, timeoutMs: GIT_TIMEOUT_MS, env: gitEnvironment() });
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
  return run(['gh', ...args], { cwd, signal, timeoutMs: GH_TIMEOUT_MS, env: ghEnvironment() });
}

/**
 * The signed-in account named by `gh auth status`, when the output names one.
 * @param {string} stdout - command stdout.
 * @param {string} stderr - command stderr.
 * @returns {string | undefined} account login.
 */
function accountFromAuthStatus(stdout, stderr) {
  const text = `${stdout}\n${stderr}`;
  const match = /Logged in to [^\s]+ account ([A-Za-z0-9-]+)/iu.exec(text)
    ?? /account\s+([A-Za-z0-9-]+)/iu.exec(text);
  return match?.[1];
}

/**
 * Translate a gh diagnostic into a stable code and actionable guidance.
 * @param {string} output - stderr, falling back to stdout.
 * @param {string} host - GitHub host for authentication guidance.
 * @returns {{ code: string; diagnostic: string; guidance: string }} classification.
 */
function classifyGitHubDiagnostic(output, host) {
  const text = String(output ?? '');
  const diagnostic = firstDiagnosticLine(text) || 'no diagnostic output';
  if (/gh auth login|not logged in|authentication (?:required|failed)|bad credentials|HTTP 401|token is invalid|requires authentication/iu.test(text)) {
    return { code: 'GH_UNAUTHENTICATED', diagnostic, guidance: ghAuthGuidance(host) };
  }
  if (/issues are disabled|has issues disabled/iu.test(text)) {
    return {
      code: 'ISSUES_DISABLED',
      diagnostic,
      guidance: 'Ask the user to enable Issues in the GitHub repository settings, then retry. Do not start editing files.',
    };
  }
  if (/HTTP 403|Resource not accessible|permission denied|forbidden|insufficient scopes|write access/iu.test(text)) {
    return {
      code: 'REPO_ACCESS_DENIED',
      diagnostic,
      guidance: `${REPO_ACCESS_GUIDANCE} Ask the repository owner to grant the signed-in account access or approve the required scopes.`,
    };
  }
  if (/Could not resolve to a Repository|HTTP 404|not found/iu.test(text)) {
    return {
      code: 'REPOSITORY_UNAVAILABLE',
      diagnostic,
      guidance: 'The remote repository was not found for the signed-in account. Verify the Git remote and repository access, then retry. Do not start editing files.',
    };
  }
  if (/rate limit/iu.test(text)) {
    return {
      code: 'RATE_LIMITED',
      diagnostic,
      guidance: 'The GitHub API rate limit was reached. Wait for it to reset (or authenticate with a token that has a higher limit), then retry. Do not start editing files.',
    };
  }
  if (/could not connect|network|timed out|timeout|TLS|proxy/iu.test(text)) {
    return { code: 'NETWORK_ERROR', diagnostic, guidance: NETWORK_GUIDANCE };
  }
  return {
    code: 'GH_COMMAND_FAILED',
    diagnostic,
    guidance: 'Report this GitHub CLI failure to the user and retry after it is fixed. Do not start editing files.',
  };
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
      guidance: 'Retry when ready; do not start editing files until the workflow preflight finishes.',
    });
  }
  if (error instanceof CommandTimeoutError) {
    return failure(action, 'COMMAND_TIMEOUT', error.message, {
      guidance: 'Retry the call; if it keeps timing out, check the Git installation and network/proxy access to GitHub. Do not start editing files.',
    });
  }
  if (error instanceof CommandUnavailableError) {
    if (error.command === 'gh') {
      return failure(action, 'GH_NOT_INSTALLED', 'The GitHub CLI (gh) was not found on the Host PATH.', {
        guidance: GH_INSTALL_GUIDANCE,
      });
    }
    return failure(action, 'GIT_NOT_INSTALLED', 'Git was not found on the Host PATH.', {
      guidance: 'Install Git and make it available on the PATH of the DeepSeek Harness Host, then retry. Do not start editing files.',
    });
  }
  return failure(action, 'INTERNAL_ERROR', `The workflow preflight failed: ${describeError(error)}`, {
    guidance: 'Report this failure to the user; do not start editing files until it is resolved.',
  });
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
  });
}

/**
 * Normalize optional issue labels.
 * @param {unknown} labels - model input.
 * @returns {string[]} unique non-empty labels.
 */
function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  const seen = new Set();
  const normalized = [];
  for (const label of labels) {
    if (typeof label !== 'string') continue;
    const value = label.trim();
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

/**
 * Validate the fields create_issue needs beyond the parameter types.
 * @param {{ title?: unknown; symptom?: unknown; files?: unknown; fixPlan?: unknown }} options - create input.
 * @returns {string | null} violation text, or null when valid.
 */
function validateCreateInput(options) {
  if (typeof options.title !== 'string' || options.title.trim() === '') {
    return '`title` is required: a clear GitHub issue title.';
  }
  if (typeof options.symptom !== 'string' || options.symptom.trim() === '') {
    return '`symptom` is required: what the problem is and how it shows.';
  }
  const files = Array.isArray(options.files) ? options.files.filter(file => typeof file === 'string' && file.trim() !== '') : [];
  if (files.length === 0) return '`files` is required: at least one affected file path.';
  if (typeof options.fixPlan !== 'string' || options.fixPlan.trim() === '') {
    return '`fix_plan` is required: the expected fix.';
  }
  return null;
}

/**
 * Find the created issue URL in `gh issue create` output.
 * @param {string} stdout - command stdout.
 * @returns {string | null} issue URL.
 */
function extractIssueUrl(stdout) {
  const match = /(https?:\/\/[^\s]+\/issues\/\d+)/u.exec(String(stdout ?? ''));
  return match === null ? null : match[1];
}

/**
 * Inspect the Git/GitHub preconditions for the issue-first workflow.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal }} [options] - target and cancellation.
 * @returns {Promise<Record<string, unknown>>} structured preflight result.
 */
export async function precheck(run, options = {}) {
  const action = 'precheck';
  try {
    const target = resolveTargetDirectory(options.path, options.sessionCwd);
    if (target.ok === false) return failure(action, target.code, target.message, { guidance: target.guidance, path: target.path });

    const revParse = await runGit(run, ['-C', target.directory, 'rev-parse', '--show-toplevel'], target.directory, options.signal);
    if (revParse.exitCode !== 0) {
      const diagnostic = firstDiagnosticLine(revParse.stderr) || firstDiagnosticLine(revParse.stdout) || 'git rev-parse failed';
      if (/not a git repository/iu.test(diagnostic)) {
        return compact({
          ok: true,
          action,
          workflowRequired: false,
          isGitRepository: false,
          github: false,
          path: target.target,
          message: `Not a Git repository: ${target.directory}`,
          guidance: 'This project has no Git repository. Use the normal fix flow; do not create a GitHub issue.',
        });
      }
      return failure(action, 'GIT_COMMAND_FAILED', `git rev-parse --show-toplevel failed (exit ${String(revParse.exitCode)}): ${diagnostic}`, {
        path: target.target,
        guidance: 'Check the repository and the Git installation, then retry. Do not start editing files.',
      });
    }
    const repositoryRoot = revParse.stdout.trim();
    if (repositoryRoot === '') {
      return failure(action, 'GIT_COMMAND_FAILED', 'git rev-parse --show-toplevel returned an empty repository root.', {
        path: target.target,
        guidance: 'Check the repository state, then retry. Do not start editing files.',
      });
    }

    const remotesOutput = await runGit(run, ['-C', repositoryRoot, 'remote', '-v'], repositoryRoot, options.signal);
    if (remotesOutput.exitCode !== 0) {
      const diagnostic = firstDiagnosticLine(remotesOutput.stderr) || 'git remote -v failed';
      return failure(action, 'GIT_COMMAND_FAILED', `git remote -v failed: ${diagnostic}`, {
        path: target.target,
        repositoryRoot,
        guidance: 'Check the repository remotes and the Git installation, then retry. Do not start editing files.',
      });
    }
    const remotes = parseRemoteList(remotesOutput.stdout);
    const remote = pickGitHubRemote(remotes);
    if (remote === null) {
      return compact({
        ok: true,
        action,
        workflowRequired: false,
        isGitRepository: true,
        github: false,
        path: target.target,
        repositoryRoot,
        remoteUrls: remotes.map(entry => entry.url),
        message: remotes.length === 0
          ? 'The repository has no Git remote.'
          : 'No Git remote points to GitHub.',
        guidance: 'Use the normal fix flow; the issue-first workflow applies only to projects with a GitHub remote.',
      });
    }

    const [branchResult, statusResult] = await Promise.all([
      runGit(run, ['-C', repositoryRoot, 'branch', '--show-current'], repositoryRoot, options.signal),
      runGit(run, ['-C', repositoryRoot, 'status', '--porcelain=v1'], repositoryRoot, options.signal),
    ]);
    const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : '';
    const changedFileCount = statusResult.exitCode === 0
      ? statusResult.stdout.split(/\r?\n/u).filter(line => line.trim() !== '').length
      : 0;
    const warnings = [];
    if (statusResult.exitCode !== 0) {
      warnings.push(`git status failed: ${firstDiagnosticLine(statusResult.stderr) || 'unknown error'}; uncommitted-change detection is unavailable.`);
    } else if (changedFileCount > 0) {
      warnings.push(`The working tree already has ${changedFileCount} uncommitted change(s). Commit or stash them before starting a module so unrelated changes never share the issue's atomic commit.`);
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
    });

    let auth;
    try {
      auth = await runGh(run, ['auth', 'status', '--hostname', remote.host], repositoryRoot, options.signal);
    } catch (error) {
      if (error instanceof CommandUnavailableError) {
        return failure(action, 'GH_NOT_INSTALLED', 'The GitHub CLI (gh) was not found on the Host PATH.', {
          ...identity,
          ghInstalled: false,
          guidance: GH_INSTALL_GUIDANCE,
        });
      }
      throw error;
    }
    if (auth.exitCode !== 0) {
      const diagnostic = firstDiagnosticLine(auth.stderr) || firstDiagnosticLine(auth.stdout) || 'gh auth status failed';
      return failure(action, 'GH_UNAUTHENTICATED', `GitHub CLI is not authenticated for ${remote.host}: ${diagnostic}`, {
        ...identity,
        ghInstalled: true,
        ghAuthenticated: false,
        guidance: ghAuthGuidance(remote.host),
      });
    }
    const account = accountFromAuthStatus(auth.stdout, auth.stderr);

    let repoView;
    try {
      repoView = await runGh(
        run,
        ['repo', 'view', remote.slug, '--json', 'nameWithOwner,url,hasIssuesEnabled,isArchived,viewerPermission'],
        repositoryRoot,
        options.signal,
      );
    } catch (error) {
      if (error instanceof CommandUnavailableError) {
        return failure(action, 'GH_NOT_INSTALLED', 'The GitHub CLI (gh) was not found on the Host PATH.', {
          ...identity,
          ghInstalled: false,
          guidance: GH_INSTALL_GUIDANCE,
        });
      }
      throw error;
    }
    if (repoView.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(repoView.stderr || repoView.stdout, remote.host);
      return failure(action, classified.code, `gh repo view ${remote.slug} failed: ${classified.diagnostic}`, {
        ...identity,
        ghInstalled: true,
        ghAuthenticated: true,
        ...(account === undefined ? {} : { ghAccount: account }),
        guidance: classified.guidance,
      });
    }
    let info = null;
    try {
      info = JSON.parse(repoView.stdout);
    } catch {
      info = null;
    }
    if (info === null || typeof info !== 'object' || Array.isArray(info)) {
      return failure(action, 'REPOSITORY_UNAVAILABLE', `gh repo view ${remote.slug} returned an unreadable response.`, {
        ...identity,
        ghInstalled: true,
        ghAuthenticated: true,
        ...(account === undefined ? {} : { ghAccount: account }),
        guidance: 'Verify repository access and retry. Do not start editing files.',
      });
    }
    if (info.isArchived === true) {
      return failure(action, 'REPOSITORY_ARCHIVED', `Repository ${remote.slug} is archived.`, {
        ...identity,
        ghInstalled: true,
        ghAuthenticated: true,
        ...(account === undefined ? {} : { ghAccount: account }),
        guidance: 'Archived repositories do not accept issue work. Ask the user to unarchive the repository or choose another target, then retry. Do not start editing files.',
      });
    }
    if (info.hasIssuesEnabled === false) {
      return failure(action, 'ISSUES_DISABLED', `Issues are disabled for ${remote.slug}.`, {
        ...identity,
        ghInstalled: true,
        ghAuthenticated: true,
        ...(account === undefined ? {} : { ghAccount: account }),
        guidance: 'Ask the user to enable Issues in the repository settings, then retry. Do not start editing files.',
      });
    }

    return compact({
      ok: true,
      action,
      ...identity,
      isGitRepository: true,
      github: true,
      ...(branch === '' ? {} : { branch }),
      workingTreeClean: statusResult.exitCode === 0 ? changedFileCount === 0 : false,
      changedFileCount,
      ghInstalled: true,
      ghAuthenticated: true,
      ...(account === undefined ? {} : { ghAccount: account }),
      hasIssuesEnabled: info.hasIssuesEnabled !== false,
      ...(typeof info.viewerPermission === 'string' ? { viewerPermission: info.viewerPermission } : {}),
      ...(warnings.length === 0 ? {} : { warnings }),
      message: `GitHub repository ${remote.slug} is ready for the issue-first workflow.`,
      guidance: 'Split the fix into modules and create one GitHub issue per module before editing. Then make one atomic commit per module and close its issue after verification.',
    });
  } catch (error) {
    return executionFailure(action, error);
  }
}

/**
 * Create one structured GitHub issue for one module.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; module?: string; title?: string; symptom?: string; files?: string[]; fixPlan?: string; labels?: string[] }} options - issue content and target.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function createIssue(run, options = {}) {
  const action = 'create_issue';
  const invalid = validateCreateInput(options);
  if (invalid !== null) return failure(action, 'INVALID_ARGUMENTS', invalid, {
    guidance: 'Call create_issue again with the missing fields; do not start editing files.',
  });

  const check = await precheck(run, options);
  if (check.ok === false) return { ...check, action };
  if (check.workflowRequired !== true) {
    return failure(action, 'NOT_A_GITHUB_PROJECT', `${String(check.message ?? 'No GitHub remote.')} No GitHub issue can be filed for this target.`, {
      guidance: String(check.guidance ?? 'Use the normal fix flow; github_workflow only files issues in GitHub-remote projects.'),
    });
  }

  try {
    const body = buildIssueBody({
      module: options.module,
      symptom: options.symptom,
      files: options.files,
      fixPlan: options.fixPlan,
    });
    const argv = ['issue', 'create', '--repo', check.slug, '--title', options.title.trim(), '--body', body];
    for (const label of normalizeLabels(options.labels)) argv.push('--label', label);
    const result = await runGh(run, argv, check.repositoryRoot, options.signal);
    if (result.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(result.stderr || result.stdout, check.host);
      return failure(action, classified.code, `gh issue create failed for ${check.slug}: ${classified.diagnostic}`, {
        ...repositoryIdentity(check),
        guidance: `${classified.guidance} No issue was created; do not start editing.`,
      });
    }
    const issueUrl = extractIssueUrl(result.stdout);
    if (issueUrl === null) {
      return failure(action, 'ISSUE_CREATE_UNCONFIRMED', `gh issue create exited successfully but printed no issue URL. Check \`gh issue list --repo ${check.slug}\` before editing.`, {
        ...repositoryIdentity(check),
        guidance: 'Verify on GitHub whether the issue exists and report the actual state; do not assume the issue was created.',
      });
    }
    const issueNumber = parseIssueNumber(issueUrl);
    return compact({
      ok: true,
      action,
      ...repositoryIdentity(check),
      ...(issueNumber === null ? {} : { issueNumber }),
      issueUrl,
      message: `Created GitHub issue ${issueUrl}.`,
      guidance: `Fix only this module, then commit with a Conventional Commit containing \`Closes #${String(issueNumber ?? '<number>')}\` and close the issue with close_issue after verification.`,
    });
  } catch (error) {
    return executionFailure(action, error);
  }
}

/**
 * Comment on and close the issue that owns a finished module.
 * @param {Function} run - command runner.
 * @param {{ path?: string; sessionCwd?: string; signal?: AbortSignal; issue?: unknown; comment?: string; reason?: string }} options - issue identity and closure copy.
 * @returns {Promise<Record<string, unknown>>} structured result.
 */
export async function closeIssue(run, options = {}) {
  const action = 'close_issue';
  const issueNumber = parseIssueNumber(options.issue);
  if (issueNumber === null) {
    return failure(action, 'INVALID_ARGUMENTS', '`issue` must be a positive issue number or its full GitHub issue URL.', {
      guidance: 'Call close_issue again with the number returned by create_issue; do not start editing files.',
    });
  }
  const reason = options.reason ?? 'completed';
  if (reason !== 'completed' && reason !== 'not_planned') {
    return failure(action, 'INVALID_ARGUMENTS', '`reason` must be "completed" or "not_planned".');
  }
  const comment = typeof options.comment === 'string' ? options.comment.trim() : '';

  const check = await precheck(run, options);
  if (check.ok === false) return { ...check, action };
  if (check.workflowRequired !== true) {
    return failure(action, 'NOT_A_GITHUB_PROJECT', `${String(check.message ?? 'No GitHub remote.')} No GitHub issue can be closed for this target.`, {
      guidance: String(check.guidance ?? 'Use the normal fix flow; github_workflow only closes issues in GitHub-remote projects.'),
    });
  }

  try {
    const identity = repositoryIdentity(check);
    const view = await runGh(
      run,
      ['issue', 'view', String(issueNumber), '--repo', check.slug, '--json', 'number,state,url'],
      check.repositoryRoot,
      options.signal,
    );
    if (view.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(view.stderr || view.stdout, check.host);
      return failure(action, 'ISSUE_LOOKUP_FAILED', `gh issue view #${issueNumber} failed for ${check.slug}: ${classified.diagnostic}`, {
        ...identity,
        guidance: `${classified.guidance} The issue was not changed; do not claim closure.`,
      });
    }
    let info = null;
    try {
      info = JSON.parse(view.stdout);
    } catch {
      info = null;
    }
    if (info === null || typeof info !== 'object' || Array.isArray(info)) {
      return failure(action, 'ISSUE_LOOKUP_FAILED', `gh issue view #${issueNumber} returned an unreadable response.`, {
        ...identity,
        guidance: 'Verify the issue on GitHub and report the actual state; do not claim closure.',
      });
    }
    const issueUrl = typeof info.url === 'string' ? info.url : undefined;

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
        guidance: 'No closure action is needed. Include the issue link, commit, and verification evidence in the final report.',
      });
    }

    let commented = false;
    if (comment !== '') {
      const commentResult = await runGh(
        run,
        ['issue', 'comment', String(issueNumber), '--repo', check.slug, '--body', comment],
        check.repositoryRoot,
        options.signal,
      );
      if (commentResult.exitCode !== 0) {
        const classified = classifyGitHubDiagnostic(commentResult.stderr || commentResult.stdout, check.host);
        return failure(action, 'ISSUE_COMMENT_FAILED', `gh issue comment #${issueNumber} failed: ${classified.diagnostic}`, {
          ...identity,
          issueNumber,
          ...(issueUrl === undefined ? {} : { issueUrl }),
          guidance: `${classified.guidance} The issue is still open; do not claim closure.`,
        });
      }
      commented = true;
    }

    const closeResult = await runGh(
      run,
      ['issue', 'close', String(issueNumber), '--repo', check.slug, '--reason', reason],
      check.repositoryRoot,
      options.signal,
    );
    if (closeResult.exitCode !== 0) {
      const classified = classifyGitHubDiagnostic(closeResult.stderr || closeResult.stdout, check.host);
      return failure(action, 'ISSUE_CLOSE_FAILED', `gh issue close #${issueNumber} failed: ${classified.diagnostic}`, {
        ...identity,
        issueNumber,
        ...(issueUrl === undefined ? {} : { issueUrl }),
        guidance: `${classified.guidance} The issue is still open; do not claim closure.`,
      });
    }

    const after = await runGh(
      run,
      ['issue', 'view', String(issueNumber), '--repo', check.slug, '--json', 'state,url'],
      check.repositoryRoot,
      options.signal,
    );
    let afterInfo = null;
    try {
      afterInfo = JSON.parse(after.stdout);
    } catch {
      afterInfo = null;
    }
    if (after.exitCode !== 0 || afterInfo === null || typeof afterInfo !== 'object' || afterInfo.state !== 'CLOSED') {
      return failure(action, 'ISSUE_CLOSE_UNCONFIRMED', `gh issue close exited successfully but issue #${issueNumber} does not read as CLOSED.`, {
        ...identity,
        issueNumber,
        ...(issueUrl === undefined ? {} : { issueUrl }),
        guidance: 'Verify the issue state on GitHub and report the actual state; do not claim closure.',
      });
    }
    const confirmedUrl = typeof afterInfo.url === 'string' ? afterInfo.url : issueUrl;
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
      guidance: 'Include the issue URL, the commit hash and subject, and the verification evidence in the final report.',
    });
  } catch (error) {
    return executionFailure(action, error);
  }
}

/**
 * Bind the service to one command runner.
 * @param {{ run: Function }} dependencies - runner produced by lib/process.js.
 * @returns {{ precheck: Function; createIssue: Function; closeIssue: Function }} bound operations.
 */
export function createWorkflow({ run }) {
  return {
    precheck: options => precheck(run, options),
    createIssue: options => createIssue(run, options),
    closeIssue: options => closeIssue(run, options),
  };
}
