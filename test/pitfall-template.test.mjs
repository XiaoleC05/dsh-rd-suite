/**
 * 踩坑模板的验证：五段齐全、防复发检查必须可执行、样例能通过记忆校验。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { normalizeEntry } from '../memory/lib/store.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const template = readFileSync(
  join(root, 'skills', 'rd-retro', 'references', 'pitfall-template.md'),
  'utf8',
)

/** 模板要求的五段。 */
export const SECTIONS = ['现象', '触发条件', '根因', '修复', '防复发检查']

test('五段结构齐全', () => {
  for (const section of SECTIONS) {
    assert.ok(template.includes(`## `) && template.includes(section), `模板缺少「${section}」`)
  }
  const headings = [...template.matchAll(/^##\s+(.+)$/gmu)].map((match) => match[1].trim())
  assert.ok(headings.length >= SECTIONS.length, `实际只有 ${headings.length} 节`)
})

test('每段都写了「不要写什么」，防止空话填充', () => {
  const warnings = [...template.matchAll(/\*\*不要(写|只写|停在)\*\*/gu)].length
  assert.ok(warnings >= SECTIONS.length - 1, `只写了 ${warnings} 条反面提示`)
})

test('防复发检查要求可执行，明确禁止「以后注意」', () => {
  assert.match(template, /防复发检查/u)
  assert.match(template, /以后注意/u, '要点名这种无效写法')
  assert.match(template, /测试名|lint|脚本断言|CI 门禁/u, '要给出可执行的检查形态')
})

test('适用边界说明纯环境问题怎么记', () => {
  assert.match(template, /适用边界/u)
  assert.match(template, /环境，非代码|环境问题/u)
})

test('按模板填的样例能通过记忆校验', () => {
  const sample = {
    type: 'pitfall',
    title: 'git push 报 curl 56 连接重置',
    body: '现象：push 报 curl 56。触发条件：本机走 127.0.0.1:7890 代理。根因：git 不读系统代理且 schannel 握手失败。修复：配 http.proxy 并换 openssl 后端。防复发检查：git-net-check 四项校验 + 对应测试。',
    tags: ['git', 'proxy'],
  }
  const result = normalizeEntry(sample)
  assert.equal(result.ok, true, `样例未通过校验：${result.message}`)
  assert.equal(result.entry.type, 'pitfall')
})

test('反例：只写「已修复」的正文过不了校验', () => {
  assert.equal(normalizeEntry({ type: 'pitfall', title: '修好了', body: '已修复' }).ok, false)
})
