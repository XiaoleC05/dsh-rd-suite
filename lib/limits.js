/**
 * 体积上限的唯一事实来源。
 *
 * 这些数字以前散落在各成员里：改一处忘一处，也没有地方回答「现在的上限是多少」。
 */

/** 一处上限：数值加一句用途说明。 */
export const LIMITS = {
  /** 单条命令捕获的 stdout / stderr 字节数。 */
  commandOutputBytes: 1024 * 1024,
  /** HTTP 请求体字节数。 */
  httpBodyBytes: 2 * 1024 * 1024,
  /** 工具回传给模型的单段文本字符数。 */
  toolTextChars: 16_000,
  /** 单次列表最多返回的条数。 */
  listItems: 200,
  /** 单行诊断信息保留的字符数。 */
  diagnosticChars: 400,
}


/** 允许的超限策略：截断 / 明确拒绝 / 分页。 */
export const OVERFLOW_POLICIES = ['truncate', 'reject', 'page']

/**
 * 每个上限超过之后做什么，以及读的人会看到什么。
 * 与 LIMITS 一一对应，测试会校验两边没有遗漏。
 */
export const OVERFLOW_POLICY = {
  commandOutputBytes: {
    policy: 'truncate',
    effect: '保留前 1 MiB，标记 truncated，调用方看到的是可用的部分输出',
  },
  httpBodyBytes: {
    policy: 'reject',
    effect: '返回 413 与错误码 body-too-large，请求不进入处理逻辑',
  },
  toolTextChars: {
    policy: 'truncate',
    effect: '截断并注明「已截断 N 字符」，读者可判断要不要回头取全文',
  },
  listItems: {
    policy: 'page',
    effect: '默认返回前 N 条，用 offset 继续取，总数由 total 给出',
  },
  diagnosticChars: {
    policy: 'truncate',
    effect: '单行诊断保留前 400 字符并加省略号，完整内容去日志里找',
  },
}

/**
 * 截断文本，并在末尾标明截掉了多少。
 *
 * 只说「已截断」而不给数量，读的人无法判断该不该回头取全文。
 *
 * @param {unknown} text - 原文
 * @param {number} [limit] - 保留字符数
 * @returns {{ text: string; truncated: boolean; dropped: number }} 结果
 */
export function truncateText(text, limit = LIMITS.toolTextChars) {
  const value = String(text ?? '')
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : LIMITS.toolTextChars
  if (value.length <= max) return { text: value, truncated: false, dropped: 0 }
  const dropped = value.length - max
  return { text: `${value.slice(0, max)}…（已截断 ${dropped} 字符）`, truncated: true, dropped }
}
