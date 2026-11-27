#!/usr/bin/env node
/**
 * AIGC 特征自检：零依赖的启发式扫描，给文案与文档打一个「人味分」。
 *
 * 它不做语言理解，也不判断内容真假；只统计几类可复现的表面特征，供改写前后对比：
 * 套话密度、句长是否均匀、连接词堆叠、模板化开头、重复片段、英文词藻、感叹号密度。
 *
 * 用法：
 *   node scripts/aigc-check.mjs README.md docs/DESIGN.md
 *   node scripts/aigc-check.mjs README.md --json
 *   node scripts/aigc-check.mjs README.md --min-score 80
 *
 * 退出码：0 表示全部文件达到阈值，1 表示有文件低于阈值（可用于交付前把关）。
 */

import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 中文套话与空洞形容：命中即扣分。 */
const CLICHES = [
  '赋能',
  '一站式',
  '全方位',
  '全面提升',
  '极大地',
  '显著地',
  '深刻地',
  '助力',
  '颠覆',
  '无缝',
  '极致',
  '领先',
  '世界一流',
  '不容忽视',
  '至关重要',
  '必不可少',
  '众所周知',
  '毋庸置疑',
  '不难发现',
  '值得注意的',
  '在当今',
  '随着',
  '由此可见',
  '总的来说',
  '综上所述',
]

/** 模板化开头：AI 文本最常见的起手式。 */
const OPENERS = ['在当今', '随着', '众所周知', '总的来说', '综上所述', '由此可见', '不可否认']

/** 连接词堆叠：一段里连用两个以上就报。 */
const CONNECTORS = [
  '首先',
  '其次',
  '再次',
  '最后',
  '总之',
  '综上',
  '换言之',
  '与此同时',
  '更重要的是',
  '值得注意的是',
]

/** 英文词藻：中文文档里的翻译腔与营销词。 */
const EN_BUZZWORDS = [
  'cutting-edge',
  'seamless',
  'revolutionary',
  'best-in-class',
  'game-changing',
  'delve',
  'leverage',
  'robust',
  'holistic',
  'unlock',
  'elevate',
  'tapestry',
  'landscape',
  "in today's fast-paced world",
  "it's worth noting",
]

/** 中文句末标点与分句标点。 */
const SENTENCE_END = /[。！？!?；;\n]+/u
const CJK = /[\u4e00-\u9fff]/u

/**
 * 把正文拆成句子，保留长度信息。
 * @param {string} text - 正文
 * @returns {string[]} 句子列表
 */
function splitSentences(text) {
  return text
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '' && sentence.length >= 4)
}

/**
 * 句长变异系数：越小说明句子长度越均匀，读起来越像模板。
 * @param {number[]} lengths - 句长列表
 * @returns {number} 标准差 / 均值
 */
function coefficientOfVariation(lengths) {
  if (lengths.length < 2) return 1
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length
  if (mean === 0) return 1
  const variance = lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length
  return Math.sqrt(variance) / mean
}

/**
 * 找出重复出现的片段：中文用字符级 n-gram，英文用词级 n-gram。
 * 只在同类片段内部滑动，避免把代码标识符的片段当成重复表达。
 * @param {string} text - 正文
 * @param {number} [size] - 中文按字、英文按词的长度
 * @returns {{ phrase: string; count: number }[]} 重复片段，按次数降序
 */
