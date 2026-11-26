#!/usr/bin/env node
// rd-kpi.mjs — 研发模式 KPI 统计。只读：在内存中解压会话日志，只输出聚合数字与结构化标记，不输出任何会话内容。
//
// 用法（推荐在 DSH 会话中经 scripts/node.ps1 运行，工作目录为模式仓库）：
//   pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/node.ps1 scripts/rd-kpi.mjs --days 7 --out evolution/kpi/2026-11-26.md --json evolution/kpi/2026-11-26.json
// 选项：
//   --days N             统计最近 N 天（默认 7；0 表示全部）
//   --since YYYY-MM-DD   起始日期（与 --until 配合，优先于 --days）
//   --until YYYY-MM-DD   结束日期（默认现在）
//   --presets a,b|all    只统计这些模式的会话（默认 rd,rd-scout,rd-review）
//   --sessions <dir>     会话日志目录（默认 $DSH_HOME/sessions 或 ~/.dsh/sessions）
//   --crisp <file>       Crisp 质量门禁日志（默认 $DSH_HOME/crisp/quality-gate.jsonl，存在时读取）
//   --miss-ratio R       未命中缓存输入的单价 / 命中缓存输入的单价（默认 10）
//   --output-ratio P     输出单价 / 命中缓存输入的单价（默认 15）
//   --out <file.md>      写 Markdown 报告；--json <file.json> 写 JSON
// 需要 node ≥ 22.15（zstd 解压）；DSH 自带的运行时满足要求。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { listSessions, readSessionLines, summarize } from './lib/session-log.mjs'

if (typeof zlib.zstdDecompressSync !== 'function') {
  console.error(`需要 node ≥ 22.15（当前 ${process.version}）：缺少 zlib.zstdDecompressSync。请改用 scripts/node.ps1 运行。`)
  process.exit(3)
}

// 目标值：本文件是唯一出处。复盘时按报告中的“目标”列判断。
const TARGETS = {
  K1: { label: '平均每次请求的上下文 token', op: '<=', value: 120000 },
  K2: { label: 'p90 每次请求的上下文 token', op: '<=', value: 200000 },
  K3: { label: '上下文超过 200k 的请求占比', op: '<=', value: 0.05, pct: true },
  K4: { label: '每条用户消息消耗的上下文 token（含子代理）', op: '<=', value: 8500000 },
  K5: { label: '每条用户消息的成本指数（命中缓存输入 = 1）', op: '<=', value: 10000000 },
  K6: { label: '工具调用失败率', op: '<=', value: 0.02, pct: true },
  K7: { label: '每 100 次工具调用中超过 20k 字符的结果数', op: '<=', value: 1 },
  K8: { label: '每 100 次 read 中重复读取未变化文件的次数', op: '<=', value: 2 },
  K9: { label: '改了文件的任务段中已标注分级的占比', op: '>=', value: 0.9, pct: true },
  K10: { label: 'L1–L3 任务段的最终回答带验收段落的占比', op: '>=', value: 0.9, pct: true },
  K11: { label: 'L3 任务段经过 review_agent 的占比', op: '>=', value: 0.9, pct: true },
  K12: { label: '用户消息中的返工信号占比', op: '<=', value: 0.06, pct: true },
}
const REWORK = /(不对|错了|不行|还是不|重新|重做|没用|没生效|没有生效|回退|撤销|不是我要|搞错|wrong|again|still not|revert|undo)/i
const LEVEL = /【\s*L([0-3])/
const ACCEPT = /\*\*验收\*\*|验证：/
const VERDICT = /VERDICT:\s*(PASS|FAIL|UNVERIFIED)/
const WRITE_TOOLS = new Set(['edit', 'write', 'apply_patch'])

