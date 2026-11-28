/**
 * Module-level code audit.
 *
 * Every write through the editing tools is formatted immediately by the plugin
 * hook. This module covers the other half: when a module finishes, the files it
 * touched are checked as a group and corrected once, so a module never closes
 * with formatting drift that individual writes could not see (for example a
 * hand-written file, a generated file, or a file edited outside the tools).
 *
 * Report first, fix second: a file is only rewritten when the report proves it
 * differs from its preset, and the audit is idempotent by construction because
 * `standardize` re-checks after writing.
 */

import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { classify } from './languages.js'

import { standardize } from './standardize.js'

/** One file outcome, reduced to what the audit reports. */
const CHANGED = 'changed'
const FAILED = 'failed'

/**
 * Group absolute paths by directory so each directory is standardized once.
 * @param {readonly string[]} files - absolute paths.
 * @returns {Map<string, string[]>} directory to file names.
 */
function groupByDirectory(files) {
  const groups = new Map()
  for (const file of files) {
    if (typeof file !== 'string' || file === '') continue
    const directory = dirname(file)
    const names = groups.get(directory)
    if (names === undefined) groups.set(directory, [basename(file)])
    else if (!names.includes(basename(file))) names.push(basename(file))
  }
  return groups
}

/**
 * Run one standardization pass over a set of directories.
 * @param {Map<string, string[]>} groups - directory to file names.
 * @param {'report' | 'fix'} mode - pass mode.
 * @returns {Promise<{ changed: string[]; failed: string[]; checked: number }>} pass outcome.
 */
async function runPass(groups, mode) {
  const changed = []
  const failed = []
  const skippedFiles = []
  const timing = []
  let checked = 0
  for (const [root, paths] of groups) {
    const startedAt = performance.now()
    let result
    try {
      result = await standardize({ root, paths, mode })
    } catch {
      // An unreadable directory is not a formatting problem: skip it silently so
      // the module can still close, and let the delivery report stay honest.
      continue
    }
    const files = Array.isArray(result?.files) ? result.files : []
    const skipped = Array.isArray(result?.skipped) ? result.skipped : []
    checked += files.length
    for (const file of files) {
      if (file?.status === FAILED) failed.push(`${root}/${String(file.path ?? '')}`)
      else if (mode === 'report' && file?.status === CHANGED)
        changed.push(`${root}/${String(file.path ?? '')}`)
    }
    for (const entry of skipped) {
      if (entry?.status === FAILED) failed.push(`${root}/${String(entry.path ?? '')}`)
      // standardize 回的已经是绝对路径，别再拼 root，否则会变成双前缀。
      skippedFiles.push({ path: String(entry?.path ?? ''), reason: String(entry?.reason ?? 'unknown') })
    }
    // 按目录计时：慢在哪要能指到具体目录，而不是只给一个总数。
    timing.push({ root, files: files.length + skipped.length, ms: Math.round(performance.now() - startedAt) })
  }
  return { changed, failed, checked, skipped: skippedFiles, timing }
}

/**
 * 按语言给审计结果分组，便于判断是不是某种语言的预设出了问题。
 * @param {{ checked: number; needsFix: number; fixed: number; remaining: number; files: string[] }} audit - 审计摘要
 * @param {readonly string[]} paths - 参与审计的绝对路径
 * @param {'report' | 'fix'} [mode] - 审计模式：report 下不计已修数
 * @returns {{ language: string; checked: number; fixed: number; needsFix: number }[]} 分组结果，按语言名排序
 */
/**
 * 汇总计时：总耗时与最慢的目录分组。
 * @param {{ root: string; files: number; ms: number }[]} timing - 每组耗时
 * @param {number} startedAt - 起始时间戳
 * @returns {{ elapsedMs: number; slowestGroup?: { root: string; files: number; ms: number } }} 摘要
 */
export function timingSummary(timing, startedAt) {
  const groups = Array.isArray(timing) ? timing : []
  const slowest = groups.reduce(
    (slow, item) => (slow === null || item.ms > slow.ms ? item : slow),
    null,
  )
  return {
    // startedAt 必须来自 performance.now()；异常输入也不让耗时变成负数。
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...(slowest === null ? {} : { slowestGroup: slowest }),
  }
}

