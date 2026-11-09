/* ============================================================================
 * 70-settings.js — DSH 设置面板里的「岁时」分区
 *
 * 注册：settings.section（owner props: { close }），可选的 settings.section.icon
 * （owner props: { size, active }）。所有开关是自己实现的 button[role="switch"]
 * + aria-checked，不依赖 UI 库；卡片沿用 DSH 设置页的 bg-layer-1 / 14px 圆角。
 * ========================================================================== */

pushCss(`
.ss-settings{display:flex;flex-direction:column;gap:14px;max-width:720px;padding:2px 0 16px;color:var(--dsw-alias-label-primary)}
.ss-settings-head{padding:2px 2px 4px}
.ss-settings-title{margin:0;font-family:var(--ss-serif);font-size:22px;font-weight:500;line-height:1.25;letter-spacing:.06em;color:var(--dsw-alias-label-primary)}
.ss-settings-desc{margin:8px 0 0;font-size:12.5px;line-height:1.65;letter-spacing:.02em;color:var(--ss-ink-mid)}
.ss-settings-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--ss-hairline);border-radius:14px;padding:17px 19px}
.ss-settings-card-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
.ss-settings-card-title{margin:0;font-size:14px;font-weight:500;line-height:1.45;letter-spacing:.02em;color:var(--dsw-alias-label-primary)}
.ss-settings-card-desc{margin:7px 0 0;font-size:12.5px;line-height:1.6;color:var(--ss-ink-dim)}
.ss-settings-row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:15px;padding-top:13px;border-top:1px solid var(--ss-hairline)}
.ss-settings-row-label{font-size:12.5px;line-height:1.5;color:var(--ss-ink-mid)}
.ss-settings-seg{display:inline-flex;flex:none;gap:2px;padding:3px;border:1px solid var(--ss-hairline);border-radius:10px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)}
.ss-settings-seg-btn{height:26px;min-width:44px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--ss-ink-mid);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background-color .16s ease,color .16s ease}
.ss-settings-seg-btn:hover{color:var(--dsw-alias-label-primary)}
.ss-settings-seg-btn[aria-pressed="true"]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 11%, transparent);color:var(--dsw-alias-label-primary)}
.ss-settings-seg-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ss-settings-list{margin-top:6px;display:flex;flex-direction:column}
.ss-settings-item{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--ss-hairline)}
.ss-settings-item:first-child{border-top:0}
.ss-settings-item-main{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.ss-settings-item-name{font-size:13.5px;line-height:1.45;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-settings-item-sub{font-size:11.5px;line-height:1.45;color:var(--ss-ink-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-settings-item-days{flex:none;font-size:12px;line-height:1.4;color:var(--ss-ink-mid);font-variant-numeric:tabular-nums}
.ss-settings-remove{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--ss-ink-dim);cursor:pointer;transition:background-color .16s ease,color .16s ease}
.ss-settings-remove:hover{background:rgba(214,69,69,.12);color:var(--dsw-alias-state-error-primary)}
.ss-settings-remove:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ss-settings-empty{padding:13px 0 3px;font-size:12.5px;line-height:1.6;color:var(--ss-ink-dim)}
.ss-settings-add{height:28px;padding:0 11px;font-size:12px}
.ss-settings-note{margin:0;font-size:12.5px;line-height:1.7;color:var(--ss-ink-mid)}
.ss-settings-meta{margin:7px 0 0;font-size:11.5px;line-height:1.6;letter-spacing:.03em;color:var(--ss-ink-dim)}
.ss-settings-nav-icon{display:inline-flex;align-items:center;justify-content:center;color:var(--ss-coral)}
.ss-settings-nav-icon.ss-settings-nav-icon-active{color:var(--ss-coral-bright)}
@media (max-width:520px){
  .ss-settings-row{flex-direction:column;align-items:flex-start;gap:10px}
  .ss-settings-seg{width:100%;justify-content:space-between}
  .ss-settings-seg-btn{flex:1}
}
`)

/** 开关按钮（自有实现，role=switch + aria-checked）。 */
function ssSettingsSwitch(props) {
  return h(
    'button',
    {
      type: 'button',
      className: SS.cls('ss-switch', props.className),
      role: 'switch',
      'aria-checked': props.checked ? 'true' : 'false',
      'aria-label': props.label,
      title: props.label,
      onClick: props.onChange,
    },
    null,
  )
}

/** 提前天数分段选择器。 */
function ssSettingsLeadDays(value, onChange) {
  const choices = Store.leadDaysChoices
  return h(
    'div',
    { className: 'ss-settings-seg', role: 'group', 'aria-label': T('提前天数', 'Lead time') },
    choices.map((days) =>
      h(
        'button',
        {
          key: 'lead' + days,
          type: 'button',
          className: 'ss-settings-seg-btn',
          'aria-pressed': value === days,
          onClick() {
            onChange(days)
          },
        },
        T(days + ' 天', days + 'd'),
      ),
    ),
  )
}

