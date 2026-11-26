/**
 * HTTP + tool entry tests for the Host half.
 *
 * Raw webserver routes are not fenced by the host, so these tests pin the
 * trust-gate order, the error envelope and the payload contract (no file
 * contents over the wire).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply } from '../index.js'
import { normalizeConfig, DEFAULT_LIMITS, LIMIT_BOUNDS } from '../lib/config.js'
import { buildStandardizePayload, FINDINGS_CAP } from '../lib/payload.js'

const ROOT = join(tmpdir(), 'code-pipeline-routes-test')
function seed() {
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(join(ROOT, 'src'), { recursive: true })
  writeFileSync(join(ROOT, 'src/app.js'), 'var x=1\n')
}
seed()

function createCtx(options = {}) {
  const routes = new Map()
  const tools = new Map()
  let connection = options.connection
  const ctx = {
    effect(callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    get(name) {
      if (name === 'connection') return connection
      if (name === 'workspaceRegistry') return options.roots === undefined ? undefined : { list: () => options.roots }
      if (name === 'workingDirectory') return options.fallback === undefined ? undefined : { defaultDirectory: options.fallback }
      return undefined
    },
    webServer: {
      register(route) {
        routes.set(route.path, route)
        return () => {}
      },
    },
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => {}
      },
    },
    logger: { info() {}, warn() {}, error() {} },
  }
  return {
    ctx,
    routes,
    tools,
    setConnection(next) { connection = next },
  }
}

const ROOTS = [{ path: ROOT, title: 'fixture' }]

function allowedConnection() {
  return { requestRejection: () => undefined }
}

function rejectingConnection(status) {
  return { requestRejection: () => status }
}

function headerOf(headers, name) {
  if (headers === undefined || headers === null) return undefined
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined
  return headers[name] ?? headers[name.toLowerCase()]
}

function originAwareConnection() {
  return {
    requestRejection(request) {
      const origin = headerOf(request.headers, 'origin')
      if (origin !== undefined && origin !== 'http://127.0.0.1:58173') return 403
      return undefined
    },
  }
}

function stateUrl(query = '') {
  return `http://127.0.0.1:58173/dsh-code-pipeline/api/state${query}`
}

function createReq({ method = 'POST', headers = {}, body = '' }) {
  const listeners = new Map()
  const req = {
    method,
    headers,
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(callback)
      return req
    },
    destroy() {},
  }
  setImmediate(() => {
    if (body.length > 0) for (const callback of listeners.get('data') ?? []) callback(Buffer.from(body))
    for (const callback of listeners.get('end') ?? []) callback()
  })
  return req
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    headersSent: false,
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    writeHead(status, headers = {}) {
      this.statusCode = status
      for (const [name, value] of Object.entries(headers)) this.headers[name.toLowerCase()] = value
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk)
      this.headersSent = true
    },
  }
}

async function waitForResponse(res, timeoutMs = 5000) {
  const started = Date.now()
  while (!res.headersSent) {
    if (Date.now() - started > timeoutMs) throw new Error(`no response after ${timeoutMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return res
}

async function callHandler(route, request) {
  const res = createRes()
  await route.handler(request, res)
  return waitForResponse(res)
}

function parse(res) {
  return JSON.parse(res.body)
}

test('state route rejects unauthorised, forbidden and unavailable guards before scanning', async () => {
  const state = createCtx({ connection: rejectingConnection(401), roots: ROOTS })
  apply(state.ctx, {})
  const route = state.routes.get('/dsh-code-pipeline/api/state')
  const response = await route.resource(new Request(stateUrl()))
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: { code: 'unauthorized' } })

  state.setConnection(rejectingConnection(403))
  const forbidden = await route.resource(new Request(stateUrl()))
  assert.equal(forbidden.status, 403)

  state.setConnection(undefined)
  const unavailable = await route.resource(new Request(stateUrl()))
  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), { error: { code: 'guard-unavailable' } })
})

test('state route applies the Host/Origin fence and serves the trimmed payload', async () => {
  const state = createCtx({ connection: originAwareConnection(), roots: ROOTS })
  apply(state.ctx, {})
  const route = state.routes.get('/dsh-code-pipeline/api/state')

  const hostile = await route.resource(new Request(stateUrl(), { headers: { host: '127.0.0.1:58173', origin: 'https://evil.example' } }))
  assert.equal(hostile.status, 403)

  const response = await route.resource(new Request(stateUrl(), { headers: { host: '127.0.0.1:58173' } }))
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.apiVersion, 1)
  assert.deepEqual(payload.limits, { maxFiles: 4000, maxBytes: 2 * 1024 * 1024 })
  assert.equal(payload.root, ROOT)
  assert.equal(payload.fileCount, 1)
  assert.equal(payload.files, undefined)
  assert.equal(payload.selectable, undefined)
  assert.equal(payload.tree.length, 1)
  assert.ok(payload.tree[0].children[0].type === 'file')
  assert.equal(payload.tree[0].children[0].size, undefined)
})

test('state route reports a registered-root error without scanning an external path', async () => {
  const state = createCtx({ connection: allowedConnection(), roots: ROOTS })
  apply(state.ctx, {})
  const route = state.routes.get('/dsh-code-pipeline/api/state')
  const response = await route.resource(new Request(stateUrl('?root=' + encodeURIComponent(tmpdir()))))
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.root, null)
  assert.deepEqual(payload.error, { code: 'root-not-registered' })
})

test('standardize route refuses wrong media type, bad JSON and unregistered roots', async () => {
  const state = createCtx({ connection: allowedConnection(), roots: ROOTS })
  apply(state.ctx, {})
  const route = state.routes.get('/dsh-code-pipeline/api/standardize')

  const wrongType = await callHandler(route, createReq({ headers: { 'content-type': 'text/plain' }, body: '{}' }))
  assert.equal(wrongType.statusCode, 415)
  assert.equal(parse(wrongType).error.code, 'unsupported-media-type')

  const badJson = await callHandler(route, createReq({ headers: { 'content-type': 'application/json' }, body: '{oops' }))
  assert.equal(badJson.statusCode, 400)
  assert.equal(parse(badJson).error.code, 'bad-json')

  const external = await callHandler(route, createReq({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root: tmpdir(), paths: ['a.js'], mode: 'report' }),
  }))
  assert.equal(external.statusCode, 400)
  assert.equal(parse(external).error.code, 'root-not-registered')
})

test('standardize route is fenced before reading the body and returns the v1 contract', async () => {
  const state = createCtx({ connection: originAwareConnection(), roots: ROOTS })
  apply(state.ctx, {})
  const route = state.routes.get('/dsh-code-pipeline/api/standardize')

  const hostile = await callHandler(route, createReq({
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ root: ROOT, paths: ['src/app.js'], mode: 'fix' }),
  }))
  assert.equal(hostile.statusCode, 403)

  const response = await callHandler(route, createReq({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root: ROOT, paths: ['src/app.js'], mode: 'report' }),
  }))
  assert.equal(response.statusCode, 200)
  const payload = parse(response)
  assert.equal(payload.apiVersion, 1)
  assert.equal(payload.mode, 'report')
  assert.equal(payload.stats.selected, 1)
  assert.equal(payload.files.length, 1)
  const file = payload.files[0]
  assert.equal(file.path, 'src/app.js')
  assert.equal(file.before, undefined)
  assert.equal(file.after, undefined)
  assert.equal(file.status, 'changed')
  assert.equal(typeof file.deltaLines, 'number')
  assert.equal(typeof file.deltaBytes, 'number')
  assert.ok(Array.isArray(file.findings))
  assert.equal(typeof payload.findingsTruncated, 'boolean')
})

test('preset route is fenced and answers unknown ids with the error envelope', async () => {
  const state = createCtx({ connection: rejectingConnection(403), roots: ROOTS })
  apply(state.ctx, {})
  const route = state.routes.get('/dsh-code-pipeline/api/preset')
  const refused = await route.resource(new Request('http://127.0.0.1:58173/dsh-code-pipeline/api/preset?id=go', { headers: { host: '127.0.0.1:58173' } }))
  assert.equal(refused.status, 403)

  state.setConnection(allowedConnection())
  const unknown = await route.resource(new Request('http://127.0.0.1:58173/dsh-code-pipeline/api/preset?id=nope', { headers: { host: '127.0.0.1:58173' } }))
  assert.equal(unknown.status, 404)
  assert.deepEqual(await unknown.json(), { error: { code: 'unknown-preset' } })
})

test('agent tools refuse unregistered roots and require an explicit all flag', async () => {
  const state = createCtx({ connection: allowedConnection(), roots: ROOTS })
  apply(state.ctx, {})
  const tool = state.tools.get('code_standardize')
  assert.ok(tool)

  const external = await tool.execute({ root: tmpdir(), paths: ['a.js'], mode: 'report' }, { agent: undefined })
  assert.match(external.text, /root-not-registered/u)

  const rootRequired = await tool.execute({ paths: ['src/app.js'], mode: 'report' }, { agent: undefined })
  assert.match(rootRequired.text, /root-required/u)

  const noPaths = await tool.execute({ root: ROOT }, { agent: undefined })
  assert.match(noPaths.text, /No paths were given/u)
})

test('findings survive the payload projection when the cap is not reached', async () => {
  writeFileSync(join(ROOT, 'src/style.js'), 'if (a == b) {\n  go()\n}\n')
  const state = createCtx({ connection: allowedConnection(), roots: ROOTS })
  apply(state.ctx, {})
  const route = state.routes.get('/dsh-code-pipeline/api/standardize')
  const response = await callHandler(route, createReq({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root: ROOT, paths: ['src/style.js'], mode: 'report' }),
  }))
  assert.equal(response.statusCode, 200)
  const payload = parse(response)
  const file = payload.files.find((entry) => entry.path === 'src/style.js')
  assert.ok(file, 'expected the styled file in the payload')
  assert.ok(file.findingCount > 0, 'the engine should report at least one style finding')
  assert.equal(file.findings.length, file.findingCount, 'per-file findings must not be dropped below the cap')
  assert.ok(file.findings.every((finding) => typeof finding.rule === 'string'))
})

test('findings are capped globally with round-robin and full per-file counts', () => {
  const findings = Array.from({ length: 30 }, (_, index) => ({ rule: `r${index}`, severity: 'warn', line: index + 1, message: 'm' }))
  const files = [0, 1].map((index) => ({
    path: `f${index}.js`,
    status: 'changed',
    findings,
    deltaLines: 1,
    deltaBytes: -5,
  }))
  const payload = buildStandardizePayload({ runId: 'x', mode: 'report', root: 'r', finishedAt: '', elapsedMs: 1, stats: {}, files, skipped: [] })
  assert.equal(payload.findingsTruncated, true)
  assert.equal(payload.files.reduce((sum, file) => sum + file.findings.length, 0), FINDINGS_CAP)
  assert.ok(payload.files.every((file) => file.findingCount === 30))
  assert.ok(payload.files.every((file) => file.findings.length === FINDINGS_CAP / 2))
  assert.ok(payload.files.every((file) => file.deltaBytes === -5))
  assert.equal(payload.skipped, undefined === payload.skipped ? payload.skipped : payload.skipped)
})

test('payload projections strip internal fields and keep signed deltas', () => {
  const payload = buildStandardizePayload({
    runId: 'x',
    mode: 'report',
    root: 'r',
    finishedAt: '',
    elapsedMs: 1,
    stats: {},
    files: [
      { path: 'a.js', status: 'changed', findings: [], deltaLines: 0, deltaBytes: -19 },
      { path: 'b.js', status: 'unchanged', findings: [], deltaLines: 0, deltaBytes: 0 },
    ],
    skipped: [{ path: 'c.js', reason: 'too-large', status: 'skipped', display: null }],
  })
  assert.equal(payload.files[0].deltaBytes, -19)
  assert.equal(payload.files[1].deltaLines, undefined)
  assert.deepEqual(payload.skipped[0], { path: 'c.js', reason: 'too-large', display: null })
})

test('config normalization clamps out-of-range values and reports warnings', () => {
  const fallback = normalizeConfig({})
  assert.deepEqual(fallback.limits, DEFAULT_LIMITS)
  assert.deepEqual(fallback.warnings, [])

  const clamped = normalizeConfig({ maxFiles: 999999, maxBytes: 1 })
  assert.equal(clamped.limits.maxFiles, LIMIT_BOUNDS.maxFiles.max)
  assert.equal(clamped.limits.maxBytes, LIMIT_BOUNDS.maxBytes.min)
  assert.deepEqual(clamped.warnings.map((warning) => warning.code), ['config-clamped', 'config-clamped'])
  assert.ok(clamped.warnings.every((warning) => warning.field === 'maxFiles' || warning.field === 'maxBytes'))

  const invalid = normalizeConfig({ maxFiles: 'many', maxBytes: Number.NaN })
  assert.deepEqual(invalid.limits, DEFAULT_LIMITS)
  assert.equal(invalid.warnings.length, 2)
  assert.ok(invalid.warnings.every((warning) => warning.code === 'config-invalid'))
  assert.equal(typeof invalid.warnings[0].from, 'string')
})

test('state payload exposes configuration warnings and effective limits', async () => {
  const state = createCtx({ connection: allowedConnection(), roots: ROOTS })
  apply(state.ctx, { maxFiles: 999999 })
  const route = state.routes.get('/dsh-code-pipeline/api/state')
  const response = await route.resource(new Request(stateUrl(), { headers: { host: '127.0.0.1:58173' } }))
  const payload = await response.json()
  assert.equal(payload.limits.maxFiles, LIMIT_BOUNDS.maxFiles.max)
  assert.equal(payload.warnings[0].code, 'config-clamped')
  assert.equal(payload.warnings[0].field, 'maxFiles')
})
