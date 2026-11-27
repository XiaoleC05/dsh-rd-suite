/**
 * The complete declared result surface of the `github_workflow` tool.
 *
 * Both the tool definition and the unit tests consume this module, so a
 * service result that grows an undeclared field fails a test instead of
 * failing live output validation at tool-call time.
 */

/** Action names accepted by the tool and returned in every result. */
export const RESULT_ACTIONS = Object.freeze([
  'precheck',
  'create_issue',
  'prepare_branch',
  'open_pr',
  'pr_status',
  'merge_pr',
  'close_issue',
  'release',
])

/**
 * Author-facing output schema properties. The root object is closed
 * (`additionalProperties: false`), so a result carrying any other key is a
 * bug, not a schema extension.
 */
export const RESULT_FIELDS = Object.freeze({
  ok: { type: 'boolean', required: true },
  action: { type: 'string', required: true, enum: RESULT_ACTIONS },
  code: { type: 'string' },
  message: { type: 'string', required: true },
  guidance: { type: 'string' },
  path: { type: 'string' },
  isGitRepository: { type: 'boolean' },
  github: { type: 'boolean' },
  repositoryRoot: { type: 'string' },
  remoteName: { type: 'string' },
  remoteUrl: { type: 'string' },
  remoteUrls: { type: 'array', items: { type: 'string' } },
  host: { type: 'string' },
  slug: { type: 'string' },
  workflowRequired: { type: 'boolean' },
  ghInstalled: { type: 'boolean' },
  ghAuthenticated: { type: 'boolean' },
  ghAccount: { type: 'string' },
  hasIssuesEnabled: { type: 'boolean' },
  viewerPermission: { type: 'string' },
  branch: { type: 'string' },
  baseBranch: { type: 'string' },
  defaultBranch: { type: 'string' },
  strategy: { type: 'string', enum: ['pr', 'direct'] },
  protection: { type: 'string', enum: ['required', 'none', 'unknown'] },
  rulesets: { type: 'array', items: { type: 'string' } },
  requiredReviews: { type: 'integer' },
  requiredChecks: { type: 'array', items: { type: 'string' } },
  recentCommits: { type: 'array', items: { type: 'string' } },
  ahead: { type: 'integer' },
  behind: { type: 'integer' },
  diverged: { type: 'boolean' },
  workingTreeClean: { type: 'boolean' },
  changedFileCount: { type: 'integer' },
  warnings: { type: 'array', items: { type: 'string' } },
  issueNumber: { type: 'integer' },
  issueUrl: { type: 'string' },
  labelsEnsured: { type: 'array', items: { type: 'string' } },
  branchCreated: { type: 'boolean' },
  branchReused: { type: 'boolean' },
  prNumber: { type: 'integer' },
  prUrl: { type: 'string' },
  prState: { type: 'string' },
  prDraft: { type: 'boolean' },
  prCreated: { type: 'boolean' },
  pushed: { type: 'boolean' },
  mergeable: { type: 'string' },
  reviewDecision: { type: 'string' },
  checksPassed: { type: 'integer' },
  checksFailed: { type: 'integer' },
  checksPending: { type: 'integer' },
  failingChecks: { type: 'array', items: { type: 'string' } },
  pendingChecks: { type: 'array', items: { type: 'string' } },
  merged: { type: 'boolean' },
  mergeMethod: { type: 'string', enum: ['squash', 'merge', 'rebase'] },
  branchDeleted: { type: 'boolean' },
  autoQueued: { type: 'boolean' },
  closed: { type: 'boolean' },
  alreadyClosed: { type: 'boolean' },
  commented: { type: 'boolean' },
  tag: { type: 'string' },
  releaseUrl: { type: 'string' },
  codeAuditChecked: { type: 'integer' },
  codeAuditFixed: { type: 'integer' },
  codeAuditRemaining: { type: 'integer' },
  codeAuditFiles: { type: 'array', items: { type: 'string' } },
  codeAuditNote: { type: 'string' },
})
