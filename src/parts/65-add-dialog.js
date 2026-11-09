/* ============================================================================
 * 65-add-dialog.js — 添加纪念日弹层
 *
 * 状态：Store 快照的 `addDialog`（存在即打开）。保存后由 Store.addAnniversary
 * 自动关闭；取消 / Esc / 遮罩走 closeAddDialog。历法支持「农历 / 公历」两种，
 * 农历月名与日名复用 Lunar.MONTH_NAMES / Lunar.DAY_NAMES（11-lunar.js）。
 * ========================================================================== */

/** 公历各月最大天数（2 月按闰年 29 计；保存时按「未来 8 年内存在该日」判断）。 */
const SS_ADD_SOLAR_MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

pushCss(`
.ss-add-modal{padding:28px 30px 22px}
.ss-add-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:20px}
.ss-add-title{margin:0;font-family:var(--ss-serif);font-size:24px;font-weight:500;line-height:1.2;letter-spacing:.06em;color:var(--dsw-alias-label-primary)}
.ss-add-x{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:-4px -6px 0 0;padding:0;border:0;border-radius:8px;background:transparent;color:var(--ss-ink-dim);cursor:pointer;transition:background-color .16s ease,color .16s ease}
.ss-add-x:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);color:var(--dsw-alias-label-primary)}
.ss-add-x:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ss-add-body{display:flex;flex-direction:column;gap:16px}
.ss-add-field{display:flex;flex-direction:column;gap:7px;min-width:0}
.ss-add-label{font-size:12px;line-height:1.4;letter-spacing:.06em;color:var(--ss-ink-dim)}
.ss-add-input{height:38px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;line-height:1;outline:none;transition:border-color .16s ease,background-color .16s ease}
.ss-add-input::placeholder{color:var(--ss-ink-dim)}
.ss-add-input:focus{border-color:var(--ss-coral-dim);background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ss-add-cal{display:inline-flex;align-self:flex-start;gap:2px;padding:3px;border:1px solid var(--ss-hairline);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.ss-add-cal-btn{height:30px;padding:0 17px;border:0;border-radius:8px;background:transparent;color:var(--ss-ink-mid);font:inherit;font-size:12.5px;line-height:1;cursor:pointer;transition:background-color .16s ease,color .16s ease}
.ss-add-cal-btn:hover{color:var(--dsw-alias-label-primary)}
.ss-add-cal-btn[aria-pressed="true"]{background:var(--ss-coral-wash);color:var(--ss-coral-bright)}
.ss-add-cal-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ss-add-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ss-add-select-wrap{position:relative;display:block}
.ss-add-select{appearance:none;-webkit-appearance:none;width:100%;height:38px;padding:0 34px 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;line-height:1;cursor:pointer;outline:none;transition:border-color .16s ease,background-color .16s ease}
.ss-add-select:focus{border-color:var(--ss-coral-dim);background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ss-add-select option{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.ss-add-chevron{position:absolute;right:11px;top:50%;display:inline-flex;transform:translateY(-50%);color:var(--ss-ink-dim);pointer-events:none}
.ss-add-preview{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;min-height:18px;font-size:12.5px;line-height:1.5;color:var(--ss-ink-mid)}
.ss-add-preview-days{color:var(--ss-coral-bright)}
.ss-add-note{font-size:11.5px;line-height:1.5;color:var(--ss-ink-dim)}
.ss-add-error{margin:0;min-height:16px;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}
.ss-add-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
.ss-add-save{min-width:76px}
/* DSH 设置面板是 z-index:1000 的固定浮层；从设置页打开的添加弹层必须盖在它上面。 */
.ss-modal-mask:has(.ss-add-modal){z-index:1200}
@media (max-width:480px){
  .ss-add-modal{padding:22px 20px 18px}
  .ss-add-row{grid-template-columns:1fr}
}
`)

