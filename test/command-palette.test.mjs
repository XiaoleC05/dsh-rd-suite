/**
 * 命令面板的校验：入口、键位、条目来源与可访问性角色。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'client-sources', 'hub-rd.js'), 'utf8')

test('Ctrl/Cmd+K 打开与关闭面板，Esc 关闭', () => {
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/u, '要认 Ctrl 与 Cmd')
  assert.match(source, /event\.key === 'k' \|\| event\.key === 'K'/u, '大小写都要认')
  assert.match(source, /event\.key === 'Escape'/u, 'Esc 必须能关')
  assert.match(source, /'aria-keyshortcuts': 'Control\+K'/u, '触发按钮要声明快捷键')
})

test('条目同时来自页签与能力，两组都有分组名', () => {
  assert.match(source, /group: t\('paletteTabGroup'\)/u)
  assert.match(source, /group: t\('paletteCapGroup'\)/u)
  assert.match(source, /asList\(t\('caps'\)\)\.map/u, '能力条目应从 caps 生成')
})

test('键位处理覆盖上下移动与回车执行', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter']) {
    assert.ok(source.includes(`event.key === '${key}'`), `缺少 ${key} 处理`)
  }
})

test('可访问性：dialog / listbox / option 与 aria 标注齐全', () => {
  assert.match(source, /role: 'dialog'/u)
  assert.match(source, /'aria-modal': 'true'/u)
  assert.match(source, /role: 'listbox'/u)
  assert.match(source, /role: 'option'/u)
  assert.match(source, /'aria-selected': index === palette\.cursor/u)
  assert.match(source, /'aria-label': t\('palettePlaceholder'\)/u, '输入框要带 aria-label')
})

test('没有匹配项时给可读提示，而不是空白面板', () => {
  assert.match(source, /paletteMatches\.length === 0/u)
  assert.match(source, /role: 'status'/u)
  assert.match(source, /t\('paletteEmpty'\)/u)
})
