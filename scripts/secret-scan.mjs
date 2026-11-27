#!/usr/bin/env node
/**
 * 密钥扫描：提交前拦下顺手写进文件的凭据。
 *
 * 规则组织方式参考 gitleaks（https://github.com/gitleaks/gitleaks）：按厂商固定前缀、
 * 私钥块、以及「键名 + 高熵值」三类匹配。命中时只打码输出前 4 位与后 2 位，不把完整
 * 密钥打进日志或对话。
 *
 * 用法：
 *   node scripts/secret-scan.mjs .env src/config.ts     # 扫指定文件
 *   node scripts/secret-scan.mjs --staged               # 扫 git 暂存区的改动
 *   node scripts/secret-scan.mjs --staged --json        # 机器可读
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** 命中即拦截的规则。id 会出现在输出里，便于在报告与豁免清单中引用。 */
export const RULES = [
  { id: 'aws-access-key-id', test: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u },
  {
    id: 'aws-secret-access-key',
    test: /\baws_?secret_?access_?key\b\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})/iu,
  },
  { id: 'private-key-block', test: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/u },
  { id: 'github-token', test: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u },
  { id: 'slack-token', test: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/u },
  { id: 'google-api-key', test: /\bAIza[0-9A-Za-z_-]{35}\b/u },
  { id: 'provider-api-key', test: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
  { id: 'jwt', test: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u },
  {
    id: 'named-credential',
    test: /\b(?:api[_-]?key|secret|token|password|passwd|credential|access[_-]?key)\b\s*[=:]\s*["']([^"'\s]{12,})["']/iu,
  },
]

/** 明显的占位符与运行期引用不算泄漏。 */
const ALLOWLIST =
  /(EXAMPLE|placeholder|your[_-]|redacted|xxxx|\$\{|process\.env|<[^>]+>|CHANGEME|dummy)/iu

/** 单文件大小上限：更大的多半是数据或产物。 */
const MAX_BYTES = 1_000_000

/**
 * 打码：只保留前 4 位与后 2 位。
 * @param {string} secret - 命中的字符串
 * @returns {string} 打码后的片段
 */
export function mask(secret) {
  const value = String(secret)
  if (value.length <= 8) return '*'.repeat(value.length)
  return `${value.slice(0, 4)}…${value.slice(-2)}`
}

/**
 * 扫一段文本。
 * @param {string} text - 文件内容
 * @param {{ file?: string }} [options] - 来源信息
 * @returns {{ file: string; line: number; rule: string; preview: string }[]} 命中项
 */
export function scanText(text, options = {}) {
  const file = options.file ?? '<text>'
  const hits = []
  const lines = String(text ?? '').split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.length > 2000) continue
    if (ALLOWLIST.test(line)) continue
    for (const rule of RULES) {
      const match = rule.test.exec(line)
      if (match === null) continue
      const secret = match[1] ?? match[0]
      hits.push({ file, line: index + 1, rule: rule.id, preview: mask(secret) })
      break
    }
  }
  return hits
}

/**
 * 列出暂存区里改动的文件。
 * @returns {string[]} 相对路径
 */
/** 全部被 git 跟踪的文件。 */
export function trackedFiles() {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  return output.split(/\r?\n/u).filter((line) => line.trim() !== '')
}

function stagedFiles() {
  try {
    const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return output.split(/\r?\n/u).filter((line) => line.trim() !== '')
  } catch {
    return []
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 无命中、1 有命中、2 用法错误
 */
export function main(argv) {
  const json = argv.includes('--json')
  const staged = argv.includes('--staged')
  const given = argv.filter((argument) => !argument.startsWith('--'))
  // 不给文件也不是 --staged 时默认扫全仓跟踪文件：全面体检不该每次手动拼列表。
  const files = staged ? stagedFiles() : given.length > 0 ? given : trackedFiles()
  if (files.length === 0) {
    if (staged) {
      process.stdout.write('暂存区没有改动，无需扫描\n')
      return 0
    }
    process.stderr.write('用法: node scripts/secret-scan.mjs <文件...> | --staged [--json]\n')
    return 2
  }

  const hits = []
  for (const file of files) {
    let text
    try {
      const buffer = readFileSync(file)
      if (buffer.byteLength > MAX_BYTES) continue
      text = buffer.toString('utf8')
    } catch {
      continue
    }
    hits.push(...scanText(text, { file: file.replaceAll('\\', '/') }))
  }

  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: hits.length === 0, hits }, null, 2)}\n`)
  } else if (hits.length === 0) {
    process.stdout.write(`密钥扫描通过：${files.length} 个文件没有命中规则\n`)
  } else {
    for (const hit of hits)
      process.stdout.write(`${hit.file}:${hit.line} ${hit.rule} ${hit.preview}\n`)
    process.stdout.write(
      `\n命中 ${hits.length} 处，已打码。删掉硬编码凭据、改用环境变量或凭据引用后再继续。\n`,
    )
  }
  return hits.length === 0 ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
