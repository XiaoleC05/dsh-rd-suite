/**
 * 共享上下文的校验：入口页要把仓库/版本传给成员页面，记忆库要能显示它。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 最小 React 替身。 */
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

/** 摊平为文本。 */
function render(node) {
  if (node === null || node === undefined || node === false) return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(render)
  if (typeof node.type === 'function')
    return render(node.type({ ...node.props, children: node.children }))
  return (node.children ?? []).flatMap(render)
}

/** 加载 memory 页面。 */
function loadMemoryPage() {
  const source = readFileSync(join(root, 'client-sources', 'memory.js'), 'utf8')
  let captured = null
  new Function('window', source)({
    __ModuleLoader__: {
      load: (entry) => {
        captured = entry
      },
    },
  })
  const dictionaries = []
  const plugin = captured.factory((name) => (name === 'react' ? React : {}))
  plugin.apply({
    slots: { inject: (key, callback) => callback() },
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
  return { page: plugin.pages[0], dictionaries }
}

test('记忆库显示入口页传来的仓库，不给上下文时不显示空壳', () => {
  const { page, dictionaries } = loadMemoryPage()
  const dict = dictionaries.find((item) => item.namespace === 'rdMemory').dicts.zh

  const withContext = render(
    React.createElement(page.component, {
      t: (key) => dict[key],
      context: { repo: 'D:/work/widgets', version: '0.62.0' },
    }),
  ).join(' ')
  assert.match(withContext, /当前仓库：D:\/work\/widgets/u)

  const withoutContext = render(
    React.createElement(page.component, { t: (key) => dict[key] }),
  ).join(' ')
  assert.doesNotMatch(withoutContext, /当前仓库/u, '没有上下文时不该出现空壳')

  const emptyRepo = render(
    React.createElement(page.component, { t: (key) => dict[key], context: { repo: '' } }),
  ).join(' ')
  assert.doesNotMatch(emptyRepo, /当前仓库/u, '空仓库字符串也不该显示')
})

test('入口页把 status 里的 root 与 version 组成 context 传给成员页面', () => {
  const hub = readFileSync(join(root, 'client-sources', 'hub-rd.js'), 'utf8')
  assert.match(hub, /const sharedContext =/u)
  assert.match(hub, /repo: typeof status\.root === 'string'/u, '仓库取自 status.root')
  assert.match(hub, /version: typeof status\.version === 'string'/u, '版本取自 status.version')
  assert.match(hub, /let pageProps = \{ context: sharedContext \}/u, 'pageProps 必须带上 context')
})
