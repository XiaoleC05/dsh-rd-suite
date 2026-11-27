#!/usr/bin/env node
/**
 * 宪章与技能的分工复查：同一句话不该两边都写。
 *
 * 判据是 12 字 n-gram 重叠：短于 12 字的重合多是术语与文件名的正常复用，
 * 达到 12 字基本就是成句复制——那种重复改一处忘一处，必然互相矛盾。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 重叠判定的窗口长度与允许次数。 */
export const GRAM = 12
export const MAX_HITS = 0

/**
 * 只留行文：去掉代码块、行内代码、命令、表格与标题。
 * 命令与路径两边都要写，不算重复；重复的判据是成句的行文。
 * @param {string} text - 原文
 * @returns {string} 行文
 */
export function proseOf(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`\n]*`/gu, ' ')
    .split(/\r?\n/u)
    .filter((line) => {
      const trimmed = line.trim()
      if (trimmed === '') return false
      if (/^(node|git|gh|npm|pnpm|#|\||>|-) /u.test(trimmed)) return false
      if (trimmed.startsWith('|')) return false
      return true
    })
    .join('\n')
}

/**
 * 取文本的 n-gram 集合。
 * @param {string} text - 文本
 * @param {number} [size] - 窗口长度
 * @returns {Set<string>} 集合
 */
export function grams(text, size = GRAM) {
  // 去掉空白与标点，避免换行导致同一句话被判成不同片段
  const flat = proseOf(text)
    .replace(/[A-Za-z0-9_:./\\[\]{}()=,;'"<>!?|+*#%&@\-]{3,}/gu, '')
    .replace(/[\s，。；：、（）「」【】`|#*>\-—…·]/gu, '')
  const set = new Set()
  for (let index = 0; index + size <= flat.length; index += 1)
    set.add(flat.slice(index, index + size))
  return set
}

/**
 * 计算两个集合的交集。
 * @param {Set<string>} left - 集合一
 * @param {Set<string>} right - 集合二
 * @returns {string[]} 交集中的片段（按字典序）
 */
export function overlap(left, right) {
  const shared = []
  for (const gram of left) if (right.has(gram)) shared.push(gram)
  return shared.sort()
}

/**
 * 收集每个技能与宪章的重叠。
 * @returns {{ skill: string; hits: number; samples: string[] }[]} 结果
 */
export function collect() {
  const charter = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  const charterGrams = grams(charter)
  const rows = []
  for (const entry of readdirSync(join(root, 'skills'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const body = readFileSync(join(root, 'skills', entry.name, 'SKILL.md'), 'utf8')
    const shared = overlap(charterGrams, grams(body))
    rows.push({ skill: entry.name, hits: shared.length, samples: shared.slice(0, 3) })
  }
  return rows.sort((left, right) => right.hits - left.hits)
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 无超标、1 有超标（--strict 时）
 */
export function main(argv) {
  const rows = collect()
  for (const row of rows) {
    process.stdout.write(`${row.skill.padEnd(18)}${String(row.hits).padStart(4)} 处重叠\n`)
    for (const sample of row.samples) process.stdout.write(`    ${sample}\n`)
  }
  const over = rows.filter((row) => row.hits > MAX_HITS)
  process.stdout.write(
    over.length === 0
      ? `没有超过 ${GRAM} 字的成句重复\n`
      : `${over.length} 个技能与宪章有成句重复：${over.map((row) => row.skill).join('、')}\n`,
  )
  return argv.includes('--strict') && over.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
