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

test('the Host plugin owns the live setting, the prompt section and the tool', () => {
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
  assert.match(source, /enabled\(\) \? WORKFLOW_PROMPT : ''/)
  assert.match(source, /name: 'github_workflow'/)
  assert.match(source, /\{ when: \(\) => enabled\(\) \}/)
  assert.match(source, /properties: RESULT_FIELDS/)
  assert.deepEqual([...RESULT_ACTIONS], ['precheck', 'create_issue', 'close_issue'])
  assert.equal(RESULT_FIELDS.github.type, 'boolean')
})

test('the Client half registers one General settings row for the same entry and field', () => {
  // 浏览器半已并入 bundle：读仓库根的 client.js（由 client-sources/ 合并生成）。
  const source = readFileSync(path.join(packageRoot, '..', 'client.js'), 'utf8')
  const patch = readText('cordis.patch.yml')
  const host = readText('index.js')

  // 客户端配置行 id 必须与本成员 cordis.patch.yml 里的 loader 行 id 一致。
  const entryId = /- id:\s*([A-Za-z0-9-]+)/.exec(patch)?.[1]
  assert.ok(entryId, 'cordis.patch.yml 必须声明 loader 行 id')
  assert.match(
    source,
    new RegExp(`ENTRY_ID = '${entryId}'`),
    '客户端配置行 id 与 loader 行 id 不一致',
  )
  assert.match(source, /name: 'settings\.general\.item'/)
  assert.match(source, /ctx\.configForms\.whileServed\(\[ENTRY_ID\]/)
  assert.match(source, /ctx\.slots\.register\(\{/)
  assert.match(source, /ctx\.locale\.register\(LOCALE_NS, STRINGS\)/)
  assert.match(source, /role: 'switch'/)
  assert.match(source, /'aria-checked': checked/)
  assert.match(source, /--dsw-alias-brand-primary/)

  const field = /const FIELD = '([A-Za-z0-9_]+)'/.exec(source)?.[1]
  assert.equal(field, 'githubIssueFirstWorkflow')
  assert.ok(
    host.includes(`${field}: z.boolean()`),
    'the client field matches the Host Config field',
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
