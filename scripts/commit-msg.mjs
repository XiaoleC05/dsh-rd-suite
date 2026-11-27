#!/usr/bin/env node
/**
 * 提交信息校验与发布信息推导。
 *
 * 校验规则参考 commitlint（https://github.com/conventional-changelog/commitlint）：
 * `type(scope): subject`、类型白名单、header 长度、空行、正文行宽；发布推导参考
 * release-please（https://github.com/googleapis/release-please）：按类型定 semver 级别，
 * 并给出 CHANGELOG 条目草稿。
 *
 * 用法：
 *   node scripts/commit-msg.mjs .git/COMMIT_EDITMSG
 *   node scripts/commit-msg.mjs "feat(cli): 增加 --json"
 *   node scripts/commit-msg.mjs .git/COMMIT_EDITMSG --json
 */

import { readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** 允许的提交类型。 */
export const TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
]

/** 类型到 semver 级别；null 表示不触发发版。 */
const SEMVER = {
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  refactor: 'patch',
  revert: 'patch',
  test: null,
  docs: null,
  style: null,
  build: null,
  ci: null,
  chore: null,
}

/** CHANGELOG 分组。 */
const GROUPS = {
  feat: '新增',
  fix: '修复',
  perf: '性能',
  refactor: '重构',
  revert: '回退',
  test: '测试',
  docs: '文档',
  style: '格式',
  build: '构建',
  ci: 'CI',
  chore: '杂务',
}

const HEADER_PATTERN =
  /^(?<type>[a-z]+)(?:\((?<scope>[\w./-]+)\))?(?<breaking>!)?: (?<subject>.+)$/u

/**
 * 校验一条提交信息。
 * @param {string} message - 提交信息全文
 * @returns {{ ok: boolean; errors: string[]; warnings: string[]; type: string | null; scope: string | null; subject: string; semver: string | null; entry: string }} 结果
 */
/** 关闭关键词：与 GitHub 的 close/fix/resolve 三族一致。 */
const CLOSING = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/giu

/**
 * 校验提交信息与目标 Issue 的关联。
 * @param {string} message - 提交信息
 * @param {number | string} issueNumber - 期望关闭的 Issue 编号
 * @returns {{ ok: boolean; errors: string[]; linked: number[] }} 结论
 */
export function checkIssueLink(message, issueNumber) {
  const expected = Number(issueNumber)
  const linked = [...String(message ?? '').matchAll(CLOSING)].map((match) => Number(match[1]))
  if (!Number.isInteger(expected) || expected <= 0) {
    return { ok: false, errors: ['--issue 需要一个正整数编号'], linked }
  }
  if (linked.length === 0) {
    return { ok: false, errors: [`提交信息没有关闭任何 Issue，期望关闭 #${expected}`], linked }
  }
  if (!linked.includes(expected)) {
    const wrong = linked.map((number) => `#${number}`).join('、')
    return {
      ok: false,
      errors: [`提交信息关闭的是 ${wrong}，与期望的 #${expected} 不一致`],
      linked,
    }
  }
  return { ok: true, errors: [], linked }
}