function repeatedGrams(text, size = 8) {
  const found = []
  // 只比较散文：代码块、行内代码、链接与裸 URL 不属于「重复表达」。
  const prose = String(text ?? '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`\n]*`/gu, ' ')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/gu, ' ')

  const cjk = (prose.match(/[\u4e00-\u9fff]+/gu) ?? []).join('')
  if (cjk.length >= size * 3) {
    const counts = new Map()
    for (let index = 0; index + size <= cjk.length; index += 1) {
      const gram = cjk.slice(index, index + size)
      counts.set(gram, (counts.get(gram) ?? 0) + 1)
    }
    for (const [phrase, count] of counts) if (count >= 3) found.push({ phrase, count })
  }

  const words = (prose.match(/[A-Za-z][A-Za-z0-9_-]*/gu) ?? []).map((word) => word.toLowerCase())
  const wordSize = 4
  if (words.length >= wordSize * 3) {
    const counts = new Map()
    for (let index = 0; index + wordSize <= words.length; index += 1) {
      const gram = words.slice(index, index + wordSize).join(' ')
      counts.set(gram, (counts.get(gram) ?? 0) + 1)
    }
    for (const [phrase, count] of counts) if (count >= 3) found.push({ phrase, count })
  }

  return found.sort((left, right) => right.count - left.count).slice(0, 5)
}

/**
 * 统计某个词在正文中的命中位置。
 * @param {string} text - 正文
 * @param {string[]} words - 词表
 * @returns {{ word: string; count: number; firstLine: number }[]} 命中项
 */
function findWords(text, words) {
  const lower = text.toLowerCase()
  const hits = []
  for (const word of words) {
    const needle = word.toLowerCase()
    let index = lower.indexOf(needle)
    if (index < 0) continue
    let count = 0
    while (index >= 0) {
      count += 1
      index = lower.indexOf(needle, index + needle.length)
    }
    hits.push({ word, count, firstLine: text.slice(0, lower.indexOf(needle)).split('\n').length })
  }
  return hits
}

/**
 * 分析一段文本，给出分数、指标与命中项。
 * @param {string} text - 正文
 * @returns {{ score: number; metrics: Record<string, unknown>; hits: Record<string, unknown> }} 分析结果
 */
export function analyze(text) {
  const body = String(text ?? '')
  const sentences = splitSentences(body)
  const lengths = sentences.map((sentence) => sentence.length)
  const cv = coefficientOfVariation(lengths)

  const cliches = findWords(body, CLICHES)
  const connectors = findWords(body, CONNECTORS)
  const buzzwords = findWords(body, EN_BUZZWORDS)
  const openerHits = OPENERS.filter((opener) => {
    const pattern = new RegExp(`(^|\\n)\\s*${opener}`, 'u')
    return pattern.test(body)
  })
  const duplicates = repeatedGrams(body)
  const perThousand = (count) => (body.length === 0 ? 0 : (count / body.length) * 1000)
  const exclamations = (body.match(/[！!]/gu) ?? []).length

  let score = 100
  const clicheTotal = cliches.reduce((sum, hit) => sum + hit.count, 0)
  score -= Math.min(30, clicheTotal * 4)
  if (connectors.length >= 2) score -= Math.min(15, connectors.length * 4)
  if (openerHits.length > 0) score -= 10
  if (buzzwords.length > 0) score -= Math.min(12, buzzwords.length * 4)
  if (sentences.length >= 12 && cv < 0.28) score -= 10
  if (duplicates.length > 0) score -= Math.min(20, duplicates.length * 4)
  if (exclamations > 0 && perThousand(exclamations) > 0.5) score -= 5
  const clean = Math.max(0, Math.min(100, Math.round(score)))

  return {
    score: clean,
    metrics: {
      characters: body.length,
      sentences: sentences.length,
      meanSentenceLength:
        sentences.length === 0
          ? 0
          : Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
      sentenceLengthCv: Number(cv.toFixed(3)),
      exclamationsPerThousand: Number(perThousand(exclamations).toFixed(2)),
    },
    hits: {
      cliches: cliches.slice(0, 8),
      connectors: connectors.slice(0, 6),
      englishBuzzwords: buzzwords.slice(0, 6),
      templateOpeners: openerHits,
      repeatedPhrases: duplicates,
    },
  }
}

/**
 * 命令行入口。
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {number} 退出码
 */
export function main(argv) {
  const json = argv.includes('--json')
  const minScoreIndex = argv.indexOf('--min-score')
  const minScoreValue = minScoreIndex >= 0 ? argv[minScoreIndex + 1] : undefined
  const minScore = minScoreValue === undefined ? 60 : Number(minScoreValue)
  const files = argv.filter((argument) => !argument.startsWith('--') && argument !== minScoreValue)
  if (files.length === 0) {
    process.stderr.write('用法: node scripts/aigc-check.mjs <文件...> [--json] [--min-score N]\n')
    return 2
  }

  const results = []
  let failed = false
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      results.push({ file, error: error instanceof Error ? error.message : String(error) })
      failed = true
      continue
    }
    const analysis = analyze(text)
    results.push({ file, ...analysis })
    if (analysis.score < minScore) failed = true
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
  } else {
    for (const result of results) {
      if (result.error !== undefined) {
        process.stdout.write(`${result.file}: 读取失败 (${result.error})\n`)
        continue
      }
      const { metrics, hits } = result
      process.stdout.write(
        `${result.file}: ${result.score} 分 · ${metrics.characters} 字符 · ${metrics.sentences} 句 · 句长均值 ${metrics.meanSentenceLength} · CV ${metrics.sentenceLengthCv}\n`,
      )
      const lines = []
      if (hits.templateOpeners.length > 0)
        lines.push(`  模板开头: ${hits.templateOpeners.join('、')}`)
      if (hits.cliches.length > 0) {
        lines.push(`  套话: ${hits.cliches.map((hit) => `${hit.word}×${hit.count}`).join('、')}`)
      }
      if (hits.connectors.length > 0) {
        lines.push(
          `  连接词: ${hits.connectors.map((hit) => `${hit.word}×${hit.count}`).join('、')}`,
        )
      }
      if (hits.englishBuzzwords.length > 0) {
        lines.push(
          `  英文词藻: ${hits.englishBuzzwords.map((hit) => `${hit.word}×${hit.count}`).join('、')}`,
        )
      }
      if (hits.repeatedPhrases.length > 0) {
        lines.push(
          `  重复片段: ${hits.repeatedPhrases.map((hit) => `${hit.phrase}×${hit.count}`).join('、')}`,
        )
      }
      if (metrics.sentences >= 12 && metrics.sentenceLengthCv < 0.28) {
        lines.push('  句长过于均匀：拆开长句、插入短句，让节奏有起伏')
      }
      process.stdout.write(lines.length === 0 ? '  未发现明显 AI 特征\n' : `${lines.join('\n')}\n`)
    }
    process.stdout.write(`\n阈值 ${minScore} 分：${failed ? '未通过' : '通过'}\n`)
  }
  return failed ? 1 : 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
