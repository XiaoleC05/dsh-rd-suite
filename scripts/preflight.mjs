#!/usr/bin/env node
/**
 * 交付前门禁：一条命令跑完五项检查。
 *
 * 五道关口各自有脚本，但人总会漏跑一两个。这里把它们串成一条命令，
 * 任一失败就整体失败，省掉「我记得好像跑过」这种判断。
 *
 * 用法：
 *   node scripts/preflight.mjs
 *   node scripts/preflight.mjs --skip-tests --json
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { analyze } from './aigc-check.mjs'
import { findDuplicates } from './dup-check.mjs'
import { findVariants, loadGlossary } from './term-check.mjs'
import { verifyPackage } from './verify-package.mjs'
import { smokeInstall } from './smoke-install.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 参与 AIGC 与重复检查的文档。 */
const DOCUMENTS = ['README.md', 'docs/DESIGN.md', 'docs/DETAIL.md', 'docs/CHANGELOG.md']

/** 参与术语检查的文本。 */
const TERM_TARGETS = [...DOCUMENTS, 'docs/CHECKLIST.md', 'docs/ITERATION.md']

/** 文档 AIGC 最低分。 */
export const MIN_DOC_SCORE = 80

/**
 * 汇总门禁结果。
 * @param {{ name: string; ok: boolean; detail: string }[]} gates - 各门禁结果
 * @returns {{ ok: boolean; passed: number; failed: string[] }} 结论
 */
export function summarizeGates(gates) {
  const failed = gates.filter((gate) => !gate.ok).map((gate) => gate.name)
  return { ok: failed.length === 0, passed: gates.length - failed.length, failed }
}

/** 文档 AIGC 门禁。 */
function docsGate() {
  const low = []
  for (const relative of DOCUMENTS) {
    const result = analyze(readFileSync(join(root, relative), 'utf8'))
    if (result.score < MIN_DOC_SCORE) low.push(`${relative} ${result.score} 分`)
  }
  return {
    name: '文档分数',
    ok: low.length === 0,
    detail:
      low.length === 0
        ? `${DOCUMENTS.length} 份都 ≥ ${MIN_DOC_SCORE}`
        : `低于阈值：${low.join('；')}`,
  }
}

/** 跨文件重复门禁。 */
function duplicateGate() {
  const duplicates = findDuplicates(
    DOCUMENTS.map((relative) => ({
      path: relative,
      text: readFileSync(join(root, relative), 'utf8'),
    })),
  )
  return {
    name: '重复段落',
    ok: duplicates.length === 0,
    detail: duplicates.length === 0 ? '没有重复段落' : `${duplicates.length} 处重复`,
  }
}

/** 术语一致性门禁。 */
function termGate() {
  const hits = findVariants(
    TERM_TARGETS.map((relative) => ({
      path: relative,
      text: readFileSync(join(root, relative), 'utf8'),
    })),
    loadGlossary(),
  )
  return {
    name: '术语一致',
    ok: hits.length === 0,
    detail:
      hits.length === 0 ? `${TERM_TARGETS.length} 份文本无变体` : `${hits.length} 处用了变体写法`,
  }
}

/** 打包校验门禁。 */
function packageGate() {
  const { problems, warnings } = verifyPackage()
  return {
    name: '打包校验',
    ok: problems.length === 0,
    detail: problems.length === 0 ? `通过（${warnings.length} 条提示）` : problems[0],
  }
}

/** 安装冒烟门禁。 */
async function smokeGate() {
  const { problems, files, tools, routes } = await smokeInstall()
  return {
    name: '安装冒烟',
    ok: problems.length === 0,
    detail: problems.length === 0 ? `${files} 文件 / ${tools} 工具 / ${routes} 路由` : problems[0],
  }
}

/**
 * 跑完全部门禁。
 * @returns {Promise<{ gates: { name: string; ok: boolean; detail: string }[]; summary: { ok: boolean; passed: number; failed: string[] } }>} 结果
 */
export async function runPreflight() {
  const gates = [docsGate(), duplicateGate(), termGate(), packageGate(), await smokeGate()]
  return { gates, summary: summarizeGates(gates) }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {Promise<number>} 退出码：0 全过、1 有失败
 */
export async function main(argv) {
  const result = await runPreflight()
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const gate of result.gates) {
      process.stdout.write(`${gate.ok ? '通过' : '失败'}  ${gate.name}：${gate.detail}\n`)
    }
    process.stdout.write(
      result.summary.ok
        ? `交付门禁全过（${result.summary.passed} 项）\n`
        : `交付门禁未过：${result.summary.failed.join('、')}\n`,
    )
  }
  return result.summary.ok ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
