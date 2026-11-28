#!/usr/bin/env node
/**
 * 文档引用完整性：markdown 链接与正文里提到的仓库路径，目标必须存在。
 *
 * 现有 doc-cmd-check 只管「命令里的脚本存在」，管不到读者会点的链接。
 *
 * 用法：node scripts/link-check.mjs [--root <项目目录>] [--strict]
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { documentsUnder, relativeTo, resolveRoot } = await import('./lib/scan-root.mjs')

/**
 * 抽出 markdown 里的相对链接目标。
 * @param {string} text - 文档内容
 * @returns {string[]} 目标（已去掉锚点）
 */
export function extractLinks(text) {
  const targets = []
  for (const match of String(text ?? '').matchAll(/\[[^\]]*\]\(([^)\s]+)\)/gu)) {
    const target = match[1].trim()
    if (/^(https?:|mailto:|#)/iu.test(target)) continue
    targets.push(target.split('#')[0])
  }
  return targets
}

/**
 * 抽出正文里 `反引号` 包住的仓库相对路径。
 * @param {string} text - 文档内容
 * @returns {string[]} 路径（只保留看起来像文件的）
 */
export function extractCodePaths(text) {
  const paths = []
  for (const match of String(text ?? '').matchAll(/`([\w./-]+\.(?:mjs|js|json|md|yml|yaml))`/gu)) {
    const value = match[1]
    if (/^(https?:|node:)/iu.test(value)) continue
    if (value.startsWith('/') || value.startsWith('.')) continue
    // 只认带目录的路径：裸文件名往往是行文里提到的名字，不是仓库路径。
    if (!value.includes('/')) continue
    paths.push(value)
  }
  return paths
}

/**
 * 把链接解析成仓库内路径。
 * @param {string} from - 引用方文件（相对仓库根）
 * @param {string} target - 链接目标
 * @returns {string} 仓库相对路径（规范化为 / 分隔）
 */
export function resolveTarget(from, target) {
  const base = dirname(from)
  return normalize(join(base, target)).replace(/\\/gu, '/')
}

/**
 * 待检查的文档清单。
 * @returns {string[]} 相对仓库根的文件名
 */
export function documents() {
  const found = ['README.md']
  for (const entry of readdirSync(join(root, 'docs'))) {
    if (entry.endsWith('.md')) found.push(`docs/${entry}`)
  }
  const skillsDir = join(root, 'skills')
  for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue
    const file = join(skillsDir, skill.name, 'SKILL.md')
    if (existsSync(file)) found.push(`skills/${skill.name}/SKILL.md`)
    const refs = join(skillsDir, skill.name, 'references')
    if (existsSync(refs) && statSync(refs).isDirectory()) {
      for (const name of readdirSync(refs)) {
        if (name.endsWith('.md')) found.push(`skills/${skill.name}/references/${name}`)
      }
    }
  }
  return found
}

/**
 * 检查全部文档。
 * @param {string[]} [files] - 待检查文件（默认全量）
 * @returns {{ file: string; target: string; kind: string }[]} 断链
 */
export function checkLinks(files = documents(), baseRoot = root) {
  const broken = []
  for (const file of files) {
    const text = readFileSync(join(baseRoot, file), 'utf8')
    for (const target of extractLinks(text)) {
      // 以 / 开头的是站点路由（文档站常见），不是仓库路径，跳过。
      if (target.startsWith('/')) continue
      const resolved = resolveTarget(file, target)
      if (!resolved.startsWith('..') && !existsSync(join(baseRoot, resolved))) {
        broken.push({ file, target, kind: '链接' })
      }
    }
    for (const target of extractCodePaths(text)) {
      const atRoot = existsSync(join(baseRoot, target))
      // 技能正文里的 references/xxx.md 相对技能目录，先在技能目录找。
      const skillDir = /^skills\/([^/]+)\//u.exec(file)?.[1]
      const atSkill = skillDir !== undefined && existsSync(join(baseRoot, 'skills', skillDir, target))
      if (!atRoot && !atSkill) broken.push({ file, target, kind: '路径' })
    }
  }
  return broken
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 无断链、1 有断链（--strict 时）
 */
export function main(argv) {
  const { root: scanRoot } = resolveRoot(argv, root)
  const external = scanRoot !== root
  const files = external ? documentsUnder(scanRoot).map((path) => relativeTo(scanRoot, path)) : documents()
  const broken = checkLinks(files, scanRoot)
  process.stdout.write(`检查 ${files.length} 份文档\n`)
  if (broken.length === 0) {
    process.stdout.write('引用完整：没有断链\n')
    return 0
  }
  for (const item of broken) process.stdout.write(`断${item.kind}：${item.file} → ${item.target}\n`)
  return argv.includes('--strict') ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
