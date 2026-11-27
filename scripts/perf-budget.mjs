#!/usr/bin/env node
/**
 * 耗时预算：给自检与全量测试设一个宽松上限，专门抓「悄悄慢一个数量级」。
 *
 * 不是卡毫秒——机器负载会让 300ms 变 600ms；预算放到当前实测的十倍左右，
 * 只有真的退化了才会撞线。
 */

import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 待测项与预算（毫秒）。 */
export const TARGETS = [
  {
    name: '自检入口',
    args: ['scripts/rd-doctor.mjs'],
    budgetMs: 15_000,
    note: '七项专项检查 + 八道门禁',
  },
  {
    name: '全量测试',
    args: [
      '--test',
      'test/**/*.test.mjs',
      'code-pipeline/test/*.test.mjs',
      'github/test/*.test.mjs',
    ],
    budgetMs: 180_000,
    note: 'node --test 跑全部用例',
  },
]

/**
 * 判定是否超预算。
 * @param {{ name: string; ms: number; budgetMs: number }[]} rows - 实测
 * @returns {{ name: string; ms: number; budgetMs: number; over: boolean }[]} 结果
 */
export function evaluate(rows) {
  return rows.map((row) => ({ ...row, over: row.ms > row.budgetMs }))
}

/**
 * 实测一项。命令失败也照样返回耗时，并把 ok 标出来——
 * 耗时预算关心的是慢不慢，失败与否由调用方看 ok。
 * @param {{ args: string[] }} target - 目标
 * @returns {{ ms: number; ok: boolean }} 实测
 */
export function measure(target) {
  const startedAt = Date.now()
  try {
    execFileSync(process.execPath, target.args, {
      cwd: root,
      stdio: 'ignore',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return { ms: Date.now() - startedAt, ok: true }
  } catch {
    return { ms: Date.now() - startedAt, ok: false }
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 未超、1 有超出（--strict 时）
 */
export function main(argv) {
  if (argv.includes('--json')) {
    const rows = evaluate(
      TARGETS.map((target) => ({
        name: target.name,
        ...measure(target),
        budgetMs: target.budgetMs,
      })),
    )
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
    return rows.some((row) => row.over) ? 1 : 0
  }
  const rows = evaluate(
    TARGETS.map((target) => ({
      name: target.name,
      ...measure(target),
      budgetMs: target.budgetMs,
    })),
  )
  for (const [index, row] of rows.entries()) {
    const target = TARGETS[index]
    const status = row.ok === false ? '命令失败' : row.over ? '超预算' : '正常'
    process.stdout.write(
      `${status}  ${row.name.padEnd(8)}${String(row.ms).padStart(7)}ms / ${String(row.budgetMs).padStart(7)}ms  ${target.note}\n`,
    )
  }
  const over = rows.filter((row) => row.over)
  process.stdout.write(
    over.length === 0
      ? `耗时预算：${rows.length} 项都在预算内\n`
      : `有 ${over.length} 项超预算：${over.map((row) => row.name).join('、')}\n`,
  )
  return argv.includes('--strict') && over.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
