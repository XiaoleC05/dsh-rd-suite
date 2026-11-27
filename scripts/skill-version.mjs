#!/usr/bin/env node
/**
 * 技能版本：每个 SKILL.md 的 frontmatter 带 version，版本表由脚本生成。
 *
 * 手写版本表必然漂移：改了内容忘记升版本、升级了忘记改表。这里让表可以被重新生成与校验。
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const skillsDir = join(root, 'skills')
const tableFile = join(root, 'docs', 'SKILL-VERSIONS.md')

/** 版本表表头。 */
export const TABLE_HEADER = ['| 技能 | 版本 | 正文行数 |', '|---|---|---|']

/**
 * 校验语义化版本。
 * @param {string} value - 版本字符串
 * @returns {boolean} 是否合法
 */
export function isValidVersion(value) {
  return /^\d+\.\d+\.\d+$/u.test(String(value ?? ''))
}

/**
 * 升级版本号。
 * @param {string} current - 当前版本
 * @param {'patch' | 'minor' | 'major'} level - 级别
 * @returns {string} 新版本
 */
export function bump(current, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(current ?? ''))
  if (match === null) return '1.0.0'
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** 读一个 SKILL.md 的 frontmatter 与行数。 */
function readSkill(name) {
  const text = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)
  const fields = {}
  for (const line of (frontmatter?.[1] ?? '').split(/\r?\n/u)) {
    const field = /^([a-zA-Z_]+):\s*(.*)$/u.exec(line.trim())
    if (field !== null) fields[field[1]] = field[2].trim()
  }
  return { name, version: fields.version ?? '', lines: text.split(/\r?\n/u).length }
}

/**
 * 收集所有技能的版本。
 * @returns {{ name: string; version: string; lines: number }[]} 行
 */
export function collectVersions() {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSkill(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * 生成版本表文本。
 * @param {{ name: string; version: string; lines: number }[]} rows - 行
 * @returns {string} 表格
 */
export function renderTable(rows) {
  const lines = [
    '# 技能版本',
    '',
    '本表由 `node scripts/skill-version.mjs --write` 生成，不要手改。',
    '',
    ...TABLE_HEADER,
  ]
  for (const row of rows) lines.push(`| ${row.name} | ${row.version || '（缺）'} | ${row.lines} |`)
  return `${lines.join('\n')}\n`
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 一致、1 不一致或缺版本
 */
export function main(argv) {
  const rows = collectVersions()
  const invalid = rows.filter((row) => !isValidVersion(row.version))
  const rendered = renderTable(rows)

  if (argv.includes('--write')) {
    writeFileSync(tableFile, rendered)
    process.stdout.write(`已写入 docs/SKILL-VERSIONS.md（${rows.length} 个技能）\n`)
  }

  let current = ''
  try {
    current = readFileSync(tableFile, 'utf8')
  } catch {
    current = ''
  }

  if (invalid.length > 0) {
    for (const row of invalid)
      process.stdout.write(`缺版本或格式非法：${row.name}（${row.version || '空'}）\n`)
    return 1
  }
  if (!argv.includes('--write')) {
    if (current !== rendered) {
      process.stdout.write('版本表与 SKILL.md 不一致：跑 node scripts/skill-version.mjs --write\n')
      return 1
    }
    process.stdout.write(`版本表一致（${rows.length} 个技能）\n`)
  }
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
