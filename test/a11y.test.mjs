/**
 * 可访问性契约：把已经写进面板的 aria 属性固定下来。
 *
 * 这些属性不会让界面变好看，丢掉了多数人也看不出来——键盘与读屏用户先受影响。
 * 所以用断言守：role、aria-* 与 id 的对应关系必须成立。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)

/** 最小 React 替身，与 hub / memory 测试共用同一套假设。 */
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

/** 加载一个客户端模块并跑 apply。 */
function boot(relative, moduleId) {
  const source = readFileSync(join(root, relative), 'utf8')
  let captured = null
  new Function('window', source)({
    __ModuleLoader__: {
      load: (entry) => {
        captured = entry
      },
    },
  })
  assert.ok(captured, `${relative} 没有注册模块`)
  assert.equal(captured.id, moduleId)
  const dictionaries = []
  const registrations = []
  const plugin = captured.factory((name) => {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  })
  plugin.apply({
    slots: {
      inject: (key, callback) => {
        const effect = callback()
        // 槽位注册以迭代器形式返回，消费它才会真正走到 register。
        if (
          effect !== null &&
          typeof effect === 'object' &&
          typeof effect[Symbol.iterator] === 'function'
        ) {
          for (const _ of effect) void _
        }
        return () => {}
      },
      register: (config, component) => {
        registrations.push({ config, component })
        return () => {}
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

/** 遍历元素树，收集满足条件的节点。 */
function collect(node, predicate, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) collect(child, predicate, found)
    return found
  }
  if (typeof node.type === 'function') {
    collect(node.type({ ...node.props, children: node.children }), predicate, found)
    return found
  }
  if (predicate(node)) found.push(node)
  for (const child of node.children ?? []) collect(child, predicate, found)
  return found
}

const byProps = (test) => (node) => test(node.props ?? {})

test('入口页：tablist / tab / tabpanel 三件套齐全且相互指向', () => {
  const { registrations, dictionaries } = boot('client-sources/hub-rd.js', '@local/rd-hub')
  const dict = dictionaries.find((item) => item.namespace === 'rdHub').dicts.zh
  const main = registrations.find((item) => item.config.name === 'main')
  assert.ok(main !== undefined, '没有注册主页面槽')

  const pageTabs = [1, 2].map((index) => ({
    id: 'demo-' + index,
    label: () => '演示 ' + index,
    locale: 'rdHub',
    component: () => null,
  }))
  const tree = React.createElement(main.component, { pageTabs, t: (key) => dict[key] })
  const tablists = collect(
    tree,
    byProps((props) => props.role === 'tablist'),
  )
  assert.equal(tablists.length, 1, '页签容器要标 role=tablist')

  const tabs = collect(
    tree,
    byProps((props) => props.role === 'tab'),
  )
  assert.ok(tabs.length >= 3, `至少三个页签，实际 ${tabs.length}`)
  const ids = new Set(tabs.map((node) => node.props.id))
  const panelIds = new Set(
    collect(
      tree,
      byProps((props) => props.role === 'tabpanel'),
    ).map((node) => node.props.id),
  )
  let withControls = 0
  for (const tab of tabs) {
    assert.equal(typeof tab.props['aria-selected'], 'boolean', '页签要标 aria-selected')
    const controls = tab.props['aria-controls']
    if (controls === undefined) continue
    withControls += 1
    // 未挂载的面板不写 aria-controls：指向不存在的 id 比不写更糟。
    assert.ok(panelIds.has(controls), `aria-controls 指向的面板必须存在：${String(controls)}`)
  }
  assert.ok(withControls >= 1, '至少当前页签要指向已挂载的面板')

  for (const panel of collect(
    tree,
    byProps((props) => props.role === 'tabpanel'),
  )) {
    assert.ok(ids.has(panel.props['aria-labelledby']), 'tabpanel 要用 aria-labelledby 指回页签 id')
  }
})

test('入口页：装饰性元素对读屏隐藏，提示区标 status', () => {
  const { registrations, dictionaries } = boot('client-sources/hub-rd.js', '@local/rd-hub')
  const dict = dictionaries.find((item) => item.namespace === 'rdHub').dicts.zh
  const main = registrations.find((item) => item.config.name === 'main')
  const tree = React.createElement(main.component, { pageTabs: [], t: (key) => dict[key] })

  const hidden = collect(
    tree,
    byProps((props) => props['aria-hidden'] === true),
  )
  assert.ok(hidden.length >= 2, '步骤编号与图标应标 aria-hidden')

  const statuses = collect(
    tree,
    byProps((props) => props.role === 'status'),
  )
  assert.ok(statuses.length >= 1, '加载与空白提示要用 role=status')
})

test('记忆库：搜索框有 aria-label，筛选按钮有 aria-pressed', () => {
  const { plugin, dictionaries } = boot('client-sources/memory.js', '@local/rd-memory-page')
  const dict = dictionaries.find((item) => item.namespace === 'rdMemory').dicts.zh
  const page = plugin.pages[0]
  const tree = React.createElement(page.component, { t: (key) => dict[key] })

  const input = collect(
    tree,
    byProps((props) => props.type === 'search'),
  )[0]
  assert.ok(input !== undefined, '要有搜索框')
  assert.equal(input.props['aria-label'], dict.search)

  const chips = collect(
    tree,
    byProps((props) => props['aria-pressed'] !== undefined),
  )
  assert.ok(chips.length >= 2, '类型筛选按钮要标 aria-pressed')
  for (const chip of chips) assert.equal(typeof chip.props['aria-pressed'], 'boolean')
})

test('记忆库：列表项 role=button + tabIndex，列表容器可聚焦', () => {
  const source = readFileSync(join(root, 'client-sources', 'memory.js'), 'utf8')
  assert.match(source, /role: 'button'/u)
  assert.match(source, /tabIndex: 0/u, '列表项要能被键盘聚焦')
  assert.match(source, /tabIndex: -1/u, '列表容器用 -1 承接焦点')
  assert.match(source, /'aria-current'/u, '当前打开条目要有 aria-current')
})

test('记忆库：错误与提示分别用 alert 与 status', () => {
  const source = readFileSync(join(root, 'client-sources', 'memory.js'), 'utf8')
  assert.match(source, /role: 'alert'/u, '读取失败要用 role=alert')
  assert.match(source, /role: 'status'/u, '容量与未命中提示要用 role=status')
  assert.equal(/role: 'alert'[\s\S]{0,80}aria-live/u.test(source), false, '不需要再叠 aria-live')
})
