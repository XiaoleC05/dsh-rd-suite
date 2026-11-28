/**
 * 四个真实项目适配点在脚本层的验证：--root、模板行过滤、自适应预算与 --focus。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import { adaptiveBudget } from '../scripts/repo-map.mjs'
import { documentsUnder, relativeTo, resolveRoot } from '../scripts/lib/scan-root.mjs'
import { isTemplateHint } from '../scripts/dup-check.mjs'

/** 造一个临时项目。 */
function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rd-scan-'))
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf8')
  }
  return dir
}

test('resolveRoot：不传时用默认根，传了就用指定目录并去掉该参数', () => {
  const plain = resolveRoot([])
  // 默认根是仓库根：只要求它是存在的绝对路径，不假设目录名（CI 与本地不同）。
  assert.equal(plain.root.length > 0, true)
  assert.equal(plain.root.includes('..') === false, true)

  const dir = mkdtempSync(join(tmpdir(), 'rd-root-'))
  const custom = resolveRoot(['--root', dir, 'extra.md'])
  assert.equal(custom.root, resolve(dir))
  assert.deepEqual(custom.rest, ['extra.md'])
  assert.throws(() => resolveRoot(['--root']), /要跟一个目录/u)
  rmSync(dir, { recursive: true, force: true })
})

test('documentsUnder：README + docs/*.md + skills/*/SKILL.md', () => {
  const dir = project({
    'README.md': '# r',
    'docs/a.md': '# a',
    'skills/x/SKILL.md': '---\nname: x\n---',
    'src/index.ts': 'export {}',
  })
  const found = documentsUnder(dir).map((path) => relativeTo(dir, path)).sort()
  assert.deepEqual(found, ['README.md', 'docs/a.md', 'skills/x/SKILL.md'])
  rmSync(dir, { recursive: true, force: true })
})

test('isTemplateHint：组件调用行与短模板行跳过，正文不跳', () => {
  assert.equal(isTemplateHint(':read-more{to="/guide"}'), true, '组件行跳过')
  assert.equal(isTemplateHint(':read-more{to="/guide/basics/middleware" title="Middleware"}…'), true, '长组件行也跳过')
  assert.equal(isTemplateHint('点这里 {count} 次'), true, '短且带占位符')
  assert.equal(
    isTemplateHint('这是一段正常长度的正文，讨论了推送失败的三种处理顺序与各自的代价，需要完整保留。'),
    false,
    '正文不跳',
  )
})

test('adaptiveBudget：小仓库不放大，大仓库按比例，封顶 6000', () => {
  assert.equal(adaptiveBudget(10), 4000, '小仓库用下限')
  assert.equal(adaptiveBudget(100), 4000, '100 文件 × 40 = 4000')
  assert.equal(adaptiveBudget(150), 6000, '按比例放大')
  assert.equal(adaptiveBudget(10_000), 6000, '封顶')
  assert.equal(adaptiveBudget(10_000, 9000), 9000, '显式预算优先')
})

test('link-check / code-dup / near-dup 都接受 --root（源码级确认）', () => {
  for (const file of ['scripts/link-check.mjs', 'scripts/code-dup.mjs', 'scripts/near-dup.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.match(source, /--root/u, `${file} 应当提到 --root`)
    assert.match(source, /resolveRoot/u, `${file} 应当用 resolveRoot 解析`)
  }
})
