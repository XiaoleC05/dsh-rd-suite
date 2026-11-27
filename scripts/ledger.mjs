#!/usr/bin/env node
/**
 * 账本维护：改状态、查条目、追加轮次。
 *
 * 账本是 Markdown 表格，手工改容易改错列或漏改；这里把三种操作固定成命令，
 * 并且只动目标行——其余字节原样保留，diff 里看得到「改了哪一行」。
 *
 * 用法：
 *   node scripts/ledger.mjs --list 待做
 *   node scripts/ledger.mjs --mark 022 完成 --issue "#58"
 *   node scripts/ledger.mjs --append-round 43 "#58" ledger-cli "账本脚本上线"
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const LEDGER = join(root, 'docs', 'ITERATIONS.md')

/** 条目行：| 022 | 标题 | 状态 | 记录 | */
const ITEM_ROW = /^\|\s*(\d{3})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/u

/** 轮次行：| 第 43 轮 | #58 | module | 结论 | */
const ROUND_ROW = /^\|\s*第\s*(\d+)\s*轮\s*\|/u

/**
 * 改一条条目行的状态。
 * @param {string} text - 账本内容
 * @param {{ id: string; status: string; issue?: string }} change - 目标编号、新状态与可选的 Issue
 * @returns {{ text: string; changed: boolean }} 新内容与是否改动
 */
export function markRow(text, change) {
  const lines = String(text ?? '').split('\n')
  let changed = false
  for (let index = 0; index < lines.length; index += 1) {
    const match = ITEM_ROW.exec(lines[index])
    if (match === null || match[1] !== change.id) continue
    const title = match[2].trimEnd()
    const issue = change.issue === undefined ? match[4].trim() : String(change.issue).trim()
    // 保持「| 编号 | 标题 | 状态 | 记录 |」的固定列顺序，其余行一概不动。
    lines[index] = `| ${match[1]} | ${match[2].trim()} | ${change.status} | ${issue} |`
    void title
    changed = true
    break
  }
  return { text: lines.join('\n'), changed }
}

/**
 * 列出条目行。
 * @param {string} text - 账本内容
 * @param {string} [status] - 只看某个状态
 * @returns {{ id: string; title: string; status: string; issue: string }[]} 条目
 */
export function listRows(text, status) {
  const rows = []
  for (const line of String(text ?? '').split('\n')) {
    const match = ITEM_ROW.exec(line)
    if (match === null) continue
    const row = {
      id: match[1],
      title: match[2].trim(),
      status: match[3].trim(),
      issue: match[4].trim(),
    }
    if (status === undefined || row.status === status) rows.push(row)
  }
  return rows
}

/**
 * 追加一行轮次记录。
 * @param {string} text - 账本内容
 * @param {{ round: number; issue: string; module: string; note: string }} entry - 轮次信息
 * @returns {{ text: string; appended: boolean }} 新内容与是否追加
 */
export function appendRound(text, entry) {
  const body = String(text ?? '').replace(/\s+$/u, '')
  const round = Number(entry.round)
  if (!Number.isInteger(round) || round <= 0) return { text, appended: false }
  const duplicated = body.split('\n').some((line) => ROUND_ROW.exec(line)?.[1] === String(round))
  if (duplicated) return { text, appended: false }
  const line = `| 第 ${round} 轮 | ${entry.issue} | ${entry.module} | ${entry.note} |`
  return { text: `${body}\n${line}\n`, appended: true }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 成功、1 未命中目标、2 用法错误
 */
export function main(argv) {
  const text = readFileSync(LEDGER, 'utf8')

  if (argv.includes('--list')) {
    const index = argv.indexOf('--list')
    const status = argv[index + 1]?.startsWith('--') === true ? undefined : argv[index + 1]
    const rows = listRows(text, status)
    for (const row of rows) {
      process.stdout.write(
        `${row.id}  ${row.status.padEnd(4, ' ')}  ${row.title}${row.issue === '' ? '' : `（${row.issue}）`}\n`,
      )
    }
    process.stdout.write(
      `共 ${rows.length} 条${status === undefined ? '' : `（状态 ${status}）`}\n`,
    )
    return 0
  }

  if (argv.includes('--mark')) {
    const index = argv.indexOf('--mark')
    const id = argv[index + 1]
    const status = argv[index + 2]
    if (id === undefined || status === undefined || !/^\d{3}$/u.test(id)) {
      process.stdout.write('用法: node scripts/ledger.mjs --mark <编号> <状态> [--issue "#N"]\n')
      return 2
    }
    const issueIndex = argv.indexOf('--issue')
    const issue = issueIndex >= 0 ? argv[issueIndex + 1] : undefined
    const result = markRow(text, { id, status, issue })
    if (!result.changed) {
      process.stdout.write(`没有找到编号 ${id}，账本未改动\n`)
      return 1
    }
    writeFileSync(LEDGER, result.text)
    process.stdout.write(`已把 ${id} 标为 ${status}${issue === undefined ? '' : `（${issue}）`}\n`)
    return 0
  }

  if (argv.includes('--append-round')) {
    const index = argv.indexOf('--append-round')
    const [round, issue, module, note] = argv.slice(index + 1, index + 5)
    if (round === undefined || issue === undefined || module === undefined) {
      process.stdout.write(
        '用法: node scripts/ledger.mjs --append-round <轮次> <#issue> <模块> <结论>\n',
      )
      return 2
    }
    const result = appendRound(text, { round, issue, module, note: note ?? '' })
    if (!result.appended) {
      process.stdout.write(`第 ${round} 轮已存在或轮次非法，账本未改动\n`)
      return 1
    }
    writeFileSync(LEDGER, result.text)
    process.stdout.write(`已追加第 ${round} 轮\n`)
    return 0
  }

  process.stdout.write(
    '用法: node scripts/ledger.mjs --list [状态] | --mark <编号> <状态> | --append-round <轮次> <#issue> <模块> <结论>\n',
  )
  return 2
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
