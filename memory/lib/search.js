/**
 * 记忆检索：把一条查询拆成词与中文二元组，按「标题 > 标签 > 正文 > 范围」加权打分，
 * 用命中次数与更新时间做同分排序。纯函数，便于单测与后续换实现。
 */

/**
 * 把查询拆成检索词。
 * 中文没有空格，除整串与空白切分之外再补二元组，避免「沙箱白名单」这类词检索不到。
 * @param {string} query - 查询
 * @returns {string[]} 去重后的小写检索词
 */
export function tokenize(query) {
  const text = String(query ?? '')
    .trim()
    .toLowerCase()
  if (text === '') return []
  const tokens = new Set([text])
  for (const part of text.split(/[\s,，。;；、/|]+/u)) {
    if (part !== '') tokens.add(part)
  }
  const cjk = [...text].filter((char) => /[\u4e00-\u9fff]/u.test(char))
  for (let index = 0; index + 1 < cjk.length; index += 1) tokens.add(cjk[index] + cjk[index + 1])
  return [...tokens].filter((token) => token.length >= 1).slice(0, 24)
}

/**
 * 给一条记忆打分。
 * @param {object} entry - 记忆条目
 * @param {string[]} tokens - 检索词
 * @param {string} phrase - 原始查询，用于整串加成
 * @returns {number} 分数，0 表示不命中
 */
export function scoreEntry(entry, tokens, phrase = '') {
  const title = String(entry.title ?? '').toLowerCase()
  const body = String(entry.body ?? '').toLowerCase()
  const tags = (Array.isArray(entry.tags) ? entry.tags : []).map((tag) => String(tag).toLowerCase())
  const scope = String(entry.scope ?? '').toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (title.includes(token)) score += 6
    if (tags.some((tag) => tag.includes(token))) score += 4
    if (body.includes(token)) score += 2
    if (scope.includes(token)) score += 1
  }
  if (phrase !== '' && title.includes(phrase)) score += 10
  return score
}

/**
 * 截取命中位置附近的一段正文。
 * @param {object} entry - 记忆条目
 * @param {string[]} tokens - 检索词
 * @param {number} [width] - 片段宽度
 * @returns {string} 片段
 */
export function snippetOf(entry, tokens, width = 140) {
  const body = String(entry.body ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
  if (body.length <= width) return body
  const lower = body.toLowerCase()
  let at = -1
  for (const token of tokens) {
    const found = lower.indexOf(token)
    if (found >= 0 && (at < 0 || found < at)) at = found
  }
  if (at < 0) return `${body.slice(0, width)}…`
  const start = Math.max(0, at - Math.floor(width / 3))
  const end = Math.min(body.length, start + width)
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`
}

/**
 * 检索记忆。
 * @param {{ entries: object[] }} document - 记忆库
 * @param {{ query?: string; type?: string; tag?: string; limit?: number; offset?: number }} [options] - 条件
 * @returns {{ total: number; entries: object[] }} 结果（含 score 与 snippet）
 */
export function searchEntries(document, options = {}) {
  const query = typeof options.query === 'string' ? options.query.trim() : ''
  const phrase = query.toLowerCase()
  const tokens = tokenize(query)
  const type = typeof options.type === 'string' && options.type !== '' ? options.type : null
  const tag =
    typeof options.tag === 'string' && options.tag !== '' ? options.tag.toLowerCase() : null
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, options.limit)) : 20
  const offset = Number.isFinite(options.offset) ? Math.max(0, options.offset) : 0

  const scored = []
  for (const entry of document.entries) {
    if (type !== null && entry.type !== type) continue
    if (tag !== null && !(Array.isArray(entry.tags) ? entry.tags : []).includes(tag)) continue
    const score = tokens.length === 0 ? 1 : scoreEntry(entry, tokens, phrase)
    if (score === 0) continue
    scored.push({ entry, score })
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    const byHits = (Number(right.entry.hits) || 0) - (Number(left.entry.hits) || 0)
    if (byHits !== 0) return byHits
    return String(right.entry.updatedAt).localeCompare(String(left.entry.updatedAt))
  })

  return {
    total: scored.length,
    entries: scored.slice(offset, offset + limit).map(({ entry, score }) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      scope: entry.scope,
      updatedAt: entry.updatedAt,
      hits: Number.isFinite(entry.hits) ? entry.hits : 0,
      score,
      snippet: snippetOf(entry, tokens),
    })),
  }
}

/**
 * 给被检索/读取的条目累加命中次数（就地修改）。
 * @param {{ entries: object[] }} document - 记忆库
 * @param {string[]} ids - 条目 id
 * @returns {number} 实际加了几条
 */
export function recordHits(document, ids) {
  const wanted = new Set(ids)
  let bumped = 0
  for (const entry of document.entries) {
    if (!wanted.has(entry.id)) continue
    entry.hits = (Number(entry.hits) || 0) + 1
    bumped += 1
  }
  return bumped
}

/**
 * 按 id 取一条记忆的全文。
 * @param {{ entries: object[] }} document - 记忆库
 * @param {string} id - 条目 id
 * @returns {object | null} 条目或 null
 */
export function findEntry(document, id) {
  return document.entries.find((entry) => entry.id === id) ?? null
}