/** 弹层里的一组月/日下拉。calendar 决定选项来源。 */
function ssAddMonthSelect(calendar, value, onChange) {
  const options = []
  if (calendar === 'lunar') {
    for (let index = 0; index < Lunar.MONTH_NAMES.length; index += 1) {
      options.push(h('option', { key: 'm' + index, value: String(index + 1) }, Lunar.MONTH_NAMES[index]))
    }
  } else {
    for (let month = 1; month <= 12; month += 1) {
      options.push(h('option', { key: 'm' + month, value: String(month) }, T(month + ' 月', 'month ' + month)))
    }
  }
  return h(
    'span',
    { className: 'ss-add-select-wrap' },
    h(
      'select',
      {
        className: 'ss-add-select',
        value: String(value),
        onChange(event) {
          onChange(Number(event.target.value))
        },
        'aria-label': T('月份', 'Month'),
      },
      options,
    ),
    h('span', { className: 'ss-add-chevron' }, SS.icon.chevron(14)),
  )
}

/** 日下拉：农历 1–30（用日名），公历 1–31。 */
function ssAddDaySelect(calendar, value, onChange) {
  const options = []
  if (calendar === 'lunar') {
    for (let index = 0; index < Lunar.DAY_NAMES.length; index += 1) {
      options.push(h('option', { key: 'd' + index, value: String(index + 1) }, Lunar.DAY_NAMES[index]))
    }
  } else {
    for (let day = 1; day <= 31; day += 1) {
      options.push(h('option', { key: 'd' + day, value: String(day) }, T(day + ' 日', 'day ' + day)))
    }
  }
  return h(
    'span',
    { className: 'ss-add-select-wrap' },
    h(
      'select',
      {
        className: 'ss-add-select',
        value: String(value),
        onChange(event) {
          onChange(Number(event.target.value))
        },
        'aria-label': T('日', 'Day'),
      },
      options,
    ),
    h('span', { className: 'ss-add-chevron' }, SS.icon.chevron(14)),
  )
}

