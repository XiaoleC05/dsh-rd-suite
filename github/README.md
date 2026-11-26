# GitHub issue-first workflow

A DeepSeek Harness bundle that adds one setting — **GitHub 规范化修复工作流** /
**GitHub issue-first workflow** — and enforces it for fixes in projects whose
Git remote points to GitHub.

When the setting is on and the target file belongs to a Git repository with a
GitHub remote, the agent must:

1. run `github_workflow` with `action: "precheck"` before editing files and read
   the result;
2. split the diagnosed problem into modules or independent problem domains and
   create one GitHub issue per module **before** the first edit;
3. fix one module at a time, verify it, and make one atomic commit per module;
4. use Conventional Commits (`fix(<module>): <summary> (#<issue>)`) with
   `Closes #<issue>` / `Fixes #<issue>` in the body;
5. comment on and close the module's issue after the verified commit.

Without a GitHub remote, or without a Git repository at all, the preflight
reports `workflowRequired: false` and the agent uses the normal fix flow. If
GitHub is the remote but `gh` is missing, unauthenticated, lacks repository
access, or the repository has Issues disabled, the preflight reports `ok: false`
with an actionable `guidance` string; the agent must stop and report that
blocker instead of skipping the workflow.

## Install

Add the bundle from this directory in **Settings → Plugins → Add plugin**, or, from a
Harness session with the plugin-manager tool, call `install_bundle` with this
absolute directory. The bundle inserts one enriched row and starts enabled; its
setting stays off until the user turns it on.

The bundle declares `peerDependencies` on `@deepseek-ai/dsh-tools` and
`@deepseek-ai/schemastery` so the DSH launcher's runtime resolution maps those
imports to the installation's own packages. `pnpm` prints a peer warning when it
links a local directory; that warning is expected, and the imports resolve at
Harness runtime.

## Where the setting lives

Settings → General → **GitHub 规范化修复工作流** (English UI: **GitHub issue-first
workflow**). The default is **off**.

The switch is backed by the Host plugin's live config field
`githubIssueFirstWorkflow`. It can also be set durably in the profile's
`cordis.patch.yml`:

```yaml
- id: github-issue-first-workflow
  name: '@local/github-issue-first-workflow'
  config:
    githubIssueFirstWorkflow: true
```

The field is volatile, so toggling it applies to the next prompt assembly and
tool step without restarting the plugin.

## Prerequisites for the enforced workflow

- **Git** on the PATH of the DeepSeek Harness Host process.
- **GitHub CLI (`gh`)** installed on the Host and signed in for the repository's
  host (`gh auth login`, or `GH_TOKEN` with the `repo` scope in the Host
  environment).
- The Git repository has a remote whose URL points at a GitHub host
  (`github.com`, or a host whose name has a `github` DNS label, such as
  `github.example.com`). Origin is preferred when it is GitHub.
- Issues are enabled on the repository, and the signed-in account may create and
  close them.

## Model-facing surface

One tool, `github_workflow`, is registered only while the setting is on:

| `action` | Purpose |
|---|---|
| `precheck` | Resolve the target path to its Git repository, identify the GitHub remote, read branch/working-tree state, check `gh` authentication and repository/Issues access. |
| `create_issue` | Create one structured issue for one module: `module`, `title`, `symptom`, `files`, `fix_plan`, optional `labels`. The body always records the problem, affected files, fix plan and the one-module/one-commit rule. |
| `close_issue` | Comment on and close the module's issue: `issue` (number or URL), optional `comment`, optional `reason` (`completed` / `not_planned`). Closing verifies the issue reads back as `CLOSED`. |

Every result is a JSON object. `ok: false` carries a stable `code` and a
`guidance` field; the workflow prompt tells the agent to stop and report that
guidance instead of editing files or working around it.

Codes include `PATH_NOT_FOUND`, `GIT_COMMAND_FAILED`, `GIT_NOT_INSTALLED`,
`GH_NOT_INSTALLED`, `GH_UNAUTHENTICATED`, `REPO_ACCESS_DENIED`,
`REPOSITORY_UNAVAILABLE`, `REPOSITORY_ARCHIVED`, `ISSUES_DISABLED`,
`RATE_LIMITED`, `NETWORK_ERROR`, `INVALID_ARGUMENTS`, `COMMAND_TIMEOUT`,
`CANCELLED`, `ISSUE_CREATE_UNCONFIRMED`, `ISSUE_COMMENT_FAILED`,
`ISSUE_CLOSE_FAILED` and `ISSUE_CLOSE_UNCONFIRMED`.

When the setting is off, the prompt section renders empty and the tool is not
admitted to the model step, so the agent keeps its normal fix behavior.

## Limitations

- GitHub Enterprise Server hosts are recognized only when the host name contains
  a `github` DNS label; a GHES on an unrelated host name falls back to the normal
  fix flow.
- The tool creates/closes issues but does not open pull requests or push
  branches; commits use the repository's ordinary Git workflow.
- `gh` runs as a Host process outside the session's file sandbox and uses the
  Host's own `gh` credential store (or `GH_TOKEN`/`GITHUB_TOKEN` when present in
  the Host environment).
- The workflow is instruction-led: the prompt, the preflight result and the
  issue tools enforce the process, but the plugin does not block arbitrary shell
  writes.

## Development

```sh
node --check index.js
node --check client.js
node --test test/
```

The unit tests cover remote parsing, issue-body rendering, the issue-number
parser, the workflow service (GitHub ready, not a Git repository, non-GitHub
remote, missing/unauthenticated `gh`, repository access failures, issue
creation/closure), and bundle-manifest consistency. Live `gh` mutations and the
rendered Settings row require a Harness profile with GitHub CLI access; they are
not exercised by the unit tests.