export function groupByLanguage(audit, paths, mode = 'fix') {
  const groups = new Map()
  // files 的语义是「需要关注的文件」：fix 模式是刚被改过的，report 模式是需要修的。
  // 所以 report 模式下这些文件只计 needsFix，绝不能计 fixed——否则报告会出现凭空的修复数。
  const dirtySet = new Set(Array.isArray(audit.files) ? audit.files : [])
  for (const absolute of paths) {
    const decision = classify(absolute)
    const key = decision.kind === 'code'
      ? (decision.language ?? decision.display ?? 'other')
      : 'non-code'
    const group = groups.get(key) ?? { language: key, checked: 0, fixed: 0, needsFix: 0 }
    group.checked += 1
    if (dirtySet.has(absolute)) {
      group.needsFix += 1
      if (mode !== 'report') group.fixed += 1
    }
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => left.language.localeCompare(right.language))
}

/**
 * 合并两组语言统计。
 * @param {object[]} left - 第一组
 * @param {object[]} right - 第二组
 * @returns {object[]} 合并结果，按语言名排序
 */
export function mergeLanguageGroups(left, right) {
  const merged = new Map()
  for (const group of [...left, ...right]) {
    const current = merged.get(group.language) ?? { language: group.language, checked: 0, fixed: 0, needsFix: 0 }
    current.checked += group.checked
    current.fixed += group.fixed
    current.needsFix += group.needsFix
    merged.set(group.language, current)
  }
  return [...merged.values()].sort((a, b) => a.language.localeCompare(b.language))
}

/**
 * 把分组压成一行可读摘要。
 * @param {{ language: string; checked: number; fixed: number; needsFix: number }[]} groups - 分组
 * @returns {string} 摘要，如 `javascript 3 检 1 修；python 1 检 0 修`
 */
/**
 * 跳过原因的中文解释：让「没被修」变成「为什么没修」。
 */
export const SKIP_REASONS = {
  'outside-p0': '不在十种预设语言范围内',
  'non-code': '不是代码文件',
  'not-code': '不是代码文件',
  'generated-minified': '生成或压缩文件，不做改写',
  'missing-preset': '没有可用的预设',
  'engine-error': '引擎报错，已跳过该文件',
  'not-idempotent': '格式化结果不稳定，已放弃该文件',
  'write-denied': '写入被策略拒绝（越界或只读）',
  unchanged: '格式已符合规范',
}

/**
 * 把跳过原因翻译成一句可读的话。
 * @param {string} reason - 原始原因码
 * @returns {string} 可读说明；未知原因原样返回
 */
export function describeSkipReason(reason) {
  return SKIP_REASONS[String(reason ?? '')] ?? String(reason ?? 'unknown')
}

export function describeLanguageGroups(groups) {
  return groups
    .map((group) => `${group.language} ${group.checked} 检 ${group.fixed} 修`)
    .join('；')
}


/** git status 里算作「改动」的状态前缀：新增、修改、重命名、复制、类型变更。 */
const CHANGED_STATUSES = new Set(['M', 'A', 'R', 'C', 'T'])

/**
 * 解析 `git status --porcelain` 的输出，取出改动文件的相对路径。
 * 删除的文件不参与审计；未跟踪文件算改动。
 * @param {string} text - porcelain 输出
 * @returns {string[]} 相对路径
 */
export function parseGitStatus(text) {
  const paths = []
  for (const line of String(text ?? '').split(/\r?\n/u)) {
    if (line.trim() === '') continue
    const status = line.slice(0, 2)
    const payload = line.slice(3).trim()
    if (payload === '') continue
    if (status.includes('D')) continue
    const indicator = [...status].find((char) => char !== ' ' && char !== '?')
    if (indicator === undefined) {
      // 未跟踪（??）：照样审计，新文件同样需要符合规范。
      paths.push(payload)
      continue
    }
    if (indicator === 'R' || indicator === 'C') {
      const next = payload.split(' -> ')[1]
      if (typeof next === 'string' && next !== '') paths.push(next)
      continue
    }
    if (CHANGED_STATUSES.has(indicator)) paths.push(payload)
  }
  return [...new Set(paths)]
}

