#!/usr/bin/env node
/**
 * 发布说明草稿：从 CHANGELOG 取版本块，按新增 / 修复 / 文档分桶，套用户向四段模板。
 *
 * 机器能做的只有分桶与套壳；「一句话变化」和「需要你做什么」得人来写，
 * 所以这两段留成占位，而不是让脚本编。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const changelogFile = join(root, 'docs', 'CHANGELOG.md')

/** 分桶规则：命中关键词就归到对应桶。 */
export const BUCKETS = [
  { key: '新增', test: (line) => /新增|加入|支持/u.test(line) },
  { key: '修复', test: (line) => /修复|修正|改掉|不再/u.test(line) },
  { key: '文档与流程', test: (line) => /文档|说明|模板|README|CHANGELOG/u.test(line) },
]

/**
 * 抽出一个版本的条目。
 * @param {string} text - CHANGELOG 内容
 * @param {string} [version] - 版本号；省略则取最新
 * @returns {{ version: string; items: string[] }} 版本块
 */
export function versionBlock(text, version) {
  const lines = String(text ?? '').split(/\r?\n/u)
  const starts = []
  for (const [index, line] of lines.entries()) {
    const match = /^##\s+(\d+\.\d+\.\d+)/u.exec(line.trim())
    if (match !== null) starts.push({ index, version: match[1] })
  }
  if (starts.length === 0) return { version: '', items: [] }
  const chosen = version === undefined ? starts[0] : starts.find((item) => item.version === version)
  if (chosen === undefined) return { version: version ?? '', items: [] }
  const next = starts.find((item) => item.index > chosen.index)
  const body = lines.slice(chosen.index + 1, next === undefined ? lines.length : next.index)
  const items = body.map((line) => line.trim()).filter((line) => line.startsWith('- '))
  return { version: chosen.version, items }
}

/**
 * 把条目分桶。
 * @param {string[]} items - 条目
 * @returns {{ key: string; items: string[] }[]} 分桶结果
 */
export function groupItems(items) {
  const groups = new Map(BUCKETS.map((bucket) => [bucket.key, []]))
  const rest = []
  for (const item of items) {
    const hit = BUCKETS.find((bucket) => bucket.test(item))
    if (hit === undefined) rest.push(item)
    else groups.get(hit.key).push(item)
  }
  if (rest.length > 0) groups.set('其他', rest)
  return [...groups.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key, items: list }))
}

/**
 * 生成草稿。
 * @param {{ version: string; items: string[] }} block - 版本块
 * @returns {string} 草稿
 */
export function draft(block) {
  const groups = groupItems(block.items)
  const lines = [
    `# ${block.version} 发布说明`,
    '',
    '## 一句话变化',
    '',
    '<一句话说清用户能感知到的那件事>',
    '',
    '## 你会遇到什么不同',
    '',
  ]
  if (groups.length === 0) lines.push('<这个版本没有条目，检查 CHANGELOG>')
  for (const group of groups) {
    lines.push(`### ${group.key}`)
    for (const item of group.items) lines.push(item)
    lines.push('')
  }
  lines.push(
    '## 需要你做什么',
    '',
    '<要改配置 / 重跑命令就逐条列出；不用动手写「无需操作」>',
    '',
    '## 已知问题',
    '',
    '<没有就写「已知问题：无」>',
    '',
  )
  return lines.join('\n')
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 生成成功、1 找不到版本
 */
export function main(argv) {
  const index = argv.indexOf('--version')
  const version = index === -1 ? undefined : argv[index + 1]
  const block = versionBlock(readFileSync(changelogFile, 'utf8'), version)
  if (block.items.length === 0) {
    process.stdout.write(`CHANGELOG 里没有该版本的条目：${version ?? '（最新）'}\n`)
    return 1
  }
  process.stdout.write(draft(block))
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
