// rd-kpi.test.mjs — 用合成的会话日志回归测试 rd-kpi.mjs 的统计口径。
// 运行：node --test scripts/test/rd-kpi.test.mjs（需要 node ≥ 22.15；Windows 上要写出文件路径，不能只写目录）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const KPI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'rd-kpi.mjs')
const T0 = Date.parse('2026-11-20T01:00:00Z')

function buildSessions() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-kpi-test-'))
  const dir = path.join(root, '--D-demo--', 'session-test-1')
  fs.mkdirSync(dir, { recursive: true })
  let t = T0
  const ev = (type, data, extra = {}) => ({ type, time: (t += 1000), data, ...extra })
  const user = text => ev('user/message', { content: [{ type: 'text', text }], source: { kind: 'user' }, role: 'user', id: 'u' + t })
  const usage = { inputTokens: 1000, cacheReadTokens: 9000, outputTokens: 100 }
  const say = (text, calls = []) => ev('assistant/message', {
    message: { content: [...(text ? [{ type: 'text', text }] : []), ...calls.map(([id, name, args]) => ({ type: 'tool-call', id, name, arguments: JSON.stringify(args) }))] },
    usage,
  })
  const call = (id, name, args) => ev('tool/call', { callId: id, name, arguments: JSON.stringify(args) })
  const result = (id, text = 'ok') => ev('tool/result', { message: { toolCallId: id, isError: false, content: [{ type: 'text', text }] } })
  const lines = [
    { id: 'session-test-1', agentPreset: 'rd', version: 4 },
    // 任务 1：L3，改文件，调用 review_agent，等待后交付
    user('实现登录锁定'),
    say('【L3｜鉴权改动】先写规格卡：AC-1 测试通过；AC-2 返回 423；AC-3 解锁', [['c1', 'read', { file_path: 'a.py' }]]),
    call('c1', 'read', { file_path: 'a.py' }), result('c1'),
    say('', [['c2', 'read', { file_path: 'a.py' }]]),
    call('c2', 'read', { file_path: 'a.py' }), result('c2'), // 未改动文件的重复读取 → 计 1 次
    say('', [['c3', 'edit', { file_path: 'b.py', old_string: 'x', new_string: 'y' }]]),
    call('c3', 'edit', { file_path: 'b.py', old_string: 'x', new_string: 'y' }), result('c3'),
    say('', [['c4', 'read', { file_path: 'b.py' }]]),
    call('c4', 'read', { file_path: 'b.py' }), result('c4'),
    say('', [['c5', 'edit', { file_path: 'b.py', old_string: 'y', new_string: 'z' }]]),
    call('c5', 'edit', { file_path: 'b.py', old_string: 'y', new_string: 'z' }), result('c5'),
    say('', [['c6', 'read', { file_path: 'b.py' }]]),
    call('c6', 'read', { file_path: 'b.py' }), result('c6'), // 改过后再读 → 不算重复
    say('', [['c7', 'review_agent', { description: '验收', prompt: '...' }]]),
    call('c7', 'review_agent', { description: '验收', prompt: '...' }), result('c7', 'started subagent agent-1'),
    say('正在等待验收子代理。'),
    ev('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ev('user/message', { content: [{ type: 'text', text: 'Background subagent agent-1 finished...\nVERDICT: PASS\nAC: AC-1 ✅' }], source: { kind: 'subagent-settled' } }),
    say('**结论**：已完成。\n**验收**：\n| AC | 验证方式 | 结果 |\n合计 3/3 通过；未验证 0 项'),
    ev('turn/end', { turn: 2, reason: { kind: 'completed' } }),
    // 任务 1 的后续：沿用 L3，改文件，交付带“验证：”
    user('再改一个小地方'),
    say('', [['c8', 'edit', { file_path: 'b.py', old_string: 'z', new_string: 'w' }]]),
    call('c8', 'edit', { file_path: 'b.py', old_string: 'z', new_string: 'w' }), result('c8'),
    say('已改。验证：pytest -q → 4 passed'),
    // 不改文件的任务段，不计入
    user('谢谢'),
    say('不客气。'),
    // 任务 2：L1
    user('把按钮文案改成“免费下载”，不对，是“立即下载”'),
    say('【L1｜单文件文案】', [['c9', 'write', { file_path: 'index.html', content: '...' }]]),
    call('c9', 'write', { file_path: 'index.html', content: '...' }), result('c9'),
    say('**结论**：已改。验证：npm run lint → 通过'),
    // 反馈：同一条消息先好评后改差评；另一条好评后删除 → 当前有效：差评 1
    ev('feedback/message-put', { sessionId: 's', item: { messageId: 'm1', rating: 'positive' } }),
    ev('feedback/message-put', { sessionId: 's', item: { messageId: 'm1', rating: 'negative' } }),
    ev('feedback/message-put', { sessionId: 's', item: { messageId: 'm2', rating: 'positive' } }),
    ev('feedback/message-delete', { sessionId: 's', messageId: 'm2' }),
  ]
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  return root
}

test('rd-kpi：任务段、分级、验收、重复读取、反馈去重', () => {
  const root = buildSessions()
  const json = path.join(root, 'out.json')
  execFileSync(process.execPath, [KPI, '--sessions', root, '--crisp', path.join(root, 'none.jsonl'), '--since', '2026-11-19', '--until', '2026-11-21', '--json', json], { stdio: 'pipe' })
  const r = JSON.parse(fs.readFileSync(json, 'utf8'))
  const d = r.detail
  assert.equal(r.totals.human, 4)
  assert.equal(d.rework, 1, '“不对”应计为返工信号')
  assert.equal(d.workSpans, 3, '改了文件的任务段：任务1、任务1后续、任务2')
  assert.equal(d.workSpansLeveled, 3)
  assert.deepEqual(d.levels, { L3: 2, L1: 1 })
  assert.equal(d.workL123, 3)
  assert.equal(d.workWithAcceptance, 3)
  assert.equal(d.workWithTotals, 1)
  assert.equal(d.l3Spans, 2)
  assert.equal(d.l3Reviewed, 2)
  assert.equal(d.reads, 4)
  assert.equal(d.rereads, 1, '只有未改动文件 a.py 的第二次读取算重复')
  assert.deepEqual(d.verdicts, { PASS: 1 })
  assert.deepEqual(r.feedback, { positive: 0, negative: 1 })
  assert.equal(r.kpi.K9, 1)
  assert.equal(r.kpi.K10, 1)
  assert.equal(r.kpi.K11, 1)
  assert.equal(r.samples.length, 1)
  fs.rmSync(root, { recursive: true, force: true })
})
