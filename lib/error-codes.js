/**
 * 错误码总表。
 *
 * 四个成员各自返回 code，集中登记之后才能回答三个问题：
 * 这个码是什么意思、能不能重试、用户该做什么。
 *
 * 约定：
 * - GitHub 成员沿用大写（与 gh 的诊断分类一致），其余成员用小写连字符；
 * - retryable 表示同一请求重发一次有机会成功（网络抖动、限流），
 *   参数错误、权限不足、仓库状态不对都不算。
 */

/** 错误码表：code → 说明。 */
export const ERROR_CODES = {
  // ---------------------------------------------------------------- GitHub
  INVALID_ARGUMENTS: {
    message: '参数不合法或缺失',
    retryable: false,
    action: '按报错补齐参数后重试',
  },
  GIT_NOT_INSTALLED: {
    message: '本机找不到 git',
    retryable: false,
    action: '安装 git 并确认在 PATH 里',
  },
  GIT_COMMAND_FAILED: {
    message: 'git 命令执行失败',
    retryable: false,
    action: '看 stderr 的前几行定位具体命令',
  },
  GIT_COMMAND_TIMEOUT: {
    message: 'git 命令超时',
    retryable: true,
    action: '确认网络后重试；反复超时先查代理',
  },
  COMMAND_TIMEOUT: { message: '命令超时（进程被回收）', retryable: true, action: '确认网络后重试' },
  PUSH_FAILED: {
    message: '推送被拒绝或链路阻断',
    retryable: true,
    action: '先 fetch 看是否分叉，必要时改用 API 推送',
  },
  ISSUES_DISABLED: {
    message: '仓库没有开启 Issues',
    retryable: false,
    action: '在仓库设置里开启 Issues，或换 Issue 优先流程之外的做法',
  },
  REPOSITORY_ARCHIVED: { message: '仓库已归档', retryable: false, action: '取消归档或换仓库' },
  RELEASE_INCONSISTENT: {
    message: '发版前校验不通过（版本号或 CHANGELOG 对不上）',
    retryable: false,
    action: '对齐版本号与 CHANGELOG 后重发',
  },
  forbidden: {
    message: '没有权限执行该操作',
    retryable: false,
    action: '确认 gh 登录账号对该仓库有对应权限',
  },
  unauthorized: { message: 'gh 未登录或凭证失效', retryable: false, action: '运行 gh auth login' },
  'no-issues-disabled': {
    message: '仓库关闭了 Issues',
    retryable: false,
    action: '开启 Issues 或改用其他流程',
  },
  CANCELLED: { message: '操作被取消', retryable: true, action: '确认没有并发操作后重试' },

  // ------------------------------------------------------- 代码流水线
  internal: { message: '内部错误', retryable: false, action: '看日志里的 cause，报给维护者' },
  'bad-json': { message: '请求体不是合法 JSON', retryable: false, action: '检查请求体' },
  'bad-mode': { message: 'mode 只能是 report 或 fix', retryable: false, action: '改正 mode' },
  'bad-path': {
    message: '路径不合法（越界或超长）',
    retryable: false,
    action: '改用工作区内的相对路径',
  },
  'no-paths': { message: '没有给任何路径', retryable: false, action: '传 paths 或 root' },
  'too-many-paths': { message: '路径数量超过上限', retryable: false, action: '分批处理' },
  'body-too-large': { message: '请求体超过大小上限', retryable: false, action: '分批提交' },
  'unsupported-media-type': {
    message: 'Content-Type 不被接受',
    retryable: false,
    action: '改用 application/json',
  },
  'method-not-allowed': {
    message: 'HTTP 方法不被接受',
    retryable: false,
    action: '只读接口用 GET，写入接口用 POST',
  },
  'guard-unavailable': {
    message: '宿主连接服务不可用，请求被拒',
    retryable: true,
    action: '从侧栏重新打开面板；持续出现说明宿主没起来',
  },
  'unknown-preset': {
    message: '指定的预设不存在',
    retryable: false,
    action: '用 /preset 列出的 id',
  },
  'config-invalid': {
    message: '配置项非法，已按默认值处理',
    retryable: false,
    action: '按提示修正配置',
  },
  'config-clamped': {
    message: '配置值超出范围，已收敛到边界',
    retryable: false,
    action: '一般无需处理；想精确控制就改成范围内取值',
  },

  // ------------------------------------------------- GitHub 流程专属
  INTERNAL_ERROR: {
    message: '成员内部抛异常，已被兜住',
    retryable: false,
    action: '看日志里的 message，报给维护者',
  },
  GH_NOT_INSTALLED: {
    message: '本机找不到 gh',
    retryable: false,
    action: '安装 GitHub CLI 并登录',
  },
  GH_UNAUTHENTICATED: {
    message: 'gh 未登录',
    retryable: false,
    action: '运行 gh auth login 后重试',
  },
  NOT_A_GITHUB_PROJECT: {
    message: '当前目录不是 GitHub 仓库',
    retryable: false,
    action: '确认 remote 指向 GitHub，或换工作目录',
  },
  DEFAULT_BRANCH_HEAD: {
    message: '当前在默认分支上，不能作为 PR 的 head',
    retryable: false,
    action: '先 prepare_branch 建模块分支',
  },
  BRANCH_CREATE_FAILED: {
    message: '创建分支失败',
    retryable: false,
    action: '检查分支是否已存在或名称是否合法',
  },
  BRANCH_SWITCH_FAILED: {
    message: '切换分支失败',
    retryable: false,
    action: '先提交或暂存改动，再切分支',
  },
  REPOSITORY_UNAVAILABLE: {
    message: '仓库不可访问（归档、删除或权限不足）',
    retryable: false,
    action: '确认仓库存在且有权限',
  },
  ISSUE_LOOKUP_FAILED: {
    message: '读取 Issue 失败',
    retryable: true,
    action: '确认编号存在；偶发失败可重试',
  },
  ISSUE_CREATE_UNCONFIRMED: {
    message: '建单命令没有回显 URL，无法确认是否创建成功',
    retryable: true,
    action: '先 gh issue list 查是否已创建，避免重复建单',
  },
  ISSUE_COMMENT_FAILED: {
    message: '给 Issue 留言失败',
    retryable: true,
    action: '重试；仍失败就跳过留言并在报告里说明',
  },
  ISSUE_CLOSE_FAILED: {
    message: '关闭 Issue 失败',
    retryable: true,
    action: '确认 Issue 存在与权限后重试',
  },
  ISSUE_CLOSE_UNCONFIRMED: {
    message: '关闭后状态仍不是 closed',
    retryable: true,
    action: '再查一次状态，别急着宣布已关闭',
  },
  PR_LOOKUP_FAILED: {
    message: '读取 PR 失败',
    retryable: true,
    action: '确认 PR 编号；偶发失败可重试',
  },

  // --------------------------------------------------------------- 记忆
  'missing-id': { message: '缺少条目 id', retryable: false, action: '带上 id 再请求' },
  'not-found': { message: '找不到对应条目', retryable: false, action: '刷新列表后再选' },
}

/**
 * 查一个错误码的说明。
 * @param {unknown} code - 错误码
 * @returns {{ code: string; message: string; retryable: boolean; action: string } | null} 说明，未登记返回 null
 */
export function describeErrorCode(code) {
  const key = String(code ?? '')
  const entry = ERROR_CODES[key]
  if (entry === undefined) return null
  return { code: key, message: entry.message, retryable: entry.retryable, action: entry.action }
}

/**
 * 列出所有可重试的码，便于文档与测试使用。
 * @returns {string[]} 可重试的错误码
 */
export function retryableCodes() {
  return Object.entries(ERROR_CODES)
    .filter(([, entry]) => entry.retryable)
    .map(([code]) => code)
    .sort()
}

/**
 * 列出所有已登记的码。
 * @returns {string[]} 错误码
 */
export function knownCodes() {
  return Object.keys(ERROR_CODES).sort()
}
