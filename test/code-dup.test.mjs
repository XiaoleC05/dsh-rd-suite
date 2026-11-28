/**
 * 源码重复检测的验证：JSON 报告解析、阈值判定、排序与真实运行。
 *
 * 真实运行会调 npx jscpd（首次需联网），所以单独一条用例，其余用固定样本。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_PATHS,
  DEFAULT_THRESHOLD,
  overThreshold,
  parseJscpdReport,
} from '../scripts/code-dup.mjs'

/** 固定样本：jscpd 的真实输出形状。 */
const SAMPLE = {
  statistics: {
    total: { lines: 1000, tokens: 8000, sources: 5, clones: 2, duplicatedLines: 40, percentage: 4 },
  },
  duplicates: [
    {
      firstFile: { name: 'a/one.js', start: 10 },
      secondFile: { name: 'b/two.js', start: 40 },
      lines: 12,
      tokens: 120,
    },
    {
      firstFile: { name: 'a/one.js', start: 90 },
      secondFile: { name: 'a/one.js', start: 200 },
      lines: 28,
      tokens: 260,
    },
  ],
}

test('解析：百分比、行数与重复块都取到', () => {
  const summary = parseJscpdReport(SAMPLE)
  assert.equal(summary.percentage, 4)
  assert.equal(summary.lines, 1000)
  assert.equal(summary.duplicatedLines, 40)
  assert.equal(summary.clones, 2)
  assert.equal(summary.blocks.length, 2)
})

test('解析：重复块按行数降序，位置拼成 文件:行', () => {
  const summary = parseJscpdReport(SAMPLE)
  assert.equal(summary.blocks[0].lines, 28)
  assert.equal(summary.blocks[0].from, 'a/one.js:90')
  assert.equal(summary.blocks[0].to, 'a/one.js:200')
})

test('解析：空报告不崩', () => {
  const summary = parseJscpdReport({})
  assert.equal(summary.percentage, 0)
  assert.deepEqual(summary.blocks, [])
})

test('阈值：等于阈值不算超，超过才算', () => {
  assert.equal(overThreshold({ percentage: 3 }, 3), false)
  assert.equal(overThreshold({ percentage: 3.1 }, 3), true)
  assert.equal(DEFAULT_THRESHOLD, 3)
})

test('默认扫描目录覆盖本包源码', () => {
  for (const path of ['index.js', 'lib', 'code-pipeline', 'github', 'memory', 'scripts']) {
    assert.ok(DEFAULT_PATHS.includes(path), `默认目录缺少 ${path}`)
  }
})

test('真实运行：本仓库重复率在阈值内', async () => {
  const { runJscpd } = await import('../scripts/code-dup.mjs')
  const summary = runJscpd({ paths: ['lib'] })
  assert.ok(summary.lines > 0, '应当扫描到源码行')
  assert.equal(overThreshold(summary), false, `lib 的重复率 ${summary.percentage}% 超出阈值`)
})
