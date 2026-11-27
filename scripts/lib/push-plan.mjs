/**
 * 推送回退通道：当 `git push` 的 POST 被链路掐断（GET 正常、receive-pack 挂起）时，
 * 用 GitHub Git Data API 把本地这一提交搬到远端。
 *
 * 纯逻辑（解析改动、拼树、快进校验）放在这里，网络调用留在 scripts/push-via-api.mjs，
 * 这样单测不需要网络。
 */

/**
 * 解析 `git diff --name-status` 的输出。
 * @param {string} text - 输出
 * @returns {{ status: string; path: string; previous?: string }[]} 改动列表
 */
export function parseNameStatus(text) {
  const changes = []
  for (const line of String(text ?? '').split(/\r?\n/u)) {
    if (line.trim() === '') continue
    const parts = line.split('\t')
    const status = (parts[0] ?? '').trim().toUpperCase()
    if (status.startsWith('R') || status.startsWith('C')) {
      const [, previous, next] = parts
      if (typeof next === 'string' && next !== '')
        changes.push({ status: status[0], path: next, previous })
      continue
    }
    const target = parts[1]
    if (typeof target === 'string' && target !== '')
      changes.push({ status: status[0], path: target })
  }
  return changes
}

/**
 * 拼出建树用的 entries：删除用 sha=null 表示，其余用上传后的 blob sha。
 * @param {{ status: string; path: string }[]} changes - 改动列表
 * @param {Map<string, string>} blobs - 路径到 blob sha
 * @returns {{ path: string; mode: string; type: 'blob'; sha: string | null }[]} entries
 */
export function buildTreeEntries(changes, blobs) {
  const entries = []
  for (const change of changes) {
    if (change.status === 'D') {
      entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null })
      continue
    }
    const sha = blobs.get(change.path)
    if (typeof sha !== 'string' || sha === '') throw new Error(`缺少 blob：${change.path}`)
    entries.push({ path: change.path, mode: '100644', type: 'blob', sha })
  }
  return entries
}

/**
 * 快进校验：远端 HEAD 必须是本地提交的祖先，否则应当先 rebase 而不是硬推。
 * @param {{ remoteSha: string; localSha: string; isAncestor: boolean }} state - 状态
 * @returns {true} 通过时返回 true
 */
export function assertFastForward(state) {
  if (state.remoteSha === '') return true
  if (state.remoteSha === state.localSha) return true
  if (state.isAncestor !== true) {
    throw new Error(
      `远端 ${state.remoteSha.slice(0, 7)} 不是本地 ${state.localSha.slice(0, 7)} 的祖先：先 git fetch 并 rebase，别硬推`,
    )
  }
  return true
}

/**
 * 把改动分成需要上传的与需要删除的。
 * @param {{ status: string; path: string }[]} changes - 改动列表
 * @returns {{ uploads: string[]; deletes: string[] }} 分类结果
 */
export function splitChanges(changes) {
  const uploads = []
  const deletes = []
  for (const change of changes) {
    if (change.status === 'D') deletes.push(change.path)
    else if (!uploads.includes(change.path)) uploads.push(change.path)
  }
  return { uploads, deletes }
}
