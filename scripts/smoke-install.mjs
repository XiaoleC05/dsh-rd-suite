#!/usr/bin/env node
/**
 * 安装冒烟：按 package.json 的 files[] 装出一份最小副本，再试加载。
 *
 * 打包校验只回答「清单写没写全」；这里回答「按清单装出来的那一份能不能跑」：
 * 缺文件、多依赖了 files[] 之外的东西、成员模块 import 失败，都会在这里暴露。
 *
 * 副本建在仓库内的临时目录里，这样 node 仍能找到上层的 node_modules。
 *
 * 用法：
 *   node scripts/smoke-install.mjs
 *   node scripts/smoke-install.mjs --json
 */

import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 把 files[] 展开成真实存在的文件相对路径。
 * @param {string[]} entries - package.json 的 files 字段
 * @param {(path: string) => { isDirectory: () => boolean; isFile: () => boolean }} stat - 判断类型
 * @param {(path: string) => string[]} readDir - 读目录
 * @returns {string[]} 文件相对路径
 */
export function expandFileEntries(entries, stat, readDir) {
  const files = []
  const walk = (relative) => {
    // 依赖目录不随包发布；它们由安装时拉取，复制进去反而会遮住上层 node_modules。
    if (/(^|\/)node_modules(\/|$)/u.test(relative)) return
    let info
    try {
      info = stat(relative)
    } catch {
      return
    }
    if (info.isDirectory()) {
      for (const child of readDir(relative)) walk(`${relative}/${child}`)
      return
    }
    if (info.isFile()) files.push(relative)
  }
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry === '') continue
    // 通配写法只取前缀目录；包内没有嵌套通配，够用。
    walk(entry.replace(/\/\*\*?$/u, ''))
  }
  return [...new Set(files)]
}

/**
 * 判定冒烟结果是否通过。
 * @param {{ tools: number; routes: number; members: string[]; patchMembers: string[] }} observed - 观测值
 * @returns {string[]} 问题列表
 */
export function collectSmokeProblems(observed) {
  const problems = []
  if (observed.tools === 0) problems.push('加载后没有注册任何工具')
  if (observed.routes === 0) problems.push('加载后没有注册任何 HTTP 路由')
  for (const member of observed.patchMembers) {
    if (!observed.members.includes(member))
      problems.push(`副本里缺少 cordis.patch.yml 引用的成员目录：${member}`)
  }
  return problems
}

/**
 * 最小假 ctx：只记录注册了什么，不真的开服务。
 * 宿主服务按需给桩——缺哪个会立刻在冒烟里报出来，正是这个脚本要暴露的信息。
 */
export function fakeContext() {
  const tools = []
  const routes = []
  const services = new Set()
  const stubs = {
    subprocess: {
      exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      spawn: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
    systemPrompt: {
      // 成员用 ctx.systemPrompt.section({ name, order, text }) 注册提示词段落。
      section: () => () => {},
      register: () => () => {},
      add: () => () => {},
      prepend: () => () => {},
      append: () => () => {},
    },
    workingDirectory: { get: () => root, set: async () => {} },
  }
  const ctx = {
    // 有的成员直接读 ctx.subprocess，有的走 ctx.get(...)，两条路都给上。
    ...stubs,
    tools: { register: (definition) => tools.push(definition) },
    webServer: { register: (route) => routes.push(route) },
    slots: { inject: (name) => name },
    locale: { register: () => () => {} },
    effect: (callback) => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    // 事件订阅：冒烟里只记录，不真的挂到宿主总线上。
    on: (event) => {
      services.add('event:' + String(event))
      return () => {}
    },
    get: (name) => {
      services.add(name)
      return stubs[name]
    },
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
  }
  return { ctx, tools, routes, services: [...services] }
}

/**
 * 跑一次安装冒烟。
 * @returns {Promise<{ problems: string[]; files: number; tools: number; routes: number }>} 结果
 */
export async function smokeInstall() {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const files = expandFileEntries(
    Array.isArray(manifest.files) ? manifest.files : [],
    (relative) => statSync(join(root, relative)),
    (relative) => readdirSync(join(root, relative)),
  )

  const staging = mkdtempSync(join(root, '.smoke-'))
  const problems = []
  let tools = 0
  let routes = 0
  try {
    for (const relative of files) {
      cpSync(join(root, relative), join(staging, relative), { recursive: true })
    }
    // npm 一定会带上 package.json，files[] 里不必列；副本里也要有，否则 import 解析不到包名。
    cpSync(join(root, 'package.json'), join(staging, 'package.json'))
    try {
      JSON.parse(readFileSync(join(staging, 'package.json'), 'utf8'))
    } catch (error) {
      problems.push(`副本缺少可解析的 package.json：${error instanceof Error ? error.message : String(error)}`)
    }

    const patch = readFileSync(join(staging, 'cordis.patch.yml'), 'utf8')
    const patchMembers = [...patch.matchAll(/entry:\s*\.\/([\w.-]+)\//gu)].map((match) => match[1])
    const members = readdirSync(staging, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    let registered = fakeContext()
    try {
      const loaded = await import(pathToFileURL(join(staging, 'index.js')).href)
      const plugin = loaded.default ?? loaded
      if (typeof plugin?.apply !== 'function') problems.push('副本的 index.js 没有导出 apply()')
      else plugin.apply(registered.ctx, { plugins: [], directory: staging })
    } catch (error) {
      problems.push(`副本加载失败：${error instanceof Error ? error.message : String(error)}`)
    }
    tools = registered.tools.length
    routes = registered.routes.length
    problems.push(...collectSmokeProblems({ tools, routes, members, patchMembers }))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  return { problems, files: files.length, tools, routes }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {Promise<number>} 退出码：0 通过、1 有问题
 */
export async function main(argv) {
  const result = await smokeInstall()
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else if (result.problems.length === 0) {
    process.stdout.write(
      `安装冒烟通过：${result.files} 个文件、${result.tools} 个工具、${result.routes} 条路由\n`,
    )
  } else {
    process.stdout.write(`安装冒烟发现 ${result.problems.length} 个问题：\n`)
    for (const problem of result.problems) process.stdout.write(`  - ${problem}\n`)
  }
  return result.problems.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
