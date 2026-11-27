/**
 * 记忆库页面：研发工作台的「记忆库」标页。
 *
 * 数据来自 /dsh-rd-memory/api/{list,entry,stats}（只读）。面板只做三件事：搜索筛选、
 * 看详情、复制正文。写入仍然由模型在会话里用 memory_save 完成。
 */

window.__ModuleLoader__.load({
  id: '@local/rd-memory-page',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'rdMemory'
    const PANEL_ID = 'rd-memory'
    const API = '/dsh-rd-memory/api'

    const STRINGS = {
      zh: {
        panelName: '记忆库',
        subtitle: '技术模板、踩坑、bug 修复方案、策略模式：跨会话复用的长期记忆。',
        search: '搜索标题、标签或正文',
        all: '全部',
        types: ['技术模板', '踩坑', 'bug 修复', '策略'],
        typeNames: { template: '技术模板', pitfall: '踩坑', fix: 'bug 修复', strategy: '策略' },
        total: '共 {total} 条',
        loading: '正在读取记忆库…',
        empty: '还没有记忆。让模型在任务里用 memory_save 记下可复用的做法。',
        emptyFiltered: '这个条件下没有条目。',
        failed: '读取失败：{message}',
        unauthorized: '未通过本机信任校验，请从侧栏打开面板。',
        copy: '复制正文',
        copied: '已复制',
        copyFailed: '复制失败，可手动选中',
        hits: '被检索 {hits} 次',
        updated: '更新于 {time}',
        detailHint: '左侧选一条查看全文',
        capacityWarn: '记忆库已用 {total}/{limit}，接近上限；再写入会按命中与时间淘汰旧条目。',
        unusedHint: '其中 {count} 条从未被检索过：{titles}',
        unusedMore: '等',
        close: '关闭',
        remove: '删除',
        removeConfirm: '再点一次确认删除',
        removed: '已删除',
        removeFailed: '删除失败：{message}',
      },
      en: {
        panelName: 'Memory',
        subtitle:
          'Technique templates, pitfalls, bug-fix recipes, and strategy patterns reused across sessions.',
        search: 'Search title, tags, or body',
        all: 'All',
        types: ['Templates', 'Pitfalls', 'Fixes', 'Strategies'],
        typeNames: { template: 'Template', pitfall: 'Pitfall', fix: 'Fix', strategy: 'Strategy' },
        total: '{total} entries',
        loading: 'Reading the memory store…',
        empty: 'No memory yet. Ask the model to record reusable findings with memory_save.',
        emptyFiltered: 'Nothing matches this filter.',
        failed: 'Could not read the memory store: {message}',
        unauthorized: 'Local trust check failed; open the panel from the sidebar.',
        copy: 'Copy body',
        copied: 'Copied',
        copyFailed: 'Copy failed; select the text manually',
        hits: 'Retrieved {hits} times',
        updated: 'Updated {time}',
        detailHint: 'Pick an entry on the left',
        capacityWarn: 'Memory store at {total}/{limit}; further writes evict older entries by hits and recency.',
        unusedHint: '{count} entries were never retrieved: {titles}',
        unusedMore: 'and more',
        close: 'Close',
        remove: 'Delete',
        removeConfirm: 'Click again to confirm',
        removed: 'Deleted',
        removeFailed: 'Delete failed: {message}',
      },
    }

    const TYPE_ORDER = ['', 'template', 'pitfall', 'fix', 'strategy']

    const ui = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--dsw-alias-bg-base)',
      },
      bar: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '12px 20px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        flexWrap: 'wrap',
      },
      input: {
        flex: 1,
        minWidth: 180,
        font: 'inherit',
        fontSize: 13,
        padding: '6px 10px',
        borderRadius: 8,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
      },
      chip: {
        font: 'inherit',
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 999,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
      },
      chipActive: {
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontWeight: 600,
      },
      count: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      body: {
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(min(240px, 100%), 34%) 1fr',
        gap: 0,
      },
      list: {
        margin: 0,
        padding: 0,
        listStyle: 'none',
        overflow: 'auto',
        borderRight: '1px solid var(--dsw-alias-border-l1)',
      },
      item: {
        padding: '10px 16px',
        borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      },
      itemActive: { background: 'var(--dsw-alias-bg-layer-2)' },
      itemCursor: { outline: '2px solid var(--dsw-alias-state-focus-primary, var(--dsw-alias-border-l2))', outlineOffset: -2 },
      itemTitle: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' },
      meta: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' },
      detail: {
        padding: '16px 20px',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
      pre: {
        margin: 0,
        padding: '12px 14px',
        borderRadius: 10,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        lineHeight: '21px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      },
      button: {
        font: 'inherit',
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 6,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        alignSelf: 'flex-start',
      },
      hintLine: {
        margin: '0 20px 4px',
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      warn: {
        margin: '0 20px 8px',
        padding: '8px 12px',
        borderRadius: 8,
        border: '0.5px solid var(--dsw-alias-state-warning-primary)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12,
        lineHeight: '18px',
      },
      empty: { padding: '24px 20px', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' },
    }

    /** 取 JSON；非 2xx 抛错并保留状态码。 */
    async function getJson(path) {
      const response = await fetch(API + path, { headers: { accept: 'application/json' } })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message ?? `HTTP ${response.status}`)
        error.status = response.status
        throw error
      }
      return payload
    }

    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''))
    }

    function MemoryPage({ t }) {
      const translate = typeof t === 'function' ? t : (key) => key
      const [query, setQuery] = React.useState('')
      const [type, setType] = React.useState('')
      const [list, setList] = React.useState({
        status: 'loading',
        entries: [],
        total: 0,
        error: null,
      })
      const [detail, setDetail] = React.useState(null)
      const [capacity, setCapacity] = React.useState(null)
      const [copied, setCopied] = React.useState(null)
      const [confirming, setConfirming] = React.useState(false)
      const [removeState, setRemoveState] = React.useState(null)
      // 键盘光标：与「已打开的条目」分开，上下键只移动光标。
      const [cursor, setCursor] = React.useState(0)
      const searchRef = React.useRef(null)
      const listRef = React.useRef(null)
      const requestSeq = React.useRef(0)

      const load = React.useCallback(async () => {
        const seq = requestSeq.current + 1
        requestSeq.current = seq
        setList((previous) => ({ ...previous, status: 'loading' }))
        const params = new URLSearchParams()
        if (query.trim() !== '') params.set('q', query.trim())
        if (type !== '') params.set('type', type)
        params.set('limit', '100')
        try {
          const payload = await getJson(`/list?${params.toString()}`)
          if (requestSeq.current !== seq) return
          setList({ status: 'ready', entries: payload.entries, total: payload.total, error: null })
        } catch (error) {
          if (requestSeq.current !== seq) return
          const message =
            error.status === 401 || error.status === 403
              ? translate('unauthorized')
              : fill(translate('failed'), { message: error.message })
          setList({ status: 'error', entries: [], total: 0, error: message })
        }
      }, [query, type, translate])

      React.useEffect(() => {
        void load()
      }, [load])

      // 容量只读一次：接近上限时提示，避免用户无声丢条目。
      React.useEffect(() => {
        let cancelled = false
        const readStats = async () => {
          try {
            const payload = await getJson('/stats')
            if (!cancelled) setCapacity(payload)
          } catch {
            // 读不到就不提示。
          }
        }
        void readStats()
        return () => {
          cancelled = true
        }
      }, [])

      const open = async (id) => {
        setCopied(null)
        setConfirming(false)
        setRemoveState(null)
        try {
          const payload = await getJson(`/entry?id=${encodeURIComponent(id)}`)
          setDetail(payload.entry)
        } catch (error) {
          setDetail({
            title: '…',
            body: fill(translate('failed'), { message: error.message }),
            tags: [],
          })
        }
      }

      const copy = async () => {
        if (detail === null) return
        try {
          await navigator.clipboard.writeText(String(detail.body ?? ''))
          setCopied('ok')
        } catch {
          setCopied('failed')
        }
      }

      /**
       * 列表与详情区的键盘操作：上下移动光标、Enter 打开、Esc 关闭、斜杠聚焦搜索。
       * @param {object} event - 键盘事件
       * @returns {void}
       */
      const onKeyDown = (event) => {
        const entries = list.entries
        if (event.key === 'ArrowDown' && entries.length > 0) {
          event.preventDefault()
          setCursor((previous) => Math.min(entries.length - 1, previous + 1))
          return
        }
        if (event.key === 'ArrowUp' && entries.length > 0) {
          event.preventDefault()
          setCursor((previous) => Math.max(0, previous - 1))
          return
        }
        if (event.key === 'Enter' && entries.length > 0) {
          const target = entries[Math.min(cursor, entries.length - 1)]
          if (target !== undefined) {
            event.preventDefault()
            void open(target.id)
          }
          return
        }
        if (event.key === 'Escape') {
          if (detail !== null) {
            event.preventDefault()
            setDetail(null)
            setConfirming(false)
            setRemoveState(null)
            if (listRef.current !== null && typeof listRef.current.focus === 'function') listRef.current.focus()
          }
          return
        }
        if (event.key === '/' && event.target?.tagName !== 'INPUT') {
          event.preventDefault()
          if (searchRef.current !== null && typeof searchRef.current.focus === 'function') searchRef.current.focus()
        }
      }

      const scrollCursorIntoView = (index) => {
        const node = listRef.current?.children?.[index]
        if (node !== null && node !== undefined && typeof node.scrollIntoView === 'function') {
          node.scrollIntoView({ block: 'nearest' })
        }
      }

      // 光标移动后确保目标可见，键盘浏览长列表时才不会「看不见自己选到哪」。
      React.useEffect(() => {
        scrollCursorIntoView(cursor)
      }, [cursor])

      // 两段式删除：第一次点击只切到确认态，避免误删。
      const remove = async () => {
        if (detail === null) return
        if (!confirming) {
          setConfirming(true)
          return
        }
        setConfirming(false)
        try {
          const response = await fetch(`${API}/forget?id=${encodeURIComponent(detail.id)}`, { method: 'POST' })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok === false) throw new Error(payload.message ?? `HTTP ${response.status}`)
          setRemoveState('ok')
          setDetail(null)
          await load()
        } catch (error) {
          setRemoveState(fill(translate('removeFailed'), { message: error.message }))
        }
      }

      /**
       * 条目样式：已打开的用高亮底，键盘光标用描边，两者可同时存在。
       * @param {number} index - 在列表中的位置
       * @param {string} id - 条目 id
       * @returns {object} 样式
       */
      const itemStyle = (index, id) => {
        const base = detail?.id === id ? { ...ui.item, ...ui.itemActive } : ui.item
        return index === cursor ? { ...base, ...ui.itemCursor } : base
      }

      const typeName = (value) => translate('typeNames')[value] ?? value

      const toolbar = h(
        'div',
        { style: ui.bar },
        h('input', {
          style: ui.input,
          ref: searchRef,
          type: 'search',
          value: query,
          placeholder: translate('search'),
          'aria-label': translate('search'),
          onChange: (event) => setQuery(event.target.value),
        }),
        TYPE_ORDER.map((value) =>
          h(
            'button',
            {
              key: value === '' ? 'all' : value,
              type: 'button',
              style: value === type ? { ...ui.chip, ...ui.chipActive } : ui.chip,
              'aria-pressed': value === type,
              onClick: () => setType(value),
            },
            value === '' ? translate('all') : typeName(value),
          ),
        ),
        h('span', { style: ui.count }, fill(translate('total'), { total: list.total })),
      )

      let body
      if (list.status === 'loading' && list.entries.length === 0) {
        body = h('p', { style: ui.empty }, translate('loading'))
      } else if (list.status === 'error') {
        body = h(
          'p',
          { style: { ...ui.empty, color: 'var(--dsw-alias-state-error-primary)' }, role: 'alert' },
          list.error,
        )
      } else if (list.entries.length === 0) {
        body = h(
          'p',
          { style: ui.empty },
          query.trim() === '' && type === '' ? translate('empty') : translate('emptyFiltered'),
        )
      } else {
        body = h(
          'div',
          { style: ui.body },
          h(
            'ul',
            { style: ui.list, ref: listRef, onKeyDown, tabIndex: -1 },
            list.entries.map((entry) =>
              h(
                'li',
                { key: entry.id },
                h(
                  'div',
                  {
                    style: itemStyle(list.entries.indexOf(entry), entry.id),
                    role: 'button',
                    tabIndex: 0,
                    'aria-current': detail?.id === entry.id ? 'true' : undefined,
                    onClick: () => open(entry.id),
                    onKeyDown,
                  },
                  h('span', { style: ui.itemTitle }, entry.title),
                  h(
                    'span',
                    { style: ui.meta },
                    `${typeName(entry.type)} · ${fill(translate('hits'), { hits: entry.hits ?? 0 })}`,
                  ),
                ),
              ),
            ),
          ),
          h(
            'div',
            { style: ui.detail },
            detail === null
              ? h('p', { style: ui.empty }, translate('detailHint'))
              : h(
                  React.Fragment,
                  null,
                  h('h3', { style: ui.itemTitle }, detail.title),
                  h(
                    'span',
                    { style: ui.meta },
                    `${typeName(detail.type)} · ${String(detail.updatedAt ?? '')}`,
                  ),
                  h('pre', { style: ui.pre }, String(detail.body ?? '')),
                  h(
                    'div',
                    { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                    h(
                      'button',
                      { type: 'button', style: ui.button, onClick: copy },
                      translate('copy'),
                    ),
                    copied === 'ok' ? h('span', { style: ui.meta }, translate('copied')) : null,
                    copied === 'failed'
                      ? h('span', { style: ui.meta }, translate('copyFailed'))
                      : null,
                  ),
                ),
          ),
        )
      }

      return h(
        'div',
        { style: ui.page },
        h(
          'header',
          { style: { padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', gap: 4 } },
          h(
            'h2',
            {
              style: {
                margin: 0,
                fontSize: 15,
                lineHeight: '22px',
                color: 'var(--dsw-alias-label-primary)',
              },
            },
            translate('panelName'),
          ),
          h(
            'p',
            {
              style: {
                margin: 0,
                fontSize: 12,
                lineHeight: '18px',
                color: 'var(--dsw-alias-label-secondary)',
              },
            },
            translate('subtitle'),
          ),
        ),
        capacity !== null && typeof capacity.unused === 'number' && capacity.unused > 0
          ? h(
              'p',
              { style: ui.hintLine, role: 'status' },
              fill(translate('unusedHint'), {
                count: capacity.unused,
                titles: [
                  ...(Array.isArray(capacity.hitless) ? capacity.hitless.map((entry) => entry.title) : []),
                  capacity.unused > 5 ? translate('unusedMore') : null,
                ]
                  .filter((item) => item !== null && item !== '')
                  .join('、'),
              }),
            )
          : null,
        capacity !== null && typeof capacity.usage === 'number' && capacity.usage >= 0.8
          ? h(
              'p',
              { style: ui.warn, role: 'status' },
              fill(translate('capacityWarn'), { total: capacity.total, limit: capacity.limit }),
            )
          : null,
        toolbar,
        body,
      )
    }

    const pages = []

    return {
      inject: ['slots', 'locale'],
      pages,
      apply(ctx) {
        const slots = ctx && ctx.slots
        if (!slots || typeof slots.inject !== 'function') return undefined
        ctx.effect(() => ctx.locale.register(NS, STRINGS), 'memory-page: dictionaries')
        pages.push({ id: PANEL_ID, labelKey: 'panelName', locale: NS, component: MemoryPage })
      },
    }
  },
})
