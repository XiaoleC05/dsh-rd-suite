#!/usr/bin/env node
/**
 * 技能使用频率：用可观测的引用量代替印象，决定增、并、拆。
 *
 * 诚实说明口径：这里统计的不是真实调用次数（客户端不上报），
 * 而是「技能名在各证据面出现的次数」——迭代账本、变更日志、README、
 * 宪章、其它技能的正文、记忆样例。它是能拿到的最强代理指标。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const skillsDir = join(root, 'skills')

/** 证据面：技能名在这些文件里出现，说明它被真正用到过。 */
export const EVIDENCE_FILES = [
  'docs/ITERATIONS.md',
  'docs/CHANGELOG.md',
  'README.md',
  'cordis.patch.yml',
  'memory/fixtures/recall-cases.json',
]

/** 处置阈值。 */
export const THRESHOLDS = {
  /** 引用次数低于此值视为没人用。 */
  unused: 1,
  /** 正文超过此值且引用不少，说明内容确实被需要，别轻易动。 */
  heavy: 2500,
  /** 引用密度（每千字引用数）低于此值视为内容与用途不匹配。 */
  dense: 0.8,
}

/**
 * 数一个技能名在一段文本里出现几次。
 * @param {string} text - 文本
 * @param {string} skill - 技能名
 * @returns {number} 次数
 */
export function countUsage(text, skill) {
  if (skill === '') return 0
  // 技能名只含字母、数字与连字符；连字符在字符类外无需转义，转义反而在 u 模式下非法。
  const pattern = new RegExp(`(?<![\\w/-])${skill}(?![\\w-])`, 'gu')
  return [...String(text ?? '').matchAll(pattern)].length
}

/** 读一个文件，读不到返回空串。 */
function readIfPresent(relative) {
  const full = join(root, relative)
  return existsSync(full) ? readFileSync(full, 'utf8') : ''
}

/** 所有技能的正文，按技能名索引。 */
function skillBodies() {
  const bodies = new Map()
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    bodies.set(entry.name, readIfPresent(join('skills', entry.name, 'SKILL.md')))
  }
  return bodies
}

/**
 * 收集引用量与体积，给出处置建议。
 * @returns {{ skill: string; refs: number; chars: number; density: number; advice: string }[]} 行
 */
export function collect() {
  const bodies = skillBodies()
  const evidence = EVIDENCE_FILES.map((file) => readIfPresent(file)).join('\n')
  const rows = []
  for (const [skill, body] of bodies) {
    // 证据面 + 其它技能正文（排除自己，否则每个技能都至少给自己计一次）
    const others = [...bodies.entries()]
      .filter(([name]) => name !== skill)
      .map(([, text]) => text)
      .join('\n')
    const refs = countUsage(evidence, skill) + countUsage(others, skill)
    const chars = [...body].length
    const density = chars === 0 ? 0 : (refs * 1000) / chars
    rows.push({
      skill,
      refs,
      chars,
      density: Math.round(density * 100) / 100,
      advice: advise(refs, chars, density),
    })
  }
  return rows.sort((left, right) => left.refs - right.refs || right.chars - left.chars)
}

/**
 * 给出一行处置建议。
 * @param {number} refs - 引用次数
 * @param {number} chars - 正文字符数
 * @param {number} density - 每千字引用数
 * @returns {string} 建议
 */
export function advise(refs, chars, density) {
  if (refs < THRESHOLDS.unused) return '合并候选：没有任何引用，考虑并入相邻技能'
  if (chars > THRESHOLDS.heavy && refs >= 3) return '保持：正文大但确实常用，优先拆 references'
  if (density < THRESHOLDS.dense) return '留意：引用密度偏低，正文可能有可删的铺陈'
  return '保持'
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 无合并候选、1 存在合并候选（--strict 时）
 */
export function main(argv) {
  const rows = collect()
  process.stdout.write('技能              引用  正文   密度   建议\n')
  for (const row of rows) {
    process.stdout.write(
      `${row.skill.padEnd(18)}${String(row.refs).padStart(4)}${String(row.chars).padStart(6)}${String(row.density).padStart(7)}   ${row.advice}\n`,
    )
  }
  const candidates = rows.filter((row) => row.refs < THRESHOLDS.unused)
  process.stdout.write(
    candidates.length === 0
      ? '没有零引用技能，无需合并\n'
      : `零引用技能 ${candidates.length} 个：${candidates.map((row) => row.skill).join('、')}\n`,
  )
  return argv.includes('--strict') && candidates.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
