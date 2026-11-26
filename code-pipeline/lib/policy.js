/**
 * Runtime path policy.
 *
 * The scanner decides what the panel may show; this module decides what a run
 * may read or write. Both entry points (panel HTTP and Agent tools) rely on it,
 * so `node_modules`, ignored files, links that leave the root, oversized files
 * and non-UTF-8 sources are rejected the same way instead of being trusted just
 * because a caller named them explicitly.
 */
import { lstat, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { classify, SKIPPED_DIRECTORIES } from './languages.js'
import { DEFAULT_LIMITS } from './config.js'
import { compileIgnoreRules, isIgnoredPath, readIgnoreRules, resolveInside } from './tree.js'

/** @param {string} root @param {string} target */
function isInside(root, target) {
  const base = process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root)
  const value = process.platform === 'win32' ? resolve(target).toLowerCase() : resolve(target)
  return value === base || value.startsWith(base + sep)
}

function normalizeRelative(relPath) {
  if (typeof relPath !== 'string') return null
  const normalized = relPath.replaceAll('\\', '/').replace(/^\.\//u, '')
  return normalized.length > 0 ? normalized : null
}

/** Directory names compare case-insensitively on Windows, matching its filesystem. */
function isSkippedDirectory(name) {
  if (SKIPPED_DIRECTORIES.has(name)) return true
  return process.platform === 'win32' && SKIPPED_DIRECTORIES.has(name.toLowerCase())
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  for (const byte of sample) if (byte === 0) return true
  return false
}

function decodeUtf8(buffer) {
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  const body = hasBom ? buffer.subarray(3) : buffer
  const text = new TextDecoder('utf-8', { fatal: true }).decode(body)
  return { text, bom: hasBom }
}

/**
 * @param {object} input
 * @param {string} input.root
 * @param {{ maxFiles: number, maxBytes: number }} [input.limits]
 * @param {string[]} [input.ignoreRules]
 */
export function createPathPolicy({ root, realRoot, limits = DEFAULT_LIMITS, ignoreRules = [] }) {
  const rootPath = resolve(root)
  const realRootPath = realRoot ?? rootPath
  const compiledIgnore = compileIgnoreRules(ignoreRules)
  const maxBytes = limits.maxBytes

  /**
   * Synchronous classification: directory/ignore/extension gates.
   * @param {string} relPath
   * @returns {{ ok: true, relPath: string, info: object } | { ok: false, relPath: string, status: 'skipped'|'failed', reason: string, detail?: string }}
   */
  function classifyPath(relPath) {
    const normalized = normalizeRelative(relPath)
    if (normalized === null) return { ok: false, relPath: String(relPath), status: 'failed', reason: 'unreadable' }

    const segments = normalized.split('/')
    for (const segment of segments.slice(0, -1)) {
      if (isSkippedDirectory(segment)) {
        return { ok: false, relPath: normalized, status: 'skipped', reason: 'skipped-directory', detail: segment }
      }
    }
    if (isIgnoredPath(compiledIgnore, normalized)) {
      return { ok: false, relPath: normalized, status: 'skipped', reason: 'ignored' }
    }

    const info = classify(normalized)
    if (info.kind === 'non-code') {
      return {
        ok: false,
        relPath: normalized,
        status: 'skipped',
        reason: info.reason === 'generated-minified' ? 'generated-minified' : 'not-code',
        detail: info.reason,
      }
    }
    if (info.supported !== true) {
      return { ok: false, relPath: normalized, status: 'skipped', reason: 'outside-p0', detail: info.language ?? info.display ?? null }
    }
    return { ok: true, relPath: normalized, info }
  }

  /**
   * Read gate: containment, link resolution, size, binary and encoding checks.
   * @param {string} relPath
   * @returns {Promise<{ ok: true, relPath: string, absPath: string, size: number, mtimeMs: number, text: string, bom: boolean } | { ok: false, relPath: string, status: 'skipped'|'failed', reason: string }>}
   */
  async function prepareTarget(relPath) {
    const normalized = normalizeRelative(relPath)
    if (normalized === null) return { ok: false, relPath: String(relPath), status: 'failed', reason: 'unreadable' }

    const lexical = resolveInside(rootPath, normalized)
    if (lexical === null) return { ok: false, relPath: normalized, status: 'failed', reason: 'path-escape' }

    let info
    try {
      info = await lstat(lexical)
    } catch {
      return { ok: false, relPath: normalized, status: 'failed', reason: 'unreadable' }
    }
    if (!info.isFile() && !info.isSymbolicLink()) {
      return { ok: false, relPath: normalized, status: 'failed', reason: 'unreadable' }
    }

    let real
    try {
      real = await realpath(lexical)
    } catch {
      return { ok: false, relPath: normalized, status: 'failed', reason: 'unreadable' }
    }
    if (!isInside(realRootPath, real)) {
      return { ok: false, relPath: normalized, status: 'failed', reason: 'path-escape' }
    }
    // A link can point inside the root and still land in node_modules/dist:
    // re-check the resolved path against the skipped-directory policy.
    const realRelative = relative(realRootPath, real)
    if (realRelative.length > 0) {
      if (isIgnoredPath(compiledIgnore, realRelative.replaceAll(sep, '/'))) {
        return { ok: false, relPath: normalized, status: 'skipped', reason: 'ignored' }
      }
      const realSegments = realRelative.split(sep)
      for (const segment of realSegments.slice(0, -1)) {
        if (isSkippedDirectory(segment)) {
          return { ok: false, relPath: normalized, status: 'skipped', reason: 'skipped-directory', detail: segment }
        }
      }
    }

    let metadata
    try {
      metadata = await stat(real)
    } catch {
      return { ok: false, relPath: normalized, status: 'failed', reason: 'unreadable' }
    }
    if (!metadata.isFile()) {
      return { ok: false, relPath: normalized, status: 'failed', reason: 'unreadable' }
    }
    if (metadata.size > maxBytes) {
      return { ok: false, relPath: normalized, status: 'skipped', reason: 'too-large' }
    }

    let buffer
    try {
      buffer = await readFile(real)
    } catch {
      return { ok: false, relPath: normalized, status: 'failed', reason: 'unreadable' }
    }
    if (looksBinary(buffer)) {
      return { ok: false, relPath: normalized, status: 'skipped', reason: 'binary-content' }
    }

    let decoded
    try {
      decoded = decodeUtf8(buffer)
    } catch {
      return { ok: false, relPath: normalized, status: 'skipped', reason: 'non-utf8' }
    }

    return {
      ok: true,
      relPath: normalized,
      absPath: real,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      text: decoded.text,
      bom: decoded.bom,
    }
  }

  /**
   * Write gate: re-check size/mtime after the engine run, then write the UTF-8
   * content back (restoring a BOM when the source had one).
   * @param {object} prepared Result of {@link prepareTarget}.
   * @param {string} content
   * @returns {Promise<{ ok: true } | { ok: false, status: 'failed', reason: string }>}
   */
  async function writeTarget(prepared, content) {
    if (!prepared?.ok) return { ok: false, status: 'failed', reason: 'changed-since-read' }
    let real
    try {
      real = await realpath(prepared.absPath)
    } catch {
      return { ok: false, status: 'failed', reason: 'changed-since-read' }
    }
    if (!isInside(realRootPath, real)) {
      return { ok: false, status: 'failed', reason: 'path-escape' }
    }
    let metadata
    try {
      metadata = await stat(real)
    } catch {
      return { ok: false, status: 'failed', reason: 'changed-since-read' }
    }
    // mtime is unreliable on Windows (editors/AV can touch a file without a
    // content change), so only a size change aborts the write.
    if (metadata.size !== prepared.size) {
      return { ok: false, status: 'failed', reason: 'changed-since-read' }
    }
    const payload = prepared.bom ? `\uFEFF${content}` : content
    try {
      await writeFile(real, payload, 'utf8')
    } catch {
      return { ok: false, status: 'failed', reason: 'unwritable' }
    }
    return { ok: true }
  }

  return {
    root: rootPath,
    realRoot: realRootPath,
    limits,
    ignoreRules: compiledIgnore,
    classify: classifyPath,
    prepareTarget,
    writeTarget,
  }
}

/** Read a workspace's ignore files and create its policy. */
export async function createPolicyFor(root, limits) {
  const ignoreRules = await readIgnoreRules(root)
  let realRoot
  try {
    realRoot = await realpath(root)
  } catch {
    realRoot = resolve(root)
  }
  return createPathPolicy({ root, realRoot, limits, ignoreRules })
}
