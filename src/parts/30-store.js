/* ============================================================================
 * 30-store.js — 岁时状态核心
 *
 * 把「今天 + 事件目录 + 自定义纪念日」折叠成 UI 只读快照：
 *   - 未来一年事件（24 节气 + 25 节令 + 自定义纪念日），按时间排序；
 *   - 筛选、下一个/再下一个、按公历月分组、春节锚点；
 *   - 详情弹层文本（Store.describe）、纪念日视图、提醒候选；
 *   - localStorage 持久化（纪念日 / 设置 / 当天提醒是否已读）；
 *   - 跨天刷新（90-apply 每分钟调用 Store.act.refreshNow）。
 * 依赖：11-lunar.js（Lunar）、20-festivals.js（TERMS_META / FESTIVALS_META）。
 * ========================================================================== */

/** 事件窗口：未来一年。 */
const SS_WINDOW_DAYS = 365

/** 默认设置。 */
const SS_DEFAULT_SETTINGS = {
  reminderEnabled: true,
  leadDays: 3,
  capsuleEnabled: true,
}

/** 允许的提醒提前天数。 */
const SS_LEAD_DAYS_CHOICES = [1, 2, 3, 5, 7]

const SS_KIND_ORDER = { festival: 0, solarterm: 1, custom: 2 }

/* ------------------------------------------------------------ persistence --- */

function ssLoadAnniversaries() {
  const raw = SS.load('anniversaries', [])
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (!item || typeof item.name !== 'string') continue
    const calendar = item.calendar === 'solar' ? 'solar' : 'lunar'
    const month = Math.min(12, Math.max(1, Math.round(Number(item.month) || 1)))
    const maxDay = calendar === 'solar' ? 31 : 30
    const day = Math.min(maxDay, Math.max(1, Math.round(Number(item.day) || 1)))
    out.push({ id: String(item.id || SS.uid()), name: item.name.slice(0, 24), calendar, month, day })
  }
  return out
}

function ssLoadSettings() {
  const stored = SS.load('settings', {})
  const next = Object.assign({}, SS_DEFAULT_SETTINGS)
  if (stored && typeof stored === 'object') {
    if (typeof stored.reminderEnabled === 'boolean') next.reminderEnabled = stored.reminderEnabled
    if (typeof stored.capsuleEnabled === 'boolean') next.capsuleEnabled = stored.capsuleEnabled
    if (SS_LEAD_DAYS_CHOICES.indexOf(Number(stored.leadDays)) >= 0) next.leadDays = Number(stored.leadDays)
  }
  return next
}

function ssLoadDismissed() {
  const raw = SS.load('reminder-dismissed', {})
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

/* -------------------------------------------------------- calendar helpers --- */

/** 农历某年某月（可闰）的天数（29/30）。 */
function ssLunarMonthLength(lunarYear, month, isLeap) {
  const epoch = Lunar.toEpoch(lunarYear, month, 1, isLeap)
  if (epoch === null) return 29
  return Lunar.toEpoch(lunarYear, month, 30, isLeap) === null ? 29 : 30
}

/** 从 fromEpoch 起，下一个农历 month/day（自动跨年，30 日小月回退到 29 日）。 */
function ssNextLunarDate(month, day, fromEpoch) {
  let lunarYear = Lunar.fromEpoch(fromEpoch).lunarYear
  for (let guard = 0; guard < 4; guard += 1) {
    const length = ssLunarMonthLength(lunarYear, month, false)
    const candidate = Lunar.toEpoch(lunarYear, month, Math.min(day, length), false)
    if (candidate !== null && candidate >= fromEpoch) return candidate
    lunarYear += 1
  }
  return null
}

/** 公历 month/day 从 fromEpoch 起（当年或次年；2/29 在平年退到 2/28）。 */
function ssNextSolarDate(month, day, fromEpoch) {
  const info = Lunar.dateOf(fromEpoch)
  for (let guard = 0; guard < 3; guard += 1) {
    const year = info.y + guard
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const epoch = Lunar.epochOf(year, month, Math.min(day, maxDay))
    if (epoch >= fromEpoch) return epoch
  }
  return null
}

/** 某年 month 月的第 nth 个 weekday（0=周日）。 */
function ssNthWeekdayOfMonth(year, month, weekday, nth) {
  const first = Lunar.epochOf(year, month, 1)
  const firstWeekday = Lunar.weekdayOf(first)
  const offset = (weekday - firstWeekday + 7) % 7
  const day = 1 + offset + (nth - 1) * 7
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > maxDay) return null
  return Lunar.epochOf(year, month, day)
}