// ───── 参数 ─────
const argv = process.argv.slice(2)
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt }
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const sessionsDir = opt('--sessions', path.join(dshHome, 'sessions'))
const crispFile = opt('--crisp', path.join(dshHome, 'crisp', 'quality-gate.jsonl'))
const presetArg = opt('--presets', 'rd,rd-scout,rd-review')
const presetFilter = presetArg === 'all' ? null : new Set(presetArg.split(',').map(s => s.trim()).filter(Boolean))
const missRatio = Number(opt('--miss-ratio', 10))
const outputRatio = Number(opt('--output-ratio', 15))
const now = Date.now()
const until = opt('--until') ? Date.parse(opt('--until')) + 86399999 : now
const days = Number(opt('--days', 7))
const since = opt('--since') ? Date.parse(opt('--since')) : days > 0 ? now - days * 86400000 : 0
const inWindow = t => typeof t === 'number' && t >= since && t <= until
if (!fs.existsSync(sessionsDir)) { console.error(`会话目录不存在：${sessionsDir}`); process.exit(2) }

// ───── 累加器 ─────
const inc = (m, k, by = 1) => { m[k] = (m[k] ?? 0) + by }
const A = {
  sessions: { top: 0, subagent: 0 }, presets: {}, human: 0, rework: 0,
  req: { top: 0, subagent: 0 }, prompt: [], uncached: 0, cached: 0, output: 0, outputs: [],
  over200k: 0, over400k: 0, firstPrompt: {},
  toolCalls: {}, toolErrors: {}, toolChars: {}, toolResults: 0, toolErrorTotal: 0, bigResults: 0,
  reads: 0, rereads: 0, shellResults: 0, shellNonZero: 0,
  compactions: 0, prunes: 0, turnEnd: {},
  skillLoads: {}, skillInvocations: {}, delegations: {}, verdicts: {},
  workSpans: 0, workSpansLeveled: 0, levels: {}, workL123: 0, workWithAcceptance: 0, workWithTotals: 0, workUnverified: 0,
  l3Spans: 0, l3Reviewed: 0, l0WithEdits: 0,
}
const feedback = new Map()
const perSession = []
const parseArgs = a => { if (typeof a === 'string') { try { return JSON.parse(a) } catch { return {} } } return a ?? {} }
const textOf = content => Array.isArray(content) ? content.filter(c => c?.type === 'text').map(c => c.text ?? '').join('') : typeof content === 'string' ? content : ''

