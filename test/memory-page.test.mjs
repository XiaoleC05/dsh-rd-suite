/**
 * 记忆库页面的无浏览器校验：注册形状、字典同键集、空状态与列表渲染。
 * 与 hub 测试同一套最小 React 替身，不发真实请求（组件内部 fetch 用替身替换）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client-sources', 'memory.js'), 'utf8')

const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity),
  }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  Fragment: 'Fragment',
}

/** 摊平元素树为文本。 */
function render(node) {
  if (node === null || node === undefined || node === false) return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(render)
  if (typeof node.type === 'function')
    return render(node.type({ ...node.props, children: node.children }))
  return (node.children ?? []).flatMap(render)
}

/** 加载模块并跑 apply，返回 pages 与字典。 */
function boot() {
  let captured = null
  new Function('window', source)({
    __ModuleLoader__: {
      load: (entry) => {
        captured = entry
      },
    },
  })
  assert.ok(captured, 'memory.js 没有调用 __ModuleLoader__.load')
  assert.equal(captured.id, '@local/rd-memory-page')
  const dictionaries = []
  const registrations = []
  const plugin = captured.factory((name) => {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  })
  plugin.apply({
    slots: {
      inject: (key, callback) => {
        registrations.push(key)
        return callback()
      },
    },
    locale: {
      register: (namespace, dicts) => {
        dictionaries.push({ namespace, dicts })
        return () => {}
      },
    },
    effect: (callback) => {
      callback()
      return () => {}
    },
  })
  return { plugin, dictionaries, registrations }
}

test('注册一个「记忆库」标页，带 id、labelKey 与 locale', () => {
  const { plugin } = boot()
  assert.equal(plugin.pages.length, 1)
  const page = plugin.pages[0]
  assert.equal(page.id, 'rd-memory')
  assert.equal(page.labelKey, 'panelName')
  assert.equal(page.locale, 'rdMemory')
  assert.equal(typeof page.component, 'function')
})

test('zh 与 en 字典同键集，类型名齐全', () => {
  const { dictionaries } = boot()
  const entry = dictionaries.find((item) => item.namespace === 'rdMemory')
  assert.ok(entry, '缺少 rdMemory 字典')
  const zh = Object.keys(entry.dicts.zh).sort()
  const en = Object.keys(entry.dicts.en).sort()
  assert.deepEqual(zh, en)
  for (const key of ['template', 'pitfall', 'fix', 'strategy']) {
    assert.equal(typeof entry.dicts.zh.typeNames[key], 'string')
    assert.equal(typeof entry.dicts.en.typeNames[key], 'string')
  }
})

test('首次渲染显示加载态与搜索框，不炸在空数据上', () => {
  const { dictionaries, plugin } = boot()
  const dict = dictionaries.find((item) => item.namespace === 'rdMemory').dicts.zh
  const text = render(
    React.createElement(plugin.pages[0].component, { t: (key) => dict[key] }),
  ).join(' ')
  assert.match(text, /记忆库/u)
  assert.match(text, /正在读取记忆库/u)
})

test('页面文案覆盖搜索、筛选、空库与复制四类提示', () => {
  const { dictionaries } = boot()
  const dict = dictionaries.find((item) => item.namespace === 'rdMemory').dicts.zh
  for (const key of [
    'search',
    'all',
    'empty',
    'emptyFiltered',
    'copy',
    'copied',
    'copyFailed',
    'detailHint',
  ]) {
    assert.ok(typeof dict[key] === 'string' && dict[key] !== '', `缺少文案 ${key}`)
  }
})