/** 从 fromEpoch 起某 nth-weekday 规则的下一次出现。 */
function ssNextNthWeekday(month, weekday, nth, fromEpoch) {
  const info = Lunar.dateOf(fromEpoch)
  for (let guard = 0; guard < 3; guard += 1) {
    const year = info.y + guard
    const epoch = ssNthWeekdayOfMonth(year, month, weekday, nth)
    if (epoch !== null && epoch >= fromEpoch) return epoch
  }
  return null
}

/** 单个节日/纪念日规则的下一次出现（含 fromEpoch 当天）。 */
function ssNextOccurrence(meta, fromEpoch) {
  if (meta.calendar === 'lunar') return ssNextLunarDate(meta.month, meta.day, fromEpoch)
  if (meta.calendar === 'solar') return ssNextSolarDate(meta.month, meta.day, fromEpoch)
  if (meta.calendar === 'nth-weekday') return ssNextNthWeekday(meta.month, meta.weekday, meta.nth, fromEpoch)
  if (meta.calendar === 'special') {
    const spring = Lunar.nextSpringFestival(fromEpoch).epoch
    if (meta.rule === 'spring-festival') return spring
    if (meta.rule === 'eve-of-spring-festival') {
      let eve = spring - 1
      if (eve < fromEpoch) {
        const nextSpring = Lunar.nextSpringFestival(spring + 1).epoch
        eve = nextSpring - 1
      }
      return eve
    }
  }
  return null
}

/** 严格早于 epoch 的上一次出现（周年规则；最多回看 2 年）。 */
function ssPrevOccurrence(meta, epoch) {
  let cursor = epoch - 420
  let occurrence = ssNextOccurrence(meta, cursor)
  let previous = null
  for (let guard = 0; occurrence !== null && occurrence < epoch && guard < 6; guard += 1) {
    previous = occurrence
    cursor = occurrence + 1
    occurrence = ssNextOccurrence(meta, cursor)
  }
  return previous
}

/** 严格晚于 epoch 的下一次出现。 */
function ssNextOccurrenceAfter(meta, epoch) {
  return ssNextOccurrence(meta, epoch + 1)
}

/* ------------------------------------------------------------- event model --- */

function ssMakeEvent(kind, meta, epoch, todayEpoch, extra) {
  const date = Lunar.dateOf(epoch)
  const lunar = Lunar.fromEpoch(epoch)
  return Object.assign(
    {
      id: kind + ':' + meta.key + '@' + epoch,
      kind,
      name: meta.name,
      aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
      epoch,
      y: date.y,
      m: date.m,
      d: date.d,
      weekday: Lunar.weekdayOf(epoch),
      days: epoch - todayEpoch,
      priority: meta.priority || 3,
      isAnchor: kind === 'festival' && meta.key === 'chunjie',
      isTerm: kind === 'solarterm',
      lunarMonthName: lunar.monthName,
      lunarDayName: lunar.dayName,
      lunarText: lunar.text,
      lunarGz: lunar.gz,
      lunarZodiac: lunar.zodiac,
      meta,
    },
    extra || null,
  )
}

/** 未来一年的事件列表（升序）。 */
function ssBuildEvents(todayEpoch, anniversaries) {
  const windowEnd = todayEpoch + SS_WINDOW_DAYS
  const events = []
  const firstYear = Lunar.dateOf(todayEpoch).y
  const lastYear = Lunar.dateOf(windowEnd).y

  // 二十四节气
  for (let year = firstYear; year <= lastYear; year += 1) {
    const epochs = Lunar.solarTermEpochs(year)
    for (let index = 0; index < epochs.length; index += 1) {
      const epoch = epochs[index]
      if (epoch < todayEpoch || epoch >= windowEnd) continue
      const key = Lunar.TERM_KEYS[index]
      const meta = TERM_MAP[key]
      if (!meta) continue
      events.push(ssMakeEvent('solarterm', meta, epoch, todayEpoch, { termIndex: index, gregYear: year }))
    }
  }

  // 二十五节令
  for (const meta of FESTIVALS_META) {
    const epoch = ssNextOccurrence(meta, todayEpoch)
    if (epoch === null || epoch >= windowEnd) continue
    events.push(ssMakeEvent('festival', meta, epoch, todayEpoch))
  }

  // 自定义纪念日
  for (const def of anniversaries) {
    const epoch = ssNextOccurrence(def, todayEpoch)
    if (epoch === null || epoch >= windowEnd) continue
    events.push(ssMakeEvent('custom', def, epoch, todayEpoch, { anniversaryId: def.id }))
  }

  events.sort((left, right) => {
    if (left.epoch !== right.epoch) return left.epoch - right.epoch
    if (left.priority !== right.priority) return left.priority - right.priority
    return (SS_KIND_ORDER[left.kind] || 0) - (SS_KIND_ORDER[right.kind] || 0)
  })
  return events
}

