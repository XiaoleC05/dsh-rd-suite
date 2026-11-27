/**
 * 品牌一致性：图标规格、用色与三级命名。
 *
 * 三个名字各有位置，混用会让用户在设置里找不到对应物：
 *   预设 = 研发模式 / 侧栏入口 = 研发工作台 / 包名 = dsh-rd-suite。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const hub = readFileSync(join(root, 'client-sources', 'hub-rd.js'), 'utf8')
const preset = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('侧栏图标：16×16、对读屏隐藏、用 currentColor 描边', () => {
  assert.match(hub, /viewBox: '0 0 16 16'/u, '图标要保持 16×16')
  assert.match(hub, /'aria-hidden': true/u, '装饰性图标必须对读屏隐藏')
  assert.match(hub, /stroke: 'currentColor'/u, '描边要用 currentColor，跟着主题走')
  assert.equal(/stroke: '#[0-9a-fA-F]{3,6}'/u.test(hub), false, '不许硬编码描边色')
  assert.equal(/fill: '#[0-9a-fA-F]{3,6}'/u.test(hub), false, '不许硬编码填充色')
})

test('三级命名各就各位', () => {
  assert.equal(pkg.name, 'dsh-rd-suite', '包名')
  assert.match(preset, /name: 研发模式/u, '预设名')
  assert.match(hub, /panelName: '研发工作台'/u, '侧栏入口名（中文）')
  assert.match(hub, /panelName: 'R&D workbench'/u, '侧栏入口名（英文）')
})

test('中英两侧不混用：中文侧不出现英文品牌名，英文侧不出现中文', () => {
  const zhBlock = hub.slice(hub.indexOf('    const STRINGS = {'), hub.indexOf('      en: {'))
  const enBlock = hub.slice(hub.indexOf('      en: {'), hub.indexOf('    }\n\n    return {'))
  assert.equal(zhBlock.includes('R&D workbench'), false, '中文侧不该出现英文品牌名')
  for (const word of ['研发工作台', '研发模式']) {
    assert.equal(enBlock.includes(word), false, `英文侧不该出现中文「${word}」`)
  }
})

test('设计文档写明三级命名与用色规则', () => {
  const design = readFileSync(join(root, 'docs', 'DESIGN.md'), 'utf8')
  assert.match(design, /品牌/u)
  assert.match(design, /研发模式/u)
  assert.match(design, /研发工作台/u)
  assert.match(design, /currentColor/u, '要写明图标用色跟着主题走')
  assert.match(design, /16×16/u, '要写明图标尺寸')
})
