/* ============================================================================
 * 85-page.js — 主面板页面组装
 *
 * 把页头（标题 + 农历副标 + 筛选）、两栏卡片（年轮 / 下一个）、下半区
 * （我的纪念日 / 接下来）与两个弹层组装成完整页面。组件本身分布在后半段
 * 各 part 中，这里只负责结构与滚动容器。
 * ========================================================================== */

/** 主面板页面：注册到 main 槽位的根组件。 */
function SuishiPage() {
  useLocaleTick()
  const snapshot = Store.use()

  const filters = h(
    'div',
    { className: 'ss-filters', role: 'group', 'aria-label': T('筛选', 'Filter') },
    snapshot.filters.map((filter) =>
      h(
        'button',
        {
          key: filter.key,
          type: 'button',
          className: 'ss-filter',
          'aria-pressed': snapshot.filter === filter.key,
          onClick: () => Store.act.setFilter(filter.key),
        },
        filter.label,
      ),
    ),
  )

  const ringCard = h(
    'section',
    { className: 'ss-card ss-card-ring', 'aria-label': T('年轮', 'Year ring') },
    h(
      'div',
      { className: 'ss-card-line' },
      h('span', null, T('年轮', 'Year ring')),
      h('span', null, T('未来一年', 'Next 12 months')),
    ),
    h(YearRing),
    h(RingLegend),
  )

  return h(
    'div',
    { className: 'ss-root' },
    h(
      'div',
      { className: 'ss-page' },
      h(
        'header',
        { className: 'ss-page-head' },
        h(
          'div',
          { className: 'ss-page-heading' },
          h('h1', { className: 'ss-page-title' }, T('岁时', 'Suishi')),
          h('p', { className: 'ss-page-sub' }, snapshot.today.subtitle),
        ),
        filters,
      ),
      h('div', { className: 'ss-cards' }, ringCard, h(NextCard)),
      h('div', { className: 'ss-lower' }, h(AnniversarySection), h(UpcomingList)),
    ),
    h(EventDrawer),
    h(AddAnniversaryDialog),
  )
}
