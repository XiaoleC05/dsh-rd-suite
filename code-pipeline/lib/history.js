/**
 * 审计历史：把每次审计的结论留一行，供面板回看。
 *
 * 环形保留，最多 50 条；文件损坏就当成空历史，不让面板因此打不开。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { join } from 'node:path'

/** 最多保留多少条记录。 */
export const HISTORY_LIMIT = 50

/**
 * 读历史。
 * @param {string} file - 历史文件路径
 * @returns {{ at: string; checked: number; needsFix: number; fixed: number; remaining: number; elapsedMs: number; slowest: string }[]} 记录（新的在前）
 */
export function readAuditHistory(file) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return []
  }
  const records = Array.isArray(parsed?.records) ? parsed.records : []
  return records.filter((record) => record !== null && typeof record === 'object')
}

/**
 * 追加一条记录并落盘（原子写：先写临时文件再改名）。
 * @param {string} file - 历史文件路径
 * @param {{ checked?: number; needsFix?: number; fixed?: number; remaining?: number; elapsedMs?: number; slowest?: string; at?: string }} entry - 本次审计摘要
 * @returns {{ appended: boolean; total: number }} 结果
 */
export function appendAuditRecord(file, entry) {
  const record = {
    at: typeof entry?.at === 'string' ? entry.at : new Date().toISOString(),
    checked: Number(entry?.checked) || 0,
    needsFix: Number(entry?.needsFix) || 0,
    fixed: Number(entry?.fixed) || 0,
    remaining: Number(entry?.remaining) || 0,
    elapsedMs: Number(entry?.elapsedMs) || 0,
    slowest: typeof entry?.slowest === 'string' ? entry.slowest : '',
  }
  const records = [record, ...readAuditHistory(file)].slice(0, HISTORY_LIMIT)
  try {
    mkdirSync(dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    writeFileSync(temporary, `${JSON.stringify({ version: 1, records }, null, 2)}\n`, 'utf8')
    renameSync(temporary, file)
    return { appended: true, total: records.length }
  } catch {
    // 历史写不进去不该影响审计本身：返回未追加，由调用方决定要不要提示。
    return { appended: false, total: 0 }
  }
}

/**
 * 审计历史的默认路径：与记忆库同目录，换项目也能延续。
 * @param {string} home - 用户目录
 * @returns {string} 文件路径
 */
export function auditHistoryFile(home) {
  return join(home, '.dsh', 'rd-suite', 'audit-history.json')
}
