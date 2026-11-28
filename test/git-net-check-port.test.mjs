/**
 * 代理端口可达性：配置了代理但端口不通，是最常见的「看起来配好了」。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { portReachable, proxyEndpoint } from '../scripts/git-net-check.mjs'

test('proxyEndpoint：解析 http://host:port 与裸 host:port', () => {
  assert.deepEqual(proxyEndpoint('http://127.0.0.1:7890'), { host: '127.0.0.1', port: 7890 })
  assert.deepEqual(proxyEndpoint('127.0.0.1:7890'), { host: '127.0.0.1', port: 7890 })
  assert.deepEqual(proxyEndpoint('http://127.0.0.1:7890/'), { host: '127.0.0.1', port: 7890 })
  assert.equal(proxyEndpoint('socks5://127.0.0.1:7891'), null, 'socks 不在本检查范围')
  assert.equal(proxyEndpoint(''), null)
  assert.equal(proxyEndpoint('http://127.0.0.1'), null, '缺端口算非法')
})

test('portReachable：连得上本机正在监听的端口', async () => {
  // 起一个本地测试服务器，验证探测逻辑本身
  const { createServer } = await import('node:net')
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  assert.equal(await portReachable({ host: '127.0.0.1', port }), true)
  await new Promise((resolve) => server.close(resolve))
})

test('portReachable：连不上未监听的端口', async () => {
  // 端口 1 在本机通常没有服务；短超时可接受
  assert.equal(await portReachable({ host: '127.0.0.1', port: 1 }, 600), false)
})
