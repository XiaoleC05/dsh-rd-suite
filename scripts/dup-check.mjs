#!/usr/bin/env node
/**
 * 跨文件重复段落检测：降重的另一半。
 *
 * AIGC 分数只看单个文件的文风，管不了「同一段话在三个文档里各写一遍」。
 * 这里按空行把文档切段，跳过标题、列表、引用与代码块，再用归一化文本比对。
 *
 * 用法：
 *   node scripts/dup-check.mjs docs/*.md README.md
 *   node scripts/dup-check.mjs --min-length 60 --json docs/*.md
 */

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** 不属于正文段落的前缀：标题、列表、引用、表格、代码围栏、HTML 注释。 */
const NON_PARAGRAPH = /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|<!--)/u

/**
 * 把文档切成候选段落。
 * @param {string} text - 文档内容
 * @returns {{ line: number; text: string }[]} 段落与起始行号
 */
export function splitParagraphs(text) {
  const paragraphs = []
  let buffer = []
  let startLine = 0
  let inFence = false

  const flush = () => {
    if (buffer.length === 0) return
    const body = buffer.join(' ').trim()
    if (body !== '' && !NON_PARAGRAPH.test(body)) paragraphs.push({ line: startLine, text: body })
    buffer = []
  }

  for (const [index, raw] of String(text ?? '')
    .split(/\r?\n/u)
    .entries()) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      flush()
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (line === '') {
      flush()
      continue
    }
    if (NON_PARAGRAPH.test(line)) {
      flush()
      continue
    }
    if (buffer.length === 0) startLine = index + 1
    buffer.push(line)
  }
  flush()
  return paragraphs
}

/**
 * 归一化：去空白、标点与大小写差异，便于跨文件比对。
 * 保留中日韩文字与字母数字，其余字符一律丢弃。
 * @param {string} text - 原文
 * @returns {string} 归一化结果
 */
export function normalizeParagraph(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\u3000]+/gu, '')
    .replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-z0-9]/gu, '')
}

/**
 * 找出重复段落。
 * @param {{ path: string; text: string }[]} documents - 待比对文档
 * @param {{ minLength?: number }} [options] - 归一化后的最短长度，默认 40
 * @returns {{ key: string; preview: string; occurrences: { path: string; line: number }[] }[]} 重复段落
 */
export function findDuplicates(documents, options = {}) {
  const minLength =
    Number.isFinite(options.minLength) && options.minLength > 0 ? options.minLength : 40
  const index = new Map()
  for (const document of documents) {
    for (const paragraph of splitParagraphs(document.text)) {
      const key = normalizeParagraph(paragraph.text)
      if (key.length < minLength) continue
      const entry = index.get(key) ?? { key, preview: paragraph.text.slice(0, 80), occurrences: [] }
      entry.occurrences.push({ path: document.path, line: paragraph.line })
      index.set(key, entry)
    }
  }
  return [...index.values()]
    .filter((entry) => entry.occurrences.length > 1)
    .sort((left, right) => right.occurrences.length - left.occurrences.length)
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 无重复、1 有重复、2 用法错误
 */
export function main(argv) {
  const json = argv.includes('--json')
  const minIndex = argv.indexOf('--min-length')
  const minLength = minIndex >= 0 ? Number(argv[minIndex + 1]) : undefined
  const files = argv.filter(
    (argument) =>
      !argument.startsWith('--') &&
      argument !== String(minLength ?? '') &&
      argument !== 'undefined',
  )
  if (files.length === 0) {
    process.stdout.write('用法: node scripts/dup-check.mjs <文件...> [--min-length N] [--json]\n')
    return 2
  }
  const documents = files.map((path) => ({ path, text: readFileSync(path, 'utf8') }))
  const duplicates = findDuplicates(documents, { minLength })
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ documents: documents.length, duplicates }, null, 2)}\n`,
    )
  } else if (duplicates.length === 0) {
    process.stdout.write(`比对 ${documents.length} 个文件，没有重复段落\n`)
  } else {
    process.stdout.write(`比对 ${documents.length} 个文件，发现 ${duplicates.length} 处重复：\n`)
    for (const duplicate of duplicates) {
      const where = duplicate.occurrences.map((item) => `${item.path}:${item.line}`).join('、')
      process.stdout.write(`  ${where}\n    ${duplicate.preview}…\n`)
    }
  }
  return duplicates.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
