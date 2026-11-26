#!/usr/bin/env node
// validate-bundle.mjs — 研发模式 bundle 校验器（只读，不修改任何文件）。
//
// 两种运行方式：
//   1) 静态检查（任意 node ≥ 20）：
//        node scripts/validate-bundle.mjs
//      检查 package.json、技能格式与体积、persona 占位符。
//   2) 完整检查（推荐，在 DSH 会话的 pwsh 中运行 scripts/validate.ps1）：
//      用 DSH 自带的 Electron 运行时（ELECTRON_RUN_AS_NODE=1）加载 app.asar 里的 js-yaml 与各插件，
//      额外解析 preset.patch.yml（含 !!js 方言），并用每个插件自己的配置 schema 校验每一行 config。
//      选项：--dsh-install <dir>  @deepseek-ai/dsh 包目录（默认取环境变量 DSH_INSTALL_DIR）
//
// 退出码：0 = 无错误（可能有警告）；1 = 有错误。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argValue = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
const installDir = argValue('--dsh-install') ?? process.env.DSH_INSTALL_DIR

const out = { error: [], warn: [], info: [] }
const error = m => out.error.push(m)
const warn = m => out.warn.push(m)
const info = m => out.info.push(m)

const BUILTIN_PRESETS = ['standard', 'ptc', 'minimal', 'cordis']
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const LIMITS = { bodyWarn: 6000, bodyError: 7800, descWarn: 200, descError: 300, refWarn: 7800, refBytes: 32768 }
// 提供服务的插件必须放在带对应 isolate 键的 cordis:group 里（与官方预设一致）。
const ISOLATE_REQUIRED = {
  '@deepseek-ai/dsh-compaction-basic': 'compaction',
  '@deepseek-ai/dsh-compaction-tool-result-pruner': 'toolResultPruner',
  '@deepseek-ai/dsh-plan-mode': 'planMode',
  '@deepseek-ai/dsh-workflow-ptc': 'workflowEngine',
}
const cp = s => [...s].length
const rel = p => path.relative(ROOT, p).split(path.sep).join('/')

// ───────────── 1. package.json ─────────────
let manifest
try {
  manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
} catch (e) {
  error(`package.json 无法解析：${e.message}`)
}
let patchFiles = []
if (manifest) {
  if (!manifest.name) error('package.json 缺少 name')
  if (!manifest.version) error('package.json 缺少 version')
  const patch = manifest.dsh?.bundle?.patch
  if (!patch) error('package.json 缺少 dsh.bundle.patch（plugin_manager 会以 not-bundle 拒绝安装）')
  patchFiles = (Array.isArray(patch) ? patch : patch ? [patch] : []).map(p => path.join(ROOT, p))
  for (const f of patchFiles) if (!fs.existsSync(f)) error(`dsh.bundle.patch 指向的文件不存在：${rel(f)}`)
  if (manifest.exports && !manifest.exports['./package.json']) {
    error('package.json 的 exports 必须包含 "./package.json"，否则预设里 createRequire(...).resolve(\'<包名>/package.json\') 会失败，技能目录无法挂载')
  }
  if (!manifest.engines?.dsh) warn('package.json 没有 engines.dsh（建议只写下限，如 ">=0.2.2-rc.5"）')
  if (manifest.dependencies && Object.keys(manifest.dependencies).length) {
    warn('package.json 声明了 dependencies：预设包应保持零依赖，官方包从 DSH 安装目录解析')
  }
  info(`包：${manifest.name}@${manifest.version}`)
}

