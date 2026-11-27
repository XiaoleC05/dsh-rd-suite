/**
 * 迭代协议与账本的结构检查。
 *
 * 100 轮优化最容易在过程上失控：条目重复、状态乱写、协议被绕过。这里把协议与账本的
 * 形状固定下来——协议必须写全九个阶段，账本必须有 001–100 共 100 条且状态合法。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const protocol = readFileSync(join(root, 'docs', 'ITERATION.md'), 'utf8')
const ledger = readFileSync(join(root, 'docs', 'ITERATIONS.md'), 'utf8')

const STATUSES = new Set(['待做', '进行中', '完成', '重做', '取消'])

/** 账本里的条目行：| 001 | ... | 状态 | 提交 | */
function rows() {
  const found = []
  for (const line of ledger.split(/\r?\n/u)) {
    const match = /^\|\s*(\d{3})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/u.exec(line)
    if (match === null) continue
    found.push({
      id: match[1],
      target: match[2].trim(),
      status: match[3].trim(),
      commit: match[4].trim(),
    })
  }
  return found
}

test('协议写全九个阶段', () => {
  for (const stage of [
    '复盘',
    '选模块',
    '建 Issue',
    '实现',
    '测试',
    '提交',
    '推送',
    '关闭',
    '记账',
  ]) {
    assert.ok(protocol.includes(stage), `协议缺少阶段：${stage}`)
  }
  assert.match(protocol, /git push origin main/u, '协议必须写明推送命令')
})

test('协议定义了什么算正向迭代', () => {
  const section = protocol.slice(protocol.indexOf('什么算「正向」'))
  assert.ok(section.length > 0, '协议缺少「什么算正向」一节')
  for (const rule of ['测试数不减少', '推送成功', '范围没有越界']) {
    assert.ok(section.includes(rule), `正向标准缺少：${rule}`)
  }
})

test('账本有 001–100 共 100 条且编号不重复', () => {
  const entries = rows()
  const ids = entries.map((entry) => entry.id).filter((id) => id !== '000')
  assert.equal(new Set(ids).size, ids.length, '编号重复')
  assert.equal(ids.length >= 100, true, `条目只有 ${ids.length} 条，少于 100`)
  for (let index = 1; index <= 100; index += 1) {
    const id = String(index).padStart(3, '0')
    assert.ok(ids.includes(id), `缺少条目 ${id}`)
  }
})

test('每条都有目标与合法状态', () => {
  for (const entry of rows()) {
    if (entry.id === '000') continue
    assert.ok(entry.target.length >= 4, `${entry.id} 的目标太短`)
    assert.ok(STATUSES.has(entry.status), `${entry.id} 的状态非法：${entry.status}`)
    if (entry.status === '完成')
      assert.ok(entry.commit.length > 0, `${entry.id} 标为完成却没有提交信息`)
  }
})

test('账本记录已完成轮次', () => {
  const done = ledger.slice(ledger.indexOf('## 已完成'))
  assert.match(done, /\|\s*第 1 轮\s*\|\s*#16\s*\|/u, '应记录第 1 轮（协议与账本）')
  assert.match(done, /\|\s*第 2 轮\s*\|\s*#17\s*\|/u, '应记录第 2 轮（记忆骨架）')
})
