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

import { basename, dirname } from 'node:path'

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
 * Audit the files one module touched.
 * @param {readonly string[]} files - absolute paths of files the module wrote.
 * @param {{ mode?: 'report' | 'fix' }} [options] - `fix` rewrites what the report flags, `report` only checks.
 * @returns {Promise<{ checked: number; needsFix: number; fixed: number; remaining: number; files: string[] }>} audit summary.
 */
export async function auditFiles(files, options = {}) {
  const mode = options.mode === 'report' ? 'report' : 'fix'
  const groups = groupByDirectory(files)
  if (groups.size === 0) return { checked: 0, needsFix: 0, fixed: 0, remaining: 0, files: [] }

  const report = await runPass(groups, 'report')
  if (mode === 'report') {
    return {
      checked: report.checked,
      needsFix: report.changed.length,
      fixed: 0,
      remaining: report.failed.length,
      files: report.changed,
    }
  }
  if (report.changed.length === 0) {
    return {
      checked: report.checked,
      needsFix: 0,
      fixed: 0,
      remaining: report.failed.length,
      files: [],
    }
  }

  const fixGroups = groupByDirectory(report.changed)
  const applied = await runPass(fixGroups, 'fix')
  const fixed = report.changed.length - applied.changed.length - applied.failed.length
  return {
    checked: report.checked,
    needsFix: report.changed.length,
    fixed: fixed < 0 ? 0 : fixed,
    remaining: report.failed.length + applied.failed.length + applied.changed.length,
    files: report.changed,
  }
}
