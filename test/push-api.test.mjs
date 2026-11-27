/**
 * 推送回退通道的纯逻辑验证：解析、建树、快进校验、改动分类。
 * 网络部分不在这里测，避免单测依赖 GitHub 可用性。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assertFastForward,
  buildTreeEntries,
  parseNameStatus,
  splitChanges,
} from '../scripts/lib/push-plan.mjs'

test('解析 name-status：普通改动、新增、删除、重命名', () => {
  const text = [
    'M\tdocs/a.md',
    'A\tmemory/index.js',
    'D\told.txt',
    'R100\tbefore.js\tafter.js',
    '',
  ].join('\n')
  const changes = parseNameStatus(text)
  assert.deepEqual(changes, [
    { status: 'M', path: 'docs/a.md' },
    { status: 'A', path: 'memory/index.js' },
    { status: 'D', path: 'old.txt' },
    { status: 'R', path: 'after.js', previous: 'before.js' },
  ])
})

test('建树：删除用 sha=null，缺失 blob 直接报错', () => {
  const entries = buildTreeEntries(
    [
      { status: 'M', path: 'a.js' },
      { status: 'D', path: 'b.js' },
    ],
    new Map([['a.js', 'blob-a']]),
  )
  assert.deepEqual(entries, [
    { path: 'a.js', mode: '100644', type: 'blob', sha: 'blob-a' },
    { path: 'b.js', mode: '100644', type: 'blob', sha: null },
  ])
  assert.throws(() => buildTreeEntries([{ status: 'M', path: 'c.js' }], new Map()), /缺少 blob/u)
})

test('快进校验：远端为空或相同放行，非祖先拒绝', () => {
  assert.equal(assertFastForward({ remoteSha: '', localSha: 'abc', isAncestor: false }), true)
  assert.equal(assertFastForward({ remoteSha: 'abc', localSha: 'abc', isAncestor: false }), true)
  assert.equal(assertFastForward({ remoteSha: 'abc', localSha: 'def', isAncestor: true }), true)
  assert.throws(
    () => assertFastForward({ remoteSha: 'abc', localSha: 'def', isAncestor: false }),
    /不是本地.*的祖先/u,
  )
})

test('改动分类：上传与删除分开且去重', () => {
  const split = splitChanges([
    { status: 'M', path: 'a.js' },
    { status: 'M', path: 'a.js' },
    { status: 'D', path: 'b.js' },
    { status: 'A', path: 'c.js' },
  ])
  assert.deepEqual(split.uploads, ['a.js', 'c.js'])
  assert.deepEqual(split.deletes, ['b.js'])
})
