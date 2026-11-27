/**
 * 窄屏布局的静态校验：像素下限必须被 min(…, 100%) 包住，否则窄容器下必然溢出。
 *
 * 无浏览器环境下拿不到真实宽度，但能查这条规则本身。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MODULES = ['cards.js', 'code-pipeline.js', 'memory.js', 'hub-rd.js']

/** 抽出所有 gridTemplateColumns 的取值。 */
function gridTemplates(source) {
  return [...String(source).matchAll(/gridTemplateColumns:\s*'([^']+)'/gu)].map((match) => match[1])
}

test('每个 grid 的像素下限都被 min(…, 100%) 包住', () => {
  for (const file of MODULES) {
    const source = readFileSync(join(root, 'client-sources', file), 'utf8')
    for (const template of gridTemplates(source)) {
      // 找出模板里所有「数字 + px」
      const pixels = [...template.matchAll(/(\d+)px/gu)].map((match) => match[0])
      if (pixels.length === 0) continue
      for (const pixel of pixels) {
        assert.ok(
          template.includes(`min(${pixel}, 100%)`),
          `${file} 的 grid「${template}」里 ${pixel} 没有包 min(…, 100%)，窄屏会溢出`,
        )
      }
    }
  }
})

test('记忆库两栏在窄屏下可回退', () => {
  const source = readFileSync(join(root, 'client-sources', 'memory.js'), 'utf8')
  const twoColumn = gridTemplates(source).find((template) => template.includes('34%'))
  assert.ok(twoColumn !== undefined, '记忆库应当仍是两栏布局')
  assert.match(twoColumn, /min\(\s*240px\s*,\s*100%\s*\)/u, '左栏下限要允许回退到 100%')
  assert.match(twoColumn, /1fr/u, '右栏仍占剩余空间')
})

test('至少有一个模块用了 auto-fit 响应式网格', () => {
  const source = readFileSync(join(root, 'client-sources', 'hub-rd.js'), 'utf8')
  const templates = gridTemplates(source)
  assert.ok(
    templates.some((template) => template.includes('auto-fit')),
    '概览应当保留 auto-fit，窄屏自动单列',
  )
})
