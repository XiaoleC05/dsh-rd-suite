/**
 * 研发工作台入口页的无浏览器校验。
 *
 * 直接加载 client-sources/hub-rd.js（模块加载器的原始形态），用最小 React 替身执行
 * 建树，再核对侧栏注册、标签契约与概览内容。任何契约断裂都会在这里失败，而不是表现成
 * 页面空白。运行：node --test test/
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client-sources', 'hub-rd.js'), 'utf8')

/** 最小 React 替身：建树为普通对象，hooks 无状态。 */
const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity),
  }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useEffect: () => {},
}

/** 把建好的元素树摊平成字符串，函数组件按普通函数调用。 */
function render(node) {
  if (node === null || node === undefined || node === false) return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(render)
  if (typeof node.type === 'function')
    return render(node.type({ ...node.props, children: node.children }))
  return (node.children ?? []).flatMap(render)
}

/** 收集树里所有元素，便于按 type / props 断言。 */
function elements(node, found = []) {
  if (node === null || node === undefined || node === false) return found
  if (typeof node === 'string' || typeof node === 'number') return found
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found)
    return found
  }
  if (typeof node.type === 'function') {
    elements(node.type({ ...node.props, children: node.children }), found)
    return found
  }
  found.push(node)
  for (const child of node.children ?? []) elements(child, found)
  return found
}

