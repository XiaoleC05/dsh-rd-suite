/**
 * 工具耗时的验证：包装透明、失败也计数、环形上限与汇总口径。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  recordToolCall,
  resetToolTiming,
  SAMPLE_LIMIT,
  summarizeToolTiming,
  wrapToolForTiming,
} from '../lib/tool-timing.js'
import { collectStatus } from '../code-pipeline/lib/status.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('包装后调用被计时，返回值与形状不变', async () => {
  resetToolTiming()
  let clock = 0
  const definition = {
    name: 'demo_tool',
    description: '演示',
    async execute(args) {
      clock += 40
      return { ok: true, echo: args.value }
    },
  }
  const wrapped = wrapToolForTiming(definition, { now: () => clock })
  assert.equal(wrapped.name, 'demo_tool', '名称原样透传')
  assert.equal(wrapped.description, '演示')

  const result = await wrapped.execute({ value: 7 })
  assert.deepEqual(result, { ok: true, echo: 7 })
  const [row] = summarizeToolTiming()
  assert.equal(row.tool, 'demo_tool')
  assert.equal(row.calls, 1)
  assert.equal(row.maxMs, 40)
})

test('抛错也计入失败次数，异常照常向上抛', async () => {
  resetToolTiming()
  let clock = 0
  const wrapped = wrapToolForTiming(
    {
      name: 'boom',
      async execute() {
        clock += 10
        throw new Error('炸了')
      },
    },
    { now: () => clock },
  )
  await assert.rejects(() => wrapped.execute(), /炸了/u)
  const [row] = summarizeToolTiming()
  assert.equal(row.failures, 1)
  assert.equal(row.calls, 1)
})

test('汇总按平均耗时降序，top 参数截断', () => {
  resetToolTiming()
  recordToolCall({ tool: 'slow', ms: 100 })
  recordToolCall({ tool: 'slow', ms: 50 })
  recordToolCall({ tool: 'fast', ms: 5 })
  const rows = summarizeToolTiming()
  assert.deepEqual(
    rows.map((row) => row.tool),
    ['slow', 'fast'],
  )
  assert.equal(rows[0].meanMs, 75)
  assert.equal(rows[0].maxMs, 100)
  assert.equal(summarizeToolTiming(1).length, 1)
})

test('环形上限：只保留最近的样本', () => {
  resetToolTiming()
  for (let index = 0; index < SAMPLE_LIMIT + 20; index += 1) recordToolCall({ tool: 'loop', ms: 1 })
  const [row] = summarizeToolTiming()
  assert.equal(row.calls, SAMPLE_LIMIT, '样本数不能超过上限')
})

test('非法样本被忽略', () => {
  resetToolTiming()
  recordToolCall({ tool: '', ms: 5 })
  recordToolCall({ tool: 'x', ms: -1 })
  recordToolCall({ tool: 'x', ms: Number.NaN })
  recordToolCall(null)
  assert.deepEqual(summarizeToolTiming(), [])
})

test('状态载荷：有样本时带 toolTiming，没有时不出现', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'rd-timing-'))
  resetToolTiming()
  const empty = collectStatus({ root: workspace })
  assert.equal(empty.toolTiming, undefined, '没有样本时不该出现该字段')

  recordToolCall({ tool: 'demo', ms: 12 })
  const withSamples = collectStatus({ root: workspace })
  assert.equal(withSamples.toolTiming.length, 1)
  assert.equal(withSamples.toolTiming[0].tool, 'demo')
  rmSync(workspace, { recursive: true, force: true })
  resetToolTiming()
})
