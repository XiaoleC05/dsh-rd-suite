/**
 * 研发工作台 — 唯一侧栏入口与主区页（合并客户端的一个 surface）。
 *
 * 页内结构：标签栏 + 概览。概览按「现在是什么 → 怎么开始 → 流水线与关卡 → 能力 → 与其他模式的
 * 区别」排列，最上面一条状态带给出模式的关键事实，差异对比收在折叠区里，不占首屏。
 *
 * 成员页面（代码修正）只在首次打开对应标签时挂载，之后切换标签保留其展开、勾选与结果状态，
 * 不重复拉取工作区。
 */
window.__ModuleLoader__.load({
  id: '@local/rd-hub',
  factory(require, pageSources) {
    const React = require('react')
    const h = React.createElement
    const NS = 'rdHub'
    const PANEL_ID = 'rd-hub'
    const OVERVIEW = -1
    /** 流水线里属于关卡的两步：S5 验证、S6 独立验收。 */
    const GATE_STEPS = [5, 6]

    const STRINGS = {
      zh: {
        panelName: '研发工作台',
        subtitle: '一个模式覆盖完整研发流程：分级 → 侦察 → 实现 → 验证 → 独立验收 → 交付',
        overviewTab: '概览',
        facts: ['PTC 执行：run_code 批量调用', '压缩阈值约 199k', '两道关卡', '8 个按需技能'],
        startTitle: '三步开始',
        // 成员项用「标题|说明」编码：locale 字典只存字符串，最长兼容、也便于逐条翻译。
        starts: [
          '新建会话|模式选「研发模式」，工作目录选要改的仓库。',
          '说清目标|写出目标与验收标准；L2/L3 会先给规格卡与计划再动手。',
          '照单验收|复杂任务自动独立验收，交付时给出带证据的验收表。',
        ],
        flowTitle: '流水线 S1–S8',
        flowHint:
          '标「关卡」的两步不接受口头通过：S5 要有本会话真实运行过的输出，S6 由 review_agent 亲自重跑。',
        ghTitle: 'GitHub 固定流程',
        ghHint: '有 GitHub 远程仓库时照这条走，没有开关；预检不通过就停下报告，不绕路。',
        ghSteps: [
          'G0 预检 strategy',
          'G1 每模块一个 Issue',
          'G2 分支 type/issue-slug',
          'G3 原子提交 Closes #N',
          'G4 代码审计',
          'G5 PR 与 squash 合并',
          'G6 关闭 Issue',
          'G7 发版',
        ],
        flow: [
          'S1 规格卡',
          'S2 侦察',
          'S3 计划',
          'S4 实现',
          'S5 验证',
          'S6 独立验收',
          'S7 交付报告',
          'S8 沉淀',
        ],
        gateBadge: '关卡',
        tierTitle: '任务分级',
        tiers: [
          'L0 问答：不改文件，直接回答',
          'L1 微改：≤2 个文件，定位 → 改 → 最小验证',
          'L2 标准：先写规格卡与 AC，再实现、验证、交付',
          'L3 复杂/高风险：规格卡与计划一次批准，实现后独立验收',
        ],
        gateTitle: '两道关卡',
        gates: [
          'S5 验证：每条 AC 都要有本会话真实跑过的命令输出；没跑的写「未验证：原因」。',
          'S6 独立验收：review_agent 不带作者上下文、亲自重跑检查，先给 VERDICT 再列 BLOCKER / MAJOR / MINOR。',
        ],
        capTitle: '已装能力',
        caps: [
          'PTC 执行|run_code 把多次工具调用合并成一个程序：往返更少，上下文更短。',
          '代码修正|写入即按项目规范格式化，模块关闭时再整体审计一次；面板只用来复查。',
          'context7|直接检索库的最新官方文档，版本敏感的参数不靠记忆。',
          'GitHub 流程|设置 → 通用 里开关；开启后先建 Issue，再改代码，最后提交。',
          '定时任务|把巡检、回归、报表排成周期任务，不占当前会话。',
          '领域技能|rd-code-standards、rd-testing、rd-web、rd-data、rd-ai、rd-ecosystem、rd-retro、rd-selftest，按需加载。',
          '文案质检|写文档与文案前加载 rd-copy：去 AI 味、AIGC 自检、降重，交付前跑 aigc-check 到 80 分以上。',
        ],
        diffTitle: '和其他模式的区别',
        diffOpen: '收起',
        diffClosed: '展开对比',
        diffs: [
          '标准模式：自由风格、按需用工具；研发模式固定一套流水线与验收段落。',
          'PTC 模式：只有 run_code 与批量调用；研发模式已包含 PTC，并在其上加了分级、关卡、独立验收与领域技能。',
          '极简模式：只保终端与图片；研发模式工具更全，但读、搜索与网页输出都有上限，也不挂 workflow。',
          '创造模式：改 DSH 自身；研发模式改项目代码。',
        ],
        retry: '重新渲染',
        liveTitle: '当前状态',
        liveHint: '数字来自工作区的 package.json 与 docs/ITERATIONS.md；读不到就不显示。',
        liveVersion: '插件版本',
        liveRounds: '已迭代轮次',
        liveLedger: '账本行数',
        liveChangelog: '最新变更',
        liveAudit: '最近审计',

        emptyTabs: '成员页面未加载：代码修正面板不可用，检查 bundle 是否完整启用。',
        tabListLabel: '研发工作台的页面',
      },
      en: {
        panelName: 'R&D workbench',
        subtitle:
          'One mode for the whole delivery flow: tier → recon → implement → verify → independent review → report',
        overviewTab: 'Overview',
        facts: [
          'PTC: batched calls through run_code',
          'Compaction at about 199k',
          'Two gates',
          '8 on-demand skills',
        ],
        startTitle: 'Three steps',
        starts: [
          'New session|Pick "R&D mode" and set the working directory to the repository you will change.',
          'State the goal|Write the goal and acceptance criteria; L2/L3 produce a spec card and plan first.',
          'Check the evidence|Complex work goes through independent review and ends with an acceptance table.',
        ],
        flowTitle: 'Pipeline S1–S8',
        flowHint:
          'Steps marked "gate" never pass on words alone: S5 needs output actually produced in this session, S6 reruns the checks through review_agent.',
        ghTitle: 'Fixed GitHub flow',
        ghHint:
          'Used whenever the remote is GitHub; there is no switch, and a failed preflight stops the task.',
        ghSteps: [
          'G0 preflight strategy',
          'G1 one issue per module',
          'G2 branch type/issue-slug',
          'G3 atomic commit Closes #N',
          'G4 code audit',
          'G5 pull request, squash merge',
          'G6 close the issue',
          'G7 release',
        ],
        flow: [
          'S1 spec card',
          'S2 recon',
          'S3 plan',
          'S4 implement',
          'S5 verify',
          'S6 review',
          'S7 report',
          'S8 capture',
        ],
        gateBadge: 'gate',
        tierTitle: 'Task tiers',
        tiers: [
          'L0 question: no file changes, answer directly',
          'L1 micro change: up to two files, locate → edit → minimal check',
          'L2 standard: spec card with acceptance criteria first, then implement, verify, report',
          'L3 complex/high risk: spec card and plan approved once, independent review afterwards',
        ],
        gateTitle: 'Two gates',
        gates: [
          'S5 verification: every AC needs command output produced in this session; otherwise write "unverified: reason".',
          'S6 independent review: review_agent works without author context, reruns the checks, and reports a VERDICT with BLOCKER / MAJOR / MINOR.',
        ],
        capTitle: 'Installed capabilities',
        caps: [
          'PTC execution|run_code folds several tool calls into one program: fewer round trips, shorter context.',
          'Code fixes|Files are formatted on write and audited once when a module closes; the panel is for reviewing, not for running fixes.',
          'context7|Reads the latest official documentation for a library instead of relying on memory.',
          'GitHub workflow|Toggle in Settings → General; when on, the issue comes before the edit and the commit.',
          'Scheduled tasks|Run recurring checks, regressions, or reports without occupying this session.',
          'Domain skills|rd-code-standards, rd-testing, rd-web, rd-data, rd-ai, rd-ecosystem, rd-retro, rd-selftest, loaded on demand.',
          'Copy checks|Load rd-copy before writing docs or copy: de-AI phrasing, AIGC self-check, and paraphrase checks, with aigc-check at 80 or above before delivery.',
        ],
        diffTitle: 'Differences from other modes',
        diffOpen: 'Show less',
        diffClosed: 'Compare',
        diffs: [
          'Standard mode: free-form, tools on demand; R&D mode enforces a pipeline and an acceptance section.',
          'PTC mode: run_code and batching only; R&D mode includes it and adds tiers, gates, independent review, and domain skills.',
          'Minimal mode keeps only terminal and images; R&D mode keeps more tools but caps reads, searches, and web output, and mounts no workflow.',
          'Creator mode changes DSH itself; R&D mode changes project code.',
        ],
        retry: 'Render again',
        liveTitle: 'Current state',
        liveHint: 'Read from the workspace package.json and docs/ITERATIONS.md; hidden when unavailable.',
        liveVersion: 'Plugin version',
        liveRounds: 'Iterations done',
        liveLedger: 'Ledger rows',
        liveChangelog: 'Latest change',
        liveAudit: 'Recent audit',

        emptyTabs:
          'Member pages did not load: the code-fixes panel is unavailable. Check that the bundle is fully enabled.',
        tabListLabel: 'R&D workbench pages',
      },
    }

    // 一个刻度：字号 21 / 14 / 13 / 12，间距 24 / 16 / 12 / 8。
    const ui = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--dsw-alias-bg-base)',
      },
      header: {
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '18px 24px 0',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      titleRow: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
      h1: {
        margin: 0,
        fontSize: 21,
        lineHeight: '28px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      subtitle: {
        margin: 0,
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      tabBar: { display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'thin' },
      tab: {
        font: 'inherit',
        fontSize: 13,
        lineHeight: '20px',
        padding: '8px 12px',
        border: 0,
        borderBottom: '2px solid transparent',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      tabActive: {
        color: 'var(--dsw-alias-label-primary)',
        borderBottom: '2px solid currentColor',
        fontWeight: 600,
      },
      panel: { flex: 1, minHeight: 0, overflow: 'auto' },
      overview: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '16px 24px 28px',
        maxWidth: 1040,
        margin: '0 auto',
        width: '100%',
      },
      boardPane: { height: '100%', minHeight: 0 },
      section: { display: 'flex', flexDirection: 'column', gap: 8 },
      sectionHead: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
      h2: {
        margin: 0,
        fontSize: 14,
        lineHeight: '20px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      hint: {
        margin: 0,
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      grid: {
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
      },
      card: {
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
      },
      h3: {
        margin: 0,
        fontSize: 13,
        lineHeight: '20px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      body: {
        margin: 0,
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      list: {
        margin: 0,
        paddingLeft: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      facts: {
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        margin: 0,
        padding: 0,
        listStyle: 'none',
      },
      fact: {
        fontSize: 12,
        lineHeight: '18px',
        padding: '2px 8px',
        borderRadius: 999,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      steps: {
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
      },
      step: { display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 },
      stepText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
      stepNo: {
        flex: 'none',
        width: 20,
        height: 20,
        borderRadius: 999,
        fontSize: 12,
        lineHeight: '20px',
        textAlign: 'center',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
      },
      stepper: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'stretch',
        margin: 0,
        padding: 0,
        listStyle: 'none',
      },
      stepChip: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 8,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      stepChipGate: {
        borderColor: 'var(--dsw-alias-label-primary)',
        color: 'var(--dsw-alias-label-primary)',
      },
      stepCode: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      gateTag: {
        fontSize: 11,
        lineHeight: '16px',
        padding: '0 4px',
        borderRadius: 4,
        border: '0.5px solid currentColor',
      },
      linkButton: {
        alignSelf: 'flex-start',
        font: 'inherit',
        fontSize: 12,
        lineHeight: '18px',
        padding: '2px 0',
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        textDecoration: 'underline',
      },
    }

    /** Locale values may be missing; every list renderer goes through this. */
    function asList(value) {
      return Array.isArray(value) ? value : []
    }

    /** "S5 验证" → { code: "S5", name: "验证" }. */
    function splitStep(text) {
      const label = String(text)
      const cut = label.indexOf(' ')
      return cut > 0
        ? { code: label.slice(0, cut), name: label.slice(cut + 1) }
        : { code: '', name: label }
    }

    function Section({ title, hint, children }) {
      return h(
        'section',
        { style: ui.section },
        h(
          'div',
          { style: ui.sectionHead },
          h('h2', { style: ui.h2 }, title),
          hint ? h('p', { style: ui.hint }, hint) : null,
        ),
        children,
      )
    }

    function Card({ title, children }) {
      return h('div', { style: ui.card }, title ? h('h3', { style: ui.h3 }, title) : null, children)
    }

    function List({ items }) {
      return h(
        'ul',
        { style: ui.list },
        asList(items).map((text, index) => h('li', { key: index }, String(text))),
      )
    }

    function Stepper({ flow, badge, gates = GATE_STEPS }) {
      const steps = asList(flow)
      return h(
        'ol',
        { style: ui.stepper },
        steps.map((text, index) => {
          const { code, name } = splitStep(text)
          const gate = gates.includes(index + 1)
          return h(
            'li',
            { key: index, style: gate ? { ...ui.stepChip, ...ui.stepChipGate } : ui.stepChip },
            code ? h('span', { style: ui.stepCode }, code) : null,
            h('span', null, name),
            gate ? h('span', { style: ui.gateTag }, badge) : null,
          )
        }),
      )
    }


    /**
     * 面板错误边界：一个面板渲染失败只影响它自己。
     * 测试替身没有 React.Component 时退化为直通，保证无浏览器测试仍能渲染。
     */
    const PanelBoundary = typeof React.Component === 'function'
      ? class PanelBoundary extends React.Component {
          constructor(props) {
            super(props)
            this.state = { error: null }
            this.retry = () => this.setState({ error: null })
          }

          static getDerivedStateFromError(error) {
            return { error }
          }

          componentDidCatch(error) {
            // 控制台留一份，方便用户在浏览器里查完整栈。
            if (typeof console !== 'undefined' && typeof console.error === 'function') {
              console.error('[rd-hub] panel crashed:', error)
            }
          }

          render() {
            if (this.state.error === null) return this.props.children
            const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
            return h(
              'div',
              { style: ui.panelError, role: 'alert' },
              h('h3', { style: ui.h3 }, this.props.label ?? '面板渲染失败'),
              h('p', { style: ui.hint }, message),
              h('button', { type: 'button', style: ui.linkButton, onClick: this.retry }, this.props.retryLabel ?? '重新渲染'),
            )
          }
        }
      : ({ children }) => children

    /** "标题|说明" → [标题, 说明]。成员项在字典里是字符串，渲染时才拆开。 */
    function pair(text) {
      const value = String(text)
      const cut = value.indexOf('|')
      return cut < 0 ? [value, ''] : [value.slice(0, cut), value.slice(cut + 1)]
    }

    function Overview({ t, hasTabs, status }) {
      // 概览的数据来自 /dsh-code-pipeline/api/status；拿不到就退回静态文案，不显示错误。
      const live = status ?? null
      const [showDiff, setShowDiff] = React.useState(false)
      return h(
        'div',
        { style: ui.overview },
        h(
          'ul',
          { style: ui.facts, 'aria-label': t('panelName') },
          asList(t('facts')).map((text, index) =>
            h('li', { key: index, style: ui.fact }, String(text)),
          ),
        ),
        hasTabs ? null : h('p', { style: ui.hint, role: 'status' }, t('emptyTabs')),
        h(
          Section,
          { title: t('startTitle') },
          h(
            'div',
            { style: ui.steps },
            asList(t('starts')).map((text, index) => {
              const [title, desc] = pair(text)
              return h(
                'div',
                { key: index, style: ui.step },
                h('span', { style: ui.stepNo, 'aria-hidden': true }, String(index + 1)),
                h(
                  'div',
                  { style: ui.stepText },
                  h('span', { style: ui.h3 }, title),
                  h('span', { style: ui.hint }, desc),
                ),
              )
            }),
          ),
        ),
        h(
          Section,
          { title: t('flowTitle'), hint: t('flowHint') },
          h(Stepper, { flow: t('flow'), badge: t('gateBadge') }),
        ),
        h(
          Section,
          { title: t('ghTitle'), hint: t('ghHint') },
          h(Stepper, { flow: t('ghSteps'), badge: t('gateBadge'), gates: [] }),
        ),
        live === null
          ? null
          : h(
              Section,
              { title: t('liveTitle'), hint: t('liveHint') },
              h(
                'div',
                { style: ui.metrics },
                h(Metric, { label: t('liveVersion'), value: String(live.version ?? '—') }),
                h(Metric, {
                  label: t('liveRounds'),
                  value: live.rounds === undefined ? '—' : String(live.rounds.lastRound),
                }),
                h(Metric, {
                  label: t('liveLedger'),
                  value: live.rounds === undefined ? '—' : String(live.rounds.rows),
                }),
                h(Metric, { label: t('liveChangelog'), value: String(live.changelogVersion ?? '—') }),
                h(Metric, {
                  label: t('liveAudit'),
                  value:
                    Array.isArray(live.auditHistory) && live.auditHistory.length > 0
                      ? `${live.auditHistory[0].checked} 文件 / ${live.auditHistory[0].elapsedMs} ms`
                      : '—',
                }),
              ),
            ),
        h(
          'div',
          { style: ui.grid },
          h(Card, { title: t('tierTitle') }, h(List, { items: t('tiers') })),
          h(Card, { title: t('gateTitle') }, h(List, { items: t('gates') })),
        ),
        h(
          Section,
          { title: t('capTitle') },
          h(
            'div',
            { style: ui.grid },
            asList(t('caps')).map((text, index) => {
              const [name, desc] = pair(text)
              return h(
                'div',
                { key: index, style: ui.card },
                h('h3', { style: ui.h3 }, name),
                h('p', { style: ui.body }, desc),
              )
            }),
          ),
        ),
        h(
          Section,
          { title: t('diffTitle') },
          h(
            'button',
            {
              type: 'button',
              style: ui.linkButton,
              'aria-expanded': showDiff,
              onClick: () => setShowDiff((open) => !open),
            },
            showDiff ? t('diffOpen') : t('diffClosed'),
          ),
          showDiff ? h(List, { items: t('diffs') }) : null,
        ),
      )
    }

    function PanelIcon({ size = 16 }) {
      const s = size
      return h(
        'svg',
        { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M3 13h10M4.5 10.5 3 13l2.5.5m6-9.5L9 6.5l2.5 2.5L14 6.5 11.5 4 9 6.5Z',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M5 5 3.5 3.5',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
        }),
      )
    }

    /**
     * 单个指标：一个大数字加一行标签。
     * @param {{ label: string; value: string }} props - 文案与值
     * @returns {object} React 元素
     */
    function Metric({ label, value }) {
      return h(
        'div',
        { style: ui.metric },
        h('span', { style: ui.metricValue }, value),
        h('span', { style: ui.hint }, label),
      )
    }

    function HubPage(props) {
      const t = typeof props?.t === 'function' ? props.t : (key) => key
      const tabs = Array.isArray(props?.pageTabs) ? props.pageTabs : []
      const [active, setActive] = React.useState(OVERVIEW)
      // 首次打开才挂载成员页面；切换标签不再卸载，勾选与结果因此得以保留。
      const [mounted, setMounted] = React.useState(() => new Set([OVERVIEW]))
      const tabNodes = React.useRef({})
      // 概览的实时数据：成功就显示版本与账本进度，失败或字段缺失时退回静态文案。
      // 允许外部直接传一份状态（宿主注入或测试用），没传就自己请求。
      const [status, setStatus] = React.useState(props?.status ?? null)

      React.useEffect(() => {
        let cancelled = false
        const load = async () => {
          try {
            const response = await fetch('/dsh-code-pipeline/api/status', { headers: { accept: 'application/json' } })
            if (!response.ok) return
            const payload = await response.json()
            if (!cancelled && payload && payload.ok !== false) setStatus(payload)
          } catch {
            // 路由不可用时保持静态文案，不打扰用户。
          }
        }
        void load()
        return () => {
          cancelled = true
        }
      }, [])

      const select = React.useCallback((index) => {
        setActive(index)
        setMounted((previous) => (previous.has(index) ? previous : new Set(previous).add(index)))
      }, [])

      const onTabKey = React.useCallback(
        (event, index) => {
          const total = tabs.length + 1
          const position = index + 1
          let next
          if (event.key === 'ArrowRight') next = (position + 1) % total
          else if (event.key === 'ArrowLeft') next = (position - 1 + total) % total
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = total - 1
          else return
          event.preventDefault()
          const target = next - 1
          select(target)
          const node = tabNodes.current[next]
          if (node && typeof node.focus === 'function') node.focus()
        },
        [select, tabs.length],
      )

      const tabButton = (index, label) =>
        h(
          'button',
          {
            key: 'tab-' + index,
            ref: (node) => {
              tabNodes.current[index + 1] = node
            },
            type: 'button',
            role: 'tab',
            id: 'rd-hub-tab-' + (index + 1),
            'aria-controls': 'rd-hub-panel-' + (index + 1),
            'aria-selected': active === index,
            tabIndex: active === index ? 0 : -1,
            style: active === index ? { ...ui.tab, ...ui.tabActive } : ui.tab,
            onClick: () => select(index),
          },
          label,
        )

      const pane = (index, node) =>
        h(
          'div',
          {
            key: 'panel-' + (index + 1),
            id: 'rd-hub-panel-' + (index + 1),
            role: 'tabpanel',
            'aria-labelledby': 'rd-hub-tab-' + (index + 1),
            tabIndex: 0,
            style:
              index === OVERVIEW
                ? { display: active === index ? 'block' : 'none' }
                : { ...ui.boardPane, display: active === index ? 'block' : 'none' },
          },
          node,
        )

      const bodies = [
        pane(
          OVERVIEW,
          h(
            PanelBoundary,
            { label: t('panelName'), retryLabel: t('retry') },
            h(Overview, { t, hasTabs: tabs.length > 0, status }),
          ),
        ),
      ]
      tabs.forEach((tab, index) => {
        if (!mounted.has(index)) return
        let pageProps = {}
        try {
          pageProps = tab.getProps() ?? {}
        } catch {
          pageProps = { t }
        }
        bodies.push(
          pane(
            index,
            h(PanelBoundary, { label: tab.label(), retryLabel: t('retry') }, h(tab.component, pageProps)),
          ),
        )
      })

      return h(
        'div',
        { style: ui.page },
        h(
          'header',
          { style: ui.header },
          h(
            'div',
            { style: ui.titleRow },
            h('h1', { style: ui.h1 }, t('panelName')),
            h('p', { style: ui.subtitle }, t('subtitle')),
          ),
          h(
            'div',
            {
              role: 'tablist',
              'aria-label': t('tabListLabel'),
              style: ui.tabBar,
              onKeyDown: (event) => onTabKey(event, active),
            },
            tabButton(OVERVIEW, t('overviewTab')),
            tabs.map((tab, index) => tabButton(index, tab.label())),
          ),
        ),
        h('div', { style: ui.panel }, bodies),
      )
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
              if (typeof ctx.locale?.bind === 'function' && typeof page.locale === 'string')
                pageT = ctx.locale.bind(page.locale)
            } catch {
              pageT = t
            }
            pageTabs.push({
              id: String(page.id ?? page.labelKey ?? pageTabs.length),
              label: () => {
                try {
                  return String(pageT(page.labelKey))
                } catch {
                  return String(page.labelKey)
                }
              },
              component: page.component,
              getProps: () => {
                let extra = {}
                try {
                  extra = typeof page.props === 'function' ? (page.props() ?? {}) : {}
                } catch {
                  extra = {}
                }
                // embedded：成员页面已经在工作台的标签里，不必再渲染自己的标题。
                return { ...extra, t: pageT, embedded: true }
              },
            })
          }
        }
        const slots = ctx.slots
        if (slots === null || slots === undefined || typeof slots.register !== 'function') return
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 20,
              locale: NS,
              label: () => t('panelName'),
            },
            PanelIcon,
          ),
        )
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
