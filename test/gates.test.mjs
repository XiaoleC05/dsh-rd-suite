/**
 * 交付门禁的行为验证：密钥扫描与提交信息校验。
 *
 * 测试夹具里的「密钥」用字符串拼接生成，不在源码里留下完整可命中的字面量，
 * 这样本仓库自己跑扫描时不会误报。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { checkCommitMessage, checkIssueLink, draftChangelog } from '../scripts/commit-msg.mjs'
import { main as scanMain, mask, scanText } from '../scripts/secret-scan.mjs'

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-gates-'))
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

test('厂商前缀与私钥块会被抓到时打码输出', () => {
  const awsId = `AKIA${'Z7Q2XK4M9PLW3RTY'}`
  const hits = scanText(`const id = '${awsId}'\n`, { file: 'a.js' })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].rule, 'aws-access-key-id')
  assert.equal(hits[0].line, 1)
  assert.ok(hits[0].preview.startsWith('AKIA'), '打码后保留前 4 位便于定位')
  assert.equal(hits[0].preview.includes(awsId), false, '不得输出完整密钥')

  const blockHeader = ['-----BEGIN', 'RSA', 'PRIVATE KEY-----'].join(' ')
  const block = scanText(`${blockHeader}\nxx\n`, { file: 'k.pem' })
  assert.equal(block[0].rule, 'private-key-block')
})

test('占位符与运行期引用不报', () => {
  const text = [
    'const key = "your_api_key_here"',
    'const key2 = "changeme-in-env"',
    'const key3 = process.env.SECRET_TOKEN',
    'const key4 = "${CREDENTIAL}"',
    '// AKIAIOSFODNN7EXAMPLE 是官方示例',
  ].join('\n')
  assert.deepEqual(scanText(text, { file: 'x.js' }), [])
})

test('打码函数对短串全遮、长串保留首位', () => {
  assert.equal(mask('abc'), '***')
  const long = `AKIA${'Z7Q2XK4M9PLW3RTY'}`
  assert.equal(mask(long), 'AKIA…TY')
})

test('命令行：命中的文件返回 1，干净文件返回 0，用法错误返回 2', () => {
  const dirty = join(workspace, 'dirty.js')
  const clean = join(workspace, 'clean.js')
  writeFileSync(dirty, `token = "${'sk-'}${'a'.repeat(24)}"\n`, 'utf8')
  writeFileSync(clean, 'export const answer = 42\n', 'utf8')
  assert.equal(scanMain([dirty]), 1)
  assert.equal(scanMain([clean]), 0)
  assert.equal(scanMain([]), 2)
  assert.equal(scanMain([clean, '--json']), 0)
})

test('提交信息：合法、缺脚注提示、类型错误、header 过长', () => {
  const good = checkCommitMessage('feat(gates): 增加密钥扫描 (#13)\n\n正文说明。\n\nCloses #13')
  assert.equal(good.ok, true)
  assert.equal(good.type, 'feat')
  assert.equal(good.scope, 'gates')
  assert.equal(good.semver, 'minor')
  assert.deepEqual(good.warnings, [])

  const missingFooter = checkCommitMessage('fix: 修复空指针\n\n改了一行')
  assert.equal(missingFooter.ok, true)
  assert.equal(missingFooter.semver, 'patch')
  assert.ok(missingFooter.warnings.some((warning) => warning.includes('Closes')))

  const unknown = checkCommitMessage('improvement: 优化一下\n')
  assert.equal(unknown.ok, false)
  assert.ok(unknown.errors.some((error) => error.includes('未知类型')))

  const longHeader = checkCommitMessage(`feat: ${'长'.repeat(80)}\n`)
  assert.equal(longHeader.ok, false)
  assert.ok(longHeader.errors.some((error) => error.includes('超过 72')))
})

test('破坏性变更推导 major，文档类不发版', () => {
  assert.equal(
    checkCommitMessage('refactor!: 重写接口\n\nBREAKING CHANGE: 参数改名').semver,
    'major',
  )
  assert.equal(checkCommitMessage('docs: 补一段说明').semver, null)
  assert.equal(checkCommitMessage('test(gates): 加用例').semver, null)
})

test('CHANGELOG 草稿按类型分组并给出级别', () => {
  const draft = draftChangelog([
    'feat(gates): 增加密钥扫描 (#13)',
    'fix(gates): 修正打码边界 (#13)',
    'docs: 补说明',
  ])
  assert.equal(draft.version, 'minor')
  assert.deepEqual(draft.sections['新增'], ['- 增加密钥扫描（gates）'])
  assert.deepEqual(draft.sections['修复'], ['- 修正打码边界（gates）'])
  assert.deepEqual(draft.sections['文档'], ['- 补说明'])
})

test('Issue 关联校验：编号一致才放行', () => {
  const message = ['feat(x): 做完某事 (#60)', '', '正文说明。', '', 'Closes #60'].join('\n')
  assert.deepEqual(checkIssueLink(message, 60), { ok: true, errors: [], linked: [60] })
  assert.equal(checkIssueLink(message, '60').ok, true, '字符串编号也认')
})

test('Issue 关联校验：关错了要报出实际关闭的是哪个', () => {
  const message = ['feat(x): 做完某事 (#60)', '', '正文说明。', '', 'Closes #60'].join('\n')
  const wrong = checkIssueLink(message, 61)
  assert.equal(wrong.ok, false)
  assert.match(wrong.errors[0], /#60.*#61/u)
})

test('Issue 关联校验：没有关闭关键词、编号非法都要报', () => {
  assert.equal(checkIssueLink('feat(x): 没有关闭关键词', 60).ok, false)
  assert.match(String(checkIssueLink('feat(x): 没有关闭关键词', 60).errors[0]), /没有关闭任何 Issue/u)
  assert.equal(checkIssueLink('Closes #1', 0).ok, false)
  assert.equal(checkIssueLink('Closes #1', 'abc').ok, false)
})

test('Issue 关联校验：多个编号里包含目标即可', () => {
  const link = checkIssueLink('Closes #1, fixes #60', 60)
  assert.equal(link.ok, true)
  assert.deepEqual(link.linked, [1, 60])
})
