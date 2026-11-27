#!/usr/bin/env node
/**
 * 一个入口跑完全部自检：八道门禁 + 五个专项审查。
 *
 * 以前交付前要手敲七八条命令，漏跑一条没人知道；
 * 这里把清单固化下来，逐项计时，最后给一行结论。
 */

import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 自检清单：名称 + 命令 + 参数。顺序按「先快后慢」，早失败早停。 */
export const CHECKS = [
  { name: '工具清单', script: 'scripts/tool-inventory.mjs', args: ['--strict'] },
  { name: '技能版本', script: 'scripts/skill-version.mjs', args: [] },
  { name: '宪章重叠', script: 'scripts/charter-overlap.mjs', args: ['--strict'] },
  { name: '引用完整', script: 'scripts/link-check.mjs', args: ['--strict'] },
  { name: 'git 网络', script: 'scripts/git-net-check.mjs', args: [] },
  { name: 'CI 覆盖', script: 'scripts/ci-parity.mjs', args: ['--strict'] },
  { name: '交付门禁', script: 'scripts/preflight.mjs', args: [] },
]

/**
 * 逐项执行并计时。
 * @param {(check: { name: string; script: string; args: string[] }) => { ok: boolean; detail: string }} runner - 执行器
 * @param {{ name: string; script: string; args: string[] }[]} [checks] - 清单
 * @returns {{ name: string; ok: boolean; detail: string }[]} 结果
 */
export function runChecks(runner, checks = CHECKS) {
  return checks.map((check) => {
    const startedAt = Date.now()
    try {
      const result = runner(check)
      return {
        name: check.name,
        ok: result.ok !== false,
        detail: result.detail,
        ms: Date.now() - startedAt,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
      return { name: check.name, ok: false, detail: message, ms: Date.now() - startedAt }
    }
  })
}

/**
 * 默认执行器：跑脚本，只取最后一行输出作为摘要。
 * @param {{ script: string; args: string[] }} check - 检查项
 * @returns {{ ok: boolean; detail: string }} 结果
 */
export function runScript(check) {
  try {
    const output = execFileSync(process.execPath, [check.script, ...check.args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const lines = output.trim().split(/\r?\n/u)
    return { ok: true, detail: lines[lines.length - 1] ?? '' }
  } catch (error) {
    const stderr = String(error?.stderr ?? '')
    const stdout = String(error?.stdout ?? '')
    const lines = `${stdout}\n${stderr}`
      .trim()
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== '')
    return { ok: false, detail: lines[lines.length - 1] ?? '退出码非零' }
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 全过、1 有失败
 */
export function main(argv) {
  const results = runChecks(runScript)
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
    return results.every((item) => item.ok) ? 0 : 1
  }
  for (const item of results) {
    process.stdout.write(
      `${item.ok ? '通过' : '失败'}  ${item.name.padEnd(10)}${String(item.ms).padStart(6)}ms  ${item.detail}\n`,
    )
  }
  const failed = results.filter((item) => !item.ok)
  const total = results.reduce((sum, item) => sum + item.ms, 0)
  process.stdout.write(
    failed.length === 0
      ? `整体健康：${results.length} 项全过，共 ${(total / 1000).toFixed(1)} 秒\n`
      : `有 ${failed.length} 项失败：${failed.map((item) => item.name).join('、')}\n`,
  )
  return failed.length === 0 ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
