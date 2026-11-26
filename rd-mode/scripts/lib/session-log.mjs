// session-log.mjs — 读取 DSH 会话日志（session.vN.jsonl.zstd）的只读工具函数。
// 在内存中解压，不向 DSH 数据目录写入任何内容。zstd 解压需要 node ≥ 22.15。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/** Enumerate session log files under <sessionsRoot>/<workspace-key>/<session-id>/session.vN.jsonl[.zstd]. */
export function listSessions(sessionsRoot) {
  const out = []
  for (const ws of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!ws.isDirectory()) continue
    const wsDir = path.join(sessionsRoot, ws.name)
    for (const s of fs.readdirSync(wsDir, { withFileTypes: true })) {
      if (!s.isDirectory()) continue
      const sDir = path.join(wsDir, s.name)
      const files = fs.readdirSync(sDir).filter(f => /^session(\.v\d+)?\.jsonl(\.zstd)?$/.test(f))
      if (files.length === 0) continue
      // pick the numerically highest generation
      files.sort((a, b) => gen(b) - gen(a))
      const file = path.join(sDir, files[0])
      const st = fs.statSync(file)
      out.push({ workspaceKey: ws.name, sessionDir: s.name, file, sizeBytes: st.size, mtimeMs: st.mtimeMs, generations: files })
    }
  }
  return out
}
function gen(name) { const m = /^session\.v(\d+)\./.exec(name); return m ? Number(m[1]) : 0 }

/** Decode one session file fully in memory. Returns { lines: object[], rawBytes, parseErrors }. */
export function readSessionLines(file) {
  const buf = fs.readFileSync(file)
  let text
  let frameCount = 0
  let tornTail = false
  if (file.endsWith('.zstd')) {
    // The artifact is a concatenation of independent checksummed Zstandard frames
    // (one header frame + one frame per durable append batch). Node's one-shot
    // zstdDecompressSync stops after the FIRST frame, so frames are located structurally
    // (port of scanZstdFrames in dsh-session-persistence-jsonl/src/zstd.ts) and decoded one by one.
    const scan = scanZstdFrames(buf)
    frameCount = scan.frames.length
    tornTail = scan.tornStart !== undefined
    const parts = []
    for (const f of scan.frames) parts.push(zlib.zstdDecompressSync(buf.subarray(f.start, f.end)))
    text = Buffer.concat(parts).toString('utf8')
  } else {
    text = buf.toString('utf8')
  }
  const lines = []
  let parseErrors = 0
  let start = 0
  while (start < text.length) {
    let end = text.indexOf('\n', start)
    if (end === -1) end = text.length
    if (end > start) {
      const s = text.slice(start, end)
      try { lines.push(JSON.parse(s)) } catch { parseErrors++ }
    }
    start = end + 1
  }
  return { lines, rawBytes: text.length, parseErrors, frameCount, tornTail }
}

const ZSTD_MAGIC = 0xFD2FB528
/** Locate complete zstd frames without decompressing (RFC 8878 frame/block headers). */
export function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`invalid zstd frame magic at byte ${offset}`)
    offset += 4
    if (offset === buffer.length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) throw new Error(`reserved zstd block type at byte ${offset - 3}`)
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

export function quantiles(arr, qs = [0.5, 0.9, 0.99]) {
  if (arr.length === 0) return Object.fromEntries(qs.map(q => ['p' + Math.round(q * 100), null]))
  const s = [...arr].sort((a, b) => a - b)
  const out = {}
  for (const q of qs) {
    const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))
    out['p' + Math.round(q * 100)] = s[idx]
  }
  return out
}

export function summarize(arr) {
  if (arr.length === 0) return { n: 0 }
  const s = [...arr].sort((a, b) => a - b)
  const sum = s.reduce((a, b) => a + b, 0)
  const pick = q => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]
  return { n: s.length, sum, mean: sum / s.length, min: s[0], p25: pick(0.25), p50: pick(0.5), p75: pick(0.75), p90: pick(0.9), p99: pick(0.99), max: s[s.length - 1] }
}

export function fmt(n, d = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'n/a'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
}

export function pct(a, b, d = 1) { return b ? (100 * a / b).toFixed(d) + '%' : 'n/a' }

export function inc(map, key, by = 1) { map[key] = (map[key] ?? 0) + by; return map }

export function topN(map, n = 30) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n)
}

/** JSON string length of any value (cheap proxy for payload chars). */
export function jlen(v) { if (v === undefined) return 0; try { return JSON.stringify(v).length } catch { return 0 } }
