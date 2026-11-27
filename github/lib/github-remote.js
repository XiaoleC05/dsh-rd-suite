/**
 * Pure helpers that turn Git remotes into GitHub repository identities and
 * render the structured issue body. No DSH service is touched here, so the
 * helpers are unit-testable outside the Harness.
 */

/** Environment keys that must not leak an inherited repository context into a command. */
export const GIT_CLEAR_ENV = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_CEILING_DIRECTORIES',
  'GIT_PREFIX',
]);

/**
 * Report whether a host name is treated as a GitHub host. github.com and any
 * host carrying a "github" DNS label (for example github.example.com) match;
 * a GitHub Enterprise Server on an unrelated host name does not, so its
 * projects keep using the normal fix flow.
 * @param {string} host - lower-case or mixed-case DNS name.
 * @returns {boolean} whether the host is recognized as GitHub.
 */
export function isGitHubHost(host) {
  const normalized = String(host).toLowerCase();
  return normalized === 'github.com' || normalized.split('.').includes('github');
}

/**
 * Parse a Git remote URL into a GitHub host plus owner/repository.
 * Supports https, http, ssh, git and scp-like (`git@host:owner/repo.git`)
 * forms. Returns null for a non-GitHub or malformed remote.
 * @param {unknown} remote - remote URL text.
 * @returns {{ host: string; owner: string; repo: string; slug: string } | null} identity, or null.
 */
export function parseGitHubRemote(remote) {
  if (typeof remote !== 'string') return null;
  const value = remote.trim();
  if (value === '' || /\s/.test(value)) return null;

  let host;
  let pathname;
  if (value.includes('://')) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    host = url.hostname;
    pathname = url.pathname;
  } else {
    const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(value);
    if (scp === null) return null;
    host = scp[1];
    pathname = scp[2];
  }

  host = host.toLowerCase();
  if (!isGitHubHost(host)) return null;

  const segments = pathname.replace(/^\/+/u, '').replace(/\/+$/u, '').split('/').filter(Boolean);
  if (segments.length !== 2) return null;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/iu, '');
  if (owner === '' || repo === '' || owner === '.' || repo === '.') return null;
  return { host, owner, repo, slug: `${host}/${owner}/${repo}` };
}

/**
 * Parse `git remote -v` output into fetch entries only (push duplicates and
 * push-only remotes are dropped).
 * @param {unknown} output - command stdout.
 * @returns {{ name: string; url: string }[]} one entry per fetch URL, in output order.
 */
export function parseRemoteList(output) {
  if (typeof output !== 'string') return [];
  const remotes = [];
  for (const line of output.split(/\r?\n/u)) {
    const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/u.exec(line.trim());
    if (match === null) continue;
    remotes.push({ name: match[1], url: match[2] });
  }
  return remotes;
}

/**
 * Choose the GitHub remote for the workflow: origin when it is GitHub, else
 * the first GitHub remote in output order.
 * @param {{ name: string; url: string }[]} remotes - parsed fetch remotes.
 * @returns {{ remoteName: string; url: string; host: string; owner: string; repo: string; slug: string } | null} chosen remote, or null.
 */
export function pickGitHubRemote(remotes) {
  if (!Array.isArray(remotes)) return null;
  const candidates = [];
  for (const remote of remotes) {
    const parsed = parseGitHubRemote(remote.url);
    if (parsed !== null) candidates.push({ remoteName: remote.name, url: remote.url, ...parsed });
  }
  if (candidates.length === 0) return null;
  return candidates.find(candidate => candidate.remoteName === 'origin') ?? candidates[0];
}

/**
 * Parse an issue reference accepted from the model: a number, `#123`, or an
 * issue URL ending in `/issues/123`.
 * @param {unknown} value - number, number text, or issue URL.
 * @returns {number | null} positive integer issue number, or null.
 */
export function parseIssueNumber(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const direct = /^#?(\d+)$/u.exec(text);
  if (direct !== null) {
    const parsed = Number(direct[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  const url = /\/issues\/(\d+)(?:[?#][^\s]*)?$/u.exec(text);
  if (url !== null) {
    const parsed = Number(url[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/**
 * Render the structured issue body. Symptoms, files and the fix plan are
 * supplied by the agent; the section skeleton is fixed so every issue records
 * the problem, the affected files and the expected fix.
 * @param {{ module?: string; symptom: string; files: string[]; fixPlan: string }} input - issue content.
 * @returns {string} Markdown body ending with one newline.
 */
export function buildIssueBody(input) {
  const moduleName = typeof input.module === 'string' ? input.module.trim() : '';
  const symptom = String(input.symptom ?? '').trim();
  const fixPlan = String(input.fixPlan ?? '').trim();
  const files = (Array.isArray(input.files) ? input.files : [])
    .map(file => String(file).trim())
    .filter(file => file !== '');

  const repro = String(input.repro ?? '').trim();
  const acceptance = String(input.acceptance ?? '').trim();
  const placeholder = (value, hint) => (value === '' ? `_待补充：${hint}_` : value);

  // 固定模板：现象 / 复现 / 影响 / 文件 / 验收 / 计划 / 环境。缺的段落给占位，不留空标题。
  const sections = [
    `## 现象\n\n${placeholder(symptom, '观察到的问题，不写计划中的修法')}`,
    `## 复现\n\n${placeholder(repro, '命令、输入或步骤，能重复出现即可')}`,
    `## 影响\n\n${moduleName === '' ? '_待补充：谁受影响、影响多大_' : `模块 ${moduleName}`}`,
    `## 受影响文件\n\n${files.length === 0 ? '_待补充：涉及的文件路径_' : files.map(file => `- \`${file}\``).join('\n')}`,
    `## 验收标准\n\n${placeholder(acceptance, '每条都能由命令或可观察结果判定')}`,
    `## 计划\n\n${placeholder(fixPlan, '打算怎么改，按步骤写')}`,
    `## 环境\n\n- 提交约定：Conventional Commits，一个模块一次提交，正文写 \`Closes #<number>\`\n- 流程：开发方建单 → 分支 → 原子提交 → 代码审计 → PR/合并 → 关闭`,
  ];
  return `${sections.join('\n\n')}\n`;
}
