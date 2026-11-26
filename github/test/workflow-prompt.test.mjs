import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WORKFLOW_PROMPT, workflowPromptText } from '../lib/workflow-prompt.js';

test('the disabled setting contributes no prompt text', () => {
  assert.equal(workflowPromptText(false), '');
  assert.equal(workflowPromptText(undefined), '');
});

test('the enabled setting contributes the complete workflow text', () => {
  assert.equal(workflowPromptText(true), WORKFLOW_PROMPT);
});

test('the workflow text carries every mandatory business rule', () => {
  for (const required of [
    'github_workflow',
    'action "precheck"',
    'action "create_issue"',
    'action "close_issue"',
    'Before modifying any file',
    'github: false',
    'ok: false',
    'Stop immediately',
    'one GitHub issue per module',
    'before the first edit',
    'one atomic commit',
    'Conventional Commits',
    'fix(<module>): <concise summary> (#<issue>)',
    'Closes #<issue>',
    'After the commit and successful verification',
    'Never skip preflight',
    'report',
  ]) {
    assert.ok(WORKFLOW_PROMPT.includes(required), `missing rule: ${required}`);
  }
});

test('the workflow text avoids prompt interpolation markers', () => {
  assert.equal(WORKFLOW_PROMPT.includes('{{'), false);
});