// ───── 扫描 ─────
let scanned = 0, undecodable = 0
for (const s of listSessions(sessionsDir)) {
  let lines
  try { ({ lines } = readSessionLines(s.file)) } catch (e) { undecodable++; console.error(`跳过无法解码的会话 ${s.sessionDir}：${e.message}`); continue }
  scanned++
  const header = lines[0] ?? {}
  const origin = header.parentSession ? 'subagent' : 'top'
  let preset = header.agentPreset ?? null
  for (const e of lines) if (e?.type === 'agent-preset/selected' && e.data?.agentPreset) preset = e.data.agentPreset
  if (presetFilter && !presetFilter.has(preset)) continue
  if (!lines.some(e => inWindow(e?.time))) continue
  A.sessions[origin]++
  inc(A.presets, `${preset ?? '?'}|${origin}`)

  const S = {
    id: s.sessionDir, ws: s.workspaceKey, origin, start: null, human: 0, rework: 0, requests: 0, promptSum: 0, maxPrompt: 0,
    levels: {}, acIds: new Set(), acceptance: 0, reviewCalls: 0, verdicts: {}, rereads: 0, bigResults: 0,
  }
  const callNames = new Map()
  const readKeys = {}
  let firstSeen = false
  let level = null, reviewSinceLevel = false
  let span = null
  const openSpan = () => { span = { work: false, lastFinal: null } }
  const closeSpan = () => {
    if (origin !== 'top' || !span) return
    if (span.work) {
      A.workSpans++
      if (level !== null) {
        A.workSpansLeveled++
        inc(A.levels, 'L' + level)
        if (level === '0') A.l0WithEdits++
        else {
          A.workL123++
          if (span.lastFinal !== null && ACCEPT.test(span.lastFinal)) A.workWithAcceptance++
          if (span.lastFinal !== null && /合计\s*\d+\s*\/\s*\d+/.test(span.lastFinal)) A.workWithTotals++
          if (span.lastFinal !== null && /未验证/.test(span.lastFinal)) A.workUnverified++
        }
        if (level === '3') { A.l3Spans++; if (reviewSinceLevel) A.l3Reviewed++ }
      }
    }
    span = null
  }
  openSpan()

  for (let i = 1; i < lines.length; i++) {
    const e = lines[i]
    if (!e || !inWindow(e.time)) continue
    if (S.start === null) S.start = e.time
    const d = e.data ?? {}
    switch (e.type) {
      case 'assistant/message': {
        const u = d.usage
        if (u) {
          const miss = u.inputTokens ?? 0, hit = u.cacheReadTokens ?? 0, out = u.outputTokens ?? 0
          const p = miss + hit
          A.req[origin]++; A.prompt.push(p)
          A.uncached += miss; A.cached += hit; A.output += out; A.outputs.push(out)
          if (p > 200000) A.over200k++
          if (p > 400000) A.over400k++
          if (!firstSeen) { firstSeen = true; (A.firstPrompt[`${preset ?? '?'}|${origin}`] ??= []).push(p) }
          S.requests++; S.promptSum += p; S.maxPrompt = Math.max(S.maxPrompt, p)
        }
        const content = d.message?.content ?? []
        const hasCall = Array.isArray(content) && content.some(c => c?.type === 'tool-call')
        const text = textOf(content)
        if (origin === 'top' && text) {
          const m = LEVEL.exec(text)
          if (m) { level = m[1]; reviewSinceLevel = false; inc(S.levels, 'L' + m[1]) }
          for (const ac of text.matchAll(/AC-(\d+)/g)) S.acIds.add(ac[1])
          if (!hasCall && text.trim()) { span.lastFinal = text; if (ACCEPT.test(text)) S.acceptance++ }
        }
        break
      }
      case 'user/message': {
        const kind = d.source?.kind
        if (kind === 'user' && origin === 'top') {
          closeSpan(); openSpan()
          A.human++; S.human++
          if (REWORK.test(textOf(d.content))) { A.rework++; S.rework++ }
        }
        if (kind === 'skill-invocation' && d.source?.name) inc(A.skillInvocations, d.source.name)
        if (kind === 'subagent-settled') {
          const v = VERDICT.exec(textOf(d.content))
          if (v) { inc(A.verdicts, v[1]); inc(S.verdicts, v[1]) }
        }
        break
      }
      case 'tool/call':
      case 'tool/ptc-dispatch': {
        const name = d.name ?? '?'
        const args = parseArgs(d.arguments)
        inc(A.toolCalls, name)
        if (e.type === 'tool/call' && d.callId) callNames.set(d.callId, name)
        if (name === 'skill' && args.name) inc(A.skillLoads, args.name)
        if (['subagent', 'review_agent', 'subagent_fork'].includes(name)) {
          inc(A.delegations, name === 'subagent' ? `subagent:${args.agent_preset ?? '默认'}` : name)
          if (name === 'review_agent') { reviewSinceLevel = true; S.reviewCalls++ }
        }
        if (WRITE_TOOLS.has(name)) {
          if (span) span.work = true
          if (args.file_path) for (const k of Object.keys(readKeys)) if (k.startsWith(args.file_path + '|')) delete readKeys[k]
        }
        if (name === 'read' && args.file_path) {
          A.reads++
          const k = `${args.file_path}|${args.offset ?? ''}|${args.limit ?? ''}`
          readKeys[k] = (readKeys[k] ?? 0) + 1
          if (readKeys[k] > 1) { A.rereads++; S.rereads++ }
        }
        if (e.type === 'tool/ptc-dispatch') accountResult(S, name, d.isError, textOf(d.content))
        break
      }
      case 'tool/result': {
        if (e.surfaceOp && typeof e.surfaceOp === 'object' && e.surfaceOp.op === 'replace') break
        const m = d.message ?? {}
        accountResult(S, callNames.get(m.toolCallId) ?? '?', m.isError, textOf(m.content))
        break
      }
      case 'compaction/end': A.compactions++; break
      case 'compaction/prune': A.prunes++; break
      case 'turn/end': inc(A.turnEnd, d.reason?.kind ?? '?'); break
      case 'feedback/message-put':
        if (d.item?.messageId && /^(positive|negative)$/.test(d.item.rating)) feedback.set(`${s.sessionDir}|${d.item.messageId}`, d.item.rating)
        break
      case 'feedback/message-delete':
        if (d.messageId) feedback.delete(`${s.sessionDir}|${d.messageId}`)
        break
      default: break
    }
  }
  closeSpan()
  if (origin === 'top' && S.requests > 0) perSession.push(S)
}
function accountResult(S, name, isError, text) {
  A.toolResults++
  inc(A.toolChars, name, text.length)
  if (isError) { A.toolErrorTotal++; inc(A.toolErrors, name) }
  if (text.length > 20000) { A.bigResults++; S.bigResults++ }
  if (name === 'pwsh' || name === 'bash') {
    A.shellResults++
    const m = /\[exit code: (-?\d+)\]/.exec(text)
    if (m && m[1] !== '0') A.shellNonZero++
  }
}
const fb = { positive: 0, negative: 0 }
for (const r of feedback.values()) fb[r]++

