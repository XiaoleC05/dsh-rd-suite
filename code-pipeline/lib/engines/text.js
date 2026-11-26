/**
 * Built-in deterministic text normalizer.
 *
 * Used for languages without a WASM formatter (Makefile, PowerShell) and as the
 * degradation path when an optional engine is missing. It only performs
 * whitespace-level operations that cannot change program meaning:
 * BOM removal, line endings, trailing whitespace, blank-line runs, final
 * newline, and (where a preset declares it) leading-indent character style.
 */

const BOM = '\uFEFF'

function splitLines(text) {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
}

function isTargetLine(line) {
  if (!line || line.startsWith('\t') || line.startsWith('#')) return false
  if (/^\s/.test(line)) return false
  if (line.includes('=') && !line.includes(':')) return false
  return /^[^\s:#][^#]*:(?!=)/.test(line)
}

function isContinuation(line) {
  return /\\\s*$/.test(line)
}

/**
 * Makefile: a recipe line must start with a tab. Lines that follow a target and
 * are indented with spaces are converted, preserving any extra alignment.
 */
function normalizeMakefileIndent(lines) {
  const out = []
  let inRecipe = false
  for (const line of lines) {
    if (line.trim() === '') {
      out.push(line)
      continue
    }
    if (isTargetLine(line)) {
      inRecipe = true
      out.push(line)
      continue
    }
    if (!/^\s/.test(line)) {
      inRecipe = false
      out.push(line)
      continue
    }
    if (inRecipe && !line.startsWith('\t')) {
      const leading = line.match(/^ +/)[0]
      const converted = '\t' + ' '.repeat(Math.max(0, leading.length - 4))
      out.push(converted + line.slice(leading.length))
      continue
    }
    out.push(line)
  }
  return out
}

/** PowerShell: leading tabs become the preset's indent width in spaces. */
function expandLeadingTabs(lines, width) {
  return lines.map((line) => {
    const match = line.match(/^\t+/)
    if (!match) return line
    return ' '.repeat(match[0].length * width) + line.slice(match[0].length)
  })
}

export function textNormalize(content, preset = {}) {
  const indentStyle = preset.indentStyle ?? 'space'
  const indentWidth = Number.isFinite(preset.indentWidth) ? preset.indentWidth : 2
  const maxBlankLines = Number.isFinite(preset.maxBlankLines) ? preset.maxBlankLines : 1
  const language = preset.language ?? ''

  let text = String(content ?? '')
  if (text.startsWith(BOM)) text = text.slice(1)

  let lines = splitLines(text)

  // Trailing whitespace, except on Makefile continuation lines where a trailing
  // backslash plus spaces is meaningful to make.
  lines = lines.map((line) => {
    if (isContinuation(line)) return line.replace(/[ \t]+$/, '')
    return line.replace(/[ \t]+$/, '')
  })

  if (language === 'makefile') lines = normalizeMakefileIndent(lines)
  else if (language === 'powershell' && indentStyle === 'space') lines = expandLeadingTabs(lines, indentWidth)

  // Collapse runs of blank lines beyond the preset allowance.
  const collapsed = []
  let blankRun = 0
  for (const line of lines) {
    if (line === '') {
      blankRun += 1
      if (blankRun > maxBlankLines) continue
      collapsed.push(line)
    } else {
      blankRun = 0
      collapsed.push(line)
    }
  }

  // Trim leading blank lines and force exactly one trailing newline.
  while (collapsed.length > 0 && collapsed[0] === '') collapsed.shift()
  while (collapsed.length > 0 && collapsed.at(-1) === '') collapsed.pop()

  return collapsed.length === 0 ? '' : `${collapsed.join('\n')}\n`
}

export function normalizeLineEndingsOnly(content) {
  let text = String(content ?? '')
  if (text.startsWith(BOM)) text = text.slice(1)
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}
