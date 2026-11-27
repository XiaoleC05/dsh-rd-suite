#!/usr/bin/env node
/**
 * 单轮评估报告：把「这轮算不算进步」的判断建立在可复现的数字上。
 *
 * 四段结构：
 *   ① 本轮做了什么（账本行 + 涉及文件数）
 *   ② 验证数据（用例、门禁、宪章体积、文档最低分、漂移与打包缺口）
 *   ③ 正向判据（五条逐项勾选，判据来自协议文档的约定）
 *   ④ 结论（脚本只给提示，判断由写报告的人负责）
 *
 * 用法：
 *   node scripts/round-report.mjs 44
 *   node scripts/round-report.mjs 44 --json
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { collectHealth } from './health.mjs'
import { runPreflight } from './preflight.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const LEDGER = join(root, 'docs', 'ITERATIONS.md')

/** 正向判据：与 docs/ITERATION.md 的「正向五条」一一对应。 */
export const POSITIVE_CRITERIA = [
  '用例数没有减少',
  '门禁没有新增失败项',
  '证据可复现（命令与输出都在报告里）',
  '改动落在本轮模块范围内',
  '提交与推送都成功',
]

/**
 * 拼出报告文本。
 * @param {{ round: number; ledgerRow: { issue: string; note: string } | null; files: number; health: object; gates: { name: string; ok: boolean; detail: string }[] }} evidence - 证据
 * @returns {string} Markdown 报告
 */
export function buildRoundReport(evidence) {
  const { round, ledgerRow, files, health, gates } = evidence
  const docScores = Array.isArray(health.docScores) ? health.docScores : []
  const lowest = docScores.reduce(
    (min, item) => (item.score < min.score ? item : min),
    docScores[0] ?? { path: '—', score: 0 },
  )
  const failing = gates.filter((gate) => !gate.ok)

  return [
    `## 第 ${round} 轮评估`,
    '',
    '### ① 本轮做了什么',
    '',
    ledgerRow === null
      ? `_账本里还没有第 ${round} 轮的行：先 node scripts/ledger.mjs --append-round 补上_`
      : `- 记录：${ledgerRow.note}`,
    `- 涉及文件：${files} 个`,
    '',
    '### ② 验证数据',
    '',
    `| 项 | 值 |`,
    `|---|---|`,
    `| 用例数 | ${health.tests?.cases ?? '未提供'} |`,
    `| 测试文件 | ${health.tests?.files ?? '未提供'} |`,
    `| 交付门禁 | ${gates.length === 0 ? '未提供' : failing.length === 0 ? `${gates.length} 项全过` : `${failing.map((gate) => gate.name).join('、')} 未过`} |`,
    `| 宪章字符 | ${health.charter ?? '未提供'} |`,
    `| 文档最低分 | ${lowest.path} ${lowest.score} |`,
    `| 术语漂移 | ${health.drifted?.length ?? '未提供'} |`,
    `| 打包缺口 | ${health.packagingGaps?.length === 0 ? '无' : (health.packagingGaps?.join('、') ?? '未提供')} |`,
    '',
    '### ③ 正向判据',
    '',
    ...POSITIVE_CRITERIA.map((criterion, index) => `${index + 1}. ${criterion} —— 待勾选`),
    '',
    '### ④ 结论',
    '',
    failing.length === 0
      ? '数据面上没有退化项；请补一句「本轮具体解决了什么问题」，再判定是否计入。'
      : `仍有 ${failing.length} 项门禁未过：先修掉再判定，负面迭代不计入轮次。`,
    '',
  ].join('\n')
}

/**
 * 从账本里取某一轮的记录文字。
 * @param {string} ledgerText - 账本内容
 * @param {number} round - 轮次
 * @returns {{ issue: string; note: string } | null} 记录
 */
export function findRoundRow(ledgerText, round) {
  const line = String(ledgerText ?? '')
    .split('\n')
    .find((candidate) => new RegExp(`^\\|\\s*第\\s*${round}\\s*轮\\s*\\|`, 'u').test(candidate))
  if (line === undefined) return null
  const cells = line
    .split('|')
    .slice(2, -1)
    .map((cell) => cell.trim())
  return { issue: cells[0] ?? '', note: cells.slice(1).join(' · ') }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {Promise<number>} 退出码：0 生成成功、2 用法错误
 */
export async function main(argv) {
  const round = Number(argv.find((argument) => /^\d+$/u.test(argument)))
  if (!Number.isInteger(round) || round <= 0) {
    process.stdout.write('用法: node scripts/round-report.mjs <轮次> [--json]\n')
    return 2
  }

  const health = collectHealth()
  const ledgerRow = findRoundRow(readFileSync(LEDGER, 'utf8'), round)
  // 门禁真跑一遍：报告里的「门禁」一行必须来自实际运行，不是默认值。
  const { gates } = await runPreflight()
  const evidence = {
    round,
    ledgerRow,
    files: health.tests?.files ?? 0,
    health,
    gates: gates.map((gate) => ({ name: gate.name, ok: gate.ok, detail: gate.detail })),
  }

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
    return 0
  }
  process.stdout.write(buildRoundReport(evidence))
  return gates.every((gate) => gate.ok) ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
