#!/usr/bin/env node
/**
 * 文档示例命令的校验：脚本还在不在、参数还认不认。
 *
 * 文档里的 `node scripts/xxx.mjs --flag` 会随代码一起腐坏：脚本改名、参数改写，
 * 文档不会自己跟着变，照敲就报错。这里把示例当代码对待，扫一遍。
 *
 * 带 <占位符> 的命令跳过——它们是模板，不是可执行示例。
 *
 * 用法：
 *   node scripts/doc-cmd-check.mjs
 *   node scripts/doc-cmd-check.mjs --json
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 默认要检查的文档。 */
export const DOCUMENTS = ['docs/ITERATION.md', 'docs/CHECKLIST.md', 'README.md']

/**
 * 从 Markdown 里抽出 `node scripts/...` 命令。
 * @param {string} markdown - 文档内容
 * @returns {{ line: number; command: string }[]} 命令与所在行号
 */
export function extractCommands(markdown) {
  const found = []
  let inFence = false
  for (const [index, raw] of String(markdown ?? '')
    .split(/\r?\n/u)
    .entries()) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (!inFence) continue
    if (!line.startsWith('node scripts/')) continue
    found.push({ line: index + 1, command: line })
  }
  return found
}

/**
 * 校验一条命令。
 * @param {{ line: number; command: string }} entry - 命令
 * @param {{ exists: (path: string) => boolean; readSource: (path: string) => string }} fs - 文件系统能力
 * @returns {{ line: number; command: string; ok: boolean; reason: string }} 结论
 */
export function checkCommand(entry, fs) {
  const parts = entry.command.split(/\s+/u).filter((part) => part !== '')
  const script = parts[1]
  if (script === undefined) return { ...entry, ok: false, reason: '命令里没有脚本路径' }
  if (!fs.exists(script)) return { ...entry, ok: false, reason: `脚本不存在：${script}` }

  const placeholders = parts.filter((part) => part.startsWith('<') || part.includes('<'))
  if (placeholders.length > 0)
    return { ...entry, ok: true, reason: '模板命令（含占位符），跳过参数校验' }

  const source = fs.readSource(script)
  const flags = parts.filter((part) => part.startsWith('--'))
  for (const flag of flags) {
    const bare = flag.split('=')[0]
    if (!source.includes(bare))
      return { ...entry, ok: false, reason: `脚本里没有这个参数：${bare}` }
  }
  return { ...entry, ok: true, reason: '脚本与参数都存在' }
}

/**
 * 检查一组文档。
 * @param {{ path: string; text: string }[]} documents - 文档
 * @param {{ exists: (path: string) => boolean; readSource: (path: string) => string }} fs - 文件系统能力
 * @returns {{ results: object[]; problems: object[] }} 结论
 */
export function checkDocuments(documents, fs) {
  const results = []
  for (const document of documents) {
    for (const entry of extractCommands(document.text)) {
      results.push({ document: document.path, ...checkCommand(entry, fs) })
    }
  }
  return { results, problems: results.filter((item) => !item.ok) }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 无问题、1 有问题
 */
export function main(argv) {
  const fs = {
    exists: (path) => existsSync(join(root, path)),
    readSource: (path) => readFileSync(join(root, path), 'utf8'),
  }
  const documents = DOCUMENTS.filter((path) => existsSync(join(root, path))).map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }))
  const { results, problems } = checkDocuments(documents, fs)

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ checked: results.length, problems }, null, 2)}\n`)
  } else if (problems.length === 0) {
    process.stdout.write(`文档示例命令 ${results.length} 条，全部有效\n`)
  } else {
    process.stdout.write(`发现 ${problems.length} 条失效示例：\n`)
    for (const problem of problems) {
      process.stdout.write(
        `  ${problem.document}:${problem.line} ${problem.command}\n    ${problem.reason}\n`,
      )
    }
  }
  return problems.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
