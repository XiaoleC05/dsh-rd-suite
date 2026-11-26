/**
 * Host half of the code pipeline bundle.
 *
 * Responsibilities:
 * - serve the panel's HTTP API under /dsh-code-pipeline/api
 * - expose two agent tools: code_list_files and code_standardize
 *
 * Security posture: raw webserver routes are forwarded by the host without its
 * browser-trust fence, so every route first asks the host Connection service for
 * the same Host/Origin/credential decision the official /api surface uses. File
 * access is confined by a workspace-root policy and a runtime path policy; a
 * path a caller names explicitly is still re-checked against the scan rules.
 */
import { scanTree, buildTree } from './lib/tree.js'
import { listPresets, describePreset } from './lib/presets.js'
import { standardize } from './lib/standardize.js'
import { probeEngines } from './lib/engines/index.js'
import { P0_LANGUAGES } from './lib/languages.js'
import { normalizeConfig } from './lib/config.js'
import { collectRoots, pickHttpRoot, pickAgentRoot } from './lib/roots.js'
import { createRequestGuard, rejectionPayload, REJECTION_HEADERS } from './lib/trust.js'
import { buildStatePayload, buildStandardizePayload, summarizeForTool, errorPayload } from './lib/payload.js'

const API_PREFIX = '/dsh-code-pipeline/api'
const BODY_LIMIT = 2 * 1024 * 1024
const MAX_PATH_LENGTH = 4096

export const inject = ['tools', 'webServer']

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

function textBlock(text) {
  return [{ type: 'text', text }]
}

/** Bounded body reader for the raw Node handler that owns POST /standardize. */
function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = []
    let size = 0
    let over = false
    let settled = false
    const fail = (code) => {
      if (settled) return
      settled = true
      rejectPromise(Object.assign(new Error(code), { code }))
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        // Keep draining so the client can read our 413 instead of seeing a reset.
        over = true
        chunks.length = 0
        return
      }
      if (!over) chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      if (over) return fail('body-too-large')
      settled = true
      resolvePromise(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', fail)
    req.on('aborted', () => fail('aborted'))
  })
}

