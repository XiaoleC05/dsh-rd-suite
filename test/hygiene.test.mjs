/**
 * 仓库卫生：换行一致、无 BOM、检查脚本不带参数也能跑出结论。
 *
 * 这三条都是「全面检查时才发现」的问题：平时单看某个文件都没事，
 * 一旦按仓库整体看，混用与手拼文件列表的麻烦立刻出现。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 被 git 跟踪的文本类文件。 */
function trackedTextFiles() {
  const output = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  return output
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .filter((line) => /\.(js|mjs|cjs|json|yml|yaml|md)$/u.test(line))
}

test('.gitattributes 固定 LF 策略', () => {
  const attributes = readFileSync(join(root, '.gitattributes'), 'utf8')
  assert.match(attributes, /^\* text=auto eol=lf$/mu, '要写明默认按 LF 归一')
  assert.match(attributes, /client\.js/u, '生成物也要标出来')
})

test('跟踪的文本文件没有 CRLF / LF 混用', () => {
  const mixed = []
  for (const file of trackedTextFiles()) {
    const text = readFileSync(join(root, file), 'utf8')
    if (/\r\n/u.test(text) && /(?<!\r)\n/u.test(text)) mixed.push(file)
  }
  assert.deepEqual(mixed, [], `混用换行的文件：${mixed.join('、')}`)
})

test('跟踪的文本文件没有 BOM', () => {
  const withBom = trackedTextFiles().filter(
    (file) => readFileSync(join(root, file)).subarray(0, 3).toString('hex') === 'efbbbf',
  )
  assert.deepEqual(withBom, [], `带 BOM 的文件：${withBom.join('、')}`)
})

test('三个检查脚本不带参数时能跑出结论，而不是只打印用法', () => {
  for (const script of [
    'scripts/secret-scan.mjs',
    'scripts/term-check.mjs',
    'scripts/dup-check.mjs',
  ]) {
    const output = execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
    assert.doesNotMatch(output, /^用法/mu, `${script} 仍在只打印用法`)
    assert.ok(output.trim() !== '', `${script} 没有输出结论`)
  }
})
