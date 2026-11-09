/* ============================================================================
 * 00-core.js — 岁时插件共享基础设施
 *
 * 本文件定义所有 part 共用的命名空间 SS：CSS 收集、运行时 i18n、时间格式、
 * 内联图标、公共小组件（按钮 / 胶囊 / 弹层）与 localStorage 封装。
 * 约定：本文件必须最先加载；后续 part 只依赖这里导出的名字。
 * ========================================================================== */

/** 插件版本，显示在设置页。 */
const SUISHI_VERSION = '1.0.0'

/** 各 part 通过 pushCss() 追加样式；apply 时统一注入并在卸载时移除。 */
const SS_CSS_CHUNKS = []
function pushCss(css) {
  if (css) SS_CSS_CHUNKS.push(String(css))
}

/* ---------------------------------------------------------------- i18n --- */

/** 当前 DSH 语言 id（由 90-apply 跟随 locale 服务更新）。 */
let SS_LOCALE = 'zh'
const SS_LOCALE_LISTENERS = new Set()

function SS_setLocale(id) {
  SS_LOCALE = String(id || 'zh')
}
/** 语言变化时通知已挂载的界面重渲染。 */
function SS_notifyLocale() {
  SS_LOCALE_LISTENERS.forEach((fn) => {
    try {
      fn()
    } catch {
      /* 单个订阅者失败不影响其它界面 */
    }
  })
}

/** 中英双语文案：中文环境返回 zh，其它返回 en。 */
function T(zh, en) {
  return SS_LOCALE.toLowerCase().indexOf('zh') === 0 ? zh : en
}

/** 订阅语言变化并触发本组件重渲染。 */
function useLocaleTick() {
  const [, force] = React.useState(0)
  React.useEffect(() => {
    const listener = () => force((value) => value + 1)
    SS_LOCALE_LISTENERS.add(listener)
    return () => {
      SS_LOCALE_LISTENERS.delete(listener)
    }
  }, [])
}

/* ----------------------------------------------------------- utilities --- */

const SS = { VERSION: SUISHI_VERSION }

SS.tr = T

/** 拼接 className：忽略 null / undefined / false。 */
SS.cls = function cls() {
  let out = ''
  for (let index = 0; index < arguments.length; index += 1) {
    const part = arguments[index]
    if (!part) continue
    out = out ? out + ' ' + part : String(part)
  }
  return out
}

SS.pad2 = function pad2(value) {
  return (value < 10 ? '0' : '') + value
}

/** 稳定唯一 id（自定义纪念日等）。 */
SS.uid = function uid() {
  return 'ss' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** localStorage 封装：所有键加 `dsh.suishi.v1.` 前缀，异常时静默降级。 */
const SS_STORAGE_PREFIX = 'dsh.suishi.v1.'
SS.load = function load(key, fallback) {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return fallback
    const raw = localStorage.getItem(SS_STORAGE_PREFIX + key)
    if (raw === null || raw === undefined) return fallback
    const parsed = JSON.parse(raw)
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}
SS.save = function save(key, value) {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return
    localStorage.setItem(SS_STORAGE_PREFIX + key, JSON.stringify(value))
  } catch {
    /* 隐私模式/配额不足时保持内存态可用 */
  }
}

/** 当天 epoch day（本地日历语义）。 */
SS.todayEpoch = function todayEpoch() {
  const now = new Date()
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000)
}

/* ------------------------------------------------------------- formatting --- */

const SS_WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const SS_WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

