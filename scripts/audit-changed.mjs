#!/usr/bin/env node
/**
 * 只审计 git 改动过的文件：交付前的最后一道便宜检查。
 *
 * 与 `auditFiles` 的区别是文件来源——这里从 `git status --porcelain` 取改动，
 * 不扫全仓，也不依赖模型报告「我改了哪些」。
 *
 * 用法：
 *   node scripts/audit-changed.mjs --mode report
 *   node scripts/audit-changed.mjs --mode fix --json
 */

import { pathToFileURL } from 'node:url'

import { auditChanged, describeLanguageGroups } from '../code-pipeline/lib/audit.js'

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {Promise<number>} 退出码：0 无待修、1 有待修、2 用法错误
 */
export async function main(argv) {
  const json = argv.includes('--json')
  const mode = argv.includes('--mode') ? argv[argv.indexOf('--mode') + 1] : 'report'
  if (mode !== 'report' && mode !== 'fix') {
    process.stderr.write('用法: node scripts/audit-changed.mjs --mode report|fix [--json]\n')
    return 2
  }
  const audit = await auditChanged({ root: process.cwd(), mode })
  const summary = describeLanguageGroups(audit.byLanguage)
  if (json) {
    process.stdout.write(`${JSON.stringify({ ...audit, summary }, null, 2)}\n`)
  } else if (audit.checked === 0) {
    process.stdout.write('没有改动过的代码文件，无需审计\n')
  } else {
    process.stdout.write(
      `审计 ${audit.checked} 个改动文件（${summary || '未分组'}）：待修 ${audit.needsFix}、已修 ${audit.fixed}、未解决 ${audit.remaining}\n`,
    )
    for (const file of audit.files) process.stdout.write(`  ${file}\n`)
  }
  return audit.remaining > 0 ? 1 : 0
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1].replaceAll('\\\\', '/')}`
) {
  process.exitCode = await main(process.argv.slice(2))
}
