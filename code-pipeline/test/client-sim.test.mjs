/**
 * Verifies the Client half without a browser.
 *
 * It reproduces the module-loader contract (window.__ModuleLoader__.load), runs
 * client.js with a minimal React stub, then calls the returned apply() against a
 * fake ctx that records slot registrations. Any contract break shows up here
 * instead of as a blank panel in the page.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

let captured = null
const registrations = []
const injections = []

const fakeWindow = {
  __ModuleLoader__: {
    load(entry) {
      captured = entry
    },
  },
}

// Minimal React surface: only what the module touches at load and register time.
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
}

const fakeRequire = (name) => {
  if (name === 'react') return fakeReact
  throw new Error(`unexpected require: ${name}`)
}

// eslint-disable-next-line no-new-func
const run = new Function('window', source)
run(fakeWindow)

if (!captured) throw new Error('client.js never called __ModuleLoader__.load')
if (captured.id !== 'dsh-code-pipeline') throw new Error(`unexpected module id: ${captured.id}`)
if (typeof captured.factory !== 'function') throw new Error('factory is not a function')

const moduleExports = captured.factory(fakeRequire)
if (!moduleExports || typeof moduleExports.apply !== 'function') throw new Error('factory did not return an apply()')
if (!Array.isArray(moduleExports.inject)) throw new Error('factory did not return an inject list')

const fakeSlots = {
  inject(key, callback) {
    injections.push(key)
    const effect = callback()
    // The real slots.inject drains a generator effect; mirror that here.
    if (effect && typeof effect !== 'function' && typeof effect[Symbol.iterator] === 'function') {
      for (const _ of effect) {
        // Iterating runs the yields, which perform the registrations.
      }
    }
    return () => {}
  },
  register(config, component) {
    registrations.push({ config, component })
    return () => {}
  },
}

const localeRegistrations = []
const fakeLocale = {
  register(namespace, dicts) {
    localeRegistrations.push({ namespace, locales: Object.keys(dicts), dicts })
    return () => {}
  },
  bind() {
    return (key) => key
  },
}

const fakeCtx = {
  slots: fakeSlots,
  layout: { selectPanel() {} },
  effect: (callback) => callback(),
  locale: fakeLocale,
}

const dispose = moduleExports.apply(fakeCtx)

const report = {
  moduleId: captured.id,
  inject: moduleExports.inject,
  slotInjections: injections,
  registrations: registrations.map(({ config, component }) => ({
    slot: config.name,
    id: config.id ?? null,
    key: config.key ?? null,
    order: config.order ?? null,
    locale: config.locale ?? null,
    componentName: typeof component === 'function' ? component.name || 'anonymous' : String(component),
  })),
  localeRegistrations,
  disposeIsFunction: typeof dispose === 'function',
}

console.log(JSON.stringify(report, null, 2))

const panelIcon = registrations.find((r) => r.config.name === 'sidebar.panellist')
const mainPage = registrations.find((r) => r.config.name === 'main')
if (!panelIcon) throw new Error('no sidebar.panellist registration')
if (!mainPage) throw new Error('no main registration')
if (panelIcon.config.id !== 'code-pipeline') throw new Error('panel icon id mismatch')
if (mainPage.config.key !== 'code-pipeline') throw new Error('main key must match the panel icon id')
if (panelIcon.config.locale !== 'code-pipeline') throw new Error('panel icon must declare the locale namespace')
if (mainPage.config.locale !== 'code-pipeline') throw new Error('main page must declare the locale namespace')
const dictionary = localeRegistrations.find((entry) => entry.namespace === 'code-pipeline')
if (!dictionary) throw new Error('no code-pipeline locale dictionary registration')
if (dictionary.locales.join(',') !== 'zh,en') throw new Error('dictionary must carry zh + en')
const zhKeys = Object.keys(dictionary.dicts.zh).sort()
const enKeys = Object.keys(dictionary.dicts.en).sort()
if (zhKeys.join(',') !== enKeys.join(',')) throw new Error('zh and en dictionaries must share the same key set')
const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',')
for (const key of zhKeys) {
  if (typeof dictionary.dicts.zh[key] !== 'string' || typeof dictionary.dicts.en[key] !== 'string') throw new Error(`dictionary value must be a string: ${key}`)
  if (placeholders(dictionary.dicts.zh[key]) !== placeholders(dictionary.dicts.en[key])) throw new Error(`placeholder mismatch for ${key}`)
}

console.log('\nOK: panel icon and main page registered with matching ids, zh + en copy registered')
