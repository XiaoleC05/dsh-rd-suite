/**
 * Preset loader. Presets are packaged JSON files under ../presets so they ship
 * with the bundle and never depend on the network or on a project's own config.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const presetDir = join(here, '..', 'presets')

let cache = null

function loadAll() {
  if (cache) return cache
  const map = new Map()
  let names = []
  try {
    names = readdirSync(presetDir).filter((name) => name.endsWith('.json'))
  } catch {
    names = []
  }
  for (const name of names) {
    try {
      const preset = JSON.parse(readFileSync(join(presetDir, name), 'utf8'))
      if (preset && typeof preset.id === 'string') map.set(preset.id, preset)
    } catch {
      // A malformed preset must not take the whole plugin down; the remaining
      // presets stay usable and the UI simply misses this language.
    }
  }
  cache = map
  return map
}

export function listPresets() {
  return [...loadAll().values()].map((preset) => ({
    id: preset.id,
    label: preset.label,
    language: preset.language,
    engine: preset.engine,
    depth: preset.depth,
    version: preset.version,
    ruleCount: Array.isArray(preset.rules) ? preset.rules.length : 0,
    categories: countCategories(preset.rules),
  }))
}

export function getPreset(id) {
  if (!id) return null
  return loadAll().get(id) ?? null
}

export function countCategories(rules) {
  const acc = { F: 0, S: 0, X: 0 }
  if (Array.isArray(rules)) {
    for (const rule of rules) {
      if (rule && typeof rule.category === 'string' && rule.category in acc) acc[rule.category] += 1
    }
  }
  return acc
}

/** Rule metadata for the panel's preset detail view. */
export function describePreset(id) {
  const preset = getPreset(id)
  if (!preset) return null
  return {
    id: preset.id,
    label: preset.label,
    language: preset.language,
    engine: preset.engine,
    depth: preset.depth,
    version: preset.version,
    columnLimit: preset.columnLimit ?? 0,
    indentStyle: preset.indentStyle ?? 'space',
    indentWidth: preset.indentWidth ?? 2,
    categories: countCategories(preset.rules),
    rules: Array.isArray(preset.rules) ? preset.rules : [],
  }
}
