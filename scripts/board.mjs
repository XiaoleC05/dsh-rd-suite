#!/usr/bin/env node
/**
 * 迭代看板：README 里那段会过期的进度信息，改成可自动刷新的块。
 *
 * 内容夹在 `<!-- rd-board:start -->` 与 `<!-- rd-board:end -->` 之间，
 * 刷新只替换标记内部；标记外一个字都不动。
 *
 * 用法：
 *   node scripts/board.mjs
 *   node scripts/board.mjs --write
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { collectHealth } from './health.mjs'
import { parseLedger, TARGET_ROUNDS } from './resume.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const README = join(root, 'README.md')
const LEDGER = join(root, 'docs', 'ITERATIONS.md')

/** 看板块的开始标记。 */
export const START = '<!-- rd-board:start -->'
/** 看板块的结束标记。 */
export const END = '<!-- rd-board:end -->'

/**
 * 生成看板内容（不含标记）。
 * @param {{ round: number; target: number; tests: number; version: string; gates: string; recent: { round: number; note: string }[] }} data - 数据
 * @returns {string} Markdown 片段
 */
export function renderBoard(data) {
  const lines = [
    `进度：${data.round}/${data.target} 轮 · 用例 ${data.tests} · 版本 ${data.version} · 门禁 ${data.gates}`,
    '',
    '| 最近三轮 | 做了什么 |',
    '|---|---|',
    ...data.recent.map((item) => `| 第 ${item.round} 轮 | ${item.note} |`),
  ]
  return lines.join('\n')
}

/**
 * 用新内容替换标记之间的段落。
 * @param {string} text - 原文
 * @param {string} block - 新内容
 * @returns {{ text: string; replaced: boolean; reason?: string }} 结果
 */
export function replaceBetweenMarkers(text, block) {
  const body = String(text ?? '')
  const start = body.indexOf(START)
  const end = body.indexOf(END)
  if (start < 0 || end < 0 || end < start) {
    return { text: body, replaced: false, reason: '缺少 <!-- rd-board:start/end --> 标记' }
  }
  const head = body.slice(0, start + START.length)
  const tail = body.slice(end)
  return { text: `${head}\n${block}\n${tail}`, replaced: true }
}

/**
 * 从账本取最近几轮。
 * @param {string} ledgerText - 账本内容
 * @param {number} [count] - 取几轮
 * @returns {{ round: number; note: string }[]} 最近轮次
 */
export function recentRounds(ledgerText, count = 3) {
  const rows = String(ledgerText ?? '')
    .split('\n')
    .map((line) => /^\|\s*第\s*(\d+)\s*轮\s*\|(.*)\|\s*$/u.exec(line))
    .filter((match) => match !== null)
    .map((match) => ({
      round: Number(match[1]),
      note:
        match[2]
          .split('|')
          .map((cell) => cell.trim())
          .filter((cell) => cell !== '')
          .slice(-1)[0] ?? '',
    }))
  return rows.sort((left, right) => left.round - right.round).slice(-count)
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 成功、1 标记缺失、2 用法错误
 */
export function main(argv) {
  const ledgerText = readFileSync(LEDGER, 'utf8')
  const ledger = parseLedger(ledgerText)
  const health = collectHealth()
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const block = renderBoard({
    round: ledger.last,
    target: TARGET_ROUNDS,
    tests: health.tests?.cases ?? 0,
    version: String(manifest.version ?? '—'),
    gates: '六项全过',
    recent: recentRounds(ledgerText, 3),
  })

  if (!argv.includes('--write')) {
    process.stdout.write(`${block}\n`)
    return 0
  }

  const readme = readFileSync(README, 'utf8')
  const result = replaceBetweenMarkers(readme, block)
  if (!result.replaced) {
    process.stdout.write(`README 里没有看板标记：请先加入 ${START} 与 ${END}\n`)
    return 1
  }
  writeFileSync(README, result.text)
  process.stdout.write(
    `已刷新 README 看板（第 ${ledger.last} 轮、用例 ${health.tests?.cases ?? 0}）\n`,
  )
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
