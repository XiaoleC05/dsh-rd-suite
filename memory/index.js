/**
 * 长期记忆：技术模板、踩坑、bug 修复方案、策略模式。
 *
 * 模型通过 `memory_save` 写入、`memory_list` 浏览；文件存在 ~/.dsh/rd-suite/memory.json，
 * 与仓库无关，所以换项目也能复用。侧栏面板读同一个文件（见 client-sources/hub-rd.js）。
 */

import { readFileSync, writeFileSync as writeFile } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

import { mergeDocuments } from './lib/merge.js'
import { registerMemoryRoutes } from './lib/routes.js'
import { findEntry, recordHits, searchEntries } from './lib/search.js'
import {
  MEMORY_TYPES,
  listEntries,
  memoryFile,
  normalizeEntry,
  readMemory,
  evictEntries,
  upsertEntry,
  writeMemory,
} from './lib/store.js'

/** Cordis 插件名。 */
export const name = 'rd-memory'

/** 工具注册表 + webserver：前者给模型用，后者给侧栏面板读只读数据。 */
export const inject = ['tools', 'webServer']

/** 可选配置：存储目录与容量上限。 */
export const Config = z.object({
  directory: z.string().default(''),
  maxEntries: z.natural().default(2000),
})

/**
 * 打开记忆库并按需落盘。
 * @param {string} file - 记忆库路径
 * @param {number} maxEntries - 条目上限
 * @returns {{ document: object; notice: string | null; flush: () => void; save: (entry: object) => object }} 句柄
 */
function openStore(file, maxEntries) {
  const { document, notice } = readMemory(file)
  const flush = () => {
    evictEntries(document, maxEntries)
    writeMemory(file, document)
  }
  return {
    document,
    notice,
    flush,
    save(entry) {
      const result = upsertEntry(document, entry)
      flush()
      return result
    },
  }
}

/**
 * 组装记忆插件。
 * @param {object} ctx - Cordis 宿主上下文
 * @param {object} config - 解析后的配置
 */
