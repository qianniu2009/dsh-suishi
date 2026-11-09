/* ============================================================================
 * 80-reminder.js — 安静提醒浮层（shell.overlay）
 *
 * 快照 `reminder: { event, view }` 存在时，在窗口右下角显示一张小卡：
 *   `立冬 · 3 天后` / `2026.11.07 · 农历九月廿九`
 * 点击打开详情并关闭；× 只关闭。Store 负责「同一天不再弹」的持久化，
 * 本组件只负责一次显示与交互。不阻挡任何操作、不自动消失。
 * ========================================================================== */

pushCss(`
.ss-reminder{position:fixed;right:24px;bottom:24px;z-index:60;box-sizing:border-box;display:flex;align-items:flex-start;gap:8px;width:min(296px,calc(100vw - 32px));padding:13px 12px 13px 20px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:0 18px 48px rgba(0,0,0,.4);animation:ss-reminder-in .28s cubic-bezier(.2,.7,.3,1) both}
.ss-reminder::before{content:"";position:absolute;left:9px;top:15px;bottom:15px;width:2px;border-radius:2px;background:var(--ss-coral);opacity:.55}
.ss-reminder:hover{border-color:var(--dsw-alias-border-l2);box-shadow:0 20px 54px rgba(0,0,0,.46)}
.ss-reminder-main{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.ss-reminder-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px;border-radius:6px}
.ss-reminder-title{display:flex;align-items:baseline;gap:2px;min-width:0;font-size:13.5px;line-height:1.45;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss-reminder-name{flex:none;max-width:64%;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary)}
.ss-reminder-sub{font-size:12px;line-height:1.5;letter-spacing:.02em;color:var(--ss-ink-dim);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss-reminder-countdown{flex:none;color:var(--ss-coral);font-size:12.5px}
.ss-reminder-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin:-3px -2px 0 0;padding:0;border:0;border-radius:6px;background:transparent;color:var(--ss-ink-dim);cursor:pointer;transition:background-color .16s ease,color .16s ease}
.ss-reminder-close:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);color:var(--dsw-alias-label-primary)}
.ss-reminder-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
@keyframes ss-reminder-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ss-reminder{animation:none}}
@media (max-width:520px){.ss-reminder{right:12px;bottom:12px}}
`)

/** 右下角安静提醒卡（没有提醒时返回 null）。 */
function QuietReminderCard(props) {
  const reminder = props.reminder
  if (!reminder) return null

  const event = reminder.event
  const view = reminder.view

  function dismiss(eventObject) {
    if (eventObject && typeof eventObject.stopPropagation === 'function') eventObject.stopPropagation()
    Store.act.dismissReminder()
  }

  function openDrawer() {
    Store.act.openDrawer(event.id)
    Store.act.dismissReminder()
  }

  const lunarShort = T('农历', 'lunar ') + (event.lunarText || Lunar.fmtLunarShort(event.epoch))

  return h(
    'div',
    { className: 'ss-reminder' },
    h(
      'button',
      {
        type: 'button',
        className: 'ss-reminder-main',
        onClick: openDrawer,
        title: T('查看详情', 'View details'),
        'aria-label': view.title + ' ' + view.countdown + T('，查看详情', ', view details'),
      },
      h(
        'span',
        { className: 'ss-reminder-title' },
        h('span', { className: 'ss-reminder-name' }, view.title),
        h('span', { className: 'ss-reminder-countdown' }, ' · ' + view.countdown),
      ),
      h('span', { className: 'ss-reminder-sub' }, view.ymd + ' · ' + lunarShort),
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'ss-reminder-close',
        onClick: dismiss,
        title: T('关闭提醒', 'Dismiss reminder'),
        'aria-label': T('关闭提醒', 'Dismiss reminder'),
      },
      SS.icon.close(13),
    ),
  )
}

/**
 * shell.overlay 常驻入口：安静提醒卡 + 全局弹层挂载点。
 *
 * `main` 是 keyed slot，切到别的面板会卸载 85-page 里的详情/添加弹层；这两个
 * 弹层在这里再挂一份，让「提醒点击查看详情」与「设置页添加纪念日」在任何
 * 面板下都可用。60/65 的 ssClaimDialogMount 保证同一时刻只有一份真正渲染。
 */
function QuietReminder() {
  useLocaleTick()
  const snap = Store.use()
  return h(
    Frag,
    null,
    snap.reminder ? h(QuietReminderCard, { reminder: snap.reminder }) : null,
    h(EventDrawer),
    h(AddAnniversaryDialog),
  )
}