/**
 * 列出仓库里改动过的代码文件（绝对路径）。
 * @param {{ root: string; run?: (command: string, args: string[]) => string }} options - 仓库根与可注入的命令执行器
 * @returns {string[]} 绝对路径
 */
export function changedPaths(options) {
  const run = options.run ?? ((command, args) => execFileSync(command, args, { encoding: 'utf8', cwd: options.root }))
  let output
  try {
    output = run('git', ['status', '--porcelain=v1', '--untracked-files=all'])
  } catch {
    return []
  }
  return parseGitStatus(output)
    .filter((relative) => classify(relative).kind === 'code')
    .map((relative) => join(options.root, relative))
}

/**
 * 只审计 git 改动过的文件。
 * @param {{ root: string; mode?: 'report' | 'fix'; run?: Function }} options - 仓库根、模式与可注入的执行器
 * @returns {Promise<{ checked: number; needsFix: number; fixed: number; remaining: number; files: string[]; byLanguage: object[] }>} 审计摘要
 */
export async function auditChanged(options) {
  const files = changedPaths(options)
  if (files.length === 0) return { checked: 0, needsFix: 0, fixed: 0, remaining: 0, files: [], byLanguage: [] }
  return auditFiles(files, { mode: options.mode === 'report' ? 'report' : 'fix' })
}


/**
 * 进程内审计缓存：绝对路径 → 文件指纹与上次判定。
 * 文件指纹用 mtime + size，任一变化即失效；只缓存「干净」的判定，
 * 有问题或解析失败的文件每次都重新检查，避免把一次失败永远记住。
 */
const AUDIT_CACHE = new Map()

/** 缓存键统一成正斜杠，避免 Windows 反斜杠与审计结果里的路径对不上。 */
function cacheKey(absolute) {
  return String(absolute).replaceAll('\\', '/')
}

/** 清空缓存（测试与长时间运行后的手动重置用）。 */
export function clearAuditCache() {
  AUDIT_CACHE.clear()
}

/**
 * 缓存现状。
 * @returns {{ size: number }} 条目数
 */
export function auditCacheStats() {
  return { size: AUDIT_CACHE.size }
}

/**
 * 读文件指纹，读不到返回 null。
 * @param {string} absolute - 绝对路径
 * @returns {{ mtimeMs: number; size: number } | null} 指纹
 */
function fingerprint(absolute) {
  try {
    const stats = statSync(absolute)
    return { mtimeMs: stats.mtimeMs, size: stats.size }
  } catch {
    return null
  }
}

/**
 * 按缓存把待审文件分成「可直接跳过」与「需要复审」两组。
 * @param {readonly string[]} files - 绝对路径
 * @returns {{ fresh: string[]; cached: string[] }} 分组
 */
function splitByCache(files) {
  const fresh = []
  const cached = []
  for (const absolute of files) {
    const print = fingerprint(absolute)
    const known = AUDIT_CACHE.get(cacheKey(absolute))
    if (print !== null && known !== undefined && known.mtimeMs === print.mtimeMs && known.size === print.size) {
      cached.push(absolute)
      continue
    }
    if (print === null) AUDIT_CACHE.delete(cacheKey(absolute))
    fresh.push(absolute)
  }
  return { fresh, cached }
}

/**
 * 记录审计后的判定：只有干净的文件进缓存。
 * @param {readonly string[]} files - 参与本次审计的文件
 * @param {{ files: string[]; remaining: number }} audit - 审计摘要
 * @returns {void}
 */
function rememberVerdicts(files, audit) {
  const dirty = new Set((Array.isArray(audit.files) ? audit.files : []).map(cacheKey))
  for (const absolute of files) {
    const print = fingerprint(absolute)
    if (print === null) continue
    if (dirty.has(cacheKey(absolute))) {
      AUDIT_CACHE.delete(cacheKey(absolute))
      continue
    }
    AUDIT_CACHE.set(cacheKey(absolute), { mtimeMs: print.mtimeMs, size: print.size })
  }
}

