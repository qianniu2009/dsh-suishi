/* ============================================================================
 * 40-ring.js — 年轮盘
 *
 * 把「未来一年」的节点铺在一个圆环上：12 点方向是今天，顺时针按天分布；
 * 圆形细虚线是「未来一年」的轨道，每个事件一个彩点；从今天到下一个春节的
 * 弧线用朱砂渐变点亮；环外只标注少数节令（间隔 ≥18°，最多 4 个）与今天。
 * 圆心是既春节倒计时。全部为内联 SVG，颜色用 --ss-* / --dsw-alias-* 变量。
 * ========================================================================== */

const SS_RING = {
  size: 700,
  cx: 350,
  cy: 350,
  radius: 280,
  windowDays: 365,
  minLabelGap: 18,
  maxLabels: 4,
}

/** 事件在环上的角度（度，12 点为 0，顺时针）。 */
function ssRingAngle(epoch, todayEpoch) {
  return ((epoch - todayEpoch) / SS_RING.windowDays) * 360
}

/** 角度 + 半径 → SVG 坐标。 */
function ssRingPoint(angle, radius) {
  const rad = (angle * Math.PI) / 180
  return {
    x: SS_RING.cx + Math.sin(rad) * radius,
    y: SS_RING.cy - Math.cos(rad) * radius,
  }
}

/** 环上事件点半径（按事件类型与优先级）。 */
function ssRingDotRadius(event) {
  if (event.kind === 'solarterm') return 3.9
  if (event.kind === 'custom') return 6.4
  if (event.priority === 1) return 12
  if (event.priority === 2) return 6.5
  return 4.8
}

/** 事件点颜色变量。 */
function ssRingDotColor(event) {
  if (event.kind === 'solarterm') return 'var(--ss-gold)'
  if (event.kind === 'custom') return 'var(--dsw-alias-label-primary)'
  return 'var(--ss-coral)'
}

/** 计算环模型：节点、标注、今天/春节角度。 */
function ssRingModel(snapshot) {
  const todayEpoch = snapshot.todayEpoch
  const nodes = []
  for (const event of snapshot.visible) {
    if (event.days < 0 || event.days >= SS_RING.windowDays) continue
    const angle = ssRingAngle(event.epoch, todayEpoch)
    if (!Number.isFinite(angle)) continue
    nodes.push({ event, angle, radius: ssRingDotRadius(event), color: ssRingDotColor(event) })
  }

  const labels = []
  let lastAngle = 5
  for (const node of nodes) {
    if (node.event.kind !== 'festival') continue
    if (node.event.isAnchor) continue
    const angle = node.angle
    if (angle < 8 || angle > 352) continue
    if (angle - lastAngle < SS_RING.minLabelGap) continue
    labels.push({ event: node.event, angle })
    lastAngle = angle
    if (labels.length >= SS_RING.maxLabels) break
  }

  return {
    todayEpoch,
    anchorAngle: ssRingAngle(snapshot.anchor.epoch, todayEpoch),
    nodes,
    labels,
    nextId: snapshot.next ? snapshot.next.id : null,
  }
}

/** 从 today 到春节的高亮圆弧路径。 */
function ssRingArcPath(anchorAngle) {
  const start = ssRingPoint(0, SS_RING.radius)
  const end = ssRingPoint(anchorAngle, SS_RING.radius)
  const sweep = ((anchorAngle % 360) + 360) % 360
  const largeArc = sweep > 180 ? 1 : 0
  return 'M ' + start.x.toFixed(2) + ' ' + start.y.toFixed(2) +
    ' A ' + SS_RING.radius + ' ' + SS_RING.radius + ' 0 ' + largeArc + ' 1 ' + end.x.toFixed(2) + ' ' + end.y.toFixed(2)
}

/** 中心倒计时的数字排版：按位数估算数字宽度，把「天」放在数字右侧。 */
function ssRingCenterLayout(days) {
  const text = String(days)
  const fontSize = 93
  const width = Math.max(1, text.length) * fontSize * 0.5
  return {
    text,
    fontSize,
    numberX: SS_RING.cx,
    numberY: SS_RING.cy + 38,
    unitX: SS_RING.cx + 74,
    unitY: SS_RING.cy + 62,
  }
}