// ───── 抽样会话（结构化指标，不含内容） ─────
const samples = []
const pool = [...perSession]
const take = (label, pick) => { if (!pool.length) return; const s = pick(pool); pool.splice(pool.indexOf(s), 1); samples.push({ label, s }) }
take('上下文最大', p => p.reduce((a, b) => (b.promptSum / b.requests > a.promptSum / a.requests ? b : a)))
take('返工信号最多', p => p.reduce((a, b) => (b.rework > a.rework || (b.rework === a.rework && b.requests > a.requests) ? b : a)))
take('抽样', p => p[[...p.map(x => x.id).join('')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % p.length])

// ───── Crisp ─────
const crisp = { checks: 0, decisions: {}, failOpen: 0, followups: 0, criticTokens: 0, present: false }
if (fs.existsSync(crispFile)) {
  crisp.present = true
  for (const line of fs.readFileSync(crispFile, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let r; try { r = JSON.parse(line) } catch { continue }
    if (!inWindow(Date.parse(r.ts))) continue
    if (r.event === 'crisp_quality_check') {
      crisp.checks++; inc(crisp.decisions, r.decision ?? '?')
      if (r.fail_open) crisp.failOpen++
      crisp.criticTokens += Number(r.critic_tokens) || 0
    }
    if (r.event === 'crisp_guard_followup') crisp.followups++
  }
}

// ───── 指标 ─────
const P = summarize(A.prompt)
const reqAll = A.req.top + A.req.subagent
const promptTotal = A.cached + A.uncached
const costUnits = A.cached + missRatio * A.uncached + outputRatio * A.output
const ratio = (a, b) => (b ? a / b : null)
const toolCallTotal = Object.values(A.toolCalls).reduce((a, b) => a + b, 0)
const K = {
  K1: P.n ? P.mean : null,
  K2: P.n ? P.p90 : null,
  K3: ratio(A.over200k, P.n),
  K4: ratio(promptTotal, A.human),
  K5: ratio(costUnits, A.human),
  K6: ratio(A.toolErrorTotal, A.toolResults),
  K7: toolCallTotal ? (100 * A.bigResults) / toolCallTotal : null,
  K8: A.reads ? (100 * A.rereads) / A.reads : null,
  K9: ratio(A.workSpansLeveled, A.workSpans),
  K10: ratio(A.workWithAcceptance, A.workL123),
  K11: ratio(A.l3Reviewed, A.l3Spans),
  K12: ratio(A.rework, A.human),
}
const fmtN = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtV = (k, v) => (v === null ? '—' : TARGETS[k].pct ? `${(v * 100).toFixed(1)}%` : fmtN(v, v < 100 ? 1 : 0))
const status = (k, v) => (v === null ? '无数据' : (TARGETS[k].op === '<=' ? v <= TARGETS[k].value : v >= TARGETS[k].value) ? '达标' : '未达标')
const top = (m, n = 15) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n)
const kv = m => top(m).map(([k, v]) => `${k}=${v}`).join('，') || '—'
const iso = t => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '最早')

