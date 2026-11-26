/**
 * Host half of the GitHub issue-first workflow bundle.
 *
 * Owns one volatile configuration field (`githubIssueFirstWorkflow`), one
 * conditional system-prompt section, and the model-facing `github_workflow`
 * tool. The tool runs `git`/`gh` through the Host `subprocess` service and
 * returns structured failures with actionable guidance, so a missing or
 * unauthenticated GitHub CLI is reported instead of silently skipped.
 */

import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';

import { createRunner, describeError } from './lib/process.js';
import { RESULT_ACTIONS, RESULT_FIELDS } from './lib/result-schema.js';
import { closeIssue, createIssue, precheck } from './lib/service.js';
import { WORKFLOW_PROMPT } from './lib/workflow-prompt.js';

/** Stable Cordis plugin name. */
export const name = 'github-issue-first-workflow';

/** Services required by the workflow and its tool. */
export const inject = ['tools', 'systemPrompt', 'subprocess', 'workingDirectory'];

/**
 * Live settings. The field is volatile so toggling it from Settings > General
 * takes effect on the next prompt assembly and tool activation without
 * restarting the plugin.
 */
export const Config = z.object({
  githubIssueFirstWorkflow: z.boolean().default(false).volatile(),
});

/** Prompt section name, unique across the profile. */
const WORKFLOW_SECTION = 'github:issue-first-workflow';

/**
 * Placement after the team policy and before the PTC-only section: the rules
 * are deployment policy, not tool documentation.
 */
const WORKFLOW_SECTION_ORDER = 700;

/**
 * Read a volatile or plain boolean config field defensively.
 * @param {object} config - parsed plugin config.
 * @returns {boolean} current setting.
 */
function readEnabled(config) {
  const field = config?.githubIssueFirstWorkflow;
  if (field === undefined || field === null) return false;
  if (typeof field.get === 'function') return field.get() === true;
  return field === true;
}

/**
 * The effective session working directory for a tool call, when available.
 * @param {object} ctx - Host plugin context.
 * @param {object} exec - tool execution.
 * @returns {string | undefined} working directory.
 */
function sessionCwd(ctx, exec) {
  try {
    const session = exec?.agent?.session;
    if (session !== undefined && session !== null) {
      const value = ctx.workingDirectory.get(session);
      if (typeof value === 'string' && value !== '') return value;
    }
  } catch {
    // A tool call without a live agent/session falls back to the Host process directory.
  }
  return undefined;
}

/**
 * Register the workflow prompt section and the tool.
 * @param {object} ctx - Host plugin context.
 * @param {object} config - parsed plugin config with the volatile setting ref.
 */
export function apply(ctx, config) {
  const enabled = () => readEnabled(config);
  const run = createRunner(ctx);

  ctx.systemPrompt.section({
    name: WORKFLOW_SECTION,
    order: WORKFLOW_SECTION_ORDER,
    interpolate: false,
    text: () => (enabled() ? WORKFLOW_PROMPT : ''),
  });

  ctx.tools.register(defineTool({
    name: 'github_workflow',
    description: 'Preflight a fix target\'s Git/GitHub environment and create or close GitHub issues through the authenticated gh CLI. '
      + 'Required before editing files when the GitHub issue-first workflow is enabled. '
      + 'A precheck that reports ok:false is a blocker: stop and report its message and guidance; never bypass it, and never fall back to the normal fix flow.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: RESULT_ACTIONS,
        description: 'Which step to run: `precheck` before modifying files, `create_issue` for one module before editing it, or `close_issue` after the verified atomic commit.',
      },
      path: {
        type: 'string',
        description: 'Absolute or session-relative file to fix, or its project directory. Defaults to the session working directory.',
      },
      module: {
        type: 'string',
        description: 'Short module or problem-domain name; it also names the commit scope.',
      },
      title: {
        type: 'string',
        description: 'Clear issue title, including the module when useful.',
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
      issue: {
        oneOf: [{ type: 'integer' }, { type: 'string' }],
        description: 'Issue number returned by create_issue, or its full GitHub issue URL.',
      },
      comment: {
        type: 'string',
        description: 'Closure comment naming the commit, the verification performed, and the result.',
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
    presentCall: args => ({ card: 'generic', title: `github_workflow: ${args.action}`, kind: 'other', rawInput: args }),
    async execute(args, exec) {
      const options = {
        path: args.path,
        sessionCwd: sessionCwd(ctx, exec),
        signal: exec.signal,
      };
      try {
        switch (args.action) {
          case 'precheck':
            return await precheck(run, options);
          case 'create_issue':
            return await createIssue(run, {
              ...options,
              module: args.module,
              title: args.title,
              symptom: args.symptom,
              files: args.files,
              fixPlan: args.fix_plan,
              labels: args.labels,
            });
          case 'close_issue':
            return await closeIssue(run, {
              ...options,
              issue: args.issue,
              comment: args.comment,
              reason: args.reason,
            });
          default:
            return {
              ok: false,
              action: 'precheck',
              code: 'INVALID_ARGUMENTS',
              message: `Unknown github_workflow action: ${String(args.action)}`,
              guidance: 'Use one of: precheck, create_issue, close_issue.',
            };
        }
      } catch (error) {
        return {
          ok: false,
          action: args.action,
          code: 'INTERNAL_ERROR',
          message: `github_workflow failed: ${describeError(error)}`,
          guidance: 'Report this failure to the user; do not start editing files until the workflow is available.',
        };
      }
    },
  }), { when: () => enabled() });
}