SS.fmt = {
  /** 2027.02.06 */
  ymd(epoch) {
    const date = Lunar.dateOf(epoch)
    return date.y + '.' + SS.pad2(date.m) + '.' + SS.pad2(date.d)
  },
  /** 11.07 */
  mmdd(epoch) {
    const date = Lunar.dateOf(epoch)
    return SS.pad2(date.m) + '.' + SS.pad2(date.d)
  },
  /** 11 月 22 日 */
  md(epoch) {
    const date = Lunar.dateOf(epoch)
    return date.m + ' 月 ' + date.d + ' 日'
  },
  /** 2026 年 11 月 7 日 */
  longDate(epoch) {
    const date = Lunar.dateOf(epoch)
    return date.y + ' 年 ' + date.m + ' 月 ' + date.d + ' 日'
  },
  /** 周六 */
  weekday(epoch) {
    const index = Lunar.weekdayOf(epoch)
    return T(SS_WEEKDAYS_ZH[index], SS_WEEKDAYS_EN[index])
  },
  /** 今天 / 明天 / 后天 / 3 天后 */
  countdown(days) {
    if (days <= 0) return T('今天', 'today')
    if (days === 1) return T('明天', 'tomorrow')
    if (days === 2) return T('后天', 'in 2 days')
    return T(days + ' 天后', 'in ' + days + ' days')
  },
  /** 农历九月廿九 */
  lunarLong(epoch) {
    return T('农历' + Lunar.fmtLunarShort(epoch), 'lunar ' + Lunar.fmtLunarShort(epoch))
  },
  /** 农历九月廿九 · 丙午年 */
  lunarFull(epoch) {
    const short = Lunar.fmtLunarShort(epoch)
    const info = Lunar.fromEpoch(epoch)
    return T('农历' + short + ' · ' + info.gz + '年', 'lunar ' + short + ' · ' + info.gz)
  },
  /** 距春节 94 天（胶囊用） */
  capsule(days) {
    if (days <= 0) return T('春节', 'Spring Festival')
    return T('距春节 ' + days + ' 天', days + ' days to Spring Festival')
  },
}

/* ----------------------------------------------------------------- icons --- */

function ssSvg(size, children, extra) {
  const props = {
    width: size || 16,
    height: size || 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }
  if (extra) Object.assign(props, extra)
  return h('svg', props, children)
}

