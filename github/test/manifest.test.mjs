import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { RESULT_ACTIONS, RESULT_FIELDS } from '../lib/result-schema.js'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

function readText(relative) {
  return readFileSync(path.join(packageRoot, relative), 'utf8')
}

function readJson(relative) {
  return JSON.parse(readText(relative))
}

test('manifest declares the bundle patch and display resources', () => {
  const manifest = readJson('package.json')
  assert.equal(manifest.name, '@local/github-issue-first-workflow')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.1')
  for (const exportName of ['.', './locale/*.json', './icon']) {
    assert.ok(Object.hasOwn(manifest.exports, exportName), `missing export ${exportName}`)
  }
  // 浏览器半已并入 bundle（client-sources/），成员包不再携带 client.js。
  assert.equal(manifest.dsh.client, undefined)
  assert.equal(manifest.exports['./client'], undefined)
  assert.ok(!manifest.files.includes('client.js'))
  assert.ok(manifest.files.includes('index.js'))
  assert.ok(manifest.files.includes('locale/*.json'))
  assert.ok(manifest.files.includes('icon.svg'))
  assert.ok(existsSync(path.join(packageRoot, manifest.dsh.bundle.patch)))
})

test('the bundle patch inserts the Host row with the setting off by default', () => {
  const patch = readText('cordis.patch.yml')
  assert.match(patch, /id: github-issue-first-workflow/)
  assert.match(patch, /name: '@local\/github-issue-first-workflow'/)
  assert.match(patch, /githubIssueFirstWorkflow: false/)
  assert.match(patch, /- insert:/)
})

test('the Host plugin owns the prompt section and the tool', () => {
  const source = readText('index.js')
  assert.match(source, /export const name = 'github-issue-first-workflow'/)
  assert.match(
    source,
    /export const inject = \['tools', 'systemPrompt', 'subprocess', 'workingDirectory'\]/,
  )
  assert.match(source, /githubIssueFirstWorkflow: z\.boolean\(\)\.default\(false\)\.volatile\(\)/)
  assert.match(source, /github:issue-first-workflow/)
  assert.match(source, /const WORKFLOW_SECTION_ORDER = 700/)
  assert.match(source, /order: WORKFLOW_SECTION_ORDER/)
  assert.match(source, /interpolate: false/)
  assert.match(source, /text: \(\) => WORKFLOW_PROMPT/)
  assert.match(source, /name: 'github_workflow'/)
  assert.match(source, /properties: RESULT_FIELDS/)
  assert.deepEqual(
    [...RESULT_ACTIONS],
    [
      'precheck',
      'create_issue',
      'prepare_branch',
      'open_pr',
      'pr_status',
      'merge_pr',
      'close_issue',
      'release',
    ],
  )
  assert.equal(RESULT_FIELDS.github.type, 'boolean')
  // 流程是模式的一部分：不再有按设置隐藏工具或提示词的门控。
  assert.equal(/when: \(\) => enabled\(\)/.test(source), false)
  assert.equal(source.includes('readEnabled'), false)
})

test('no settings row ships: the flow belongs to the mode, not to a switch', () => {
  // 浏览器半已并入 bundle；成员不再有 client.js，bundle 也不再注册 GitHub 设置行。
  const source = readFileSync(path.join(packageRoot, '..', 'client.js'), 'utf8')
  const host = readText('index.js')

  assert.equal(existsSync(path.join(packageRoot, 'client.js')), false)
  assert.equal(source.includes("name: 'settings.general.item'"), false)
  assert.equal(source.includes('githubIssueFirstWorkflow'), false)
  assert.ok(host.includes('githubIssueFirstWorkflow: z.boolean()'), 'legacy field stays accepted')
})

test('the Host plugin reports the module code audit inside close_issue', () => {
  const source = readText('index.js')
  assert.match(source, /config\?\.auditModule/)
  assert.match(source, /codeAuditChecked/)
  assert.match(source, /codeAuditRemaining/)
  assert.match(source, /codeAuditNote/)
  assert.deepEqual(
    Object.keys(RESULT_FIELDS).filter((key) => key.startsWith('codeAudit')),
    [
      'codeAuditChecked',
      'codeAuditFixed',
      'codeAuditRemaining',
      'codeAuditFiles',
      'codeAuditByLanguage',
      'codeAuditNote',
    ],
  )
})

test('both locales carry localized plugin metadata', () => {
  const en = readJson('locale/en.json')
  const zh = readJson('locale/zh.json')
  assert.equal(typeof en.meta.title, 'string')
  assert.equal(typeof en.meta.description, 'string')
  assert.match(en.meta.title, /GitHub issue-first workflow/)
  assert.equal(typeof zh.meta.title, 'string')
  assert.equal(typeof zh.meta.description, 'string')
  assert.match(zh.meta.title, /GitHub 规范化修复工作流/)
  assert.ok(en.meta.description.length > 80)
  assert.ok(zh.meta.description.length > 40)
  assert.equal(en.meta.detail, undefined)
  assert.equal(zh.meta.detail, undefined)
})

test('the bundle ships an original icon and a README', () => {
  const icon = readText('icon.svg')
  assert.match(icon, /<svg[^>]*width="36"[^>]*height="36"/)
  assert.doesNotMatch(icon, /<(script|style|image|foreignObject)\b/)
  assert.ok(existsSync(path.join(packageRoot, 'README.md')))
})
