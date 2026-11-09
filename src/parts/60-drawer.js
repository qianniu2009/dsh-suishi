/* ============================================================================
 * 60-drawer.js — 事件详情弹层（节气 / 节令 / 自定义纪念日）
 *
 * 数据来自 Store 快照的 `drawer: { event, view }`；文案全部由 Store.describe
 * （EvView）提供，这里只负责视觉编排。弹层本身由 00-core 的 SSModal 负责
 * portal / Esc / 遮罩 / 焦点；因此本文件的样式必须完全全局（不依赖 .ss-root）。
 *
 * 参考图：_design/ref/p5-drawer.jpg、c6_drawer.png
 * ========================================================================== */

pushCss(`
.ss-drawer-modal{padding:38px 40px 26px;width:min(740px,calc(100vw - 48px))}
.ss-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:19px}
.ss-drawer-title{margin:0;font-family:var(--ss-serif);font-size:40px;font-weight:500;line-height:1.15;letter-spacing:.06em;color:var(--dsw-alias-label-primary)}
.ss-drawer-x{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin:-3px -7px 0 0;padding:0;border:0;border-radius:8px;background:transparent;color:var(--ss-ink-dim);cursor:pointer;transition:background-color .16s ease,color .16s ease}
.ss-drawer-x:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);color:var(--dsw-alias-label-primary)}
.ss-drawer-x:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ss-drawer-meta{display:flex;flex-direction:column;gap:6px}
.ss-drawer-date{font-size:18px;line-height:1.5;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}
.ss-drawer-lunar{font-size:16px;line-height:1.5;letter-spacing:.02em;color:var(--ss-ink-mid)}
.ss-drawer-countdown{margin-top:26px;font-size:15px;line-height:1.4;letter-spacing:.02em;color:var(--ss-coral)}
.ss-drawer-body{margin:26px 0 0;font-size:18px;line-height:1.95;letter-spacing:.015em;color:var(--dsw-alias-label-secondary)}
.ss-drawer-chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.ss-drawer-section{margin-top:30px}
.ss-drawer-label{font-size:14px;line-height:1.4;letter-spacing:.07em;color:var(--ss-ink-dim)}
.ss-drawer-hou-list{margin-top:14px;display:flex;flex-direction:column;gap:12px}
.ss-drawer-hou-row{display:grid;grid-template-columns:3.5em minmax(0,1fr);gap:14px;font-size:17px;line-height:1.65}
.ss-drawer-hou-name{color:var(--ss-ink-dim)}
.ss-drawer-hou-text{color:var(--dsw-alias-label-primary)}
.ss-drawer-customs{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.ss-drawer-custom{position:relative;padding-left:14px;font-size:14px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
.ss-drawer-custom::before{content:"";position:absolute;left:2px;top:.74em;width:4px;height:4px;border-radius:50%;background:var(--ss-gold);opacity:.6}
.ss-drawer-history{margin-top:40px}
.ss-drawer-hr{height:1px;background:var(--ss-hairline)}
.ss-drawer-history-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:22px}
.ss-drawer-history-col{display:flex;flex-direction:column;gap:8px;min-width:0}
.ss-drawer-history-value{font-size:16px;line-height:1.4;letter-spacing:.02em;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ss-drawer-foot{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:36px}
.ss-drawer-attrib{font-size:12.5px;line-height:1.55;letter-spacing:.02em;color:var(--ss-ink-dim)}
.ss-drawer-close-btn{height:40px;padding:0 24px;border-radius:10px;font-size:14px}
@media (max-width:560px){
  .ss-drawer-modal{padding:24px 20px 18px}
  .ss-drawer-title{font-size:28px}
  .ss-drawer-body{font-size:14px;line-height:1.85}
  .ss-drawer-foot{flex-direction:column;align-items:stretch;gap:12px}
  .ss-drawer-close-btn{align-self:flex-end}
}
`)

/* ------------------------------------------------------------------ mounts --- */

/**
 * 弹层挂载点仲裁。
 *
 * DSH 的 `main` 是 keyed slot：只有当前主面板会挂载，切到别的面板就会卸载
 * 85-page 里的 EventDrawer / AddAnniversaryDialog。为了让「右下角提醒」与
 * 「设置页里添加纪念日」在任何面板下都能弹出，80-reminder 在常驻的
 * shell.overlay 里又挂了一份同样的弹层。这里只让最先挂载的那一份真正渲染，
 * 其余实例静默让位，避免同一时刻出现两个遮罩。
 */
const SS_DIALOG_MOUNTS = { drawer: [], add: [] }
let ssDialogMountSeq = 0

/**
 * 返回本实例是否为当前渲染弹层的实例（必须无条件调用，内部只用 ref/effect）。
 * kind 区分不同弹层（详情 / 添加），各自独立仲裁。
 */
