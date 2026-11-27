/**
 * 子代理模板的校验：四段简报齐全、返回格式四栏齐全、别写模糊指令。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const file = join(root, 'skills', 'rd-ecosystem', 'references', 'subagent-templates.md')
const markdown = readFileSync(file, 'utf8')

/** 抽出一个模板块（``` 围起来的任务简报）。 */
function templateBlocks(text) {
  return [...String(text).matchAll(/```\r?\n(任务[\s\S]*?)```/gu)].map((match) => match[1])
}

const blocks = templateBlocks(markdown)

test('至少三个模板，且各自四段齐全', () => {
  assert.ok(blocks.length >= 3, `至少三个模板，实际 ${blocks.length}`)
  for (const [index, block] of blocks.entries()) {
    for (const field of ['任务：', '输入：', '约束：', '返回：']) {
      assert.ok(block.includes(field), `第 ${index + 1} 个模板缺少「${field}」`)
    }
  }
})

test('返回格式统一为结论 / 证据 / 未验证 / 建议四栏', () => {
  for (const field of ['结论：', '证据：', '未验证：', '建议：']) {
    assert.ok(markdown.includes(field), `统一返回格式缺少「${field}」`)
  }
  assert.match(markdown, /缺一栏就退回重做/u, '要写明缺栏的后果')
})

test('写明子代理不共享上下文，简报必须自包含', () => {
  assert.match(markdown, /不共享/u)
  assert.match(markdown, /自包含/u)
})

test('模板里不出现模糊指令词', () => {
  const vague = ['尽量', '大概', '合适的话', '你知道的', '整理一下']
  for (const block of blocks) {
    for (const word of vague) {
      assert.equal(block.includes(word), false, `模板里不该出现模糊词：${word}`)
    }
  }
  assert.match(markdown, /不该出现的话/u, '要把模糊词单独拎出来说明')
})

test('独立复核模板给出了三选一的结论口径', () => {
  // 模板块的抽取从「任务：」开始，标题不在块内，按内容定位即可。
  const review = blocks.find((block) => block.includes('成立 / 不成立 / 未验证'))
  assert.ok(review !== undefined, '缺少带三选一结论口径的复核模板')
  assert.match(review, /默认立场是「它不成立」/u)
})
