/**
 * The complete declared result surface of the `github_workflow` tool.
 *
 * Both the tool definition and the unit tests consume this module, so a
 * service result that grows an undeclared field fails a test instead of
 * failing live output validation at tool-call time.
 */

/** Action names accepted by the tool and returned in every result. */
export const RESULT_ACTIONS = Object.freeze(['precheck', 'create_issue', 'close_issue']);

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
  workingTreeClean: { type: 'boolean' },
  changedFileCount: { type: 'integer' },
  warnings: { type: 'array', items: { type: 'string' } },
  issueNumber: { type: 'integer' },
  issueUrl: { type: 'string' },
  closed: { type: 'boolean' },
  alreadyClosed: { type: 'boolean' },
  commented: { type: 'boolean' },
});