// ───────────── 2. 技能 ─────────────
function parseFrontmatter(text, yaml) {
  if (!/^---\r?\n/.test(text)) return { problem: '第一行必须正好是 ---（frontmatter 必须从文件开头开始）' }
  const lines = text.split(/\r?\n/)
  let end = -1
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') { end = i; break }
  if (end < 0) return { problem: '缺少结束的 --- 行' }
  const raw = lines.slice(1, end).join('\n')
  const body = lines.slice(end + 1).join('\n').trim()
  let data
  if (yaml) {
    try { data = yaml.load(raw) } catch (e) { return { problem: `frontmatter YAML 无法解析：${e.message.split('\n')[0]}` } }
  } else {
    data = {}
    for (const line of raw.split('\n')) {
      const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
      if (m) data[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { problem: 'frontmatter 必须是键值映射' }
  return { data, body }
}
const BOOL_OK = new Set(['true', 'false', 'yes', 'no', 'on', 'off', '1', '0'])
function checkSkills(yaml) {
  const dir = path.join(ROOT, 'skills')
  if (!fs.existsSync(dir)) { error('缺少 skills/ 目录'); return [] }
  const names = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, ent.name)
    let file
    if (ent.isDirectory()) {
      file = path.join(full, 'SKILL.md')
      if (!fs.existsSync(file)) { warn(`skills/${ent.name}/ 没有 SKILL.md，会被忽略`); continue }
    } else if (ent.name.endsWith('.md')) {
      error(`skills/${ent.name} 会被当作平铺技能加载；本包只使用 <名称>/SKILL.md 目录形式`)
      continue
    } else continue
    const text = fs.readFileSync(file, 'utf8')
    const fm = parseFrontmatter(text, yaml)
    if (fm.problem) { error(`${rel(file)}：${fm.problem}`); continue }
    const { data, body } = fm
    for (const legacy of ['disableModelInvocation', 'modelInvocable', 'userInvocable']) {
      if (legacy in data) error(`${rel(file)}：不支持的旧字段 ${legacy}（会导致整个技能被丢弃）`)
    }
    const name = typeof data.name === 'string' ? data.name : ''
    const desc = typeof data.description === 'string' ? data.description.replace(/\s+/g, ' ').trim() : ''
    if (!name || !desc) { error(`${rel(file)}：frontmatter 必须同时有 name 与 description`); continue }
    if (!SKILL_NAME.test(name)) error(`${rel(file)}：name "${name}" 不符合小写连字符格式`)
    if (name !== ent.name) warn(`${rel(file)}：name "${name}" 与目录名 "${ent.name}" 不一致`)
    if (desc.length > LIMITS.descError) error(`${rel(file)}：description ${desc.length} 字符，超过目录截断上限 ${LIMITS.descError}`)
    else if (desc.length > LIMITS.descWarn) warn(`${rel(file)}：description ${desc.length} 字符，建议 ≤ ${LIMITS.descWarn}`)
    for (const flag of ['disable-model-invocation', 'user-invocable']) {
      if (flag in data && !BOOL_OK.has(String(data[flag]).toLowerCase())) error(`${rel(file)}：${flag} 的值 "${data[flag]}" 不是布尔值（会导致整个技能被丢弃）`)
    }
    const n = cp(body)
    if (n > LIMITS.bodyError) error(`${rel(file)}：正文 ${n} 字符，超过 ${LIMITS.bodyError}（压缩时会被裁掉中段）`)
    else if (n > LIMITS.bodyWarn) warn(`${rel(file)}：正文 ${n} 字符，建议 ≤ ${LIMITS.bodyWarn}`)
    if (/\$ARGUMENTS|\{\{/.test(body)) warn(`${rel(file)}：正文含模板占位符，DSH 技能不做变量替换`)
    const refDir = path.join(full, 'references')
    if (fs.existsSync(refDir)) {
      for (const r of fs.readdirSync(refDir).filter(f => f.endsWith('.md'))) {
        const rf = path.join(refDir, r)
        const rt = fs.readFileSync(rf, 'utf8')
        if (cp(rt) > LIMITS.refWarn) warn(`${rel(rf)}：${cp(rt)} 字符，超过 ${LIMITS.refWarn}，压缩时可能被裁掉中段`)
        if (Buffer.byteLength(rt) > LIMITS.refBytes) warn(`${rel(rf)}：${Buffer.byteLength(rt)} 字节，单次 read 读不完（上限 ${LIMITS.refBytes}）`)
      }
    }
    const hidden = String(data['disable-model-invocation'] ?? '').toLowerCase() === 'true'
    names.push({ name, desc, body: n, hidden })
  }
  for (const s of names) info(`技能 ${s.name}：描述 ${s.desc.length} 字符，正文 ${s.body} 字符${s.hidden ? '（仅用户 /调用）' : ''}`)
  const catalog = names.filter(s => !s.hidden).reduce((a, s) => a + s.name.length + s.desc.length + 6, 0)
  info(`技能目录常驻文本约 ${catalog} 字符（不含固定说明）`)
  return names
}

// ───────────── 3. 预设 YAML ─────────────
function checkPlaceholders(text, where) {
  for (const m of text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (!['model', 'provider'].includes(m[1])) error(`${where}：占位符 {{${m[1]}}} 不受支持（只允许 model 与 provider），提示词组装会失败`)
  }
  const stray = text.replace(/\{\{\s*(model|provider)\s*\}\}/g, '')
  if (stray.includes('{{')) error(`${where}：存在未闭合或非法的 {{，提示词组装会失败`)
}

async function fullCheck(yaml) {
  const nodeModules = path.resolve(installDir, '..', '..')
  const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar', resolve: d => typeof d === 'string', construct: d => ({ __jsExpr: d }),
  })
  const schema = yaml.JSON_SCHEMA.extend(JsExpr)
  const stripJs = v => {
    if (Array.isArray(v)) return v.map(stripJs)
    if (v && typeof v === 'object') {
      if ('__jsExpr' in v) return '/__js_expression__'
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripJs(x)]))
    }
    return v
  }
  const moduleCache = new Map()
  async function loadPlugin(name) {
    if (moduleCache.has(name)) return moduleCache.get(name)
    const parts = name.split('/')
    const pkg = name.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    const sub = (name.startsWith('@') ? parts.slice(2) : parts.slice(1)).join('/')
    const pkgDir = path.join(nodeModules, ...pkg.split('/'))
    const res = { ok: false }
    try {
      const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
      let target = pj.exports?.[sub ? `./${sub}` : '.'] ?? (sub ? undefined : pj.module ?? pj.main)
      while (target && typeof target === 'object') target = target.import ?? target.default ?? target.node ?? target.require
      if (!target) throw new Error(`包 ${pkg} 没有导出 ${sub ? './' + sub : '.'}`)
      const mod = await import(pathToFileURL(path.join(pkgDir, target)).href)
      res.ok = true
      res.version = pj.version
      res.schema = mod.Config ?? mod.default?.Config ?? null
    } catch (e) {
      res.problem = e.code === 'ENOENT' ? `找不到插件包 ${pkg}（DSH 安装中不存在，预设会整体 broken）` : e.message.split('\n')[0]
    }
    moduleCache.set(name, res)
    return res
  }
  const presets = []
  async function checkRows(rows, where, isolate) {
    if (!Array.isArray(rows)) { error(`${where}：应为插件行数组`); return }
    const ids = new Set()
    for (const row of rows) {
      const label = `${where} › ${row?.id ?? '(无 id)'}`
      if (!row || typeof row !== 'object' || typeof row.name !== 'string') { error(`${label}：缺少 name`); continue }
      if (row.id) { if (ids.has(row.id)) error(`${label}：同一列表内 id 重复`); ids.add(row.id) }
      const known = new Set(['id', 'name', 'config', 'disabled', 'inject', 'intercept', 'isolate', 'group'])
      for (const k of Object.keys(row)) if (!known.has(k)) warn(`${label}：未知行字段 ${k}`)
      if (row.name === 'cordis:group') {
        if (row.group !== true) error(`${label}：cordis:group 行需要 group: true`)
        await checkRows(row.config, label, { ...isolate, ...(row.isolate ?? {}) })
        continue
      }
      const need = ISOLATE_REQUIRED[row.name]
      if (need && !isolate?.[need]) error(`${label}：${row.name} 提供服务，必须放在 isolate.${need}: true 的分组里`)
      const plugin = await loadPlugin(row.name)
      if (!plugin.ok) { error(`${label}：${plugin.problem}`); continue }
      const cfg = row.config === undefined ? undefined : stripJs(row.config)
      if (plugin.schema) {
        try {
          plugin.schema(cfg)
        } catch (e) {
          let retried = false
          if (cfg === undefined) { try { plugin.schema({}); retried = true } catch {} }
          if (!retried) error(`${label}：config 未通过 ${row.name} 的 schema 校验 —— ${e.message.split('\n')[0]}`)
        }
        const dict = plugin.schema.dict
        if (plugin.schema.type === 'object' && dict && cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
          for (const k of Object.keys(cfg)) if (!(k in dict)) error(`${label}：${row.name} 不认识配置字段 ${k}`)
        }
      } else if (row.name === '@deepseek-ai/dsh-plan-mode') {
        // plan-mode 不导出 schema，而是在 resolveConfig 中只接受非空字符串 section。
        const keys = Object.keys(cfg ?? {})
        if (typeof cfg?.section !== 'string' || !cfg.section.trim()) error(`${label}：plan-mode 需要非空字符串 section`)
        if (keys.some(k => k !== 'section')) error(`${label}：plan-mode 只接受 section 字段，发现 ${keys.join(', ')}`)
      } else if (cfg !== undefined && row.name !== '@deepseek-ai/dsh-agent-preset') {
        warn(`${label}：${row.name} 未导出 Config schema，未校验 config`)
      }
      if (row.name === '@deepseek-ai/dsh-agent-preset') {
        const c = row.config ?? {}
        presets.push({ id: c.id, rows: c.plugins })
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.id ?? '')) error(`${label}：预设 id "${c.id}" 必须是小写字母、数字与连字符`)
        if (BUILTIN_PRESETS.includes(c.id)) error(`${label}：不要覆盖内置预设 ${c.id}，请使用新 id`)
        await checkRows(c.plugins, `预设 ${c.id}`, {})
      }
      if (row.name === '@deepseek-ai/dsh-persona') {
        for (const key of ['prefix', 'suffix']) {
          if (typeof row.config?.[key] === 'string') {
            checkPlaceholders(row.config[key], `${label}.${key}`)
            info(`${label}.${key}：${cp(row.config[key])} 字符`)
          }
        }
      }
    }
  }
  for (const file of patchFiles) {
    let doc
    try {
      doc = yaml.load(fs.readFileSync(file, 'utf8'), { schema })
    } catch (e) {
      error(`${rel(file)}：YAML 无法解析 —— ${e.message.split('\n')[0]}`)
      continue
    }
    if (!Array.isArray(doc)) { error(`${rel(file)}：顶层必须是补丁数组`); continue }
    for (const patch of doc) {
      if (Array.isArray(patch?.insert)) await checkRows(patch.insert, rel(file), {})
      else warn(`${rel(file)}：发现非 insert 补丁（覆盖已有行），请确认是有意为之：${JSON.stringify(patch).slice(0, 120)}`)
    }
  }
  // 预设之间的引用
  const declared = new Set(presets.map(p => p.id))
  if (declared.size !== presets.length) error('预设 id 重复')
  const walk = rows => (rows ?? []).flatMap(r => r?.name === 'cordis:group' ? walk(r.config) : [r])
  for (const p of presets) {
    for (const r of walk(p.rows)) {
      if (r?.name !== '@deepseek-ai/dsh-tool-subagent') continue
      const c = r.config ?? {}
      const refs = [c.agentPreset, ...(c.allowedAgentPresets ?? [])].filter(Boolean)
      for (const id of refs) if (!declared.has(id) && !BUILTIN_PRESETS.includes(id)) error(`预设 ${p.id} › ${r.id}：引用了不存在的预设 ${id}`)
      if (c.agentPreset && c.allowedAgentPresets && !c.allowedAgentPresets.includes(c.agentPreset)) error(`预设 ${p.id} › ${r.id}：allowedAgentPresets 必须包含 agentPreset`)
      if (c.agentPreset && c.provider !== 'spawn') error(`预设 ${p.id} › ${r.id}：只有 provider: spawn 支持指定子代理预设`)
    }
    const names = walk(p.rows).filter(r => r?.name === '@deepseek-ai/dsh-tool-subagent').map(r => r.config?.toolName ?? 'subagent')
    if (new Set(names).size !== names.length) error(`预设 ${p.id}：子代理工具名重复 ${names.join(', ')}`)
  }
  info(`预设：${[...declared].join(', ')}（已按 DSH ${await dshVersion()} 的插件 schema 校验）`)
  info(`官方预设目录（升级后对照用）：${path.join(nodeModules, '@deepseek-ai', 'dsh-web-app', 'presets')}`)
}
async function dshVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(installDir, 'package.json'), 'utf8')).version } catch { return '?' }
}

