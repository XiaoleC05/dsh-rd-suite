/**
 * Browser half of the GitHub issue-first workflow bundle.
 *
 * Registers exactly one Settings > General row: the localized switch for the
 * Host-backed `githubIssueFirstWorkflow` field. The row reads and writes the
 * shared entry form through `ctx.configForms`, so no custom transport or
 * second configuration fact source is needed.
 */

window.__ModuleLoader__.load({
  id: '@local/github-issue-first-workflow',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const ENTRY_ID = 'github-issue-first-workflow';
    const LOCALE_NS = 'githubIssueFirstWorkflow';
    const FIELD = 'githubIssueFirstWorkflow';
    const STYLE_ID = 'github-issue-first-workflow-settings-style';

    /** Row copy; English and Chinese are the baseline locales in this profile. */
    const STRINGS = {
      zh: {
        title: 'GitHub 规范化修复工作流',
        description: '开启后，在配置了 GitHub 远程仓库的项目中修复代码时，必须先按模块创建 GitHub Issue，再按模块做一次原子提交并关闭 Issue 闭环。需要已安装并登录 GitHub CLI（gh）。',
        loading: '正在读取设置…',
        unavailable: '当前配置不允许写入此设置。',
        saveFailed: '保存失败，请重试。',
      },
      en: {
        title: 'GitHub issue-first workflow',
        description: 'When on, fixing code in a project with a GitHub remote requires one GitHub issue per module before editing, one atomic commit per module, and closing the issue after verification. Requires the GitHub CLI (gh) installed and authenticated.',
        loading: 'Loading setting…',
        unavailable: 'This profile does not allow writing this setting.',
        saveFailed: 'The setting could not be saved. Try again.',
      },
    };

    /** Row and switch styling, matching the host General-section rows and tokens. */
    const CSS = `
      .ghw-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 16px 0;
        border-bottom: 0.5px solid var(--dsw-alias-border-l2);
      }
      .ghw-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ghw-title {
        font-size: 14px;
        line-height: 20px;
        color: var(--dsw-alias-label-primary);
      }
      .ghw-description {
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 18px;
      }
      .ghw-note,
      .ghw-error {
        font-size: 12px;
        line-height: 18px;
      }
      .ghw-note {
        color: var(--dsw-alias-label-secondary);
      }
      .ghw-error {
        color: var(--dsw-alias-state-error-primary);
      }
      .ghw-switch {
        position: relative;
        flex: none;
        width: 36px;
        height: 20px;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: var(--dsw-alias-border-l3);
        cursor: pointer;
        transition: background-color 120ms ease;
      }
      .ghw-switch[aria-checked="true"] {
        background: var(--dsw-alias-brand-primary);
      }
      .ghw-switch:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .ghw-switch:focus-visible {
        outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
        outline-offset: 2px;
      }
      .ghw-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--dsw-alias-switch-thumb);
        transition: transform 120ms ease;
      }
      .ghw-switch[aria-checked="true"] .ghw-thumb {
        background: var(--dsw-alias-label-primary-foreground);
        transform: translateX(16px);
      }
      @media (max-width: 767px) {
        .ghw-row {
          gap: 16px;
        }
      }
    `;

    /** Install the row stylesheet and return its disposer. */
    function installStyles() {
      const stale = document.getElementById(STYLE_ID);
      if (stale !== null) stale.remove();
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      return () => {
        style.remove();
      };
    }

    /**
     * Build the row component for one entry form.
     * @param {object} form - shared ConfigurationForm for this bundle's entry.
     * @param {(key: string) => string} fallbackT - translate fallback when the slot locale seat is absent.
     * @returns {Function} React component.
     */
    function createRow(form, fallbackT) {
      const subscribe = onChange => form.subscribe(onChange);
      const getSnapshot = () => form.getSnapshot();
      return function GithubIssueFirstWorkflowRow({ t }) {
        const translate = typeof t === 'function' ? t : fallbackT;
        const snapshot = React.useSyncExternalStore(subscribe, getSnapshot);
        const [pending, setPending] = React.useState(false);
        const [failed, setFailed] = React.useState(false);
        const busy = React.useRef(false);
        const ready = snapshot.status === 'ready' && snapshot.value !== null && typeof snapshot.value === 'object';
        const checked = ready && snapshot.value[FIELD] === true;
        const writable = snapshot.writable !== false;
        const disabled = !ready || pending || !writable;
        const description = snapshot.status === 'loading'
          ? translate('loading')
          : snapshot.status === 'unavailable'
            ? translate('unavailable')
            : translate('description');

        const onToggle = () => {
          if (disabled || busy.current) return;
          busy.current = true;
          setFailed(false);
          setPending(true);
          void Promise.resolve(form.set(FIELD, !checked))
            .then((accepted) => {
              if (accepted !== true) setFailed(true);
            })
            .catch(() => {
              setFailed(true);
            })
            .finally(() => {
              busy.current = false;
              setPending(false);
            });
        };

        return h('div', { className: 'ghw-row' },
          h('div', { className: 'ghw-text' },
            h('div', { className: 'ghw-title' }, translate('title')),
            h('div', { className: 'ghw-description' }, description),
            ready && !writable ? h('div', { className: 'ghw-note' }, translate('unavailable')) : null,
            failed ? h('div', { className: 'ghw-error', role: 'alert' }, translate('saveFailed')) : null,
          ),
          h('button', {
            type: 'button',
            role: 'switch',
            className: 'ghw-switch',
            'aria-checked': checked,
            'aria-label': translate('title'),
            'aria-busy': pending,
            disabled,
            onClick: onToggle,
          }, h('span', { className: 'ghw-thumb', 'aria-hidden': true })),
        );
      };
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => installStyles(), 'github-workflow: settings row styles');
        ctx.effect(() => ctx.locale.register(LOCALE_NS, STRINGS), 'github-workflow: settings row dictionaries');

        let bound;
        try {
          bound = typeof ctx.locale.bind === 'function' ? ctx.locale.bind(LOCALE_NS) : undefined;
        } catch {
          bound = undefined;
        }
        const fallbackT = (key) => {
          try {
            const value = typeof bound === 'function' ? bound(key) : undefined;
            return typeof value === 'string' && value !== '' ? value : key;
          } catch {
            return key;
          }
        };

        ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => {
          const form = ctx.configForms.get(ENTRY_ID);
          return ctx.slots.inject('settings.general.item', () => ctx.slots.register({
            name: 'settings.general.item',
            id: ENTRY_ID,
            order: 25,
            locale: LOCALE_NS,
          }, createRow(form, fallbackT)));
        }), 'github-workflow: General settings row');
      },
    };
  },
});
