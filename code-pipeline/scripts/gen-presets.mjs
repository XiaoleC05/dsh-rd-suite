/**
 * Authoring source for presets/*.json.
 *
 * Every rule carries a tier and a source URL so the panel can show provenance:
 *   T1 = language/framework official text
 *   T2 = official tool default (the tool is the standard)
 *   T3 = de-facto standard, no official backing
 *   T0 = no source; a local decision that must stay visible as such
 *
 * Run: node scripts/gen-presets.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'presets')
mkdirSync(outDir, { recursive: true })

const P = (spec) => ({
  version: 1,
  lineEnding: 'lf',
  finalNewline: true,
  maxBlankLines: 1,
  ...spec,
})

const presets = [
  P({
    id: 'go',
    label: 'Go',
    language: 'go',
    engine: 'gofmt',
    depth: 'format',
    indentStyle: 'tab',
    indentWidth: 4,
    columnLimit: 0,
    rules: [
      { id: 'go/F/gofmt', name: '文件格式以 gofmt 输出为准', category: 'F', tier: 'T2', source: 'https://pkg.go.dev/cmd/gofmt', fix: 'auto' },
      { id: 'go/F/semicolons', name: '不手写分号，交由 ASI 插入', category: 'F', tier: 'T1', source: 'https://go.dev/ref/spec#Semicolons', fix: 'auto' },
      { id: 'go/F/import-group', name: 'import 分组，标准库独立成组', category: 'F', tier: 'T1', source: 'https://go.dev/wiki/CodeReviewComments#imports', fix: 'auto' },
      { id: 'go/F/line-ending', name: 'LF 行尾、文件末尾单个换行', category: 'F', tier: 'T2', source: 'https://pkg.go.dev/cmd/gofmt', fix: 'auto' },
      { id: 'go/S/mixed-caps', name: '多词标识符用 MixedCaps，不用下划线', category: 'S', tier: 'T1', source: 'https://go.dev/doc/effective_go', fix: 'report' },
      { id: 'go/S/initialisms', name: '缩略词大小写一致：URL、ID、ServeHTTP', category: 'S', tier: 'T1', source: 'https://go.dev/wiki/CodeReviewComments', fix: 'report' },
      { id: 'go/S/package-name', name: '包名小写、短、单字', category: 'S', tier: 'T1', source: 'https://go.dev/doc/effective_go', fix: 'report' },
      { id: 'go/S/doc-comment', name: '导出名有 doc comment，完整句并以名字开头', category: 'S', tier: 'T1', source: 'https://go.dev/doc/comment', fix: 'report' },
      { id: 'go/S/error-string', name: 'error 字符串不大写、不以标点结尾', category: 'S', tier: 'T1', source: 'https://go.dev/wiki/CodeReviewComments', fix: 'report' },
      { id: 'go/X/error-handling', name: '不用 _ 丢弃 error，普通错误不 panic', category: 'X', tier: 'T1', source: 'https://go.dev/wiki/CodeReviewComments', fix: 'none' },
    ],
  }),
  P({
    id: 'typescript',
    label: 'TypeScript',
    language: 'typescript',
    engine: 'biome',
    depth: 'full',
    indentStyle: 'space',
    indentWidth: 2,
    columnLimit: 100,
    quoteStyle: 'single',
    semicolons: 'asNeeded',
    biomeConfig: {
      formatter: { indentStyle: 'space', indentWidth: 2, lineWidth: 100 },
      javascript: { formatter: { quoteStyle: 'single', semicolons: 'asNeeded' } },
    },
    rules: [
      { id: 'ts/F/format', name: '格式绑定 Biome 2.6（空格 2 / 单引号 / 无分号 / 100 列）', category: 'F', tier: 'T2', source: 'https://biomejs.dev/formatter/', fix: 'auto' },
      { id: 'ts/F/import-sort', name: 'import 分组与排序（Biome organizeImports）', category: 'F', tier: 'T2', source: 'https://biomejs.dev/assist/javascript/actions/', fix: 'auto' },
      { id: 'ts/F/trailing-newline', name: 'LF 行尾、文件末尾单个换行', category: 'F', tier: 'T2', source: 'https://biomejs.dev/formatter/', fix: 'auto' },
      { id: 'ts/S/no-explicit-any', name: '禁止显式 any', category: 'S', tier: 'T2', source: 'https://biomejs.dev/linter/rules/no-explicit-any/javascript/', fix: 'report' },
      { id: 'ts/S/consistent-type-imports', name: '类型导入统一使用 import type', category: 'S', tier: 'T2', source: 'https://typescript-eslint.io/rules/consistent-type-imports/', fix: 'report' },
      { id: 'ts/S/use-const', name: '能 const 就 const', category: 'S', tier: 'T2', source: 'https://biomejs.dev/linter/rules/use-const/javascript/', fix: 'auto' },
      { id: 'ts/S/naming-convention', name: '类型 PascalCase、变量与函数 camelCase', category: 'S', tier: 'T2', source: 'https://typescript-eslint.io/rules/naming-convention/', fix: 'report' },
      { id: 'ts/S/strict-mode', name: 'tsconfig 开启 strict 与 noUncheckedIndexedAccess', category: 'S', tier: 'T1', source: 'https://www.typescriptlang.org/tsconfig#strict', fix: 'report' },
      { id: 'ts/X/no-official-style', name: 'TypeScript 无官方风格指南，排版以工具默认为准', category: 'X', tier: 'T1', source: 'https://github.com/microsoft/TypeScript/issues/878', fix: 'none' },
    ],
  }),
  P({
    id: 'javascript',
    label: 'JavaScript',
    language: 'javascript',
    engine: 'biome',
    depth: 'full',
    indentStyle: 'space',
    indentWidth: 2,
    columnLimit: 100,
    quoteStyle: 'single',
    semicolons: 'asNeeded',
    biomeConfig: {
      formatter: { indentStyle: 'space', indentWidth: 2, lineWidth: 100 },
      javascript: { formatter: { quoteStyle: 'single', semicolons: 'asNeeded' } },
    },
    rules: [
      { id: 'js/F/format', name: '格式绑定 Biome 2.6（空格 2 / 单引号 / 无分号 / 100 列）', category: 'F', tier: 'T2', source: 'https://biomejs.dev/formatter/', fix: 'auto' },
      { id: 'js/F/import-sort', name: 'import 分组与排序（Biome organizeImports）', category: 'F', tier: 'T2', source: 'https://biomejs.dev/assist/javascript/actions/', fix: 'auto' },
      { id: 'js/F/trailing-newline', name: 'LF 行尾、文件末尾单个换行', category: 'F', tier: 'T2', source: 'https://biomejs.dev/formatter/', fix: 'auto' },
      { id: 'js/S/eqeqeq', name: '相等比较使用 === / !==', category: 'S', tier: 'T2', source: 'https://biomejs.dev/linter/rules/no-double-equals/javascript/', fix: 'auto' },
      { id: 'js/S/use-const', name: '能 const 就 const，禁用 var 倾向', category: 'S', tier: 'T2', source: 'https://biomejs.dev/linter/rules/use-const/javascript/', fix: 'auto' },
      { id: 'js/S/no-unused-vars', name: '无未使用变量（Biome 不安全修复为加 _ 前缀）', category: 'S', tier: 'T2', source: 'https://biomejs.dev/linter/rules/no-unused-variables/javascript/', fix: 'report' },
      { id: 'js/S/naming-camelcase', name: '变量与函数 camelCase、类 PascalCase', category: 'S', tier: 'T3', source: 'https://github.com/airbnb/javascript', fix: 'report' },
      { id: 'js/X/no-official-style', name: 'ECMA-262 不规定代码风格，排版由工具决定', category: 'X', tier: 'T1', source: 'https://tc39.es/ecma262/', fix: 'none' },
    ],
  }),
  P({
    id: 'python',
    label: 'Python',
    language: 'python',
    engine: 'ruff-fmt',
    depth: 'format',
    indentStyle: 'space',
    indentWidth: 4,
    columnLimit: 88,
    quoteStyle: 'double',
    rules: [
      { id: 'py/F/ruff-format', name: '格式以 ruff format 输出为准（88 列、双引号）', category: 'F', tier: 'T2', source: 'https://docs.astral.sh/ruff/formatter/', fix: 'auto' },
      { id: 'py/F/indent', name: '每级 4 空格缩进，禁止 Tab 混用', category: 'F', tier: 'T1', source: 'https://peps.python.org/pep-0008/#indentation', fix: 'auto' },
      { id: 'py/F/line-length', name: '行宽 88（PEP 8 允许团队放宽到 99）', category: 'F', tier: 'T1', source: 'https://peps.python.org/pep-0008/#maximum-line-length', fix: 'auto' },
      { id: 'py/F/import-group', name: 'import 分三组并置顶', category: 'F', tier: 'T1', source: 'https://peps.python.org/pep-0008/#imports', fix: 'auto' },
      { id: 'py/F/blank-lines', name: '顶层定义间 2 空行，方法间 1 空行', category: 'F', tier: 'T1', source: 'https://peps.python.org/pep-0008/#blank-lines', fix: 'auto' },
      { id: 'py/S/naming', name: '函数与变量 snake_case，类 CapWords', category: 'S', tier: 'T1', source: 'https://peps.python.org/pep-0008/#naming-conventions', fix: 'report' },
      { id: 'py/S/compare-none', name: '与 None 比较用 is / is not', category: 'S', tier: 'T1', source: 'https://peps.python.org/pep-0008/#programming-recommendations', fix: 'auto' },
      { id: 'py/S/bare-except', name: '避免裸 except，捕获具体异常', category: 'S', tier: 'T1', source: 'https://peps.python.org/pep-0008/#programming-recommendations', fix: 'report' },
      { id: 'py/S/docstring', name: '公共模块、函数、类需有 docstring', category: 'S', tier: 'T1', source: 'https://peps.python.org/pep-0257/', fix: 'report' },
    ],
  }),
  P({
    id: 'html',
    label: 'HTML',
    language: 'html',
    engine: 'biome',
    depth: 'format',
    indentStyle: 'space',
    indentWidth: 2,
    columnLimit: 100,
    biomeConfig: {
      formatter: { indentStyle: 'space', indentWidth: 2, lineWidth: 100 },
      html: { formatter: { enabled: true, indentStyle: 'space', indentWidth: 2, lineWidth: 100 } },
    },
    experimentalHtml: true,
    rules: [
      { id: 'html/F/format', name: '格式绑定 Biome（空格 2 / 100 列）', category: 'F', tier: 'T2', source: 'https://biomejs.dev/formatter/', fix: 'auto' },
      { id: 'html/F/lowercase', name: '标签名与属性名小写', category: 'F', tier: 'T3', source: 'https://google.github.io/styleguide/htmlcssguide.html', fix: 'report' },
      { id: 'html/F/attr-quote', name: '属性值使用双引号', category: 'F', tier: 'T3', source: 'https://google.github.io/styleguide/htmlcssguide.html', fix: 'auto' },
      { id: 'html/F/doctype', name: '使用 HTML5 doctype', category: 'F', tier: 'T3', source: 'https://google.github.io/styleguide/htmlcssguide.html', fix: 'report' },
      { id: 'html/F/void-slash', name: 'void 元素结尾斜杠风格全项目一致', category: 'F', tier: 'T2', source: 'https://biomejs.dev/formatter/', fix: 'auto' },
      { id: 'html/X/no-official-style', name: 'WHATWG 只定义语法，不规定缩进与引号偏好', category: 'X', tier: 'T1', source: 'https://html.spec.whatwg.org/multipage/syntax.html', fix: 'none' },
    ],
  }),
  P({
    id: 'makefile',
    label: 'Makefile',
    language: 'makefile',
    engine: 'text',
    depth: 'text',
    indentStyle: 'tab',
    indentWidth: 4,
    columnLimit: 0,
    rules: [
      { id: 'mk/F/recipe-tab', name: 'recipe 行必须以 Tab 开头', category: 'F', tier: 'T1', source: 'https://www.gnu.org/software/make/manual/html_node/Recipe-Syntax.html', fix: 'auto' },
      { id: 'mk/F/line-ending', name: 'LF 行尾', category: 'F', tier: 'T1', source: 'https://www.gnu.org/software/make/manual/', fix: 'auto' },
      { id: 'mk/F/final-newline', name: '文件末尾单个换行', category: 'F', tier: 'T0', source: '', fix: 'auto' },
      { id: 'mk/F/trailing-ws', name: '去掉行尾空白（续行 \\ 除外）', category: 'F', tier: 'T0', source: '', fix: 'auto' },
      { id: 'mk/F/blank-lines', name: '连续空行最多 1', category: 'F', tier: 'T0', source: '', fix: 'auto' },
      { id: 'mk/X/no-formatter', name: 'Makefile 无官方格式化器，仅做确定性空白规范化', category: 'X', tier: 'T1', source: 'https://www.gnu.org/software/make/manual/', fix: 'none' },
    ],
  }),
  P({
    id: 'css',
    label: 'CSS',
    language: 'css',
    engine: 'biome',
    depth: 'format',
    indentStyle: 'space',
    indentWidth: 2,
    columnLimit: 100,
    quoteStyle: 'double',
    biomeConfig: {
      formatter: { indentStyle: 'space', indentWidth: 2, lineWidth: 100 },
      css: { formatter: { indentStyle: 'space', indentWidth: 2, lineWidth: 100, quoteStyle: 'double' } },
    },
    rules: [
      { id: 'css/F/format', name: '格式绑定 Biome（空格 2 / 100 列 / 双引号）', category: 'F', tier: 'T2', source: 'https://biomejs.dev/formatter/', fix: 'auto' },
      { id: 'css/F/one-decl-per-line', name: '每个声明独立一行', category: 'F', tier: 'T3', source: 'https://google.github.io/styleguide/htmlcssguide.html', fix: 'auto' },
      { id: 'css/F/zero-unit', name: '0 值省略单位（0 而非 0px）', category: 'F', tier: 'T3', source: 'https://google.github.io/styleguide/htmlcssguide.html', fix: 'report' },
      { id: 'css/F/trailing-newline', name: 'LF 行尾、文件末尾单个换行', category: 'F', tier: 'T2', source: 'https://biomejs.dev/formatter/', fix: 'auto' },
      { id: 'css/X/no-official-style', name: 'CSS 无官方风格规范，排版以工具默认为准', category: 'X', tier: 'T1', source: 'https://www.w3.org/TR/css-syntax-3/', fix: 'none' },
    ],
  }),
  P({
    id: 'cpp',
    label: 'C++',
    language: 'cpp',
    engine: 'clang-format',
    depth: 'format',
    indentStyle: 'space',
    indentWidth: 2,
    columnLimit: 100,
    clangStyle: {
      BasedOnStyle: 'Google',
      IndentWidth: 2,
      ColumnLimit: 100,
      DerivePointerAlignment: false,
      PointerAlignment: 'Left',
      SortIncludes: 'CaseSensitive',
    },
    rules: [
      { id: 'cpp/F/clang-format', name: '格式以 clang-format 输出为准（基于 Google 风格，2 空格 / 100 列）', category: 'F', tier: 'T2', source: 'https://clang.llvm.org/docs/ClangFormatStyleOptions.html', fix: 'auto' },
      { id: 'cpp/F/pointer-align', name: '指针与引用符号贴近类型', category: 'F', tier: 'T3', source: 'https://google.github.io/styleguide/cppguide.html', fix: 'auto' },
      { id: 'cpp/F/include-sort', name: 'include 排序', category: 'F', tier: 'T3', source: 'https://google.github.io/styleguide/cppguide.html', fix: 'auto' },
      { id: 'cpp/S/naming', name: '类型 PascalCase、函数 CamelCase、成员变量后缀下划线', category: 'S', tier: 'T3', source: 'https://google.github.io/styleguide/cppguide.html', fix: 'report' },
      { id: 'cpp/X/no-official-style', name: 'C++ 无官方风格规范，Google 风格为事实标准', category: 'X', tier: 'T1', source: 'https://isocpp.org/', fix: 'none' },
    ],
  }),
  P({
    id: 'shell',
    label: 'Shell',
    language: 'shell',
    engine: 'shfmt',
    depth: 'format',
    indentStyle: 'space',
    indentWidth: 2,
    columnLimit: 0,
    rules: [
      { id: 'sh/F/shfmt', name: '格式以 shfmt 输出为准（2 空格缩进）', category: 'F', tier: 'T2', source: 'https://github.com/mvdan/sh', fix: 'auto' },
      { id: 'sh/F/line-ending', name: 'LF 行尾、文件末尾单个换行', category: 'F', tier: 'T2', source: 'https://github.com/mvdan/sh', fix: 'auto' },
      { id: 'sh/S/quote-vars', name: '变量展开加引号防分词', category: 'S', tier: 'T3', source: 'https://www.shellcheck.net/wiki/SC2086', fix: 'report' },
      { id: 'sh/S/shebang', name: '脚本首行声明可执行 shell', category: 'S', tier: 'T3', source: 'https://www.gnu.org/software/bash/manual/', fix: 'report' },
      { id: 'sh/X/no-official-style', name: 'POSIX 不规定脚本排版风格', category: 'X', tier: 'T1', source: 'https://pubs.opengroup.org/onlinepubs/9699919799/', fix: 'none' },
    ],
  }),
  P({
    id: 'powershell',
    label: 'PowerShell',
    language: 'powershell',
    engine: 'text',
    depth: 'text',
    indentStyle: 'space',
    indentWidth: 4,
    columnLimit: 0,
    rules: [
      { id: 'ps/F/indent', name: '每级 4 空格缩进，Tab 转为空格', category: 'F', tier: 'T3', source: 'https://learn.microsoft.com/en-us/powershell/scripting/community/contributing/code-style', fix: 'auto' },
      { id: 'ps/F/line-ending', name: 'LF 行尾', category: 'F', tier: 'T0', source: '', fix: 'auto' },
      { id: 'ps/F/final-newline', name: '文件末尾单个换行', category: 'F', tier: 'T0', source: '', fix: 'auto' },
      { id: 'ps/F/trailing-ws', name: '去掉行尾空白', category: 'F', tier: 'T0', source: '', fix: 'auto' },
      { id: 'ps/F/blank-lines', name: '连续空行最多 1', category: 'F', tier: 'T0', source: '', fix: 'auto' },
      { id: 'ps/S/naming', name: '函数使用 Verb-Noun 且通过已批准动词表', category: 'S', tier: 'T3', source: 'https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/approved-verbs-for-windows-powershell-commands', fix: 'report' },
      { id: 'ps/X/no-formatter', name: 'PowerShell 无 WASM 格式化器，仅做确定性空白规范化', category: 'X', tier: 'T1', source: 'https://learn.microsoft.com/en-us/powershell/', fix: 'none' },
    ],
  }),
]

for (const preset of presets) {
  writeFileSync(join(outDir, `${preset.id}.json`), `${JSON.stringify(preset, null, 2)}\n`, 'utf8')
}

const ruleCount = presets.reduce((sum, preset) => sum + preset.rules.length, 0)
console.log(`wrote ${presets.length} presets, ${ruleCount} rules`)
for (const preset of presets) {
  const byCategory = preset.rules.reduce((acc, rule) => {
    acc[rule.category] = (acc[rule.category] ?? 0) + 1
    return acc
  }, {})
  console.log(
    `  ${preset.id.padEnd(12)} engine=${preset.engine.padEnd(13)} rules=${String(preset.rules.length).padStart(2)}  F=${byCategory.F ?? 0} S=${byCategory.S ?? 0} X=${byCategory.X ?? 0}`,
  )
}
