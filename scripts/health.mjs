#!/usr/bin/env node
/**
 * 横向体检：每 10 轮跑一次，给出一组可复现的数字，避免「感觉这轮是进步」。
 *
 * 六项指标：宪章体积、技能数量与最大体积、测试文件与用例数、文档 AIGC 分数、
 * 打包清单覆盖、术语漂移（旧称还在文档里出现）。只读，不修改任何文件。
 *
 * 用法：
 *   node scripts/health.mjs
 *   node scripts/health.mjs --json
 *   node scripts/health.mjs --fail-on-drift
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { analyze } from './aigc-check.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 文档里不该再出现的旧称：改名后遗留的叫法。 */
export const LEGACY_TERMS = [
  { term: '开启 GitHub issue-first 设置', instead: 'GitHub 固定流程（无开关）' },
  { term: '代码修正页', instead: '代码修正标签页（页内标签）' },
  { term: 'PTC 模式：偏批量', instead: '执行方式（PTC）' },
  { term: 'autoCodeFix 可关闭', instead: '审计始终启用' },
]

/** 允许出现旧称的文件：历史记录与变更日志。 */
const ALLOWED = new Set([
  'docs/CHANGELOG.md',
  'docs/ITERATIONS.md',
  'docs/REFERENCES.md',
  'docs/ITERATION.md',
])

/**
 * 从 cordis.patch.yml 里量出宪章 prefix 的字符数。
 * 不引 YAML 依赖：定位 `prefix: |-` 到 `suffix:` 之间的块并按缩进去掉行首空格。
 * @param {string} text - patch 文本
 * @returns {number} 字符数
 */
export function charterChars(text) {
  const match = /prefix:\s*\|-\r?\n([\s\S]*?)\r?\n\s+suffix:/u.exec(text)
  if (match === null) return 0
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s{16}/u, ''))
    .join('\n')
    .trim().length
}

/**
 * 数一个文件里出现了多少次 test( 调用。
 * @param {string} text - 文件内容
 * @returns {number} 用例数
 */
