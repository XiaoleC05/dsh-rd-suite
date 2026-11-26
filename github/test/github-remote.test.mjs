import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildIssueBody,
  isGitHubHost,
  parseGitHubRemote,
  parseIssueNumber,
  parseRemoteList,
  pickGitHubRemote,
} from '../lib/github-remote.js';

test('parseGitHubRemote accepts the common GitHub remote forms', () => {
  const expected = { host: 'github.com', owner: 'acme', repo: 'widgets', slug: 'github.com/acme/widgets' };
  for (const remote of [
    'https://github.com/acme/widgets.git',
    'https://github.com/acme/widgets',
    'https://github.com/acme/widgets/',
    'http://github.com/acme/widgets.git',
    'ssh://git@github.com/acme/widgets.git',
    'git://github.com/acme/widgets.git',
    'git@github.com:acme/widgets.git',
    'git@github.com:acme/widgets',
    'https://user:token@github.com/acme/widgets.git',
  ]) {
    assert.deepEqual(parseGitHubRemote(remote), expected, remote);
  }
});

test('parseGitHubRemote recognizes GitHub Enterprise hosts with a github label', () => {
  assert.deepEqual(parseGitHubRemote('git@github.example.com:team/service.git'), {
    host: 'github.example.com',
    owner: 'team',
    repo: 'service',
    slug: 'github.example.com/team/service',
  });
  assert.deepEqual(parseGitHubRemote('https://github.example.com/team/service.git'), {
    host: 'github.example.com',
    owner: 'team',
    repo: 'service',
    slug: 'github.example.com/team/service',
  });
});

test('parseGitHubRemote rejects non-GitHub and malformed remotes', () => {
  for (const remote of [
    'https://gitlab.com/acme/widgets.git',
    'git@bitbucket.org:acme/widgets.git',
    'https://github.com/acme',
    'https://github.com/acme/widgets/extra',
    'not a url',
    '',
    null,
    42,
    'file:///C:/repos/widgets',
  ]) {
    assert.equal(parseGitHubRemote(remote), null, String(remote));
  }
});

test('isGitHubHost only accepts github.com or hosts with a github label', () => {
  assert.equal(isGitHubHost('github.com'), true);
  assert.equal(isGitHubHost('GitHub.com'), true);
  assert.equal(isGitHubHost('github.example.com'), true);
  assert.equal(isGitHubHost('ghe.example.com'), false);
  assert.equal(isGitHubHost('notgithub.example.com'), false);
  assert.equal(isGitHubHost('githubfoo.com'), false);
});

test('parseRemoteList keeps fetch entries only', () => {
  const output = [
    'origin\thttps://github.com/acme/widgets.git (fetch)',
    'origin\thttps://github.com/acme/widgets.git (push)',
    'upstream\tgit@github.com:acme/widgets.git (fetch)',
    'upstream\tgit@github.com:acme/widgets.git (push)',
    '',
  ].join('\n');
  assert.deepEqual(parseRemoteList(output), [
    { name: 'origin', url: 'https://github.com/acme/widgets.git' },
    { name: 'upstream', url: 'git@github.com:acme/widgets.git' },
  ]);
  assert.deepEqual(parseRemoteList(''), []);
  assert.deepEqual(parseRemoteList(undefined), []);
});

test('pickGitHubRemote prefers origin, then the first GitHub remote', () => {
  const remotes = [
    { name: 'upstream', url: 'git@github.com:acme/widgets.git' },
    { name: 'origin', url: 'https://github.com/acme/fork.git' },
  ];
  assert.equal(pickGitHubRemote(remotes)?.remoteName, 'origin');
  assert.equal(pickGitHubRemote(remotes)?.repo, 'fork');

  assert.equal(pickGitHubRemote([
    { name: 'origin', url: 'https://gitlab.com/acme/widgets.git' },
    { name: 'github', url: 'git@github.com:acme/widgets.git' },
  ])?.remoteName, 'github');

  assert.equal(pickGitHubRemote([{ name: 'origin', url: 'https://gitlab.com/acme/widgets.git' }]), null);
  assert.equal(pickGitHubRemote([]), null);
  assert.equal(pickGitHubRemote(undefined), null);
});

test('parseIssueNumber accepts numbers, hashes and issue URLs', () => {
  assert.equal(parseIssueNumber(42), 42);
  assert.equal(parseIssueNumber('42'), 42);
  assert.equal(parseIssueNumber('#42'), 42);
  assert.equal(parseIssueNumber('https://github.com/acme/widgets/issues/42'), 42);
  assert.equal(parseIssueNumber('https://github.com/acme/widgets/issues/42#issuecomment-1'), 42);
  assert.equal(parseIssueNumber(0), null);
  assert.equal(parseIssueNumber(-1), null);
  assert.equal(parseIssueNumber('abc'), null);
  assert.equal(parseIssueNumber(''), null);
  assert.equal(parseIssueNumber(null), null);
});

test('buildIssueBody always records the problem, files, fix plan and workflow rule', () => {
  const body = buildIssueBody({
    module: 'auth',
    symptom: 'Login retries forever',
    files: ['src/auth/login.ts', ' src/auth/retry.ts '],
    fixPlan: 'Cap the retry loop at three attempts.',
  });
  assert.match(body, /^## Problem\n\nLogin retries forever/);
  assert.match(body, /## Module\n\nauth/);
  assert.match(body, /## Affected files\n\n- `src\/auth\/login.ts`\n- `src\/auth\/retry.ts`/);
  assert.match(body, /## Fix plan\n\nCap the retry loop at three attempts\./);
  assert.match(body, /One module, one issue, one atomic commit\./);
  assert.match(body, /`Closes #<number>`/);
  assert.ok(body.endsWith('\n'));
});

test('buildIssueBody omits an empty module and tolerates empty files', () => {
  const body = buildIssueBody({ symptom: 'Boom', files: [], fixPlan: 'Fix it' });
  assert.doesNotMatch(body, /## Module/);
  assert.match(body, /## Affected files[\s\S]*## Fix plan/);
});
