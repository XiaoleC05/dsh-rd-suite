/**
 * 进度摘要的验证：账本解析、漏记检测与下一步建议。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseLedger, suggestNext, TARGET_ROUNDS } from '../scripts/resume.mjs'

const LEDGER = [
  '# 账本',
  '',
  '| 编号 | 条目 | 状态 | 记录 |',
  '|---|---|---|---|',
  '| 001 | 做完了的条目 | 完成 | #16 |',
  '| 002 | 还没做的条目 | 待做 | |',
  '| 第 1 轮 | #16 | protocol | ok |',
  '| 第 2 轮 | #17 | memory-core | ok |',
  '| 第 3 轮 | #18 | push-fallback | ok |',
].join('\n')

test('解析：轮次、最后一轮、待做条目', () => {
  const ledger = parseLedger(LEDGER)
  assert.deepEqual(ledger.rounds, [1, 2, 3])
  assert.equal(ledger.last, 3)
  assert.deepEqual(ledger.gaps, [])
  assert.deepEqual(ledger.pending, [{ id: '002', title: '还没做的条目' }])
})

test('解析：跳号要报出来，这比进度慢更严重', () => {
  const ledger = parseLedger(['| 第 1 轮 | a |', '| 第 2 轮 | b |', '| 第 4 轮 | d |'].join('\n'))
  assert.equal(ledger.last, 4)
  assert.deepEqual(ledger.gaps, [3])
})

test('解析：空账本不炸', () => {
  const ledger = parseLedger('')
  assert.deepEqual(ledger, { rounds: [], last: 0, gaps: [], pending: [] })
})

test('建议：下一轮是最后一轮加一，下一条待做取第一项', () => {
  const suggestion = suggestNext(parseLedger(LEDGER))
  assert.equal(suggestion.nextRound, 4)
  assert.deepEqual(suggestion.nextItem, { id: '002', title: '还没做的条目' })
  assert.deepEqual(suggestion.notes, [])
})

test('建议：有跳号要提醒补记；没有待做要提醒补计划', () => {
  const gapped = suggestNext(parseLedger('| 第 1 轮 | a |\n| 第 3 轮 | c |'))
  assert.ok(gapped.notes.some((note) => note.includes('缺第 2 轮')))

  const noPending = suggestNext({ rounds: [1], last: 1, gaps: [], pending: [] })
  assert.ok(noPending.notes.some((note) => note.includes('没有待做条目')))
})

test('建议：达到目标轮次时给出提示', () => {
  const suggestion = suggestNext({
    rounds: [TARGET_ROUNDS],
    last: TARGET_ROUNDS,
    gaps: [],
    pending: [],
  })
  assert.ok(suggestion.notes.some((note) => note.includes(String(TARGET_ROUNDS))))
})