export function apply(ctx, config = {}) {
  const { limits, warnings } = normalizeConfig(config)
  const logger = ctx.logger
  for (const warning of warnings) {
    logger?.warn?.('code-pipeline: ' + warning.code + ' for ' + warning.field + ': ' + String(warning.from) + ' -> ' + String(warning.to))
  }
  const guard = createRequestGuard(() => ctx.get('connection'))

  async function stateFor(requestedRoot) {
    const rootsState = collectRoots(ctx)
    const picked = pickHttpRoot(rootsState, requestedRoot)
    const base = {
      root: picked.root,
      roots: rootsState.roots,
      limits,
      warnings,
      truncated: false,
      fileCount: 0,
      tree: [],
      presets: listPresets(),
      p0: P0_LANGUAGES,
      engines: {},
      errorCode: picked.error,
    }
    if (picked.root === null) return buildStatePayload(base)

    const engines = await probeEngines()
    const scan = await scanTree(picked.root, { maxFiles: limits.maxFiles, maxBytes: limits.maxBytes })
    return buildStatePayload({
      ...base,
      truncated: scan.truncated,
      fileCount: scan.files.length,
      tree: buildTree(scan.files),
      engines,
    })
  }

  // ------------------------------------------------------------ routes

  // Resource routes answer GET/HEAD only, so the read endpoints and the writing
  // endpoint use distinct registration forms and distinct paths.
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: `${API_PREFIX}/state`,
      resource: async (request) => {
        const rejection = guard(request)
        if (rejection) return new Response(JSON.stringify(rejectionPayload(rejection.code)), { status: rejection.status, headers: REJECTION_HEADERS })
        try {
          const url = new URL(request.url)
          return jsonResponse(await stateFor(url.searchParams.get('root')))
        } catch (cause) {
          logger?.warn?.('code-pipeline: state handler failed: ' + (cause instanceof Error ? cause.message : String(cause)))
          return jsonResponse(errorPayload('internal'), 500)
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: `${API_PREFIX}/preset`,
      resource: async (request) => {
        const rejection = guard(request)
        if (rejection) return new Response(JSON.stringify(rejectionPayload(rejection.code)), { status: rejection.status, headers: REJECTION_HEADERS })
        try {
          const url = new URL(request.url)
          const preset = describePreset(url.searchParams.get('id'))
          return preset ? jsonResponse(preset) : jsonResponse(errorPayload('unknown-preset'), 404)
        } catch (cause) {
          logger?.warn?.('code-pipeline: preset handler failed: ' + (cause instanceof Error ? cause.message : String(cause)))
          return jsonResponse(errorPayload('internal'), 500)
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: `${API_PREFIX}/standardize`,
      handler: async (req, res) => {
        const send = (status, value) => {
          if (res.headersSent) return
          res.statusCode = status
          for (const [name, headerValue] of Object.entries(REJECTION_HEADERS)) res.setHeader(name, headerValue)
          res.end(JSON.stringify(value))
        }
        // An early response must still drain the request body; otherwise a
        // keep-alive socket stays occupied by unread bytes.
        const drain = () => {
          try { req.resume?.() } catch { /* already ended */ }
        }

        // Trust gate first: a rejected request must not parse bodies or scan.
        const rejection = guard(req)
        if (rejection) {
          if (rejection.status === 503) logger?.warn?.('code-pipeline: connection guard unavailable; request refused')
          drain()
          return send(rejection.status, rejectionPayload(rejection.code))
        }
        if (req.method !== 'POST') {
          res.setHeader('allow', 'POST')
          drain()
          return send(405, errorPayload('method-not-allowed'))
        }
        if (!/^application\/json\b/iu.test(String(req.headers['content-type'] ?? ''))) {
          drain()
          return send(415, errorPayload('unsupported-media-type'))
        }
        const declaredLength = Number(req.headers['content-length'] ?? 0)
        if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT) {
          drain()
          return send(413, errorPayload('body-too-large'))
        }

        let raw
        try {
          raw = await readBody(req)
        } catch (cause) {
          const code = cause?.code === 'body-too-large' ? 'body-too-large' : cause?.code === 'aborted' ? 'aborted' : 'bad-request'
          return send(code === 'body-too-large' ? 413 : 400, errorPayload(code))
        }
        let body
        try {
          body = raw ? JSON.parse(raw) : {}
        } catch {
          return send(400, errorPayload('bad-json'))
        }

        try {
          const picked = pickHttpRoot(collectRoots(ctx), body?.root)
          if (picked.root === null) return send(400, errorPayload(picked.error ?? 'no-workspace'))
          if (!Array.isArray(body?.paths) || body.paths.length === 0) return send(400, errorPayload('no-paths'))
          if (body.paths.length > limits.maxFiles) return send(413, errorPayload('too-many-paths'))
          if (!body.paths.every((path) => typeof path === 'string' && path.length > 0 && path.length <= MAX_PATH_LENGTH)) {
            return send(400, errorPayload('bad-path'))
          }
          if (body.mode !== undefined && body.mode !== 'report' && body.mode !== 'fix') {
            return send(400, errorPayload('bad-mode'))
          }
          const mode = body.mode === 'fix' ? 'fix' : 'report'
          const result = await standardize({ root: picked.root, paths: body.paths, mode, limits })
          logger?.info?.( 'code-pipeline: ' + mode + ' run ' + result.runId + ' selected=' + result.stats.selected + ' processed=' + result.stats.processed + ' written=' + result.stats.written + ' failed=' + result.stats.failed)
          return send(200, buildStandardizePayload(result))
        } catch (cause) {
          logger?.warn?.('code-pipeline: standardize handler failed: ' + (cause instanceof Error ? cause.message : String(cause)))
          return send(500, errorPayload('internal'))
        }
      },
    }),
  )

  // ------------------------------------------------------------- tools

  ctx.effect(() =>
    ctx.tools.register({
      name: 'code_list_files',
      description:
        'List the code files in the current workspace with their language and whether the P0 preset supports them. Use it before code_standardize to see what can be standardized.',
      parameters: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Absolute workspace root. Defaults to the session working directory.' },
          onlySupported: { type: 'boolean', description: 'Return only files the P0 presets can standardize.', default: true },
        },
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            error: { type: 'string' },
            count: { type: 'number' },
          },
          additionalProperties: true,
        },
        render(_args, value) {
          const text = value && typeof value.text === 'string' ? value.text : 'no files'
          return textBlock(text)
        },
      },
      async execute(args, exec) {
        const requested = typeof args?.root === 'string' ? args.root : undefined
        const picked = await pickAgentRoot(ctx, exec, requested)
        if (picked.root === null) return { text: `Workspace error: ${picked.error}`, error: picked.error }
        const scan = await scanTree(picked.root, { maxFiles: limits.maxFiles, maxBytes: limits.maxBytes })
        const onlySupported = args?.onlySupported !== false
        const files = onlySupported ? scan.files.filter((file) => file.supported) : scan.files
        const byLanguage = new Map()
        for (const file of files) {
          const key = file.supported ? file.language : `unsupported:${file.reason ?? 'other'}`
          byLanguage.set(key, (byLanguage.get(key) ?? 0) + 1)
        }
        const lines = [`Root: ${picked.root}`, `Files: ${files.length}`, '']
        for (const [language, count] of [...byLanguage.entries()].sort()) lines.push(`- ${language}: ${count}`)
        lines.push('', 'Paths:')
        for (const file of files.slice(0, 300)) lines.push(`- ${file.path}`)
        if (files.length > 300) lines.push(`... ${files.length - 300} more`)
        return { text: lines.join('\n'), count: files.length }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'code_standardize',
      description:
        'Apply the built-in per-language style presets to code files. mode="report" only diffs, mode="fix" writes changes. Only the ten P0 languages have presets; other files are skipped and reported.',
      parameters: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Workspace-relative file paths.' },
          all: { type: 'boolean', description: 'Standardize every P0 code file in the workspace.', default: false },
          mode: { type: 'string', enum: ['report', 'fix'], default: 'report' },
          root: { type: 'string', description: 'Absolute workspace root. Defaults to the session working directory.' },
        },
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            error: { type: 'string' },
            runId: { type: 'string' },
            stats: { type: 'object' },
          },
          additionalProperties: true,
        },
        render(_args, value) {
          const text = value && typeof value.text === 'string' ? value.text : 'done'
          return textBlock(text)
        },
      },
      async execute(args, exec) {
        const requested = typeof args?.root === 'string' ? args.root : undefined
        const picked = await pickAgentRoot(ctx, exec, requested)
        if (picked.root === null) return { text: `Workspace error: ${picked.error}`, error: picked.error }

        let paths = Array.isArray(args?.paths) ? args.paths.filter((path) => typeof path === 'string' && path.length > 0) : []
        if (args?.all === true) {
          const scan = await scanTree(picked.root, { maxFiles: limits.maxFiles, maxBytes: limits.maxBytes })
          paths = scan.files.filter((file) => file.supported).map((file) => file.path)
        }
        if (paths.length === 0) {
          return { text: 'No paths were given. Pass workspace-relative paths, or all: true to standardize every P0 code file.', error: 'no-paths' }
        }
        if (paths.length > limits.maxFiles) return { text: `Too many paths (${paths.length}); the limit is ${limits.maxFiles}.`, error: 'too-many-paths' }

        const mode = args?.mode === 'fix' ? 'fix' : 'report'
        const result = await standardize({ root: picked.root, paths, mode, limits })
        return { text: summarizeForTool(result), runId: result.runId, stats: result.stats }
      },
    }),
  )
}