function load() {
  let captured = null
  const fakeWindow = {
    __ModuleLoader__: {
      load: (entry) => {
        captured = entry
      },
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', source)(fakeWindow)
  assert.ok(captured, 'hub-rd.js 没有调用 __ModuleLoader__.load')
  assert.equal(captured.id, '@local/rd-hub')
  return captured.factory
}

/** 起一个假 ctx，记录槽位与字典注册。 */
function boot(pageSources) {
  const registrations = []
  const injections = []
  const dictionaries = []
  const slots = {
    inject(key, callback) {
      injections.push(key)
      const effect = callback()
      if (effect && typeof effect[Symbol.iterator] === 'function') for (const _ of effect) void _
      return () => {}
    },
    register(config, component) {
      registrations.push({ config, component })
      return () => {}
    },
  }
  const locale = {
    register(namespace, dicts) {
      dictionaries.push({ namespace, dicts })
      return () => {}
    },
    bind(namespace) {
      const entry = dictionaries.find((item) => item.namespace === namespace)
      return (key) => (entry ? entry.dicts.zh[key] : key)
    },
  }
  const ctx = { slots, locale, layout: {}, effect: (callback) => callback() }
  const plugin = load()((name) => {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  }, pageSources)
  plugin.apply(ctx)
  return { plugin, registrations, injections, dictionaries }
}

const fakePages = [[{ id: 'demo', labelKey: 'panelName', locale: 'rdHub', component: () => null }]]

test('侧栏只有一个入口，并登记同名主区页', () => {
  const { registrations } = boot(fakePages)
  const sidebar = registrations.filter((item) => item.config.name === 'sidebar.panellist')
  const main = registrations.filter((item) => item.config.name === 'main')
  assert.equal(sidebar.length, 1, '侧栏入口应当只有一个')
  assert.equal(main.length, 1, '主区页应当只有一个')
  assert.equal(sidebar[0].config.id, 'rd-hub')
  assert.equal(main[0].config.key, 'rd-hub', '主区 key 必须与侧栏 id 相同')
  assert.equal(sidebar[0].config.order, 20)
  assert.equal(sidebar[0].config.locale, 'rdHub')
  assert.equal(typeof sidebar[0].component, 'function', '侧栏需要图标组件')
})

test('字典 zh/en 键集一致，且没有冒用占位符', () => {
  const { dictionaries } = boot(fakePages)
  const entry = dictionaries.find((item) => item.namespace === 'rdHub')
  assert.ok(entry, '缺少 rdHub 字典')
  const zh = Object.keys(entry.dicts.zh).sort()
  const en = Object.keys(entry.dicts.en).sort()
  assert.deepEqual(zh, en, 'zh 与 en 必须同键集')
  for (const key of zh) {
    const value = entry.dicts.zh[key]
    const shape = Array.isArray(value) ? 'array' : typeof value
    const other = Array.isArray(entry.dicts.en[key]) ? 'array' : typeof entry.dicts.en[key]
    assert.equal(shape, other, `${key} 在两种语言里类型要一致`)
    if (shape === 'array')
      assert.equal(value.length, entry.dicts.en[key].length, `${key} 条目数要一致`)
  }
  const text = JSON.stringify(entry.dicts)
  assert.ok(
    !/\{\{\s*(?!model|provider)[^}]+\}\}/.test(text),
    '字典里只允许 model / provider 占位符',
  )
})

test('标签把成员页面按需挂载并保留其状态', () => {
  const { registrations } = boot(fakePages)
  const main = registrations.find((item) => item.config.name === 'main')
  const pageTabs = main.config.inject().pageTabs
  assert.equal(pageTabs.length, 1, '成员页面应当进入标签')
  assert.equal(pageTabs[0].label(), '研发工作台', '标签标题走成员页面的 locale')
  assert.equal(pageTabs[0].getProps().embedded, true, '成员页面被告知自己已内嵌，避免重复标题')
  assert.deepEqual(main.config.inject().pageTabs, main.config.inject().pageTabs.slice(0, 1))
})

test('概览按「状态带 → 三步开始 → 流水线 → 分级与关卡 → 能力 → 差异」排列', () => {
  const { registrations, dictionaries } = boot(fakePages)
  const dict = dictionaries.find((item) => item.namespace === 'rdHub').dicts.zh
  const main = registrations.find((item) => item.config.name === 'main')
  const element = React.createElement(main.component, {
    pageTabs: main.config.inject().pageTabs,
    t: (key) => dict[key],
  })
  const tree = render(element)
  const text = tree.join(' ')

  const headings = elements(element)
    .filter((node) => node.type === 'h1' || node.type === 'h2' || node.type === 'h3')
    .map((node) => render(node).join(''))
  assert.equal(headings[0], dict.panelName, 'h1 必须是工作台标题且只有一个')
  assert.deepEqual(
    headings.slice(1, 4),
    [dict.startTitle, dict.flowTitle, dict.ghTitle],
    '分区标题顺序：三步开始 → 流水线 → GitHub 固定流程',
  )
  assert.deepEqual(
    headings.slice(4, 6),
    [dict.tierTitle, dict.gateTitle],
    '分级与关卡两张卡片接在流程之后',
  )
  assert.equal(headings[6], dict.capTitle, '能力区接在关卡之后')
  assert.equal(headings.at(-1), dict.diffTitle, '差异对比放在最后')

  assert.equal(tree.filter((item) => item === dict.gateBadge).length, 2, 'S5 与 S6 两步要标出关卡')
  assert.ok(text.includes('PTC'), '概览要说明 PTC 执行方式')
  assert.ok(!text.includes(dict.emptyTabs), '成员页面已就绪时不该提示缺失')
})

test('成员页面缺失时给出明确提示', () => {
  const { registrations, dictionaries } = boot([])
  const dict = dictionaries.find((item) => item.namespace === 'rdHub').dicts.zh
  const main = registrations.find((item) => item.config.name === 'main')
  const text = render(
    React.createElement(main.component, { pageTabs: [], t: (key) => dict[key] }),
  ).join(' ')
  assert.ok(text.includes(dict.emptyTabs), '没有成员页面时要说明面板不可用')
})

test('面板错误边界：实现存在、包在每个 pane 里、有重试文案', () => {
  const source = readFileSync(join(here, '..', 'client-sources', 'hub-rd.js'), 'utf8')
  assert.match(source, /static getDerivedStateFromError/u, '必须实现错误边界')
  assert.match(source, /componentDidCatch/u, '要留一份控制台日志')
  assert.match(source, /typeof React\.Component/u, '没有 Component 的环境要退化')

  const boundaryUses = source.match(/h\(\s*PanelBoundary,/gu) ?? []
  assert.ok(boundaryUses.length >= 2, '概览与成员页面都要被包住')
  assert.ok(source.includes('pane(\n          OVERVIEW'), '概览要经 pane 渲染')
  const overviewStart = source.indexOf('const bodies = [')
  const boundaryStart = source.indexOf('PanelBoundary,')
  assert.ok(boundaryStart > overviewStart, '边界要出现在 bodies 构建之后，而不是整页外层')
})

test('替身环境（无 React.Component）下仍能渲染概览', () => {
  const { registrations, dictionaries } = boot(fakePages)
  const dict = dictionaries.find((item) => item.namespace === 'rdHub').dicts.zh
  assert.equal(typeof dict.retry, 'string', '字典要有重试文案')
  const main = registrations.find((item) => item.config.name === 'main')
  const text = render(
    React.createElement(main.component, {
      pageTabs: main.config.inject().pageTabs,
      t: (key) => dict[key],
    }),
  ).join(' ')
  assert.match(text, /研发工作台/u)
})
