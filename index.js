/**
 * 研发套件的融合插件（包根 Loader 行）。
 *
 * 一个插件主体同时承载：
 *   - 代码标准化工具（code_list_files / code_standardize 与只读工作区路由）
 *   - GitHub Issue 优先流程（github_workflow 工具与提示词 section）
 *   - 合并后的浏览器模块（模式卡片、代码面板、GitHub 设置行）
 *
 * 成员模块仍是各自目录里的 apply(ctx, config)；这里把它们挂到同一个插件主体上，
 * 于是插件列表里只出现一行，而不是每个功能各一行。
 */
import z from '@deepseek-ai/schemastery'
import * as codePipeline from './code-pipeline/index.js'
import * as github from './github/index.js'

export const name = 'rd-suite'

/** 成员声明的服务并集。 */
export const inject = ['tools', 'webServer', 'systemPrompt', 'subprocess', 'workingDirectory']

/**
 * 融合配置：GitHub 开关保持顶层键，让既有 profile 覆盖（按行 id）继续生效；
 * 代码工具使用自己的可选 section（缺省时成员内部用默认上限）。
 */
export const Config = z.object({
  githubIssueFirstWorkflow: z.boolean().default(false),
  codePipeline: z.any(),
})

/**
 * 组装融合插件。
 * @param ctx - Cordis 宿主上下文
 * @param config - 融合配置
 */
export function apply(ctx, config) {
  const codeConfig = config?.codePipeline
  codePipeline.apply(ctx, codeConfig !== null && typeof codeConfig === 'object' ? codeConfig : {})
  github.apply(ctx, { githubIssueFirstWorkflow: config?.githubIssueFirstWorkflow === true })
}
