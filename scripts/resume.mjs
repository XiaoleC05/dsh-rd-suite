#!/usr/bin/env node
/**
 * 中断恢复摘要：新会话接手时先跑这个。
 *
 * 从 docs/ITERATIONS.md 读出三件事：已经做了多少轮、轮次连不连续、
 * 下一条待做是哪项。轮次跳号说明账本漏记，那比进度落后更严重。
 *
 * 用法：
 *   node scripts/resume.mjs
 *   node scripts/resume.mjs --json
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const LEDGER = join(root, 'docs', 'ITERATIONS.md')

/** 目标轮次。 */
export const TARGET_ROUNDS = 100

/**
 * 解析账本。
 * @param {string} text - docs/ITERATIONS.md 内容
 * @returns {{ rounds: number[]; last: number; gaps: number[]; pending: { id: string; title: string }[] }} 结构
 */
export function parseLedger(text) {
  const body = String(text ?? '')
  const rounds = [...body.matchAll(/^\|\s*第\s*(\d+)\s*轮\s*\|/gmu)].map((match) =>
    Number(match[1]),
  )
  const last = rounds.length === 0 ? 0 : Math.max(...rounds)

  // 漏记检测：1..last 里没有出现过的轮次号。
  const seen = new Set(rounds)
  const gaps = []
  for (let index = 1; index <= last; index += 1) {
    if (!seen.has(index)) gaps.push(index)
  }

  const pending = [...body.matchAll(/^\|\s*(\d{3})\s*\|\s*([^|]+?)\s*\|\s*待做\s*\|/gmu)].map(
    (match) => ({
      id: match[1],
      title: match[2].trim(),
    }),
  )

  return { rounds, last, gaps, pending }
}

/**
 * 给出下一步建议。
 * @param {{ rounds: number[]; last: number; gaps: number[]; pending: { id: string; title: string }[] }} ledger - 账本结构
 * @returns {{ nextRound: number; nextItem: { id: string; title: string } | null; notes: string[] }} 建议
 */
export function suggestNext(ledger) {
  const notes = []
  if (ledger.gaps.length > 0) {
    notes.push(`账本缺第 ${ledger.gaps.join('、')} 轮的记录：先补记再继续，别让轮次号失真`)
  }
  if (ledger.last >= TARGET_ROUNDS) {
    notes.push(`已完成 ${ledger.last} 轮，达到目标 ${TARGET_ROUNDS}`)
  }
  if (ledger.pending.length === 0) {
    notes.push('账本里没有待做条目：需要新增计划')
  }
  return {
    nextRound: ledger.last + 1,
    nextItem: ledger.pending[0] ?? null,
    notes,
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 账本连续、1 有跳号
 */
export function main(argv) {
  const ledger = parseLedger(readFileSync(LEDGER, 'utf8'))
  const suggestion = suggestNext(ledger)

  if (argv.includes('--json')) {
    process.stdout.write(
      `${JSON.stringify({ ...ledger, suggestion, target: TARGET_ROUNDS }, null, 2)}\n`,
    )
  } else {
    process.stdout.write(
      `已完成 ${ledger.last}/${TARGET_ROUNDS} 轮（账本 ${ledger.rounds.length} 行）\n`,
    )
    process.stdout.write(`下一轮：第 ${suggestion.nextRound} 轮\n`)
    if (suggestion.nextItem !== null) {
      process.stdout.write(`下一条待做：${suggestion.nextItem.id} ${suggestion.nextItem.title}\n`)
    }
    process.stdout.write(`待做条目：${ledger.pending.length} 项\n`)
    for (const note of suggestion.notes) process.stdout.write(`注意：${note}\n`)
    if (suggestion.notes.length === 0) process.stdout.write('账本连续，按顺序继续。\n')
  }
  return ledger.gaps.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
