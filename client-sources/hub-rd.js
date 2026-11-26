/**
 * 研发工作台 — 唯一侧栏入口与主区页（合并客户端的一个 surface）。
 *
 * 页面内是标签页：概览（说明研发模式怎么工作、与其他模式的区别）+ 完全迁移进来的
 * 成员页面（代码修正）。旧插件的独立侧栏图标与独立主区页已不再注册。
 */
window.__ModuleLoader__.load({
  id: '@local/rd-hub',
  factory(require, pageSources) {
    const React = require('react')
    const h = React.createElement
    const NS = 'rdHub'
    const PANEL_ID = 'rd-hub'

    const STRINGS = {
      zh: {
        panelName: '研发工作台',
        subtitle: '一个模式覆盖完整研发流程：分级 → 侦察 → 实现 → 验证 → 独立验收 → 交付',
        overviewTab: '概览',
        howTitle: '它是怎么工作的',
        tierTitle: '任务分级',
        flowTitle: '流水线 S1–S8',
        gateTitle: '两道关卡',
        diffTitle: '和其他模式的区别',
        capTitle: '已装能力',
        startTitle: '怎么开始',
        tiers: [
          'L0 问答：不改文件，直接回答',
          'L1 微改：≤2 个文件，定位 → 修改 → 最小验证',
          'L2 标准：先写规格卡与 AC，再实现、验证、交付',
          'L3 复杂/高风险：规格卡与计划一次批准，实现后独立验收',
        ],
        flow: [
          'S1 规格卡（目标 / 范围 / 可判定的 AC / 风险）',
          'S2 侦察（按需读代码，陌生仓库交给子代理只读调查）',
          'S3 计划（计划模式下一次提交，等待批准）',
          'S4 实现（先读后改，沿用项目风格）',
          'S5 验证关卡（亲自运行能证明 AC 的命令）',
          'S6 独立验收关卡（review_agent，L3 必做）',
          'S7 交付报告（结论 / 改动 / 验收表 / 风险）',
          'S8 沉淀（踩坑与决策写看板）',
        ],
        gates: [
          'S5：每条 AC 都要有本会话真实运行过的证据；没运行的写“未验证：原因”。',
          'S6：review_agent 不带作者上下文、亲自重跑检查，先给 VERDICT 再列 BLOCKER / MAJOR / MINOR。',
        ],
        diffs: [
          '标准模式：自由风格、按需用工具；研发模式固定一套流水线与验收段落。',
          'PTC 模式：偏批量调用工具；研发模式偏单任务深做。',
          '极简模式：只保终端与图片；研发模式工具更全但做了裁剪。',
          '创造模式：改 DSH 自身；研发模式改项目代码。',
          '差异关键：技能按需加载、上下文压缩更早（约 199k）、L3 强制独立验收、内置 GitHub Issue 流程。',
        ],
        caps: [
          '代码修正：见「代码修正」标签页（已完全迁移到这里）。',
          'context7 文档检索：模型可直接查库的最新官方文档。',
          'GitHub Issue 流程：设置 → 通用 里开关；开启后按模块先建 Issue 再提交。',
          '技能：rd-code-standards、rd-testing、rd-web、rd-data、rd-ai、rd-ecosystem、rd-retro。',
        ],
        starts: [
          '新建会话，模式选「研发模式」。',
          '描述目标与验收标准；L2/L3 会先给规格卡与计划。',
          'L3 完成任务后会自动走独立验收，再给交付报告。',
        ],
      },
      en: {
        panelName: 'R&D workbench',
        subtitle: 'One mode for the whole delivery flow: tier → recon → implement → verify → independent review → report',
        overviewTab: 'Overview',
        howTitle: 'How it works',
        tierTitle: 'Task tiers',
        flowTitle: 'Pipeline S1–S8',
        gateTitle: 'Two gates',
        diffTitle: 'Differences from other modes',
        capTitle: 'Capabilities',
        startTitle: 'Getting started',
        tiers: [
          'L0 question: no file changes, answer directly',
          'L1 micro change: up to two files, locate → edit → minimal check',
          'L2 standard: spec card with acceptance criteria first, then implement, verify, report',
          'L3 complex/high risk: spec card and plan approved once, independent review after implementation',
        ],
        flow: [
          'S1 spec card (goal / scope / checkable AC / risks)',
          'S2 recon (read what is needed; delegate read-only research to a subagent)',
          'S3 plan (submitted once in plan mode)',
          'S4 implement (read first, follow project conventions)',
          'S5 verification gate (run the commands that prove each AC)',
          'S6 independent review gate (review_agent, mandatory for L3)',
          'S7 delivery report (result / changes / acceptance table / risks)',
          'S8 capture (write pitfalls and decisions to the board)',
        ],
        gates: [
          'S5: every AC needs evidence from a command actually run in this session; otherwise write "unverified: reason".',
          'S6: review_agent works without author context, reruns checks itself, and reports a VERDICT with BLOCKER / MAJOR / MINOR.',
        ],
        diffs: [
          'Standard mode: free-form, tools on demand; R&D mode enforces a pipeline and an acceptance section.',
          'PTC mode favors batched tool calls; R&D mode favors one task in depth.',
          'Minimal mode keeps only terminal and images; R&D mode keeps more tools, deliberately trimmed.',
          'Creator mode changes DSH itself; R&D mode changes project code.',
          'Key differences: skills load on demand, earlier compaction (about 199k), mandatory independent review for L3, built-in GitHub issue-first workflow.',
        ],
        caps: [
          'Code fixes: the "Code fixes" tab (fully migrated here).',
          'context7 documentation lookup: the model can read the latest official docs for a library.',
          'GitHub issue-first workflow: toggle in Settings → General; when on, issues come before edits.',
          'Skills: rd-code-standards, rd-testing, rd-web, rd-data, rd-ai, rd-ecosystem, rd-retro.',
        ],
        starts: [
          'Open a new session and choose "R&D mode".',
          'State the goal and acceptance criteria; L2/L3 start with a spec card and plan.',
          'L3 work goes through an independent review automatically before the delivery report.',
        ],
      },
    }

    const cardStyle = {
      border: '0.5px solid var(--dsw-alias-border-l2)',
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 0,
    }
    const listStyle = { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }
    const titleStyle = { margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' }
    const tabStyle = { padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, border: '0.5px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }
    const tabActiveStyle = { ...tabStyle, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', fontWeight: 500 }

    function Card({ title, children }) {
      return h('section', { style: cardStyle }, h('h3', { style: titleStyle }, title), children)
    }
    function List({ items }) {
      return h('ul', { style: listStyle }, items.map((text, index) => h('li', { key: index }, text)))
    }

    function Overview({ t }) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 } },
        h(Card, { title: t('diffTitle') }, h(List, { items: t('diffs') })),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 } },
          h(Card, { title: t('howTitle') },
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                h('strong', { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t('tierTitle')),
                h(List, { items: t('tiers') })),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                h('strong', { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t('flowTitle')),
                h(List, { items: t('flow') })))),
          h(Card, { title: t('gateTitle') }, h(List, { items: t('gates') })),
          h(Card, { title: t('capTitle') }, h(List, { items: t('caps') })),
          h(Card, { title: t('startTitle') }, h(List, { items: t('starts') }))))
    }

    function PanelIcon({ size = 16 }) {
      const s = size
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 13h10M4.5 10.5 3 13l2.5.5m6-9.5L9 6.5l2.5 2.5L14 6.5 11.5 4 9 6.5Z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M5 5 3.5 3.5', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }))
    }

    function HubPage(props) {
      const t = typeof props?.t === 'function' ? props.t : (key) => key
      const tabs = Array.isArray(props?.pageTabs) ? props.pageTabs : []
      const [active, setActive] = React.useState(-1)
      const current = active >= 0 ? tabs[active] : null
      let body
      if (current === null) {
        body = h(Overview, { t })
      } else {
        let pageProps = {}
        try { pageProps = current.getProps() } catch { pageProps = { t } }
        body = h(current.component, pageProps)
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h('header', { style: { padding: '20px 28px 10px', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' } },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('h1', { style: { margin: 0, fontSize: 20, lineHeight: '28px', color: 'var(--dsw-alias-label-primary)' } }, t('panelName')),
            h('p', { style: { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' } }, t('subtitle'))),
          h('nav', { role: 'tablist', style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            h('button', { type: 'button', role: 'tab', 'aria-selected': active === -1, style: active === -1 ? tabActiveStyle : tabStyle, onClick: () => setActive(-1) }, t('overviewTab')),
            tabs.map((tab, index) => h('button', {
              key: tab.id,
              type: 'button',
              role: 'tab',
              'aria-selected': active === index,
              style: active === index ? tabActiveStyle : tabStyle,
              onClick: () => setActive(index),
            }, tab.label())))),
        h('div', { role: 'tabpanel', style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 28px 28px' } }, body))
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        if (typeof ctx.locale?.register === 'function') ctx.locale.register(NS, STRINGS)
        const t = typeof ctx.locale?.bind === 'function' ? ctx.locale.bind(NS) : (key) => key
        const pageTabs = []
        const sources = Array.isArray(pageSources) ? pageSources : []
        for (const pages of sources) {
          if (!Array.isArray(pages)) continue
          for (const page of pages) {
            if (page === null || typeof page !== 'object' || page.component === undefined) continue
            let pageT = t
            try {
              if (typeof ctx.locale?.bind === 'function' && typeof page.locale === 'string') pageT = ctx.locale.bind(page.locale)
            } catch {
              pageT = t
            }
            pageTabs.push({
              id: String(page.id ?? page.labelKey ?? pageTabs.length),
              label: () => { try { return String(pageT(page.labelKey)) } catch { return String(page.labelKey) } },
              component: page.component,
              getProps: () => {
                let extra = {}
                try { extra = typeof page.props === 'function' ? (page.props() ?? {}) : {} } catch { extra = {} }
                return { ...extra, t: pageT }
              },
            })
          }
        }
        const slots = ctx.slots
        if (slots === null || slots === undefined || typeof slots.register !== 'function') return
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS, label: () => t('panelName') },
          PanelIcon,
        ))
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register(
            { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ pageTabs }) },
            HubPage,
          )
        })
      },
    }
  },
})
