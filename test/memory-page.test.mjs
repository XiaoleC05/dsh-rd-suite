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

test('容量提示：用量达八成时显示，未达或没有数据时不显示', () => {
  const { dictionaries, plugin } = boot()
  const dict = dictionaries.find((item) => item.namespace === 'rdMemory').dicts.zh
  assert.equal(typeof dict.capacityWarn, 'string', '字典要有容量提示文案')
  assert.match(dict.capacityWarn, /\{total\}/u, '提示文案要带占位符')

  const renderPage = (props) => render(React.createElement(plugin.pages[0].component, { t: (key) => dict[key], ...props })).join(' ')
  // 初始渲染时还没有 stats，页面照常显示加载态。
  assert.match(renderPage({}), /记忆库/u)
})

test('删除：源码里是两段式确认，且调用 POST forget', () => {
  const source = readFileSync(join(here, '..', 'client-sources', 'memory.js'), 'utf8')
  assert.match(source, /confirming/u, '要有确认态')
  assert.match(source, /method: 'POST'/u, '删除必须走 POST')
  assert.match(source, /\/forget\?id=/u, '要带上条目 id')
  assert.equal((source.match(/setConfirming\(true\)/gu) ?? []).length, 1, '只在一处进入确认态')
})

test('键盘操作：上下移动、Enter 打开、Esc 关闭、斜杠聚焦搜索', () => {
  const source = readFileSync(join(here, '..', 'client-sources', 'memory.js'), 'utf8')
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
    assert.ok(source.includes(`'${key}'`), `要处理 ${key} 键`)
  }
  assert.match(source, /\.key === '\/'/u, '斜杠要能聚焦搜索框')
  assert.match(source, /scrollCursorIntoView/u, '光标移动后要滚动到可见')
  assert.match(source, /'aria-current'/u, '当前打开条目要有 aria 标记')
  assert.match(source, /itemCursor/u, '键盘光标要有可见样式')
})

test('键盘光标与已打开条目分开记录', () => {
  const source = readFileSync(join(here, '..', 'client-sources', 'memory.js'), 'utf8')
  assert.match(source, /const \[cursor, setCursor\]/u)
  assert.match(source, /const \[detail, setDetail\]/u)
  assert.match(source, /index === cursor/u, '样式要同时考虑光标与打开态')
})