/** 年轮盘（主面板卡片内容，卡片头/图例由 85-page 组装）。 */
function YearRing() {
  const snapshot = Store.use()
  useLocaleTick()
  const model = ssRingModel(snapshot)
  const layout = ssRingCenterLayout(snapshot.anchor.days)
  const dotNodes = []
  const labelNodes = []

  // 事件点
  for (const node of model.nodes) {
    const point = ssRingPoint(node.angle, SS_RING.radius)
    const isNext = node.event.id === model.nextId
    const titleText = node.event.name + ' · ' + SS.fmt.ymd(node.event.epoch)
    dotNodes.push(
      h(
        'g',
        {
          key: node.event.id,
          role: 'button',
          tabIndex: 0,
          'aria-label': titleText,
          style: { cursor: 'pointer' },
          onClick: () => Store.act.openDrawer(node.event.id),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              Store.act.openDrawer(node.event.id)
            }
          },
        },
        isNext
          ? h('circle', {
              cx: point.x,
              cy: point.y,
              r: node.radius + 6.5,
              fill: 'none',
              stroke: 'rgba(255,255,255,.16)',
              strokeWidth: 1,
            })
          : null,
        h('circle', { cx: point.x, cy: point.y, r: node.radius + 2.2, fill: node.color, opacity: 0.16 }),
        h('circle', { cx: point.x, cy: point.y, r: node.radius, fill: node.color }),
        h('title', null, titleText),
      ),
    )
  }

  // 环外节令标注
  for (const label of model.labels) {
    const point = ssRingPoint(label.angle, SS_RING.radius + 22)
    const right = Math.sin((label.angle * Math.PI) / 180) >= 0
    labelNodes.push(
      h(
        'text',
        {
          key: 'label-' + label.event.id,
          x: point.x + (right ? 2 : -2),
          y: point.y + 5,
          'text-anchor': right ? 'start' : 'end',
          className: 'ss-ring-label',
        },
        label.event.name,
      ),
    )
  }

  // 今天标记（白色圆环 + 淡光环 + 下方文字）
  const todayPoint = ssRingPoint(0, SS_RING.radius)
  const todayGroup = h(
    'g',
    { key: 'today', 'aria-hidden': 'true' },
    h('circle', { cx: todayPoint.x, cy: todayPoint.y, r: 16, fill: 'none', stroke: 'rgba(255,255,255,.10)', strokeWidth: 1.2 }),
    h('circle', { cx: todayPoint.x, cy: todayPoint.y, r: 7.5, fill: 'var(--ss-surface)', stroke: 'var(--dsw-alias-label-primary)', strokeWidth: 2.4 }),
    h('text', { x: todayPoint.x + 8, y: todayPoint.y + 52, 'text-anchor': 'middle', className: 'ss-ring-today' }, T('今天', 'today')),
  )

  return h(
    'div',
    { className: 'ss-ring-wrap' },
    h(
      'svg',
      {
        className: 'ss-ring-svg',
        viewBox: '0 0 ' + SS_RING.size + ' ' + SS_RING.size,
        role: 'img',
        'aria-label': T('距春节 ' + snapshot.anchor.days + ' 天', snapshot.anchor.days + ' days to Spring Festival'),
      },
      h(
        'defs',
        null,
        h(
          'linearGradient',
          {
            id: 'ss-ring-arc',
            gradientUnits: 'userSpaceOnUse',
            x1: SS_RING.cx,
            y1: SS_RING.cy - SS_RING.radius,
            x2: SS_RING.cx + Math.sin((model.anchorAngle * Math.PI) / 180) * SS_RING.radius,
            y2: SS_RING.cy - Math.cos((model.anchorAngle * Math.PI) / 180) * SS_RING.radius,
          },
          h('stop', { offset: '0%', stopColor: 'var(--ss-coral)', stopOpacity: 0.22 }),
          h('stop', { offset: '45%', stopColor: 'var(--ss-coral)', stopOpacity: 0.62 }),
          h('stop', { offset: '100%', stopColor: 'var(--ss-coral-bright)', stopOpacity: 0.95 }),
        ),
      ),
      h('circle', { cx: SS_RING.cx, cy: SS_RING.cy, r: SS_RING.radius, className: 'ss-ring-track' }),
      h('path', { d: ssRingArcPath(model.anchorAngle), className: 'ss-ring-arc' }),
      dotNodes,
      todayGroup,
      labelNodes,
      // 圆心倒计时
      h('g', { 'aria-hidden': 'true' },
        h('text', { x: SS_RING.cx, y: SS_RING.cy - 72, 'text-anchor': 'middle', className: 'ss-ring-caption' }, T('距春节', 'to Spring Festival')),
        h(
          'text',
          {
            x: layout.numberX,
            y: layout.numberY,
            'text-anchor': 'middle',
            className: 'ss-ring-number',
            style: { fontFamily: 'var(--ss-serif)', fontSize: layout.fontSize + 'px' },
          },
          layout.text,
        ),
        h('text', { x: layout.unitX, y: layout.unitY, className: 'ss-ring-unit' }, T('天', 'days')),
        h('text', { x: SS_RING.cx, y: SS_RING.cy + 110, 'text-anchor': 'middle', className: 'ss-ring-date' },
          snapshot.anchor.ymd + ' · ' + snapshot.anchor.lunarText),
      ),
    ),
  )
}