export function checkCommitMessage(message) {
  const text = String(message ?? '')
    .replace(/\r\n/gu, '\n')
    .trim()
  const errors = []
  const warnings = []
  const [header = '', ...rest] = text.split('\n')
  const match = HEADER_PATTERN.exec(header)

  if (text === '') {
    return {
      ok: false,
      errors: ['提交信息为空'],
      warnings: [],
      type: null,
      scope: null,
      subject: '',
      semver: null,
      entry: '',
    }
  }
  if (match === null) {
    errors.push('header 必须形如 `type(scope): subject`，type 取 ' + TYPES.join('/'))
  }
  const type = match?.groups?.type ?? null
  const scope = match?.groups?.scope ?? null
  const subject = match?.groups?.subject ?? ''
  const breaking = match?.groups?.breaking === '!' || /\nBREAKING CHANGE:/u.test(text)

  if (type !== null && !TYPES.includes(type)) errors.push(`未知类型 \`${type}\``)
  if (header.length > 72) errors.push(`header ${header.length} 字符，超过 72`)
  if (subject.endsWith('。') || subject.endsWith('.')) errors.push('subject 结尾不要加句号')
  if (type === 'feat' || type === 'fix') {
    if (!/\n\n/u.test(text)) warnings.push('缺正文：`type(scope): subject` 之后空一行再写做了什么')
    if (!/(?:closes|fixes|resolves)\s+#\d+/iu.test(text))
      warnings.push('正文里没有 `Closes #N`，Issue 不会自动关闭')
  }
  for (const [index, line] of rest.entries()) {
    if (line.length > 100) errors.push(`第 ${index + 2} 行 ${line.length} 字符，超过 100`)
  }
  if (rest.length > 0 && rest[0].trim() !== '') errors.push('header 之后必须空一行')

  const semver = breaking ? 'major' : type === null ? null : (SEMVER[type] ?? null)
  // CHANGELOG 条目去掉 subject 末尾的 `(#123)`：issue 号留在提交里，清单里不重复噪声。
  const summary = subject.replace(/\s*\(#\d+\)$/u, '')
  const entry = type === null ? '' : `- ${summary}${scope === null ? '' : `（${scope}）`}`
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    type,
    scope,
    subject,
    semver,
    entry,
    breaking,
    group: type === null ? null : (GROUPS[type] ?? '其他'),
  }
}

/**
 * 把若干条提交信息拼成 CHANGELOG 片段。
 * @param {string[]} messages - 提交信息列表
 * @returns {{ version: string | null; sections: Record<string, string[]> }} 片段
 */
export function draftChangelog(messages) {
  const sections = {}
  let level = null
  for (const message of messages) {
    const result = checkCommitMessage(message)
    if (!result.ok || result.entry === '') continue
    const group = result.group ?? '其他'
    sections[group] = sections[group] ?? []
    sections[group].push(result.entry)
    if (result.semver === 'major') level = 'major'
    else if (result.semver === 'minor' && level !== 'major') level = 'minor'
    else if (result.semver === 'patch' && level === null) level = 'patch'
  }
  return { version: level, sections }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 通过、1 不通过、2 用法错误
 */
export function main(argv) {
  const json = argv.includes('--json')
  const input = argv.filter((argument) => !argument.startsWith('--'))[0]
  if (input === undefined) {
    process.stderr.write('用法: node scripts/commit-msg.mjs <提交信息文件|提交信息文本> [--json]\n')
    return 2
  }
  // 存在同名文件就当文件读（Windows 下把多行信息直接当参数传会被命令行拼成一行）；
  // 否则按字面提交信息处理。
  let message = input
  try {
    if (statSync(input).isFile()) message = readFileSync(input, 'utf8')
  } catch {
    message = input
  }
  const result = checkCommitMessage(message)
  // --issue：确认这条提交关闭的正是目标 Issue，避免关错单。
  const issueIndex = argv.findIndex(
    (argument) => argument === '--issue' || argument.startsWith('--issue='),
  )
  const issueValue =
    issueIndex < 0
      ? undefined
      : argv[issueIndex].includes('=')
        ? argv[issueIndex].split('=')[1]
        : argv[issueIndex + 1]
  if (issueValue !== undefined) {
    const link = checkIssueLink(message, issueValue)
    if (!link.ok) {
      result.errors.push(...link.errors)
      result.ok = false
    } else {
      result.warnings.push(`已确认关闭 #${Number(issueValue)}`)
    }
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(
      `类型 ${result.type ?? '?'} · scope ${result.scope ?? '-'} · semver ${result.semver ?? '不发版'}\n`,
    )
    if (result.entry !== '') process.stdout.write(`CHANGELOG: ${result.entry}\n`)
    for (const error of result.errors) process.stdout.write(`错误: ${error}\n`)
    for (const warning of result.warnings) process.stdout.write(`提示: ${warning}\n`)
    process.stdout.write(result.ok ? '提交信息合规\n' : '提交信息不合规\n')
  }
  return result.ok ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
