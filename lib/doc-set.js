/**
 * 降重检查的默认文档集：README、docs 下全部 .md、十个技能正文。
 *
 * 三个检查脚本（term-check / dup-check / near-dup）共用同一份取法——
 * 各自复制一遍会让 jscpd 直接把这段判成重复，正是本流程要消灭的东西。
 */

import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 默认检查集（仓库相对路径，统一用 / 分隔）。
 * @returns {string[]} 文件清单
 */
export function defaultDocuments() {
  const files = ['README.md']
  for (const name of readdirSync(join(root, 'docs'))) {
    if (name.endsWith('.md')) files.push(`docs/${name}`)
  }
  for (const entry of readdirSync(join(root, 'skills'), { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(`skills/${entry.name}/SKILL.md`)
  }
  return files
}

/**
 * 仓库根目录。
 * @returns {string} 绝对路径
 */
export function repositoryRoot() {
  return root
}