/** 筛选：全部 / 节令 / 节气；自定义纪念日始终保留。 */
function ssFilterEvents(events, filter) {
  if (filter === 'festival') return events.filter((event) => event.kind === 'festival' || event.kind === 'custom')
  if (filter === 'term') return events.filter((event) => event.kind === 'solarterm' || event.kind === 'custom')
  return events
}

/** 纪念日视图（含下一次发生日期）。 */
function ssAnniversaryView(def, todayEpoch) {
  const nextEpoch = ssNextOccurrence(def, todayEpoch)
  if (nextEpoch === null) return null
  const days = nextEpoch - todayEpoch
  const ruleText =
    def.calendar === 'lunar'
      ? T('农历' + Lunar.monthName(def.month) + Lunar.dayName(def.day), 'lunar ' + Lunar.monthName(def.month) + Lunar.dayName(def.day))
      : T(def.month + ' 月 ' + def.day + ' 日', def.month + '/' + def.day)
  return {
    id: def.id,
    name: def.name,
    calendar: def.calendar,
    month: def.month,
    day: def.day,
    nextEpoch,
    days,
    ymd: SS.fmt.ymd(nextEpoch),
    weekday: SS.fmt.weekday(nextEpoch),
    ruleText,
    subtitle: def.name && ruleText ? ruleText + ' · ' + T('每年', 'every year') + ' · ' + SS.fmt.ymd(nextEpoch) : '',
  }
}

/* --------------------------------------------------------------- describe --- */

