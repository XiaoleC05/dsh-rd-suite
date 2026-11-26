#!/usr/bin/env node
/**
 * Regenerate ui/preset-cards/client.js from the installed DSH client bundle.
 *
 * Why this exists: the Agent-preset settings cards render their "pattern
 * explanation / how to use" buttons only for the four shipped preset ids — the
 * shipped client module carries a hard-coded guide map and a
 * `trust === 'system'` gate, and a preset declaration has no field for that
 * copy. So this bundle vendors the shipped client module (MIT; see
 * ui/preset-cards/docs/DETAIL.md) with four additions:
 *
 *   1. guide entries for rd / rd-scout / rd-review,
 *   2. a wider `presetGuide` gate that also accepts those custom ids,
 *   3. its own locale namespace (`settings.rdPreset`) so both modules can
 *      register their dictionaries without colliding,
 *   4. the other three surface registrations (new-session chip, session header
 *      label, plugin-menu entry) removed — the shipped plugin keeps rendering
 *      those, and only the `settings.section` cell `agent-presets` is replaced.
 *
 * Run after a DSH upgrade:
 *   node scripts/vendor-preset-cards.mjs
 * The script fails loudly when an anchor no longer matches, which means the
 * shipped UI changed and the patches must be re-derived.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const outDir = join(repoRoot, 'ui', 'preset-cards')
const outFile = join(outDir, 'client.js')

const PKG = 'dsh/node_modules/@deepseek-ai/dsh-client-ui-agent-preset'
const SHIPPED_ID = '@deepseek-ai/dsh-client-ui-agent-preset'
const OUR_ID = '@local/dsh-rd-mode-cards'
const SHIPPED_NS = 'settings.agentPreset'
const OUR_NS = 'settings.rdPreset'

/** Guide copy: each entry is `<key>:\`<text>\`` in the target bundle's dialect. */
const GUIDE_EN = [
  'rdGuideName:`R&D mode`',
  'rdGuideIntro:`A pipeline for software R&D: tier the task, implement and verify through acceptance gates, and load domain skills only when the task needs them.`',
  'rdGuideExplanation:`**Best for**: coding, defect fixing, feature work, testing, web front ends, data pipelines, and AI/Agent development.\n\n**How it works**: the first reply tiers the task (L0 question, L1 micro change, L2 standard, L3 complex). L2 and L3 state a spec card with checkable acceptance criteria, implement, run the verification commands, and report in the delivery template; L3 also calls an independent reviewing subagent.\n\n**Different from Standard mode**: earlier context compaction (about 199k), tighter read and search caps, domain skills loaded per task, and a built-in R&D workflow with safety rules.`',
  'rdGuideUsage:`### Fix a defect\nDescribe the symptom and the expected behavior. The mode reproduces, locates, applies the smallest fix, and leaves a regression test.\n\n### Add a feature\nState the goal and acceptance criteria; L2/L3 first produce a spec card and plan, then implement and verify each criterion.\n\n### Refactor a large area\nL3 work gets a spec card, an independent reviewing subagent after implementation, and a delivery report.`',
  'rdScoutGuideName:`R&D scout`',
  'rdScoutGuideIntro:`A read-only scout subagent: locates code, maps call relationships, researches references, and returns a conclusion under 40 lines.`',
  'rdScoutGuideExplanation:`Use it for an unfamiliar code base, a wide search, or research that would otherwise flood this conversation. It never tiers a task, never delegates, never asks, and never writes files.\n\nThe main R&D mode delegates to it by default when it calls the subagent tool. You can also open a session with this preset directly for a read-only pass.`',
  'rdScoutGuideUsage:`### Learn an unfamiliar code base\nAsk for module boundaries, entry points, and the key call chain, returned as file and line references.\n\n### Search widely once\nAsk everything that spans several directories in one prompt instead of repeating searches in the main conversation.`',
  'rdReviewGuideName:`R&D acceptance`',
  'rdReviewGuideIntro:`An independent acceptance subagent: reviews a change against its spec and acceptance criteria without the author context, then reports a VERDICT with graded findings.`',
  'rdReviewGuideExplanation:`Use it for L3 work and for L2 changes that touch risk. It re-runs the verification commands itself and reports BLOCKER / MAJOR / MINOR findings plus a final verdict.\n\nIn R&D mode this preset backs the review_agent tool; you can also open a session with it for a standalone review.`',
  'rdReviewGuideUsage:`### Review before merging\nAfter L3 work, check that every acceptance criterion has real evidence.\n\n### High-risk changes\nAuthorization, payments, data migrations, and concurrency changes get a review before delivery.`',
]

