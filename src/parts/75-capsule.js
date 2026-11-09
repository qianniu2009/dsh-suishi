/* ============================================================================
 * 75-capsule.js — 侧栏底部常驻胶囊「距春节 94 天」
 *
 * 注册：sidebar.footer.action（owner props: { wide }），点击由 90-apply 注入的
 * inject.onOpen（ctx.layout.selectPanel('suishi')）完成导航。
 * wide=false 时侧栏是 56px 的 rail，只显示天数；完整文案放进 title / aria-label。
 * 设置里关掉胶囊时返回 null（注册本身保留）。
 * ========================================================================== */

pushCss(`
.ss-capsule{display:flex;align-items:center;gap:7px;box-sizing:border-box;width:100%;height:30px;margin:2px 0;padding:0 9px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--ss-ink-mid);font:inherit;text-align:left;cursor:pointer;overflow:hidden;transition:background-color .16s ease,border-color .16s ease,color .16s ease}
.ss-capsule:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--ss-hairline);color:var(--dsw-alias-label-primary)}
.ss-capsule:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ss-capsule[aria-current="page"]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ss-capsule-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--ss-coral-dim)}
.ss-capsule:hover .ss-capsule-icon{color:var(--ss-coral)}
.ss-capsule-label{flex:none;font-size:12.5px;line-height:1;letter-spacing:.02em;color:var(--ss-ink-dim);white-space:nowrap}
.ss-capsule:hover .ss-capsule-label{color:var(--ss-ink-mid)}
.ss-capsule-days{flex:none;margin-left:2px;font-size:12.5px;line-height:1;letter-spacing:.01em;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.ss-capsule-rail{justify-content:center;gap:0;width:36px;height:30px;margin:0 auto;padding:0;border-radius:8px}
.ss-capsule-rail .ss-capsule-days{flex:none;margin:0;font-size:10.5px;line-height:1;color:var(--ss-ink-mid);letter-spacing:0}
.ss-capsule-rail:hover .ss-capsule-days{color:var(--dsw-alias-label-primary)}
.ss-capsule-rail.ss-capsule-zero .ss-capsule-days{color:var(--ss-coral-bright)}
`)

/** 侧栏底部胶囊：wide 展开态显示「距春节 N 天」，rail 折叠态只显示 N。 */
function SuishiCapsule(props) {
  useLocaleTick()
  const snap = Store.use()
  const options = props || {}

  if (!snap.settings.capsuleEnabled) return null

  const days = snap.anchor.days
  const label = days > 0 ? T('距春节', 'to Spring Festival') : T('春节', 'Spring Festival')
  const value = days > 0 ? T(days + ' 天', days + ' d') : T('今天', 'today')
  const ariaLabel = SS.fmt.capsule(days)
  const wide = options.wide !== false

  const onOpen = typeof options.onOpen === 'function' ? options.onOpen : null
  const active = Boolean(options.active)

  const common = {
    type: 'button',
    className: SS.cls('ss-capsule', wide ? '' : 'ss-capsule-rail', days <= 0 ? 'ss-capsule-zero' : ''),
    title: ariaLabel,
    'aria-label': ariaLabel,
    'aria-current': active ? 'page' : undefined,
    onClick(event) {
      if (onOpen) {
        onOpen(event)
        return
      }
      if (typeof event.preventDefault === 'function') event.preventDefault()
    },
  }

  if (!wide) {
    return h('button', common, h('span', { className: 'ss-capsule-days' }, days <= 0 ? '0' : String(days)))
  }

  return h(
    'button',
    common,
    h('span', { className: 'ss-capsule-icon', 'aria-hidden': 'true' }, SS.icon.ring(16)),
    h('span', { className: 'ss-capsule-label' }, label),
    h('span', { className: 'ss-capsule-days' }, value),
  )
}