/** 事件详情：弹层 / 列表副标 / 复制文本共用。 */
function ssDescribeEvent(event) {
  const kindLabel = event.kind === 'solarterm' ? T('节气', 'Solar term') : event.kind === 'custom' ? T('自定义', 'Custom') : T('节令', 'Festival')
  const kindTone = event.kind === 'solarterm' ? 'gold' : event.kind === 'custom' ? 'ivory' : 'coral'
  const view = {
    eventId: event.id,
    title: event.name,
    kindLabel,
    kindTone,
    ymd: SS.fmt.ymd(event.epoch),
    weekday: SS.fmt.weekday(event.epoch),
    longDate: SS.fmt.longDate(event.epoch),
    lunarLine: SS.fmt.lunarFull(event.epoch),
    countdown: SS.fmt.countdown(event.days),
    countdownDays: event.days,
    body: '',
    chips: [],
    hou: null,
    customs: null,
    prevYmd: null,
    nextYmd: null,
    isAnnual: true,
    dotKind: kindTone,
    subtitle: '',
  }

  if (event.kind === 'solarterm') {
    const meta = event.meta
    view.subtitle = T('节气 · 农历' + event.lunarText, 'solar term · ' + event.lunarText)
    view.body = meta.description || ''
    view.chips = [
      { label: T('太阳黄经 ' + meta.longitude + '°', 'solar longitude ' + meta.longitude + '°') },
      { label: meta.season },
    ]
    if (Array.isArray(meta.hou) && meta.hou.length === 3) {
      view.hou = meta.hou.map((text, index) => ({
        name: T(['一候', '二候', '三候'][index], ['first', 'second', 'third'][index]),
        text,
      }))
    }
    const previous = Lunar.solarTermEpoch(event.gregYear - 1, event.termIndex)
    const next = Lunar.solarTermEpoch(event.gregYear + 1, event.termIndex)
    view.prevYmd = previous === null ? null : SS.fmt.ymd(previous)
    view.nextYmd = next === null ? null : SS.fmt.ymd(next)
    view.gregYear = event.gregYear
    view.termIndex = event.termIndex
    return view
  }

  if (event.kind === 'custom') {
    const def = event.meta
    const ruleText =
      def.calendar === 'lunar'
        ? T('农历' + Lunar.monthName(def.month) + Lunar.dayName(def.day), 'lunar ' + Lunar.monthName(def.month) + Lunar.dayName(def.day))
        : T(def.month + ' 月 ' + def.day + ' 日', def.month + '/' + def.day)
    view.subtitle = ruleText + ' · ' + T('每年', 'every year')
    view.body = T('这是你记下的日子。愿它被好好记得。', 'A day you chose to remember.')
    view.chips = [{ label: ruleText }]
    const previous = ssPrevOccurrence(def, event.epoch)
    const next = ssNextOccurrenceAfter(def, event.epoch)
    view.prevYmd = previous === null ? null : SS.fmt.ymd(previous)
    view.nextYmd = next === null ? null : SS.fmt.ymd(next)
    return view
  }

  // 节令
  const meta = event.meta
  view.body = meta.description || ''
  if (meta.calendar === 'lunar') {
    const rule = '农历' + event.lunarMonthName + event.lunarDayName
    view.subtitle = T(rule + ' · ' + (meta.tagLabel || '每年'), rule + ' · yearly')
    view.chips.push({ label: rule })
  } else if (meta.calendar === 'solar') {
    view.subtitle = T(meta.month + ' 月 ' + meta.day + ' 日 · 每年', meta.month + '/' + meta.day + ' · yearly')
    view.chips.push({ label: T(meta.month + ' 月 ' + meta.day + ' 日', meta.month + '/' + meta.day) })
  } else if (meta.calendar === 'nth-weekday') {
    view.subtitle = T(
      meta.month + ' 月第 ' + meta.nth + ' 个周日 · 每年',
      'the ' + meta.nth + ' Sunday of month ' + meta.month + ' · yearly',
    )
    view.chips.push({ label: T(meta.month + ' 月第 ' + meta.nth + ' 个周日', 'Sunday #' + meta.nth + ' of month ' + meta.month) })
  } else {
    // special：春节（正月初一）与除夕（腊月最后一天），日期取事件当天的农历
    const rule = '农历' + event.lunarMonthName + event.lunarDayName
    view.subtitle = T(rule + ' · ' + (meta.tagLabel || '每年'), rule + ' · yearly')
    view.chips.push({ label: rule })
  }
  for (const alias of (meta.aliases || []).slice(0, 2)) {
    view.chips.push({ label: alias })
  }
  if (Array.isArray(meta.customs) && meta.customs.length > 0) {
    view.customs = meta.customs.slice(0, 4)
  }
  const previous = ssPrevOccurrence(meta, event.epoch)
  const next = ssNextOccurrenceAfter(meta, event.epoch)
  view.prevYmd = previous === null ? null : SS.fmt.ymd(previous)
  view.nextYmd = next === null ? null : SS.fmt.ymd(next)
  return view
}

/** 复制文本：立冬 · 2026.11.07 · 3 天后 */
function ssEventCopyText(view) {
  return view.title + ' · ' + view.ymd + ' · ' + view.countdown
}

/* ------------------------------------------------------------------ state --- */

const ssState = {
  todayEpoch: SS.todayEpoch(),
  filter: 'all',
  anniversaries: ssLoadAnniversaries(),
  settings: ssLoadSettings(),
  dismissed: ssLoadDismissed(),
  drawerId: null,
  drawerReturnFocus: null,
  addDialog: null,
  copied: null,
  localeRevision: 0,
  reminderClosed: false,
}

let ssSnapshotCache = null
const ssSubscribers = new Set()

function ssEmit() {
  ssSnapshotCache = null
  ssSubscribers.forEach((listener) => {
    try {
      listener()
    } catch {
      /* 单个订阅者失败不影响其它界面 */
    }
  })
}

function ssSubscribe(listener) {
  ssSubscribers.add(listener)
  return () => {
    ssSubscribers.delete(listener)
  }
}

function ssGetSnapshot() {
  if (!ssSnapshotCache) ssSnapshotCache = ssBuildSnapshot(ssState)
  return ssSnapshotCache
}

/* ----------------------------------------------------------------- snapshot --- */

