/* ============================================================================
 * 45-nextcard.js — 主面板「下一个」卡
 *
 * 读 Store 快照里未来一年的可见首项（snap.next）与次项（snap.afterNext），
 * 渲染「下一个」大卡：类别胶囊、serif 大标题、朱砂倒计时、公历 + 农历两行
 * 说明与「再之后」提示；底部一段 flex 留白把「详情 / 复制」压到卡片底边。
 * 复制成功后按钮短暂显示「已复制」（snap.copied === 当前事件 id）。
 * 依赖：00-core（h / SS / T / SSPill / SSButton / useLocaleTick）、
 *       30-store（Store.use / Store.describe / Store.act）。
 * ========================================================================== */

/** 主面板「下一个」卡（整张卡片，含卡片头；由 85-page 直接放置）。 */
function NextCard() {
  useLocaleTick()
  const snap = Store.use()
  const next = snap.next

  // 空态：未来一年没有任何可见事件
  if (!next) {
    return h(
      'section',
      { className: 'ss-card ss-card-next ss-nextcard ss-nextcard-empty' },
      h('div', { className: 'ss-nextcard-head' }, h('span', { className: 'ss-nextcard-label' }, T('下一个', 'Next'))),
      h('div', { className: 'ss-nextcard-empty-body' }, T('未来一年没有安排', 'Nothing planned for the year ahead')),
    )
  }

  const view = Store.describe(next)
  const after = snap.afterNext
  const afterView = after ? Store.describe(after) : null
  const copyState = snap.copied === next.id ? 'copied' : snap.copied === 'failed' ? 'failed' : 'idle'
  const copyLabel =
    copyState === 'copied' ? T('已复制', 'Copied') : copyState === 'failed' ? T('复制失败', 'Copy failed') : T('复制', 'Copy')

  // 「再之后 小雪 · 11.22 · 18 天后」
  const afterText =
    after && afterView
      ? T('再之后 ', 'then ') + afterView.title + ' · ' + SS.fmt.mmdd(after.epoch) + ' · ' + afterView.countdown
      : ''

  return h(
    'section',
    { className: 'ss-card ss-card-next ss-nextcard' },
    h(
      'div',
      { className: 'ss-nextcard-head' },
      h('span', { className: 'ss-nextcard-label' }, T('下一个', 'Next')),
      h(SSPill, { tone: view.kindTone, className: 'ss-nextcard-pill' }, view.kindLabel),
    ),
    h(
      'div',
      { className: 'ss-nextcard-title-row' },
      h('h2', { className: 'ss-nextcard-title' }, view.title),
      h('span', { className: 'ss-nextcard-countdown ss-num' }, view.countdown),
    ),
    h('div', { className: 'ss-nextcard-date ss-num' }, view.ymd + ' · ' + view.weekday),
    h('div', { className: 'ss-nextcard-lunar' }, view.subtitle),
    afterText ? h('div', { className: 'ss-nextcard-after' }, afterText) : null,
    h('div', { className: 'ss-nextcard-spacer', 'aria-hidden': 'true' }),
    h(
      'div',
      { className: 'ss-nextcard-actions' },
      h(
        SSButton,
        {
          variant: 'accent',
          className: 'ss-nextcard-detail',
          'aria-label': T('查看' + view.title + '详情', 'View details for ' + view.title),
          onClick() {
            Store.act.openDrawer(next.id)
          },
        },
        T('详情', 'Details'),
      ),
      h(
        SSButton,
        {
          variant: 'ghost',
          className: SS.cls('ss-nextcard-copy', copyState === 'copied' ? 'ss-nextcard-copied' : copyState === 'failed' ? 'ss-nextcard-copy-failed' : null),
          onClick() {
            Store.act.copyEvent(next.id)
          },
        },
        h('span', { className: 'ss-nextcard-copy-label', 'aria-live': 'polite' }, copyLabel),
      ),
    ),
  )
}

pushCss(`
/* ---------- 「下一个」卡 ---------- */
.ss-nextcard-head{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;line-height:1.4;letter-spacing:.05em;color:var(--ss-ink-dim)}
.ss-nextcard-label{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.ss-nextcard-title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-top:24px}
.ss-nextcard-title{margin:0;font-family:var(--ss-serif);font-size:43px;font-weight:500;line-height:1.1;letter-spacing:.06em;color:var(--dsw-alias-label-primary)}
.ss-nextcard-countdown{flex:none;padding-bottom:6px;font-size:14.5px;line-height:1.2;letter-spacing:.02em;color:var(--ss-coral);white-space:nowrap}
.ss-nextcard-date{margin-top:19px;font-size:15px;line-height:1.4;letter-spacing:.02em;color:var(--ss-ink-mid)}
.ss-nextcard-lunar{margin-top:14px;font-size:13.5px;line-height:1.5;letter-spacing:.02em;color:var(--ss-ink-dim)}
.ss-nextcard-after{margin-top:12px;font-size:13px;line-height:1.5;letter-spacing:.02em;color:var(--ss-ink-dim)}
.ss-nextcard-spacer{flex:1 1 auto;min-height:30px}
.ss-nextcard-actions{display:flex;align-items:center;gap:9px;margin-top:20px}
.ss-nextcard-actions .ss-btn{height:38px;padding:0 19px;font-size:14px;border-radius:10px}
.ss-nextcard-actions .ss-btn.ss-nextcard-copied{color:var(--ss-coral-bright);border-color:rgba(217,119,104,.34);background:transparent}
.ss-nextcard-actions .ss-btn.ss-nextcard-copy-failed{color:var(--dsw-alias-state-error-primary);border-color:rgba(214,69,69,.34);background:transparent}
.ss-nextcard-empty-body{margin:auto 0;padding:36px 0;font-size:13px;line-height:1.7;letter-spacing:.02em;color:var(--ss-ink-dim);text-align:center}

@media (max-width:520px){
  .ss-nextcard-title{font-size:32px}
  .ss-nextcard-title-row{margin-top:14px}
  .ss-nextcard-date{margin-top:12px}
  .ss-nextcard-actions .ss-btn{height:32px;padding:0 14px}
}
`)
