/* ============================================================================
 * 50-anniversaries.js — 主面板「我的纪念日」
 *
 * 标题行（复用公共 ss-section-title）+ 右侧「添加纪念日」按钮；列表来自
 * Store 快照的 snap.anniversaries（已按下次发生时间升序）：
 *   名称 / 「农历六月初四 · 每年 · 2027.07.07」/ 右侧「N 天后」+ 删除 ×。
 * 删除直接生效（不做确认，按钮 hover 转为错误色）；留空时给一行 dim 引导。
 * 依赖：00-core（h / SS / T / SSSectionTitle / SSButton / useLocaleTick）、
 *       30-store（Store.use / Store.act）。
 * ========================================================================== */

/** 主面板「我的纪念日」整块（标题行 + 行列表 + 空态引导）。 */
function AnniversarySection() {
  useLocaleTick()
  const snap = Store.use()
  const items = snap.anniversaries || []

  return h(
    'section',
    { className: 'ss-anniv' },
    h(
      SSSectionTitle,
      {
        className: 'ss-anniv-head',
        extra: h(
          SSButton,
          {
            variant: 'ghost',
            size: 'sm',
            className: 'ss-anniv-add',
            onClick() {
              Store.act.openAddDialog()
            },
          },
          T('添加纪念日', 'Add anniversary'),
        ),
      },
      T('我的纪念日', 'My anniversaries'),
    ),
    items.length === 0
      ? h('p', { className: 'ss-anniv-empty' }, T('记下重要的日子：生日、纪念日…', 'Keep the days that matter: birthdays, anniversaries…'))
      : h(
          'ul',
          { className: 'ss-anniv-list' },
          items.map((item) =>
            h(
              'li',
              { key: item.id, className: 'ss-anniv-row' },
              h(
                'div',
                { className: 'ss-anniv-main' },
                h('div', { className: 'ss-anniv-name' }, item.name),
                h(
                  'div',
                  { className: 'ss-anniv-sub' },
                  item.subtitle ||
                    item.ruleText + ' · ' + T('每年', 'every year') + ' · ' + item.ymd,
                ),
              ),
              h(
                'div',
                { className: 'ss-anniv-right' },
                h('span', { className: 'ss-anniv-days ss-num' }, SS.fmt.countdown(item.days)),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'ss-anniv-del',
                    'aria-label': T('删除纪念日「' + item.name + '」', 'Delete anniversary "' + item.name + '"'),
                    title: T('删除', 'Delete'),
                    onClick() {
                      Store.act.removeAnniversary(item.id)
                    },
                  },
                  SS.icon.close(14),
                ),
              ),
            ),
          ),
        ),
  )
}

pushCss(`
/* ---------- 我的纪念日 ---------- */
.ss-anniv{margin-top:2px}
.ss-anniv-head{margin-bottom:12px}
.ss-anniv-list{list-style:none;margin:0;padding:0}
.ss-anniv-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 0}
.ss-anniv-main{min-width:0}
.ss-anniv-name{font-size:15px;line-height:1.45;letter-spacing:.01em;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-anniv-sub{margin-top:2px;font-size:12.5px;line-height:1.45;letter-spacing:.01em;color:var(--ss-ink-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-anniv-right{display:flex;align-items:center;gap:14px;flex:none}
.ss-anniv-days{font-size:12.5px;line-height:1.4;letter-spacing:.02em;color:var(--ss-ink-mid);white-space:nowrap}
.ss-anniv-del{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--ss-ink-dim);cursor:pointer;transition:color .15s ease,background-color .15s ease,border-color .15s ease}
.ss-anniv-del:hover{color:var(--dsw-alias-state-error-primary);background:rgba(214,69,69,.12);border-color:rgba(214,69,69,.22)}
.ss-anniv-del:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ss-anniv-empty{margin:6px 2px 0;padding:2px 0;font-size:12.5px;line-height:1.6;letter-spacing:.02em;color:var(--ss-ink-dim)}

@media (max-width:520px){
  .ss-anniv-row{padding:10px 0}
  .ss-anniv-right{gap:10px}
}
`)
