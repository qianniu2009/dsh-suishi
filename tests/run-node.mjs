#!/usr/bin/env node
/**
 * Node-side harness: evaluates src/parts/*.js in one function scope with a
 * React stub so pure logic (Lunar, festival catalog, Store) can be tested
 * without a browser.
 *
 *   node tests/run-node.mjs            # smoke: build snapshot & print sample
 *   node tests/run-node.mjs --json     # print machine-readable summary
 *
 * data/copy teammates may build their own harnesses; this one belongs to the
 * integration layer and only needs the parts to load cleanly.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const partsDir = path.join(root, 'src', 'parts')
const files = readdirSync(partsDir).filter((n) => n.endsWith('.js')).sort()

const body = files
  .map((name) => `\n/* ${name} */\n` + readFileSync(path.join(partsDir, name), 'utf8').replace(/\s+$/u, ''))
  .join('\n')

const probe = `
return (function () {
  const out = { parts: ${JSON.stringify(files)} }
  try { out.CAL_DATA = CAL_DATA } catch (e) {}
  try { out.Lunar = Lunar } catch (e) {}
  try { out.TERMS_META = TERMS_META } catch (e) {}
  try { out.FESTIVALS_META = FESTIVALS_META } catch (e) {}
  try { out.Store = Store } catch (e) {}
  try { out.SS = SS } catch (e) {}
  try { out.buildSnapshot = buildSnapshot } catch (e) {}
  return out
})()
`

const React = {
  createElement: () => null,
  Fragment: {},
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (value) => ({ current: value }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useCallback: (fn) => fn,
}

const storage = new Map()
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
}
const documentStub = { addEventListener() {}, removeEventListener() {}, body: null, head: null }
const windowStub = { localStorage, addEventListener() {}, removeEventListener() {} }

let api
try {
  api = new Function('React', 'h', 'window', 'document', 'localStorage', 'navigator', body + '\n' + probe)(
    React,
    () => null,
    windowStub,
    documentStub,
    localStorage,
    { clipboard: null },
  )
} catch (error) {
  console.error('load failed:', error && error.stack)
  process.exit(1)
}

const missing = ['CAL_DATA', 'Lunar', 'TERMS_META', 'FESTIVALS_META', 'Store'].filter((key) => !api[key])
if (missing.length > 0) {
  console.error('missing parts:', missing.join(', '))
  process.exit(1)
}

const errors = []
function check(name, run) {
  try {
    run()
    console.log(`ok   ${name}`)
  } catch (error) {
    errors.push(`${name}: ${error && error.message}`)
    console.log(`FAIL ${name}: ${error && error.message}`)
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const { Lunar, TERMS_META, FESTIVALS_META, Store } = api
const today = process.env.SUISHI_TODAY || '2026-11-04'
const [ty, tm, td] = today.split('-').map(Number)
const todayEpoch = Lunar.epochOf(ty, tm, td)

check('lunar 2026-11-04 = 九月廿六', () => {
  const info = Lunar.fromEpoch(todayEpoch)
  assert(info.monthName === '九月' && info.dayName === '廿六', `got ${info.monthName}${info.dayName}`)
})
check('spring festival 2027 = 2027-02-06', () => {
  assert(Lunar.epochOf(2027, 2, 6) === Lunar.springFestival(2027), 'spring festival mismatch')
})
check('solar term lidong 2026 = 2026-11-07', () => {
  const epochs = Lunar.solarTermEpochs(2026)
  assert(epochs[20] === Lunar.epochOf(2026, 11, 7), 'lidong mismatch')
})
check('24 terms / 25 festivals catalog', () => {
  assert(TERMS_META.length === 24, `terms ${TERMS_META.length}`)
  assert(FESTIVALS_META.length === 25, `festivals ${FESTIVALS_META.length}`)
})
check('24 terms in the next year from 2026-11-04', () => {
  const terms = []
  for (let y = 2026; y <= 2027; y += 1) {
    for (const epoch of Lunar.solarTermEpochs(y)) {
      if (epoch >= todayEpoch && epoch < todayEpoch + 365) terms.push(epoch)
    }
  }
  assert(terms.length === 24, `terms in window: ${terms.length}`)
})
check('Store snapshot builds', () => {
  const snapshot = Store.get()
  assert(snapshot && Array.isArray(snapshot.events), 'no snapshot')
  assert(snapshot.events.length >= 40, `too few events: ${snapshot.events.length}`)
  assert(snapshot.next && snapshot.next.days >= 0, 'no next event')
  assert(snapshot.anchor && snapshot.anchor.days >= 0, 'no anchor')
})

const snapshot = Store.get()
const summary = {
  today,
  todayLunar: snapshot.today && snapshot.today.lunar && snapshot.today.lunar.text,
  subtitle: snapshot.today && snapshot.today.subtitle,
  anchor: snapshot.anchor && { ymd: snapshot.anchor.ymd, days: snapshot.anchor.days },
  next: snapshot.next && { name: snapshot.next.name, ymd: snapshot.next.ymd || '', days: snapshot.next.days },
  eventCount: snapshot.events.length,
  visibleCount: snapshot.visible.length,
  firstTerms: snapshot.events.filter((e) => e.kind === 'solarterm').slice(0, 3).map((e) => `${e.name}@${e.epoch}`),
  firstFestivals: snapshot.events.filter((e) => e.kind === 'festival').slice(0, 3).map((e) => `${e.name}@${e.epoch}`),
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log('\n--- snapshot ---')
  console.log(JSON.stringify(summary, null, 2))
}

if (errors.length > 0) {
  console.error(`\n${errors.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nall checks passed (${api.parts.length} parts)`)