/**
 * Audit the files one module touched.
 * @param {readonly string[]} files - absolute paths of files the module wrote.
 * @param {{ mode?: 'report' | 'fix' }} [options] - `fix` rewrites what the report flags, `report` only checks.
 * @returns {Promise<{ checked: number; needsFix: number; fixed: number; remaining: number; files: string[] }>} audit summary.
 */
export async function auditFiles(files, options = {}) {
  const auditStartedAt = performance.now()
  const mode = options.mode === 'report' ? 'report' : 'fix'
  const requested = files.filter((file) => typeof file === 'string' && file !== '')
  // 未变化的文件直接跳过：只有上次判定干净、且 mtime 与 size 都没变才算命中。
  const useCache = options.cache !== false
  const { fresh, cached } = useCache ? splitByCache(requested) : { fresh: requested, cached: [] }
  const groups = groupByDirectory(fresh)
  if (groups.size === 0) {
    return {
      checked: cached.length,
      needsFix: 0,
      fixed: 0,
      remaining: 0,
      files: [],
      cached: cached.length,
      byLanguage: groupByLanguage({ checked: cached.length, needsFix: 0, fixed: 0, remaining: 0, files: [] }, cached, mode),
    }
  }

  const originalPaths = requested
  const report = await runPass(groups, 'report')
  // 跳过的文件与原因：只看总数无法判断是配置问题还是代码问题。
  const skipped = (Array.isArray(report.skipped) ? report.skipped : []).map((item) => ({
    path: String(item.path ?? ''),
    reason: String(item.reason ?? 'unknown'),
    detail: describeSkipReason(item.reason),
  }))
  if (mode === 'report') {
    const summary = {
      checked: report.checked,
      needsFix: report.changed.length,
      fixed: 0,
      remaining: report.failed.length,
      files: report.changed,
      reportOnly: true,
      skipped,
    }
    if (useCache) rememberVerdicts(fresh, summary)
    return {
      ...summary,
      checked: summary.checked + cached.length,
      cached: cached.length,
      byLanguage: mergeLanguageGroups(
        groupByLanguage(summary, fresh, mode),
        groupByLanguage({ checked: cached.length, needsFix: 0, fixed: 0, remaining: 0, files: [] }, cached, mode),
      ),
      ...timingSummary(report.timing, auditStartedAt),
    }
  }
  if (report.changed.length === 0) {
    const summary = {
      checked: report.checked,
      needsFix: 0,
      fixed: 0,
      remaining: report.failed.length,
      files: [],
      skipped,
    }
    if (useCache) rememberVerdicts(fresh, summary)
    return {
      ...summary,
      checked: summary.checked + cached.length,
      cached: cached.length,
      byLanguage: mergeLanguageGroups(
        groupByLanguage(summary, fresh, mode),
        groupByLanguage({ checked: cached.length, needsFix: 0, fixed: 0, remaining: 0, files: [] }, cached, mode),
      ),
      ...timingSummary(report.timing, auditStartedAt),
    }
  }

  const fixGroups = groupByDirectory(report.changed)
  const applied = await runPass(fixGroups, 'fix')
  const fixed = report.changed.length - applied.changed.length - applied.failed.length
  const summary = {
    checked: report.checked,
    needsFix: report.changed.length,
    fixed: fixed < 0 ? 0 : fixed,
    remaining: report.failed.length + applied.failed.length + applied.changed.length,
    files: report.changed,
    skipped,
  }
  if (useCache) rememberVerdicts(fresh, summary)
  return {
    ...summary,
    checked: summary.checked + cached.length,
    cached: cached.length,
    byLanguage: mergeLanguageGroups(
      groupByLanguage(summary, fresh, mode),
      groupByLanguage({ checked: cached.length, needsFix: 0, fixed: 0, remaining: 0, files: [] }, cached, mode),
    ),
    // 总耗时要含写入那一趟，否则「改文件慢」看不出来。
    ...timingSummary([...(report.timing ?? []), ...(applied.timing ?? [])], auditStartedAt),
  }
}
