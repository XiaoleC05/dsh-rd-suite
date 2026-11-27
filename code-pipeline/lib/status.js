/**
 * 模式自身的状态快照：版本、账本进度、变更日志。
 *
 * 只读、不写文件；读不到就缺省并记 warning——面板宁可少显示一行，
 * 也不能因为某个文件搬走就整块崩掉。
 */

import { readFileSync } from 'node:fs'

import { summarizeToolTiming } from '../../lib/tool-timing.js'
import { readAuditHistory } from './history.js'
import { join } from 'node:path'

/**
 * 数账本里有多少行「第 N 轮」，以及最大的轮次号。
 * @param {string} text - docs/ITERATIONS.md 内容
 * @returns {{ rows: number; lastRound: number }} 统计
 */
export function countRounds(text) {
  const matches = [...String(text ?? '').matchAll(/^\|\s*第\s*(\d+)\s*轮\s*\|/gmu)]
  const rounds = matches.map((match) => Number(match[1])).filter((value) => Number.isFinite(value))
  return { rows: matches.length, lastRound: rounds.length === 0 ? 0 : Math.max(...rounds) }
}

/**
 * 取 CHANGELOG 里最新的版本标题。
 * @param {string} text - 变更日志内容
 * @returns {string | undefined} 版本号
 */
export function latestVersion(text) {
  const match = /^##\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/mu.exec(String(text ?? ''))
  return match === null ? undefined : match[1]
}

/**
 * 收集状态快照。
 * @param {{ root: string; readText?: (path: string) => string }} options - 仓库根与可注入的读取器
 * @returns {{ version?: string; rounds?: { rows: number; lastRound: number }; changelogVersion?: string; warnings: string[] }} 快照
 */
export function collectStatus(options) {
  const readText = options.readText ?? ((path) => readFileSync(path, 'utf8'))
  const warnings = []
  let version
  let rounds
  let changelogVersion

  try {
    const manifest = JSON.parse(readText(join(options.root, 'package.json')))
    if (typeof manifest?.version === 'string') version = manifest.version
    else warnings.push('package.json 里没有 version')
  } catch {
    warnings.push('读不到 package.json')
  }

  try {
    rounds = countRounds(readText(join(options.root, 'docs', 'ITERATIONS.md')))
  } catch {
    warnings.push('读不到 docs/ITERATIONS.md')
  }

  try {
    changelogVersion = latestVersion(readText(join(options.root, 'docs', 'CHANGELOG.md')))
    if (changelogVersion === undefined) warnings.push('CHANGELOG 里没有版本标题')
  } catch {
    warnings.push('读不到 docs/CHANGELOG.md')
  }

  const timing = summarizeToolTiming(5)
  return {
    ...(timing.length === 0 ? {} : { toolTiming: timing }),
    ...(options.historyFile === undefined ? {} : { auditHistory: readAuditHistory(options.historyFile).slice(0, 3) }),
    ...(version === undefined ? {} : { version }),
    ...(rounds === undefined ? {} : { rounds }),
    ...(changelogVersion === undefined ? {} : { changelogVersion }),
    warnings,
  }
}
