/**
 * CI 与本地门禁一致性：workflow 里跑的命令必须和本地是同一套。
 *
 * 「CI 绿了但本地红」「本地绿了但 CI 红」通常不是环境问题，
 * 而是两边跑的根本不是同一组命令。这里把这件事钉住。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const workflow = readFileSync(join(root, '.github', 'workflows', 'checks.yml'), 'utf8')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('CI 引用了构建、测试与 preflight 三条命令', () => {
  assert.match(workflow, /run:\s*node scripts\/build-client\.mjs/u, '缺少构建步骤')
  assert.match(workflow, /run:\s*node --test /u, '缺少测试步骤')
  assert.match(workflow, /run:\s*node scripts\/preflight\.mjs/u, '缺少门禁步骤')
})

test('CI 的测试命令与 package.json 的 test 脚本一致', () => {
  const script = String(manifest.scripts?.test ?? '')
  const workflowTests = workflow
    .split('\n')
    .find((line) => line.includes('run:') && line.includes('node --test'))
    ?.split('run:')[1]
    ?.trim()
  assert.ok(workflowTests !== undefined, 'workflow 里没有测试行')
  assert.equal(workflowTests, script, '两边必须逐字一致，否则跑的不是同一组测试')
})

test('CI 的 Node 版本与 engines 和本地一致（22）', () => {
  assert.match(workflow, /node-version:\s*'22'/u)
  assert.match(String(manifest.engines?.node ?? ''), />=?22/u, 'engines.node 要与 CI 的版本对得上')
})

test('CI 在 push 与 PR 上都触发', () => {
  assert.match(workflow, /push:/u)
  assert.match(workflow, /pull_request:/u)
  assert.match(workflow, /branches:\s*\[main\]/u)
})

test('CI 先装依赖再跑命令，顺序不能反', () => {
  const installIndex = workflow.indexOf('pnpm install')
  const testIndex = workflow.indexOf('node --test')
  assert.ok(installIndex > 0 && testIndex > installIndex, '安装必须排在测试之前')
})
