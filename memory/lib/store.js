/**
 * 记忆库的存取层。
 *
 * 只做三件事：把 JSON 读成内存文档、把文档原子写回磁盘、按类型与标题合并条目。
 * 不掺业务判断（什么值得记、怎么写是模型的事），也不依赖宿主服务，方便单测直接跑。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 允许的记忆类型。 */
export const MEMORY_TYPES = ['template', 'pitfall', 'fix', 'strategy']

/** 当前数据结构版本。 */
export const MEMORY_VERSION = 1

/** 标题比较用的归一化：去空白、去标点、统一小写。 */
export function normalizeTitle(title) {
  return String(title ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, '')
}

/**
 * 空文档。
 * @returns {{ version: number; entries: unknown[] }} 文档
 */
export function emptyDocument() {
  return { version: MEMORY_VERSION, entries: [] }
}

/**
 * 读取记忆库；文件不存在或损坏时返回空文档，并在第二项返回原因。
 * @param {string} file - 绝对路径
 * @returns {{ document: { version: number; entries: object[] }; notice: string | null }} 文档与提示
 */
export function readMemory(file) {
  if (!existsSync(file)) return { document: emptyDocument(), notice: null }
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    return {
      document: emptyDocument(),
      notice: `读取失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
  if (text.trim() === '') return { document: emptyDocument(), notice: null }
  try {
    const parsed = JSON.parse(text)
    const entries = Array.isArray(parsed?.entries)
      ? parsed.entries.filter((entry) => entry && typeof entry === 'object')
      : []
    return { document: { version: MEMORY_VERSION, entries }, notice: null }
  } catch {
    // 损坏时不覆盖原文件：返回空文档，让调用方决定是否备份后重建。
    return {
      document: emptyDocument(),
      notice: '记忆库 JSON 解析失败，已按空库处理（原文件未改动）',
    }
  }
}

/**
 * 原子写：先写临时文件再 rename，避免半截文件。
 * @param {string} file - 目标路径
 * @param {{ version: number; entries: object[] }} document - 文档
 * @returns {void}
 */
export function writeMemory(file, document) {
  mkdirSync(dirname(file), { recursive: true })
  const payload = { version: MEMORY_VERSION, entries: document.entries }
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

/**
 * 规范化一条待写入的记忆。
 * @param {{ type?: unknown; title?: unknown; body?: unknown; tags?: unknown; scope?: unknown; source?: unknown }} input - 输入
 * @returns {{ ok: true; entry: object } | { ok: false; message: string }} 结果
 */
export function normalizeEntry(input) {
  const type = typeof input?.type === 'string' ? input.type.trim() : ''
  if (!MEMORY_TYPES.includes(type)) {
    return { ok: false, message: `type 必须是 ${MEMORY_TYPES.join(' / ')} 之一` }
  }
  const title = typeof input?.title === 'string' ? input.title.trim() : ''
  if (title.length < 4) return { ok: false, message: 'title 至少 4 个字符' }
  if (title.length > 120) return { ok: false, message: 'title 不超过 120 个字符' }
  const body = typeof input?.body === 'string' ? input.body.trim() : ''
  if (body.length < 10) return { ok: false, message: 'body 至少 10 个字符，写清可复用的信息' }
  const tags = Array.isArray(input?.tags)
    ? [
        ...new Set(
          input.tags
            .filter((tag) => typeof tag === 'string' && tag.trim() !== '')
            .map((tag) => tag.trim().toLowerCase()),
        ),
      ].slice(0, 8)
    : []
  return {
    ok: true,
    entry: {
      type,
      title,
      body: body.length > 8000 ? `${body.slice(0, 8000)}\n…（已截断）` : body,
      tags,
      scope:
        typeof input?.scope === 'string' && input.scope.trim() !== ''
          ? input.scope.trim()
          : 'global',
      source: typeof input?.source === 'string' ? input.source.trim() : '',
    },
  }
}

/**
 * 生成一个稳定 id：类型 + 归一化标题的短哈希 + 时间后缀。
 * @param {object} entry - 已规范化的条目
 * @param {Date} [now] - 当前时间
 * @returns {string} id
 */
export function makeId(entry, now = new Date()) {
  const key = `${entry.type}:${normalizeTitle(entry.title)}`
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)) % 0xffffffff
  return `${entry.type}-${hash.toString(36)}-${now.getTime().toString(36)}`
}

/**
 * 写入或更新一条记忆：同类型且同标题视为同一条，更新正文、标签与时间。
 * @param {{ version: number; entries: object[] }} document - 文档（就地修改）
 * @param {object} entry - 已规范化的条目
 * @param {Date} [now] - 当前时间
 * @returns {{ action: 'created' | 'updated'; id: string; total: number }} 结果
 */
export function upsertEntry(document, entry, now = new Date()) {
  const stamp = now.toISOString()
  const target = document.entries.find(
    (existing) =>
      existing.type === entry.type &&
      normalizeTitle(existing.title) === normalizeTitle(entry.title),
  )
  if (target !== undefined) {
    const before = target.body
    target.body = entry.body
    target.tags = [
      ...new Set([...(Array.isArray(target.tags) ? target.tags : []), ...entry.tags]),
    ].slice(0, 8)
    target.scope = entry.scope
    if (entry.source !== '') target.source = entry.source
    target.updatedAt = stamp
    target.revisions = Number.isFinite(target.revisions) ? target.revisions + 1 : 1
    document.entries.sort((left, right) =>
      String(right.updatedAt).localeCompare(String(left.updatedAt)),
    )
    return {
      action: before === entry.body ? 'updated' : 'updated',
      id: String(target.id),
      total: document.entries.length,
    }
  }
  const record = {
    id: makeId(entry, now),
    ...entry,
    createdAt: stamp,
    updatedAt: stamp,
    hits: 0,
    revisions: 0,
  }
  document.entries.unshift(record)
  return { action: 'created', id: record.id, total: document.entries.length }
}

/**
 * 按类型、标签与关键词过滤，返回摘要（不含正文全文）。
 * @param {{ entries: object[] }} document - 文档
 * @param {{ type?: string; tag?: string; limit?: number; offset?: number }} [options] - 过滤条件
 * @returns {{ total: number; entries: object[] }} 结果
 */
export function listEntries(document, options = {}) {
  const type = typeof options.type === 'string' && options.type !== '' ? options.type : null
  const tag =
    typeof options.tag === 'string' && options.tag !== '' ? options.tag.toLowerCase() : null
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, options.limit)) : 50
  const offset = Number.isFinite(options.offset) ? Math.max(0, options.offset) : 0
  const filtered = document.entries.filter((entry) => {
    if (type !== null && entry.type !== type) return false
    if (tag !== null && !(Array.isArray(entry.tags) ? entry.tags : []).includes(tag)) return false
    return true
  })
  return {
    total: filtered.length,
    entries: filtered.slice(offset, offset + limit).map((entry) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      scope: entry.scope,
      updatedAt: entry.updatedAt,
      hits: Number.isFinite(entry.hits) ? entry.hits : 0,
      excerpt: String(entry.body ?? '')
        .replace(/\s+/gu, ' ')
        .slice(0, 160),
    })),
  }
}

/** 保留分：命中次数为主，更新时间为辅（每天加 1 分，最多 30 分）。 */
export function retentionScore(entry, now = new Date()) {
  const hits = Number(entry?.hits) || 0
  const stamp = Date.parse(String(entry?.updatedAt ?? ''))
  const days = Number.isFinite(stamp) ? Math.max(0, (now.getTime() - stamp) / 86_400_000) : 999
  const recency = Math.max(0, 30 - days)
  const revisions = Number(entry?.revisions) || 0
  return hits * 10 + recency + revisions
}

/**
 * 按保留分淘汰，直到条目数不超过上限。
 * 同分时先丢更新更早的；分数完全相同时按 id 稳定排序，保证可复现。
 * @param {{ entries: object[] }} document - 文档（就地修改）
 * @param {number} maxEntries - 上限
 * @param {Date} [now] - 当前时间
 * @returns {{ kept: number; evicted: number }} 结果
 */
export function evictEntries(document, maxEntries, now = new Date()) {
  const limit = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : Number.POSITIVE_INFINITY
  const entries = Array.isArray(document.entries) ? document.entries : []
  if (entries.length <= limit) return { kept: entries.length, evicted: 0 }

  const scored = entries.map((entry) => ({
    entry,
    score: retentionScore(entry, now),
    updated: String(entry.updatedAt ?? ''),
    id: String(entry.id ?? ''),
  }))
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    if (right.updated !== left.updated) return right.updated.localeCompare(left.updated)
    return left.id.localeCompare(right.id)
  })
  const kept = scored.slice(0, limit).map((item) => item.entry)
  const evicted = entries.length - kept.length
  document.entries = kept
  return { kept: kept.length, evicted }
}

/**
 * 记忆库文件路径。
 * @param {string} [directory] - 目录，默认 ~/.dsh/rd-suite
 * @returns {string} 文件绝对路径
 */
export function memoryFile(directory) {
  return join(
    directory ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh', 'rd-suite'),
    'memory.json',
  )
}
