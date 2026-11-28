#!/usr/bin/env node
/**
 * 仓库地图：给侦察一份「文件 + 顶层符号 + 行数」的骨架，而不是整文件内容。
 *
 * 思路来自 Aider 的 repo map（https://github.com/Aider-AI/aider）：模型不先看全仓文本，
 * 先看一张压缩后的结构图，再决定读哪几段。这里用行级正则代替 tree-sitter，零依赖、
 * 覆盖常见语言与 Markdown，输出有字符预算，超预算就截断并说明。
 *
 * 用法：
 *   node scripts/repo-map.mjs . --budget 4000
 *   node scripts/repo-map.mjs src --depth 2 --json
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 不进入的目录：依赖、构建产物、缓存与虚拟环境。 */
const IGNORED = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.tmp',
  'vendor',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
])

/** 参与建图的后缀。 */
const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.rb',
  '.php',
  '.md',
])

/** 单文件读取上限：超过的多半是生成物或数据文件。 */
const MAX_FILE_BYTES = 200_000
/** 单个文件最多列出的符号数。 */
const MAX_SYMBOLS = 12

/** 行级符号规则。kind 决定输出前缀：f 函数、c 类、t 类型、v 变量、h 标题。 */
const RULES = [
  {
    kind: 'f',
    test: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/u,
  },
  { kind: 'c', test: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/u },
  { kind: 't', test: /^\s*(?:export\s+)?(?:interface|type|enum|record)\s+([A-Za-z_$][\w$]*)/u },
  // 变量只在模块顶层才列：缩进的 const/let 基本都是局部变量，列出来只会造成噪声。
  { kind: 'v', test: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/u },
  { kind: 'f', test: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/u },
  { kind: 'f', test: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/u },
  { kind: 't', test: /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/u },
  { kind: 'f', test: /^\s*pub\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)/u },
  { kind: 't', test: /^\s*pub\s+(?:struct|enum|trait)\s+([A-Za-z_]\w*)/u },
  {
    kind: 'c',
    test: /^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:final\s+)?(?:class|interface|enum)\s+([A-Za-z_]\w*)/u,
  },
  { kind: 'f', test: /^\s*function\s+([A-Za-z_]\w*)\s*\(/u },
  { kind: 'h', test: /^#{1,3}\s+(.+?)\s*#*\s*$/u },
]

/**
 * 提取一个文件里的顶层符号。
 * @param {string} source - 文件内容
 * @param {string} [extension] - 文件后缀：Markdown 标题只在 .md 里采
 * @returns {{ kind: string; name: string }[]} 符号列表
 */
export function extractSymbols(source, extension = '.md') {
  const rules = extension === '.md' ? RULES : RULES.filter((rule) => rule.kind !== 'h')
  const found = []
  const seen = new Set()
  for (const rawLine of source.split(/\r?\n/u)) {
    if (found.length >= MAX_SYMBOLS) break
    const line = rawLine.length > 400 ? rawLine.slice(0, 400) : rawLine
    for (const rule of rules) {
      const match = rule.test.exec(line)
      if (match === null) continue
      const name = match[1].trim()
      const key = `${rule.kind}:${name}`
      if (name === '' || seen.has(key)) break
      seen.add(key)
      found.push({ kind: rule.kind, name })
      break
    }
  }
  return found
}

/**
 * 递归收集候选文件。
 * @param {string} root - 起始目录
 * @param {number} maxDepth - 最大深度（0 只扫根目录）
 * @returns {string[]} 相对路径，按字典序
 */
export function collectFiles(root, maxDepth) {
  const files = []
  const walk = (directory, depth) => {
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED.has(entry.name) || depth >= maxDepth) continue
        walk(full, depth + 1)
        continue
      }
      const dot = entry.name.lastIndexOf('.')
      if (dot < 0) continue
      if (!EXTENSIONS.has(entry.name.slice(dot).toLowerCase())) continue
      files.push(relative(root, full).split('\\').join('/'))
    }
  }
  walk(root, 0)
  return files
}

/**
 * 建图。
 * @param {{ root?: string; budget?: number; depth?: number }} [options] - 起始目录、字符预算、深度
 * @returns {{ root: string; files: { path: string; lines: number; symbols: { kind: string; name: string }[] }[]; truncated: boolean; characters: number; scanned: number }} 地图
 */
