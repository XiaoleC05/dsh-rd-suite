/**
 * 识别仓库自带的格式化 / lint 工具链。
 *
 * 用途：真实项目多数已经选好了自己的格式化器（oxfmt、prettier、eslint…）。
 * 我们的工具若按自己的规则改写，会产出与项目风格冲突、且项目 CI 会失败的 diff。
 * 检测到别人的工具时，我们只报告、不改写。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** 配置文件 → 工具名。顺序即优先级：先命中的赢。 */
const CONFIG_FILES = [
  { file: 'oxlint.json', tool: 'oxlint' },
  { file: '.oxlintrc.json', tool: 'oxlint' },
  { file: '.oxlintrc', tool: 'oxlint' },
  { file: '.prettierrc', tool: 'prettier' },
  { file: '.prettierrc.json', tool: 'prettier' },
  { file: '.prettierrc.js', tool: 'prettier' },
  { file: 'prettier.config.js', tool: 'prettier' },
  { file: 'prettier.config.mjs', tool: 'prettier' },
  { file: '.eslintrc', tool: 'eslint' },
  { file: '.eslintrc.json', tool: 'eslint' },
  { file: '.eslintrc.js', tool: 'eslint' },
  { file: 'eslint.config.js', tool: 'eslint' },
  { file: 'eslint.config.mjs', tool: 'eslint' },
  { file: 'biome.json', tool: 'biome' },
  { file: 'biome.jsonc', tool: 'biome' },
  { file: '.editorconfig', tool: 'editorconfig' },
]

/** package.json 里这些脚本名视为「项目有自己的格式化入口」。 */
const SCRIPT_HINTS = ['fmt', 'format', 'lint', 'fix', 'prettier', 'oxfmt']

/**
 * 检测仓库自带的工具链。
 * @param {string} root - 仓库根（绝对路径）
 * @returns {{ tool: string; source: string } | null} 命中结果；没命中返回 null
 */
export function detectProjectToolchain(root) {
  for (const item of CONFIG_FILES) {
    if (existsSync(join(root, item.file))) return { tool: item.tool, source: item.file }
  }
  // package.json 的脚本：许多项目不落配置文件，只在 scripts 里写 fmt / lint。
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const scripts = manifest?.scripts ?? {}
    for (const name of Object.keys(scripts)) {
      if (!SCRIPT_HINTS.includes(name)) continue
      const command = String(scripts[name])
      const tool = /oxfmt|oxlint/u.test(command)
        ? 'oxfmt'
        : /prettier/u.test(command)
          ? 'prettier'
          : /eslint/u.test(command)
            ? 'eslint'
            : /biome/u.test(command)
              ? 'biome'
              : 'project-script'
      return { tool, source: `scripts.${name}` }
    }
  } catch {
    // 没有 package.json 或读不出来：不算命中。
    return null
  }
  // 兜底：devDependencies 里装了格式化器也算（项目打算用它）。
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const deps = { ...(manifest?.devDependencies ?? {}), ...(manifest?.dependencies ?? {}) }
    for (const name of ['oxfmt', 'oxlint', 'prettier', 'eslint', 'biome']) {
      if (name in deps) return { tool: name, source: `devDependencies.${name}` }
    }
  } catch {
    return null
  }
  return null
}

/**
 * 判断是否该把 fix 降级成 report。
 *
 * 只有「项目有自己的工具、且不是我们内置的 biome」才降级：
 * 项目自己就用 biome 时，我们的改写与它的规则一致，不需要拦。
 * @param {string} root - 仓库根
 * @returns {{ downgrade: boolean; tool: string | null; reason: string }} 判定
 */
export function shouldDeferToProjectToolchain(root) {
  const hit = detectProjectToolchain(root)
  if (hit === null) return { downgrade: false, tool: null, reason: '' }
  if (hit.tool === 'biome') return { downgrade: false, tool: hit.tool, reason: '' }
  return {
    downgrade: true,
    tool: hit.tool,
    reason: `仓库自带 ${hit.tool}（${hit.source}）：按项目命令格式化，本工具只报告`,
  }
}

/**
 * 列出目录下的文件（仅用于测试与诊断）。
 * @param {string} directory - 目录
 * @returns {string[]} 文件名
 */
export function listDirectory(directory) {
  try {
    return readdirSync(directory)
  } catch {
    return []
  }
}
