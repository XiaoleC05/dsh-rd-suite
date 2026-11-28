#!/usr/bin/env node
/**
 * git 凭据与网络自检：把「弹窗选账户」和「push 卡死」两类问题变成可检查的项。
 *
 * 默认只查配置（不联网）；加 --network 才做 ls-remote 连通性测试。
 * 每项失败都给一条可直接执行的修复命令。
 */

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** 期望的配置项与判定规则。 */
export const EXPECTED = [
  {
    key: 'credential.https://github.com.helper',
    want: '!gh auth git-credential',
    why: 'github 的凭据交给 gh，避免 Git Credential Manager 弹账户选择框',
    fix: 'git config --global credential.https://github.com.helper "!gh auth git-credential"',
  },
  {
    key: 'credential.interactive',
    want: 'false',
    why: '缺失凭据时直接失败，而不是弹框等人点',
    fix: 'git config --global credential.interactive false',
  },
  {
    key: 'http.sslBackend',
    want: 'openssl',
    why: 'schannel 在本地代理下会握手失败（SSL/TLS connection failed）',
    fix: 'git config --global http.sslBackend openssl',
  },
  {
    key: 'http.https://github.com.proxy',
    want: null,
    why: '走本地代理，否则 curl 56 连接重置',
    fix: 'git config --global http.https://github.com.proxy http://127.0.0.1:7890',
  },
]

/**
 * 从代理配置里取出可连接的主机与端口。
 * @param {string} proxy - 形如 http://127.0.0.1:7890
 * @returns {{ host: string; port: number } | null} 结果；解析不出返回 null
 */
export function proxyEndpoint(proxy) {
  const match = /^(?:https?:\/\/)?([^:/\s]+):(\d+)\/?$/u.exec(String(proxy ?? '').trim())
  if (match === null) return null
  const port = Number(match[2])
  if (!Number.isInteger(port) || port <= 0) return null
  return { host: match[1], port }
}

/**
 * 探测 TCP 端口是否可连（毫秒级超时，失败即判不通）。
 * @param {{ host: string; port: number }} endpoint - 端点
 * @param {number} [timeoutMs] - 超时
 * @returns {Promise<boolean>} 是否可连
 */
export async function portReachable(endpoint, timeoutMs = 1200) {
  const net = await import('node:net')
  return await new Promise((resolve) => {
    const socket = net.connect({ host: endpoint.host, port: endpoint.port })
    const done = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/**
 * 按期望值检查配置。
 * @param {Record<string, string | undefined>} values - 配置快照（键为完整配置名）
 * @returns {{ key: string; ok: boolean; actual: string; why: string; fix: string }[]} 结果
 */
export function checkConfigValues(values) {
  return EXPECTED.map((item) => {
    const actual = values[item.key] ?? ''
    const ok = item.want === null ? actual.trim() !== '' : actual.trim() === item.want
    return { key: item.key, ok, actual, why: item.why, fix: item.fix }
  })
}

/**
 * 从 git 读配置（读不到当空串）。
 * @param {string} key - 配置名
 * @returns {string} 配置值
 */
function readConfig(key) {
  try {
    return execFileSync('git', ['config', '--global', '--get', key], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/**
 * 联网检查：能否列出远端分支。
 * @param {number} [timeoutMs] - 超时
 * @returns {{ ok: boolean; detail: string }} 结果
 */
export function checkRemote(timeoutMs = 30_000) {
  try {
    const output = execFileSync('git', ['ls-remote', '--heads', 'origin'], {
      encoding: 'utf8',
      timeout: timeoutMs,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    })
    const heads = output.split('\n').filter((line) => line.trim() !== '').length
    return { ok: heads > 0, detail: heads > 0 ? `列出 ${heads} 个远端分支` : '没有列出任何分支' }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message.split('\n')[0] : String(error),
    }
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码：0 全过、1 有问题
 */
export async function main(argv) {
  const values = Object.fromEntries(EXPECTED.map((item) => [item.key, readConfig(item.key)]))
  const results = checkConfigValues(values)
  const problems = results.filter((item) => !item.ok)

  for (const item of results) {
    process.stdout.write(
      `${item.ok ? '通过' : '需修'}  ${item.key}：${item.actual === '' ? '（未设置）' : item.actual}\n`,
    )
  }
  for (const item of problems) {
    process.stdout.write(`  为什么：${item.why}\n  修复：${item.fix}\n`)
  }

  // 配了代理但端口不通，是最常见的一种「看起来配好了」：单独探一次。
  const endpoint = proxyEndpoint(values['http.https://github.com.proxy'])
  let proxyOk = true
  if (endpoint !== null) {
    proxyOk = await portReachable(endpoint)
    process.stdout.write(`${proxyOk ? '通过' : '需修'}  代理端口：${endpoint.host}:${endpoint.port} ${proxyOk ? '可连接' : '连不上'}\n`)
    if (!proxyOk) {
      process.stdout.write('  为什么：代理软件没运行、端口改了，或该端口不提供 HTTP 代理\n')
      process.stdout.write('  修复：启动代理软件；端口变了就改 http.https://github.com.proxy；不用代理就清掉该键\n')
    }
  }

  if (argv.includes('--network')) {
    const remote = checkRemote()
    process.stdout.write(`${remote.ok ? '通过' : '需修'}  远端连通性：${remote.detail}\n`)
    if (!remote.ok) return 1
  } else {
    process.stdout.write('提示：加 --network 可再做一次 ls-remote 连通性测试\n')
  }

  process.stdout.write(
    problems.length === 0 ? 'git 凭据与网络配置就绪\n' : `有 ${problems.length} 项需要修\n`,
  )
  return problems.length === 0 ? 0 : 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