/** 我的纪念日列表（设置页版：不显示「每年」等副本，只保留必要信息）。 */
function ssSettingsAnniversaries(snap) {
  const items = snap.anniversaries
  if (items.length === 0) {
    return h(
      'div',
      { className: 'ss-settings-empty' },
      T('还没有纪念日。记下重要的日子：生日、相识、远行……', 'No anniversaries yet. Keep the days that matter.'),
    )
  }
  return h(
    'div',
    { className: 'ss-settings-list' },
    items.map((item) =>
      h(
        'div',
        { key: item.id, className: 'ss-settings-item' },
        h(
          'div',
          { className: 'ss-settings-item-main' },
          h('div', { className: 'ss-settings-item-name' }, item.name),
          h('div', { className: 'ss-settings-item-sub' }, item.subtitle),
        ),
        h('span', { className: 'ss-settings-item-days' }, SS.fmt.countdown(item.days)),
        h(
          'button',
          {
            type: 'button',
            className: 'ss-settings-remove',
            onClick() {
              Store.act.removeAnniversary(item.id)
            },
            title: T('删除', 'Delete'),
            'aria-label': T('删除纪念日「', 'Delete anniversary ') + item.name + T('」', ''),
          },
          SS.icon.close(14),
        ),
      ),
    ),
  )
}

/** 设置分区页。props.close 由设置面板注入，可用来关闭整个面板。 */
function SuishiSettingsPage(props) {
  useLocaleTick()
  const snap = Store.use()
  const settings = snap.settings

  return h(
    'div',
    { className: 'ss-settings' },
    h(
      'header',
      { className: 'ss-settings-head' },
      h('h2', { className: 'ss-settings-title' }, T('岁时', 'Suishi')),
      h(
        'p',
        { className: 'ss-settings-desc' },
        T(
          '一枚安静的中国年历：二十四节气、传统节令，还有你自己的纪念日。',
          'A quiet Chinese almanac: the 24 solar terms, festivals, and the days you keep.',
        ),
      ),
    ),

    h(
      'section',
      { key: 'reminder', className: 'ss-settings-card' },
      h(
        'div',
        { className: 'ss-settings-card-head' },
        h('h3', { className: 'ss-settings-card-title' }, T('安静提醒', 'Quiet reminder')),
        ssSettingsSwitch({
          checked: settings.reminderEnabled,
          label: T('安静提醒', 'Quiet reminder'),
          onChange() {
            Store.act.setSettings({ reminderEnabled: !settings.reminderEnabled })
          },
        }),
      ),
      h(
        'p',
        { className: 'ss-settings-card-desc' },
        T('在重要日子临近时，只在侧面轻轻提一次。', 'A single gentle nudge when an important day approaches.'),
      ),
      h(
        'div',
        { className: 'ss-settings-row' },
        h('span', { className: 'ss-settings-row-label' }, T('提前天数', 'Lead time')),
        ssSettingsLeadDays(settings.leadDays, function onChange(days) {
          Store.act.setSettings({ leadDays: days })
        }),
      ),
    ),

    h(
      'section',
      { key: 'capsule', className: 'ss-settings-card' },
      h(
        'div',
        { className: 'ss-settings-card-head' },
        h('h3', { className: 'ss-settings-card-title' }, T('侧栏胶囊', 'Sidebar capsule')),
        ssSettingsSwitch({
          checked: settings.capsuleEnabled,
          label: T('侧栏胶囊', 'Sidebar capsule'),
          onChange() {
            Store.act.setSettings({ capsuleEnabled: !settings.capsuleEnabled })
          },
        }),
      ),
      h(
        'p',
        { className: 'ss-settings-card-desc' },
        T('在侧栏底部常驻一枚距春节的倒计时，随时看见年的脚步。', 'Keep a countdown to Spring Festival at the bottom of the sidebar.'),
      ),
    ),

    h(
      'section',
      { key: 'anniversaries', className: 'ss-settings-card' },
      h(
        'div',
        { className: 'ss-settings-card-head' },
        h('h3', { className: 'ss-settings-card-title' }, T('我的纪念日', 'My anniversaries')),
        h(
          SSButton,
          {
            variant: 'ghost',
            size: 'sm',
            className: 'ss-settings-add',
            onClick() {
              Store.act.openAddDialog()
            },
          },
          SS.icon.plus(13),
          h('span', null, T('添加', 'Add')),
        ),
      ),
      h(
        'p',
        { className: 'ss-settings-card-desc' },
        T('生日、相识、远行——按农历或公历，每年提醒你一次。', 'Birthdays and other days, by lunar or solar calendar.'),
      ),
      ssSettingsAnniversaries(snap),
    ),

    h(
      'section',
      { key: 'about', className: 'ss-settings-card ss-settings-about' },
      h(
        'p',
        { className: 'ss-settings-note' },
        T('农历与节气数据来自香港天文台年历（1901–2100）。', 'Lunar and solar-term data from the Hong Kong Observatory almanac (1901–2100).'),
      ),
      h(
        'p',
        { className: 'ss-settings-meta' },
        T('岁时', 'Suishi') + ' · v' + SS.VERSION + ' · ' + T('离线数据，不联网', 'offline, no network'),
      ),
    ),
  )
}

/** 设置导航图标（settings.section.icon，owner props: { size, active }）。 */
function SuishiSettingsIcon(props) {
  const size = props && typeof props.size === 'number' ? props.size : 16
  const active = Boolean(props && props.active)
  return h(
    'span',
    {
      className: SS.cls('ss-settings-nav-icon', active ? 'ss-settings-nav-icon-active' : ''),
      style: { width: size, height: size },
      'aria-hidden': 'true',
    },
    SS.icon.ring(size),
  )
}