/** 年轮卡底部图例。 */
function RingLegend() {
  useLocaleTick()
  const items = [
    { key: 'festival', color: 'var(--ss-coral)', label: T('节令', 'Festivals') },
    { key: 'term', color: 'var(--ss-gold)', label: T('节气', 'Solar terms') },
    { key: 'custom', color: 'var(--dsw-alias-label-primary)', label: T('自定义', 'Custom') },
  ]
  return h(
    'div',
    { className: 'ss-ring-legend' },
    items.map((item) =>
      h(
        'span',
        { key: item.key, className: 'ss-ring-legend-item' },
        h('i', { className: 'ss-ring-legend-dot', style: { background: item.color } }),
        item.label,
      ),
    ),
  )
}

pushCss(`
.ss-ring-wrap{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:2px 0 0}
.ss-ring-svg{display:block;width:100%;height:auto;max-width:520px;overflow:visible}
.ss-ring-track{fill:none;stroke:color-mix(in srgb, var(--dsw-alias-label-secondary) 42%, transparent);stroke-width:1.2;stroke-dasharray:1.4 5.5;stroke-linecap:round}
.ss-ring-arc{fill:none;stroke:url(#ss-ring-arc);stroke-width:5;stroke-linecap:round}
.ss-ring-label{font-size:22px;fill:var(--ss-ink-mid);letter-spacing:.04em;font-family:var(--dsw-font-family);paint-order:stroke;stroke:var(--dsw-alias-bg-layer-1);stroke-width:4px;stroke-linejoin:round}
.ss-ring-today{font-size:22px;fill:var(--dsw-alias-label-secondary);letter-spacing:.06em;font-family:var(--dsw-font-family)}
.ss-ring-caption{font-size:19px;fill:var(--ss-ink-mid);letter-spacing:.14em;font-family:var(--dsw-font-family)}
.ss-ring-number{fill:var(--dsw-alias-label-primary);font-weight:200;letter-spacing:-.01em}
.ss-ring-unit{font-size:27px;fill:var(--ss-ink-mid);font-family:var(--dsw-font-family)}
.ss-ring-date{font-size:21px;fill:var(--ss-ink-dim);letter-spacing:.05em;font-family:var(--dsw-font-family)}
@media (max-width:620px){.ss-ring-label{display:none}}
.ss-ring-legend{display:flex;align-items:center;justify-content:center;gap:22px;padding:8px 0 6px;font-size:12.5px;color:var(--ss-ink-dim);letter-spacing:.05em}
.ss-ring-legend-item{display:inline-flex;align-items:center;gap:7px}
.ss-ring-legend-dot{display:inline-block;width:6px;height:6px;border-radius:50%;flex:none}
`)
