#!/usr/bin/env node
/**
 * 工具清单对账：源码里注册了什么，文档里写了什么。
 *
 * 两侧都不检查的话，新工具会漏写、删掉的工具会留在文档里，用户照文档找工具就找不到。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 声明工具的源码位置。 */
export const SOURCES = ['memory/index.js', 'github/index.js', 'code-pipeline/index.js', 'index.js']

/** 文档里会列工具名的地方。 */
export const DOCUMENTS = ['README.md', join('cordis.patch.yml')]

/**
 * 抽出一个源文件里注册的工具名。
 * @param {string} source - 源码
 * @returns {string[]} 工具名
 */
export function extractToolNames(source) {
  const names = []
  const text = String(source ?? '')
  // 写法一：defineTool({ ... name: 'x' })；写法二：工具定义对象里的 name: 'x'。
  const nearDefine = /defineTool\(\{[\s\S]{0,400}?name:\s*'([a-z][a-z0-9_]*)'/gu
  // 成员模块走 ctx.tools.register({ name: 'x' })，缩进可能是 2 或 6 个空格。
  const bareObject = /ctx\.tools\.register\(\{[\s\S]{0,200}?name:\s*'([a-z][a-z0-9_]+)'/gu
  for (const pattern of [nearDefine, bareObject]) {
    for (const match of text.matchAll(pattern)) {
      if (!names.includes(match[1])) names.push(match[1])
    }
  }
  return names
}

/**
 * 汇总所有源码里的工具名。
 * @returns {string[]} 工具名（排好序）
 */
export function inventory() {
  const names = []
  for (const file of SOURCES) {
    let source = ''
    try {
      source = readFileSync(join(root, file), 'utf8')
    } catch {
      continue
    }
    for (const name of extractToolNames(source)) if (!names.includes(name)) names.push(name)
  }
  return names.sort()
}

/**
 * 文档里提到的工具名（按反引号或裸词识别）。
 * @param {string} text - 文档内容
 * @returns {string[]} 提到且形如工具名的词
 */
export function mentionedTools(text, known = inventory()) {
  const knownSet = new Set(known)
  const found = new Set()
  for (const match of String(text ?? '').matchAll(/[a-z][a-z0-9_]{3,40}/gu)) {
    if (knownSet.has(match[0])) found.add(match[0])
  }
  return [...found].sort()
}

/**
 * 对账。
 * @param {string[]} names - 实际工具名
 * @param {{ file: string; text: string }[]} docs - 文档
 * @returns {{ documented: string[]; undocumented: string[] }} 结果
 */
export function reconcile(names, docs) {
  const mentioned = new Set()
  for (const doc of docs) for (const name of mentionedTools(doc.text, names)) mentioned.add(name)
  return {
    documented: names.filter((name) => mentioned.has(name)),
    undocumented: names.filter((name) => !mentioned.has(name)),
  }
}

/**
 * 读文档。
 * @returns {{ file: string; text: string }[]} 文档文本
 */
export function readDocuments() {
  return DOCUMENTS.map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }))
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 全覆盖、1 有漏写
 */
export function main(argv) {
  const names = inventory()
  const { documented, undocumented } = reconcile(names, readDocuments())
  process.stdout.write(`注册工具 ${names.length} 个：${names.join(' / ')}\n`)
  process.stdout.write(`文档已写 ${documented.length} 个\n`)
  if (undocumented.length > 0) {
    process.stdout.write(`文档缺 ${undocumented.length} 个：${undocumented.join(' / ')}\n`)
    for (const name of undocumented)
      process.stdout.write(`  补法：在 README 工具表与宪章 §7 加上 ${name}\n`)
  } else {
    process.stdout.write('文档与注册一致\n')
  }
  return argv.includes('--strict') && undocumented.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
