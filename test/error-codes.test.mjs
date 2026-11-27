/**
 * 错误码登记的验证：源码里出现的每个码都必须在总表里。
 *
 * 这条测试防的是「新加了一个码，没人知道它是什么意思」——
 * 用户只看到一串 code，维护者也答不出该不该重试。
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { describeErrorCode, ERROR_CODES, knownCodes, retryableCodes } from '../lib/error-codes.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 参与扫描的源码目录。 */
const SOURCE_DIRECTORIES = ['github', 'code-pipeline', 'memory', 'lib']

/** 递归收集 .js 文件。 */
function collect(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'test') continue
    const full = join(directory, entry.name)
    if (statSync(full).isDirectory()) collect(full, found)
    else if (entry.name.endsWith('.js')) found.push(full)
  }
  return found
}

/** 从源码里抽出所有可能返回的错误码。 */
export function extractCodes(text) {
  const codes = new Set()
  const patterns = [
    /code:\s*'([a-zA-Z0-9-]+)'/gu,
    /failure\([^,]+,\s*'([A-Z_]+)'/gu,
    /errorPayload\('([a-z-]+)'/gu,
  ]
  for (const pattern of patterns) {
    for (const match of String(text).matchAll(pattern)) codes.add(match[1])
  }
  return [...codes]
}

const files = SOURCE_DIRECTORIES.map((directory) => join(root, directory)).flatMap((directory) =>
  collect(directory),
)

test('源码里的错误码全部登记在册', () => {
  const seen = new Map()
  for (const file of files) {
    for (const code of extractCodes(readFileSync(file, 'utf8'))) {
      if (seen.has(code)) continue
      seen.set(
        code,
        file
          .slice(root.length + 1)
          .split('\\')
          .join('/'),
      )
    }
  }
  assert.ok(seen.size > 10, `扫到的错误码只有 ${seen.size} 个，扫描逻辑可能失效`)
  const missing = [...seen.entries()].filter(([code]) => ERROR_CODES[code] === undefined)
  assert.deepEqual(
    missing,
    [],
    `未登记的错误码：${missing.map(([code, file]) => `${code}（${file}）`).join('、')}`,
  )
})

test('每个码都有说明、可重试标记与处理建议', () => {
  for (const [code, entry] of Object.entries(ERROR_CODES)) {
    assert.ok(typeof entry.message === 'string' && entry.message !== '', `${code} 缺少说明`)
    assert.equal(typeof entry.retryable, 'boolean', `${code} 的 retryable 必须是布尔值`)
    assert.ok(typeof entry.action === 'string' && entry.action !== '', `${code} 缺少处理建议`)
  }
})

test('查询接口：已登记返回完整信息，未登记返回 null', () => {
  const described = describeErrorCode('PUSH_FAILED')
  assert.equal(described.code, 'PUSH_FAILED')
  assert.equal(described.retryable, true)
  assert.match(described.action, /fetch/u)
  assert.equal(describeErrorCode('nope'), null)
  assert.equal(describeErrorCode(undefined), null)
})

test('可重试的码只包含真正的瞬时失败', () => {
  const retryable = retryableCodes()
  assert.deepEqual(retryable, [
    'CANCELLED',
    'COMMAND_TIMEOUT',
    'GIT_COMMAND_TIMEOUT',
    'ISSUE_CLOSE_FAILED',
    'ISSUE_CLOSE_UNCONFIRMED',
    'ISSUE_COMMENT_FAILED',
    'ISSUE_CREATE_UNCONFIRMED',
    'ISSUE_LOOKUP_FAILED',
    'PR_LOOKUP_FAILED',
    'PUSH_FAILED',
    'guard-unavailable',
  ])
  assert.equal(retryable.includes('INVALID_ARGUMENTS'), false, '参数错误不该重试')
  assert.equal(retryable.includes('forbidden'), false, '权限不足不该重试')
})

test('码表没有重复键（大小写不同的近似写法也要区分清楚）', () => {
  const codes = knownCodes()
  assert.equal(codes.length, new Set(codes).size)
  assert.equal(
    new Set(codes.map((code) => code.toLowerCase())).size,
    codes.length,
    '不允许只靠大小写区分两个码',
  )
})
