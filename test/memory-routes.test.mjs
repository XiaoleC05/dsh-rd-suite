/**
 * 记忆库只读路由的验证：四个 handler 的返回结构、命中累加、导出完整性与鉴权失败分支。
 * 用真实临时文件；HTTP 注册用假 ctx 记录路由表。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createMemoryHandlers, MEMORY_PREFIX, registerMemoryRoutes } from '../memory/lib/routes.js'
import {
  emptyDocument,
  memoryFile,
  normalizeEntry,
  readMemory,
  upsertEntry,
  writeMemory,
} from '../memory/lib/store.js'

let workspace
let file

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-memory-routes-'))
  file = memoryFile(workspace)
  const document = emptyDocument()
  for (const input of [
    {
      type: 'pitfall',
      title: 'Windows 沙箱白名单要用反斜杠',
      body: '现象：写入被拒。根因：正斜杠。做法：path.resolve 后再比较。',
      tags: ['windows'],
    },
    {
      type: 'template',
      title: '新增工具的注册骨架',
      body: 'defineTool 定义 schema，register 挂到 ctx.tools。',
      tags: ['dsh'],
    },
    {
      type: 'fix',
      title: '测试里缺 import 会报 ReferenceError',
      body: '现象：mkdtempSync is not defined。做法：补齐 node:fs 与 node:os。',
      tags: ['test'],
    },
  ]) {
    upsertEntry(document, normalizeEntry(input).entry)
  }
  writeMemory(file, document)
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

const url = (path, params = {}) => {
  const target = new URL(`http://localhost${MEMORY_PREFIX}${path}`)
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value))
  return target
}

test('handler 返回可解析的 JSON 且结构正确', async () => {
  const handlers = createMemoryHandlers({ file, maxEntries: 100 })
  const all = await handlers.list(url('/list')).json()
  assert.equal(all.ok, true)
  assert.equal(all.total, 3)
  assert.ok(all.entries.every((entry) => typeof entry.title === 'string'))

  const searched = await handlers.list(url('/list', { q: '沙箱' })).json()
  assert.equal(searched.total, 1)
  assert.ok(searched.entries[0].score > 0)

  const filtered = await handlers.list(url('/list', { type: 'fix' })).json()
  assert.equal(filtered.total, 1)
  assert.match(filtered.entries[0].title, /import/u)
})

test('entry：读全文并累加命中，未知 id 返回 404', async () => {
  const handlers = createMemoryHandlers({ file, maxEntries: 100 })
  const listed = await handlers.list(url('/list', { q: '沙箱' })).json()
  const id = listed.entries[0].id

  const detail = await handlers.entry(url('/entry', { id })).json()
  assert.equal(detail.ok, true)
  assert.match(detail.entry.body, /path\.resolve/u)

  const stored = readMemory(file).document.entries.find((entry) => entry.id === id)
  assert.equal(stored.hits, 1, '读取详情要计入命中')

  const missing = handlers.entry(url('/entry', { id: 'nope' }))
  assert.equal(missing.status, 404)
})

test('stats：按类型计数并给出最近更新时间', async () => {
  const handlers = createMemoryHandlers({ file, maxEntries: 100 })
  const stats = await handlers.stats().json()
  assert.equal(stats.total, 3)
  assert.deepEqual(stats.byType, { pitfall: 1, template: 1, fix: 1 })
  assert.match(String(stats.latest), /^\d{4}-\d{2}-\d{2}T/u)
})

test('export：导出整库，可直接作为备份', async () => {
  const handlers = createMemoryHandlers({ file, maxEntries: 100 })
  const exported = await handlers.exportAll().json()
  assert.equal(exported.version, 1)
  assert.equal(exported.entries.length, 3)
  assert.ok(exported.entries.every((entry) => typeof entry.body === 'string'))
})

test('注册：四个路由都挂在同一前缀下，且受信任闸门保护', async () => {
  const registered = []
  const ctx = {
    get: () => ({ requestRejection: () => 401 }),
    effect: (callback) => {
      callback()
      return () => {}
    },
    webServer: { register: (route) => registered.push(route) },
  }
  registerMemoryRoutes(ctx, { file, maxEntries: 100 })
  assert.deepEqual(registered.map((route) => route.path).sort(), [
    '/dsh-rd-memory/api/entry',
    '/dsh-rd-memory/api/export',
    '/dsh-rd-memory/api/list',
    '/dsh-rd-memory/api/stats',
  ])
  const list = registered.find((route) => route.path.endsWith('/list'))
  const response = await list.resource(new Request('http://localhost/dsh-rd-memory/api/list'))
  assert.equal(response.status, 401, '未通过信任闸门时不得返回数据')
})

test('stats 带上限与用量，未配置上限时不出现', async () => {
  const { createMemoryHandlers } = await import('../memory/lib/routes.js')
  const { mkdtempSync, rmSync, writeFileSync: writeFixture } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'rd-mem-cap-'))
  const file = join(dir, 'memory.json')
  writeFixture(
    file,
    JSON.stringify({
      version: 1,
      entries: [
        { id: 'a', type: 'fix', title: 'A', body: 'x'.repeat(20), tags: [], hits: 0, revisions: 0, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' },
        { id: 'b', type: 'fix', title: 'B', body: 'x'.repeat(20), tags: [], hits: 0, revisions: 0, createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' },
      ],
    }),
    'utf8',
  )

  const capped = createMemoryHandlers({ file, maxEntries: 10 })
  const body = await (await capped.stats()).json()
  assert.equal(body.total, 2)
  assert.equal(body.limit, 10)
  assert.ok(Math.abs(body.usage - 0.2) < 1e-9)

  const uncapped = createMemoryHandlers({ file })
  const plain = await (await uncapped.stats()).json()
  assert.equal(plain.limit, undefined)
  assert.equal(plain.usage, undefined)
  rmSync(dir, { recursive: true, force: true })
})
