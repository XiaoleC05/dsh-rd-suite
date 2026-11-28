/**
 * 扫描根目录的解析：默认是本仓库，也允许指向任意项目。
 *
 * 为什么单列一个模块：near-dup / link-check / code-dup 三个脚本都要这件事，
 * 各写一遍会被 jscpd 判成重复——正是我们自己门禁在拦的东西。
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 解析 `--root` 参数。
 * @param {string[]} argv - 命令行参数
 * @param {string} [fallback] - 默认根目录
 * @returns {{ root: string; rest: string[] }} 根目录与剩余参数
 */
export function resolveRoot(argv, fallback = here) {
  const args = Array.isArray(argv) ? argv : []
  const index = args.indexOf('--root')
  if (index === -1) return { root: fallback, rest: args.filter((item) => item !== '') }
  const value = args[index + 1]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('--root 后面要跟一个目录')
  }
  return {
    root: resolve(value),
    rest: args.filter((item, position) => position !== index && position !== index + 1 && item !== ''),
  }
}

/**
 * 列出目录下的 markdown（一层，不递归）。
 * @param {string} directory - 目录
 * @returns {string[]} 文件绝对路径
 */
function markdownIn(directory, depth = 4, limit = 300) {
  const found = []
  const walk = (current, level) => {
    if (found.length >= limit || level > depth) return
    let entries = []
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) return
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full, level + 1)
      else if (entry.name.endsWith('.md')) found.push(full)
    }
  }
  walk(directory, 0)
  return found
}

/**
 * 一个项目里值得检查的文档：README + docs/*.md + 技能正文（若有）。
 * @param {string} root - 项目根
 * @returns {string[]} 文件绝对路径
 */
export function documentsUnder(root) {
  const files = []
  const readme = join(root, 'README.md')
  if (existsSync(readme) && statSync(readme).isFile()) files.push(readme)
  files.push(...markdownIn(join(root, 'docs')))
  const skillsDir = join(root, 'skills')
  try {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillFile = join(skillsDir, entry.name, 'SKILL.md')
      if (existsSync(skillFile)) files.push(skillFile)
    }
  } catch {
    // 没有 skills 目录：正常，不是所有项目都有。
  }
  return files
}

/**
 * 把项目根下的文件显示成相对路径，输出更短。
 * @param {string} root - 项目根
 * @param {string} file - 文件绝对路径
 * @returns {string} 相对路径（用 / 分隔）
 */
export function relativeTo(root, file) {
  return String(file).replace(root, '').replace(/^[\\/]/u, '').split('\\').join('/')
}
