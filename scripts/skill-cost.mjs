#!/usr/bin/env node
/**
 * 技能加载成本：加载一个技能要占多少上下文，它的参考资料又有多少。
 *
 * 正文字节在技能被加载时进上下文，references 只有在读到时才算成本——
 * 两者混在一起看，只会得出「这个技能很大」这种没法行动的结论。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const skillsDir = join(root, 'skills')

/** 单个技能正文的字符预算：超过就值得拆到 references 里。 */
export const BODY_BUDGET = 3000

/**
 * 量一段文本。
 * @param {string} text - 文本
 * @returns {{ chars: number; lines: number; tokens: number }} 度量
 */
export function measure(text) {
  const value = String(text ?? '')
  const chars = [...value].length
  const lines = value === '' ? 0 : value.split(/\r?\n/u).length
  // 粗估：中日韩字符约 1 token，其余按 4 字符 1 token。
  const cjk = (value.match(/[\u3400-\u9fff\uf900-\ufaff]/gu) ?? []).length
  const rest = Math.max(0, chars - cjk)
  const tokens = cjk + Math.ceil(rest / 4)
  return { chars, lines, tokens }
}

/**
 * 统计 references 目录的体积。
 * @param {string} directory - references 目录
 * @returns {{ files: number; chars: number }} 汇总
 */
function measureReferences(directory) {
  let files = 0
  let chars = 0
  try {
    for (const name of readdirSync(directory)) {
      const full = join(directory, name)
      if (!statSync(full).isFile()) continue
      files += 1
      chars += measure(readFileSync(full, 'utf8')).chars
    }
  } catch {
    return { files: 0, chars: 0 }
  }
  return { files, chars }
}

/**
 * 收集所有技能的度量，按正文从大到小排序。
 * @returns {{ skill: string; chars: number; lines: number; tokens: number; refFiles: number; refChars: number }[]} 行
 */
export function collect() {
  const rows = []
  for (const name of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const file = join(skillsDir, name.name, 'SKILL.md')
    let body = ''
    try {
      body = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const measured = measure(body)
    const refs = measureReferences(join(skillsDir, name.name, 'references'))
    rows.push({
      skill: name.name,
      chars: measured.chars,
      lines: measured.lines,
      tokens: measured.tokens,
      refFiles: refs.files,
      refChars: refs.chars,
    })
  }
  return rows.sort((left, right) => right.chars - left.chars)
}

/**
 * 找出超出正文预算的技能。
 * @param {{ skill: string; chars: number }[]} rows - 行
 * @param {number} [budget] - 预算
 * @returns {{ skill: string; chars: number }[]} 超预算的行
 */
export function overBudget(rows, budget = BODY_BUDGET) {
  return rows.filter((row) => row.chars > budget)
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 未超预算、1 有超预算
 */
export function main(argv) {
  const rows = collect()
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ budget: BODY_BUDGET, rows }, null, 2)}\n`)
    return overBudget(rows).length === 0 ? 0 : 1
  }
  const total = rows.reduce((sum, row) => sum + row.chars, 0)
  const totalRefs = rows.reduce((sum, row) => sum + row.refChars, 0)
  process.stdout.write('技能            正文   行数   约 token   references\n')
  for (const row of rows) {
    process.stdout.write(
      `${row.skill.padEnd(16)}${String(row.chars).padStart(5)}${String(row.lines).padStart(7)}${String(row.tokens).padStart(10)}   ${row.refFiles} 个 / ${row.refChars} 字符\n`,
    )
  }
  process.stdout.write(`合计正文 ${total} 字符，references ${totalRefs} 字符（不进加载成本）\n`)
  const over = overBudget(rows)
  if (over.length === 0) {
    process.stdout.write(`正文预算 ${BODY_BUDGET} 字符：全部在预算内\n`)
    return 0
  }
  process.stdout.write(
    `超出正文预算 ${BODY_BUDGET} 字符：${over.map((row) => `${row.skill}(${row.chars})`).join('、')}\n`,
  )
  return argv.includes('--strict') ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
