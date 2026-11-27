/**
 * 文档示例命令校验的验证：抽取、存在性、参数出处与占位符跳过。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkCommand, checkDocuments, extractCommands } from '../scripts/doc-cmd-check.mjs'

/** 假文件系统：只有列出的脚本存在。 */
function fakeFs(sources) {
  return {
    exists: (path) => Object.hasOwn(sources, path),
    readSource: (path) => sources[path] ?? '',
  }
}

const FS = fakeFs({
  'scripts/a.mjs': '用法: node scripts/a.mjs --json --limit <n>\n',
})

test('抽取：只取代码块里的 node scripts 行', () => {
  const markdown = [
    '# 文档',
    '',
    '正文里提到 node scripts/x.mjs 不算',
    '',
    '```',
    'node scripts/a.mjs',
    'git status',
    'node scripts/missing.mjs',
    '```',
    '',
    '```bash',
    'node scripts/a.mjs --json',
    '```',
  ].join('\n')
  assert.deepEqual(
    extractCommands(markdown).map((entry) => entry.command),
    ['node scripts/a.mjs', 'node scripts/missing.mjs', 'node scripts/a.mjs --json'],
  )
})

test('存在的脚本与已知参数通过', () => {
  const result = checkCommand({ line: 1, command: 'node scripts/a.mjs --json' }, FS)
  assert.equal(result.ok, true)
})

test('缺脚本要报出路径', () => {
  const result = checkCommand({ line: 2, command: 'node scripts/nope.mjs' }, FS)
  assert.equal(result.ok, false)
  assert.match(result.reason, /脚本不存在：scripts\/nope\.mjs/u)
})

test('未知参数要报出来', () => {
  const result = checkCommand({ line: 3, command: 'node scripts/a.mjs --verbose' }, FS)
  assert.equal(result.ok, false)
  assert.match(result.reason, /没有这个参数：--verbose/u)
})

test('含占位符的模板命令跳过参数校验，但脚本仍要存在', () => {
  const template = checkCommand({ line: 4, command: 'node scripts/a.mjs --round <轮次>' }, FS)
  assert.equal(template.ok, true)
  assert.match(template.reason, /模板命令/u)

  const missing = checkCommand({ line: 5, command: 'node scripts/nope.mjs --round <轮次>' }, FS)
  assert.equal(missing.ok, false, '占位符不能掩盖脚本缺失')
})

test('多文档汇总只返回问题项', () => {
  const { results, problems } = checkDocuments(
    [
      { path: 'a.md', text: '```\nnode scripts/a.mjs\n```' },
      { path: 'b.md', text: '```\nnode scripts/nope.mjs\n```' },
    ],
    FS,
  )
  assert.equal(results.length, 2)
  assert.deepEqual(
    problems.map((item) => item.document),
    ['b.md'],
  )
})
