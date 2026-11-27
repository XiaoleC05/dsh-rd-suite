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

test('注册：四个只读路由加一个写入路由，都受信任闸门保护', async () => {
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
    '/dsh-rd-memory/api/forget',
    '/dsh-rd-memory/api/list',
    '/dsh-rd-memory/api/stats',
  ])
  const list = registered.find((route) => route.path.endsWith('/list'))
  const response = await list.resource(new Request('http://localhost/dsh-rd-memory/api/list'))
  assert.equal(response.status, 401, '未通过信任闸门时不得返回数据')

  const forget = registered.find((route) => route.path.endsWith('/forget'))
  assert.equal(typeof forget.handler, 'function', '写入路径要用 handler 形式')
  assert.equal(forget.resource, undefined, '写入路径不能注册成只读 resource')
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

test('删除：POST 生效并落盘，缺 id 与找不到分别给 400/404，其它方法 405', async () => {
  const { mkdtempSync, rmSync, writeFileSync: writeFixture, readFileSync: readFixture } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'rd-mem-forget-'))
  const target = join(dir, 'memory.json')
  const entry = (id, title) => ({
    id,
    type: 'fix',
    title,
    body: '正文够长，用于删除测试。',
    tags: [],
    hits: 0,
    revisions: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  })
  writeFixture(target, JSON.stringify({ version: 1, entries: [entry('keep-me', '保留'), entry('drop-me', '删掉')] }), 'utf8')

  const { createMemoryHandlers } = await import('../memory/lib/routes.js')
  const handlers = createMemoryHandlers({ file: target, maxEntries: 10 })

  const missing = await handlers.forget(new URL('http://localhost/forget'))
  assert.equal(missing.status, 400)

  const unknown = await handlers.forget(new URL('http://localhost/forget?id=ghost'))
  assert.equal(unknown.status, 404)

  const ok = await handlers.forget(new URL('http://localhost/forget?id=drop-me'))
  assert.equal(ok.status, 200)
  const payload = await ok.json()
  assert.equal(payload.removed, 'drop-me')
  assert.equal(payload.total, 1)
  const stored = JSON.parse(readFixture(target, 'utf8'))
  assert.deepEqual(stored.entries.map((item) => item.id), ['keep-me'])

  // 路由层的方法校验
  const registered = []
  const ctx = {
    // 闸门放行：方法校验才是这条用例要验的东西。
    get: () => ({ requestRejection: () => undefined }),
    effect: (callback) => {
      callback()
      return () => {}
    },
    webServer: { register: (route) => registered.push(route) },
  }
  const { registerMemoryRoutes } = await import('../memory/lib/routes.js')
  registerMemoryRoutes(ctx, { file: target, maxEntries: 10 })
  const forget = registered.find((route) => route.path.endsWith('/forget'))
  const makeResponse = () => {
    const response = { statusCode: 0, body: '', headers: {}, headersSent: false, setHeader() {}, end(value) { this.body = value; this.headersSent = true } }
    return response
  }
  const getResponse = makeResponse()
  await forget.handler({ method: 'GET', url: '/dsh-rd-memory/api/forget?id=keep-me', headers: {} }, getResponse)
  assert.equal(getResponse.statusCode, 405)

  const postResponse = makeResponse()
  await forget.handler({ method: 'POST', url: '/dsh-rd-memory/api/forget?id=keep-me', headers: {} }, postResponse)
  assert.equal(postResponse.statusCode, 200)
  assert.equal(JSON.parse(postResponse.body).total, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('stats 给出命中分布：从未命中、命中前几与条数', async () => {
  const { createMemoryHandlers } = await import('../memory/lib/routes.js')
  const { mkdtempSync, rmSync, writeFileSync: writeFixture } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'rd-mem-hits-'))
  const file = join(dir, 'memory.json')
  const make = (id, title, hits) => ({
    id,
    type: 'fix',
    title,
    body: '正文够长，用于命中统计。',
    tags: [],
    hits,
    revisions: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  })
  writeFixture(
    file,
    JSON.stringify({
      version: 1,
      entries: [make('a', '常用条目', 7), make('b', '偶尔用', 2), make('c', '从没用过', 0), make('d', '也没用过', 0)],
    }),
    'utf8',
  )

  const handlers = createMemoryHandlers({ file, maxEntries: 100 })
  const stats = await (await handlers.stats()).json()
  assert.equal(stats.unused, 2)
  assert.deepEqual(stats.topHits.map((entry) => entry.title), ['常用条目', '偶尔用'])
  assert.deepEqual(stats.hitless.map((entry) => entry.title), ['从没用过', '也没用过'])

  const empty = join(dir, 'empty.json')
  writeFixture(empty, JSON.stringify({ version: 1, entries: [] }), 'utf8')
  const emptyStats = await (await createMemoryHandlers({ file: empty, maxEntries: 10 }).stats()).json()
  assert.equal(emptyStats.unused, 0)
  assert.equal(emptyStats.topHits, undefined, '没有命中过的条目时不给 topHits')
  assert.equal(emptyStats.hitless, undefined)
  rmSync(dir, { recursive: true, force: true })
})
