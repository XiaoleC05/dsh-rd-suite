#!/usr/bin/env node
/**
 * 无证据断言审查：报告里说「已完成」「全部通过」，得能指出是哪次运行。
 *
 * 只看句子，不看文件是否存在——门禁查的是「是否真的做了」，这里查的是
 * 「有没有把没做说成做了」。
 */

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** 结论性断言：出现即要求附近有证据。 */
export const CLAIMS = [
  '已完成',
  '已修复',
  '已通过',
  '全部通过',
  '全过',
  '正常工作',
  '没有问题',
  '没问题',
  '应该可以',
  '基本可用',
  '验证通过',
]

/** 诚实标注：出现这些词说明作者已承认没做，不该被当成虚报。 */
export const HONEST = ['未验证', '未做', '未运行', '待确认', '没有验证', '不适用', '不影响']

/**
 * 判断一行是否有证据。
 * @param {string} line - 行
 * @returns {boolean} 是否有证据
 */
export function hasEvidence(line) {
  const text = String(line ?? '')
  if (/`[^`]+`/u.test(text)) return true // 命令或输出片段
  if (/\d+\s*(\/|%)/u.test(text)) return true // 通过比例或百分比
  if (/\bfail 0\b|# pass \d+/u.test(text)) return true // 测试输出
  if (/[\w./-]+:\d+/u.test(text)) return true // 文件:行
  if (/→/u.test(text)) return true // 箭头结果
  return false
}

/**
 * 审查一段文本。
 * @param {string} text - 文本
 * @returns {{ line: number; text: string; claim: string }[]} 无证据断言
 */
export function auditClaims(text) {
  const lines = String(text ?? '').split(/\r?\n/u)
  const findings = []
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (HONEST.some((word) => trimmed.includes(word))) continue
    const claim = CLAIMS.find((word) => trimmed.includes(word))
    if (claim === undefined) continue
    // 证据可以在同句、上一行或后三行：报告里常见「结论在上、证据隔一行再列」。
    const window = [lines[index - 1] ?? '', line, lines[index + 1] ?? '', lines[index + 2] ?? '', lines[index + 3] ?? '']
    if (window.some((candidate) => hasEvidence(candidate))) continue
    findings.push({ line: index + 1, text: trimmed, claim })
  }
  return findings
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 无发现、1 有发现（--strict 时）
 */
export function main(argv) {
  const files = argv.filter((item) => !item.startsWith('--'))
  if (files.length === 0) {
    process.stdout.write('用法：node scripts/claim-audit.mjs --strict 文件.md\n')
    return 0
  }
  let total = 0
  for (const file of files) {
    const findings = auditClaims(readFileSync(file, 'utf8'))
    total += findings.length
    for (const item of findings)
      process.stdout.write(`${file}:${item.line} 「${item.claim}」缺少证据：${item.text}\n`)
  }
  process.stdout.write(
    total === 0 ? `检查 ${files.length} 份文件：没有无证据断言\n` : `共 ${total} 处无证据断言\n`,
  )
  return argv.includes('--strict') && total > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
