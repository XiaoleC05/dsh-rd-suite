/**
 * git 凭据与网络自检的验证：判定规则、修复命令与不联网的默认行为。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkConfigValues, EXPECTED } from '../scripts/git-net-check.mjs'

/** 造一份全部正确的配置。 */
function goodValues() {
  return {
    'credential.https://github.com.helper': '!gh auth git-credential',
    'credential.interactive': 'false',
    'http.sslBackend': 'openssl',
    'http.https://github.com.proxy': 'http://127.0.0.1:7890',
  }
}

test('四项全对时没有需要修的项', () => {
  const results = checkConfigValues(goodValues())
  assert.equal(results.length, 4)
  for (const item of results) assert.equal(item.ok, true, `${item.key} 不该判失败`)
})

test('缺凭据助手时判失败，并给出 gh 的那条修复命令', () => {
  const values = goodValues()
  delete values['credential.https://github.com.helper']
  const [helper] = checkConfigValues(values)
  assert.equal(helper.ok, false)
  assert.match(helper.actual, /^$/u)
  assert.match(helper.fix, /gh auth git-credential/u)
  assert.match(helper.why, /弹/u, '要说明会弹框')
})

test('凭据助手还是 manager（GCM）时判失败', () => {
  const values = { ...goodValues(), 'credential.https://github.com.helper': 'manager' }
  const [helper] = checkConfigValues(values)
  assert.equal(helper.ok, false)
  assert.equal(helper.actual, 'manager')
})

test('SSL 后端是 schannel 时判失败，提示改 openssl', () => {
  const values = { ...goodValues(), 'http.sslBackend': 'schannel' }
  const backend = checkConfigValues(values).find((item) => item.key === 'http.sslBackend')
  assert.equal(backend.ok, false)
  assert.match(backend.fix, /openssl/u)
})

test('代理只要设置了就算通过（不强求具体端口）', () => {
  const values = { ...goodValues(), 'http.https://github.com.proxy': 'http://10.0.0.1:8080' }
  const proxy = checkConfigValues(values).find(
    (item) => item.key === 'http.https://github.com.proxy',
  )
  assert.equal(proxy.ok, true)
})

test('每项都带 why 与 fix，可直接照着修', () => {
  for (const item of EXPECTED) {
    assert.ok(item.why !== '' && item.fix !== '', `${item.key} 缺少说明或修复命令`)
    assert.match(item.fix, /^git config --global /u, `${item.key} 的修复命令要能直接粘贴执行`)
  }
})
