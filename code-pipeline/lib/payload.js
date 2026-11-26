/**
 * HTTP payload projection and Agent-tool summaries.
 *
 * Domain results stay complete inside the plugin; this module decides what a
 * browser or a model actually receives. The panel never renders file contents,
 * so diffs and before/after copies are not shipped over the wire.
 */

export const API_VERSION = 1
export const FINDINGS_CAP = 40

/** Every code this plugin may put in an `{error:{code}}` envelope. */
export const ERROR_CODES = Object.freeze([
  'unauthorized',
  'forbidden',
  'guard-unavailable',
  'method-not-allowed',
  'unsupported-media-type',
  'body-too-large',
  'bad-json',
  'bad-mode',
  'bad-path',
  'too-many-paths',
  'no-paths',
  'bad-request',
  'aborted',
  'root-not-registered',
  'no-workspace',
  'unknown-preset',
  'internal',
])

/** @param {string} code */
export function errorPayload(code) {
  return { error: { code } }
}

/**
 * @param {object} input
 * @param {string|null} input.root
 * @param {Array<{path: string, title: string}>} input.roots
 * @param {{maxFiles: number, maxBytes: number}} input.limits
 * @param {Array<object>} input.warnings
 * @param {boolean} input.truncated
 * @param {number} input.fileCount
 * @param {Array<object>} input.tree
 * @param {Array<object>} input.presets
 * @param {Array<object>} input.p0
 * @param {Record<string, boolean>} input.engines
 * @param {string|undefined} input.errorCode
 */
export function buildStatePayload(input) {
  const payload = {
    apiVersion: API_VERSION,
    root: input.root,
    roots: input.roots,
    limits: input.limits,
    warnings: input.warnings,
    truncated: input.truncated,
    fileCount: input.fileCount,
    presets: input.presets.map((preset) => ({ id: preset.id, label: preset.label })),
    p0: input.p0.map((language) => ({ id: language.id, label: language.label })),
    engines: input.engines,
    tree: input.tree,
  }
  if (input.errorCode) payload.error = { code: input.errorCode }
  return payload
}

/** Take at most `cap` findings, errors first and round-robin across files so a
 * single noisy file cannot consume the whole budget. Each file keeps its true
 * count; per-file payloads carry only the kept entries. */
function capFindings(files) {
  const queues = files.map((file) => (file.findings ?? []).slice())
  const total = queues.reduce((sum, queue) => sum + queue.length, 0)
  if (total <= FINDINGS_CAP) {
    const perFile = new Map()
    queues.forEach((queue, index) => {
      if (queue.length > 0) perFile.set(index, queue)
    })
    return { truncated: false, perFile, total }
  }

  const hasError = (index) => queues[index].some((finding) => finding.severity === 'error')
  const order = files.map((_, index) => index).sort((left, right) => Number(hasError(right)) - Number(hasError(left)))
  const perFile = new Map()
  let kept = 0
  while (kept < FINDINGS_CAP) {
    let progressed = false
    for (const index of order) {
      const queue = queues[index]
      if (queue.length === 0) continue
      const list = perFile.get(index) ?? []
      list.push(queue.shift())
      perFile.set(index, list)
      kept += 1
      progressed = true
      if (kept >= FINDINGS_CAP) break
    }
    if (!progressed) break
  }
  return { truncated: true, perFile, total }
}

/**
 * @param {object} result Result returned by `standardize()`.
 */
export function buildStandardizePayload(result) {
  const capped = capFindings(result.files)
  const files = result.files.map((file, index) => {
    const entry = {
      path: file.path,
      status: file.status,
      language: file.language ?? null,
      preset: file.preset ?? null,
      engine: file.engine ?? null,
      depth: file.depth ?? null,
      degraded: file.degraded === true,
      findingCount: (file.findings ?? []).length,
      findings: capped.perFile.get(index) ?? [],
    }
    // Only a changed file has a meaningful delta; keeping the fields off the
    // wire for every unchanged file saves ~1 field pair per selected file.
    if (file.status === 'changed') {
      entry.deltaLines = file.deltaLines ?? 0
      entry.deltaBytes = file.deltaBytes ?? 0
    }
    if (file.reason !== undefined && file.reason !== null) entry.reason = file.reason
    return entry
  })
  return {
    apiVersion: API_VERSION,
    runId: result.runId,
    mode: result.mode,
    root: result.root,
    finishedAt: result.finishedAt,
    elapsedMs: result.elapsedMs,
    stats: result.stats,
    files,
    findingsTruncated: capped.truncated,
    skipped: result.skipped.map((item) => ({ path: item.path, reason: item.reason, display: item.display ?? null })),
  }
}

/**
 * Text form of a run for Agent tool results.
 * @param {object} result Result returned by `standardize()`.
 */
export function summarizeForTool(result) {
  const { stats } = result
  const lines = [
    `${result.mode === 'fix' ? 'Applied' : 'Checked'} ${stats.processed} file(s): ${stats.changed} changed, ${stats.unchanged} unchanged, ${stats.skipped} skipped, ${stats.failed} failed.`,
  ]
  if (result.mode === 'fix') lines.push(`Wrote ${stats.written} file(s) to disk.`)
  else if (stats.changed > 0) lines.push('Report-only run: no file was modified.')
  if (stats.degraded > 0) lines.push(`${stats.degraded} file(s) used the built-in text rules because a formatter engine was unavailable.`)
  if (stats.lintFindings > 0) {
    lines.push(`${stats.lintFindings} style finding(s) were reported but not applied: the engine classifies those fixes as unsafe.`)
    const sample = result.files
      .flatMap((file) => (file.findings ?? []).map((finding) => ({ path: file.path, ...finding })))
      .slice(0, 10)
    for (const finding of sample) lines.push(`  - ${finding.path}:${finding.line} ${finding.rule} — ${finding.message}`)
  }
  const changed = result.files.filter((file) => file.status === 'changed').slice(0, 20)
  if (changed.length > 0) {
    lines.push('', 'Files:')
    for (const file of changed) lines.push(`- ${file.path} (${file.language}, ${file.engine}, ${file.deltaLines >= 0 ? '+' : ''}${file.deltaLines} lines)`)
  }
  const failed = result.files.filter((file) => file.status === 'failed')
  if (failed.length > 0) {
    lines.push('', 'Failures:')
    for (const file of failed) lines.push(`- ${file.path}: ${file.reason}`)
  }
  if (result.skipped.length > 0) {
    const outside = result.skipped.filter((item) => item.reason === 'outside-p0')
    if (outside.length > 0) lines.push('', `Skipped ${outside.length} file(s) outside the P0 language list.`)
  }
  return lines.join('\n')
}
