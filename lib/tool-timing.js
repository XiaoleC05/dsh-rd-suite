/**
 * 工具耗时统计：进程内单例，记录每次调用的耗时与成败。
 *
 * 只保留最近 N 次样本，避免长时间运行把内存吃掉；
 * 统计口径是「每个工具的调用次数、平均耗时、最大耗时、失败次数」。
 */

/** 最多保留多少条样本。 */
export const SAMPLE_LIMIT = 200

/** 进程内样本缓冲。 */
const samples = []

/**
 * 清空统计（测试与热重载用）。
 * @returns {void}
 */
export function resetToolTiming() {
  samples.length = 0
}

/**
 * 记录一次调用。
 * @param {{ tool: string; ms: number; ok?: boolean }} sample - 样本
 * @returns {number} 记录后的样本数
 */
export function recordToolCall(sample) {
  const ms = Number(sample?.ms)
  if (typeof sample?.tool !== 'string' || sample.tool === '' || !Number.isFinite(ms) || ms < 0)
    return samples.length
  samples.push({ tool: sample.tool, ms, ok: sample.ok !== false })
  if (samples.length > SAMPLE_LIMIT) samples.splice(0, samples.length - SAMPLE_LIMIT)
  return samples.length
}

/**
 * 按工具汇总。
 * @param {number} [top] - 只取平均耗时最慢的前几项
 * @returns {{ tool: string; calls: number; meanMs: number; maxMs: number; failures: number }[]} 汇总
 */
export function summarizeToolTiming(top) {
  const byTool = new Map()
  for (const sample of samples) {
    const entry = byTool.get(sample.tool) ?? {
      tool: sample.tool,
      calls: 0,
      totalMs: 0,
      maxMs: 0,
      failures: 0,
    }
    entry.calls += 1
    entry.totalMs += sample.ms
    entry.maxMs = Math.max(entry.maxMs, sample.ms)
    if (!sample.ok) entry.failures += 1
    byTool.set(sample.tool, entry)
  }
  const rows = [...byTool.values()]
    .map((entry) => ({
      tool: entry.tool,
      calls: entry.calls,
      meanMs: Math.round(entry.totalMs / entry.calls),
      maxMs: Math.round(entry.maxMs),
      failures: entry.failures,
    }))
    .sort((left, right) => right.meanMs - left.meanMs)
  return Number.isFinite(top) && top > 0 ? rows.slice(0, Math.floor(top)) : rows
}

/**
 * 包装一个工具定义，让 execute 被计时。
 *
 * 只包裹 execute，其余字段原样透传——包装层不该改变工具的对外形状。
 *
 * @param {object} definition - 工具定义
 * @param {{ now?: () => number }} [options] - 可注入的时钟
 * @returns {object} 包装后的定义
 */
export function wrapToolForTiming(definition, options = {}) {
  const now = options.now ?? (() => performance.now())
  const name = String(definition?.name ?? '')
  const execute = definition?.execute
  if (typeof execute !== 'function') return definition
  return {
    ...definition,
    async execute(...args) {
      const startedAt = now()
      let ok = true
      try {
        return await execute.apply(this, args)
      } catch (error) {
        ok = false
        throw error
      } finally {
        recordToolCall({ tool: name, ms: now() - startedAt, ok })
      }
    },
  }
}
