/**
 * 记忆库合并：把一个外来文档并入当前文档，或整库替换。
 *
 * 合并以「类型 + 归一化标题」为同一性判定，两条记录碰到一起时：
 * - 正文取 updatedAt 较新的那条；
 * - 标签取并集（最多 8 个）；
 * - hits 取较大值，避免导入把常用条目清零；
 * - 保留较早的 createdAt，并把 revisions 累加。
 * 纯函数，方便单测；写盘由调用方负责。
 */

import { normalizeTitle } from './store.js'

/** 一条记录的时间戳，非法值按最早处理。 */
function stampOf(entry) {
  const value = Date.parse(String(entry?.updatedAt ?? ''))
  return Number.isFinite(value) ? value : 0
}

/** 合并两条同身份记录，返回新对象。 */
function combine(current, incoming) {
  const newer = stampOf(incoming) >= stampOf(current) ? incoming : current
  const older = newer === incoming ? current : incoming
  const tags = [
    ...new Set([
      ...(Array.isArray(current.tags) ? current.tags : []),
      ...(Array.isArray(incoming.tags) ? incoming.tags : []),
    ]),
  ].slice(0, 8)
  return {
    ...older,
    ...newer,
    id: String(current.id ?? incoming.id ?? ''),
    tags,
    hits: Math.max(Number(current.hits) || 0, Number(incoming.hits) || 0),
    revisions: (Number(current.revisions) || 0) + (Number(incoming.revisions) || 0) + 1,
    createdAt: String(current.createdAt ?? incoming.createdAt ?? ''),
    updatedAt: String(newer.updatedAt ?? current.updatedAt ?? incoming.updatedAt ?? ''),
  }
}

/**
 * 合并或替换记忆库。
 * @param {{ version: number; entries: object[] }} target - 当前文档（只读）
 * @param {{ entries?: object[] } | object[]} incoming - 外来文档或条目数组
 * @param {{ mode?: 'merge' | 'replace' }} [options] - 合并方式
 * @returns {{ document: { version: number; entries: object[] }; created: number; updated: number; kept: number; dropped: number }} 结果
 */
export function mergeDocuments(target, incoming, options = {}) {
  const mode = options.mode === 'replace' ? 'replace' : 'merge'
  const entries = (Array.isArray(incoming) ? incoming : (incoming?.entries ?? [])).filter(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof entry.type === 'string' &&
      typeof entry.title === 'string',
  )

  if (mode === 'replace') {
    const next = entries.map((entry) => ({ ...entry }))
    return {
      document: { version: Number(target?.version) || 1, entries: next },
      created: next.length,
      updated: 0,
      kept: 0,
      dropped: Number(target?.entries?.length ?? 0),
    }
  }

  const index = new Map()
  const next = (Array.isArray(target?.entries) ? target.entries : []).map((entry) => ({ ...entry }))
  for (const entry of next) index.set(`${entry.type}:${normalizeTitle(entry.title)}`, entry)
  let created = 0
  let updated = 0
  let kept = 0

  for (const candidate of entries) {
    const key = `${candidate.type}:${normalizeTitle(candidate.title)}`
    const current = index.get(key)
    if (current === undefined) {
      const record = { ...candidate }
      next.unshift(record)
      index.set(key, record)
      created += 1
      continue
    }
    const merged = combine(current, candidate)
    const position = next.indexOf(current)
    if (position >= 0) next[position] = merged
    index.set(key, merged)
    if (stampOf(candidate) > stampOf(current)) updated += 1
    else kept += 1
  }

  next.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  return {
    document: { version: Number(target?.version) || 1, entries: next },
    created,
    updated,
    kept,
    dropped: 0,
  }
}
