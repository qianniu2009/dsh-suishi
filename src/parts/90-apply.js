/* ============================================================================
 * 90-apply.js — 插件入口与槽位注册
 *
 * 这个 part 是 factory 的最后一段：声明依赖、注入全局样式、启动跨天心跳，
 * 并把主面板 / 侧栏图标 / 侧栏胶囊 / 设置分区 / 安静提醒注册到对应的槽位。
 * ========================================================================== */

/** 主面板 id：sidebar.panellist 的 id 与 main 的 key 必须一致。 */
const SUISHI_PANEL_ID = 'suishi'

/** 客户端服务依赖。 */
const inject = ['slots', 'locale', 'layout']

/** 侧栏全局面板图标（年轮意象；选中时朱砂色）。 */
function SuishiPanelIcon(props) {
  const size = props && props.size ? props.size : 16
  const color = props && props.active ? 'var(--ss-coral-bright)' : 'currentColor'
  return h(
    'span',
    {
      className: 'ss-panel-icon',
      style: { width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      'aria-hidden': 'true',
    },
    SS.icon.ring(size, color),
  )
}

/** 插件入口。 */
function apply(ctx) {
  // ---- 语言：跟随 DSH 当前语言 ----
  const locale = typeof ctx.get === 'function' ? ctx.get('locale') : ctx.locale
  try {
    if (locale && typeof locale.getLocale === 'function') {
      const snapshot = locale.getLocale()
      SS_setLocale(snapshot && snapshot.active ? snapshot.active : 'zh')
    }
  } catch {
    /* 保留默认 zh */
  }
  ctx.effect(() => {
    if (!locale || typeof locale.subscribe !== 'function') return undefined
    return locale.subscribe((snapshot) => {
      SS_setLocale(snapshot && snapshot.active ? snapshot.active : 'zh')
      SS_notifyLocale()
      Store.act.localeChanged()
    })
  }, 'suishi: locale')

  // ---- 样式：一次性注入全部 part 的 CSS ----
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-dsh-suishi', '')
    style.textContent = SS_CSS_CHUNKS.join('\n')
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, 'suishi: styles')

  // ---- 跨天心跳：每 30 秒检查一次「今天」，页面重新可见时也检查 ----
  ctx.effect(() => {
    const tick = () => {
      try {
        Store.act.refreshNow()
      } catch {
        /* 保持静默，下一拍重试 */
      }
    }
    const timer = window.setInterval(tick, 30000)
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, 'suishi: day ticker')

  // ---- 槽位注册 ----
  const disposers = []
  const register = (owner, options, component) => {
    const dispose = ctx.slots.inject(owner, () => ctx.slots.register(options, component))
    disposers.push(dispose)
  }

  try {
    register('main', { name: 'main', key: SUISHI_PANEL_ID }, SuishiPage)
    register(
      'sidebar.panellist',
      {
        name: 'sidebar.panellist',
        id: SUISHI_PANEL_ID,
        order: 30,
        label: () => T('岁时', 'Suishi'),
      },
      SuishiPanelIcon,
    )
    register(
      'sidebar.footer.action',
      {
        name: 'sidebar.footer.action',
        id: 'suishi-capsule',
        order: 20,
        label: () => T('距春节', 'Spring Festival countdown'),
        inject: () => ({
          onOpen: () => {
            try {
              ctx.layout.selectPanel(SUISHI_PANEL_ID)
            } catch {
              /* 主面板尚未注册时保持原状 */
            }
          },
        }),
      },
      SuishiCapsule,
    )
    register(
      'settings.section',
      {
        name: 'settings.section',
        id: 'suishi',
        order: 55,
        label: () => T('岁时', 'Suishi'),
      },
      SuishiSettingsPage,
    )
    register(
      'settings.section.icon',
      {
        name: 'settings.section.icon',
        id: 'suishi',
        order: 55,
      },
      SuishiSettingsIcon,
    )
    register(
      'shell.overlay',
      {
        name: 'shell.overlay',
        id: 'suishi-reminder',
        order: 45,
        label: () => T('岁时提醒', 'Suishi reminder'),
      },
      QuietReminder,
    )
  } catch (error) {
    console.error('[suishi] slot registration failed:', error)
  }

  ctx.effect(
    () => () => {
      for (const dispose of disposers) {
        try {
          if (typeof dispose === 'function') dispose()
        } catch {
          /* 上下文销毁时可能已被回收 */
        }
      }
    },
    'suishi: slot disposers',
  )
}
