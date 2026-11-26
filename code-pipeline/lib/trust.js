/**
 * Request trust gate for the plugin's own HTTP routes.
 *
 * The host webserver forwards raw routes without its browser-trust fence (only
 * the connection service's `/api` prefix applies one), so this plugin asks the
 * host Connection service for the same Host/Origin/credential decision before
 * touching any file. Deployments without the Connection service fail closed
 * (503): silently serving an unauthenticated file-writing API is worse than an
 * unavailable panel.
 */

export const REJECTION_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
})

/**
 * @param {() => unknown} getConnection Read at request time: HMR may replace the service.
 * @returns {(requestLike: { headers?: unknown }) => ({ status: 401|403|503, code: string } | undefined)}
 */
export function createRequestGuard(getConnection) {
  return function guard(requestLike) {
    let connection
    try {
      connection = getConnection()
    } catch {
      return { status: 503, code: 'guard-unavailable' }
    }
    if (!connection || typeof connection.requestRejection !== 'function') {
      return { status: 503, code: 'guard-unavailable' }
    }
    try {
      const status = connection.requestRejection({ headers: requestLike?.headers ?? {} })
      if (status === undefined) return undefined
      if (status === 401) return { status: 401, code: 'unauthorized' }
      if (status === 403) return { status: 403, code: 'forbidden' }
      return { status: 503, code: 'guard-unavailable' }
    } catch {
      return { status: 503, code: 'guard-unavailable' }
    }
  }
}

/** @param {string} code */
export function rejectionPayload(code) {
  return { error: { code } }
}