const md = []
md.push('# 研发模式 KPI 报告', '')
md.push(`- 窗口：${iso(since)} → ${iso(until)}（UTC）；模式过滤：${presetArg}；扫描会话文件 ${scanned} 个${undecodable ? `，无法解码 ${undecodable} 个（结果不可信，先排查 node 版本）` : ''}`)
md.push(`- 纳入会话：顶层 ${A.sessions.top}，子代理 ${A.sessions.subagent}；用户消息 ${A.human}；LLM 请求 ${fmtN(reqAll)}（顶层 ${fmtN(A.req.top)}，子代理 ${fmtN(A.req.subagent)}）`)
md.push(`- 模式分布：${top(A.presets, 20).map(([k, v]) => `${k}=${v}`).join('，') || '—'}`, '')
md.push('## 核心指标', '', '| 编号 | 指标 | 本期 | 目标 | 状态 |', '|---|---|---|---|---|')
for (const k of Object.keys(TARGETS)) {
  const t = TARGETS[k]
  md.push(`| ${k} | ${t.label} | ${fmtV(k, K[k])} | ${t.op} ${t.pct ? (t.value * 100).toFixed(0) + '%' : fmtN(t.value)} | ${status(k, K[k])} |`)
}
md.push('', '## Token', '')
md.push(`- 上下文 token 合计 ${fmtN(promptTotal)}：命中缓存 ${fmtN(A.cached)}，未命中 ${fmtN(A.uncached)}（${promptTotal ? ((100 * A.uncached) / promptTotal).toFixed(2) : '—'}%）；输出 ${fmtN(A.output)}`)
md.push(`- 每次请求上下文：p50 ${fmtN(P.p50)}，p90 ${fmtN(P.p90)}，最大 ${fmtN(P.max)}；超过 200k ${fmtN(A.over200k)} 次，超过 400k ${fmtN(A.over400k)} 次`)
const O = summarize(A.outputs)
md.push(`- 每次请求输出：p50 ${fmtN(O.p50)}，p90 ${fmtN(O.p90)}，最大 ${fmtN(O.max)}`)
md.push(`- 成本指数 ${fmtN(costUnits)}（命中缓存输入 ×1、未命中 ×${missRatio}、输出 ×${outputRatio}；按实际单价调整 --miss-ratio / --output-ratio）`)
md.push(`- 每条用户消息的 LLM 请求数（顶层）：${fmtN(ratio(A.req.top, A.human), 1)}；压缩 ${A.compactions} 次，结果裁剪 ${A.prunes} 次`)
md.push(`- 首轮请求上下文（固定前缀 + 首条消息）中位数：${Object.entries(A.firstPrompt).map(([k, v]) => `${k}=${fmtN(summarize(v).p50)}（n=${v.length}）`).join('，') || '—'}`, '')
md.push('## 工具', '', '| 工具 | 调用 | 失败 | 结果字符 |', '|---|---|---|---|')
for (const [name, n] of top(A.toolCalls, 20)) md.push(`| ${name} | ${n} | ${A.toolErrors[name] ?? 0} | ${fmtN(A.toolChars[name] ?? 0)} |`)
md.push('', `- 工具结果 ${fmtN(A.toolResults)} 个，失败 ${fmtN(A.toolErrorTotal)}，超过 20k 字符 ${fmtN(A.bigResults)}；read ${fmtN(A.reads)} 次，其中重复读取未变化文件 ${fmtN(A.rereads)} 次`)
md.push(`- Shell 结果 ${fmtN(A.shellResults)} 个，非零退出 ${fmtN(A.shellNonZero)}（${A.shellResults ? ((100 * A.shellNonZero) / A.shellResults).toFixed(1) : '—'}%）`, '')
md.push('## 技能与子代理', '')
md.push(`- 模型加载技能：${top(A.skillLoads).map(([k, v]) => `${k}×${v}`).join('，') || '无'}`)
md.push(`- 用户 /调用技能：${top(A.skillInvocations).map(([k, v]) => `${k}×${v}`).join('，') || '无'}`)
md.push(`- 委派：${top(A.delegations).map(([k, v]) => `${k}×${v}`).join('，') || '无'}；验收结论：${kv(A.verdicts)}`, '')
md.push('## 流程合规（顶层会话，按任务段统计）', '')
md.push(`- 任务段 = 从一条用户消息到下一条用户消息；分级沿用会话中最近一次【L…】标记；只统计改了文件（edit / write / apply_patch）的任务段。`)
md.push(`- 改了文件的任务段 ${A.workSpans} 个：已标注分级 ${A.workSpansLeveled}（${kv(A.levels)}）；标为 L0 却改了文件 ${A.l0WithEdits}`)
md.push(`- L1–L3 任务段 ${A.workL123} 个：最终回答带验收段落 ${A.workWithAcceptance}，带“合计 x/y” ${A.workWithTotals}，提到“未验证” ${A.workUnverified}；L3 任务段 ${A.l3Spans} 个，其中调用过 review_agent ${A.l3Reviewed}`, '')
md.push('## 质量信号', '')
md.push(`- 返工信号：${A.rework}/${A.human} 条用户消息含纠正类措辞（启发式，只看趋势）`)
md.push(`- 消息反馈（当前有效）：好评 ${fb.positive}，差评 ${fb.negative}`)
md.push(`- 轮次结束原因：${kv(A.turnEnd)}`)
md.push(crisp.present
  ? `- Crisp：检查 ${crisp.checks} 次，结果 ${kv(crisp.decisions)}，失败放行 ${crisp.failOpen}，改写 ${crisp.followups}，评审 token ${fmtN(crisp.criticTokens)}（Crisp 日志不区分模式）`
  : '- Crisp：未找到日志文件', '')