export function countTests(text) {
  // 只认带字符串标题的 test(，避免把 test.skip 之类算进去。
  return (String(text).match(/^test\(\s*['"`]/gmu) ?? []).length
}

/**
 * 扫描术语漂移。
 * @param {{ path: string; text: string }[]} files - 待扫文件
 * @returns {{ path: string; term: string; instead: string; count: number }[]} 命中
 */
export function findLegacyTerms(files) {
  const found = []
  for (const file of files) {
    if (ALLOWED.has(file.path)) continue
    for (const legacy of LEGACY_TERMS) {
      const count = String(file.text).split(legacy.term).length - 1
      if (count > 0)
        found.push({ path: file.path, term: legacy.term, instead: legacy.instead, count })
    }
  }
  return found
}

/** 列目录下指定后缀的文件（相对路径）。 */
function walk(directory, extension, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = join(directory, entry.name)
    if (statSync(full).isDirectory()) walk(full, extension, found)
    else if (entry.name.endsWith(extension)) found.push(full)
  }
  return found
}

/**
 * 把体检结果压成一行台账（列与 docs/CHECKLIST.md 一致）。
 * @param {{ charter: number; tests: { cases: number }; skills: { largest: { name: string; chars: number } | null }; drifted: unknown[]; packagingGaps: string[] }} health - 体检结果
 * @param {{ from: number; to: number }} window - 轮次区间
 * @returns {string} 表格行
 */
export function formatRow(health, window) {
  const largest = health.skills.largest === null ? '无' : `${health.skills.largest.name} ${health.skills.largest.chars}`
  const drift = health.drifted.length === 0 ? '0' : String(health.drifted.length)
  const gaps = health.packagingGaps.length === 0 ? '无' : health.packagingGaps.join('、')
  return `| ${window.from}–${window.to} | ${health.charter} | ${health.tests.cases} | ${largest} | ${drift} | ${gaps} |`
}

/**
 * 从账本推出现在处于哪个十轮区间。
 * @param {string} ledgerText - docs/ITERATIONS.md 内容
 * @returns {{ from: number; to: number; lastRound: number }} 区间
 */
export function roundWindow(ledgerText) {
  const rounds = [...String(ledgerText ?? '').matchAll(/^\|\s*第\s*(\d+)\s*轮\s*\|/gmu)].map((match) => Number(match[1]))
  const lastRound = rounds.length === 0 ? 0 : Math.max(...rounds)
  const from = lastRound === 0 ? 1 : Math.floor((lastRound - 1) / 10) * 10 + 1
  return { from, to: from + 9, lastRound }
}

/**
 * 收集体检数据。
 * @returns {object} 结果
 */
export function collectHealth() {
  const read = (relative) => readFileSync(join(root, relative), 'utf8')
  const charter = charterChars(read('cordis.patch.yml'))

  const skills = readdirSync(join(root, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const text = readFileSync(join(root, 'skills', entry.name, 'SKILL.md'), 'utf8')
      const body = text.replace(/^---[\s\S]*?---\r?\n/u, '')
      return { name: entry.name, chars: body.length }
    })

  const testFiles = [
    ...walk(join(root, 'test'), '.test.mjs'),
    ...walk(join(root, 'code-pipeline', 'test'), '.test.mjs'),
    ...walk(join(root, 'github', 'test'), '.test.mjs'),
  ].map((full) =>
    full
      .slice(root.length + 1)
      .split('\\')
      .join('/'),
  )
  const testCount = testFiles.reduce((sum, relative) => sum + countTests(read(relative)), 0)

  const docs = ['README.md', 'docs/DESIGN.md', 'docs/DETAIL.md', 'docs/CHANGELOG.md']
  const docScores = docs.map((relative) => ({
    path: relative,
    score: analyze(read(relative)).score,
  }))

  const manifest = JSON.parse(read('package.json'))
  const packagingGaps = ['memory', 'skills', 'scripts', 'docs'].filter(
    (directory) => !manifest.files.includes(directory),
  )

  const drifted = findLegacyTerms([
    ...['README.md', 'docs/DESIGN.md', 'docs/DETAIL.md'].map((relative) => ({
      path: relative,
      text: read(relative),
    })),
    ...skills.map((skill) => ({
      path: `skills/${skill.name}/SKILL.md`,
      text: read(`skills/${skill.name}/SKILL.md`),
    })),
  ])

  return {
    charter,
    skills: { count: skills.length, largest: skills.sort((a, b) => b.chars - a.chars)[0] ?? null },
    tests: { files: testFiles.length, cases: testCount },
    docScores,
    packagingGaps,
    drifted,
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码
 */
export function main(argv) {
  const json = argv.includes('--json')
  const failOnDrift = argv.includes('--fail-on-drift')
  const health = collectHealth()
  if (argv.includes('--row')) {
    const window = roundWindow(readFileSync(join(root, 'docs', 'ITERATIONS.md'), 'utf8'))
    process.stdout.write(`${formatRow(health, window)}\n`)
    return health.drifted.length > 0 || health.packagingGaps.length > 0 ? 1 : 0
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(health, null, 2)}\n`)
  } else {
    process.stdout.write(`宪章 ${health.charter} 字符（目标 ≤ 5000）\n`)
    process.stdout.write(
      `技能 ${health.skills.count} 个，最大 ${health.skills.largest?.name} ${health.skills.largest?.chars} 字符\n`,
    )
    process.stdout.write(`测试 ${health.tests.files} 个文件 / ${health.tests.cases} 个用例\n`)
    for (const doc of health.docScores) process.stdout.write(`文档 ${doc.path}: ${doc.score} 分\n`)
    process.stdout.write(
      `打包缺口：${health.packagingGaps.length === 0 ? '无' : health.packagingGaps.join(', ')}\n`,
    )
    process.stdout.write(
      health.drifted.length === 0
        ? '术语漂移：无\n'
        : `术语漂移：${health.drifted.map((item) => `${item.path} 的「${item.term}」×${item.count}（应为「${item.instead}」）`).join('；')}\n`,
    )
  }
  const drifting = health.drifted.length > 0 || health.packagingGaps.length > 0
  return failOnDrift && drifting ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
