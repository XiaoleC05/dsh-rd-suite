/**
 * 研发套件的融合插件（包根 Loader 行）。
 *
 * 一个插件主体同时承载：
 *   - 代码标准化工具（code_list_files / code_standardize 与只读工作区路由）
 *   - GitHub Issue 优先流程（github_workflow 工具与提示词 section）
 *   - 自动代码审查与修正：每次写文件/改文件后自动按项目规范格式化，无需手动触发
 *   - 合并后的浏览器模块（入口页、模式卡片、代码面板、GitHub 设置行）
 *
 * 成员模块仍是各自目录里的 apply(ctx, config)；这里把它们挂到同一个插件主体上，
 * 于是插件列表里只出现一行，而不是每个功能各一行。
 */
import { basename, dirname } from 'node:path'
import z from '@deepseek-ai/schemastery'
import * as codePipeline from './code-pipeline/index.js'
import * as github from './github/index.js'
import { standardize } from './code-pipeline/lib/standardize.js'
import { auditFiles } from './code-pipeline/lib/audit.js'

export const name = 'rd-suite'

/** 成员声明的服务并集。 */
export const inject = ['tools', 'webServer', 'systemPrompt', 'subprocess', 'workingDirectory']

/**
 * 融合配置。
 *
 * 格式审查与 GitHub 流程都是模式的固定流程，不再有开关；这两个字段只为兼容
 * 既有 profile 覆盖（按行 id 传入的旧值）而保留，读入后不使用。
 * 代码工具使用自己的可选 section，缺省时成员内部用默认上限。
 */
export const Config = z.object({
  githubIssueFirstWorkflow: z.boolean().default(false),
  autoCodeFix: z.boolean().default(true),
  codePipeline: z.any(),
})

/** Tools that produce or rewrite a file, by model-visible name. */
const WRITE_TOOL_NAMES = new Set([
  'write',
  'edit',
  'apply_patch',
  'create_file',
  'str_replace_editor',
])

/** Absolute file paths touched by one successful write-like tool call. */
function touchedPaths(exec) {
  if (exec === null || typeof exec !== 'object') return []
  if (!WRITE_TOOL_NAMES.has(exec.name)) return []
  const args = exec.arguments
  if (args === null || typeof args !== 'object') return []
  const raw = args.file_path ?? args.path ?? args.filePath ?? args.target_file
  return typeof raw === 'string' && raw.length > 0 ? [raw] : []
}

/**
 * Format one file in place and describe what changed.
 * @returns {Promise<string|null>} a one-line report, or null when nothing changed
 */
async function autoFixFile(absolute) {
  try {
    const result = await standardize({
      root: dirname(absolute),
      paths: [basename(absolute)],
      mode: 'fix',
    })
    const changed = Array.isArray(result?.files)
      ? result.files.filter((file) => file.status === 'changed')
      : []
    if (changed.length === 0) return null
    const file = changed[0]
    const lines = Number.isFinite(file.deltaLines) ? Math.abs(file.deltaLines) : 0
    const preset =
      typeof file.preset === 'string' && file.preset.length > 0 ? `（${file.preset}）` : ''
    return `自动审查：已按项目规范修正 ${basename(absolute)}${preset}${lines > 0 ? `，±${lines} 行` : ''}`
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    console.warn('[rd-suite] auto code fix failed for ' + absolute + ': ' + message)
    return null
  }
}

/**
 * 组装融合插件。
 * @param ctx - Cordis 宿主上下文
 * @param config - 融合配置
 */
export function apply(ctx, config) {
  const codeConfig = config?.codePipeline
  codePipeline.apply(ctx, codeConfig !== null && typeof codeConfig === 'object' ? codeConfig : {})

  // 每个会话在本轮模块里写过的文件。写文件时即时格式化，模块关闭时再整体审计一次。
  const touched = new Map()

  /** 会话键：没有 agent/session 时落到同一个桶里。 */
  function sessionKey(exec) {
    const id = exec?.agent?.session?.id
    return typeof id === 'string' && id !== '' ? id : 'session'
  }

  /**
   * 模块关闭时的代码审计：报告后修正，并把结果交给 github_workflow 一起返回。
   * @param exec - 当前工具调用
   * @returns 审计摘要，或 null（本轮没有改过文件）
   */
  async function auditModule(exec) {
    const key = sessionKey(exec)
    const files = [...(touched.get(key) ?? [])]
    if (files.length === 0) return null
    const audit = await auditFiles(files, { mode: 'fix' })
    touched.delete(key)
    return audit
  }

  // The GitHub flow is part of the mode: the member always registers its prompt
  // section and tool, and only keeps accepting the legacy setting for older
  // profile patches.
  github.apply(ctx, {
    githubIssueFirstWorkflow: config?.githubIssueFirstWorkflow === true,
    auditModule,
  })

  // 写文件后的即时格式化始终启用：它保证文件落盘就是符合规范的，
  // 代码修正面板因此只用于复查，不再是必经的手动步骤。
  ctx.on(
    'tools/post-execute',
    async (exec, result, next) => {
      const decision = await next()
      if (result === null || typeof result !== 'object' || result.isError === true) return decision
      const paths = touchedPaths(exec)
      if (paths.length === 0) return decision
      if (exec.signal !== undefined && exec.signal.aborted === true) return decision
      const bucket = touched.get(sessionKey(exec))
      if (bucket === undefined) touched.set(sessionKey(exec), new Set(paths))
      else for (const absolute of paths) bucket.add(absolute)
      for (const absolute of paths) await autoFixFile(absolute)
      return decision
    },
    'rd-suite: auto code review',
  )
}
