/**
 * Host half of the GitHub flow.
 *
 * The flow is part of the mode, not a setting: this plugin always owns one
 * system-prompt section and one model-facing `github_workflow` tool. The tool
 * runs `git`/`gh` through the Host `subprocess` service and returns structured
 * failures with actionable guidance, so a missing or unauthenticated GitHub CLI
 * is reported instead of silently skipped.
 *
 * Actions map one to one onto the published flow: precheck, create_issue,
 * prepare_branch, open_pr, pr_status, merge_pr, close_issue, release.
 */

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { createRunner, describeError } from './lib/process.js'
import { RESULT_ACTIONS, RESULT_FIELDS } from './lib/result-schema.js'
import {
  closeIssue,
  createIssue,
  mergePr,
  openPr,
  prepareBranch,
  precheck,
  prStatus,
  release,
} from './lib/service.js'
import { WORKFLOW_PROMPT } from './lib/workflow-prompt.js'

/** Stable Cordis plugin name. */
export const name = 'github-issue-first-workflow'

/** Services required by the workflow and its tool. */
export const inject = ['tools', 'systemPrompt', 'subprocess', 'workingDirectory']

/**
 * Settings surface. The GitHub flow itself is not optional, so this row only
 * keeps accepting the legacy `githubIssueFirstWorkflow` field that older
 * profile patches still carry; it no longer gates anything.
 */
export const Config = z.object({
  githubIssueFirstWorkflow: z.boolean().default(false).volatile(),
})

/** Prompt section name, unique across the profile. */
const WORKFLOW_SECTION = 'github:issue-first-workflow'

/**
 * Placement after the team policy and before the PTC-only section: the rules
 * are deployment policy, not tool documentation.
 */
const WORKFLOW_SECTION_ORDER = 700

/**
 * The effective session working directory for a tool call, when available.
 * @param {object} ctx - Host plugin context.
 * @param {object} exec - tool execution.
 * @returns {string | undefined} working directory.
 */
function sessionCwd(ctx, exec) {
  try {
    const session = exec?.agent?.session
    if (session !== undefined && session !== null) {
      const value = ctx.workingDirectory.get(session)
      if (typeof value === 'string' && value !== '') return value
    }
  } catch {
    // A tool call without a live agent/session falls back to the Host process directory.
  }
  return undefined
}

/**
 * Register the flow prompt section and the tool.
 * @param {object} ctx - Host plugin context.
 * @param {object} config - parsed plugin config plus the optional module audit.
 * @param {(exec: object) => Promise<{ checked: number; fixed: number; remaining: number; files: string[] } | null>} [config.auditModule]
 *   Runs the code audit for one finished module; the fusion root supplies it.
 */
