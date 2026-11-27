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

import { analyze, main } from '../scripts/aigc-check.mjs'

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