export function buildMap(options = {}) {
  const root = options.root ?? process.cwd()
  const budget = Number.isFinite(options.budget) ? options.budget : 4000
  const depth = Number.isFinite(options.depth) ? options.depth : 6
  const files = []
  let characters = 0
  let truncated = false
  const focus = typeof options.focus === 'string' && options.focus !== '' ? options.focus.replace(/\\/gu, '/') : null
  const candidates = collectFiles(root, depth).filter((path) =>
    focus === null ? true : path.replace(/\\/gu, '/').startsWith(focus.replace(/\/+$/u, '') + '/'),
  )

  for (const relativePath of candidates) {
    const absolute = join(root, relativePath)
    let info
    try {
      info = statSync(absolute)
    } catch {
      continue
    }
    if (!info.isFile() || info.size > MAX_FILE_BYTES) continue
    let source
    try {
      source = readFileSync(absolute, 'utf8')
    } catch {
      continue
    }
    const symbols = extractSymbols(
      source,
      relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase(),
    )
    const lines = source.split(/\r?\n/u).length
    const cost =
      relativePath.length +
      String(lines).length +
      symbols.reduce((sum, item) => sum + item.name.length + 2, 0) +
      8
    if (characters + cost > budget) {
      truncated = true
      break
    }
    characters += cost
    files.push({ path: relativePath, lines, symbols })
  }

  return { root, files, truncated, characters, scanned: candidates.length }
}

/**
 * 渲染成给模型看的紧凑文本。
 * @param {ReturnType<typeof buildMap>} map - 地图
 * @returns {string} 文本
 */
export function renderMap(map) {
  const symbolCount = map.files.reduce((sum, file) => sum + file.symbols.length, 0)
  const header = `仓库地图 ${map.root}：${map.files.length}/${map.scanned} 个文件，${symbolCount} 个符号，约 ${map.characters} 字符`
  const lines = [header]
  for (const file of map.files) {
    lines.push(`${file.path} (${file.lines} 行)`)
    const groups = new Map()
    for (const symbol of file.symbols) {
      const list = groups.get(symbol.kind) ?? []
      list.push(symbol.name)
      groups.set(symbol.kind, list)
    }
    for (const [kind, names] of groups) lines.push(`  ${kind} ${names.join(', ')}`)
  }
  if (map.truncated)
    lines.push('（已到字符预算，剩余文件未列出：缩小目录、加 --depth 或调大 --budget）')
  return lines.join('\n')
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码
 */
/**
 * 按仓库规模给预算：小仓库不用放大，大仓库按文件数放大，封顶 12000。
 * @param {number} fileCount - 待扫描文件数
 * @param {number} [explicit] - 显式传入的预算
 * @returns {number} 预算字符数
 */
export function adaptiveBudget(fileCount, explicit) {
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit)
  const count = Number.isFinite(fileCount) && fileCount > 0 ? fileCount : 1
  // 上限 6000：侦察是"第一屏"，不是全量清单；要更多用 --budget 或 --focus。
  return Math.min(6_000, Math.max(4000, count * 40))
}

export function main(argv) {
  const json = argv.includes('--json')
  const readFlag = (name, fallback) => {
    const index = argv.indexOf(name)
    if (index < 0) return fallback
    const value = Number(argv[index + 1])
    return Number.isFinite(value) ? value : fallback
  }
  const explicitBudget = readFlag('--budget', Number.NaN)
  const focusIndex = argv.indexOf('--focus')
  const focus = focusIndex === -1 ? null : argv[focusIndex + 1] ?? null
  const depth = readFlag('--depth', 6)
  const positional = argv.filter(
    (argument, index) => !argument.startsWith('--') && !/^--/u.test(argv[index - 1] ?? ''),
  )
  const root = positional[0] ?? process.cwd()
  // 预算自适应：先用粗数估文件量，再决定预算；--focus 把范围收窄到某个目录。
  const focusPrefix = focus === null ? null : focus.replace(/\\/gu, '/').replace(/\/+$/u, '') + '/'
  const total = collectFiles(root, depth).filter((path) =>
    focusPrefix === null ? true : path.replace(/\\/gu, '/').startsWith(focusPrefix),
  ).length
  const budget = adaptiveBudget(total, explicitBudget)
  const map = buildMap({ root, budget, depth, ...(focus === null ? {} : { focus }) })
  process.stdout.write(json ? `${JSON.stringify(map, null, 2)}\n` : `${renderMap(map)}\n`)
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
