#!/usr/bin/env node
/**
 * 源码重复检测（jscpd 包装）：同一段逻辑在几个文件里各写一份时才会暴露。
 *
 * 依赖外部工具 jscpd（用 npx 拉取，首次需联网）。
 *
 * 用法：node scripts/code-dup.mjs [--root <项目目录>] [--strict]
 *
 * 参考：https://github.com/kucherenko/jscpd
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { resolveRoot } = await import('./lib/scan-root.mjs')

/** 默认扫描的源码目录。 */
export const DEFAULT_PATHS = [
  'index.js',
  'lib',
  'code-pipeline',
  'github',
  'memory',
  'client-sources',
  'scripts',
]

/** 默认阈值：重复行占比超过它就算不通过。 */
export const DEFAULT_THRESHOLD = 3

/**
 * 解析 jscpd 的 JSON 报告。
 * @param {unknown} report - JSON 报告
 * @returns {{ percentage: number; lines: number; duplicatedLines: number; clones: number; blocks: { from: string; to: string; lines: number; tokens: number }[] }} 摘要
 */
export function parseJscpdReport(report) {
  const total = report?.statistics?.total ?? {}
  const duplicates = Array.isArray(report?.duplicates) ? report.duplicates : []
  const blocks = duplicates
    .map((item) => ({
      from: `${String(item?.firstFile?.name ?? '?')}:${String(item?.firstFile?.start ?? '?')}`,
      to: `${String(item?.secondFile?.name ?? '?')}:${String(item?.secondFile?.start ?? '?')}`,
      lines: Number(item?.lines ?? 0),
      tokens: Number(item?.tokens ?? 0),
    }))
    .sort((left, right) => right.lines - left.lines)
  return {
    percentage: Number(total.percentage ?? 0),
    lines: Number(total.lines ?? 0),
    duplicatedLines: Number(total.duplicatedLines ?? 0),
    clones: Number(total.clones ?? duplicates.length),
    blocks,
  }
}

/**
 * 判定是否超阈值。
 * @param {{ percentage: number }} summary - 摘要
 * @param {number} [threshold] - 阈值百分比
 * @returns {boolean} 是否超阈值
 */
export function overThreshold(summary, threshold = DEFAULT_THRESHOLD) {
  return Number(summary?.percentage ?? 0) > threshold
}

/**
 * 跑一次 jscpd 并读回报告。
 * @param {{ paths?: string[]; minLines?: number; minTokens?: number }} [options] - 选项
 * @returns {{ percentage: number; lines: number; duplicatedLines: number; clones: number; blocks: { from: string; to: string; lines: number; tokens: number }[] }} 摘要
 */
export function runJscpd(options = {}) {
  const workingDir = options.root ?? root
  const paths = options.paths ?? DEFAULT_PATHS
  // 装了 devDependency 就用本地的（离线可复现）；没装才回落 npx。
  const localBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'jscpd.cmd' : 'jscpd')
  const useLocal = existsSync(localBin)
  const minLines = options.minLines ?? 10
  const minTokens = options.minTokens ?? 70
  const output = mkdtempSync(join(tmpdir(), 'jscpd-'))
  try {
    const command = useLocal ? localBin : process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const prefix = useLocal ? [] : ['--yes', 'jscpd@4']
    execFileSync(
      command,
      [
        ...prefix,
        '--min-lines',
        String(minLines),
        '--min-tokens',
        String(minTokens),
        '--reporters',
        'json',
        '--output',
        output,
        '--silent',
        ...paths,
      ],
      { cwd: workingDir, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32' },
    )
    return parseJscpdReport(JSON.parse(readFileSync(join(output, 'jscpd-report.json'), 'utf8')))
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 未超阈值、1 超阈值（--strict 时）
 */
export function main(argv) {
  const thresholdIndex = argv.indexOf('--threshold')
  const threshold = thresholdIndex === -1 ? DEFAULT_THRESHOLD : Number(argv[thresholdIndex + 1])
  const { root: scanRoot } = resolveRoot(argv, root)
  const summary = runJscpd(scanRoot === root ? {} : { root: scanRoot, paths: ['.'] })

  process.stdout.write(
    `源码重复：${summary.duplicatedLines}/${summary.lines} 行（${summary.percentage}%），${summary.clones} 个重复块\n`,
  )
  for (const block of summary.blocks.slice(0, 10)) {
    process.stdout.write(
      `  ${block.from} ↔ ${block.to}  ${block.lines} 行 / ${block.tokens} token\n`,
    )
  }
  if (overThreshold(summary, threshold)) {
    process.stdout.write(`超出阈值 ${threshold}%：把重复块抽成共享函数，或写清为什么不抽\n`)
    return argv.includes('--strict') ? 1 : 0
  }
  process.stdout.write(`在阈值 ${threshold}% 以内\n`)
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
