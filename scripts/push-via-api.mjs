#!/usr/bin/env node
/**
 * 用 GitHub Git Data API 推送当前分支（`git push` 被链路掐断时的回退）。
 *
 * 做法：读远端 HEAD → 校验快进 → 逐个上传改动文件为 blob →
 * 以远端树为 base 建新树 → 建提交 → 快进 ref。提交信息原样保留，
 * 作者与提交时间会变成 token 用户与“现在”，因此只作回退手段。
 *
 * 用法：
 *   node scripts/push-via-api.mjs --dry-run
 *   node scripts/push-via-api.mjs --branch main
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { assertFastForward, buildTreeEntries, diffTrees, parseLsTree } from './lib/push-plan.mjs'

/**
 * 跑一条命令并返回 stdout。
 * @param {string} command - 可执行文件
 * @param {string[]} args - 参数
 * @param {string | undefined} [input] - 标准输入
 * @returns {string} stdout
 */
function run(command, args, input) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * 调 gh api 并解析 JSON。
 * @param {string[]} args - gh api 参数
 * @param {string | undefined} [input] - JSON 请求体
 * @returns {any} 解析后的响应
 */
function gh(args, input) {
  const output = run('gh', ['api', ...args], input)
  return output.trim() === '' ? {} : JSON.parse(output)
}

/**
 * 读取仓库的 owner/repo。
 * @param {string} remote - 远端名
 * @returns {string} `OWNER/REPO`
 */
function repoSlug(remote) {
  const url = run('git', ['remote', 'get-url', remote]).trim()
  const match = /github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/u.exec(url)
  if (match === null) throw new Error(`无法从远端地址解析 owner/repo：${url}`)
  return `${match.groups.owner}/${match.groups.repo}`
}

/**
 * 远端分支当前 sha。走 gh api 而不是 git ls-remote：链路掐断时前者仍可用。
 * @param {string} slug - owner/repo
 * @param {string} branch - 分支
 * @returns {string} sha，空字符串表示远端还没有该分支
 */
function remoteHead(slug, branch) {
  try {
    const ref = gh([`repos/${slug}/git/refs/heads/${branch}`])
    return typeof ref?.object?.sha === 'string' ? ref.object.sha : ''
  } catch {
    return ''
  }
}

/**
 * 判断远端 sha 是否是本地提交的祖先：对象在本地时用 git 判断，
 * 不在本地时只接受「远端正好是本地提交的父提交」这一种快进。
 * @param {string} remoteSha - 远端 sha
 * @param {string} localSha - 本地 sha
 * @returns {boolean} 是否可快进
 */
function isAncestor(remoteSha, localSha, slug) {
  if (remoteSha === '') return true
  const parents = run('git', ['rev-list', '--parents', '-n', '1', localSha])
    .trim()
    .split(/\s+/u)
    .slice(1)
  try {
    run('git', ['cat-file', '-e', remoteSha])
    run('git', ['merge-base', '--is-ancestor', remoteSha, localSha])
    return true
  } catch {
    if (parents.includes(remoteSha)) return true
    // 远端对象不在本地（拿不到 fetch）时：若远端提交的树与本地父提交的树一致，
    // 说明差异只是提交身份，按可快进处理。
    const parent = parents[0]
    if (parent === undefined) return false
    try {
      const remoteCommit = gh([`repos/${slug}/git/commits/${remoteSha}`])
      const parentTree = run('git', ['rev-parse', `${parent}^{tree}`]).trim()
      return typeof remoteCommit?.tree?.sha === 'string' && remoteCommit.tree.sha === parentTree
    } catch {
      return false
    }
  }
}

/**
 * 主流程。
 * @param {string[]} argv - 参数
 * @returns {number} 退出码
 */