const GUIDE_ZH = [
  'rdGuideName:`研发模式`',
  'rdGuideIntro:`面向软件研发的流水线模式：先给任务分级，再按验收关卡实现与复核，领域技能只在任务需要时加载。`',
  'rdGuideExplanation:`**适合**：改代码、修缺陷、加功能、测试、网站前端、数据流水线，以及 AI/Agent 研发任务。\n\n**工作方式**：第一条回复先给任务分级（L0 问答、L1 微改、L2 标准、L3 复杂）。L2 与 L3 先写规格卡与可判定的验收标准，再实现、亲自运行验证命令，并按交付报告模板汇报；L3 还会调用独立验收子代理复核。\n\n**与标准模式的区别**：更早触发上下文压缩（约 199k）、单次读取与搜索结果上限更小、领域技能按任务加载，并内置研发流程与安全红线。`',
  'rdGuideUsage:`### 修复缺陷\n描述现象与期望行为：模式会先复现、定位，再给出最小修复并留下回归测试。\n\n### 新增功能\n写下目标与验收标准；L2/L3 先出规格卡与计划，批准后实现并逐条验证。\n\n### 大范围重构\nL3 任务会先出规格卡，实现后调用独立验收子代理复核，再给交付报告。`',
  'rdScoutGuideName:`研发·侦察`',
  'rdScoutGuideIntro:`只读侦察子代理：定位代码、梳理调用关系、查资料，结论不超过 40 行。`',
  'rdScoutGuideExplanation:`适合陌生代码库、大范围检索，以及会淹没当前会话的资料调研。它不分级、不委派、不提问、不改文件。\n\n研发模式调用 subagent 时默认使用它；也可以直接用这个预设新建会话，做一次只读侦察。`',
  'rdScoutGuideUsage:`### 熟悉陌生代码库\n让它给出模块划分、入口与关键调用链，并返回可直接引用的文件与行。\n\n### 一次问清大范围检索\n把跨多个目录的查找合并成一次提问，避免主会话反复搜索消耗上下文。`',
  'rdReviewGuideName:`研发·验收`',
  'rdReviewGuideIntro:`独立验收子代理：不带作者上下文，按规格与验收标准复核改动，给出 VERDICT 与分级问题。`',
  'rdReviewGuideExplanation:`适合 L3 任务和涉及风险的 L2 改动。它会亲自重跑验证命令，报告 BLOCKER / MAJOR / MINOR 问题与最终结论。\n\n研发模式中它支撑 review_agent 工具；也可以直接用这个预设新建会话，做一次独立审查。`',
  'rdReviewGuideUsage:`### 合并前复核\nL3 任务完成后调用，确认每条验收标准都有真实证据。\n\n### 高风险改动\n权限、支付、数据迁移、并发相关的改动，交付前先验收。`',
]

/** The three guide-map entries appended after the shipped four. */
const GUIDE_MAP_ENTRIES = [
  '[`rd`,{name:`rdGuideName`,intro:`rdGuideIntro`,explanation:`rdGuideExplanation`,usage:`rdGuideUsage`}]',
  '[`rd-scout`,{name:`rdScoutGuideName`,intro:`rdScoutGuideIntro`,explanation:`rdScoutGuideExplanation`,usage:`rdScoutGuideUsage`}]',
  '[`rd-review`,{name:`rdReviewGuideName`,intro:`rdReviewGuideIntro`,explanation:`rdReviewGuideExplanation`,usage:`rdReviewGuideUsage`}]',
].join(',')

/** Locate the Electron resources directory that holds app.asar. */
function findAsar() {
  const install = process.env.DSH_INSTALL_DIR
  if (install) {
    const candidate = resolve(install, '..', '..', '..', '..')
    if (candidate.endsWith('app.asar') && existsSync(candidate)) return candidate
  }
  const fallback = resolve(process.env.USERPROFILE ?? '', 'AppData/Local/Programs/DeepSeek Harness/resources/app.asar')
  return existsSync(fallback) ? fallback : undefined
}

/** Read one file inside an asar archive using the asar header (no dependencies). */
function readAsarFile(asar, innerPath) {
  const fd = openSync(asar, 'r')
  try {
    const sizeBuf = Buffer.alloc(8)
    readSync(fd, sizeBuf, 0, 8, null)
    const headerSize = sizeBuf.readUInt32LE(4)
    const headerBuf = Buffer.alloc(headerSize)
    readSync(fd, headerBuf, 0, headerSize, null)
    const jsonLength = headerBuf.readUInt32LE(4)
    const header = JSON.parse(headerBuf.subarray(8, 8 + jsonLength).toString('utf8'))
    let node = header
    for (const segment of innerPath.split('/')) {
      node = node.files?.[segment]
      if (node === undefined) throw new Error(`asar entry not found: ${innerPath}`)
    }
    if (node.files !== undefined) throw new Error(`asar entry is a directory: ${innerPath}`)
    // The asar header stores large offsets as decimal strings.
    const size = Number(node.size)
    const dataOffset = 8 + headerSize + Number(node.offset)
    const buf = Buffer.alloc(size)
    readSync(fd, buf, 0, size, dataOffset)
    return buf
  } finally {
    closeSync(fd)
  }
}

