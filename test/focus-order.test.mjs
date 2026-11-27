/**
 * 键盘焦点顺序：两条硬规则 + 一条顺序断言。
 *
 * 1. 不许用正数 tabIndex——它会盖过 DOM 顺序，后续改布局时焦点开始乱跳；
 * 2. 容器用 -1 承接脚本焦点，条目用 0 参与自然顺序；
 * 3. 记忆库的可交互元素按「搜索 → 筛选 → 列表 → 详情操作」出现。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MODULES = ['cards.js', 'code-pipeline.js', 'memory.js', 'hub-rd.js']

/** 读模块源码。 */
function sourceOf(file) {
  return readFileSync(join(root, 'client-sources', file), 'utf8')
}

test('任何模块都不许出现正数 tabIndex', () => {
  for (const file of MODULES) {
    const source = sourceOf(file)
    for (const match of source.matchAll(/tabIndex:\s*(-?\d+)/gu)) {
      const value = Number(match[1])
      assert.ok(value <= 0, `${file} 出现正数 tabIndex ${value}，会打乱自然焦点顺序`)
    }
  }
})

test('容器用 -1 承接焦点，条目用 0 参与自然顺序', () => {
  const memory = sourceOf('memory.js')
  assert.match(memory, /tabIndex:\s*-1/u, '列表容器应当用 -1')
  assert.match(memory, /tabIndex:\s*0/u, '列表项应当用 0')
})

test('记忆库的可交互元素顺序：搜索框在筛选之前，筛选在列表之前', () => {
  const memory = sourceOf('memory.js')
  const search = memory.indexOf("type: 'search'")
  const chips = memory.indexOf("'aria-pressed'")
  const list = memory.indexOf("role: 'button'")
  assert.ok(search > 0 && chips > 0 && list > 0, '三个锚点都要能找到')
  assert.ok(search < chips, '搜索框应排在筛选按钮之前')
  assert.ok(chips < list, '筛选按钮应排在列表项之前')
})

test('入口页：页签容器与页签都是可聚焦元素，且不靠正数 tabIndex 排序', () => {
  const hub = sourceOf('hub-rd.js')
  assert.match(hub, /role: 'tablist'/u)
  assert.match(hub, /role: 'tab'/u)
  // 三元里的 0 / -1 是 roving tabindex（ARIA 推荐做法），只抓裸的正数字面量。
  const bare = hub
    .split('\n')
    .filter((line) => line.includes('tabIndex:') && !line.includes('?'))
    .map((line) => Number(/tabIndex:\s*(-?\d+)/u.exec(line)?.[1] ?? 0))
  assert.deepEqual(
    bare.filter((value) => value > 0),
    [],
    '页签区不该有正数 tabIndex',
  )
})
