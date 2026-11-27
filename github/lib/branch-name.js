/**
 * 分支命名约定：`<type>/<issue>-<slug>`。
 *
 * 多模块并行时，分支名是唯一能一眼看出「属于哪个 Issue、哪种改动」的地方。
 * 这里只做解析与检查，不碰 git；改不改名由调用方决定。
 */

/** 允许的 type，与 Conventional Commits 的常用集合一致。 */
export const BRANCH_TYPES = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'perf', 'style']

/** 分支名格式：type/编号-短描述。 */
const PATTERN = /^(?<type>[a-z]+)\/(?<issue>\d+)-(?<slug>[a-z0-9][a-z0-9-]*)$/u

/**
 * 解析分支名。
 * @param {unknown} name - 分支名
 * @returns {{ type: string; issue: number; slug: string } | null} 解析结果，不符合约定返回 null
 */
export function parseBranchName(name) {
  const match = PATTERN.exec(String(name ?? '').trim())
  if (match === null) return null
  const { type, issue, slug } = match.groups
  if (!BRANCH_TYPES.includes(type)) return null
  return { type, issue: Number(issue), slug }
}

/**
 * 按约定生成分支名。
 * @param {{ type: string; issue: number | string; slug: string }} parts - 组成
 * @returns {string} 分支名；参数非法时抛错，避免生成看着对但其实错的名字
 */
export function branchNameFor(parts) {
  const type = String(parts?.type ?? '').trim()
  const issue = Number(parts?.issue)
  const slug = String(parts?.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  if (!BRANCH_TYPES.includes(type)) throw new Error(`type 必须是 ${BRANCH_TYPES.join(' / ')}`)
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('issue 必须是正整数')
  if (slug === '') throw new Error('slug 不能为空')
  return `${type}/${issue}-${slug}`
}

/**
 * 检查一组分支是否适合并行推进。
 * @param {string[]} names - 分支名
 * @returns {{ problems: string[]; parsed: { name: string; parts: { type: string; issue: number; slug: string } | null }[] }} 结论
 */
export function checkBranchPlan(names) {
  const parsed = (Array.isArray(names) ? names : []).map((name) => ({
    name: String(name),
    parts: parseBranchName(name),
  }))
  const problems = []

  for (const item of parsed) {
    if (item.parts === null) problems.push(`分支 ${item.name} 不符合 <type>/<issue>-<slug> 约定`)
  }

  const seen = new Set()
  for (const item of parsed) {
    if (seen.has(item.name)) problems.push(`分支 ${item.name} 重复出现在计划里`)
    seen.add(item.name)
  }

  // 同一个 Issue 只该有一个分支：两个分支关同一个单，合并后必然有一个白做。
  const byIssue = new Map()
  for (const item of parsed) {
    if (item.parts === null) continue
    const existing = byIssue.get(item.parts.issue)
    if (existing === undefined) byIssue.set(item.parts.issue, [item.name])
    else existing.push(item.name)
  }
  for (const [issue, branches] of byIssue) {
    if (branches.length > 1)
      problems.push(`Issue #${issue} 被 ${branches.length} 个分支共用：${branches.join('、')}`)
  }

  return { problems, parsed }
}
