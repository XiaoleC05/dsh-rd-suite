#!/usr/bin/env node
/**
 * 近似重复检测（SimHash）：把一段话换个说法，dup-check 就查不出来了。
 *
 * 做法：SimHash 快速筛（64 位指纹 + 汉明距离），再用 bigram 集合的 Jaccard 相似度判定。
 *
 * 用法：node scripts/near-dup.mjs [--root <项目目录>] [--strict]
 *
 * 能力边界（实测）：抓得到机械改写（换标点、调语序、增删少量词）；
 * 抓不到深度同义改写——实测「推送失败时先用…」改成「推送失败的时候先…」bigram Jaccard 只有 0.318。
 * 深度改写靠人工与 aigc-check 的水平，字面算法给不了保证。
 *
 * 思路参考（不引依赖，全部自实现）：
 *   https://github.com/yanyiwu/simhash
 *   https://github.com/1e0ng/simhash
 *   https://github.com/ekzhu/datasketch   （MinHash / LSH 的同类问题）
 *   https://github.com/ChenghaoMou/text-dedup（去重流水线的组织方式）
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { defaultDocuments } from '../lib/doc-set.js'
import { documentsUnder, relativeTo, resolveRoot } from './lib/scan-root.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 指纹位数与默认汉明距离阈值。 */
export const BITS = 64n
export const DEFAULT_DISTANCE = 6
/** bigram Jaccard 相似度阈值：机械改写通常远高于它，深度改写通常远低于它。 */
export const DEFAULT_SIMILARITY = 0.55

/**
 * FNV-1a 64 位哈希（BigInt）。
 * @param {string} text - 文本
 * @returns {bigint} 哈希
 */
export function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n
  for (const char of String(text)) {
    hash ^= BigInt(char.codePointAt(0))
    hash = (hash * 0x100000001b3n) & ((1n << BITS) - 1n)
  }
  return hash
}

/**
 * 按 3 字滑窗切 shingle，去掉空白与标点。
 * @param {string} text - 文本
 * @returns {string[]} shingle
 */
export function shingles(text) {
  const flat = String(text ?? '').replace(/[\s，。；：、（）「」【】`|#*>\-—…·]/gu, '')
  const size = 3
  const out = []
  for (let index = 0; index + size <= flat.length; index += 1)
    out.push(flat.slice(index, index + size))
  return out
}

/**
 * 计算 64 位 SimHash 指纹。
 * @param {string} text - 文本
 * @returns {bigint} 指纹
 */
export function simhash(text) {
  const weights = new Array(Number(BITS)).fill(0)
  for (const shingle of shingles(text)) {
    const hash = fnv1a64(shingle)
    for (let bit = 0; bit < Number(BITS); bit += 1) {
      const mask = 1n << BigInt(bit)
      weights[bit] += (hash & mask) === 0n ? -1 : 1
    }
  }
  let fingerprint = 0n
  for (let bit = 0; bit < Number(BITS); bit += 1) {
    if (weights[bit] > 0) fingerprint |= 1n << BigInt(bit)
  }
  return fingerprint
}

/**
 * 两个指纹的汉明距离。
 * @param {bigint} left - 指纹一
 * @param {bigint} right - 指纹二
 * @returns {number} 距离
 */
export function hammingDistance(left, right) {
  let diff = left ^ right
  let count = 0
  while (diff > 0n) {
    count += Number(diff & 1n)
    diff >>= 1n
  }
  return count
}

/**
 * 两段文本的 bigram 集合 Jaccard 相似度。
 * 比 trigram 稳：中文 3 字窗口对改写太敏感，实测同一段话改写后只剩 0.213。
 * @param {string} left - 文本一
 * @param {string} right - 文本二
 * @returns {number} 相似度 0–1
 */
export function similarity(left, right) {
  const setOf = (text) => {
    const flat = String(text ?? '').replace(/[\s，。；：、（）「」【】`|#*>\-—…·]/gu, '')
    const out = new Set()
    for (let index = 0; index + 2 <= flat.length; index += 1) out.add(flat.slice(index, index + 2))
    return out
  }
  const a = setOf(left)
  const b = setOf(right)
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared += 1
  return Math.round((shared / (a.size + b.size - shared)) * 1000) / 1000
}

/**
 * 按空行切段，跳过标题、列表、引用、表格与代码块。
 * @param {string} text - 文档
 * @returns {{ line: number; text: string }[]} 段落
 */
export function paragraphs(text) {
  const lines = String(text ?? '').split(/\r?\n/u)
  const out = []
  let buffer = []
  let start = 0
  const isSkip = (line) => /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|<!--)/u.test(line.trim())
  const flush = () => {
    const joined = buffer.join(' ').trim()
    // 20 字起参与比对：门槛过高会把常见短段落整段漏掉。
    if ([...joined].length >= 20) out.push({ line: start, text: joined })
    buffer = []
  }
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') {
      flush()
      continue
    }
    if (isSkip(line)) {
      flush()
      continue
    }
    if (buffer.length === 0) start = index + 1
    buffer.push(line.trim())
  }
  flush()
  return out
}

/**
 * 找出近似重复的段落对。
 * @param {{ path: string; text: string }[]} documents - 文档
 * @param {{ distance?: number }} [options] - 选项
 * @returns {{ left: string; right: string; distance: number; similarity: number }[]} 近似对
 */
export function findNearDuplicates(documents, options = {}) {
  const distance = options.distance ?? DEFAULT_DISTANCE
  const minSimilarity = options.minSimilarity ?? DEFAULT_SIMILARITY
  const items = []
  for (const document of documents) {
    for (const paragraph of paragraphs(document.text)) {
      items.push({
        where: `${document.path}:${paragraph.line}`,
        fingerprint: simhash(paragraph.text),
        text: paragraph.text,
      })
    }
  }
  const pairs = []
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const delta = hammingDistance(items[left].fingerprint, items[right].fingerprint)
      // 先用指纹快速筛掉明显不同的，再用相似度确认。
      if (delta > 24) continue
      const score = similarity(items[left].text, items[right].text)
      if (score >= minSimilarity) {
        pairs.push({
          left: items[left].where,
          right: items[right].where,
          distance: delta,
          similarity: score,
        })
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity || a.distance - b.distance)
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 没有近似重复、1 有（--strict 时）
 */
export function main(argv) {
  const { root: scanRoot, rest } = resolveRoot(argv, root)
  const external = scanRoot !== root
  const given = rest.filter((argument) => !argument.startsWith('--'))
  // 指向外部项目时，默认扫那个项目的文档；本仓库维持原行为。
  const targets = given.length > 0
    ? given.map((path) => (path.includes(':') || path.startsWith('/') ? path : join(scanRoot, path)))
    : external
      ? documentsUnder(scanRoot)
      : defaultDocuments().map((path) => join(root, path))
  const documents = targets.map((path) => ({ path: relativeTo(scanRoot, path), text: readFileSync(path, 'utf8') }))
  const pairs = findNearDuplicates(documents)
  process.stdout.write(`近似重复：比对 ${documents.length} 份文件，${pairs.length} 对\n`)
  for (const pair of pairs.slice(0, 10)) {
    process.stdout.write(
      `  ${pair.left} ↔ ${pair.right}  相似度 ${pair.similarity} / 距离 ${pair.distance}\n`,
    )
  }
  return argv.includes('--strict') && pairs.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