function ssBuildSnapshot(state) {
  const todayEpoch = state.todayEpoch
  const events = ssBuildEvents(todayEpoch, state.anniversaries)
  const visible = ssFilterEvents(events, state.filter)
  const anchorEpoch = Lunar.nextSpringFestival(todayEpoch).epoch
  const todayLunar = Lunar.fromEpoch(todayEpoch)
  const todayYear = Lunar.lunarYearInfo(todayLunar.lunarYear)
  const isTermToday = Lunar.solarTermIndexAt(todayEpoch) >= 0
  const lastTerm = Lunar.lastTermBefore(todayEpoch)
  const termTodayIndex = Lunar.solarTermIndexAt(todayEpoch)

  let subtitle
  if (termTodayIndex >= 0) {
    const term = TERMS_META[termTodayIndex]
    subtitle =
      T('农历' + todayLunar.text + ' · ' + todayYear.gz + '年 · 今日', 'lunar ' + todayLunar.text + ' · ' + todayYear.gz + ' · today ') +
      (term ? term.name : '')
  } else {
    const term = TERMS_META[lastTerm.index]
    const passed = todayEpoch - lastTerm.epoch
    subtitle =
      T(
        '农历' + todayLunar.text + ' · ' + todayYear.gz + '年 · ' + (term ? term.name : '') + '已过 ' + passed + ' 天',
        'lunar ' + todayLunar.text + ' · ' + todayYear.gz + ' · ' + passed + ' days after ' + (term ? term.key : ''),
      )
  }

  const anniversaries = []
  for (const def of state.anniversaries) {
    const view = ssAnniversaryView(def, todayEpoch)
    if (view) anniversaries.push(view)
  }
  anniversaries.sort((left, right) => left.nextEpoch - right.nextEpoch)

  const groups = []
  for (const event of visible) {
    const key = event.y + '-' + event.m
    const last = groups.length > 0 ? groups[groups.length - 1] : null
    if (!last || last.key !== key) {
      groups.push({ key, y: event.y, m: event.m, label: T(event.y + ' 年 ' + event.m + ' 月', event.y + ' / ' + event.m), items: [event] })
    } else {
      last.items.push(event)
    }
  }

  let drawer = null
  if (state.drawerId) {
    const event = events.find((candidate) => candidate.id === state.drawerId)
    if (event) drawer = { event, view: ssDescribeEvent(event) }
  }

  let addDialog = null
  if (state.addDialog) addDialog = Object.assign({}, state.addDialog)

  let reminder = null
  if (state.settings.reminderEnabled) {
    const dateKey = String(todayEpoch)
    const dismissed = state.dismissed[dateKey] === true
    if (!dismissed) {
      const candidate = events.find((event) => event.days >= 0 && event.days <= state.settings.leadDays)
      if (candidate) {
        reminder = { event: candidate, view: ssDescribeEvent(candidate) }
      }
    }
  }

  return {
    todayEpoch,
    today: {
      epoch: todayEpoch,
      lunar: {
        monthName: todayLunar.monthName,
        dayName: todayLunar.dayName,
        text: todayLunar.text,
        gz: todayYear.gz,
        zodiac: todayYear.zodiac,
        year: todayLunar.lunarYear,
      },
      weekday: SS.fmt.weekday(todayEpoch),
      ymd: SS.fmt.ymd(todayEpoch),
      longDate: SS.fmt.longDate(todayEpoch),
      subtitle,
    },
    anchor: {
      epoch: anchorEpoch,
      days: anchorEpoch - todayEpoch,
      ymd: SS.fmt.ymd(anchorEpoch),
      lunarText: T('正月初一', 'lunar 1/1'),
    },
    filter: state.filter,
    filters: [
      { key: 'all', label: T('全部', 'All') },
      { key: 'festival', label: T('节令', 'Festivals') },
      { key: 'term', label: T('节气', 'Terms') },
    ],
    events,
    visible,
    next: visible.length > 0 ? visible[0] : null,
    afterNext: visible.length > 1 ? visible[1] : null,
    anniversaries,
    groups,
    count: visible.length,
    drawer,
    addDialog,
    settings: Object.assign({}, state.settings),
    reminder,
    copied: state.copied,
    localeRevision: state.localeRevision,
  }
}

/* --------------------------------------------------------------- mutations --- */

function ssPatchAnniversaries(next) {
  ssState.anniversaries = next
  SS.save('anniversaries', next)
}

function ssPatchSettings(patch) {
  const next = Object.assign({}, ssState.settings, patch || {})
  if (SS_LEAD_DAYS_CHOICES.indexOf(Number(next.leadDays)) < 0) next.leadDays = SS_DEFAULT_SETTINGS.leadDays
  next.reminderEnabled = Boolean(next.reminderEnabled)
  next.capsuleEnabled = Boolean(next.capsuleEnabled)
  ssState.settings = next
  SS.save('settings', next)
}

