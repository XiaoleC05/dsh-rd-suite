/**
 * 账本维护脚本的验证：改行、查询、追加轮次。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { appendRound, listRows, markRow } from '../scripts/ledger.mjs'

const LEDGER = [
  '# 账本',
  '',
  '| 编号 | 条目 | 状态 | 记录 |',
  '|---|---|---|---|',
  '| 001 | 已完成的条目 | 完成 | #16 |',
  '| 002 | 还没做的条目 | 待做 | |',
  '| 003 | 另一条待做 | 待做 | |',
  '',
  '| 第 1 轮 | #16 | protocol | ok |',
].join('\n')

test('改状态只动目标行，其余字节不变', () => {
  const result = markRow(LEDGER, { id: '002', status: '完成', issue: '#58' })
  assert.equal(result.changed, true)
  assert.match(result.text, /\| 002 \| 还没做的条目 \| 完成 \| #58 \|/u)
  assert.match(result.text, /\| 003 \| 另一条待做 \| 待做 \| \|/u, '相邻行不受影响')
  assert.equal(result.text.split('\n').length, LEDGER.split('\n').length, '行数不变')
})

test('不改 Issue 时保留原有记录列', () => {
  const result = markRow(LEDGER, { id: '001', status: '完成' })
  assert.match(result.text, /\| 001 \| 已完成的条目 \| 完成 \| #16 \|/u)
})

test('编号不存在时不改动，也不静默当成成功', () => {
  const result = markRow(LEDGER, { id: '999', status: '完成' })
  assert.equal(result.changed, false)
  assert.equal(result.text, LEDGER)
})

test('列表：按状态过滤，默认全列', () => {
  assert.deepEqual(
    listRows(LEDGER, '待做').map((row) => row.id),
    ['002', '003'],
  )
  assert.equal(listRows(LEDGER).length, 3)
  assert.deepEqual(listRows(LEDGER, '完成')[0], {
    id: '001',
    title: '已完成的条目',
    status: '完成',
    issue: '#16',
  })
})

test('追加轮次：保持表格格式并以换行结尾', () => {
  const result = appendRound(LEDGER, { round: 2, issue: '#17', module: 'memory', note: '骨架' })
  assert.equal(result.appended, true)
  assert.ok(result.text.endsWith('| 第 2 轮 | #17 | memory | 骨架 |\n'))
  assert.equal(
    result.text.split('\n')[4],
    '| 001 | 已完成的条目 | 完成 | #16 |',
    '原有内容顺序不变',
  )
})

test('追加轮次：重复轮次与非法轮次都拒绝', () => {
  assert.equal(
    appendRound(LEDGER, { round: 1, issue: '#x', module: 'm', note: '' }).appended,
    false,
  )
  assert.equal(
    appendRound(LEDGER, { round: 0, issue: '#x', module: 'm', note: '' }).appended,
    false,
  )
  assert.equal(
    appendRound(LEDGER, { round: 1.5, issue: '#x', module: 'm', note: '' }).appended,
    false,
  )
})
