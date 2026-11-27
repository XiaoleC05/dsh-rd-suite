/**
 * 打包校验的验证：files[] 覆盖、技能 frontmatter、成员目录与客户端产物新鲜度。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  REQUIRED_DIRECTORIES,
  checkClientFreshness,
  checkFilesCoverage,
  checkLoaderRows,
  checkSkillFrontmatter,
} from '../scripts/verify-package.mjs'

const FULL_MANIFEST = {
  files: ['index.js', 'client.js', 'cordis.patch.yml', 'README.md', ...REQUIRED_DIRECTORIES],
}

test('覆盖齐全时不报问题', () => {
  assert.deepEqual(checkFilesCoverage(FULL_MANIFEST), [])
})

test('漏目录或漏文件要逐条报出来', () => {
  const problems = checkFilesCoverage({ files: ['index.js', 'code-pipeline'] })
  assert.ok(problems.some((problem) => problem.includes('缺少目录 github')))
  assert.ok(problems.some((problem) => problem.includes('缺少文件 client.js')))
  assert.equal(
    problems.some((problem) => problem.includes('缺少目录 code-pipeline')),
    false,
    '已列出的目录不算缺',
  )
})

test('子路径写法也能覆盖目录', () => {
  const manifest = {
    files: [
      'index.js',
      'client.js',
      'cordis.patch.yml',
      'README.md',
      'code-pipeline/**',
      'github/',
      'memory',
      'skills',
      'scripts',
      'docs',
    ],
  }
  const problems = checkFilesCoverage(manifest)
  assert.equal(
    problems.some((problem) => problem.includes('code-pipeline')),
    false,
  )
})

test('技能 frontmatter：缺块与缺字段分别报', () => {
  const problems = checkSkillFrontmatter([
    { name: 'good', text: '---\nname: good\ndescription: 一句话说明\n---\n\n正文' },
    { name: 'noblock', text: '没有 frontmatter 的技能' },
    { name: 'nodef', text: '---\nname: nodef\n---\n\n正文' },
  ])
  assert.deepEqual(problems, [
    '技能 noblock 缺少 frontmatter',
    '技能 nodef 的 frontmatter 缺少 description',
  ])
})

test('成员目录缺失要报，存在的不报', () => {
  const yaml = [
    'plugins:',
    '  - entry: ./code-pipeline/index.js',
    '  - entry: ./ghost/index.js',
  ].join('\n')
  const problems = checkLoaderRows(yaml, (directory) => directory === 'code-pipeline')
  assert.deepEqual(problems, ['cordis.patch.yml 引用的成员目录不存在：ghost'])
})

test('client.js 陈旧要报，够新则通过', () => {
  assert.deepEqual(checkClientFreshness(2000, [1000, 1999]), [])
  assert.equal(checkClientFreshness(1000, [1000, 2000]).length, 1)
  assert.deepEqual(checkClientFreshness(1000, []), [], '没有源码时不做新鲜度判断')
})