/** 添加纪念日弹层。 */
function AddAnniversaryDialog() {
  useLocaleTick()
  const snap = Store.use()
  const open = Boolean(snap.addDialog)

  const [name, setName] = React.useState('')
  const [calendar, setCalendar] = React.useState('lunar')
  const [month, setMonth] = React.useState(1)
  const [day, setDay] = React.useState(1)
  const [error, setError] = React.useState('')

  // 每次重新打开时回到干净的初始状态。
  React.useEffect(() => {
    if (!open) return
    setName('')
    setCalendar('lunar')
    setMonth(1)
    setDay(1)
    setError('')
  }, [open])

  const close = React.useCallback(() => {
    Store.act.closeAddDialog()
  }, [])

  // 多个挂载点只让一份渲染（见 60-drawer.js 的 ssClaimDialogMount）。
  const isMountOwner = ssClaimDialogMount('add')
  if (!isMountOwner) return null

  const todayEpoch = snap.todayEpoch
  let previewEpoch = null
  if (calendar === 'lunar') {
    previewEpoch = Lunar.nextOccurrenceLunar(month, day, false, todayEpoch)
  } else {
    previewEpoch = Lunar.nextOccurrenceSolar(month, day, todayEpoch)
  }

  // 农历小月没有三十：预览会自动退到廿九，这里给一行提示。
  let fallbackNote = ''
  if (calendar === 'lunar' && previewEpoch !== null && day === 30) {
    const previewDate = Lunar.fromEpoch(previewEpoch)
    if (previewDate.day !== 30) fallbackNote = T('当月是小月，按廿九计。', 'That month is short; using day 29.')
  }

  function switchCalendar(next) {
    if (next === calendar) return
    setCalendar(next)
    setError('')
    setMonth((current) => Math.min(12, Math.max(1, current)))
    setDay((current) => (next === 'lunar' ? Math.min(30, current) : current))
  }

  function submit() {
    const finalName = name.trim() || T('纪念日', 'Anniversary')
    if (calendar === 'solar' && day > SS_ADD_SOLAR_MAX_DAYS[month - 1]) {
      setError(T('这个日期不存在，请调整一下。', 'That date does not exist.'))
      return
    }
    setError('')
    Store.act.addAnniversary({ name: finalName, calendar: calendar, month: month, day: day })
  }

  const previewText =
    previewEpoch === null
      ? T('这个日期暂不可用。', 'That date is unavailable.')
      : T('下一次', 'Next') + ' ' + SS.fmt.ymd(previewEpoch)

  const children = [
    h(
      'div',
      { key: 'head', className: 'ss-add-head' },
      h('h2', { key: 'title', className: 'ss-add-title' }, T('添加纪念日', 'Add anniversary')),
      h(
        'button',
        {
          key: 'close',
          type: 'button',
          className: 'ss-add-x',
          onClick: close,
          title: T('关闭', 'Close'),
          'aria-label': T('关闭', 'Close'),
        },
        SS.icon.close(16),
      ),
    ),
    h(
      'div',
      { key: 'body', className: 'ss-add-body' },
      h(
        'label',
        { className: 'ss-add-field' },
        h('span', { className: 'ss-add-label' }, T('名称', 'Name')),
        h('input', {
          className: 'ss-add-input',
          type: 'text',
          value: name,
          maxLength: 24,
          autoFocus: true,
          placeholder: T('例如：妈妈生日', 'e.g. Mom’s birthday'),
          onChange(event) {
            setName(event.target.value)
          },
          onKeyDown(event) {
            if (event.key === 'Enter') submit()
          },
          'aria-label': T('纪念日名称', 'Anniversary name'),
        }),
      ),
      h(
        'div',
        { className: 'ss-add-field' },
        h('span', { className: 'ss-add-label' }, T('历法', 'Calendar')),
        h(
          'div',
          { className: 'ss-add-cal', role: 'group', 'aria-label': T('历法', 'Calendar') },
          h(
            'button',
            {
              type: 'button',
              className: 'ss-add-cal-btn',
              'aria-pressed': calendar === 'lunar',
              onClick() {
                switchCalendar('lunar')
              },
            },
            T('农历', 'Lunar'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ss-add-cal-btn',
              'aria-pressed': calendar === 'solar',
              onClick() {
                switchCalendar('solar')
              },
            },
            T('公历', 'Solar'),
          ),
        ),
      ),
      h(
        'div',
        { key: 'row', className: 'ss-add-row' },
        h(
          'div',
          { className: 'ss-add-field' },
          h('span', { className: 'ss-add-label' }, T('月', 'Month')),
          ssAddMonthSelect(calendar, month, setMonth),
        ),
        h(
          'div',
          { className: 'ss-add-field' },
          h('span', { className: 'ss-add-label' }, T('日', 'Day')),
          ssAddDaySelect(calendar, day, setDay),
        ),
      ),
      h(
        'div',
        { key: 'preview', className: 'ss-add-preview' },
        h('span', { className: 'ss-add-preview-text' }, previewText),
        previewEpoch === null
          ? null
          : h(
              'span',
              { className: 'ss-add-preview-days' },
              SS.fmt.countdown(previewEpoch - todayEpoch),
            ),
      ),
      fallbackNote ? h('div', { key: 'note', className: 'ss-add-note' }, fallbackNote) : null,
      h('p', { key: 'error', className: 'ss-add-error', role: 'status' }, error),
    ),
    h(
      'div',
      { key: 'foot', className: 'ss-add-foot' },
      h(SSButton, { key: 'cancel', variant: 'plain', size: 'md', onClick: close }, T('取消', 'Cancel')),
      h(
        SSButton,
        { key: 'save', variant: 'accent', size: 'md', className: 'ss-add-save', onClick: submit },
        T('保存', 'Save'),
      ),
    ),
  ]

  return h(
    SSModal,
    {
      open: open,
      onClose: close,
      className: 'ss-modal-small ss-add-modal',
      ariaLabel: T('添加纪念日', 'Add anniversary'),
    },
    children,
  )
}
