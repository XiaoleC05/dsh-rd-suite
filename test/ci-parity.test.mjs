/**
 * CI 覆盖度的验证：抽取三种 run 写法、覆盖判定与真实仓库一致性。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareCoverage,
  extractRunCommands,
  readWorkflows,
  REQUIRED_COVERAGE,
} from '../scripts/ci-parity.mjs'

test('抽取：三种 run 写法都能认出来', () => {
  const yaml = [
    'jobs:',
    '  build:',
    '    steps:',
    '      - run: node scripts/build-client.mjs',
    '      - name: Tests',
    '        run: node --test "test/**/*.test.mjs"',
    '      - name: Preflight',
    '        run:',
    '          node scripts/preflight.mjs',
    '      - name: Install',
    '        run: pnpm install --frozen-lockfile',
  ].join('\n')
  assert.deepEqual(extractRunCommands(yaml), [
    'node scripts/build-client.mjs',
    'node --test "test/**/*.test.mjs"',
    'node scripts/preflight.mjs',
    'pnpm install --frozen-lockfile',
  ])
})

test('抽取：注释与空行不算命令', () => {
  const yaml = ['      - run:', '          # 只是注释', '      - run: ""'].join('\n')
  assert.deepEqual(extractRunCommands(yaml), [])
})

test('覆盖判定：三项齐全时全覆盖，并指出是哪条命令', () => {
  const coverage = compareCoverage([
    'node scripts/build-client.mjs',
    'node --test "test/**/*.test.mjs"',
    'node scripts/preflight.mjs',
  ])
  assert.equal(coverage.length, REQUIRED_COVERAGE.length)
  for (const item of coverage) {
    assert.equal(item.covered, true, `${item.key} 应判为覆盖`)
    assert.ok(item.by !== null)
  }
})

test('覆盖判定：少了测试时点名缺项，不把构建算作覆盖', () => {
  const coverage = compareCoverage(['node scripts/build-client.mjs'])
  const missing = coverage.filter((item) => !item.covered).map((item) => item.key)
  assert.deepEqual(missing, ['测试套件', '全量门禁'])
})

test('真实仓库：workflow 覆盖三项且与门禁一致', () => {
  const workflows = readWorkflows()
  assert.ok(workflows.length >= 1, '仓库里应当有 workflow')
  const commands = workflows.flatMap((workflow) => extractRunCommands(workflow.text))
  const coverage = compareCoverage(commands)
  assert.deepEqual(
    coverage.filter((item) => !item.covered),
    [],
    `CI 缺项：${coverage
      .filter((item) => !item.covered)
      .map((item) => item.key)
      .join('、')}`,
  )
})
