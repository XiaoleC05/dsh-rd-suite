/**
 * 记忆库的只读 HTTP 路由。
 *
 * 面板与外部脚本都从这里读数据：列表支持检索条件，详情会累加命中次数，统计给面板
 * 头部用，导出给备份与迁移用。全部只读，写入仍只走宿主工具。
 *
 * 信任判定直接复用 code-pipeline 的 createRequestGuard：宿主 webserver 转发原始路由时
 * 不带浏览器信任闸门，没有 Connection 服务的部署一律失败关闭（503）。
 */

import { createRequestGuard, REJECTION_HEADERS } from '../../code-pipeline/lib/trust.js'
import { findEntry, recordHits, searchEntries } from './search.js'
import { listEntries, readMemory, writeMemory } from './store.js'

/** 路由前缀，与前端调用保持一致。 */
export const MEMORY_PREFIX = '/dsh-rd-memory/api'

/**
 * JSON 响应。
 * @param {unknown} value - 载荷
 * @param {number} [status] - 状态码
 * @returns {Response} 响应
 */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/**
 * 读库并返回处理函数；命中写回由 handler 自己决定，避免列表把 hits 刷爆。
 * @param {{ file: string; maxEntries: number }} options - 存储位置与上限
 * @returns {Record<string, (url: URL) => Response>} 四个 handler
 */
export function createMemoryHandlers({ file, maxEntries }) {
  const load = () => readMemory(file).document

  return {
    list(url) {
      const document = load()
      const query = url.searchParams.get('q') ?? ''
      const found = searchEntries(document, {
        query,
        type: url.searchParams.get('type') ?? undefined,
        tag: url.searchParams.get('tag') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? '50'),
        offset: Number(url.searchParams.get('offset') ?? '0'),
      })
      if (query === '') {
        const plain = listEntries(document, {
          type: url.searchParams.get('type') ?? undefined,
          tag: url.searchParams.get('tag') ?? undefined,
          limit: Number(url.searchParams.get('limit') ?? '50'),
          offset: Number(url.searchParams.get('offset') ?? '0'),
        })
        return json({ ok: true, total: plain.total, entries: plain.entries })
      }
      return json({ ok: true, total: found.total, entries: found.entries })
    },

    entry(url) {
      const id = url.searchParams.get('id') ?? ''
      const document = load()
      const entry = findEntry(document, id)
      if (entry === null) return json({ ok: false, message: `没有 id 为 ${id} 的记忆` }, 404)
      recordHits(document, [id])
      try {
        if (document.entries.length <= maxEntries) writeMemory(file, document)
      } catch {
        // 命中次数写失败不影响读取：面板要的是内容。
      }
      return json({ ok: true, entry })
    },

    stats() {
      const document = load()
      const byType = {}
      let latest = ''
      for (const entry of document.entries) {
        byType[entry.type] = (byType[entry.type] ?? 0) + 1
        const stamp = String(entry.updatedAt ?? '')
        if (stamp > latest) latest = stamp
      }
      return json({ ok: true, total: document.entries.length, byType, latest, file })
    },

    exportAll() {
      const document = load()
      return json({ ok: true, version: document.version, entries: document.entries })
    },
  }
}

/**
 * 注册四个只读路由。
 * @param {object} ctx - 宿主上下文
 * @param {{ file: string; maxEntries: number }} options - 存储位置与上限
 * @returns {void}
 */
export function registerMemoryRoutes(ctx, options) {
  // 没有 webserver 或 effect 的场景（单测、纯 CLI 宿主）直接跳过，不影响工具使用。
  if (typeof ctx?.webServer?.register !== 'function' || typeof ctx.effect !== 'function') return
  const handlers = createMemoryHandlers(options)
  const guard = createRequestGuard(() => ctx.get('connection'))
  const routes = [
    ['/list', handlers.list],
    ['/entry', handlers.entry],
    ['/stats', handlers.stats],
    ['/export', handlers.exportAll],
  ]
  for (const [suffix, handler] of routes) {
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${MEMORY_PREFIX}${suffix}`,
        resource: async (request) => {
          const rejection = guard(request)
          if (rejection) {
            return new Response(JSON.stringify({ ok: false, code: rejection.code }), {
              status: rejection.status,
              headers: REJECTION_HEADERS,
            })
          }
          try {
            return handler(new URL(request.url))
          } catch (cause) {
            return json(
              { ok: false, message: cause instanceof Error ? cause.message : String(cause) },
              500,
            )
          }
        },
      }),
    )
  }
}
