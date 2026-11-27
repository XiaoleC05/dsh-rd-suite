/**
 * 重试与降级判定的验证。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { classifyFailure, DEGRADE_PATHS, withRetry } from '../lib/retry.js'
import { ERROR_CODES } from '../lib/error-codes.js'

test('可重试的码判为 retry，并给出错误码表里的处理建议', () => {
  const verdict = classifyFailure('PUSH_FAILED')
  assert.equal(verdict.decision, 'retry')
  assert.match(verdict.reason, /瞬时/u)
  assert.equal(verdict.hint, ERROR_CODES.PUSH_FAILED.action)
})

test('不可重试但有替代路径的码判为 degrade', () => {
  for (const code of Object.keys(DEGRADE_PATHS)) {
    const verdict = classifyFailure(code)
    assert.ok(
      verdict.decision === 'degrade' || verdict.decision === 'retry',
      `${code} 的判定不应是 stop`,
    )
    if (verdict.decision === 'degrade') assert.equal(verdict.hint, DEGRADE_PATHS[code])
  }
})

test('参数错误这类码判为 stop，不浪费重试', () => {
  for (const code of ['INVALID_ARGUMENTS', 'forbidden', 'RELEASE_INCONSISTENT']) {
    const verdict = classifyFailure(code)
    assert.equal(verdict.decision, 'stop', `${code} 不该重试`)
    assert.match(verdict.reason, /重试也不会变好/u)
  }
})

test('未登记的码判为 stop，并提示报给维护者', () => {
  const verdict = classifyFailure('something-new')
  assert.equal(verdict.decision, 'stop')
  assert.match(verdict.hint, /维护者/u)
})

test('withRetry：第一轮失败、第二轮成功时重试一次', async () => {
  let calls = 0
  const result = await withRetry(
    async () => {
      calls += 1
      return { ok: calls > 1 }
    },
    { attempts: 2, shouldRetry: (value) => value.ok === false },
  )
  assert.equal(result.attempts, 2)
  assert.equal(result.retried, true)
  assert.deepEqual(result.value, { ok: true })
})

test('withRetry：不该重试时立刻返回，只调用一次', async () => {
  let calls = 0
  const result = await withRetry(
    async () => {
      calls += 1
      return { ok: false }
    },
    { attempts: 3, shouldRetry: () => false },
  )
  assert.equal(calls, 1)
  assert.equal(result.retried, false)
})

test('withRetry：始终失败时用尽次数并返回最后一次结果', async () => {
  let calls = 0
  const result = await withRetry(
    async () => {
      calls += 1
      return { ok: false, attempt: calls }
    },
    { attempts: 3, shouldRetry: () => true },
  )
  assert.equal(calls, 3)
  assert.equal(result.attempts, 3)
  assert.equal(result.value.attempt, 3)
})

test('withRetry：onRetry 在每次重试前被调用', async () => {
  const seen = []
  await withRetry(async () => ({ ok: false }), {
    attempts: 3,
    shouldRetry: () => true,
    onRetry: (value, attempt) => seen.push(attempt),
  })
  assert.deepEqual(seen, [1, 2])
})

test('withRetry：非法次数回落到两次', async () => {
  let calls = 0
  const result = await withRetry(
    async () => {
      calls += 1
      return { ok: false }
    },
    { attempts: 0, shouldRetry: () => true },
  )
  assert.equal(calls, 2)
  assert.equal(result.attempts, 2)
})
