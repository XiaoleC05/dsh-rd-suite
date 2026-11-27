/**
 * 跨文件重复检测的验证：切段、归一化与重复判定。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { findDuplicates, main, normalizeParagraph, splitParagraphs } from '../scripts/dup-check.mjs'

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-dup-'))
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

const LONG = '这一整段话在三个文档里各写了一遍，读者读到哪里都觉得似曾相识，其实一句话就能说清。'

test('切段：跳过标题、列表、引用与代码块', () => {
  const text = [
    '# 标题',
    '',
    '正文第一段。',
    '仍然属于第一段。',
    '',
    '- 列表项',
    '> 引用',
    '',
    '```',
    'const a = 1',
    '```',
    '',
    '正文第二段。',
  ].join('\n')
  const paragraphs = splitParagraphs(text)
  assert.deepEqual(
    paragraphs.map((paragraph) => paragraph.text),
    ['正文第一段。 仍然属于第一段。', '正文第二段。'],
  )
  assert.equal(paragraphs[0].line, 3)
})

test('归一化忽略空白、标点与大小写', () => {
  assert.equal(normalizeParagraph('Hello,   World!'), 'helloworld')
  assert.equal(normalizeParagraph('同一段话，标点不同。'), normalizeParagraph('同一段话 标点不同'))
})

test('两个文件出现同一段话即报重复', () => {
  const duplicates = findDuplicates(
    [
      { path: 'README.md', text: `# README\n\n${LONG}\n` },
      { path: 'docs/DESIGN.md', text: `# 设计\n\n${LONG}\n` },
    ],
    { minLength: 20 },
  )
  assert.equal(duplicates.length, 1)
  assert.deepEqual(
    duplicates[0].occurrences.map((item) => item.path),
    ['README.md', 'docs/DESIGN.md'],
  )
})

test('短段落与标题不参与比对', () => {
  const duplicates = findDuplicates(
    [
      { path: 'a.md', text: '# 相同标题\n\n短句。\n' },
      { path: 'b.md', text: '# 相同标题\n\n短句。\n' },
    ],
    { minLength: 40 },
  )
  assert.deepEqual(duplicates, [])
})

test('同一文件里重复出现也算', () => {
  const duplicates = findDuplicates([{ path: 'a.md', text: `${LONG}\n\n${LONG}\n` }], {
    minLength: 20,
  })
  assert.equal(duplicates.length, 1)
  assert.equal(duplicates[0].occurrences.length, 2)
})

test('命令行：有重复返回 1，无重复返回 0', () => {
  const first = join(workspace, 'one.md')
  const second = join(workspace, 'two.md')
  writeFileSync(first, `${LONG}\n`, 'utf8')
  writeFileSync(second, `${LONG}\n`, 'utf8')
  assert.equal(main([first, second, '--min-length', '20']), 1)

  writeFileSync(second, '完全不同的另一段话，长度也够，内容不一样，因此不该判重。\n', 'utf8')
  assert.equal(main([first, second, '--min-length', '20']), 0)
  // 无参数现在默认比对全仓文档：退出码只反映有没有重复段落。
  assert.ok([0, 1].includes(main([])), '无参数应给出 0 或 1，而不是用法错误')
})