md.push('## 抽样会话（结构化指标，供抽样评审）', '')
if (samples.length) {
  md.push('| 类别 | 工作区 | 开始（UTC） | 用户消息 | 请求 | 平均上下文 | 最大上下文 | 分级标记 | AC 编号数 | 验收段落 | review_agent / 结论 | 重复读取 | 超大结果 | 返工信号 | 会话目录 |')
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const { label, s } of samples) {
    md.push(`| ${label} | ${s.ws} | ${iso(s.start)} | ${s.human} | ${s.requests} | ${fmtN(s.promptSum / s.requests)} | ${fmtN(s.maxPrompt)} | ${kv(s.levels)} | ${s.acIds.size} | ${s.acceptance} | ${s.reviewCalls} / ${kv(s.verdicts)} | ${s.rereads} | ${s.bigResults} | ${s.rework} | ${s.id} |`)
  }
} else md.push('无顶层会话。')
md.push('', '## 口径', '')
md.push('- 上下文 token = inputTokens（未命中缓存）+ cacheReadTokens；只统计窗口内的事件；会话按最后一次选择的模式归类。')
md.push('- K8：同一文件以相同 offset/limit 再次读取且期间没有被 edit/write 改过，才算重复读取。')
md.push('- K9–K11：依据回答中的“【L…】”“**验收**”“验证：”“合计 x/y”等固定标记判断；K12 为关键词启发式。')
md.push('- 本报告只含聚合数字与结构化标记，不含任何会话内容。')
const report = md.join('\n') + '\n'

if (opt('--out')) { fs.mkdirSync(path.dirname(opt('--out')), { recursive: true }); fs.writeFileSync(opt('--out'), report) }
if (opt('--json')) {
  fs.mkdirSync(path.dirname(opt('--json')), { recursive: true })
  const sampleJson = samples.map(({ label, s }) => ({ label, ...s, acIds: s.acIds.size }))
  fs.writeFileSync(opt('--json'), JSON.stringify({ window: { since, until }, presets: presetArg, kpi: K, targets: TARGETS, totals: { promptTotal, cached: A.cached, uncached: A.uncached, output: A.output, costUnits, requests: reqAll, human: A.human }, detail: A, feedback: fb, samples: sampleJson, crisp }, null, 2))
}
process.stdout.write(report)
