/**
 * 近似重复检测的验证：SimHash 指纹、相似度判定，以及实测出来的能力边界。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_SIMILARITY,
  findNearDuplicates,
  fnv1a64,
  hammingDistance,
  paragraphs,
  shingles,
  similarity,
  simhash,
} from '../scripts/near-dup.mjs'

const ORIGINAL =
  '推送失败时先用 git fetch 对齐远端，再重试推送；仍然失败就改用 API 推送并核对树是否一致。'

test('FNV-1a 64 位：同输入同输出，异输入不同输出', () => {
  assert.equal(fnv1a64('研发模式'), fnv1a64('研发模式'))
  assert.notEqual(fnv1a64('研发模式'), fnv1a64('研发模式2'))
})

test('shingles：3 字滑窗，去掉空白与标点', () => {
  assert.deepEqual(shingles('甲乙丙丁'), ['甲乙丙', '乙丙丁'])
  assert.deepEqual(shingles('甲 乙，丙'), ['甲乙丙'])
  assert.deepEqual(shingles('短'), [], '不足 3 字没有 shingle')
})

test('汉明距离：相同为 0，全反为 64，差一位为 1', () => {
  assert.equal(hammingDistance(0n, 0n), 0)
  assert.equal(hammingDistance(0n, (1n << 64n) - 1n), 64)
  assert.equal(hammingDistance(0b1010n, 0b1000n), 1)
})

test('机械改写（换标点、调语序、增删少量词）能被判为近似', () => {
  const rewritten =
    '推送失败时，先用 git fetch 对齐远端，然后重试推送；若仍然失败，改用 API 推送，并核对树是否一致。'
  const score = similarity(ORIGINAL, rewritten)
  assert.ok(score >= DEFAULT_SIMILARITY, `机械改写相似度 ${score}，低于阈值 ${DEFAULT_SIMILARITY}`)
})

test('能力边界：深度同义改写抓不到（字面算法给不了保证）', () => {
  const rewritten =
    '推送失败的时候先 git fetch 把远端对齐，然后再试一次推送；如果还是失败，就换 API 推送并且核对树是否相同。'
  const score = similarity(ORIGINAL, rewritten)
  assert.ok(score < DEFAULT_SIMILARITY, `实测 ${score}：这类改写真抓不到，阈值不该为它放宽`)
})

test('完全不同的话题相似度为 0', () => {
  const other = '记忆库按四类存放：技术模板、踩坑、修复方案与策略模式。'
  assert.equal(similarity(ORIGINAL, other), 0)
  assert.ok(hammingDistance(simhash(ORIGINAL), simhash(other)) > 0)
})

test('paragraphs：跳过标题、列表与代码块，只留成段正文', () => {
  const markdown = [
    '# 标题',
    '',
    '这是一段足够长的正文，用来验证切段逻辑是否只保留正文段落，跳过标题与列表。',
    '',
    '- 列表项不算段落',
    '',
    '```',
    '代码块也不算',
    '```',
    '',
    '这是第二段足够长的正文，同样应当被保留下来参与比对，长度超过四十个字符。',
  ].join('\n')
  const found = paragraphs(markdown)
  assert.equal(found.length, 2)
  assert.match(found[0].text, /切段逻辑/u)
  assert.ok(found[1].line >= 10, `第二段起始行 ${found[1].line}`)
  assert.equal(found.length, 2, '两段正文都要留下，短段落不该被门槛丢掉')
})

test('findNearDuplicates：跨文件抓出机械改写的段落', () => {
  const documents = [
    { path: 'a.md', text: `${ORIGINAL}\n` },
    {
      path: 'b.md',
      text: '推送失败时，先用 git fetch 对齐远端，然后重试推送；若仍然失败，改用 API 推送，并核对树是否一致。\n',
    },
    {
      path: 'c.md',
      text: '记忆库按四类存放：技术模板、踩坑、修复方案与策略模式，跨会话复用，写入前先去重。\n',
    },
  ]
  const pairs = findNearDuplicates(documents)
  assert.ok(pairs.length >= 1, '机械改写的两段应当被判为近似')
  assert.equal(pairs[0].left.startsWith('a.md:'), true)
  assert.equal(pairs[0].right.startsWith('b.md:'), true)
  assert.ok(pairs[0].similarity >= DEFAULT_SIMILARITY)
})
