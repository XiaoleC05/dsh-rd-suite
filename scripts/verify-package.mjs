#!/usr/bin/env node
/**
 * 打包与安装前的一致性校验。
 *
 * 这些问题装进 DSH 之后只会表现为「面板空白」「技能不出现」，很难倒查，
 * 所以在仓库里先查一遍：
 *   1. package.json 的 files[] 是否覆盖了所有随包内容；
 *   2. 每个技能是否有带 name 与 description 的 frontmatter；
 *   3. cordis.patch.yml 引用的成员目录是否存在；
 *   4. client.js 是否比 client-sources 里最新的源文件更新（陈旧说明忘了重建）。
 *
 * 用法：
 *   node scripts/verify-package.mjs
 *   node scripts/verify-package.mjs --json
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 必须随包发布的目录。 */
export const REQUIRED_DIRECTORIES = [
  'code-pipeline',
  'github',
  'memory',
  'skills',
  'scripts',
  'docs',
]

/** 必须随包发布的单文件。 */
export const REQUIRED_FILES = ['index.js', 'client.js', 'cordis.patch.yml', 'README.md']

/**
 * 检查 files[] 是否覆盖必需目录与文件。
 * @param {{ files?: string[] }} manifest - package.json 内容
 * @returns {string[]} 问题列表
 */
export function checkFilesCoverage(manifest) {
  const files = Array.isArray(manifest?.files) ? manifest.files.map(String) : []
  const problems = []
  for (const directory of REQUIRED_DIRECTORIES) {
    if (!files.some((entry) => entry === directory || entry.startsWith(`${directory}/`))) {
      problems.push(`files[] 缺少目录 ${directory}`)
    }
  }
  for (const file of REQUIRED_FILES) {
    if (!files.includes(file)) problems.push(`files[] 缺少文件 ${file}`)
  }
  return problems
}

/**
 * 检查技能 frontmatter。
 * @param {{ name: string; text: string }[]} skills - 技能名与 SKILL.md 内容
 * @returns {string[]} 问题列表
 */
export function checkSkillFrontmatter(skills) {
  const problems = []
  for (const skill of skills) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(String(skill.text ?? ''))
    if (match === null) {
      problems.push(`技能 ${skill.name} 缺少 frontmatter`)
      continue
    }
    const block = match[1]
    for (const field of ['name', 'description']) {
      if (!new RegExp(`^${field}\\s*:\\s*\\S`, 'mu').test(block)) {
        problems.push(`技能 ${skill.name} 的 frontmatter 缺少 ${field}`)
      }
    }
  }
  return problems
}

/**
 * 检查 cordis.patch.yml 引用的成员目录是否存在。
 * @param {string} yamlText - patch 内容
 * @param {(path: string) => boolean} exists - 存在性判断
 * @returns {string[]} 问题列表
 */
export function checkLoaderRows(yamlText, exists) {
  const problems = []
  for (const match of String(yamlText ?? '').matchAll(/entry:\s*\.\/([\w.-]+)\//gu)) {
    const directory = match[1]
    if (!exists(directory)) problems.push(`cordis.patch.yml 引用的成员目录不存在：${directory}`)
  }
  return problems
}

/**
 * 检查 client.js 是否比客户端源码新。
 * @param {number} clientStat - client.js 的 mtimeMs
 * @param {number[]} sourceStats - client-sources 下各源文件（含构建脚本）的 mtimeMs
 * @returns {string[]} 问题列表
 */
export function checkClientFreshness(clientStat, sourceStats) {
  const newest = sourceStats.length === 0 ? 0 : Math.max(...sourceStats)
  if (clientStat >= newest) return []
  return ['client.js 比客户端源码旧，先运行 node scripts/build-client.mjs']
}

/**
 * 收集问题。
 * @returns {{ problems: string[]; warnings: string[] }} 结论
 */
export function verifyPackage() {
  const read = (relative) => readFileSync(join(root, relative), 'utf8')
  const problems = []
  const warnings = []

  const manifest = JSON.parse(read('package.json'))
  problems.push(...checkFilesCoverage(manifest))

  const skillsDirectory = join(root, 'skills')
  const skills = readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      text: readFileSync(join(skillsDirectory, entry.name, 'SKILL.md'), 'utf8'),
    }))
  if (skills.length === 0) problems.push('skills 目录下没有技能')
  problems.push(...checkSkillFrontmatter(skills))

  problems.push(
    ...checkLoaderRows(read('cordis.patch.yml'), (directory) => existsSync(join(root, directory))),
  )

  const sourcesDirectory = join(root, 'client-sources')
  const sourceStats = existsSync(sourcesDirectory)
    ? [
        ...readdirSync(sourcesDirectory).map(
          (name) => statSync(join(sourcesDirectory, name)).mtimeMs,
        ),
        statSync(join(root, 'scripts', 'build-client.mjs')).mtimeMs,
      ]
    : []
  if (!existsSync(join(root, 'client.js'))) problems.push('缺少 client.js，先运行构建')
  else
    problems.push(...checkClientFreshness(statSync(join(root, 'client.js')).mtimeMs, sourceStats))

  if (manifest.version === undefined) warnings.push('package.json 没有 version')
  if (manifest.engines?.dsh === undefined) warnings.push('没有声明 engines.dsh')

  return { problems, warnings }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 通过、1 有问题
 */
export function main(argv) {
  const { problems, warnings } = verifyPackage()
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ problems, warnings }, null, 2)}\n`)
  } else if (problems.length === 0) {
    process.stdout.write(`打包校验通过（${warnings.length} 条提示）\n`)
    for (const warning of warnings) process.stdout.write(`  提示：${warning}\n`)
  } else {
    process.stdout.write(`打包校验发现 ${problems.length} 个问题：\n`)
    for (const problem of problems) process.stdout.write(`  - ${problem}\n`)
  }
  return problems.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