export function apply(ctx, config) {
  const directory =
    typeof config?.directory === 'string' && config.directory !== ''
      ? config.directory
      : join(homedir(), '.dsh', 'rd-suite')
  const file = memoryFile(directory)
  const maxEntries = Number.isFinite(config?.maxEntries) ? config.maxEntries : 2000

  // 面板与外部脚本读同一份文件：四个只读路由，写入仍只走工具。
  registerMemoryRoutes(ctx, { file, maxEntries })

  ctx.tools.register(
    defineTool({
      name: 'memory_save',
      description:
        'Save one reusable lesson to the long-term memory of this mode: a technical template, a pitfall, a bug-fix recipe, or a strategy pattern. ' +
        'Same type and title overwrite the earlier entry, so repeat the exact title to refine it instead of creating duplicates.',
      parameters: {
        type: {
          type: 'string',
          required: true,
          enum: MEMORY_TYPES,
          description:
            'template（可复用技术模板）、pitfall（踩坑）、fix（bug 修复方案）、strategy（策略或取舍模式）。',
        },
        title: {
          type: 'string',
          required: true,
          description:
            '一句话标题，写成以后能被检索到的样子，例如「给 Windows 路径做 sandbox 白名单」。',
        },
        body: {
          type: 'string',
          required: true,
          description:
            '可复用的正文：现象、根因、做法、验证方式、适用边界。不要写「做完了」这类一次性信息。',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '检索用标签，例如 windows、sandbox、ptc。',
        },
        scope: {
          type: 'string',
          description: '作用范围：global（跨项目）或项目名。默认 global。',
        },
        source: {
          type: 'string',
          description: '来源线索：issue、commit、文件路径或会话主题。',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            message: { type: 'string', required: true },
            action: { type: 'string' },
            id: { type: 'string' },
            total: { type: 'integer' },
            file: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: value.message }],
      },
      presentCall: (args) => ({
        card: 'generic',
        title: `memory_save: ${String(args.type ?? '')}`,
        kind: 'other',
        rawInput: args,
      }),
      async execute(args) {
        const normalized = normalizeEntry(args)
        if (normalized.ok === false) {
          return { ok: false, message: `未保存：${normalized.message}`, file }
        }
        try {
          const store = openStore(file, maxEntries)
          const result = store.save(normalized.entry)
          return {
            ok: true,
            action: result.action,
            id: result.id,
            total: result.total,
            file,
            message: `${result.action === 'created' ? '已新增' : '已更新'}记忆「${normalized.entry.title}」（${normalized.entry.type}），当前共 ${result.total} 条`,
          }
        } catch (error) {
          return {
            ok: false,
            message: `写入记忆失败：${error instanceof Error ? error.message : String(error)}`,
            file,
          }
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'memory_list',
      description:
        'List long-term memory entries as short summaries, newest first. Filter by type or tag; read one entry with memory_read.',
      parameters: {
        type: { type: 'string', enum: MEMORY_TYPES, description: '只看某一类。' },
        tag: { type: 'string', description: '只看带这个标签的条目。' },
        limit: { type: 'integer', description: '返回条数，默认 20，上限 200。' },
        offset: { type: 'integer', description: '跳过多少条，用于翻页。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            message: { type: 'string', required: true },
            total: { type: 'integer' },
            entries: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  title: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  scope: { type: 'string' },
                  updatedAt: { type: 'string' },
                  hits: { type: 'integer' },
                  excerpt: { type: 'string' },
                },
              },
            },
            file: { type: 'string' },
            notice: { type: 'string' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              value.entries.length === 0
                ? value.message
                : `${value.message}\n${value.entries.map((entry) => `- [${entry.type}] ${entry.title} · ${entry.tags.join(',') || '无标签'} · ${entry.updatedAt}`).join('\n')}`,
          },
        ],
      },
      presentCall: (args) => ({
        card: 'generic',
        title: 'memory_list',
        kind: 'other',
        rawInput: args,
      }),
      async execute(args) {
        const { document, notice } = readMemory(file)
        const listed = listEntries(document, {
          type: args.type,
          tag: args.tag,
          limit: Number.isFinite(args.limit) ? args.limit : 20,
          offset: args.offset,
        })
        return {
          ok: true,
          total: listed.total,
          entries: listed.entries,
          file,
          ...(notice === null ? {} : { notice }),
          message:
            listed.total === 0
              ? `记忆库还是空的（${file}）`
              : `共 ${listed.total} 条，返回 ${listed.entries.length} 条`,
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'memory_search',
      description:
        'Search long-term memory by keyword, type, or tag. Chinese queries match titles, tags, and bodies through whole-phrase and bigram matching; ' +
        'results carry a score and a snippet, and every returned entry counts as one hit.',
      parameters: {
        query: { type: 'string', description: '关键词，可以是中文短语；留空表示按更新时间列出。' },
        type: { type: 'string', enum: MEMORY_TYPES, description: '只看某一类。' },
        tag: { type: 'string', description: '只看带这个标签的条目。' },
        limit: { type: 'integer', description: '返回条数，默认 10，上限 200。' },
        offset: { type: 'integer', description: '跳过多少条。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            message: { type: 'string', required: true },
            total: { type: 'integer' },
            entries: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  title: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  scope: { type: 'string' },
                  updatedAt: { type: 'string' },
                  hits: { type: 'integer' },
                  score: { type: 'integer' },
                  snippet: { type: 'string' },
                },
              },
            },
            file: { type: 'string' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              value.entries.length === 0
                ? value.message
                : `${value.message}\n${value.entries.map((entry) => `- [${entry.type}] ${entry.title}（${entry.score} 分）\n  ${entry.snippet}`).join('\n')}`,
          },
        ],
      },
      presentCall: (args) => ({
        card: 'generic',
        title: 'memory_search',
        kind: 'other',
        rawInput: args,
      }),
      async execute(args) {
        const store = openStore(file, maxEntries)
        const found = searchEntries(store.document, {
          query: args.query,
          type: args.type,
          tag: args.tag,
          limit: Number.isFinite(args.limit) ? args.limit : 10,
          offset: args.offset,
        })
        if (found.entries.length > 0) {
          recordHits(
            store.document,
            found.entries.map((entry) => entry.id),
          )
          store.flush()
        }
        // 返回值反映累加后的命中次数，而不是检索当时的快照。
        const hitsById = new Map(
          store.document.entries.map((entry) => [entry.id, Number(entry.hits) || 0]),
        )
        return {
          ok: true,
          total: found.total,
          entries: found.entries.map((entry) => ({
            ...entry,
            hits: hitsById.get(entry.id) ?? entry.hits,
          })),
          file,
          message:
            found.total === 0
              ? `没有匹配的记忆（查询「${String(args.query ?? '')}」）`
              : `命中 ${found.total} 条，返回 ${found.entries.length} 条`,
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'memory_read',
      description: 'Read one long-term memory entry in full by id, and count it as one hit.',
      parameters: {
        id: {
          type: 'string',
          required: true,
          description: 'memory_search 或 memory_list 返回的 id。',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            message: { type: 'string', required: true },
            id: { type: 'string' },
            type: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            scope: { type: 'string' },
            source: { type: 'string' },
            updatedAt: { type: 'string' },
            hits: { type: 'integer' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: value.ok ? value.body : value.message }],
      },
      presentCall: (args) => ({
        card: 'generic',
        title: 'memory_read',
        kind: 'other',
        rawInput: args,
      }),
      async execute(args) {
        const store = openStore(file, maxEntries)
        const entry = findEntry(store.document, args.id)
        if (entry === null) return { ok: false, message: `没有 id 为 ${args.id} 的记忆` }
        recordHits(store.document, [args.id])
        store.flush()
        return {
          ok: true,
          message: `${entry.title}（${entry.type}）`,
          id: entry.id,
          type: entry.type,
          title: entry.title,
          body: entry.body,
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          scope: entry.scope,
          source: entry.source,
          updatedAt: entry.updatedAt,
          hits: (Number(entry.hits) || 0) + 1,
        }
      },
    }),
  )

  ctx.tools.register(defineTool({
    name: 'memory_export',
    description: 'Write the whole long-term memory store to a JSON file, for backup or for moving it to another machine.',
    parameters: {
      path: { type: 'string', required: true, description: '导出文件路径（绝对路径或相对工作目录）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          path: { type: 'string' },
          total: { type: 'integer' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    presentCall: (args) => ({ card: 'generic', title: 'memory_export', kind: 'other', rawInput: args }),
    async execute(args) {
      if (typeof args.path !== 'string' || args.path.trim() === '') {
        return { ok: false, message: '未导出：path 不能为空' }
      }
      const store = openStore(file, maxEntries)
      try {
        writeFile(args.path, `${JSON.stringify({ version: store.document.version, entries: store.document.entries }, null, 2)}\n`, 'utf8')
        return { ok: true, message: `已导出 ${store.document.entries.length} 条到 ${args.path}`, path: args.path, total: store.document.entries.length }
      } catch (error) {
        return { ok: false, message: `导出失败：${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'memory_import',
    description: 'Import memory entries from a JSON file or inline array. merge (default) aligns entries by type and title, keeping the newer body and unioning tags; '
      + 'replace swaps the whole store. An unreadable or malformed source changes nothing.',
    parameters: {
      path: { type: 'string', description: '要导入的 JSON 文件路径。' },
      entries: {
        type: 'array',
        description: '直接给出的条目数组，与 path 二选一。',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            scope: { type: 'string' },
            source: { type: 'string' },
          },
        },
      },
      mode: { type: 'string', enum: ['merge', 'replace'], description: '默认 merge；replace 会丢掉当前库里的其余条目。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          mode: { type: 'string' },
          created: { type: 'integer' },
          updated: { type: 'integer' },
          kept: { type: 'integer' },
          dropped: { type: 'integer' },
          total: { type: 'integer' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    presentCall: (args) => ({ card: 'generic', title: 'memory_import', kind: 'other', rawInput: args }),
    async execute(args) {
      const mode = args.mode === 'replace' ? 'replace' : 'merge'
      let source
      try {
        if (Array.isArray(args.entries)) source = args.entries
        else if (typeof args.path === 'string' && args.path.trim() !== '') source = JSON.parse(readFileSync(args.path, 'utf8'))
        else return { ok: false, message: '未导入：需要 path 或 entries' }
      } catch (error) {
        return { ok: false, message: `未导入：读取失败 ${error instanceof Error ? error.message : String(error)}` }
      }
      const store = openStore(file, maxEntries)
      const result = mergeDocuments(store.document, source, { mode })
      try {
        writeMemory(file, result.document)
      } catch (error) {
        return { ok: false, message: `未导入：写入失败 ${error instanceof Error ? error.message : String(error)}` }
      }
      return {
        ok: true,
        mode,
        created: result.created,
        updated: result.updated,
        kept: result.kept,
        dropped: result.dropped,
        total: result.document.entries.length,
        message: `${mode === 'replace' ? '已整库替换' : '已合并'}：新增 ${result.created}、更新 ${result.updated}、保留 ${result.kept}${result.dropped > 0 ? `、丢弃 ${result.dropped}` : ''}，现有 ${result.document.entries.length} 条`,
      }
    },
  }))

}
