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
  let checked = 0
  for (const [root, paths] of groups) {
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
    }
  }
  return { changed, failed, checked }
}

/**
 * 按语言给审计结果分组，便于判断是不是某种语言的预设出了问题。
 * @param {{ checked: number; needsFix: number; fixed: number; remaining: number; files: string[] }} audit - 审计摘要
 * @param {readonly string[]} paths - 参与审计的绝对路径
 * @returns {{ language: string; checked: number; fixed: number; needsFix: number }[]} 分组结果，按语言名排序
 */
export function groupByLanguage(audit, paths) {
  const groups = new Map()
  const fixedSet = new Set(Array.isArray(audit.files) ? audit.files : [])
  for (const absolute of paths) {
    const decision = classify(absolute)
    const key = decision.kind === 'code'
      ? (decision.language ?? decision.display ?? 'other')
      : 'non-code'
    const group = groups.get(key) ?? { language: key, checked: 0, fixed: 0, needsFix: 0 }
    group.checked += 1
    if (fixedSet.has(absolute)) {
      group.fixed += 1
      group.needsFix += 1
    }
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => left.language.localeCompare(right.language))
}

/**
 * 把分组压成一行可读摘要。
 * @param {{ language: string; checked: number; fixed: number; needsFix: number }[]} groups - 分组
 * @returns {string} 摘要，如 `javascript 3 检 1 修；python 1 检 0 修`
 */
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
 * Audit the files one module touched.
 * @param {readonly string[]} files - absolute paths of files the module wrote.
 * @param {{ mode?: 'report' | 'fix' }} [options] - `fix` rewrites what the report flags, `report` only checks.
 * @returns {Promise<{ checked: number; needsFix: number; fixed: number; remaining: number; files: string[] }>} audit summary.
 */
export async function auditFiles(files, options = {}) {
  const mode = options.mode === 'report' ? 'report' : 'fix'
  const groups = groupByDirectory(files)
  if (groups.size === 0) return { checked: 0, needsFix: 0, fixed: 0, remaining: 0, files: [], byLanguage: [] }

  const originalPaths = files.filter((file) => typeof file === 'string' && file !== '')
  const report = await runPass(groups, 'report')
  if (mode === 'report') {
    const summary = {
      checked: report.checked,
      needsFix: report.changed.length,
      fixed: 0,
      remaining: report.failed.length,
      files: report.changed,
    }
    return { ...summary, byLanguage: groupByLanguage(summary, originalPaths) }
  }
  if (report.changed.length === 0) {
    const summary = { checked: report.checked, needsFix: 0, fixed: 0, remaining: report.failed.length, files: [] }
    return { ...summary, byLanguage: groupByLanguage(summary, originalPaths) }
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
  }
  return { ...summary, byLanguage: groupByLanguage(summary, originalPaths) }
}