function ssClaimDialogMount(kind) {
  const bucket = SS_DIALOG_MOUNTS[kind] || (SS_DIALOG_MOUNTS[kind] = [])
  const entryRef = React.useRef(null)
  if (entryRef.current === null) {
    ssDialogMountSeq += 1
    entryRef.current = { seq: ssDialogMountSeq, mounted: true }
    bucket.push(entryRef.current)
  }
  React.useEffect(() => {
    const entry = entryRef.current
    entry.mounted = true
    // StrictMode 的「挂载 → 清理 → 再挂载」会先把条目移出桶，这里补回。
    if (bucket.indexOf(entry) < 0) bucket.push(entry)
    return () => {
      entry.mounted = false
      const index = bucket.indexOf(entry)
      if (index >= 0) bucket.splice(index, 1)
    }
  }, [kind])
  const entry = entryRef.current
  for (const candidate of bucket) {
    if (candidate.mounted) return candidate === entry
  }
  return true
}

/** 详情弹层里的一行「label + 值」（去年 / 明年）。 */
function ssDrawerHistoryColumn(label, value) {
  return h(
    'div',
    { className: 'ss-drawer-history-col' },
    h('span', { className: 'ss-drawer-label' }, label),
    h('span', { className: 'ss-drawer-history-value' }, value || '—'),
  )
}

/** 事件详情弹层。open 状态由 Store 快照的 drawer 驱动。 */
function EventDrawer() {
  useLocaleTick()
  const snap = Store.use()

  const close = React.useCallback(() => {
    Store.act.closeDrawer()
  }, [])

  // 多个挂载点只让一份渲染（主面板 keyed slot 卸载后由常驻浮层接管）。
  const isMountOwner = ssClaimDialogMount('drawer')
  if (!isMountOwner) return null

  const drawer = snap.drawer
  const view = drawer ? drawer.view : null

  const children = []

  if (view) {
    children.push(
      h(
        'div',
        { key: 'head', className: 'ss-drawer-head' },
        h('h2', { key: 'title', className: 'ss-drawer-title' }, view.title),
        h(
          'button',
          {
            key: 'close',
            type: 'button',
            className: 'ss-drawer-x',
            onClick: close,
            title: T('关闭', 'Close'),
            'aria-label': T('关闭', 'Close'),
          },
          SS.icon.close(18),
        ),
      ),
    )

    children.push(
      h(
        'div',
        { key: 'meta', className: 'ss-drawer-meta' },
        h('div', { className: 'ss-drawer-date' }, view.longDate + ' · ' + view.weekday),
        h('div', { className: 'ss-drawer-lunar' }, view.lunarLine),
      ),
    )

    children.push(h('div', { key: 'countdown', className: 'ss-drawer-countdown' }, view.countdown))

    if (view.body) {
      children.push(h('p', { key: 'body', className: 'ss-drawer-body' }, view.body))
    }

    const chips = Array.isArray(view.chips) ? view.chips : []
    if (chips.length > 0) {
      children.push(
        h(
          'div',
          { key: 'chips', className: 'ss-drawer-chips' },
          chips.map((chip, index) =>
            h(SSChip, { key: 'chip' + index, tone: view.kindTone }, typeof chip === 'string' ? chip : chip.label),
          ),
        ),
      )
    }

    if (Array.isArray(view.hou) && view.hou.length > 0) {
      children.push(
        h(
          'section',
          { key: 'hou', className: 'ss-drawer-section ss-drawer-hou' },
          h('div', { className: 'ss-drawer-label' }, T('三候', 'Three pentads')),
          h(
            'div',
            { className: 'ss-drawer-hou-list' },
            view.hou.map((item, index) =>
              h(
                'div',
                { key: 'hou' + index, className: 'ss-drawer-hou-row' },
                h('span', { className: 'ss-drawer-hou-name' }, item.name),
                h('span', { className: 'ss-drawer-hou-text' }, item.text),
              ),
            ),
          ),
        ),
      )
    }

    if (Array.isArray(view.customs) && view.customs.length > 0) {
      children.push(
        h(
          'section',
          { key: 'customs', className: 'ss-drawer-section ss-drawer-customs-wrap' },
          h('div', { className: 'ss-drawer-label' }, T('习俗', 'Customs')),
          h(
            'ul',
            { className: 'ss-drawer-customs' },
            view.customs.map((text, index) => h('li', { key: 'custom' + index, className: 'ss-drawer-custom' }, text)),
          ),
        ),
      )
    }

    if (view.isAnnual !== false) {
      children.push(
        h(
          'section',
          { key: 'history', className: 'ss-drawer-history' },
          h('div', { className: 'ss-drawer-hr' }),
          h(
            'div',
            { className: 'ss-drawer-history-grid' },
            ssDrawerHistoryColumn(T('去年', 'Last year'), view.prevYmd),
            ssDrawerHistoryColumn(T('明年', 'Next year'), view.nextYmd),
          ),
        ),
      )
    }

    children.push(
      h(
        'div',
        { key: 'foot', className: 'ss-drawer-foot' },
        h(
          'span',
          { className: 'ss-drawer-attrib' },
          T('农历与节气数据来自香港天文台年历', 'Lunar and solar-term data from the Hong Kong Observatory almanac'),
        ),
        h(
          SSButton,
          { key: 'btn', variant: 'ghost', size: 'md', className: 'ss-drawer-close-btn', onClick: close },
          T('关闭', 'Close'),
        ),
      ),
    )
  }

  return h(
    SSModal,
    {
      open: Boolean(view),
      onClose: close,
      className: 'ss-drawer-modal',
      ariaLabel: view ? view.title : undefined,
    },
    children,
  )
}
