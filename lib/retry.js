/**
 * 重试与降级判定。
 *
 * 三件以前散落各处的事：
 *   1. 哪些错误值得重试（只看错误码表里的 retryable）；
 *   2. 不值得重试时该停还是该绕；
 *   3. 绕的话具体怎么绕（例如推送被链路阻断时改走 API）。
 */

import { describeErrorCode } from './error-codes.js'

/** 可降级的场景：码 → 具体做法。没列出的码一律视为「只能停」。 */
export const DEGRADE_PATHS = {
  PUSH_FAILED: '改用 API 推送（node scripts/push-via-api.mjs）后校验远端树一致',
  ISSUE_CREATE_UNCONFIRMED: '先查 Issue 列表确认是否已创建，再决定要不要重发',
  ISSUE_CLOSE_UNCONFIRMED: '重新读一次 Issue 状态，别急着宣布已关闭',
  'guard-unavailable': '从侧栏重新打开面板；持续出现说明宿主连接服务没起来',
}

/**
 * 判定一个错误码该怎么处理。
 * @param {unknown} code - 错误码
 * @returns {{ code: string; decision: 'retry' | 'degrade' | 'stop'; reason: string; hint: string }} 判定
 */
export function classifyFailure(code) {
  const described = describeErrorCode(code)
  if (described === null) {
    return {
      code: String(code ?? ''),
      decision: 'stop',
      reason: '未登记的错误码',
      hint: '看日志里的 message，报给维护者',
    }
  }
  if (described.retryable) {
    return {
      code: described.code,
      decision: 'retry',
      reason: '瞬时失败，重发一次有机会成功',
      hint: described.action,
    }
  }
  const degrade = DEGRADE_PATHS[described.code]
  if (degrade !== undefined) {
    return {
      code: described.code,
      decision: 'degrade',
      reason: '不宜重试，但有替代路径',
      hint: degrade,
    }
  }
  return {
    code: described.code,
    decision: 'stop',
    reason: '重试也不会变好',
    hint: described.action,
  }
}

/**
 * 按判定重试一次或几次。
 *
 * 只做「重试」，降级由调用方按 classifyFailure 的 hint 决定——库不该替调用方选择绕路方式。
 *
 * @param {() => Promise<any>} call - 一次尝试
 * @param {{ attempts?: number; shouldRetry?: (result: any) => boolean; onRetry?: (result: any, attempt: number) => void }} [options] - 配置
 * @returns {Promise<{ value: any; attempts: number; retried: boolean }>} 结果与尝试次数
 */
export async function withRetry(call, options = {}) {
  const attempts =
    Number.isFinite(options.attempts) && options.attempts > 0 ? Math.floor(options.attempts) : 2
  const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : () => false
  let value
  let used = 0
  for (let index = 0; index < attempts; index += 1) {
    used = index + 1
    value = await call(used)
    if (used === attempts) break
    if (!shouldRetry(value)) break
    if (typeof options.onRetry === 'function') options.onRetry(value, used)
  }
  return { value, attempts: used, retried: used > 1 }
}
