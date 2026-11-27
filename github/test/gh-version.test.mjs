/**
 * gh 版本识别的验证：解析、比较与降级提示。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkGhVersion,
  compareVersions,
  MINIMUM_GH_VERSION,
  parseGhVersion,
} from '../lib/gh-version.js'

test('解析三种常见输出', () => {
  assert.deepEqual(parseGhVersion('gh version 2.106.0 (2026-11-25)\n')?.text, '2.106.0')
  assert.deepEqual(parseGhVersion('gh version 2.30.1')?.text, '2.30.1')
  assert.equal(
    parseGhVersion('gh version 2.40.0-beta1')?.text,
    '2.40.0',
    '预发布后缀不影响主次修订号',
  )
  assert.equal(parseGhVersion('读不到版本'), null)
  assert.equal(parseGhVersion(''), null)
})

test('版本比较按数字而非字典序', () => {
  assert.ok(compareVersions('2.106.0', '2.30.0') > 0)
  assert.ok(compareVersions('2.9.0', '2.30.0') < 0)
  assert.equal(compareVersions('2.30.0', '2.30.0'), 0)
})

test('够用时无提示，过低时说明缺什么', () => {
  assert.deepEqual(checkGhVersion(parseGhVersion('gh version 2.106.0')), { ok: true })

  const low = checkGhVersion(parseGhVersion('gh version 2.20.0'))
  assert.equal(low.ok, false)
  assert.match(String(low.warning), /2\.20\.0/u)
  assert.match(String(low.warning), /autoMergeRequest/u)
  assert.match(String(low.warning), new RegExp(MINIMUM_GH_VERSION, 'u'))
})

test('恰好等于最低版本算通过', () => {
  assert.equal(checkGhVersion(parseGhVersion(`gh version ${MINIMUM_GH_VERSION}`)).ok, true)
})

test('读不到版本时给降级提示，不是报错', () => {
  const result = checkGhVersion(null)
  assert.equal(result.ok, false)
  assert.match(String(result.warning), /读不到 gh 版本/u)
  assert.match(String(result.warning), /其余流程不受影响/u)
})
