/**
 * Standardization orchestrator.
 *
 * Contract: `mode: 'report'` never writes; `mode: 'fix'` writes only files whose
 * content actually changed, and only after the runtime path policy accepted the
 * target. A file that fails (encoding, size, containment, idempotency) is
 * reported, not written.
 *
 * The path policy is the single authority for what a run may touch: callers
 * (panel HTTP or Agent tools) can no longer bypass scan-time rules such as
 * skipped dependency directories by naming a path explicitly.
 */
import { getPreset } from './presets.js'
import { createPolicyFor } from './policy.js'
import { runEngine } from './engines/index.js'
import { DEFAULT_LIMITS } from './config.js'

const CONCURRENCY = 4

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function runner() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner))
  return results
}

/**
 * @param {object} input
 * @param {string} input.root        absolute workspace root
 * @param {string[]} input.paths     relative paths chosen in the panel
 * @param {'report'|'fix'} input.mode
 * @param {{ maxFiles: number, maxBytes: number }} [input.limits]
 */
export async function standardize({ root, paths, mode = 'report', limits = DEFAULT_LIMITS }) {
  const started = Date.now()
  const selected = Array.isArray(paths) ? [...new Set(paths.filter((path) => typeof path === 'string' && path.length > 0))] : []
  const skipped = []
  const work = []
  const policy = await createPolicyFor(root, limits)

  for (const relPath of selected) {
    const decision = policy.classify(relPath)
    if (!decision.ok) {
      skipped.push({
        path: decision.relPath,
        reason: decision.reason,
        status: decision.status,
        display: decision.reason === 'outside-p0' ? decision.detail ?? null : null,
      })
      continue
    }
    const preset = getPreset(decision.info.preset)
    if (!preset) {
      skipped.push({ path: decision.relPath, reason: 'missing-preset', status: 'skipped', display: decision.info.language ?? null })
      continue
    }
    work.push({ relPath: decision.relPath, info: decision.info, preset })
  }

  const outcomes = await mapLimit(work, CONCURRENCY, async ({ relPath, info, preset }) => {
    const prepared = await policy.prepareTarget(relPath)
    if (!prepared.ok) {
      return {
        path: prepared.relPath,
        status: prepared.status === 'skipped' ? 'skipped' : 'failed',
        reason: prepared.reason,
        language: info.language,
        preset: preset.id,
      }
    }

    const first = await runEngine(preset, { path: relPath, content: prepared.text })
    if (typeof first.content !== 'string') {
      return { path: relPath, status: 'failed', reason: 'engine-error', language: info.language, preset: preset.id }
    }

    // Idempotency gate: the engine must be a fixed point on its own output.
    const second = await runEngine(preset, { path: relPath, content: first.content })
    if (typeof second.content !== 'string' || second.content !== first.content) {
      return { path: relPath, status: 'failed', reason: 'not-idempotent', language: info.language, preset: preset.id }
    }

    const before = prepared.bom ? `\uFEFF${prepared.text}` : prepared.text
    const after = prepared.bom ? `\uFEFF${first.content}` : first.content
    const changed = after !== before

    if (mode === 'fix' && changed) {
      const written = await policy.writeTarget(prepared, first.content)
      if (!written.ok) {
        return { path: relPath, status: 'failed', reason: written.reason, language: info.language, preset: preset.id }
      }
    }

    return {
      path: relPath,
      status: changed ? 'changed' : 'unchanged',
      changed,
      written: mode === 'fix' && changed,
      language: info.language,
      preset: preset.id,
      engine: first.engine,
      depth: first.depth,
      degraded: first.degraded === true,
      findings: first.findings ?? [],
      findingCount: (first.findings ?? []).length,
      deltaLines: lineDelta(prepared.text, first.content),
      deltaBytes: Buffer.byteLength(first.content, 'utf8') - Buffer.byteLength(prepared.text, 'utf8'),
    }
  })

  const files = []
  for (const outcome of outcomes) {
    if (outcome.status === 'skipped') {
      skipped.push({ path: outcome.path, reason: outcome.reason, status: 'skipped', display: null })
    } else {
      files.push(outcome)
    }
  }

  const stats = {
    selected: selected.length,
    processed: files.filter((file) => file.status === 'changed' || file.status === 'unchanged').length,
    changed: files.filter((file) => file.status === 'changed').length,
    unchanged: files.filter((file) => file.status === 'unchanged').length,
    written: files.filter((file) => file.written === true).length,
    skipped: skipped.length,
    failed: files.filter((file) => file.status === 'failed').length,
    degraded: files.filter((file) => file.degraded === true).length,
    // Style findings are reported, never auto-applied: engine fixes for these
    // rules are classified unsafe, so a count here is information, not a change.
    lintFindings: files.reduce((sum, file) => sum + (file.findingCount ?? 0), 0),
  }

  return {
    runId: `run-${started.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    root,
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    stats,
    files,
    skipped,
    ok: stats.failed === 0,
    // Selected paths must each land in exactly one bucket; kept for tests.
    accounted: stats.processed + stats.skipped + stats.failed,
  }
}

function lineDelta(before, after) {
  const a = before.split('\n').length
  const b = after.split('\n').length
  return b - a
}
