/**
 * gh 版本识别：老版本缺少某些 JSON 字段，症状是「排队状态未知」「检查数 0」。
 *
 * 这里只做识别与提示，不阻断任何操作——版本低的机器照样能跑主流程，
 * 只是拿不到自动合并状态这类新字段。
 */

/** 建议的最低 gh 版本：低于它，autoMergeRequest 与 statusCheckRollup 可能缺失。 */
export const MINIMUM_GH_VERSION = '2.30.0'

/**
 * 解析 `gh version 2.106.0 (2026-11-25)` 这类输出。
 * @param {unknown} text - gh --version 的 stdout
 * @returns {{ major: number; minor: number; patch: number; text: string } | null} 解析结果
 */
export function parseGhVersion(text) {
  const match = /(\d+)\.(\d+)\.(\d+)/u.exec(String(text ?? ''))
  if (match === null) return null
  const [major, minor, patch] = match.slice(1).map(Number)
  return { major, minor, patch, text: `${major}.${minor}.${patch}` }
}

/**
 * 比较两个版本字符串。
 * @param {string} left - 版本
 * @param {string} right - 版本
 * @returns {number} 负数表示 left 更小
 */
export function compareVersions(left, right) {
  const parse = (value) =>
    String(value)
      .split('.')
      .map((part) => Number(part) || 0)
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return 0
}

/**
 * 判断版本是否够用。
 * @param {{ major: number; minor: number; patch: number; text: string } | null} version - 解析结果
 * @param {string} [minimum] - 最低版本
 * @returns {{ ok: boolean; warning?: string }} 结论
 */
export function checkGhVersion(version, minimum = MINIMUM_GH_VERSION) {
  if (version === null) {
    return {
      ok: false,
      warning: '读不到 gh 版本：自动合并与检查项字段可能不可用，其余流程不受影响',
    }
  }
  if (compareVersions(version.text, minimum) >= 0) return { ok: true }
  return {
    ok: false,
    warning: `gh ${version.text} 低于建议的 ${minimum}：autoMergeRequest 与 statusCheckRollup 可能缺失，升级 gh 可解决`,
  }
}
