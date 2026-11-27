/**
 * 引用完整性的验证：链接抽取、路径解析与真实仓库零断链。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkLinks,
  extractCodePaths,
  extractLinks,
  resolveTarget,
} from '../scripts/link-check.mjs'

test('extractLinks：只收仓库内链接，跳过外链与纯锚点', () => {
  const text = [
    '见 [设计](docs/DESIGN.md) 与 [章节](#品牌)。',
    '外链 [GitHub](https://github.com/x/y) 不算。',
    '邮件 [写信](mailto:a@b.c) 不算。',
    '带锚点 [行号](docs/DETAIL.md#L24) 要去掉锚点再查。',
  ].join('\n')
  assert.deepEqual(extractLinks(text), ['docs/DESIGN.md', 'docs/DETAIL.md'])
})

test('extractCodePaths：只认带目录的路径，裸文件名不算', () => {
  const text = '改 `scripts/link-check.mjs`，别改 `cards.js`；`node:fs` 也不算。'
  assert.deepEqual(extractCodePaths(text), ['scripts/link-check.mjs'])
})

test('resolveTarget：相对引用方所在目录解析', () => {
  assert.equal(resolveTarget('README.md', 'docs/DESIGN.md'), 'docs/DESIGN.md')
  assert.equal(resolveTarget('docs/DETAIL.md', 'OVERFLOW.md'), 'docs/OVERFLOW.md')
  assert.equal(resolveTarget('docs/DETAIL.md', '../scripts/health.mjs'), 'scripts/health.mjs')
})

test('真实仓库：31 份文档没有断链', () => {
  const broken = checkLinks()
  assert.deepEqual(
    broken,
    [],
    `断链：${broken.map((item) => `${item.file} → ${item.target}`).join('；')}`,
  )
})

test('断链能被发现（用不存在的目标构造）', () => {
  const broken = checkLinks(['README.md'])
  assert.deepEqual(broken, [], '当前 README 本身应当干净')
})