// ───────────── 运行 ─────────────
let yaml = null
const full = Boolean(installDir && process.versions.electron)
if (full) {
  try { yaml = createRequire(path.join(installDir, 'package.json'))('js-yaml') } catch (e) { warn(`无法从 DSH 安装加载 js-yaml：${e.message.split('\n')[0]}`) }
}
checkSkills(yaml)
for (const f of patchFiles) if (fs.existsSync(f)) {
  const text = fs.readFileSync(f, 'utf8')
  if (text.includes('\t')) error(`${rel(f)}：含制表符，YAML 缩进必须用空格`)
  checkPlaceholders(text.replace(/^\s*#.*$/gm, ''), rel(f))
}
if (full && yaml) await fullCheck(yaml)
else info('静态模式：未解析 YAML、未做插件 schema 校验。完整检查请在 DSH 会话中运行 scripts/validate.ps1。')

for (const m of out.info) console.log(`INFO  ${m}`)
for (const m of out.warn) console.log(`WARN  ${m}`)
for (const m of out.error) console.log(`ERROR ${m}`)
console.log(`\n结果：${out.error.length ? 'FAIL' : 'OK'}（错误 ${out.error.length}，警告 ${out.warn.length}，模式 ${full && yaml ? '完整' : '静态'}）`)
process.exit(out.error.length ? 1 : 0)
