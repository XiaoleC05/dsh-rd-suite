#!/usr/bin/env node
/**
 * 版本推进：每 10 轮一个 minor，其余 patch。
 *
 * 手工改版本号会忘、会用反 minor 与 patch。这里把规则写成代码，
 * 并且同时改 package.json 与在 CHANGELOG 顶部插入版本标题骨架。
 *
 * 用法：
 *   node scripts/release.mjs --round 48
 *   node scripts/release.mjs --round 50 --write
 *   node scripts/release.mjs --round 48 --patch --write
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MANIFEST = join(root, 'package.json')
const CHANGELOG = join(root, 'docs', 'CHANGELOG.md')

/** 每多少轮升一次 minor。 */
export const MINOR_EVERY = 10

/**
 * 按语义化规则推进版本。
 * @param {string} current - 当前版本，如 1.4.2
 * @param {'major' | 'minor' | 'patch'} kind - 推进类型
 * @returns {string} 新版本
 */
export function bumpVersion(current, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(current ?? '').trim())
  if (match === null) throw new Error(`版本号格式不对：${String(current)}`)
  const [major, minor, patch] = match.slice(1).map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return patch + 1 > 9 ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
}

/**
 * 计算本轮该发什么版本。
 * @param {{ current: string; round: number; kind?: 'major' | 'minor' | 'patch' }} input - 当前版本、轮次与可选覆盖
 * @returns {{ version: string; kind: 'major' | 'minor' | 'patch'; reason: string }} 计划
 */
export function planRelease(input) {
  const round = Number(input.round)
  if (!Number.isInteger(round) || round <= 0) throw new Error('round 必须是正整数')
  const kind = input.kind ?? (round % MINOR_EVERY === 0 ? 'minor' : 'patch')
  const reason =
    input.kind === undefined
      ? kind === 'minor'
        ? `第 ${round} 轮是 ${MINOR_EVERY} 的倍数，升 minor`
        : `第 ${round} 轮不是 ${MINOR_EVERY} 的倍数，升 patch`
      : `显式指定 ${kind}`
  return { version: bumpVersion(input.current, kind), kind, reason }
}

/**
 * 在 CHANGELOG 顶部插入版本标题骨架。
 * @param {string} changelog - 变更日志内容
 * @param {string} version - 版本号
 * @param {string} [date] - 日期
 * @returns {{ text: string; inserted: boolean }} 结果
 */
export function insertChangelogHeading(
  changelog,
  version,
  date = new Date().toISOString().slice(0, 10),
) {
  const body = String(changelog ?? '')
  if (
    new RegExp(`^##\\s*v?${version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:\\s|$)`, 'mu').test(
      body,
    )
  ) {
    return { text: body, inserted: false }
  }
  const heading = `## ${version} — ${date}\n\n- 本轮改动：\n`
  const anchor = /^# 变更日志\r?\n\r?\n/mu.exec(body)
  if (anchor === null) return { text: `${body.trimEnd()}\n\n${heading}\n`, inserted: true }
  const index = anchor.index + anchor[0].length
  return { text: `${body.slice(0, index)}${heading}\n${body.slice(index)}`, inserted: true }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 成功、1 拒绝、2 用法错误
 */
export function main(argv) {
  const roundIndex = argv.indexOf('--round')
  const round = roundIndex >= 0 ? Number(argv[roundIndex + 1]) : undefined
  if (round === undefined || !Number.isInteger(round) || round <= 0) {
    process.stdout.write(
      '用法: node scripts/release.mjs --round <轮次> [--minor|--patch] [--write]\n',
    )
    return 2
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const kind = argv.includes('--minor') ? 'minor' : argv.includes('--patch') ? 'patch' : undefined
  const plan = planRelease({ current: manifest.version, round, kind })

  if (!argv.includes('--write')) {
    process.stdout.write(
      `第 ${round} 轮：${manifest.version} → ${plan.version}（${plan.reason}）\n`,
    )
    process.stdout.write('加 --write 落盘（同时改 package.json 与 CHANGELOG 标题骨架）\n')
    return 0
  }

  const changelog = readFileSync(CHANGELOG, 'utf8')
  const inserted = insertChangelogHeading(changelog, plan.version)
  if (!inserted.inserted) {
    process.stdout.write(`CHANGELOG 里已有 ${plan.version}，拒绝重复写入\n`)
    return 1
  }
  manifest.version = plan.version
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(CHANGELOG, inserted.text)
  process.stdout.write(`已升到 ${plan.version}（${plan.reason}），CHANGELOG 已插入标题骨架\n`)
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
