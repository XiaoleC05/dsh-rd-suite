#!/usr/bin/env node
/**
 * CI 覆盖度：workflow 里到底跑了哪几件事，和本地门禁对不对得上。
 *
 * 此前只有一条手写断言盯着我们自己的 checks.yml；换个仓库、改个 workflow 结构就失效，
 * 也回答不了「CI 覆盖了哪几道门禁」。这里把 CI 的 run 命令抽出来做映射。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 必须被 CI 覆盖的三件事：构建产物、测试、全量门禁。
 * key 是给人看的名字，test 是判定「这条 CI 命令算覆盖了它」的规则。
 */
export const REQUIRED_COVERAGE = [
  { key: '构建产物', test: (command) => /build-client\.mjs/u.test(command) },
  { key: '测试套件', test: (command) => /node --test/u.test(command) },
  { key: '全量门禁', test: (command) => /preflight\.mjs/u.test(command) },
]

/**
 * 去掉 YAML 标量的外层引号：只在首尾是同一个引号时剥掉，避免截掉命令内部的引号。
 * @param {string} value - 原始值
 * @returns {string} 去引号后的值
 */
function unquote(value) {
  const trimmed = String(value).trim()
  if (trimmed.length < 2) return trimmed
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first === '"' || first === "'") && first === last) return trimmed.slice(1, -1)
  return trimmed
}

/**
 * 从 workflow 文本里抽 run 命令。
 * @param {string} yamlText - workflow 内容
 * @returns {string[]} 命令（去掉 YAML 引号与首尾空白）
 */
export function extractRunCommands(yamlText) {
  const lines = String(yamlText ?? '').split(/\r?\n/u)
  const commands = []
  for (const [index, line] of lines.entries()) {
    // 三种写法都认：'- run: cmd'、'run: cmd'、'run:' 换行写命令。
    const match = /^\s*(?:-\s*)?run:\s*(.*)$/u.exec(line)
    if (match === null) continue
    const inline = unquote(match[1])
    if (inline !== '') {
      commands.push(inline)
      continue
    }
    const next = unquote(lines[index + 1] ?? '')
    if (next !== '' && !next.startsWith('#')) commands.push(next)
  }
  return commands
}

/**
 * 计算覆盖度。
 * @param {string[]} commands - CI 命令
 * @returns {{ key: string; covered: boolean; by: string | null }[]} 覆盖结果
 */
export function compareCoverage(commands) {
  return REQUIRED_COVERAGE.map((item) => {
    const hit = commands.find((command) => item.test(command))
    return { key: item.key, covered: hit !== undefined, by: hit ?? null }
  })
}

/**
 * 读仓库里所有 workflow（没有则返回空数组）。
 * @returns {{ file: string; text: string }[]} workflow 文件
 */
export function readWorkflows() {
  const directory = join(root, '.github', 'workflows')
  let names = []
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => ({
      file: `.github/workflows/${name}`,
      text: readFileSync(join(directory, name), 'utf8'),
    }))
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 全覆盖、1 有缺项
 */
export function main(argv) {
  const workflows = readWorkflows()
  if (workflows.length === 0) {
    process.stdout.write('仓库里没有 .github/workflows，跳过 CI 覆盖检查\n')
    return 0
  }
  const commands = workflows.flatMap((workflow) => extractRunCommands(workflow.text))
  const coverage = compareCoverage(commands)
  const missing = coverage.filter((item) => !item.covered)

  for (const item of coverage) {
    process.stdout.write(
      `${item.covered ? '覆盖' : '缺失'}  ${item.key}${item.by === null ? '' : `：${item.by}`}\n`,
    )
  }
  process.stdout.write(
    missing.length === 0
      ? `CI 覆盖 ${coverage.length} 项，与本地门禁一致\n`
      : `CI 缺 ${missing.length} 项：${missing.map((item) => item.key).join('、')}\n`,
  )
  return argv.includes('--strict') && missing.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
