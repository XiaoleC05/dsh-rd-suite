import assert from 'node:assert/strict'
import { test } from 'node:test'

import { WORKFLOW_PROMPT } from '../lib/workflow-prompt.js'

test('the workflow text carries every mandatory business rule', () => {
  for (const required of [
    'github_workflow',
    '"precheck"',
    '"create_issue"',
    '"prepare_branch"',
    '"open_pr"',
    '"pr_status"',
    '"merge_pr"',
    '"close_issue"',
    '"release"',
    'no switch',
    'strategy',
    'ok: false',
    'Never work around a blocked preflight',
    'One issue per module',
    'before the first edit',
    'Conventional Commits',
    'Closes #<issue>',
    'OWNER/REPO#N',
    'Code audit before committing',
    'squash',
    'never batch modules',
    'verified default branch',
  ]) {
    assert.ok(WORKFLOW_PROMPT.includes(required), `missing rule: ${required}`)
  }
})

test('the flow is always on and never asks the model to check a setting', () => {
  assert.equal(WORKFLOW_PROMPT.includes('is enabled'), false)
  assert.equal(WORKFLOW_PROMPT.includes('when the GitHub issue-first workflow is enabled'), false)
  assert.match(WORKFLOW_PROMPT, /system of record/)
})

test('the workflow text avoids prompt interpolation markers', () => {
  assert.equal(WORKFLOW_PROMPT.includes('{{'), false)
})

test('the workflow text stays inside its token budget', () => {
  // The section is resident in every request: keep it under roughly 900 tokens.
  assert.ok(
    WORKFLOW_PROMPT.length < 4200,
    `workflow prompt grew to ${WORKFLOW_PROMPT.length} characters`,
  )
})
