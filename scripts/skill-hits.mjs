#!/usr/bin/env node
/**
 * 技能命中率：按轮次看「这一轮用了哪个技能」。
 *
 * 与 skill-usage 的区别：那边数全文引用次数（粗口径），这里数轮次覆盖（命中率），
 * 能回答「最近这么多轮里有多少轮真的用上了技能」。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const ledgerFile = join(root, 'docs', 'ITERATIONS.md')

/** 技能名与轮次行的识别规则。 */
export const SKILL_PATTERN = /(?<![\w/-])rd-[a-z][a-z-]*[a-z](?![\w-])/gu
export const ROUND_PATTERN = /^\|\s*第\s*(\d+)\s*轮\s*\|(.*)\|\s*$/u

/**
 * 解析账本里的轮次行。
 * @param {string} text - 账本内容
 * @returns {{ round: number; text: string; skills: string[] }[]} 轮次
 */
export function parseRounds(text) {
  const rounds = []
  for (const line of String(text ?? '').split(/\r?\n/u)) {
    const match = ROUND_PATTERN.exec(line.trim())
    if (match === null) continue
    const body = match[2]
    const skills = [...new Set([...body.matchAll(SKILL_PATTERN)].map((item) => item[0]))].sort()
    // 显式写「技能：无」是决定；什么都不写才是漏记。
    const declared = /技能：\s*无/u.test(body)
    rounds.push({ round: Number(match[1]), text: body.trim(), skills, declared })
  }
  return rounds.sort((left, right) => left.round - right.round)
}

/**
 * 统计命中率。
 * @param {{ round: number; skills: string[] }[]} rounds - 轮次
 * @returns {{ total: number; hit: number; missed: number[]; rate: number; bySkill: { skill: string; hits: number }[] }} 统计
 */
export function summarize(rounds) {
  const total = rounds.length
  const missed = rounds
    .filter((item) => item.skills.length === 0 && item.declared !== true)
    .map((item) => item.round)
  const declaredNone = rounds.filter(
    (item) => item.skills.length === 0 && item.declared === true,
  ).length
  const hits = new Map()
  for (const item of rounds)
    for (const skill of item.skills) hits.set(skill, (hits.get(skill) ?? 0) + 1)
  // 命中只算「真的引用了技能」的轮次；显式没用与漏记都不算。
  const hit = rounds.filter((item) => item.skills.length > 0).length
  return {
    total,
    hit,
    missed,
    rate: total === 0 ? 0 : Math.round((hit / total) * 1000) / 1000,
    declaredNone,
    bySkill: [...hits.entries()]
      .map(([skill, count]) => ({ skill, hits: count }))
      .sort((left, right) => right.hits - left.hits || left.skill.localeCompare(right.skill)),
  }
}

/**
 * 只保留最近若干轮。
 * @param {{ round: number }[]} rounds - 全部轮次
 * @param {number} window - 窗口大小
 * @returns {{ round: number }[]} 窗口内轮次
 */
export function windowOf(rounds, window) {
  if (!Number.isFinite(window) || window <= 0) return rounds
  return rounds.slice(-Math.floor(window))
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：始终 0（观测脚本不设门槛）
 */
export function main(argv) {
  const rounds = parseRounds(readFileSync(ledgerFile, 'utf8'))
  const windowIndex = argv.indexOf('--window')
  const window = windowIndex === -1 ? 20 : Number(argv[windowIndex + 1])
  const slice = windowOf(rounds, window)
  const stats = summarize(slice)

  process.stdout.write(
    `最近 ${stats.total} 轮：${stats.hit} 轮引用了技能，${stats.declaredNone} 轮显式没用，` +
      `${stats.missed.length} 轮未记录，命中率 ${(stats.rate * 100).toFixed(1)}%\n`,
  )
  if (stats.missed.length > 0)
    process.stdout.write(`未记录技能的轮次：${stats.missed.join(' / ')}\n`)
  for (const row of stats.bySkill)
    process.stdout.write(`${row.skill.padEnd(18)}${String(row.hits).padStart(4)} 轮\n`)
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
