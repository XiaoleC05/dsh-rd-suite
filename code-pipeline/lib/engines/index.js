/**
 * Engine adapters.
 *
 * Every adapter is lazy and defensive: a missing optional dependency degrades
 * to the built-in text normalizer instead of breaking the plugin. The returned
 * `depth` tells the panel how much was actually checked, so "format only" is
 * never presented as "fully linted".
 */
import { createRequire } from 'node:module'
import { textNormalize } from './text.js'

const require = createRequire(import.meta.url)
const loaded = new Map()
const FAILED_RETRY_MS = 60_000

async function tryImport(specifier) {
  const cached = loaded.get(specifier)
  if (cached !== undefined) {
    if (cached.mod !== null) return cached.mod
    // A missing optional dependency may be installed later; do not cache the
    // failure forever, but do not re-attempt on every single file either.
    if (Date.now() - cached.at < FAILED_RETRY_MS) return null
  }
  let mod = null
  try {
    mod = await import(specifier)
  } catch {
    mod = null
  }
  loaded.set(specifier, { mod, at: Date.now() })
  return mod
}

/** Whether an optional dependency is installed, without importing its WASM payload. */
function resolvable(specifier) {
  try {
    require.resolve(specifier)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- Biome

const biomeInstances = new Map()

async function getBiome(configJson) {
  if (biomeInstances.has(configJson)) return biomeInstances.get(configJson)
  const api = await tryImport('@biomejs/js-api/nodejs')
  if (!api || typeof api.Biome !== 'function') {
    biomeInstances.set(configJson, null)
    return null
  }
  try {
    const biome = new api.Biome()
    const { projectKey } = biome.openProject()
    if (configJson && configJson !== '{}') {
      // applyConfiguration only accepts an object; Biome never reads biome.json here.
      biome.applyConfiguration(projectKey, JSON.parse(configJson))
    }
    const handle = { biome, projectKey }
    biomeInstances.set(configJson, handle)
    return handle
  } catch {
    biomeInstances.set(configJson, null)
    return null
  }
}

async function runBiome(preset, file) {
  const handle = await getBiome(JSON.stringify(preset.biomeConfig ?? {}))
  if (!handle) return null
  const { biome, projectKey } = handle
  let content = file.content
  try {
    const formatted = biome.formatContent(projectKey, content, { filePath: file.path })
    if (formatted && typeof formatted.content === 'string') content = formatted.content
  } catch {
    return null
  }
  if (preset.allowUnsafeFixes === true) {
    try {
      const fixed = biome.lintContent(projectKey, content, {
        filePath: file.path,
        fixFileMode: 'safeAndUnsafeFixes',
      })
      if (fixed && typeof fixed.content === 'string') content = fixed.content
    } catch {
      // Fixes are a bonus; formatting already succeeded.
    }
  }
  // Biome 2.6 classifies essentially every style fix (useConst, noDoubleEquals,
  // useTemplate) as unsafe, so a safeFixes pass does nothing observable. What
  // the preset's S rules really get is a report: lint diagnostics on the final
  // content, listed but never auto-applied.
  let findings = []
  if (preset.depth === 'full') {
    try {
      const linted = biome.lintContent(projectKey, content, { filePath: file.path })
      findings = (linted?.diagnostics ?? []).map((diagnostic) => {
        const start = diagnostic?.location?.span?.[0] ?? 0
        return {
          rule: diagnostic?.category ?? 'unknown',
          severity: diagnostic?.severity ?? 'info',
          line: content.slice(0, start).split('\n').length,
          message: String(diagnostic?.description ?? '').slice(0, 300),
        }
      })
    } catch {
      findings = []
    }
  }
  return { content, depth: preset.depth === 'full' ? 'full' : 'format', findings }
}

// ------------------------------------------------------------ wasm-fmt

async function runWasmFmt(specifier, preset, file, argBuilder) {
  const mod = await tryImport(specifier)
  if (!mod) return null
  const format = typeof mod.format === 'function' ? mod.format : typeof mod.default === 'function' ? mod.default : null
  if (!format) return null
  try {
    const args = argBuilder(preset, file)
    const out = await format(...args)
    if (typeof out === 'string' && out.length > 0) return { content: out, depth: 'format' }
    return null
  } catch {
    return null
  }
}

// --------------------------------------------------------------- public

const ENGINE_TABLE = {
  biome: {
    label: 'Biome (WASM)',
    run: (preset, file) => runBiome(preset, file),
  },
  gofmt: {
    label: 'gofmt (WASM)',
    run: (preset, file) => runWasmFmt('@wasm-fmt/gofmt', preset, file, () => [file.content]),
  },
  'ruff-fmt': {
    label: 'ruff format (WASM)',
    run: (preset, file) =>
      runWasmFmt('@wasm-fmt/ruff_fmt', preset, file, (p, f) => [f.content, f.path, { lineWidth: p.columnLimit || 88 }]),
  },
  'clang-format': {
    label: 'clang-format (WASM)',
    run: (preset, file) =>
      runWasmFmt('@wasm-fmt/clang-format', preset, file, (p, f) => [
        f.content,
        f.path,
        JSON.stringify(p.clangStyle ?? { BasedOnStyle: 'Google' }),
      ]),
  },
  shfmt: {
    label: 'shfmt (WASM)',
    run: (preset, file) => runWasmFmt('@wasm-fmt/shfmt', preset, file, (p, f) => [f.content, f.path, { indent: p.indentWidth || 2 }]),
  },
  text: {
    label: 'built-in text rules',
    run: async (preset, file) => ({ content: textNormalize(file.content, preset), depth: 'text' }),
  },
}

export function engineLabel(engineId) {
  return ENGINE_TABLE[engineId]?.label ?? engineId
}

/**
 * Run one file through its preset engine.
 * Returns { content, depth, engine, degraded } where `degraded` means the
 * preferred engine was unavailable and the text rules produced the result.
 */
export async function runEngine(preset, file) {
  const requested = preset.engine ?? 'text'
  const adapter = ENGINE_TABLE[requested]
  if (!adapter) {
    return { content: textNormalize(file.content, preset), depth: 'text', engine: requested, degraded: true }
  }
  const result = await adapter.run(preset, file)
  if (result && typeof result.content === 'string') {
    return {
      content: result.content,
      depth: result.depth,
      engine: preset.engine,
      degraded: false,
      findings: Array.isArray(result.findings) ? result.findings : [],
    }
  }
  return {
    content: textNormalize(file.content, preset),
    depth: 'text',
    engine: preset.engine,
    degraded: requested !== 'text',
    findings: [],
  }
}

/** Probe which optional engines are actually installed, for the panel legend.
 *
 * Only resolution is checked: importing the packages loads tens of megabytes of
 * WASM (measured ~100 ms and >100 MiB RSS on first probe), which used to happen
 * on the first panel request even when no standardization was going to run. The
 * real import happens lazily inside runEngine and degrades gracefully on
 * failure, so the legend stays honest without the startup cost.
 */
export async function probeEngines() {
  const specs = [
    ['biome', '@biomejs/js-api/nodejs'],
    ['gofmt', '@wasm-fmt/gofmt'],
    ['ruff-fmt', '@wasm-fmt/ruff_fmt'],
    ['clang-format', '@wasm-fmt/clang-format'],
    ['shfmt', '@wasm-fmt/shfmt'],
  ]
  const out = {}
  for (const [id, spec] of specs) {
    out[id] = resolvable(spec)
  }
  out.text = true
  return out
}
