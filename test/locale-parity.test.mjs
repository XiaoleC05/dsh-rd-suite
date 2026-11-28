/**
 * 中英文案对齐：四个客户端模块的字典必须键集一致、占位符一致、值不为空。
 *
 * 靠人肉同步两份字典必然漂移：漏一个键，英文界面就显示原始 key；
 * 漏一个占位符，格式化后会出现字面量 {total}。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 最小 React 替身：只要能让模块完成注册。 */
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

/** 加载一个客户端模块，返回它注册的字典。 */
function loadDictionaries(file) {
  const source = readFileSync(join(root, 'client-sources', file), 'utf8')
  let captured = null
  new Function('window', source)({
    __ModuleLoader__: {
      load: (entry) => {
        captured = entry
      },
    },
  })
  assert.ok(captured, `${file} 没有注册模块`)
  const dictionaries = []
  const plugin = captured.factory((name) => {
    // 有的模块用 JSX 运行时与 UI 组件库；这里只关心字典，给空替身即可。
    if (name === 'react' || name === 'react/jsx-runtime') return React
    // 其余宿主依赖（UI 组件库 / 客户端状态）这里都不需要真实实现。
    if (name.startsWith('@deepseek-ai/')) return {}
    throw new Error('unexpected require: ' + name)
  })
  plugin.apply({
    // 只关心字典注册；其余宿主能力给宽松替身，避免为了拿文案去模拟整个运行时。
    get: () => ({}),
    on: () => () => {},
    layout: { register: () => () => {} },
    webServer: { register: () => () => {} },
    tools: { register: () => () => {} },
    slots: {
      inject: (key, callback) => {
        const effect = callback()
        if (
          effect !== null &&
          typeof effect === 'object' &&
          typeof effect[Symbol.iterator] === 'function'
        ) {
          for (const _ of effect) void _
        }
        return () => {}
      },
      register: () => () => {},
    },
    locale: {
      register: (namespace, dicts) => {
        dictionaries.push({ namespace, dicts })
        return () => {}
      },
      // 有的模块在 apply 阶段就 bind 一次字典。
      bind: () => (key) => key,
    },
    effect: (callback) => {
      callback()
      return () => {}
    },
  })
  return dictionaries
}

// cards.js 是宿主侧总览卡，apply 依赖真实客户端状态，不在本检查范围内。
// 代码修正的界面已移除（第 123 轮），这个模块不再有字典。
const MODULES = ['memory.js', 'hub-rd.js']

/** 收集一个对象里的占位符，如 {total}。 */
function placeholdersOf(value) {
  return [...String(value).matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort()
}

test('每个模块都注册了 zh 与 en 两份字典', () => {
  for (const file of MODULES) {
    const dictionaries = loadDictionaries(file)
    assert.ok(dictionaries.length >= 1, `${file} 没有注册字典`)
    for (const { namespace, dicts } of dictionaries) {
      assert.ok(dicts.zh !== undefined, `${file} 的 ${namespace} 缺 zh`)
      assert.ok(dicts.en !== undefined, `${file} 的 ${namespace} 缺 en`)
    }
  }
})

test('zh 与 en 的键集完全相同（含嵌套表）', () => {
  for (const file of MODULES) {
    for (const { namespace, dicts } of loadDictionaries(file)) {
      const zhKeys = Object.keys(dicts.zh).sort()
      const enKeys = Object.keys(dicts.en).sort()
      assert.deepEqual(enKeys, zhKeys, `${file} / ${namespace} 键集不一致`)
    }
  }
})

test('嵌套表（typeNames 之类）的键集也要一致', () => {
  for (const file of MODULES) {
    for (const { namespace, dicts } of loadDictionaries(file)) {
      for (const key of Object.keys(dicts.zh)) {
        const zh = dicts.zh[key]
        const en = dicts.en[key]
        if (zh === null || typeof zh !== 'object' || Array.isArray(zh)) continue
        assert.deepEqual(
          Object.keys(en ?? {}).sort(),
          Object.keys(zh).sort(),
          `${file} / ${namespace} 的 ${key} 子键不一致`,
        )
      }
    }
  }
})

test('数组类文案长度一致，字符串非空', () => {
  for (const file of MODULES) {
    for (const { namespace, dicts } of loadDictionaries(file)) {
      for (const key of Object.keys(dicts.zh)) {
        const zh = dicts.zh[key]
        const en = dicts.en[key]
        if (Array.isArray(zh)) {
          assert.ok(Array.isArray(en), `${file} / ${namespace} 的 ${key} 在 en 里不是数组`)
          assert.equal(en.length, zh.length, `${file} / ${namespace} 的 ${key} 中英条数不一致`)
          for (const item of [...zh, ...en])
            assert.ok(String(item).trim() !== '', `${file} / ${namespace} 的 ${key} 有空文案`)
          continue
        }
        if (typeof zh === 'string') {
          assert.equal(typeof en, 'string', `${file} / ${namespace} 的 ${key} 类型不一致`)
          assert.ok(
            zh.trim() !== '' && en.trim() !== '',
            `${file} / ${namespace} 的 ${key} 有空文案`,
          )
        }
      }
    }
  }
})

test('占位符集合一致，避免格式化后露出字面量', () => {
  for (const file of MODULES) {
    for (const { namespace, dicts } of loadDictionaries(file)) {
      for (const key of Object.keys(dicts.zh)) {
        if (typeof dicts.zh[key] !== 'string') continue
        assert.deepEqual(
          placeholdersOf(dicts.en[key]),
          placeholdersOf(dicts.zh[key]),
          `${file} / ${namespace} 的 ${key} 占位符不一致`,
        )
      }
    }
  }
})