function replaceOnce(text, from, to, label) {
  const at = text.indexOf(from)
  if (at === -1) throw new Error(`anchor not found (${label}) — the shipped UI changed, re-derive the patch`)
  if (text.indexOf(from, at + 1) !== -1) throw new Error(`anchor not unique (${label}) — the shipped UI changed, re-derive the patch`)
  return text.slice(0, at) + to + text.slice(at + from.length)
}

function cutBetween(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker)
  if (start === -1) throw new Error(`start anchor not found (${label})`)
  const end = text.indexOf(endMarker, start)
  if (end === -1) throw new Error(`end anchor not found (${label})`)
  return text.slice(0, start) + text.slice(end + endMarker.length)
}

function main() {
  const asar = findAsar()
  if (asar === undefined) {
    throw new Error('app.asar not found — run this from a profile-launched shell (DSH_INSTALL_DIR) or set USERPROFILE')
  }
  const manifest = JSON.parse(readAsarFile(asar, `${PKG}/package.json`).toString('utf8'))
  let text = readAsarFile(asar, `${PKG}/lib/client.js`).toString('utf8')
  if (!text.includes(`load({id:\`${SHIPPED_ID}\``)) {
    throw new Error('unexpected client bundle shape — the shipped UI changed')
  }

  // 1. Drop the surface registrations the shipped plugin still provides.
  text = cutBetween(
    text,
    'const chip=scope.slots.register(',
    '},AgentPresetLabel);',
    'hero chip and header label',
  )
  text = replaceOnce(
    text,
    'return()=>{creatorDraft=void 0;chip();label()}',
    'return()=>{creatorDraft=void 0}',
    'section effect disposer',
  )
  text = cutBetween(
    text,
    'scope.slots.inject(`plugins.add.actions`',
    '},CreatePluginMenuItem))',
    'plugin menu entry',
  )

  // 2. Own locale namespace so the two modules never register the same one.
  const namespaceCount = text.split(SHIPPED_NS).length - 1
  if (namespaceCount < 3) throw new Error(`unexpected locale namespace usage count: ${namespaceCount}`)
  text = text.split(SHIPPED_NS).join(OUR_NS)

  // 3. Own module id (must equal the bundle package name).
  text = replaceOnce(text, `load({id:\`${SHIPPED_ID}\``, `load({id:\`${OUR_ID}\``, 'module id')

  // 4. Guide entries for the custom presets.
  text = replaceOnce(
    text,
    'usage:`guideCordisUsage`}]]);function presetGuide(',
    `usage:\`guideCordisUsage\`}],${GUIDE_MAP_ENTRIES}]);function presetGuide(`,
    'guides map',
  )

  // 5. Accept the custom ids from user-trust rows.
  text = replaceOnce(
    text,
    'function presetGuide(id,trust){return trust===`system`?guides.get(id):void 0}',
    'function presetGuide(id,trust){return trust===`system`||id===`rd`||id===`rd-scout`||id===`rd-review`?guides.get(id):void 0}',
    'presetGuide gate',
  )

  // 6. Dictionary entries (lookup falls back zh -> en -> key, so both are needed).
  text = replaceOnce(
    text,
    'customGroup:`Custom`,sectionIntro:',
    `customGroup:\`Custom\`,${GUIDE_EN.join(',')},sectionIntro:`,
    'en dictionary',
  )
  text = replaceOnce(
    text,
    'customGroup:`自定义`,sectionIntro:',
    `customGroup:\`自定义\`,${GUIDE_ZH.join(',')},sectionIntro:`,
    'zh dictionary',
  )

  // Sanity checks on the result.
  for (const forbidden of ['conversation.hero.agentPreset', 'conversation.session.header.actions', 'plugins.add.actions', SHIPPED_NS]) {
    if (text.includes(forbidden)) throw new Error(`leftover after patch: ${forbidden}`)
  }
  for (const required of [`load({id:\`${OUR_ID}\``, '`rd-scout`,{name:', '`rd-review`,{name:', '`rd`,{name:']) {
    if (!text.includes(required)) throw new Error(`missing after patch: ${required}`)
  }

  const header = [
    '/*!',
    ` * Vendored from ${SHIPPED_ID}@${manifest.version} (MIT License, DeepSeek).`,
    ' * Copyright (c) DeepSeek; see ui/preset-cards/docs/DETAIL.md for attribution.',
    ' * Generated by scripts/vendor-preset-cards.mjs — do not edit by hand.',
    ' * Local changes: guide entries for rd / rd-scout / rd-review, a wider presetGuide gate,',
    ` * the ${OUR_NS} locale namespace, and no duplicate surface registrations.`,
    ' */',
    '',
  ].join('\n')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(outFile, header + text, 'utf8')

  try {
    execFileSync(process.execPath, ['--check', outFile], { stdio: 'pipe' })
  } catch (error) {
    throw new Error(`generated bundle does not parse: ${error.stderr?.toString() ?? error.message}`)
  }
  const size = readFileSync(outFile).length
  process.stdout.write(`wrote ${outFile} (${size} bytes) from ${asar}\n`)
}

main()
