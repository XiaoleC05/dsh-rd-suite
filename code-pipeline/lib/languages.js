/**
 * Language registry for the code standardization pipeline.
 *
 * P0 is the only set of languages this plugin carries presets for. Everything
 * else is classified so the UI can show it honestly: a non-P0 code file is
 * listed with an "unsupported" badge and never receives rules, a non-code file
 * is hidden from the pickable set entirely.
 */

/** Ordered P0 language table. Order drives the UI language filter. */
export const P0_LANGUAGES = [
  { id: 'go', label: 'Go', preset: 'go', extensions: ['.go'] },
  { id: 'typescript', label: 'TypeScript', preset: 'typescript', extensions: ['.ts', '.tsx', '.mts', '.cts'] },
  { id: 'javascript', label: 'JavaScript', preset: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'] },
  { id: 'python', label: 'Python', preset: 'python', extensions: ['.py', '.pyi'] },
  { id: 'html', label: 'HTML', preset: 'html', extensions: ['.html', '.htm'] },
  { id: 'makefile', label: 'Makefile', preset: 'makefile', names: ['makefile', 'gnumakefile'], extensions: ['.mk', '.make'] },
  { id: 'css', label: 'CSS', preset: 'css', extensions: ['.css', '.scss', '.less'] },
  { id: 'cpp', label: 'C++', preset: 'cpp', extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx', '.inl', '.ipp'] },
  { id: 'shell', label: 'Shell', preset: 'shell', extensions: ['.sh', '.bash', '.zsh', '.ksh'] },
  { id: 'powershell', label: 'PowerShell', preset: 'powershell', extensions: ['.ps1', '.psm1', '.psd1'] },
]

/** Languages that are code but explicitly out of P0 for this round. */
const OTHER_CODE = new Map([
  ['.rs', 'Rust'], ['.java', 'Java'], ['.kt', 'Kotlin'], ['.kts', 'Kotlin'],
  ['.cs', 'C#'], ['.fs', 'F#'], ['.rb', 'Ruby'], ['.php', 'PHP'],
  ['.swift', 'Swift'], ['.dart', 'Dart'], ['.lua', 'Lua'], ['.pl', 'Perl'],
  ['.r', 'R'], ['.scala', 'Scala'], ['.ex', 'Elixir'], ['.exs', 'Elixir'],
  ['.erl', 'Erlang'], ['.hs', 'Haskell'], ['.clj', 'Clojure'], ['.zig', 'Zig'],
  ['.nim', 'Nim'], ['.vue', 'Vue'], ['.svelte', 'Svelte'], ['.astro', 'Astro'],
  ['.jsx.hint', 'JavaScript'],
  ['.sql', 'SQL'], ['.graphql', 'GraphQL'], ['.gql', 'GraphQL'],
  ['.json', 'JSON'], ['.jsonc', 'JSONC'], ['.yaml', 'YAML'], ['.yml', 'YAML'],
  ['.toml', 'TOML'], ['.ini', 'INI'], ['.xml', 'XML'], ['.md', 'Markdown'],
  ['.mjs.map', 'Source Map'], ['.proto', 'Protobuf'],
])

/** Extensions that are never code: skipped before any classification. */
const NON_CODE = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg', '.tif', '.tiff',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.tar',
  '.exe', '.dll', '.so', '.dylib', '.a', '.lib', '.obj', '.o', '.class', '.pyc', '.pyo',
  '.wasm', '.node', '.bin', '.dat', '.pdb', '.ilk',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.db', '.sqlite', '.sqlite3', '.lock', '.map',
])

const EXT_TO_LANGUAGE = (() => {
  const map = new Map()
  for (const lang of P0_LANGUAGES) {
    for (const ext of lang.extensions) map.set(ext, lang.id)
  }
  return map
})()

const NAME_TO_LANGUAGE = (() => {
  const map = new Map()
  for (const lang of P0_LANGUAGES) {
    for (const name of lang.names ?? []) map.set(name, lang.id)
  }
  return map
})()

const LANGUAGE_BY_ID = new Map(P0_LANGUAGES.map((lang) => [lang.id, lang]))

/** Directory names that are never walked. */
export const SKIPPED_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'bower_components', 'vendor',
  'dist', 'build', 'out', 'obj', 'bin', 'target', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '__pycache__',
  '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache',
  '.gradle', '.idea', '.vs', '.dsh-code-pipeline',
])

/** Files that are large generated artifacts rather than source. */
const SKIPPED_FILE_SUFFIXES = ['.min.js', '.min.css', '.min.mjs', '.bundle.js', '.chunk.js']

export function languageById(id) {
  return LANGUAGE_BY_ID.get(id) ?? null
}

export function basename(relPath) {
  const normalized = String(relPath).replaceAll('\\', '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? normalized : normalized.slice(index + 1)
}

export function extname(relPath) {
  const name = basename(relPath).toLowerCase()
  const index = name.lastIndexOf('.')
  return index <= 0 ? '' : name.slice(index)
}

/**
 * Classify one relative path.
 *
 * Returns one of:
 *   { kind: 'code', language, preset, supported: true }
 *   { kind: 'code', language: null, display, supported: false, reason }
 *   { kind: 'non-code', reason }
 */
export function classify(relPath) {
  const name = basename(relPath).toLowerCase()
  const ext = extname(relPath)

  if (SKIPPED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    return { kind: 'non-code', reason: 'generated-minified' }
  }
  if (NON_CODE.has(ext)) {
    return { kind: 'non-code', reason: 'binary-or-asset' }
  }

  const byName = NAME_TO_LANGUAGE.get(name)
  if (byName) {
    const lang = LANGUAGE_BY_ID.get(byName)
    return { kind: 'code', language: lang.id, preset: lang.preset, supported: true }
  }

  const byExt = EXT_TO_LANGUAGE.get(ext)
  if (byExt) {
    const lang = LANGUAGE_BY_ID.get(byExt)
    return { kind: 'code', language: lang.id, preset: lang.preset, supported: true }
  }

  const other = OTHER_CODE.get(ext)
  if (other) {
    return { kind: 'code', language: null, display: other, supported: false, reason: 'outside-p0' }
  }

  // Unknown extension: treat as non-code so select-all never touches it.
  return { kind: 'non-code', reason: 'unknown-extension' }
}

/** True when a path is a P0 code file that the pipeline can act on. */
export function isStandardizable(relPath) {
  const info = classify(relPath)
  return info.kind === 'code' && info.supported === true
}

/** One-line summary used by the smoke test and the panel legend. */
export function describeRegistry() {
  return P0_LANGUAGES.map((lang) => ({
    id: lang.id,
    label: lang.label,
    preset: lang.preset,
    extensions: lang.extensions ?? [],
    names: lang.names ?? [],
  }))
}
