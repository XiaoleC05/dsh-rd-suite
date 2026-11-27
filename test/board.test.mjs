/**
 * 看板的验证：渲染、标记替换的幂等与缺标记时的保守行为。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { END, recentRounds, renderBoard, replaceBetweenMarkers, START } from '../scripts/board.mjs'

const DATA = {
  round: 48,
  target: 100,
  tests: 318,
  version: '0.48.1',
  gates: '六项全过',
  recent: [
    { round: 46, note: '分支命名' },
    { round: 47, note: '回滚演练' },
    { round: 48, note: '版本推进' },
  ],
}

test('渲染：一行摘要加最近三轮表格', () => {
  const block = renderBoard(DATA)
  assert.match(block, /\*\*进度\*\*：48\/100 轮 · 用例 318 · 版本 0\.48\.1 · 门禁 六项全过/u)
  assert.match(block, /\| 第 46 轮 \| 分支命名 \|/u)
  assert.equal(block.split('\n').filter((line) => line.startsWith('| 第')).length, 3)
})

test('替换：只动标记之间的内容，别处一字不改', () => {
  const text = [`# 标题`, '', '前面的话', START, '旧内容', END, '后面的话', ''].join('\n')
  const result = replaceBetweenMarkers(text, '新内容')
  assert.equal(result.replaced, true)
  assert.equal(
    result.text,
    ['# 标题', '', '前面的话', START, '新内容', END, '后面的话', ''].join('\n'),
  )
})

test('替换是幂等的：连续两次结果一致', () => {
  const text = ['前', START, '旧', END, '后'].join('\n')
  const once = replaceBetweenMarkers(text, '块').text
  const twice = replaceBetweenMarkers(once, '块').text
  assert.equal(twice, once)
})

test('缺标记时原样返回，不猜位置', () => {
  const text = '没有任何标记的文档'
  const result = replaceBetweenMarkers(text, '块')
  assert.equal(result.replaced, false)
  assert.equal(result.text, text)
  assert.match(String(result.reason), /标记/u)
})

test('标记顺序颠倒也算缺失', () => {
  const result = replaceBetweenMarkers(`${END}\n中间\n${START}`, '块')
  assert.equal(result.replaced, false)
})

test('最近三轮：按轮次排序后取尾部', () => {
  const ledger = [
    '| 第 3 轮 | #3 | c | 第三轮 |',
    '| 第 1 轮 | #1 | a | 第一轮 |',
    '| 第 2 轮 | #2 | b | 第二轮 |',
  ].join('\n')
  assert.deepEqual(recentRounds(ledger, 2), [
    { round: 2, note: '第二轮' },
    { round: 3, note: '第三轮' },
  ])
})