const Store = {
  /** React hook：订阅快照。 */
  use() {
    return React.useSyncExternalStore(ssSubscribe, ssGetSnapshot, ssGetSnapshot)
  },
  /** 非 React 读取。 */
  get() {
    return ssGetSnapshot()
  },
  /** 详情/副标文本生成。 */
  describe(event) {
    return ssDescribeEvent(event)
  },
  copyText(event) {
    return ssEventCopyText(ssDescribeEvent(event))
  },
  leadDaysChoices: SS_LEAD_DAYS_CHOICES,
  act: {
    setFilter(filter) {
      if (filter !== 'all' && filter !== 'festival' && filter !== 'term') return
      if (ssState.filter === filter) return
      ssState.filter = filter
      ssEmit()
    },
    openDrawer(eventId) {
      ssState.drawerId = eventId
      ssEmit()
    },
    closeDrawer() {
      if (!ssState.drawerId) return
      ssState.drawerId = null
      ssEmit()
    },
    openAddDialog(mode) {
      ssState.addDialog = { mode: mode || 'add' }
      ssEmit()
    },
    closeAddDialog() {
      if (!ssState.addDialog) return
      ssState.addDialog = null
      ssEmit()
    },
    addAnniversary(input) {
      const def = {
        id: SS.uid(),
        name: String((input && input.name) || '').trim().slice(0, 24) || T('纪念日', 'Anniversary'),
        calendar: input && input.calendar === 'solar' ? 'solar' : 'lunar',
        month: Math.min(12, Math.max(1, Math.round(Number(input && input.month) || 1))),
        day: Math.min(input && input.calendar === 'solar' ? 31 : 30, Math.max(1, Math.round(Number(input && input.day) || 1))),
      }
      ssPatchAnniversaries(ssState.anniversaries.concat([def]))
      ssState.addDialog = null
      ssEmit()
      return def
    },
    removeAnniversary(id) {
      ssPatchAnniversaries(ssState.anniversaries.filter((item) => item.id !== id))
      ssEmit()
    },
    setSettings(patch) {
      ssPatchSettings(patch)
      ssEmit()
    },
    dismissReminder() {
      const dateKey = String(ssState.todayEpoch)
      const next = Object.assign({}, ssState.dismissed)
      next[dateKey] = true
      // 只保留最近 60 天，避免无限增长
      const keys = Object.keys(next).sort((a, b) => Number(b) - Number(a)).slice(0, 60)
      const trimmed = {}
      for (const key of keys) trimmed[key] = next[key]
      ssState.dismissed = trimmed
      SS.save('reminder-dismissed', trimmed)
      ssState.reminderClosed = true
      ssEmit()
    },
    copyEvent(eventId) {
      const event = ssGetSnapshot().events.find((candidate) => candidate.id === eventId)
      if (!event) return Promise.resolve(false)
      const text = ssEventCopyText(ssDescribeEvent(event))
      return SS.copy(text).then((ok) => {
        ssState.copied = ok ? eventId : 'failed'
        ssEmit()
        window.setTimeout(() => {
          ssState.copied = null
          ssEmit()
        }, 1600)
        return ok
      })
    },
    /** 每分钟由 90-apply 调用；跨天时重建快照。 */
    refreshNow() {
      const current = SS.todayEpoch()
      if (current !== ssState.todayEpoch) {
        ssState.todayEpoch = current
        ssState.reminderClosed = false
        ssEmit()
        return true
      }
      return false
    },
    /** 语言切换后让缓存的中英文文案重建。 */
    localeChanged() {
      ssState.localeRevision += 1
      ssEmit()
    },
    /** 测试用：固定「今天」。 */
    setTodayForTest(epoch) {
      if (typeof epoch !== 'number') return
      ssState.todayEpoch = epoch
      ssEmit()
    },
  },
}

/* 供集成测试读取内部构建函数：可传一个固定「今天」试算，不影响真实状态。 */
function buildSnapshot(todayEpoch) {
  const previous = ssState.todayEpoch
  if (typeof todayEpoch === 'number') ssState.todayEpoch = todayEpoch
  const snapshot = ssBuildSnapshot(ssState)
  ssState.todayEpoch = previous
  return snapshot
}
