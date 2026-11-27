/**
 * AIGC 自检脚本的行为验证。
 *
 * 断言的是可复现的表面特征，不涉及内容质量判断：套话与连接词堆叠要被抓到，
 * 具体、长短不一的文字要拿到高分，重复片段要被点名。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import {
  analyze,
  CLICHE_REPLACEMENTS,
  main,
  mergeCliches,
  readBannedWords,
  suggestFixes,
  summarizeScores,
} from '../scripts/aigc-check.mjs'

const AI_ISH = `在当今快速发展的数字时代，数据已经成为企业最重要的资产之一。首先，我们需要建立统一的数据治理体系。其次，我们需要完善数据质量监控机制。最后，我们需要持续优化数据服务能力。综上所述，数据治理是一项系统性工程，需要我们全方位、多层次地推进。这不仅能极大地提升效率，还能显著地降低成本，助力企业实现数字化转型，赋能业务增长。值得注意的是，数据治理并非一蹴而就，而是一个持续演进的过程。由此可见，只有坚持不懈，才能真正释放数据价值。`

const HUMAN = `两个前端团队各自维护一套按钮组件，样式逐渐分叉。
我们把它们合成一个包，只保留必要的变体，README 里写清迁移步骤。
改完之后打包体积减少 18 KB，按钮相关的样式覆盖从 27 处降到 4 处。`

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rd-aigc-'))
})

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

test('套话堆叠的文字分数明显低于具体描述的文字', () => {
  const ai = analyze(AI_ISH)
  const human = analyze(HUMAN)
  assert.ok(ai.score < 70, `AI 味文字应当低于 70 分，实际 ${ai.score}`)
  assert.ok(human.score >= 85, `具体文字应当不低于 85 分，实际 ${human.score}`)
  assert.ok(human.score > ai.score + 20, '两类文字的分数要拉开差距')
})

test('命中的套话、连接词与模板开头都被点名', () => {
  const { hits } = analyze(AI_ISH)
  const clicheWords = hits.cliches.map((hit) => hit.word)
  assert.ok(clicheWords.includes('赋能'), '赋能 应当被识别为套话')
  assert.ok(clicheWords.includes('极大地') || clicheWords.includes('显著地'), '空泛副词应当被识别')
  assert.ok(hits.connectors.length >= 2, '首先/其次/最后 至少命中两个')
  assert.ok(hits.templateOpeners.includes('在当今'), '模板开头应当被识别')
})

test('重复片段被识别，且给出次数', () => {
  const repeated = '数据治理是系统工程。数据治理是系统工程。数据治理是系统工程。'
  const { hits } = analyze(repeated)
  assert.ok(hits.repeatedPhrases.length >= 1, '重复三次的片段应当被抓到')
  assert.ok(hits.repeatedPhrases[0].count >= 3)
})

test('干净文字不产生命中项', () => {
  const { hits } = analyze(HUMAN)
  assert.deepEqual(hits.templateOpeners, [])
  assert.deepEqual(hits.cliches, [])
  assert.deepEqual(hits.englishBuzzwords, [])
})

test('命令行：达到阈值返回 0，低于阈值返回 1，并可输出 JSON', () => {
  const good = join(workspace, 'good.md')
  const bad = join(workspace, 'bad.md')
  writeFileSync(good, HUMAN, 'utf8')
  writeFileSync(bad, AI_ISH, 'utf8')

  assert.equal(main([good, '--min-score', '60']), 0)
  assert.equal(main([bad, '--min-score', '60']), 1)
  assert.equal(main([good, bad, '--json', '--min-score', '0']), 0)
  assert.equal(main([]), 2)
})

test('结构型痕迹：对举、加粗标签、拔高收尾、聊天残留都能抓到', () => {
  const text = [
    '这不是速度问题，而是流程问题。',
    '**范围**：只改一个文件。',
    '**验收**：命令通过。',
    '归根结底，这是一次结构性升级。',
    '希望这对你有帮助。',
  ].join('\n')
  const ids = analyze(text).hits.patterns.map((pattern) => pattern.id)
  assert.ok(ids.includes('not-x-but-y'), '不是X而是Y 应当命中')
  assert.ok(ids.includes('bold-label'), '行首加粗标签应当命中')
  assert.ok(ids.includes('inflated-closer'), '拔高收尾应当命中')
  assert.ok(ids.includes('chat-residue'), '聊天残留应当命中')
})

test('列表里的顿号不算并列铺陈', () => {
  const text = '- 文件、目录、符号\n- 预算、深度、JSON\n'
  const ids = analyze(text).hits.patterns.map((pattern) => pattern.id)
  assert.equal(ids.includes('forced-triad'), false, '列表项不应被判为并列铺陈')
})

test('结构痕迹的扣分有上限，描述性文字仍能拿到高分', () => {
  const text = '改了三个文件：登录、重试、超时。'
  const result = analyze(text)
  assert.ok(result.score >= 90, `单处弱信号不应把分数打到 90 以下，实际 ${result.score}`)
})

test('分析器自身的豁免：行尾 allow 只跳一行，文件头 allow-file 跳过全部检出', () => {
  const oneLine = '这不是速度问题，而是流程问题。aigc-check: allow'
  assert.equal(analyze(oneLine).hits.patterns.length, 0)
  const fileLevel = '<!-- aigc-check: allow-file -->\n这不是速度问题，而是流程问题。'
  const result = analyze(fileLevel)
  assert.equal(result.hits.patterns.length, 0)
  assert.ok(result.metrics.characters > 0, '指标仍按原文统计')
})

test('自定义禁用词：命中即扣分，且与内置表合并去重', async () => {
  const before = analyze(HUMAN)
  const after = analyze(`${HUMAN}\n这套方案实现了业务闭环与协同增效。`, { extraCliches: ['业务闭环', '协同增效'] })
  assert.ok(after.hits.cliches.some((hit) => hit.word === '业务闭环'), '自定义词应当被识别')
  assert.ok(after.score < 100, '命中自定义词要扣分')
  assert.ok(before.hits.cliches.length === 0, '默认词表对这段文字无命中')

  const merged = mergeCliches(['赋能', '业务闭环', '  ', '业务闭环'])
  assert.equal(merged.filter((word) => word === '赋能').length, 1, '与内置表去重')
  assert.equal(merged.filter((word) => word === '业务闭环').length, 1, '自定义词自身去重')
})

test('词表文件：换行与 JSON 数组两种格式都支持', async () => {
  const { mkdtempSync, writeFileSync: writeFixture, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'rd-banned-'))
  const lines = join(dir, 'lines.txt')
  const json = join(dir, 'words.json')
  const missing = join(dir, 'missing.txt')
  writeFixture(lines, '# 项目禁用词\n业务闭环\n协同增效\n', 'utf8')
  writeFixture(json, JSON.stringify(['业务闭环']), 'utf8')

  assert.deepEqual(readBannedWords(lines), ['业务闭环', '协同增效'])
  assert.deepEqual(readBannedWords(json), ['业务闭环'])
  assert.deepEqual(readBannedWords(missing), [])
  const article = join(dir, 'article.md')
  writeFixture(article, HUMAN, 'utf8')
  assert.equal(main([article, '--banned', lines, '--min-score', '0']), 0)
  rmSync(dir, { recursive: true, force: true })
})

test('英文 AI 腔能被检出，正常英文与中文不受影响', () => {
  const boilerplate = [
    "In today's fast-paced world, teams need tools that work.",
    '',
    "It's not just a dashboard, it's a platform — a robust, seamless platform — that empowers you.",
    '',
    "Let's dive in. Here's the thing: at the end of the day, you just need clear numbers.",
  ].join('\n')
  const flagged = analyze(boilerplate)
  const ids = flagged.hits.patterns.map((hit) => hit.id)
  for (const id of ['not-just-but', 'fast-paced-opener', 'dive-in', 'heres-the-thing']) {
    assert.ok(ids.includes(id), `英文套话 ${id} 应当被检出`)
    assert.ok(flagged.hits.patterns.find((hit) => hit.id === id).firstLine > 0, `${id} 要能定位行号`)
  }
  assert.ok(flagged.score < 50, `套话段落分数应明显偏低，实际 ${flagged.score}`)

  const plain = 'The retry loop capped at three attempts after 2026-11-20.\n\nWe measured 42 runs; tail latency fell from 1.9s to 0.6s.'
  assert.equal(analyze(plain).score, 100, '正常英文不应被扣分')

  const chinese = '审计跑完之后，待修为零。宪章 4,964 字符，测试 216 例通过。'
  assert.equal(analyze(chinese).score, 100, '中文文本不受英文条目影响')
})

test('破折号密度：一行两个以上才算', () => {
  assert.equal(analyze('a — b').hits.patterns.some((hit) => hit.id === 'em-dash-density'), false)
  assert.equal(analyze('a — b — c').hits.patterns.some((hit) => hit.id === 'em-dash-density'), true)
})

test('分数汇总：均分、最低分与低于阈值的清单', () => {
  const summary = summarizeScores(
    [
      { file: 'a.md', score: 90 },
      { file: 'b.md', score: 55 },
      { file: 'c.md', score: 70 },
      { file: 'd.md', error: '读不到' },
    ],
    { threshold: 60 },
  )
  assert.equal(summary.count, 3, '读不到的文件不计入统计')
  assert.equal(summary.mean, 71.7)
  assert.deepEqual(summary.lowest, { file: 'b.md', score: 55 })
  assert.deepEqual(summary.below, [{ file: 'b.md', score: 55 }])
})

test('分数汇总：等于阈值不算低于，空输入不除零', () => {
  const edge = summarizeScores([{ file: 'a.md', score: 60 }], { threshold: 60 })
  assert.deepEqual(edge.below, [])
  assert.equal(edge.mean, 60)

  const empty = summarizeScores([])
  assert.deepEqual(empty, { count: 0, mean: 0, lowest: null, below: [] })
})

test('分数汇总：低于阈值的清单按分数升序', () => {
  const summary = summarizeScores(
    [
      { file: 'x.md', score: 40 },
      { file: 'y.md', score: 20 },
      { file: 'z.md', score: 30 },
    ],
    { threshold: 50 },
  )
  assert.deepEqual(
    summary.below.map((item) => item.score),
    [20, 30, 40],
  )
})

test('改写建议：已知套话给具体替换，未知给通用方向', () => {
  const result = analyze('在当今这个时代，我们提供一站式方案，极大地助力团队，另外还有某某词。')
  const suggestions = suggestFixes({ file: 'a.md', hits: result.hits })
  assert.ok(suggestions.length >= 3, '应当给出多条建议')

  const oneStop = suggestions.find((item) => item.what.includes('一站式'))
  assert.ok(oneStop !== undefined)
  assert.equal(oneStop.suggestion, CLICHE_REPLACEMENTS['一站式'])
  assert.equal(oneStop.file, 'a.md')
  assert.ok(oneStop.line > 0, '要能定位到行号')
})

test('改写建议：结构痕迹复用 hint，重复片段给句式建议', () => {
  const result = analyze('这不是工具，而是平台。\n\n这不是工具，而是平台。\n\n这不是工具，而是平台。')
  const suggestions = suggestFixes({ file: 'b.md', hits: result.hits })
  const pattern = suggestions.find((item) => item.what.startsWith('结构痕迹'))
  assert.ok(pattern !== undefined)
  assert.match(pattern.suggestion, /结论|对峙|对比/u)

  const repeated = suggestions.find((item) => item.what.startsWith('重复片段'))
  if (repeated !== undefined) assert.match(repeated.suggestion, /斜杠|句式/u)
})

test('改写建议：干净文本返回空数组', () => {
  const result = analyze('重试上限三次。实测 42 次运行，尾延迟从 1.9 秒降到 0.6 秒。')
  assert.deepEqual(suggestFixes({ file: 'c.md', hits: result.hits }), [])
})
