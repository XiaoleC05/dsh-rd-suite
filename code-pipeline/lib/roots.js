/**
 * Workspace root policy.
 *
 * HTTP callers may only read a workspace the user registered (or the host's
 * configured default directory when no registry exists). Agent tools are
 * allowed to use the Session working directory instead, because that is the
 * agent's own filesystem scope; an explicit `root` argument must still hit the
 * registry or that Session directory. The previous implementation accepted any
 * absolute path from the model, which let a tool call read and write outside
 * the workspace.
 */
import { resolve } from 'node:path'

export const ROOT_ERROR = Object.freeze({
  NO_WORKSPACE: 'no-workspace',
  ROOT_NOT_REGISTERED: 'root-not-registered',
  ROOT_REQUIRED: 'root-required',
  ROOT_UNAVAILABLE: 'root-unavailable',
})

function asPath(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Normalize a path for comparison; Windows paths are case-insensitive. */
export function normalizeRoot(path) {
  const resolved = resolve(path)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** @param {string} left @param {string} right */
export function sameRoot(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length === 0 || right.length === 0) return false
  return normalizeRoot(left) === normalizeRoot(right)
}

/**
 * Read the host's roots without throwing.
 * @param {{ get(name: string): unknown }} ctx
 * @returns {{ roots: Array<{ path: string, title: string }>, fallback: string | null }}
 */
export function collectRoots(ctx) {
  const roots = []
  try {
    const registry = ctx.get('workspaceRegistry')
    if (registry && typeof registry.list === 'function') {
      for (const workspace of registry.list()) {
        const path = asPath(workspace?.path ?? workspace?.directory ?? workspace?.root)
        if (path) roots.push({ path, title: workspace.title ?? path })
      }
    }
  } catch {
    // Optional registry; fall through to the configured default directory.
  }
  let fallback = null
  try {
    const workingDirectory = ctx.get('workingDirectory')
    fallback = asPath(workingDirectory?.defaultDirectory)
  } catch {
    // No working directory service: no fallback root.
  }
  return { roots, fallback }
}

/**
 * Pick a root for the panel / HTTP API.
 * @param {ReturnType<typeof collectRoots>} state
 * @param {unknown} requested
 * @returns {{ root: string, roots: Array<{ path: string, title: string }> } | { root: null, roots: Array<{ path: string, title: string }>, error: string }}
 */
export function pickHttpRoot(state, requested) {
  const requestedPath = asPath(requested)
  if (requestedPath) {
    if (state.roots.length > 0) {
      const match = state.roots.find((candidate) => sameRoot(candidate.path, requestedPath))
      return match ? { root: match.path, roots: state.roots } : { root: null, roots: state.roots, error: ROOT_ERROR.ROOT_NOT_REGISTERED }
    }
    if (state.fallback === null) return { root: null, roots: state.roots, error: ROOT_ERROR.NO_WORKSPACE }
    return sameRoot(state.fallback, requestedPath)
      ? { root: state.fallback, roots: state.roots }
      : { root: null, roots: state.roots, error: ROOT_ERROR.ROOT_NOT_REGISTERED }
  }
  const first = state.roots[0]?.path ?? state.fallback
  return first ? { root: first, roots: state.roots } : { root: null, roots: state.roots, error: ROOT_ERROR.NO_WORKSPACE }
}

/**
 * Pick a root for an agent tool call. Omitted `root` uses the Session working
 * directory; an explicit one must be registered or be that Session directory.
 * @param {{ get(name: string): unknown }} ctx
 * @param {{ agent?: unknown, signal?: AbortSignal } | undefined} exec
 * @param {unknown} requested
 * @returns {Promise<{ root: string } | { root: null, error: string }>}
 */
export async function pickAgentRoot(ctx, exec, requested) {
  const state = collectRoots(ctx)
  let sessionRoot = null
  const agent = exec?.agent
  try {
    const workingDirectory = ctx.get('workingDirectory')
    if (agent && workingDirectory && typeof workingDirectory.ensure === 'function') {
      sessionRoot = asPath(await workingDirectory.ensure(agent, exec?.signal))
    }
  } catch {
    return { root: null, error: ROOT_ERROR.ROOT_UNAVAILABLE }
  }

  const requestedPath = asPath(requested)
  if (requestedPath) {
    const candidates = [...state.roots.map((candidate) => candidate.path)]
    if (sessionRoot) candidates.push(sessionRoot)
    const match = candidates.find((candidate) => sameRoot(candidate, requestedPath))
    return match ? { root: match } : { root: null, error: ROOT_ERROR.ROOT_NOT_REGISTERED }
  }
  if (sessionRoot) return { root: sessionRoot }
  return { root: null, error: ROOT_ERROR.ROOT_REQUIRED }
}