export function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const json = argv.includes('--json')
  const branchIndex = argv.indexOf('--branch')
  const branch =
    branchIndex >= 0
      ? argv[branchIndex + 1]
      : run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  const remote = argv.includes('--remote') ? argv[argv.indexOf('--remote') + 1] : 'origin'
  // --parent：显式指定新提交的父提交（远端已含上一提交、本地又 amend 过时使用）。
  const parentIndex = argv.indexOf('--parent')
  const explicitParent = parentIndex >= 0 ? argv[parentIndex + 1] : ''

  const localSha = run('git', ['rev-parse', branch]).trim()
  const slug = repoSlug(remote)
  const remoteSha = explicitParent !== '' ? explicitParent : remoteHead(slug, branch)
  const report = {
    branch,
    remote: slug,
    localSha,
    remoteSha,
    changes: 0,
    uploads: 0,
    commit: '',
    ok: false,
  }

  if (remoteSha === localSha) {
    report.ok = true
    report.commit = localSha
    process.stdout.write(
      json ? `${JSON.stringify(report, null, 2)}\n` : `远端与本地一致：${localSha.slice(0, 7)}\n`,
    )
    return 0
  }

  if (explicitParent === '')
    assertFastForward({ remoteSha, localSha, isAncestor: isAncestor(remoteSha, localSha, slug) })

  // 树差分：远端提交对象可能不在本地，因此不依赖 git diff。
  const localTree = parseLsTree(run('git', ['ls-tree', '-r', localSha]))
  let remoteTree = new Map()
  if (remoteSha !== '') {
    const remoteCommit = gh([`repos/${slug}/git/commits/${remoteSha}`])
    const remoteTreeSha = remoteCommit.tree.sha
    const listed = gh([`repos/${slug}/git/trees/${remoteTreeSha}?recursive=1`])
    const entries = Array.isArray(listed.tree) ? listed.tree : []
    remoteTree = new Map(
      entries.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry.sha]),
    )
  }
  const delta = diffTrees(localTree, remoteTree)
  const changes = [
    ...delta.uploads.map((item) => ({ status: 'M', path: item.path })),
    ...delta.deletes.map((path) => ({ status: 'D', path })),
  ]
  report.changes = changes.length
  report.uploads = delta.uploads.length
  if (dryRun) {
    process.stdout.write(
      json
        ? `${JSON.stringify(report, null, 2)}\n`
        : `将上传 ${delta.uploads.length} 个、删除 ${delta.deletes.length} 个，目标 ${slug}@${branch}\n`,
    )
    return 0
  }

  const blobs = new Map()
  for (const item of delta.uploads) {
    const content = execFileSync('git', ['cat-file', 'blob', item.sha], {
      maxBuffer: 64 * 1024 * 1024,
    })
    const body = JSON.stringify({ content: content.toString('base64'), encoding: 'base64' })
    const created = gh(['-X', 'POST', `repos/${slug}/git/blobs`, '--input', '-'], body)
    blobs.set(item.path, created.sha)
  }

  const remoteCommit = gh([`repos/${slug}/git/commits/${remoteSha || localSha}`])
  const tree = gh(
    ['-X', 'POST', `repos/${slug}/git/trees`, '--input', '-'],
    JSON.stringify({
      base_tree: remoteSha === '' ? undefined : remoteCommit.tree.sha,
      tree: buildTreeEntries(changes, blobs),
    }),
  )
  const message = run('git', ['log', '-1', '--format=%B', localSha])
  const commit = gh(
    ['-X', 'POST', `repos/${slug}/git/commits`, '--input', '-'],
    JSON.stringify({
      message,
      tree: tree.sha,
      parents: remoteSha === '' ? [] : [remoteSha],
    }),
  )

  if (remoteSha === '') {
    gh(
      ['-X', 'POST', `repos/${slug}/git/refs`, '--input', '-'],
      JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    )
  } else {
    gh(
      ['-X', 'PATCH', `repos/${slug}/git/refs/heads/${branch}`, '--input', '-'],
      JSON.stringify({ sha: commit.sha, force: false }),
    )
  }

  report.ok = true
  report.commit = commit.sha
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(
      `已通过 API 推送：${slug}@${branch} → ${commit.sha.slice(0, 7)}（上传 ${delta.uploads.length} 个、删除 ${delta.deletes.length} 个）\n`,
    )
    process.stdout.write(
      '本地与远端现在内容一致但提交号不同，执行 git fetch origin && git reset --hard origin/' +
        branch +
        ' 对齐历史\n',
    )
  }
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