SS.icon = {
  /** 年轮圆环：胶囊/面板图标意象。 */
  ring(size, accent) {
    const color = accent || 'currentColor'
    return h(
      'svg',
      {
        width: size || 16,
        height: size || 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('circle', { cx: 8, cy: 8, r: 6, stroke: color, strokeOpacity: 0.55, strokeWidth: 1 }),
      h('path', {
        d: 'M8 2 A6 6 0 0 1 14 8',
        stroke: color,
        strokeWidth: 1.6,
        strokeLinecap: 'round',
      }),
      h('circle', { cx: 8, cy: 2, r: 1.35, fill: 'var(--ss-ivory, #f2efe9)' }),
      h('circle', { cx: 13.2, cy: 10.6, r: 0.95, fill: 'var(--ss-coral, #d97768)' }),
      h('circle', { cx: 10, cy: 13.4, r: 0.8, fill: 'var(--ss-gold, #b99c6b)' }),
    )
  },
  close(size) {
    return ssSvg(size, [h('path', { d: 'M4.2 4.2 L11.8 11.8' }), h('path', { d: 'M11.8 4.2 L4.2 11.8' })])
  },
  plus(size) {
    return ssSvg(size, [h('path', { d: 'M8 3.4 V12.6' }), h('path', { d: 'M3.4 8 H12.6' })])
  },
  copy(size) {
    return ssSvg(size, [
      h('rect', { x: 5.4, y: 5.4, width: 7.2, height: 7.2, rx: 1.6 }),
      h('path', { d: 'M10.6 5.4 V4.2 A1.8 1.8 0 0 0 8.8 2.4 H4.2 A1.8 1.8 0 0 0 2.4 4.2 V8.8 A1.8 1.8 0 0 0 4.2 10.6 H5.4' }),
    ])
  },
  check(size) {
    return ssSvg(size, [h('path', { d: 'M3.2 8.4 L6.4 11.4 L12.8 4.8' })])
  },
  chevron(size) {
    return ssSvg(size, [h('path', { d: 'M4 6.2 L8 10.2 L12 6.2' })])
  },
  calendar(size) {
    return ssSvg(size, [
      h('rect', { x: 2.4, y: 3.4, width: 11.2, height: 10.2, rx: 1.8 }),
      h('path', { d: 'M2.4 6.6 H13.6' }),
      h('path', { d: 'M5.4 2.2 V4.6' }),
      h('path', { d: 'M10.6 2.2 V4.6' }),
    ])
  },
  gear(size) {
    return ssSvg(size, [
      h('circle', { cx: 8, cy: 8, r: 2.2 }),
      h('path', {
        d: 'M8 1.8 V3.4 M8 12.6 V14.2 M1.8 8 H3.4 M12.6 8 H14.2 M3.6 3.6 L4.7 4.7 M11.3 11.3 L12.4 12.4 M12.4 3.6 L11.3 4.7 M4.7 11.3 L3.6 12.4',
      }),
    ])
  },
}

/* ------------------------------------------------------------------ 小组件 --- */

/**
 * 通用按钮。variant: solid | ghost | accent | plain | danger
 */
function SSButton(props) {
  const variant = props.variant || 'ghost'
  const size = props.size || 'md'
  return h(
    'button',
    {
      type: 'button',
      className: SS.cls('ss-btn', 'ss-btn-' + variant, 'ss-btn-' + size, props.className),
      onClick: props.onClick,
      disabled: props.disabled,
      title: props.title,
      'aria-label': props['aria-label'],
      'aria-pressed': props['aria-pressed'],
    },
    props.children,
  )
}

/** 类别胶囊/标签。tone: coral | gold | ivory | dim */
function SSPill(props) {
  return h('span', { className: SS.cls('ss-pill', 'ss-pill-' + (props.tone || 'dim'), props.className) }, props.children)
}

/** 详情弹层里的信息 chip。 */
function SSChip(props) {
  return h('span', { className: SS.cls('ss-chip', props.tone ? 'ss-chip-' + props.tone : '', props.className) }, props.children)
}

function SSSectionTitle(props) {
  return h(
    'div',
    { className: SS.cls('ss-section-title', props.className) },
    h('span', { className: 'ss-section-title-text' }, props.children),
    props.extra ? h('span', { className: 'ss-section-title-extra' }, props.extra) : null,
  )
}

/** 懒加载 react-dom（弹层 portal 到 body，避免被滚动容器裁剪）。 */
let SS_REACT_DOM
function ssReactDom() {
  if (SS_REACT_DOM !== undefined) return SS_REACT_DOM
  try {
    // eslint-disable-next-line no-undef
    SS_REACT_DOM = require('react-dom')
  } catch {
    SS_REACT_DOM = null
  }
  return SS_REACT_DOM
}

/**
 * 居中弹层。open 为 false 时不渲染；支持 Esc / 遮罩点击关闭、焦点移入。
 */
function SSModal(props) {
  const open = Boolean(props.open)
  const onClose = props.onClose || (() => {})
  const maskRef = React.useRef(null)
  const cardRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    const timer = window.setTimeout(() => {
      const node = cardRef.current
      if (node && typeof node.focus === 'function') {
        node.focus({ preventScroll: true })
      }
    }, 20)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(timer)
    }
  }, [open, onClose])

  if (!open) return null

  const card = h(
    'div',
    {
      ref: cardRef,
      className: SS.cls('ss-modal-card', props.className),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': props.ariaLabel || undefined,
      tabIndex: -1,
    },
    props.children,
  )
  const mask = h(
    'div',
    {
      ref: maskRef,
      className: 'ss-modal-mask',
      onMouseDown(event) {
        if (event.target === event.currentTarget) onClose()
      },
    },
    card,
  )
  const dom = ssReactDom()
  if (dom && typeof dom.createPortal === 'function' && typeof document !== 'undefined') {
    return dom.createPortal(mask, document.body)
  }
  return mask
}

/** 复制文本，返回 Promise<boolean>。 */
SS.copy = function copy(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => false)
    }
    if (typeof document !== 'undefined' && document && document.body) {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.left = '-2000px'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand && document.execCommand('copy')
      document.body.removeChild(area)
      return Promise.resolve(Boolean(ok))
    }
  } catch {
    /* 降级为失败 */
  }
  return Promise.resolve(false)
}
