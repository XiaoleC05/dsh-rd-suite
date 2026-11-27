#!/usr/bin/env node
/**
 * 记忆检索的召回基准。
 *
 * 分词或权重一改，靠感觉判断不了好坏。这里用一组固定查询跑 searchEntries，
 * 给出 top1 准确率与 MRR；低于阈值就失败，防止召回被悄悄改差。
 *
 * 用法：
 *   node scripts/memory-recall.mjs
 *   node scripts/memory-recall.mjs --json
 *   node scripts/memory-recall.mjs --min-accuracy 0.9
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { searchEntries } from '../memory/lib/search.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const FIXTURE = join(root, 'memory', 'fixtures', 'recall-cases.json')

/** 默认要求的最低 top1 准确率。 */
export const DEFAULT_MIN_ACCURACY = 0.8

/**
 * 跑一遍召回用例。
 * @param {{ entries: object[]; cases: { query: string; expect: string }[] }} fixture - 用例集
 * @returns {{ accuracy: number; mrr: number; total: number; misses: { query: string; expect: string; got: string | null }[] }} 结果
 */
export function evaluateRecall(fixture) {
  const document = { version: 1, entries: Array.isArray(fixture?.entries) ? fixture.entries : [] }
  const cases = Array.isArray(fixture?.cases) ? fixture.cases : []
  let hitsAtOne = 0
  let reciprocal = 0
  const misses = []

  for (const item of cases) {
    // 注意参数名是 query：写成 q 会退化成「空查询按命中数排序」，看起来像召回很差。
    const results = searchEntries(document, { query: item.query, limit: 5 })
    const ids = results.entries.map((entry) => String(entry.id))
    const position = ids.indexOf(String(item.expect))
    if (position === 0) hitsAtOne += 1
    if (position >= 0) reciprocal += 1 / (position + 1)
    else misses.push({ query: item.query, expect: String(item.expect), got: ids[0] ?? null })
  }

  const total = cases.length
  return {
    accuracy: total === 0 ? 0 : hitsAtOne / total,
    mrr: total === 0 ? 0 : reciprocal / total,
    total,
    misses,
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 达标、1 低于阈值
 */
export function main(argv) {
  const minIndex = argv.indexOf('--min-accuracy')
  const min = minIndex >= 0 ? Number(argv[minIndex + 1]) : DEFAULT_MIN_ACCURACY
  const result = evaluateRecall(JSON.parse(readFileSync(FIXTURE, 'utf8')))
  const percent = (value) => `${(value * 100).toFixed(1)}%`

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ ...result, min }, null, 2)}\n`)
  } else {
    process.stdout.write(
      `召回 ${result.total} 条查询：top1 ${percent(result.accuracy)}、MRR ${result.mrr.toFixed(3)}\n`,
    )
    for (const miss of result.misses) {
      process.stdout.write(
        `  未命中：${miss.query} → 期望 ${miss.expect}，实际第一 ${miss.got ?? '无'}\n`,
      )
    }
    process.stdout.write(
      result.accuracy >= min
        ? `达标（阈值 ${percent(min)}）\n`
        : `未达标（阈值 ${percent(min)}）\n`,
    )
  }
  return result.accuracy >= min ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
