/**
 * 发版前的一致性校验：tag 与版本号、CHANGELOG 条目对不对得上。
 *
 * 纯函数：调用方负责把 package.json 的 version 与 CHANGELOG 文本读进来，
 * 读不到就传 undefined，这一项自动跳过（校验不了不等于通过，会记进 warnings）。
 */

/**
 * 去掉 tag 的 v 前缀与构建后缀，得到用于比较的版本号。
 * @param {unknown} tag - 版本标签，如 v1.4.0 / 1.4.0
 * @returns {string} 规范化版本号
 */
export function normalizeVersion(tag) {
  return String(tag ?? '')
    .trim()
    .replace(/^v/iu, '')
    .split(/[+-]/u)[0]
    .trim()
}

/**
 * 校验 tag、package.json 版本与 CHANGELOG 标题是否一致。
 * @param {{ tag?: unknown; version?: unknown; changelog?: unknown }} input - 待校验值；undefined 表示该项不可用
 * @returns {{ ok: boolean; errors: string[]; warnings: string[]; version: string }} 结论
 */
export function checkReleaseConsistency(input = {}) {
  const version = normalizeVersion(input.tag)
  const errors = []
  const warnings = []

  if (version === '') {
    errors.push('tag 规范化后为空：需要一个形如 v1.4.0 的语义化版本号')
    return { ok: false, errors, warnings, version }
  }

  if (typeof input.version === 'string' && input.version.trim() !== '') {
    const declared = normalizeVersion(input.version)
    if (declared !== version)
      errors.push(`package.json 版本是 ${declared}，与 tag ${version} 不一致`)
  } else {
    warnings.push('没有读到 package.json 的 version，跳过版本一致性校验')
  }

  if (typeof input.changelog === 'string' && input.changelog.trim() !== '') {
    // 标题形如 `## 1.4.0 — 2026-11-27` 或 `## v1.4.0`，允许带日期与补充说明。
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    const heading = new RegExp(`^#{2,3}\\s*v?${escaped}(?:[\\s—–-]|$)`, 'mu')
    if (!heading.test(input.changelog)) errors.push(`CHANGELOG 里没有 ${version} 的版本标题`)
  } else {
    warnings.push('没有读到 CHANGELOG，跳过条目校验')
  }

  return { ok: errors.length === 0, errors, warnings, version }
}

/**
 * 从仓库根读取 package.json 版本与 CHANGELOG 文本。
 * @param {string} repositoryRoot - 仓库根
 * @param {(path: string) => string} readText - 读取文件（缺失时抛错）
 * @returns {{ version?: string; changelog?: string; warnings: string[] }} 读到的值
 */
export function readReleaseFacts(repositoryRoot, readText) {
  const warnings = []
  let version
  let changelog
  for (const candidate of ['package.json']) {
    try {
      const parsed = JSON.parse(readText(`${repositoryRoot}/${candidate}`))
      if (typeof parsed?.version === 'string') version = parsed.version
    } catch {
      warnings.push(`读不到 ${candidate}，跳过版本一致性校验`)
    }
  }
  for (const candidate of ['CHANGELOG.md', 'docs/CHANGELOG.md']) {
    try {
      changelog = readText(`${repositoryRoot}/${candidate}`)
      break
    } catch {
      // 换下一个候选路径。
    }
  }
  if (changelog === undefined) warnings.push('读不到 CHANGELOG，跳过条目校验')
  return { version, changelog, warnings }
}
