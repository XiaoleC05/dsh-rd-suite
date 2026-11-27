/**
 * 空态文案的统一规则：说清「为什么空」并给出下一步动作。
 *
 * 只看「没有东西」的空态，用户不知道该换关键词、清筛选，还是等数据。
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

/** 加载一个客户端模块的字典。 */
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
  const dictionaries = []
  captured
    .factory((name) => (name.startsWith('react') || name.startsWith('@deepseek-ai/') ? React : {}))
    .apply({
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
        bind: () => (key) => key,
      },
      effect: (callback) => {
        callback()
        return () => {}
      },
    })
  return dictionaries
}

/** 动作提示词：空态里至少出现一个，读者才知道下一步做什么。 */
const ACTIONS = [
  '用',
  '换',
  '清',
  '检查',
  '加载',
  '运行',
  '等',
  'try',
  'pick',
  'check',
  'run',
  'load',
  'Ask',
  'wait',
]

/** 取所有空态键（empty* / nothing* / noResults）。 */
function emptyKeys(dict) {
  return Object.keys(dict).filter((key) => /^(empty|nothing|noResults)/u.test(key))
}

test('每个模块的空态都写了原因与下一步', () => {
  for (const file of ['memory.js', 'hub-rd.js']) {
    for (const { namespace, dicts } of loadDictionaries(file)) {
      const keys = emptyKeys(dicts.zh)
      assert.ok(keys.length >= 1, `${file} / ${namespace} 没有空态键，检查是否漏了`)
      for (const key of keys) {
        const zh = String(dicts.zh[key])
        const en = String(dicts.en[key] ?? '')
        assert.ok(zh.length >= 12, `${file} / ${namespace} 的 ${key} 太短，说不清原因`)
        assert.ok(
          ACTIONS.some((word) => zh.includes(word)),
          `${file} / ${namespace} 的 ${key} 缺少下一步动作：${zh}`,
        )
        assert.ok(
          ACTIONS.some((word) => en.includes(word)),
          `${file} / ${namespace} 的 ${key} 英文缺少下一步动作：${en}`,
        )
      }
    }
  }
})

test('记忆库两种空态区分开：整库为空 vs 过滤为空', () => {
  const dictionaries = loadDictionaries('memory.js')
  const dict = dictionaries.find((item) => item.namespace === 'rdMemory').dicts.zh
  assert.notEqual(dict.empty, dict.emptyFiltered, '两种空态不能用同一句话')
  assert.match(dict.empty, /memory_save/u, '整库为空要告诉读者怎么写入')
  assert.match(dict.emptyFiltered, /换|清/u, '过滤为空要告诉读者怎么放宽条件')
})
