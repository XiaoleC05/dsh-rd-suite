/**
 * Loader-row configuration normalization.
 *
 * The profile's `cordis.patch.yml` row is the only configuration surface for
 * this plugin (no Plugin Manager form: the bundle cannot resolve the schemastery
 * package DSH uses for generated forms). A profile override replaces the whole
 * config object, so every field is read defensively, clamped into bounds and
 * reported as a warning instead of throwing during activation.
 */

export const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 4000,
  maxBytes: 2 * 1024 * 1024,
})

export const LIMIT_BOUNDS = Object.freeze({
  maxFiles: { min: 100, max: 20_000 },
  maxBytes: { min: 64 * 1024, max: 8 * 1024 * 1024 },
})

/** Keep warnings free of arbitrary user objects: only small scalars travel. */
function scalarSummary(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.slice(0, 40)
  return null
}

/**
 * Resolve a raw loader config into complete, bounded limits plus warnings.
 * Never throws: a broken row must not take the plugin down.
 * @param {unknown} rawConfig
 * @returns {{ limits: { maxFiles: number, maxBytes: number }, warnings: Array<{ code: string, field: string, from: number|null, to: number }> }}
 */
export function normalizeConfig(rawConfig) {
  const input = rawConfig !== null && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {}
  const limits = { ...DEFAULT_LIMITS }
  const warnings = []

  for (const field of ['maxFiles', 'maxBytes']) {
    if (!Object.hasOwn(input, field)) continue
    const raw = input[field]
    const value = typeof raw === 'number' ? raw : Number(raw)
    const bound = LIMIT_BOUNDS[field]
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      warnings.push({ code: 'config-invalid', field, from: scalarSummary(raw), to: limits[field] })
      continue
    }
    if (value < bound.min) {
      warnings.push({ code: 'config-clamped', field, from: value, to: bound.min })
      limits[field] = bound.min
      continue
    }
    if (value > bound.max) {
      warnings.push({ code: 'config-clamped', field, from: value, to: bound.max })
      limits[field] = bound.max
      continue
    }
    limits[field] = value
  }

  return { limits, warnings }
}
