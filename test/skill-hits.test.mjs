/**
 * 技能命中率的验证：轮次解析、显式「无」与漏记的区分、窗口与汇总。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readFileSync } from 'node:fs'

import { parseRounds, summarize, windowOf } from '../scripts/skill-hits.mjs'

const LEDGER = [
  '| 第 1 轮 | #1 | alpha | 做了甲，用了 rd-testing |',
  '| 第 2 轮 | #2 | beta | 做了乙，技能：无 |',
  '| 第 3 轮 | #3 | gamma | 做了丙，没写技能 |',
  '| 第 4 轮 | #4 | delta | 同时用 rd-web 与 rd-testing |',
].join('\n')

test('解析轮次：抽出技能名并按轮次排序', () => {
  const rounds = parseRounds(LEDGER)
  assert.equal(rounds.length, 4)
  assert.deepEqual(
    rounds.map((item) => item.round),
    [1, 2, 3, 4],
  )
  assert.deepEqual(rounds[3].skills, ['rd-testing', 'rd-web'])
})

test('显式「技能：无」与什么都不写要分开', () => {
  const rounds = parseRounds(LEDGER)
  assert.equal(rounds[1].declared, true, '第 2 轮显式声明没用')
  assert.equal(rounds[2].declared, false, '第 3 轮是漏记')
})

test('汇总：命中 / 显式没用 / 漏记三分类', () => {
  const stats = summarize(parseRounds(LEDGER))
  assert.equal(stats.total, 4)
  assert.equal(stats.hit, 2, '第 1、4 轮命中')
  assert.equal(stats.declaredNone, 1)
  assert.deepEqual(stats.missed, [3], '只有第 3 轮算漏记')
  assert.equal(stats.rate, 0.5)
})

test('按技能统计命中轮次，次数降序', () => {
  const stats = summarize(parseRounds(LEDGER))
  assert.deepEqual(stats.bySkill, [
    { skill: 'rd-testing', hits: 2 },
    { skill: 'rd-web', hits: 1 },
  ])
})

test('窗口：只取最近若干轮；非法值不裁剪', () => {
  const rounds = parseRounds(LEDGER)
  assert.deepEqual(
    windowOf(rounds, 2).map((item) => item.round),
    [3, 4],
  )
  assert.equal(windowOf(rounds, 0).length, 4)
  assert.equal(windowOf(rounds, Number.NaN).length, 4)
})

test('真实账本：能解析出全部轮次，且未记录数可统计', () => {
  const ledger = readFileSync(new URL('../docs/ITERATIONS.md', import.meta.url), 'utf8')
  const rounds = parseRounds(ledger)
  assert.ok(rounds.length >= 88, `实际 ${rounds.length} 轮`)
  const stats = summarize(rounds)
  assert.ok(stats.hit + stats.declaredNone + stats.missed.length === stats.total)
})
