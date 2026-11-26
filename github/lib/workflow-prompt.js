/**
 * Model-facing workflow rules, registered as a system-prompt section only
 * while the githubIssueFirstWorkflow setting is on.
 */

/**
 * The mandatory workflow text. It tells the agent when to preflight, how to
 * split an investigation into issue-sized modules, how each module's fix is
 * committed, and how a blocked preflight must be reported instead of skipped.
 */
export const WORKFLOW_PROMPT = `The GitHub issue-first fix workflow is enabled for this deployment. Apply it to every task that fixes code, tests, or configuration in a project whose Git remote points to a GitHub repository.

Before modifying any file for a fix:
1. Preflight. Call \`github_workflow\` with action "precheck" and the path of the file you intend to fix (or its project directory). Read the result before editing anything.
   - \`isGitRepository: false\` or \`github: false\`: this project is not backed by a GitHub remote. Use the normal fix flow; do not create a GitHub issue.
   - \`ok: false\`: the workflow is blocked (Git or gh missing, not authenticated, no repository access, Issues disabled, or a Git/network failure). Stop immediately. Do not modify any file, do not create the issue another way, and never continue silently. Report the returned \`message\` and \`guidance\` to the user, including the exact commands, and ask how to proceed.
   - \`ok: true\` with \`workflowRequired: true\`: continue with the workflow below. If \`warnings\` mention uncommitted changes, resolve them first (commit or stash) so unrelated changes cannot enter this module's commit.
2. Decompose and file the issues first. Split the diagnosed problem into modules or independent problem domains. Create exactly one GitHub issue per module before any code edit: call \`github_workflow\` action "create_issue" once for each module, passing module, title, symptom, the affected file paths, and the expected fix plan. Every module must have its issue before the first edit; never create the issue after starting the fix.
3. One module, one issue, one atomic commit. Handle one module at a time: change only that module's files, verify the change (targeted tests, build, or lint), then stage only those files and make exactly one commit. Complete and verify that module before starting the next one. Never mix unrelated modules in one commit, never accumulate several modules and commit them together, and never reuse one issue for unrelated modules.
4. Commit format. Use Conventional Commits: \`fix(<module>): <concise summary> (#<issue>)\`, choosing \`feat\`, \`refactor\`, \`test\`, \`docs\`, or \`chore\` instead of \`fix\` when that is accurate. Add \`Closes #<issue>\` (or \`Fixes #<issue>\`) in the commit body so GitHub links the commit to the issue.
5. Close the loop. After the commit and successful verification, call \`github_workflow\` action "close_issue" with the issue number and a short comment naming the commit, the verification performed, and the result. Leave an issue open only when the user explicitly wants a pull request to close it later; in that case comment with the PR or commit reference and say why it stays open.
6. Report. Finish with the issue numbers and URLs, commit hashes and subjects, the verification evidence, and any issue left open with the reason.

Never skip preflight, file the issue after editing, batch multiple modules into one commit or one issue, cite an issue that does not exist, or work around a failed preflight or issue tool. A blocked preflight always means stop and report, not fall back to the normal fix flow.`;

/**
 * Resolve the section text for one prompt assembly.
 * @param {boolean} enabled - current githubIssueFirstWorkflow setting.
 * @returns {string} the workflow rules, or an empty section while disabled.
 */
export function workflowPromptText(enabled) {
  return enabled ? WORKFLOW_PROMPT : '';
}
