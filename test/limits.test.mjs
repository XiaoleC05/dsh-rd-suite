/**
 * 体积上限的验证：数字集中在一处，成员不许各写一份。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LIMITS, truncateText } from '../lib/limits.js'
import { COMMAND_OUTPUT_LIMIT_BYTES, firstDiagnosticLine } from '../github/lib/process.js'

test('上限表齐全且都是正整数', () => {
  for (const [key, value] of Object.entries(LIMITS)) {
    assert.equal(Number.isInteger(value), true, `${key} 必须是整数`)
    assert.ok(value > 0, `${key} 必须为正`)
  }
  assert.ok(Object.keys(LIMITS).length >= 5)
})

test('成员导出的是共享常量，不是自己的一份', () => {
  assert.equal(COMMAND_OUTPUT_LIMIT_BYTES, LIMITS.commandOutputBytes, 'github 的命令输出上限已漂移')
})

test('诊断行按共享字符上限截断', () => {
  const long = 'x'.repeat(LIMITS.diagnosticChars + 50)
  const line = firstDiagnosticLine(long)
  assert.equal(line.length, LIMITS.diagnosticChars + 1, '截断后带一个省略号')
  assert.ok(line.endsWith('…'))

  const short = 'ok'
  assert.equal(firstDiagnosticLine(short), 'ok', '短文本不截断也不加省略号')
})

test('truncateText：不超限原样返回', () => {
  const result = truncateText('短文本', 10)
  assert.deepEqual(result, { text: '短文本', truncated: false, dropped: 0 })
})

test('truncateText：超限时标明截掉多少，而不是只说已截断', () => {
  const result = truncateText('a'.repeat(30), 10)
  assert.equal(result.truncated, true)
  assert.equal(result.dropped, 20)
  assert.ok(result.text.startsWith('a'.repeat(10)))
  assert.match(result.text, /已截断 20 字符/u)
})

test('truncateText：非法上限回落到默认值，不抛错', () => {
  const result = truncateText('abc', 0)
  assert.equal(result.truncated, false)
  assert.equal(truncateText('abc', Number.NaN).text, 'abc')
  assert.equal(truncateText(undefined, 10).text, '')
})