export function apply(ctx, config) {
  const run = createRunner(ctx)
  const auditModule = typeof config?.auditModule === 'function' ? config.auditModule : null

  ctx.systemPrompt.section({
    name: WORKFLOW_SECTION,
    order: WORKFLOW_SECTION_ORDER,
    interpolate: false,
    text: () => WORKFLOW_PROMPT,
  })

  ctx.tools.register(
    defineTool({
      name: 'github_workflow',
      description:
        'Run the mandatory GitHub flow for this mode: precheck the Git/GitHub state, file one issue per module, ' +
        'branch, open a pull request, read its checks, squash-merge it, close the issue, and publish releases, all through the authenticated gh CLI. ' +
        'A precheck that reports ok:false is a blocker: stop, report its message and guidance, and never route around it.',
      parameters: {
        action: {
          type: 'string',
          required: true,
          enum: RESULT_ACTIONS,
          description:
            'Flow step: `precheck` before editing, `create_issue` per module, `prepare_branch`, `open_pr`, `pr_status`, `merge_pr`, `close_issue`, `release`.',
        },
        path: {
          type: 'string',
          description:
            'Absolute or session-relative file, or its project directory. Defaults to the session working directory.',
        },
        module: {
          type: 'string',
          description: 'Short module or problem-domain name; it also names the commit scope.',
        },
        title: {
          type: 'string',
          description:
            'Issue title for create_issue, or the Conventional Commit subject used as the pull request title for open_pr.',
        },
        symptom: {
          type: 'string',
          description: 'What is wrong and how it shows: the observed problem, not the planned fix.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Affected file paths recorded in the issue body.',
        },
        fix_plan: {
          type: 'string',
          description: 'Expected fix approach for this module.',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional GitHub labels that already exist in the repository.',
        },
        branch: {
          type: 'string',
          description: 'Module branch, as `<type>/<issue>-<slug>`; passed to prepare_branch.',
        },
        base: {
          type: 'string',
          description:
            'Branch to start from or merge into. Defaults to the repository default branch.',
        },
        head: {
          type: 'string',
          description: 'Pull request head branch. Defaults to the current branch.',
        },
        body: {
          type: 'string',
          description:
            'Pull request body: what changed, verification evidence, and the closing keyword.',
        },
        draft: {
          type: 'boolean',
          description:
            'Open the pull request as a draft. Defaults to true; pass false only when it is ready for review now.',
        },
        issue: {
          oneOf: [{ type: 'integer' }, { type: 'string' }],
          description:
            'Issue number or URL: the linked issue for open_pr, or the issue to close for close_issue.',
        },
        pr: {
          oneOf: [{ type: 'integer' }, { type: 'string' }],
          description:
            'Pull request number, URL, or head branch for pr_status and merge_pr. Defaults to the current branch.',
        },
        method: {
          type: 'string',
          enum: ['squash', 'merge', 'rebase'],
          description:
            'Merge method for merge_pr. Defaults to squash, which keeps the default branch at one commit per pull request.',
        },
        delete_branch: {
          type: 'boolean',
          description: 'Delete the head branch after merging. Defaults to true.',
        },
        auto: {
          type: 'boolean',
          description:
            'Queue the merge instead of merging now; use it while required checks are still running.',
        },
        tag: {
          type: 'string',
          description: 'Semantic version tag to publish with release, such as `v1.4.0`.',
        },
        notes: {
          type: 'string',
          description: 'Release notes. Omit to let GitHub generate them from merged pull requests.',
        },
        comment: {
          type: 'string',
          description:
            'Closure comment naming the commit, pull request, verification performed, and result.',
        },
        reason: {
          type: 'string',
          enum: ['completed', 'not_planned'],
          description: 'GitHub close reason. Defaults to completed.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: RESULT_FIELDS,
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      presentCall: (args) => ({
        card: 'generic',
        title: `github_workflow: ${args.action}`,
        kind: 'other',
        rawInput: args,
      }),
      async execute(args, exec) {
        const options = {
          path: args.path,
          sessionCwd: sessionCwd(ctx, exec),
          signal: exec.signal,
        }
        try {
          switch (args.action) {
            case 'precheck':
              return await precheck(run, options)
            case 'create_issue':
              return await createIssue(run, {
                ...options,
                module: args.module,
                title: args.title,
                symptom: args.symptom,
                files: args.files,
                fixPlan: args.fix_plan,
                labels: args.labels,
              })
            case 'prepare_branch':
              return await prepareBranch(run, {
                ...options,
                branch: args.branch,
                base: args.base,
              })
            case 'open_pr':
              return await openPr(run, {
                ...options,
                title: args.title,
                body: args.body,
                base: args.base,
                head: args.head,
                draft: args.draft,
                issue: args.issue,
              })
            case 'pr_status':
              return await prStatus(run, { ...options, pr: args.pr })
            case 'merge_pr':
              return await mergePr(run, {
                ...options,
                pr: args.pr,
                method: args.method,
                deleteBranch: args.delete_branch,
                auto: args.auto,
              })
            case 'close_issue': {
              const result = await closeIssue(run, {
                ...options,
                issue: args.issue,
                comment: args.comment,
                reason: args.reason,
              })
              // A module is closing here: audit the files it touched and report the
              // numbers inside the same result, so the delivery report never guesses.
              if (auditModule === null || result.ok !== true) return result
              let audit = null
              try {
                audit = await auditModule(exec)
              } catch {
                audit = null
              }
              if (audit === null) return result
              return {
                ...result,
                codeAuditChecked: audit.checked,
                codeAuditFixed: audit.fixed,
                codeAuditRemaining: audit.remaining,
                ...(audit.files.length === 0 ? {} : { codeAuditFiles: audit.files }),
                ...(Array.isArray(audit.byLanguage) && audit.byLanguage.length > 0
                  ? {
                      codeAuditByLanguage: audit.byLanguage
                        .map((group) => `${group.language} ${group.checked} 检 ${group.fixed} 修`)
                        .join('；'),
                    }
                  : {}),
                codeAuditNote:
                  audit.fixed > 0
                    ? `已自动修正 ${String(audit.fixed)} 个文件的格式；若本轮已提交，用 git commit --amend --no-edit 带上这些修正。`
                    : audit.remaining > 0
                      ? '有文件未能格式化，按 codeAuditFiles 逐个确认后再交付。'
                      : '格式检查通过，未改动文件。',
              }
            }
            case 'release':
              return await release(run, {
                ...options,
                tag: args.tag,
                title: args.title,
                notes: args.notes,
                draft: args.draft,
              })
            default:
              return {
                ok: false,
                action: 'precheck',
                code: 'INVALID_ARGUMENTS',
                message: `Unknown github_workflow action: ${String(args.action)}`,
                guidance: `Use one of: ${RESULT_ACTIONS.join(', ')}.`,
              }
          }
        } catch (error) {
          return {
            ok: false,
            action: args.action,
            code: 'INTERNAL_ERROR',
            message: `github_workflow failed: ${describeError(error)}`,
            guidance:
              'Report this failure to the user; do not start editing files until the workflow is available.',
          }
        }
      },
    }),
  )
}
