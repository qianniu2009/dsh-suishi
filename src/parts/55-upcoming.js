/* ============================================================================
 * 55-upcoming.js — 主面板「接下来」长列表
 *
 * 按 Store 快照的公历月分组（snap.groups）铺开未来一年：每组一行月份标题
 * 「2026 年 11 月」+ 右侧细线；组内每行左侧「11.07 / 周六」、按类别着色的
 * 圆点 + 名称、下一行副标（如「节气 · 农历九月廿九」）、右侧倒计时。
 * 整行是一个 button：鼠标 hover 轻微提亮，键盘 Enter/Space 打开详情弹层。
 * 依赖：00-core（h / SS / T / SSSectionTitle / useLocaleTick）、
 *       30-store（Store.use / Store.describe / Store.act）。
 * ========================================================================== */

/** 主面板「接下来」整块（标题行 + 按月分组的长列表 / 空态）。 */
function UpcomingList() {
  useLocaleTick()
  const snap = Store.use()
  const groups = snap.groups || []

  return h(
    'section',
    { className: 'ss-upcoming' },
    h(
      SSSectionTitle,
      {
        className: 'ss-upcoming-head',
        extra: T('未来一年 · ' + snap.count, 'next year · ' + snap.count),
      },
      T('接下来', 'Upcoming'),
    ),
    groups.length === 0
      ? h('p', { className: 'ss-upcoming-empty' }, T('这一年，留白也很好。', 'A blank year can be lovely too.'))
      : groups.map((group) =>
          h(
            'div',
            { key: group.key, className: 'ss-upcoming-group' },
            h(
              'div',
              { className: 'ss-upcoming-group-head' },
              h('span', { className: 'ss-upcoming-group-label' }, group.label),
              h('span', { className: 'ss-upcoming-group-line', 'aria-hidden': 'true' }),
            ),
            h(
              'ul',
              { className: 'ss-upcoming-rows' },
              group.items.map((event) => {
                const view = Store.describe(event)
                return h(
                  'li',
                  { key: event.id, className: 'ss-upcoming-item' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ss-upcoming-row',
                      onClick() {
                        Store.act.openDrawer(event.id)
                      },
                    },
                    h(
                      'span',
                      { className: 'ss-upcoming-date' },
                      h('span', { className: 'ss-upcoming-date-md ss-num' }, SS.fmt.mmdd(event.epoch)),
                      h('span', { className: 'ss-upcoming-date-wd' }, SS.fmt.weekday(event.epoch)),
                    ),
                    h(
                      'span',
                      { className: 'ss-upcoming-main' },
                      h(
                        'span',
                        { className: 'ss-upcoming-name-line' },
                        h('span', {
                          className: 'ss-upcoming-dot ss-upcoming-dot-' + view.kindTone,
                          'aria-hidden': 'true',
                        }),
                        h('span', { className: 'ss-upcoming-name' }, view.title),
                      ),
                      h('span', { className: 'ss-upcoming-sub' }, view.subtitle),
                    ),
                    h('span', { className: 'ss-upcoming-count ss-num' }, view.countdown),
                  ),
                )
              }),
            ),
          ),
        ),
  )
}

pushCss(`
/* ---------- 接下来 ---------- */
.ss-upcoming{margin-top:2px}
.ss-upcoming-head{margin-top:44px;margin-bottom:10px}
.ss-upcoming-group{margin-top:26px}
.ss-upcoming-group:first-child{margin-top:18px}
.ss-upcoming-group-head{display:flex;align-items:center;gap:16px;margin:0 0 4px;font-size:12.5px;line-height:1.5;letter-spacing:.05em;color:var(--ss-ink-dim)}
.ss-upcoming-group-label{flex:none}
.ss-upcoming-group-line{flex:1 1 auto;min-width:24px;height:1px;background:var(--ss-hairline)}
.ss-upcoming-rows{list-style:none;margin:0;padding:0}
.ss-upcoming-item{margin:0;padding:0}
.ss-upcoming-row{box-sizing:border-box;display:flex;align-items:center;width:calc(100% + 20px);margin:0 -10px;padding:12px 10px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color .16s ease}
.ss-upcoming-row:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)}
.ss-upcoming-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ss-upcoming-date{display:flex;flex:none;flex-direction:column;width:58px;margin-right:18px}
.ss-upcoming-date-md{font-size:15px;line-height:1.35;letter-spacing:.03em;color:var(--dsw-alias-label-primary)}
.ss-upcoming-date-wd{margin-top:1px;font-size:12.5px;line-height:1.4;letter-spacing:.02em;color:var(--ss-ink-dim)}
.ss-upcoming-main{display:flex;flex:1 1 auto;flex-direction:column;min-width:0}
.ss-upcoming-name-line{display:flex;align-items:center;gap:10px;min-width:0}
.ss-upcoming-dot{flex:none;width:5px;height:5px;border-radius:50%}
.ss-upcoming-dot-gold{background:var(--ss-gold)}
.ss-upcoming-dot-coral{background:var(--ss-coral)}
.ss-upcoming-dot-ivory{background:var(--ss-ivory)}
.ss-upcoming-name{font-size:15.5px;line-height:1.35;letter-spacing:.01em;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-upcoming-sub{margin-top:2px;padding-left:15px;font-size:12.5px;line-height:1.45;letter-spacing:.01em;color:var(--ss-ink-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-upcoming-count{flex:none;margin-left:18px;font-size:12.5px;line-height:1.4;letter-spacing:.02em;color:var(--ss-ink-mid);white-space:nowrap}
.ss-upcoming-empty{margin:8px 2px 0;font-size:12.5px;line-height:1.6;letter-spacing:.02em;color:var(--ss-ink-dim)}

@media (max-width:620px){
  .ss-upcoming-date{width:50px;margin-right:12px}
  .ss-upcoming-count{margin-left:10px}
  .ss-upcoming-sub{font-size:12px}
}
`)
