window.__ModuleLoader__.load({
  id: 'dsh-code-pipeline',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const API = '/dsh-code-pipeline/api'
    const PANEL_ID = 'code-pipeline'

    // ------------------------------------------------------------------ copy
    //
    // Visible UI copy goes through the Client locale service. Chinese is the
    // plugin's primary language (中文名：代码修正); the English dictionaries keep
    // the exact strings and the English name (Code pipeline) this plugin used
    // before, so the English surface is unchanged.
    const NS = PANEL_ID
    const zh = {
      'panel.name': '代码修正',
      'header.selected': '已选 {selected} / {total}',
      'header.noWorkspace': '未选择工作区',
      'button.selectAll': '全选',
      'button.clear': '清除',
      'button.check': '检查',
      'button.checking': '检查中…',
      'button.standardize': '修正',
      'button.applying': '修正中…',
      'tree.scanning': '正在扫描工作区…',
      'tree.workspaceUnavailable': '工作区不可用',
      'tree.noFiles': '未找到代码文件',
      'file.skipped': '跳过',
      'file.skippedWith': '跳过 · {language}',
      'file.unsupportedTitle': '{path} — 不在 P0 语言列表内，不会套用预设',
      'dir.expand': '展开',
      'dir.collapse': '折叠',
      'dir.selectedOfTotal': '此文件夹已选 {selected}/{total}',
      'result.error': '错误：{message}',
      'result.errorHint': '面板无法连接宿主，请确认插件已启用。',
      'result.emptyHint': '在左侧勾选文件，然后点击“检查”或“修正”。',
      'result.summary': '已加载 {presets} 个语言预设 · 已扫描 {files} 个文件 · 已选 {selected} 个',
      'stat.processed': '已处理',
      'stat.changed': '已变更',
      'stat.unchanged': '未变更',
      'stat.written': '已写入',
      'stat.reportOnly': '仅报告',
      'stat.styleFindings': '风格问题',
      'stat.skipped': '已跳过',
      'stat.failed': '失败',
      'result.reportOnlyNote': '仅检查：未修改任何文件。点击“修正”写入这些变更。',
      'result.writtenNote': '已写入 {count} 个文件。',
      'result.degradedNote': '{count} 个文件回退到内置文本规则：格式化引擎不可用。',
      'table.changed': '已变更（{count}）',
      'table.unchanged': '未变更（{count}）',
      'table.failed': '失败（{count}）',
      'findings.title': '风格问题 — 仅报告，不自动改写（{count}）',
      'findings.more': '…还有 {count} 条',
      'skipped.title': '已跳过（{count}）',
      'skipped.outsideP0': '{path} — 非 P0（{language}）',
      'skipped.outsideP0Label': '非 P0 语言',
      'error.network': '无法连接宿主，请检查 dsh 是否运行后重试。',
      'skipped.reason': '{path} — {reason}',
      'table.file': '文件',
      'table.language': '语言',
      'table.preset': '预设',
      'table.engine': '引擎',
      'table.depth': '深度',
      'table.findings': '问题数',
      'table.status': '状态',
      'table.lineUnchanged': '行数未变',
      'status.changed': '已变更',
      'status.unchanged': '未变更',
      'status.failed': '失败',
      'status.skipped': '已跳过',
      'reason.notIdempotent': '非幂等，未写入',
      'reason.pathEscape': '路径越界',
      'reason.unreadable': '无法读取',
      'reason.engineError': '引擎错误',
      'reason.binaryContent': '二进制内容',
      'reason.unwritable': '无法写入',
      'legend.languages': '支持预设的语言',
      'legend.engines': '格式化引擎',
      'legend.engineReady': '{engine}：就绪',
      'legend.engineMissing': '{engine}：缺失（仅文本规则）',
      'legend.note': '不在十种 P0 语言内的文件会显示“跳过”标记，永远不会被修改。引擎缺失时，该语言会降级为空白级规则，结果中的深度显示为 “text”。',
      'limits.line': '上限：{files} 个文件 / 单文件 {bytes}',
      'limits.help': '在 profile 的 cordis.patch.yml 中修改 code-pipeline 行（maxFiles / maxBytes），保存后自动重载。',
      'status.root': '根：{root}',      'banner.truncated': '文件数达到上限（{limit}），文件树已截断；可通过配置项的 maxFiles 调整上限。',
      'banner.config-clamped': '配置 {field} 超出范围，已自动限制为 {to}。',
      'banner.config-invalid': '配置 {field} 无效，已回退默认值 {to}。',
      'banner.more': '…还有 {count} 条',
      'table.deltaLines': '行数变化',
      'table.deltaBytes': '字节变化',
      'result.linesUnchanged': '行数未变但内容发生变化的文件：{count} 个；修正不提供撤销，请用 git diff 复核。',
      'result.noUndo': '修正不提供撤销；已写入 {count} 个文件，建议用 git diff 复核。',
      'skipped.summary': '已跳过 {count} 个文件：{reasons}',
      'result.findingsTruncated': '问题列表已截断，仅显示前 {cap} 条；完整数量见各文件问题数。',
      'result.showAll': '展开全部（{count}）',
      'result.showLess': '收起',
      'result.onlyFailed': '只看失败',
      'result.rowLimit': '仅显示前 {shown} 条，共 {total} 条。',
      'error.unauthorized': '需要重新认证：请刷新页面后重试。',
      'error.forbidden': '请求被宿主来源校验拒绝。',
      'error.guard-unavailable': '宿主安全服务不可用，已拒绝请求。',
      'error.no-workspace': '没有可用工作区，请先在宿主中注册工作区。',
      'error.root-not-registered': '该工作区未注册，请刷新页面重新选择。',
      'error.root-required': '缺少工作区路径。',
      'error.internal': '插件内部错误，请查看宿主日志。',
      'error.bad-json': '请求体不是合法 JSON。',
      'error.body-too-large': '请求体超过大小上限。',
      'error.retry': '重试',
      'error.notFound': '宿主上没有该接口（插件可能未启用或版本不匹配），请刷新页面。',
      'error.apiVersion': '插件前端与宿主版本不一致，请刷新页面。',
      'reason.skippedDirectory': '依赖/构建目录，已跳过',
      'reason.ignored': '被忽略规则排除',
      'reason.generatedMinified': '压缩生成物，已跳过',
      'reason.tooLarge': '超过单文件大小上限，已跳过',
      'reason.nonUtf8': '非 UTF-8 编码，未处理',
      'reason.notCode': '非代码文件',
      'reason.missingPreset': '缺少预设',
      'reason.changedSinceRead': '读取后文件被修改，未写入',
    }
    const en = {
      'panel.name': 'Code pipeline',
      'header.selected': '{selected} / {total} selected',
      'header.noWorkspace': 'no workspace',
      'button.selectAll': 'Select all',
      'button.clear': 'Clear',
      'button.check': 'Check',
      'button.checking': 'Checking…',
      'button.standardize': 'Standardize',
      'button.applying': 'Applying…',
      'tree.scanning': 'Scanning workspace…',
      'tree.workspaceUnavailable': 'Workspace unavailable',
      'tree.noFiles': 'No code files found',
      'file.skipped': 'Skipped',
      'file.skippedWith': 'Skipped · {language}',
      'file.unsupportedTitle': '{path} — not in the P0 language list, no preset is applied',
      'dir.expand': 'expand',
      'dir.collapse': 'collapse',
      'dir.selectedOfTotal': '{selected}/{total} in this folder',
      'result.error': 'Error: {message}',
      'result.errorHint': 'The panel could not reach the host. Check that the plugin row is enabled.',
      'result.emptyHint': 'Pick files on the left, then Check or Standardize.',
      'result.summary': '{presets} language presets loaded · {files} files scanned · {selected} selected',
      'stat.processed': 'Processed',
      'stat.changed': 'Changed',
      'stat.unchanged': 'Unchanged',
      'stat.written': 'Written',
      'stat.reportOnly': 'Report only',
      'stat.styleFindings': 'Style findings',
      'stat.skipped': 'Skipped',
      'stat.failed': 'Failed',
      'result.reportOnlyNote': 'Report-only run: no file was modified. Press Standardize to write these changes.',
      'result.writtenNote': '{count} file(s) standardized on disk.',
      'result.degradedNote': '{count} file(s) fell back to the built-in text rules: the formatter engine was unavailable.',
      'table.changed': 'Changed ({count})',
      'table.unchanged': 'Unchanged ({count})',
      'table.failed': 'Failed ({count})',
      'findings.title': 'Style findings — reported, never auto-applied ({count})',
      'findings.more': '… {count} more',
      'skipped.title': 'Skipped ({count})',
      'skipped.outsideP0': '{path} — outside P0 ({language})',
      'skipped.outsideP0Label': 'outside P0',
      'error.network': 'Cannot reach the host; check that dsh is running and retry.',
      'skipped.reason': '{path} — {reason}',
      'table.file': 'File',
      'table.language': 'Language',
      'table.preset': 'Preset',
      'table.engine': 'Engine',
      'table.depth': 'Depth',
      'table.findings': 'Findings',
      'table.status': 'Status',
      'table.lineUnchanged': 'line count unchanged',
      'status.changed': 'changed',
      'status.unchanged': 'unchanged',
      'status.failed': 'failed',
      'status.skipped': 'skipped',
      'reason.notIdempotent': 'not-idempotent',
      'reason.pathEscape': 'path-escape',
      'reason.unreadable': 'unreadable',
      'reason.engineError': 'engine-error',
      'reason.binaryContent': 'binary-content',
      'reason.unwritable': 'unwritable',
      'legend.languages': 'Languages with a preset',
      'legend.engines': 'Formatter engines',
      'legend.engineReady': '{engine}: ready',
      'legend.engineMissing': '{engine}: missing (text rules)',
      'legend.note': 'Files outside the ten P0 languages are listed with a skip badge and are never modified. A missing engine degrades that language to whitespace-level rules, shown as depth "text" in the result.',
      'limits.line': 'Limits: {files} files / {bytes} per file',
      'limits.help': 'Edit maxFiles / maxBytes on the code-pipeline row in the profile cordis.patch.yml; the host reloads on save.',
      'status.root': 'Root: {root}',      'banner.truncated': 'The file limit ({limit}) was reached, so the tree is truncated. Raise maxFiles in the plugin configuration to see more.',
      'banner.config-clamped': 'Configuration {field} was out of range and was clamped to {to}.',
      'banner.config-invalid': 'Configuration {field} was invalid and fell back to {to}.',
      'banner.more': '… {count} more',
      'table.deltaLines': 'Δ lines',
      'table.deltaBytes': 'Δ bytes',
      'result.linesUnchanged': '{count} file(s) kept the same line count but their content changed; fix has no undo, review with git diff.',
      'result.noUndo': 'Fix has no undo: {count} file(s) were written; review with git diff.',
      'skipped.summary': 'Skipped {count} file(s): {reasons}',
      'result.findingsTruncated': 'The findings list is truncated to the first {cap} entries; per-file counts show the full totals.',
      'result.showAll': 'Show all ({count})',
      'result.showLess': 'Collapse',
      'result.onlyFailed': 'Failed only',
      'result.rowLimit': 'Showing the first {shown} of {total}.',
      'error.unauthorized': 'Authentication required: reload the page and retry.',
      'error.forbidden': 'The host trust fence refused this request.',
      'error.guard-unavailable': 'The host security service is unavailable, so the request was refused.',
      'error.no-workspace': 'No workspace is available. Register one in the host first.',
      'error.root-not-registered': 'That workspace is not registered; reload and pick it again.',
      'error.root-required': 'A workspace path is required.',
      'error.internal': 'Internal plugin error; check the host log.',
      'error.bad-json': 'The request body is not valid JSON.',
      'error.body-too-large': 'The request body exceeds the size limit.',
      'error.retry': 'Retry',
      'error.notFound': 'The host has no such endpoint (plugin disabled or version mismatch); reload the page.',
      'error.apiVersion': 'The plugin client and host versions differ; reload the page.',
      'reason.skippedDirectory': 'dependency/build directory, skipped',
      'reason.ignored': 'excluded by ignore rules',
      'reason.generatedMinified': 'generated/minified file, skipped',
      'reason.tooLarge': 'larger than the per-file limit, skipped',
      'reason.nonUtf8': 'not UTF-8; left untouched',
      'reason.notCode': 'not a code file',
      'reason.missingPreset': 'preset missing',
      'reason.changedSinceRead': 'file changed after read; not written',
    }

    // Bound to the Client locale service in apply(); reads the active locale at
    // call time, so re-renders after a locale switch pick up the new copy.
    let t = (key) => key
    const reasonKey = {
      'not-idempotent': 'reason.notIdempotent',
      'path-escape': 'reason.pathEscape',
      'unreadable': 'reason.unreadable',
      'engine-error': 'reason.engineError',
      'binary-content': 'reason.binaryContent',
      'unwritable': 'reason.unwritable',
      'skipped-directory': 'reason.skippedDirectory',
      'ignored': 'reason.ignored',
      'generated-minified': 'reason.generatedMinified',
      'too-large': 'reason.tooLarge',
      'non-utf8': 'reason.nonUtf8',
      'not-code': 'reason.notCode',
      'missing-preset': 'reason.missingPreset',
      'changed-since-read': 'reason.changedSinceRead',
    }
    function reasonText(reason) {
      const key = reasonKey[reason]
      return key ? t(key) : reason
    }
    function statusText(status) {
      const key = `status.${status}`
      const text = t(key)
      return text === key ? status : text
    }
    function errorText(code) {
      const key = `error.${code}`
      const text = t(key)
      return text === key ? code : text
    }
    function formatBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '—'
      if (value >= 1024 * 1024) return `${Math.round((value / (1024 * 1024)) * 10) / 10} MiB`
      if (value >= 1024) return `${Math.round(value / 1024)} KiB`
      return `${value} B`
    }

    /** Rows rendered per result table before the "show all" control appears. */
    const ROW_LIMIT = 200

    /** A changed file whose line count stayed put is easy to read as "unchanged". */
    function isSuspiciousChange(row) {
      return row.status === 'changed' && (row.deltaLines ?? 0) === 0 && Math.abs(row.deltaBytes ?? 0) >= 1024
    }
    const CLIENT_API_VERSION = 1

    function shortenPath(path) {
      const value = String(path)
      return value.length > 52 ? '…' + value.slice(-51) : value
    }

    function skippedSummary(items) {
      const counts = new Map()
      for (const item of items) {
        const key = item.reason === 'outside-p0' ? 'skipped.outsideP0Label' : reasonText(item.reason)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      return [...counts.entries()].map(([label, count]) => `${label} ×${count}`).join(' · ')
    }

    // ------------------------------------------------------------ styles

    const S = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-base)',
        fontSize: 13,
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        flexWrap: 'wrap',
      },
      title: { fontSize: 14, fontWeight: 600, marginRight: 4 },
      spacer: { flex: 1 },
      button: {
        font: 'inherit',
        fontSize: 12,
        padding: '5px 10px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
      },
      primaryButton: {
        font: 'inherit',
        fontSize: 12,
        padding: '5px 10px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
        // bg-base is the inverse surface (dark on light brand in dark mode,
        // white on blue brand in light mode): readable in both themes without
        // relying on tokens this host does not export.
        color: 'var(--dsw-alias-bg-base)',
        cursor: 'pointer',
      },
      select: {
        font: 'inherit',
        fontSize: 12,
        padding: '4px 6px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        maxWidth: 360,
      },
      statusBar: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '4px 14px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        fontSize: 11,
        color: 'var(--dsw-alias-label-secondary)',
        flexWrap: 'wrap',
      },
      banner: {
        display: 'flex',
        gap: 12,
        padding: '6px 14px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: 11,
        color: 'var(--dsw-alias-state-warn-primary)',
        flexWrap: 'wrap',
      },
      warnText: { color: 'var(--dsw-alias-state-warn-primary)' },
      body: { display: 'flex', flex: 1, minHeight: 0 },
      treePane: {
        width: '46%',
        minWidth: 260,
        overflow: 'auto',
        borderRight: '1px solid var(--dsw-alias-border-l1)',
        padding: '8px 6px',
      },
      resultPane: { flex: 1, overflow: 'auto', padding: '10px 14px', minWidth: 0 },
      row: { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', borderRadius: 4 },
      caret: {
        width: 14,
        textAlign: 'center',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        userSelect: 'none',
        flex: 'none',
      },
      name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      badge: {
        fontSize: 10,
        padding: '1px 5px',
        borderRadius: 4,
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        flex: 'none',
      },
      badgeWarn: {
        fontSize: 10,
        padding: '1px 5px',
        borderRadius: 4,
        border: '1px solid var(--dsw-alias-state-warn-primary)',
        color: 'var(--dsw-alias-state-warn-primary)',
        flex: 'none',
      },
      muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, whiteSpace: 'pre-wrap' },
      success: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12 },
      statGrid: { display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0 14px' },
      stat: { display: 'flex', flexDirection: 'column', gap: 2 },
      statValue: { fontSize: 18, fontWeight: 600 },
      statLabel: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
      th: {
        textAlign: 'left',
        padding: '4px 6px',
        borderBottom: '1px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontWeight: 500,
      },
      td: { padding: '4px 6px', borderBottom: '1px solid var(--dsw-alias-border-l1)' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 11 },
      sectionTitle: { fontSize: 12, fontWeight: 600, margin: '14px 0 6px' },
      empty: { padding: 24, textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
    }

    const LANGUAGE_COLORS = {
      go: '#00add8',
      typescript: '#3178c6',
      javascript: '#f1e05a',
      python: '#3572a5',
      html: '#e34c26',
      makefile: '#427819',
      css: '#563d7c',
      cpp: '#f34b7d',
      shell: '#89e051',
      powershell: '#012456',
    }

    // ------------------------------------------------------------ helpers

    function collectSelectable(nodes, out = []) {
      for (const node of nodes ?? []) {
        if (node.type === 'dir') collectSelectable(node.children, out)
        else if (node.supported) out.push(node.path)
      }
      return out
    }

    function collectDirFiles(node, out = []) {
      if (!node) return out
      if (node.type === 'file') {
        if (node.supported) out.push(node.path)
        return out
      }
      for (const child of node.children ?? []) collectDirFiles(child, out)
      return out
    }

    async function getJson(url, options) {
      const response = await fetch(url, options)
      const text = await response.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        throw new Error(`Unexpected response from ${url}`)
      }
      if (!response.ok) {
        const error = data && data.error
        const code = typeof error === 'string' ? error : error && typeof error.code === 'string' ? error.code : null
        if (code !== null) throw new Error(code)
        if (response.status === 404) throw new Error('notFound')
        throw new Error(`HTTP ${response.status}`)
      }
      return data
    }

    // ------------------------------------------------------------ tree row

    function FileRow(props) {
      const { node, depth, selected, onToggleFile } = props
      const checked = selected.has(node.path)
      const unsupported = !node.supported
      const badge = unsupported
        ? h('span', { style: S.badgeWarn, title: node.reason ? reasonText(node.reason) : '' }, node.display ? t('file.skippedWith', { language: node.display }) : t('file.skipped'))
        : h(
            'span',
            {
              style: {
                ...S.badge,
                borderColor: LANGUAGE_COLORS[node.language] ?? 'var(--dsw-alias-border-l1)',
                color: LANGUAGE_COLORS[node.language] ?? 'var(--dsw-alias-label-secondary)',
              },
            },
            node.language,
          )

      return h(
        'label',
        {
          style: {
            ...S.row,
            paddingLeft: 4 + depth * 14,
            opacity: unsupported ? 0.6 : 1,
            cursor: unsupported ? 'not-allowed' : 'pointer',
          },
          title: unsupported ? t('file.unsupportedTitle', { path: node.path }) : node.path,
        },
        h('span', { style: S.caret }),
        h('input', {
          type: 'checkbox',
          checked,
          disabled: unsupported,
          onChange: () => onToggleFile(node.path),
        }),
        h('span', { style: S.name }, node.name),
        badge,
      )
    }

    function DirRow(props) {
      const { node, depth, expanded, onToggleDir, selected, onToggleMany } = props
      const children = node.children ?? []
      const files = collectDirFiles(node)
      const selectedCount = files.filter((path) => selected.has(path)).length
      const allChecked = files.length > 0 && selectedCount === files.length
      const someChecked = selectedCount > 0 && !allChecked
      const isOpen = expanded.has(node.path)

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { style: { ...S.row, paddingLeft: 4 + depth * 14 } },
          h(
            'span',
            {
              style: S.caret,
              onClick: () => onToggleDir(node.path),
              role: 'button',
              tabIndex: 0,
              'aria-expanded': isOpen,
              'aria-label': isOpen ? t('dir.collapse') : t('dir.expand'),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onToggleDir(node.path)
                }
              },
            },
            isOpen ? '▾' : '▸',
          ),
          h('input', {
            type: 'checkbox',
            checked: allChecked,
            disabled: files.length === 0,
            ref: (element) => {
              if (element) element.indeterminate = someChecked
            },
            onChange: () => onToggleMany(files, !allChecked),
            title: t('dir.selectedOfTotal', { selected: selectedCount, total: files.length }),
            'aria-label': t('dir.selectedOfTotal', { selected: selectedCount, total: files.length }),
          }),
          h(
            'span',
            { style: { ...S.name, fontWeight: 500, cursor: 'pointer' }, onClick: () => onToggleDir(node.path) },
            `${node.name}/`,
          ),
          h('span', { style: S.muted }, `${files.length}`),
        ),
        isOpen ? children.map((child) => renderNode(child, depth + 1, props)) : null,
      )
    }

    function renderNode(node, depth, props) {
      // Spread the shared tree props FIRST: a nested row's render props carry the
      // parent's `node`/`depth`, so writing them last would hand every child its
      // ancestor back and make the render tree grow without bound.
      if (node.type === 'dir') return h(DirRow, { ...props, key: node.path, node, depth })
      return h(FileRow, { ...props, key: node.path, node, depth })
    }

    // ------------------------------------------------------------ page

    function PipelinePage(props) {
      const [state, setState] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [root, setRoot] = useState(null)
      const [expanded, setExpanded] = useState(() => new Set())
      const [selected, setSelected] = useState(() => new Set())
      const [result, setResult] = useState(null)
      const [running, setRunning] = useState(null)
      const loadSeq = useRef(0)
      const loadAbort = useRef(null)
      const runSeq = useRef(0)
      const runAbort = useRef(null)

      const load = useCallback(
        async (nextRoot) => {
          loadAbort.current?.abort()
          const controller = typeof AbortController === 'function' ? new AbortController() : null
          loadAbort.current = controller
          const seq = ++loadSeq.current
          setLoading(true)
          setError(null)
          // A new root invalidates every choice made against the previous tree:
          // keeping stale selected paths would let Check/Standardize write the
          // old relative paths into the newly selected workspace.
          setSelected(new Set())
          setResult(null)
          setExpanded(new Set())
          try {
            const query = nextRoot ? `?root=${encodeURIComponent(nextRoot)}` : ''
            const data = await getJson(`${API}/state${query}`, controller ? { signal: controller.signal } : undefined)
            if (seq !== loadSeq.current) return
            if (data?.apiVersion !== undefined && data.apiVersion > CLIENT_API_VERSION) {
              setError('apiVersion')
              return
            }
            setState(data)
            setRoot(data.root ?? null)
            if (data?.error) setError(data.error.code ?? String(data.error))
            const initial = new Set()
            for (const node of data.tree ?? []) {
              if (node.type === 'dir') initial.add(node.path)
            }
            setExpanded(initial)
          } catch (cause) {
            if (seq !== loadSeq.current) return
            if (cause?.name === 'AbortError') return
            if (cause instanceof TypeError) {
              setError('network')
              return
            }
            setError(cause instanceof Error ? cause.message : String(cause))
          } finally {
            if (seq === loadSeq.current) setLoading(false)
          }
        },
        [],
      )

      useEffect(() => {
        load()
        return () => {
          loadAbort.current?.abort()
          runAbort.current?.abort()
          loadSeq.current += 1
          runSeq.current += 1
        }
      }, [load])

      const tree = state?.tree ?? []
      const allSelectable = useMemo(() => collectSelectable(tree), [tree])
      const selectedCount = selected.size
      const selectedList = useMemo(() => [...selected], [selected])

      const toggleDir = useCallback((path) => {
        setExpanded((previous) => {
          const next = new Set(previous)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      }, [])

      const toggleFile = useCallback((path) => {
        setSelected((previous) => {
          const next = new Set(previous)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      }, [])

      const toggleMany = useCallback((paths, on) => {
        setSelected((previous) => {
          const next = new Set(previous)
          for (const path of paths) {
            if (on) next.add(path)
            else next.delete(path)
          }
          return next
        })
      }, [])

      const selectAll = useCallback(() => {
        setSelected(new Set(allSelectable))
      }, [allSelectable])

      const clearAll = useCallback(() => setSelected(new Set()), [])

      const run = useCallback(
        async (mode) => {
          if (selectedList.length === 0 || loading || running !== null) return
          runAbort.current?.abort()
          const controller = typeof AbortController === 'function' ? new AbortController() : null
          runAbort.current = controller
          const seq = ++runSeq.current
          setRunning(mode)
          setError(null)
          try {
            const data = await getJson(`${API}/standardize`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ root, paths: selectedList, mode }),
              signal: controller ? controller.signal : undefined,
            })
            if (seq !== runSeq.current) return
            setResult(data)
          } catch (cause) {
            if (seq !== runSeq.current) return
            if (cause?.name === 'AbortError') return
            setError(cause instanceof Error ? cause.message : String(cause))
          } finally {
            if (seq === runSeq.current) setRunning(null)
          }
        },
        [root, selectedList, loading, running],
      )

      const treeProps = { expanded, selected, onToggleDir: toggleDir, onToggleFile: toggleFile, onToggleMany: toggleMany }

      return h(
        'div',
        { style: S.page },
        h(
          'div',
          { style: S.header },
          h('span', { style: S.title }, t('panel.name')),
          (state?.roots ?? []).length > 1
            ? h(
                'select',
                {
                  style: S.select,
                  value: root ?? '',
                  onChange: (event) => load(event.target.value),
                  disabled: running !== null,
                },
                state.roots.map((candidate) => h('option', { key: candidate.path, value: candidate.path }, candidate.title)),
              )
            : h('span', { style: S.muted }, root ?? t('header.noWorkspace')),
          h('span', { style: S.spacer }),
          h('span', { style: S.muted }, t('header.selected', { selected: selectedCount, total: allSelectable.length })),
          h('button', { style: S.button, onClick: selectAll, disabled: loading || running !== null || allSelectable.length === 0 }, t('button.selectAll')),
          h('button', { style: S.button, onClick: clearAll, disabled: loading || running !== null || selectedCount === 0 }, t('button.clear')),
          h(
            'button',
            {
              style: S.button,
              onClick: () => run('report'),
              disabled: loading || selectedCount === 0 || running !== null,
            },
            running === 'report' ? t('button.checking') : t('button.check'),
          ),
          h(
            'button',
            {
              style: S.primaryButton,
              onClick: () => run('fix'),
              disabled: loading || selectedCount === 0 || running !== null,
            },
            running === 'fix' ? t('button.applying') : t('button.standardize'),
          ),
        ),
        h(
          'div',
          { style: S.statusBar },
          state?.root ? h('span', { title: state.root }, t('status.root', { root: shortenPath(state.root) })) : null,
          h('span', { title: t('limits.help') }, `${t('limits.line', { files: state?.limits?.maxFiles ?? '—', bytes: formatBytes(state?.limits?.maxBytes) })} · ${t('limits.help')}`),
          state?.truncated ? h('span', { style: S.warnText }, t('banner.truncated', { limit: state?.limits?.maxFiles ?? '—' })) : null,
        ),
        (state?.warnings ?? []).length > 0
          ? h(
              'div',
              { style: S.banner },
              state.warnings.slice(0, 2).map((warning, index) =>
                h(
                  'span',
                  { key: `${warning.code}:${warning.field}:${index}` },
                  t(`banner.${warning.code}`, { field: warning.field, to: warning.field === 'maxBytes' ? formatBytes(warning.to) : warning.to }),
                ),
              ),
              state.warnings.length > 2 ? h('span', null, t('banner.more', { count: state.warnings.length - 2 })) : null,
            )
          : null,
        h(
          'div',
          { style: S.body },
          h(
            'div',
            { style: S.treePane },
            loading
              ? h('div', { style: S.empty }, t('tree.scanning'))
              : tree.length === 0
                ? h('div', { style: S.empty }, error ? t('tree.workspaceUnavailable') : t('tree.noFiles'))
                : tree.map((node) => renderNode(node, 0, treeProps)),
          ),
          h('div', { style: S.resultPane }, h(ResultView, { result, error, state, selectedCount, presetCount: state?.presets?.length ?? 0, onRetry: () => load(root ?? undefined) })),
        ),
      )
    }

    function ResultView({ result, error, state, selectedCount, presetCount, onRetry }) {
      // Hooks stay unconditional: the error/empty branches below are returns.
      const [showAll, setShowAll] = useState({})
      const [failedOnly, setFailedOnly] = useState(false)
      useEffect(() => {
        setFailedOnly(false)
        setShowAll({})
      }, [result])

      if (error) {
        const known = errorText(error) !== error
        return h(
          'div',
          null,
          h('div', { style: S.error }, t('result.error', { message: errorText(error) })),
          known ? null : h('div', { style: { ...S.muted, marginTop: 8 } }, t('result.errorHint')),
          h('button', { style: { ...S.button, marginTop: 10 }, onClick: onRetry }, t('error.retry')),
        )
      }
      if (!result) {
        return h(
          'div',
          null,
          h('div', { style: S.empty }, t('result.emptyHint')),
          h(
            'div',
            { style: { ...S.muted, marginTop: 4 } },
            t('result.summary', { presets: presetCount, files: state?.fileCount ?? state?.files?.length ?? 0, selected: selectedCount }),
          ),
          h(Legend, { state }),
        )
      }

      const { stats } = result
      const files = result.files ?? []
      const failed = files.filter((file) => file.status === 'failed')
      const changed = files
        .filter((file) => file.status === 'changed')
        .sort((left, right) => Math.abs(right.deltaBytes ?? 0) - Math.abs(left.deltaBytes ?? 0))
      const unchanged = files.filter((file) => file.status === 'unchanged')
      const findings = files.flatMap((file) => (file.findings ?? []).map((finding) => ({ path: file.path, ...finding })))
      const suspicious = changed.filter(isSuspiciousChange)
      const effectiveFailedOnly = failedOnly && failed.length > 0

      const section = (key, rows, titleKey) => {
        if (rows.length === 0) return null
        const visible = showAll[key] ? rows : rows.slice(0, ROW_LIMIT)
        return h(
          'div',
          { key },
          h('div', { style: S.sectionTitle }, t(titleKey, { count: rows.length })),
          h(FileTable, { rows: visible }),
          rows.length > ROW_LIMIT
            ? h(
                'div',
                { style: { ...S.muted, marginTop: 4 } },
                showAll[key] ? null : t('result.rowLimit', { shown: visible.length, total: rows.length }),
                h(
                  'button',
                  { style: { ...S.button, marginLeft: 8 }, onClick: () => setShowAll({ ...showAll, [key]: !showAll[key] }) },
                  showAll[key] ? t('result.showLess') : t('result.showAll', { count: rows.length }),
                ),
              )
            : null,
        )
      }

      return h(
        'div',
        null,
        h(
          'div',
          { style: S.statGrid },
          [
            ['stat.processed', stats.processed],
            ['stat.changed', stats.changed],
            ['stat.unchanged', stats.unchanged],
            [result.mode === 'fix' ? 'stat.written' : 'stat.reportOnly', result.mode === 'fix' ? stats.written : stats.changed],
            ['stat.styleFindings', stats.lintFindings ?? 0],
            ['stat.skipped', stats.skipped],
            ['stat.failed', stats.failed],
          ].map(([key, value]) =>
            h('div', { key, style: S.stat }, h('span', { style: S.statValue }, String(value)), h('span', { style: S.statLabel }, t(key))),
          ),
        ),
        result.mode === 'report' && stats.changed > 0
          ? h('div', { style: S.muted }, t('result.reportOnlyNote'))
          : null,
        result.mode === 'fix' && stats.written > 0
          ? h('div', { style: S.success }, t('result.noUndo', { count: stats.written }))
          : null,
        stats.degraded > 0
          ? h('div', { style: { ...S.muted, marginTop: 6 } }, t('result.degradedNote', { count: stats.degraded }))
          : null,
        suspicious.length > 0
          ? h('div', { style: { ...S.warnText, marginTop: 6 } }, t('result.linesUnchanged', { count: suspicious.length }))
          : null,
        failed.length > 0
          ? h(
              'button',
              { style: { ...S.button, marginTop: 10 }, onClick: () => setFailedOnly((value) => !value) },
              t('result.onlyFailed'),
            )
          : null,
        effectiveFailedOnly ? null : section('changed', changed, 'table.changed'),
        effectiveFailedOnly ? null : section('unchanged', unchanged, 'table.unchanged'),
        section('failed', failed, 'table.failed'),
        findings.length > 0 && !effectiveFailedOnly ? h('div', { style: S.sectionTitle }, t('findings.title', { count: findings.length })) : null,
        findings.length > 0 && !effectiveFailedOnly && result.findingsTruncated
          ? h('div', { style: S.muted }, t('result.findingsTruncated', { cap: 40 }))
          : null,
        findings.length > 0 && !effectiveFailedOnly
          ? h(
              'ul',
              { style: { margin: 0, paddingLeft: 18, ...S.mono, lineHeight: 1.7 } },
              findings.slice(0, 40).map((finding, index) =>
                h(
                  'li',
                  { key: `${finding.path}:${finding.line}:${index}`, style: { color: finding.severity === 'error' ? 'var(--dsw-alias-state-error-primary)' : undefined } },
                  `${finding.path}:${finding.line}  ${finding.rule}  ${finding.message}`,
                ),
              ),
              findings.length > 40 ? h('li', { style: S.muted }, t('findings.more', { count: findings.length - 40 })) : null,
            )
          : null,
        result.skipped?.length > 0
          ? h(
              'div',
              { style: { ...S.muted, marginTop: 6 } },
              t('skipped.summary', { count: result.skipped.length, reasons: skippedSummary(result.skipped) }),
            )
          : null,
        result.skipped?.length > 0 ? h('div', { style: S.sectionTitle }, t('skipped.title', { count: result.skipped.length })) : null,
        result.skipped?.length > 0
          ? h(
              'ul',
              { style: { margin: 0, paddingLeft: 18, ...S.mono } },
              result.skipped.slice(0, ROW_LIMIT).map((item) =>
                h(
                  'li',
                  { key: item.path },
                  item.reason === 'outside-p0'
                    ? t('skipped.outsideP0', { path: item.path, language: item.display ?? 'unknown' })
                    : t('skipped.reason', { path: item.path, reason: reasonText(item.reason) }),
                ),
              ),
              result.skipped.length > ROW_LIMIT
                ? h('li', { style: S.muted }, t('result.rowLimit', { shown: ROW_LIMIT, total: result.skipped.length }))
                : null,
            )
          : null,
      )
    }

    function FileTable({ rows }) {
      return h(
        'table',
        { style: S.table },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { style: S.th }, t('table.file')),
            h('th', { style: S.th }, t('table.language')),
            h('th', { style: S.th }, t('table.preset')),
            h('th', { style: S.th }, t('table.engine')),
            h('th', { style: S.th }, t('table.depth')),
            h('th', { style: S.th }, t('table.findings')),
            h('th', { style: S.th }, t('table.deltaLines')),
            h('th', { style: S.th }, t('table.deltaBytes')),
            h('th', { style: S.th }, t('table.status')),
          ),
        ),
        h(
          'tbody',
          null,
          rows.map((row) => {
            const suspicious = isSuspiciousChange(row)
            const deltaLines = Number(row.deltaLines ?? 0)
            const deltaBytes = Number(row.deltaBytes ?? 0)
            return h(
              'tr',
              { key: row.path },
              h('td', { style: { ...S.td, ...S.mono } }, row.path),
              h('td', { style: S.td }, row.language ?? '—'),
              h('td', { style: S.td }, row.preset ?? '—'),
              h('td', { style: S.td }, row.engine ?? '—'),
              h('td', { style: S.td }, row.depth ?? '—'),
              h('td', { style: S.td }, String(row.findingCount ?? 0)),
              h('td', { style: S.td }, row.status === 'changed' ? `${deltaLines >= 0 ? '+' : ''}${deltaLines}` : '—'),
              h('td', { style: S.td }, row.status === 'changed' ? `${deltaBytes >= 0 ? '+' : ''}${deltaBytes}` : '—'),
              h(
                'td',
                { style: { ...S.td, color: row.status === 'failed' ? 'var(--dsw-alias-state-error-primary)' : undefined } },
                `${row.reason ? reasonText(row.reason) : statusText(row.status)}${row.status === 'changed' && (row.deltaLines ?? 0) === 0 ? ' · ' + t('table.lineUnchanged') : ''}${suspicious ? ' ⚠' : ''}`,
              ),
            )
          }),
        ),
      )
    }

    function Legend({ state }) {
      const engines = state?.engines ?? {}
      const p0 = state?.p0 ?? []
      return h(
        'div',
        { style: { marginTop: 18 } },
        h('div', { style: S.sectionTitle }, t('legend.languages')),
        h(
          'div',
          { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          p0.map((language) => h('span', { key: language.id, style: S.badge }, language.label)),
        ),
        h('div', { style: S.sectionTitle }, t('legend.engines')),
        h(
          'div',
          { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          Object.entries(engines).map(([id, present]) =>
            h(
              'span',
              { key: id, style: present ? S.badge : S.badgeWarn },
              present ? t('legend.engineReady', { engine: id }) : t('legend.engineMissing', { engine: id }),
            ),
          ),
        ),
        h(
          'div',
          { style: { ...S.muted, marginTop: 10, lineHeight: 1.6 } },
          t('legend.note'),
        ),
      )
    }

    // ------------------------------------------------------------ icon

    function PanelIcon() {
      return h(
        'svg',
        { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
        h('path', { d: 'M14 4v5h5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
        h('path', { d: 'M8 13h8M8 17h5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    // ------------------------------------------------------------ apply

    return {
      inject: ['slots', 'layout', 'locale'],
      apply(ctx) {
        const slots = ctx && ctx.slots
        if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return undefined

        // Chinese is the primary language; English keeps the old strings and the
        // English name (Code pipeline). Copy follows the active GUI locale.
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'code-pipeline: dictionaries')
        t = ctx.locale.bind(NS)

        const disposers = []

        disposers.push(
          slots.inject('sidebar.panellist', () =>
            slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 40,
                locale: NS,
                label: () => t('panel.name'),
              },
              PanelIcon,
            ),
          ),
        )

        disposers.push(
          slots.inject('main', function* () {
            yield slots.register(
              {
                name: 'main',
                key: PANEL_ID,
                locale: NS,
              },
              PipelinePage,
            )
          }),
        )

        return () => {
          for (const dispose of disposers) {
            try {
              if (typeof dispose === 'function') dispose()
            } catch {
              // Presentation-only cleanup.
            }
          }
        }
      },
    }
  },
})
