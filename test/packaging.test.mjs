/**
 * 打包清单的完整性检查。
 *
 * 插件按 link 安装时一切正常，按包安装时就只看 package.json 的 files：宪章与技能里写死的
 * 命令（scripts/ 下的脚本）必须在清单里，否则装完就找不到文件。这里用通配规则比对，
 * 不依赖 npm pack 的副作用。
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const files = Array.isArray(manifest.files) ? manifest.files : []

/** 把一个 files 条目转成正则，支持 `*` 与目录前缀。 */
function entryToRegExp(entry) {
  const escaped = entry.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '[^/]*')
  return new RegExp(`^${escaped}$`, 'u')
}

/**
 * 判断某个相对路径是否被 files 清单覆盖。
 * @param {string} relativePath - 相对仓库根的路径
 * @returns {boolean} 是否覆盖
 */
function covered(relativePath) {
  return files.some((entry) => {
    if (entry.endsWith('/')) return relativePath.startsWith(entry)
    if (!entry.includes('*')) return relativePath === entry || relativePath.startsWith(`${entry}/`)
    return entryToRegExp(entry).test(relativePath)
  })
}

/** 列出目录下所有文件（不含 node_modules 等）。 */
function walk(directory) {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = join(directory, entry.name)
    if (statSync(full).isDirectory()) found.push(...walk(full))
    else found.push(relative(root, full).split('\\').join('/'))
  }
  return found
}

test('运行时脚本都在打包清单里', () => {
  for (const script of [
    'repo-map.mjs',
    'secret-scan.mjs',
    'commit-msg.mjs',
    'aigc-check.mjs',
    'build-client.mjs',
  ]) {
    assert.ok(covered(`scripts/${script}`), `files[] 未覆盖 scripts/${script}`)
  }
})

test('技能目录整体被打包，且每个技能都可见', () => {
  const skills = walk(join(root, 'skills'))
  assert.ok(skills.length > 0)
  for (const file of skills) assert.ok(covered(file), `files[] 未覆盖 ${file}`)
})

test('所有运行时目录都被清单覆盖（新增模块自动纳入检查）', () => {
  for (const directory of ['memory', 'skills', 'scripts']) {
    for (const file of walk(join(root, directory))) {
      assert.ok(covered(file), `files[] 未覆盖 ${file}`)
    }
  }
})

test('成员实现、文档、locale 与图标都在清单里', () => {
  for (const file of [
    'index.js',
    'client.js',
    'cordis.patch.yml',
    'README.md',
    'icon.svg',
    'docs/DESIGN.md',
    'docs/REFERENCES.md',
    'locale/zh.json',
  ]) {
    assert.ok(covered(file), `files[] 未覆盖 ${file}`)
  }
  for (const file of walk(join(root, 'code-pipeline')).filter((path) => !path.includes('/test/'))) {
    assert.ok(covered(file), `files[] 未覆盖 ${file}`)
  }
  for (const file of walk(join(root, 'github')).filter((path) => !path.includes('/test/'))) {
    assert.ok(covered(file), `files[] 未覆盖 ${file}`)
  }
})

test('清单里不出现明显不该打包的路径', () => {
  for (const entry of files) {
    assert.equal(entry.startsWith('test'), false, `files[] 不应包含 ${entry}`)
    assert.equal(entry.includes('..'), false, `files[] 不应包含相对上跳 ${entry}`)
  }
})
