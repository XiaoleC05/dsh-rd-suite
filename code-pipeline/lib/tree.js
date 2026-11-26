/**
 * Workspace file-tree scanner.
 *
 * Design notes:
 * - Only relative POSIX-style paths leave this module; absolute paths stay here.
 * - Directories in SKIPPED_DIRECTORIES are never entered, so select-all can
 *   never reach node_modules or a build output.
 * - Binary/asset files are not returned at all; unknown-extension files are
 *   returned as `non-code` only when `includeNonCode` is on.
 * - Ignore rules are compiled once per scan instead of building a RegExp for
 *   every path (the old matcher did that in the walk's inner loop). Matching is
 *   case-insensitive on Windows, where the filesystem is.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { classify, SKIPPED_DIRECTORIES } from './languages.js'
import { DEFAULT_LIMITS } from './config.js'

/**
 * Minimal .gitignore support: exact names, leading-slash anchors and `*`
 * wildcards are honoured; negation and `**` are not. Anything unsupported
 * simply fails to exclude, which is the safe direction for a formatter.
 */
export async function readIgnoreRules(root) {
  const rules = []
  for (const name of ['.gitignore', '.dsh-code-pipeline-ignore']) {
    try {
      const text = await readFile(join(root, name), 'utf8')
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        rules.push(line)
      }
    } catch {
      // Absent ignore file is normal.
    }
  }
  return rules
}

const IGNORE_FLAGS = process.platform === 'win32' ? 'i' : ''

/** @param {string[]} rules */
export function compileIgnoreRules(rules) {
  const compiled = []
  for (const rule of rules) {
    const anchored = rule.startsWith('/')
    const body = anchored ? rule.slice(1) : rule
    const dirOnly = body.endsWith('/')
    const pattern = dirOnly ? body.slice(0, -1) : body
    if (pattern.length === 0) continue
    const escaped = pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
    compiled.push({
      anchored,
      dirOnly,
      pattern,
      regex: new RegExp(`^${escaped}$`, IGNORE_FLAGS),
    })
  }
  return compiled
}

/** @param {ReturnType<typeof compileIgnoreRules>} rules @param {string} relPath @param {string} name @param {boolean} isDir */
export function matchesIgnoreCompiled(rules, relPath, name, isDir) {
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue
    const target = rule.anchored || rule.pattern.includes('/') ? relPath : name
    if (rule.regex.test(target)) return true
  }
  return false
}

/** Compatibility wrapper for callers that still pass raw rules. */
export function matchesIgnore(rules, relPath, name, isDir) {
  return matchesIgnoreCompiled(compileIgnoreRules(rules), relPath, name, isDir)
}

/**
 * Whether a relative file path, or any of its parent directories, is ignored.
 * Used by the runtime path policy, which sees single files rather than a walk.
 */
export function isIgnoredPath(compiledRules, relPath) {
  const normalized = String(relPath).replaceAll('\\', '/')
  const segments = normalized.split('/').filter(Boolean)
  let prefix = ''
  for (let index = 0; index < segments.length - 1; index += 1) {
    prefix = prefix ? `${prefix}/${segments[index]}` : segments[index]
    if (matchesIgnoreCompiled(compiledRules, prefix, segments[index], true)) return true
  }
  const name = segments.at(-1) ?? normalized
  return matchesIgnoreCompiled(compiledRules, normalized, name, false)
}

/** Resolve a relative path, refusing anything that escapes the root lexically. */
export function resolveInside(root, relPath) {
  const base = resolve(root)
  const target = resolve(base, relPath)
  if (target !== base && !target.startsWith(base + sep)) return null
  return target
}

/**
 * Walk a workspace and return { files, dirCount, truncated, root }.
 * `files` is flat; the panel builds the nested view from it.
 */
export async function scanTree(root, options = {}) {
  const maxFiles = options.maxFiles ?? DEFAULT_LIMITS.maxFiles
  const maxBytes = options.maxBytes ?? DEFAULT_LIMITS.maxBytes
  const includeNonCode = options.includeNonCode ?? false
  const ignoreRules = compileIgnoreRules(await readIgnoreRules(root))

  const files = []
  let dirCount = 0
  let truncated = false

  function pushFile(file) {
    // Only an actually dropped entry marks the scan truncated: reaching
    // maxFiles exactly is a complete scan, not a truncated one.
    if (files.length >= maxFiles) {
      truncated = true
      return false
    }
    files.push(file)
    return true
  }

  async function walk(dirAbs, dirRel) {
    if (truncated) return
    let entries
    try {
      entries = await readdir(dirAbs, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (truncated) return
      const relPath = dirRel ? `${dirRel}/${entry.name}` : entry.name
      const absPath = join(dirAbs, entry.name)

      // Links are never followed by the scanner: a link may point outside the
      // workspace (junction/symlink) and the panel cannot represent that safely.
      if (entry.isSymbolicLink()) continue

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue
        if (process.platform === 'win32' && SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) continue
        if (matchesIgnoreCompiled(ignoreRules, relPath, entry.name, true)) continue
        dirCount += 1
        await walk(absPath, relPath)
        continue
      }
      if (!entry.isFile()) continue
      if (matchesIgnoreCompiled(ignoreRules, relPath, entry.name, false)) continue

      const info = classify(relPath)
      if (info.kind === 'non-code' && !includeNonCode) continue

      let size = 0
      try {
        size = (await stat(absPath)).size
      } catch {
        continue
      }

      const file = {
        path: relPath,
        name: entry.name,
        size,
        kind: info.kind,
        supported: info.kind === 'code' && info.supported === true,
        language: info.language ?? null,
        display: info.display ?? null,
        reason: info.reason ?? null,
      }
      if (info.kind === 'code' && size > maxBytes) {
        file.supported = false
        file.reason = 'too-large'
      }
      if (!pushFile(file)) return
    }
  }

  await walk(resolve(root), '')
  return { root: resolve(root), files, dirCount, truncated }
}

/** Group a flat file list into a nested tree for the panel. */
export function buildTree(files) {
  const rootNode = { name: '', path: '', type: 'dir', children: [] }
  const dirs = new Map([['', rootNode]])

  function ensureDir(dirPath) {
    const existing = dirs.get(dirPath)
    if (existing) return existing
    const index = dirPath.lastIndexOf('/')
    const parentPath = index === -1 ? '' : dirPath.slice(0, index)
    const parent = ensureDir(parentPath)
    const node = { name: dirPath.slice(index + 1), path: dirPath, type: 'dir', children: [] }
    parent.children.push(node)
    dirs.set(dirPath, node)
    return node
  }

  for (const file of files) {
    const index = file.path.lastIndexOf('/')
    const parentPath = index === -1 ? '' : file.path.slice(0, index)
    const parent = ensureDir(parentPath)
    parent.children.push({
      name: file.name,
      path: file.path,
      type: 'file',
      language: file.language ?? null,
      supported: file.supported,
      display: file.display ?? null,
      reason: file.reason ?? null,
    })
  }

  function sortNode(node) {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const child of node.children) if (child.type === 'dir') sortNode(child)
  }
  sortNode(rootNode)
  return rootNode.children
}
