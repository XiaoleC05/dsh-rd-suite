/**
 * Live negative security probe for the running host.
 *
 * These probes only assert refusals, so they need no browser credential: a
 * missing credential must yield 401, and a forged Host/Origin must yield 403.
 * A refused request must not leak any payload. Run it after the plugin is
 * installed and the host page is loaded once (the browser session itself is
 * exercised separately by the real GUI).
 *
 * Usage: node scripts/security-probe.mjs [baseUrl]
 */
import { request } from 'node:http'

const base = process.argv[2] ?? 'http://127.0.0.1:58173'
const stateUrl = `${base}/dsh-code-pipeline/api/state`
const standardizeUrl = `${base}/dsh-code-pipeline/api/standardize`

/** Raw HTTP request: fetch() overwrites the Host header, so a rebinding probe needs node:http. */
function rawGet(url, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: 'GET',
      headers,
      timeout: 10000,
    }, (response) => {
      let text = ''
      response.on('data', (chunk) => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, text }))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end()
  })
}

const probes = [
  {
    name: 'GET /state without browser credential',
    expect: 401,
    run: async () => {
      const response = await fetch(stateUrl, { signal: AbortSignal.timeout(10000) })
      return { status: response.status, text: await response.text() }
    },
  },
  {
    name: 'GET /state with a forged Origin',
    expect: 403,
    run: async () => {
      const response = await fetch(stateUrl, { headers: { origin: 'https://evil.example' }, signal: AbortSignal.timeout(10000) })
      return { status: response.status, text: await response.text() }
    },
  },
  {
    name: 'GET /state with a forged Host (DNS-rebinding shape)',
    expect: 403,
    run: () => rawGet(stateUrl, { host: 'evil.example:58173' }),
  },
  {
    name: 'POST /standardize without browser credential',
    expect: 401,
    run: async () => {
      const response = await fetch(standardizeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paths: ['README.md'], mode: 'fix' }),
        signal: AbortSignal.timeout(10000),
      })
      return { status: response.status, text: await response.text() }
    },
  },
  {
    name: 'POST /standardize cross-site with simple content type',
    expect: 403,
    run: async () => {
      const response = await fetch(standardizeUrl, {
        method: 'POST',
        headers: { 'content-type': 'text/plain', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
        body: JSON.stringify({ paths: ['README.md'], mode: 'fix' }),
        signal: AbortSignal.timeout(10000),
      })
      return { status: response.status, text: await response.text() }
    },
  },
]

let failed = 0
for (const probe of probes) {
  try {
    const { status, text } = await probe.run()
    let body = null
    try { body = JSON.parse(text) } catch { /* empty or opaque */ }
    const leaked = body !== null && (Object.hasOwn(body, 'tree') || Object.hasOwn(body, 'files') || Object.hasOwn(body, 'roots'))
    const ok = status === probe.expect && !leaked
    if (!ok) failed += 1
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${probe.name}: status=${status} expected=${probe.expect} leaked=${leaked}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL ${probe.name}: ${error.message}`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} probe(s) failed — the plugin trust gate is not behaving as documented.`)
  process.exitCode = 1
} else {
  console.log('\nOK: every unauthenticated/forged request was refused without leaking a payload.')
}
