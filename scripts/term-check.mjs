#!/usr/bin/env node
/**
 * 术语一致性检查：同一个概念只用一种写法。
 *
 * 词表放在 docs/glossary.json，规则是「canonical ← variants」：
 * 出现 variants 里的写法就报出来，并给出应改成的 canonical。
 * 表可以随项目长大，不必改脚本。
 *
/** 用法：
 *   node scripts/term-check.mjs README.md docs/DESIGN.md skills/rd-copy/SKILL.md
 *   node scripts/term-check.mjs --json README.md
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { defaultDocuments } from '../lib/doc-set.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))


/**
 * 读取词表。
 * @param {string} [file] - 词表路径，默认仓库内的 docs/glossary.json
 * @returns {{ canonical: string; variants: string[]; note?: string }[]} 规则
 */
export function loadGlossary(file = join(root, 'docs', 'glossary.json')) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  const rules = Array.isArray(parsed?.rules) ? parsed.rules : []
  return rules.filter(
    (rule) =>
      typeof rule?.canonical === 'string' &&
      Array.isArray(rule.variants) &&
      rule.variants.length > 0,
  )
}

/** 正则元字符转义。 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * 在给定文件里查找术语变体。
 * @param {{ path: string; text: string }[]} files - 待查文件
 * @param {{ canonical: string; variants: string[] }[]} rules - 词表规则
 * @returns {{ path: string; line: number; variant: string; canonical: string }[]} 命中
 */
export function findVariants(files, rules) {
  const hits = []
  for (const file of files) {
    const lines = String(file.text ?? '').split(/\r?\n/u)
    for (const rule of rules) {
      for (const variant of rule.variants) {
        const pattern = new RegExp(escapeRegExp(variant), 'gu')
        for (const [index, line] of lines.entries()) {
          pattern.lastIndex = 0
          if (!pattern.test(line)) continue
          hits.push({ path: file.path, line: index + 1, variant, canonical: rule.canonical })
        }
      }
    }
  }
  return hits
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 无不一致、1 有不一致、2 用法错误
 */
export function main(argv) {
  const given = argv.filter((argument) => !argument.startsWith('--'))
  const files = given.length > 0 ? given : defaultDocuments()
  if (files.length === 0) {
    process.stdout.write('用法: node scripts/term-check.mjs <文件...> [--json]\n')
    return 2
  }
  const rules = loadGlossary()
  const hits = findVariants(
    files.map((path) => ({ path, text: readFileSync(path, 'utf8') })),
    rules,
  )
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ rules: rules.length, hits }, null, 2)}\n`)
  } else if (hits.length === 0) {
    process.stdout.write(`术语一致：${files.length} 个文件、${rules.length} 条规则，没有命中变体\n`)
  } else {
    process.stdout.write(`发现 ${hits.length} 处术语不一致：\n`)
    for (const hit of hits) {
      process.stdout.write(`  ${hit.path}:${hit.line} 「${hit.variant}」→ 「${hit.canonical}」\n`)
    }
  }
  return hits.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
