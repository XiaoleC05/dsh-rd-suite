/**
 * Model-facing GitHub flow rules, registered as a system-prompt section by the
 * GitHub workflow plugin for every session in this mode.
 *
 * The flow state machine here mirrors the tool actions one to one, so the model
 * never has to guess which action comes next: G0 precheck, G1 issue,
 * G2 branch, G3 commit, G4 code audit, G5 pull request, G6 closure, G7 report.
 */

/**
 * The fixed flow. References: GitHub flow
 * (https://docs.github.com/en/get-started/using-github/github-flow), closing
 * keywords
 * (https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue),
 * and protected branches / rulesets
 * (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository).
 */
export const WORKFLOW_PROMPT = `GitHub is the system of record for every change in this mode. The flow has no switch: when the project's Git remote points to GitHub, every task that changes code, tests, configuration, or documentation follows these steps in order.

G0 Preflight once per task. Call \`github_workflow\` with action "precheck" on the file or project directory, and read \`strategy\` (pr or direct), \`defaultBranch\`, \`protection\`, and \`warnings\`.
- \`isGitRepository: false\` or \`github: false\`: the project has no GitHub system of record. Use the normal engineering flow and say so in the report; do not invent issues.
- \`ok: false\`: stop and change nothing. Report its \`message\` and \`guidance\` verbatim, then ask how to proceed. Never work around a blocked preflight.
- A warning about uncommitted changes means resolve them first, so unrelated work cannot enter this module's commit.
G1 One issue per module, before the first edit. Call "create_issue" once per module with module, title, symptom, files, fix_plan, and existing labels only. The issue is the spec: symptom, impact, reproduction, scope, acceptance criteria, plan. Never file it after editing has started and never reuse it for another module.
G2 Branch when \`strategy\` is pr. Call "prepare_branch" with \`<type>/<issue>-<slug>\` (type: feat, fix, refactor, test, docs, chore), cut from the default branch. Never implement on a protected default branch. When \`strategy\` is direct, stay on the current branch and say why in the report; still prefer a branch for anything shared.
G3 One atomic commit per module, Conventional Commits: \`<type>(<module>): <summary> (#<issue>)\`, with \`Closes #<issue>\` in the body. GitHub links and closes through that keyword (close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved; write \`OWNER/REPO#N\` for another repository). Stage only this module's files, and check the message before committing with \`node scripts/commit-msg.mjs <message-file>\` when that script exists in the project.
G4 Code audit before committing. Files written through the editing tools were already formatted on write; before the commit, confirm the module carries no formatting problems left (\`code_standardize\` mode=report over the changed files when that tool exists, then mode=fix when it reports anything).
G5 Pull request when \`strategy\` is pr. Publish the branch through "open_pr" (draft by default; the body carries \`Closes #<issue>\`, what changed, and the verification evidence). Then "pr_status": merge only when checks are green, review is settled, and \`mergeable\` is MERGEABLE. "merge_pr" defaults to squash with branch deletion, which keeps the default branch linear with one commit per pull request.
G6 Close the loop. A merged pull request closes the issue through the keyword; still call "close_issue" while the issue is open so the verification evidence lands in its thread, and \`close_issue\` is what closes the issue under \`strategy\` direct. A failed close means the issue is not closed: report the state the tool returned.
G7 Report and release. The delivery report names issues with URLs, commits, pull requests, and verification evidence. Derive the release level and CHANGELOG entries from the commit types (\`feat\` → minor, \`fix\` → patch, \`!\` or \`BREAKING CHANGE\` → major), and publish versions only through "release" (SemVer tag, generated notes) from a verified default branch.

Never skip preflight, never edit before the issue exists, never batch modules into one commit or one pull request, never force-push or rewrite shared history, never publish a release whose checks have not passed, and never report a merge, closure, or release that the tool result does not confirm.`
