#!/usr/bin/env node
/**
 * 农历/节气数据层自检（data 侧，不依赖 Lead 的 tests/run-node.mjs）。
 *
 *   node tests/test-lunar.mjs
 *
 * 覆盖：
 *   1. 契约 §7 关键日期（农历 2026-11-04 = 九月廿六、2026/2027 节气、2027 春节/除夕/腊八/小年/元宵）
 *   2. 1901-01-01..2100-12-31 逐日：农历年月日/闰月/日期文字/节气/星期/公历往返与香港天文台原始表一致
 *   3. 每个公历年 24 个节气与原始表一致
 *   4. 农历月结构：每年 12/13 月、月长 29/30、闰月唯一且位置合法、月首连续
 *   5. springFestival 1901..2100 与 HKO 一致 + nextSpringFestival 行为
 *   6. 边界与性能（全量逐日 < 5s）
 *
 * 数据来自 tools/hko/raw/（不随插件发布）；缺失时先运行 node tools/hko/fetch.mjs。
 * 期望值用 tests/harness.mjs 里**独立实现**的原始表解析器从 HKO 文本重新推导。
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  PARTS_DIR,
  loadLunar,
  buildExpectedDays,
  epochOf,
  dateOf,
  fmtDate,
  Checker,
  assert,
  DiffCollector,
  DISPLAY_MONTH_NAMES,
  DISPLAY_DAY_NAMES,
  YEAR_START,
  YEAR_END,
} from './harness.mjs';

// 香港天文台原始年表（约 5.6MB）不随仓库发布：缺失时给出可操作提示，而不是抛堆栈。
const REQUIRED_RAW = path.join(ROOT, 'tools', 'hko', 'raw', 'T1901c.txt');
if (!existsSync(REQUIRED_RAW)) {
  console.error('[test-lunar] 缺少香港天文台原始年表（tools/hko/raw/ 不存在）。');
  console.error('[test-lunar] 请先在仓库根目录运行: node tools/hko/fetch.mjs');
  process.exit(2);
}

const checker = new Checker();
const stats = {
  days: 0,
  gregYears: 0,
  terms: 0,
  lunarYears: 0,
  leapYears: 0,
  months: 0,
  minMonthLength: 30,
  maxMonthLength: 29,
  parseMs: 0,
  dailyMs: 0,
  mismatches: 0,
};
const totalT0 = Date.now();

/* ------------------------------------------------------------ 0. 加载数据 --- */

const loadT0 = Date.now();
const { CAL_DATA, Lunar } = loadLunar();
const loadedMs = Date.now() - loadT0;

const buildT0 = Date.now();
const { days: expected, monthLengths } = buildExpectedDays();
stats.parseMs = Date.now() - buildT0;
stats.days = expected.length;
stats.gregYears = YEAR_END - YEAR_START + 1;
for (const length of monthLengths) {
  if (length < stats.minMonthLength) stats.minMonthLength = length;
  if (length > stats.maxMonthLength) stats.maxMonthLength = length;
}
stats.terms = stats.gregYears * 24;

const E = (y, m, d) => epochOf(y, m, d);
const dayText = (exp) => (exp.isLeap ? '闰' : '') + DISPLAY_MONTH_NAMES[exp.month - 1] + DISPLAY_DAY_NAMES[exp.day - 1];

/* -------------------------------------------------- 1. 契约 §7 关键日期 --- */

checker.check('parts 语法自检（new Function 解析 10/11 两个 part）', () => {
  for (const name of ['10-cal-data.js', '11-lunar.js']) {
    // eslint-disable-next-line no-new-func
    new Function(readFileSync(path.join(PARTS_DIR, name), 'utf8'));
  }
});

checker.check('CAL_DATA 结构（yearBase=1900、termBase=1901、201 农历年、200 公历年节气）', () => {
  assert(CAL_DATA.yearBase === 1900, `yearBase=${CAL_DATA.yearBase}`);
  assert(CAL_DATA.termBase === 1901, `termBase=${CAL_DATA.termBase}`);
  assert(Array.isArray(CAL_DATA.years) && CAL_DATA.years.length === 201, `years=${CAL_DATA.years.length}`);
  assert(Array.isArray(CAL_DATA.terms) && CAL_DATA.terms.length === 200, `terms=${CAL_DATA.terms.length}`);
  for (let i = 0; i < CAL_DATA.years.length; i += 1) {
    const row = CAL_DATA.years[i];
    assert(Array.isArray(row) && row.length === 3, `years[${i}] 结构错误`);
    assert(Number.isInteger(row[0]) && Number.isInteger(row[1]) && Number.isInteger(row[2]), `years[${i}] 非整数`);
    assert(row[2] === 0 || (row[2] >= 2 && row[2] <= 13), `years[${i}] leapMonth 非法: ${row[2]}`);
    if (i > 0) assert(row[0] > CAL_DATA.years[i - 1][0], `years[${i}] 正月初一未递增`);
  }
  for (let i = 0; i < CAL_DATA.terms.length; i += 1) {
    const offsets = CAL_DATA.terms[i];
    assert(Array.isArray(offsets) && offsets.length === 24, `terms[${i}] 应有 24 项`);
    for (let k = 0; k < 24; k += 1) {
      assert(Number.isInteger(offsets[k]) && offsets[k] >= 0 && offsets[k] <= 365, `terms[${i}][${k}] 越界`);
      if (k > 0) assert(offsets[k] > offsets[k - 1], `terms[${i}] 未递增`);
    }
  }
});

checker.check('§7 2026-11-04 = 农历九月廿六（丙午年），霜降已过 12 天', () => {
  const epoch = E(2026, 11, 4);
  const info = Lunar.fromEpoch(epoch);
  assert(info.lunarYear === 2026, `lunarYear=${info.lunarYear}`);
  assert(info.month === 9 && info.day === 26 && info.isLeap === false, `月日=${info.month}/${info.day}/${info.isLeap}`);
  assert(info.monthName === '九月' && info.dayName === '廿六' && info.text === '九月廿六', `文本=${info.text}`);
  assert(info.gz === '丙午' && info.zodiac === '马', `干支=${info.gz}/${info.zodiac}`);
  assert(Lunar.lunarDateText(epoch) === '农历九月廿六', Lunar.lunarDateText(epoch));
  const lastTerm = Lunar.lastTermBefore(epoch);
  assert(lastTerm !== null, 'lastTermBefore 为空');
  assert(lastTerm.index === 19, `最近节气索引=${lastTerm.index}（应为霜降 19）`);
  assert(lastTerm.epoch === E(2026, 10, 23), `霜降 epoch=${fmtDate(lastTerm.epoch)}（应为 2026-10-23）`);
  assert(epoch - lastTerm.epoch === 12, `霜降已过 ${epoch - lastTerm.epoch} 天（应为 12）`);
  assert(Lunar.solarTermIndexAt(epoch) === -1, '2026-11-04 不是节气日');
});

checker.check('§7 2026 节气：立冬 11-07、小雪 11-22、大雪 12-07、冬至 12-22', () => {
  const want = [[20, E(2026, 11, 7), '立冬'], [21, E(2026, 11, 22), '小雪'], [22, E(2026, 12, 7), '大雪'], [23, E(2026, 12, 22), '冬至']];
  for (const [index, epoch, name] of want) {
    assert(Lunar.solarTermEpoch(2026, index) === epoch, `${name} 2026 = ${fmtDate(Lunar.solarTermEpoch(2026, index))}（应为 ${fmtDate(epoch)}）`);
    assert(Lunar.solarTermIndexAt(epoch) === index, `${name} 当天索引错误`);
    assert(Lunar.isTermDay(epoch) === true, `${name} 当天 isTermDay=false`);
  }
  assert(Lunar.TERM_KEYS[20] === 'lidong', 'TERM_KEYS[20] 应为 lidong');
});

checker.check('§7 2027 节气：小寒 01-05、大寒 01-20、立春 02-04', () => {
  assert(Lunar.solarTermEpoch(2027, 0) === E(2027, 1, 5), `小寒=${fmtDate(Lunar.solarTermEpoch(2027, 0))}`);
  assert(Lunar.solarTermEpoch(2027, 1) === E(2027, 1, 20), `大寒=${fmtDate(Lunar.solarTermEpoch(2027, 1))}`);
  assert(Lunar.solarTermEpoch(2027, 2) === E(2027, 2, 4), `立春=${fmtDate(Lunar.solarTermEpoch(2027, 2))}`);
  assert(Lunar.nextTermAfter(E(2026, 12, 22)).epoch === E(2027, 1, 5), '冬至之后应是 2027 小寒');
  assert(Lunar.nextTermAfter(E(2026, 12, 22)).index === 0, '冬至之后节气索引应为 0（小寒）');
});

checker.check('§7 2027 春节 02-06、除夕 02-05', () => {
  assert(Lunar.springFestival(2027) === E(2027, 2, 6), `springFestival(2027)=${fmtDate(Lunar.springFestival(2027))}`);
  const cny = Lunar.fromEpoch(E(2027, 2, 6));
  assert(cny.month === 1 && cny.day === 1 && cny.text === '正月初一', `春节农历=${cny.text}`);
  assert(cny.lunarYear === 2027 && cny.gz === '丁未' && cny.zodiac === '羊', `春节干支=${cny.gz}/${cny.zodiac}`);
  const eve = Lunar.fromEpoch(E(2027, 2, 5));
  assert(E(2027, 2, 5) === Lunar.springFestival(2027) - 1, '除夕应为春节前一天');
  assert(eve.month === 12 && eve.day === 29 && eve.text === '腊月廿九', `除夕农历=${eve.text}`);
  assert(Lunar.nextSpringFestival(E(2027, 2, 6)).epoch === E(2027, 2, 6), '春节当天 nextSpringFestival 应返回当天');
  assert(Lunar.nextSpringFestival(E(2027, 2, 5)).epoch === E(2027, 2, 6), '除夕 nextSpringFestival 应为次日');
});

checker.check('§7 腊八 2027-01-15、小年 2027-01-30、元宵 2027-02-20', () => {
  const laba = Lunar.fromEpoch(E(2027, 1, 15));
  assert(laba.month === 12 && laba.day === 8 && laba.isLeap === false, `腊八=${laba.month}/${laba.day}`);
  assert(laba.text === '腊月初八', `腊八文本=${laba.text}`);
  assert(Lunar.toEpoch(2026, 12, 8, false) === E(2027, 1, 15), 'toEpoch(2026,12,8) 与腊八不符');
  const xiaonian = Lunar.fromEpoch(E(2027, 1, 30));
  assert(xiaonian.month === 12 && xiaonian.day === 23, `小年=${xiaonian.text}`);
  const yuanxiao = Lunar.fromEpoch(E(2027, 2, 20));
  assert(yuanxiao.month === 1 && yuanxiao.day === 15, `元宵=${yuanxiao.text}`);
  assert(yuanxiao.lunarYear === 2027, `元宵农历年=${yuanxiao.lunarYear}`);
});

checker.check('§7 2026-11-04 起未来一年恰有 24 个节气', () => {
  const start = E(2026, 11, 4);
  const end = start + 365;
  let count = 0;
  for (const year of [2026, 2027]) {
    for (const epoch of Lunar.solarTermEpochs(year)) {
      if (epoch >= start && epoch < end) count += 1;
    }
  }
  assert(count === 24, `未来一年节气数=${count}`);
});

/* -------------------------------------------------- 2. 逐日全量校验 --- */

checker.check('逐日校验 1901-01-01..2100-12-31（农历/闰月/文本/节气/星期/公历往返）', () => {
  const diff = new DiffCollector(20);
  const dailyT0 = performance.now();
  for (let i = 0; i < expected.length; i += 1) {
    const exp = expected[i];
    const epoch = exp.epoch;
    const info = Lunar.fromEpoch(epoch);
    const where = `${fmtDate(epoch)}（期望 ${dayText(exp)}${exp.termIndex >= 0 ? ' / 节气#' + exp.termIndex : ''}）`;
    if (info.lunarYear !== exp.lunarYear) diff.add(`${where}: lunarYear=${info.lunarYear}，期望 ${exp.lunarYear}`);
    if (info.month !== exp.month) diff.add(`${where}: month=${info.month}，期望 ${exp.month}`);
    if (info.day !== exp.day) diff.add(`${where}: day=${info.day}，期望 ${exp.day}`);
    if (info.isLeap !== exp.isLeap) diff.add(`${where}: isLeap=${info.isLeap}，期望 ${exp.isLeap}`);
    const wantMonthName = (exp.isLeap ? '闰' : '') + DISPLAY_MONTH_NAMES[exp.month - 1];
    const wantDayName = DISPLAY_DAY_NAMES[exp.day - 1];
    if (info.monthName !== wantMonthName) diff.add(`${where}: monthName=${info.monthName}，期望 ${wantMonthName}`);
    if (info.dayName !== wantDayName) diff.add(`${where}: dayName=${info.dayName}，期望 ${wantDayName}`);
    if (info.text !== wantMonthName + wantDayName) diff.add(`${where}: text=${info.text}，期望 ${wantMonthName + wantDayName}`);
    if (Lunar.lunarDateText(epoch) !== '农历' + wantMonthName + wantDayName) diff.add(`${where}: lunarDateText=${Lunar.lunarDateText(epoch)}`);
    if (Lunar.fmtLunarShort(epoch) !== wantMonthName + wantDayName) diff.add(`${where}: fmtLunarShort=${Lunar.fmtLunarShort(epoch)}`);
    if (Lunar.weekdayOf(epoch) !== exp.weekday) diff.add(`${where}: weekday=${Lunar.weekdayOf(epoch)}，期望 ${exp.weekday}`);
    const date = Lunar.dateOf(epoch);
    if (date.y !== exp.y || date.m !== exp.m || date.d !== exp.d) diff.add(`${where}: dateOf=${date.y}-${date.m}-${date.d}`);
    if (Lunar.epochOf(exp.y, exp.m, exp.d) !== epoch) diff.add(`${where}: epochOf 往返失败`);
    const termIndex = Lunar.solarTermIndexAt(epoch);
    const wantTerm = exp.termIndex >= 0 ? exp.termIndex : -1;
    if (termIndex !== wantTerm) diff.add(`${where}: solarTermIndexAt=${termIndex}，期望 ${wantTerm}`);
    if (Lunar.isTermDay(epoch) !== (wantTerm >= 0)) diff.add(`${where}: isTermDay 错误`);
  }
  stats.dailyMs = Math.round(performance.now() - dailyT0);
  stats.mismatches = diff.count;
  diff.assertEmpty('逐日校验');
});

/* -------------------------------------------------- 3. 节气表逐年校验 --- */

checker.check('200 个公历年 × 24 节气与原始表完全一致', () => {
  const byYear = new Map();
  for (const exp of expected) {
    if (exp.termIndex < 0) continue;
    if (!byYear.has(exp.y)) byYear.set(exp.y, []);
    const list = byYear.get(exp.y);
    assert(list.length === exp.termIndex, `${exp.y} 年节气顺序错误（第 ${list.length + 1} 个是索引 ${exp.termIndex}）`);
    list.push(exp.epoch);
  }
  let checked = 0;
  for (let year = YEAR_START; year <= YEAR_END; year += 1) {
    const want = byYear.get(year);
    assert(want && want.length === 24, `${year} 年原始表应有 24 个节气，实际 ${want ? want.length : 0}`);
    const got = Lunar.solarTermEpochs(year);
    assert(got.length === 24, `solarTermEpochs(${year}) 返回 ${got.length} 项`);
    for (let i = 0; i < 24; i += 1) {
      assert(got[i] === want[i], `${year} 年第 ${i + 1} 个节气=${fmtDate(got[i])}，期望 ${fmtDate(want[i])}`);
    }
    checked += 1;
  }
  assert(checked === 200, `校验年份数=${checked}`);
});

/* -------------------------------------------------- 4. 农历月结构 --- */

checker.check('农历月结构：每年 12/13 月、月长 29/30、闰月唯一且紧随其月', () => {
  let monthsTotal = 0;
  let leapYears = 0;
  for (let lunarYear = 1901; lunarYear <= 2100; lunarYear += 1) {
    const months = [];
    for (let month = 1; month <= 12; month += 1) {
      if (Lunar.toEpoch(lunarYear, month, 1, false) !== null) {
        months.push({
          month,
          isLeap: false,
          length: Lunar.toEpoch(lunarYear, month, 30, false) !== null ? 30 : (Lunar.toEpoch(lunarYear, month, 29, false) !== null ? 29 : 0),
          start: Lunar.toEpoch(lunarYear, month, 1, false),
        });
      }
      if (Lunar.toEpoch(lunarYear, month, 1, true) !== null) {
        months.push({
          month,
          isLeap: true,
          length: Lunar.toEpoch(lunarYear, month, 30, true) !== null ? 30 : (Lunar.toEpoch(lunarYear, month, 29, true) !== null ? 29 : 0),
          start: Lunar.toEpoch(lunarYear, month, 1, true),
        });
      }
    }
    months.sort((left, right) => left.start - right.start);
    assert(months.length === 12 || months.length === 13, `农历 ${lunarYear} 年月数=${months.length}`);
    assert(months[0].month === 1 && !months[0].isLeap, `农历 ${lunarYear} 年首月应为正月`);
    let leapSeen = 0;
    for (let i = 0; i < months.length; i += 1) {
      const entry = months[i];
      assert(entry.length === 29 || entry.length === 30, `农历 ${lunarYear} 年 ${entry.month}${entry.isLeap ? '闰' : ''} 月长=${entry.length}`);
      if (entry.isLeap) {
        leapSeen += 1;
        assert(i > 0, `农历 ${lunarYear} 年闰月不能是首月`);
        assert(months[i - 1].month === entry.month && months[i - 1].isLeap === false, `农历 ${lunarYear} 年闰${entry.month}月前必须紧跟普通${entry.month}月`);
        assert(months[i - 1].start + months[i - 1].length === entry.start, `农历 ${lunarYear} 年闰月月首不连续`);
      } else {
        assert(entry.month === i - leapSeen + 1, `农历 ${lunarYear} 年普通月序错误：第 ${i + 1} 个为 ${entry.month} 月`);
      }
    }
    assert(leapSeen <= 1, `农历 ${lunarYear} 年出现多个闰月`);
    assert(months.length === (leapSeen === 1 ? 13 : 12), `农历 ${lunarYear} 年月数与闰月不符`);
    if (leapSeen === 1) leapYears += 1;
    // 月首必须连续：sum(length) 应等于下一农历年正月初一 - 本年正月初一
    const total = months.reduce((sum, entry) => sum + entry.length, 0);
    if (lunarYear < 2100) {
      assert(months[0].start + total === Lunar.springFestival(lunarYear + 1), `农历 ${lunarYear} 年月长之和与下一年春节不符`);
    }
    monthsTotal += months.length;
  }
  stats.lunarYears = 200;
  stats.leapYears = leapYears;
  stats.months = monthsTotal;
  assert(monthsTotal === 2473 || monthsTotal === 2474 || monthsTotal === 2475, `月总数=${monthsTotal}`);
});

/* -------------------------------------------------- 5. 春节 --- */

checker.check('springFestival 1901..2100 与 HKO 原始表一致 + nextSpringFestival', () => {
  const cnyByLunarYear = new Map();
  for (const exp of expected) {
    if (exp.month === 1 && exp.day === 1 && !exp.isLeap && exp.monthStart) {
      assert(!cnyByLunarYear.has(exp.lunarYear), `农历 ${exp.lunarYear} 年出现两个正月初一`);
      cnyByLunarYear.set(exp.lunarYear, exp.epoch);
    }
  }
  assert(cnyByLunarYear.size === 200, `原始表应给出 200 个春节（1901..2100），实际 ${cnyByLunarYear.size}`);
  let previous = null;
  for (let lunarYear = 1901; lunarYear <= 2100; lunarYear += 1) {
    const expectedEpoch = cnyByLunarYear.get(lunarYear);
    assert(expectedEpoch !== undefined, `原始表缺少 ${lunarYear} 年春节`);
    assert(Lunar.springFestival(lunarYear) === expectedEpoch, `${lunarYear} 年春节=${fmtDate(Lunar.springFestival(lunarYear))}，期望 ${fmtDate(expectedEpoch)}`);
    assert(Lunar.toEpoch(lunarYear, 1, 1, false) === expectedEpoch, `toEpoch(${lunarYear},1,1) 与 HKO 春节不符`);
    const next = Lunar.nextSpringFestival(expectedEpoch);
    assert(next.epoch === expectedEpoch && next.lunarYear === lunarYear, `nextSpringFestival(春节当天) 错误`);
    assert(Lunar.nextSpringFestival(expectedEpoch - 1).epoch === expectedEpoch, `nextSpringFestival(除夕) 错误`);
    if (lunarYear < 2100) {
      assert(Lunar.nextSpringFestival(expectedEpoch + 1).epoch === cnyByLunarYear.get(lunarYear + 1), `nextSpringFestival(春节次日) 错误`);
      const gap = cnyByLunarYear.get(lunarYear + 1) - expectedEpoch;
      assert(gap >= 353 && gap <= 385, `${lunarYear}→${lunarYear + 1} 春节间隔=${gap}`);
    }
    previous = expectedEpoch;
  }
  assert(previous !== null, '春节校验未执行');
});

/* -------------------------------------------------- 6. API / 边界 / 性能 --- */

checker.check('Lunar 常量与格式化表', () => {
  assert(Array.isArray(Lunar.MONTH_NAMES) && Lunar.MONTH_NAMES.length === 12, 'MONTH_NAMES 长度错误');
  assert(Lunar.MONTH_NAMES[0] === '正月' && Lunar.MONTH_NAMES[10] === '冬月' && Lunar.MONTH_NAMES[11] === '腊月', 'MONTH_NAMES 内容错误');
  assert(Array.isArray(Lunar.DAY_NAMES) && Lunar.DAY_NAMES.length === 30, 'DAY_NAMES 长度错误');
  assert(Lunar.DAY_NAMES[0] === '初一' && Lunar.DAY_NAMES[19] === '二十' && Lunar.DAY_NAMES[29] === '三十', 'DAY_NAMES 内容错误');
  assert(Array.isArray(Lunar.TERM_KEYS) && Lunar.TERM_KEYS.length === 24, 'TERM_KEYS 长度错误');
  assert(Lunar.TERM_KEYS[0] === 'xiaohan' && Lunar.TERM_KEYS[23] === 'dongzhi', 'TERM_KEYS 顺序错误');
  assert(Lunar.monthName(1) === '正月' && Lunar.monthName(12) === '腊月' && Lunar.monthName(13) === '', 'monthName 行为错误');
  assert(Lunar.dayName(1) === '初一' && Lunar.dayName(30) === '三十' && Lunar.dayName(31) === '', 'dayName 行为错误');
  assert(Lunar.epochOf(1970, 1, 1) === 0, 'epochOf(1970-01-01) 应为 0');
  const date = Lunar.dateOf(0);
  assert(date.y === 1970 && date.m === 1 && date.d === 1, 'dateOf(0) 应为 1970-01-01');
  assert(Lunar.weekdayOf(0) === 4, '1970-01-01 应为周四');
});

checker.check('干支/生肖 + 农历年信息', () => {
  const check = (year, gz, zodiac, text) => {
    const info = Lunar.lunarYearInfo(year);
    assert(info.gz === gz && info.zodiac === zodiac && info.text === text, `${year} → ${info.gz}/${info.zodiac}/${info.text}，期望 ${gz}/${zodiac}/${text}`);
  };
  check(1901, '辛丑', '牛', '辛丑年');
  check(1984, '甲子', '鼠', '甲子年');
  check(2026, '丙午', '马', '丙午年');
  check(2027, '丁未', '羊', '丁未年');
  check(2100, '庚申', '猴', '庚申年');
});

checker.check('闰月样本：2025 闰六月、2033 闰十一月', () => {
  // 从独立解析出的期望表里找 2025 年第一个闰月日
  const leapDays = expected.filter((exp) => exp.lunarYear === 2025 && exp.isLeap && exp.day === 1);
  assert(leapDays.length === 1, `2025 年闰月数量=${leapDays.length}`);
  const info = Lunar.fromEpoch(leapDays[0].epoch);
  assert(info.month === 6 && info.isLeap === true, `2025 闰月=${info.month}/${info.isLeap}`);
  assert(info.monthName === '闰六月' && info.text === '闰六月初一', `2025 闰月文本=${info.text}`);
  assert(Lunar.toEpoch(2025, 6, 1, true) === leapDays[0].epoch, 'toEpoch(2025,6,1,true) 与 HKO 不符');
  assert(Lunar.toEpoch(2025, 7, 1, true) === null, 'toEpoch(2025,7,1,true) 应为 null');
  const leap2033 = expected.filter((exp) => exp.lunarYear === 2033 && exp.isLeap && exp.day === 1);
  assert(leap2033.length === 1, `2033 年闰月数量=${leap2033.length}`);
  const info2033 = Lunar.fromEpoch(leap2033[0].epoch);
  // MONTH_NAMES 中十一月/十二月显示为「冬月」「腊月」，故闰十一月显示为「闰冬月」
  assert(info2033.month === 11 && info2033.isLeap === true && info2033.text === '闰冬月初一', `2033 闰月=${info2033.text}`);
});

checker.check('nextOccurrenceLunar / nextOccurrenceSolar', () => {
  const anchor = E(2026, 11, 4);
  assert(Lunar.nextOccurrenceLunar(9, 26, false, anchor) === E(2026, 11, 4), '当天应命中（含当天）');
  assert(Lunar.nextOccurrenceLunar(12, 8, false, anchor) === E(2027, 1, 15), `下次腊八=${fmtDate(Lunar.nextOccurrenceLunar(12, 8, false, anchor))}`);
  assert(Lunar.nextOccurrenceLunar(1, 1, false, anchor) === E(2027, 2, 6), '下次春节');
  assert(Lunar.nextOccurrenceLunar(12, 30, false, anchor) === E(2027, 2, 5), '腊月三十在小月应回退到廿九');
  const midAutumn = expected.find((exp) => exp.lunarYear === 2027 && exp.month === 8 && exp.day === 15);
  assert(Lunar.nextOccurrenceLunar(8, 15, false, anchor) === midAutumn.epoch, '下次中秋');
  assert(Lunar.nextOccurrenceLunar(13, 1, false, anchor) === null, '非法月份应返回 null');
  assert(Lunar.nextOccurrenceSolar(1, 1, anchor) === E(2027, 1, 1), '下次元旦');
  assert(Lunar.nextOccurrenceSolar(11, 4, anchor) === anchor, '公历当天应命中');
  assert(Lunar.nextOccurrenceSolar(12, 25, anchor) === E(2026, 12, 25), '下次圣诞节');
  assert(Lunar.nextOccurrenceSolar(2, 29, anchor) === E(2028, 2, 29), '下次 2/29');
  assert(Lunar.nextOccurrenceSolar(13, 1, anchor) === null, '非法月份应返回 null');
});

checker.check('节气查询：lastTermBefore / nextTermAfter / isTermDay', () => {
  assert(Lunar.lastTermBefore(E(2026, 11, 6)).index === 19, '11-06 之前应是霜降');
  assert(Lunar.nextTermAfter(E(2026, 11, 6)).epoch === E(2026, 11, 7), '11-06 之后应是立冬');
  assert(Lunar.lastTermBefore(E(2026, 11, 7)).epoch === E(2026, 10, 23), '立冬当天的上一节气应是霜降（严格早于）');
  assert(Lunar.nextTermAfter(E(2026, 11, 7)).epoch === E(2026, 11, 22), '立冬当天的下一节气应是小雪（严格晚于）');
  assert(Lunar.nextTermAfter(E(2026, 12, 22)).epoch === E(2027, 1, 5), '冬至之后应是 2027 小寒');
  // 抽样：最近节气严格夹住当天（1901 小寒之前 / 2100 冬至之后无相邻数据，返回 null）
  const firstTerm = Lunar.solarTermEpoch(1901, 0);
  const lastTerm = Lunar.solarTermEpoch(2100, 23);
  for (let i = 0; i < expected.length; i += 997) {
    const epoch = expected[i].epoch;
    const before = Lunar.lastTermBefore(epoch);
    const after = Lunar.nextTermAfter(epoch);
    if (before === null) assert(epoch < firstTerm, `${fmtDate(epoch)}: lastTermBefore 仅在 1901 小寒前允许为 null`);
    else {
      assert(before.epoch < epoch, `${fmtDate(epoch)}: lastTermBefore 不严格早于当天`);
      assert(before.index >= 0 && before.index < 24, `${fmtDate(epoch)}: lastTermBefore 索引越界`);
    }
    if (after === null) assert(epoch > lastTerm, `${fmtDate(epoch)}: nextTermAfter 仅在 2100 冬至后允许为 null`);
    else {
      assert(after.epoch > epoch, `${fmtDate(epoch)}: nextTermAfter 不严格晚于当天`);
      assert(after.index >= 0 && after.index < 24, `${fmtDate(epoch)}: nextTermAfter 索引越界`);
    }
  }
});

checker.check('数据边界：1900 尾部、2100 尾部、超范围行为', () => {
  // 1901-01-01 属农历 1900 年十一月十一（T1901c.txt 首行）
  const head = Lunar.fromEpoch(E(1901, 1, 1));
  assert(head.lunarYear === 1900 && head.month === 11 && head.day === 11, `1901-01-01=${head.lunarYear}/${head.month}/${head.day}`);
  assert(head.gz === '庚子' && head.zodiac === '鼠', `1900 干支=${head.gz}/${head.zodiac}`);
  // 1900 年 11/12 月由 T1901c.txt 反推，1901 年 1 月换算必须正确
  assert(Lunar.fromEpoch(E(1901, 1, 20)).text === '腊月初一', `1901-01-20=${Lunar.fromEpoch(E(1901, 1, 20)).text}`);
  assert(Lunar.fromEpoch(E(1901, 2, 19)).text === '正月初一', `1901-02-19=${Lunar.fromEpoch(E(1901, 2, 19)).text}`);
  assert(Lunar.springFestival(1900) === E(1900, 1, 31), '1900 正月初一应为 1900-01-31（通行万年历值）');
  // 2100 尾部：2100-12-31 为腊月初一（T2100c.txt 末行）；末月跨入 2101，月长占位 29
  const tail = Lunar.fromEpoch(E(2100, 12, 31));
  assert(tail.lunarYear === 2100 && tail.month === 12 && tail.day === 1, `2100-12-31=${tail.text}`);
  assert(Lunar.toEpoch(2100, 12, 29, false) !== null, '2100 腊月廿九应存在');
  assert(Lunar.toEpoch(2100, 12, 30, false) === null, '2100 腊月三十为数据边界占位（不可知）');
  // 超范围：节气表返回空/null，不抛异常
  assert(Array.isArray(Lunar.solarTermEpochs(1900)) && Lunar.solarTermEpochs(1900).length === 0, 'solarTermEpochs(1900) 应为 []');
  assert(Lunar.solarTermEpochs(2101).length === 0, 'solarTermEpochs(2101) 应为 []');
  assert(Lunar.solarTermEpoch(2100, 23) !== null, 'solarTermEpoch(2100, 冬至) 应有效');
  assert(Lunar.solarTermEpoch(2100, 24) === null, '非法节气索引应返回 null');
  assert(Lunar.solarTermEpoch(1900, 0) === null, '1900 年节气应返回 null');
  assert(Lunar.lastTermBefore(E(1901, 1, 2)) === null, '1901-01-02 无更早节气数据应返回 null');
  assert(Lunar.springFestival(1899) === null && Lunar.springFestival(2101) === null, '超出 1900..2100 的春节应返回 null');
  assert(Lunar.toEpoch(1899, 1, 1, false) === null, '超出数据范围的 toEpoch 应返回 null');
  // 数据边界外的 fromEpoch 收敛到最后一天，不抛异常
  const beyond = Lunar.fromEpoch(E(2101, 2, 1));
  assert(beyond.lunarYear === 2100 && beyond.month === 12, `超范围 fromEpoch 应收敛到 2100 腊月，实际 ${beyond.lunarYear}/${beyond.month}`);
});

checker.check('性能：全量逐日校验 < 5000ms', () => {
  assert(stats.dailyMs > 0, '逐日校验未执行');
  assert(stats.dailyMs < 5000, `逐日校验耗时 ${stats.dailyMs}ms，超过 5000ms 上限`);
});

/* ------------------------------------------------------------- 汇总输出 --- */

checker.flush();

const totalMs = Date.now() - totalT0;
const line = '─'.repeat(64);
console.log('');
console.log(line);
console.log(`[test-lunar] 数据源: 香港天文台 T{1901..2100}c.txt（tools/hko/raw/）`);
console.log(`[test-lunar] CAL_DATA 加载 ${loadedMs}ms；原始表独立解析 ${stats.parseMs}ms`);
console.log(
  `[test-lunar] 覆盖: ${stats.days} 天（1901-01-01..2100-12-31）/ ${stats.gregYears} 公历年 / ${stats.terms} 个节气 / ${stats.lunarYears + 1} 农历年（1900..2100）`,
);
console.log(
  `[test-lunar] 农历月: ${stats.months} 个（1901..2100），月长 ${stats.minMonthLength}..${stats.maxMonthLength} 天，闰年 ${stats.leapYears} 个`,
);
console.log(
  `[test-lunar] 逐日比对: ${stats.days} 天 × 农历/节气/星期/公历往返 / 文本 = 不一致 ${stats.mismatches} 处，引擎耗时 ${stats.dailyMs}ms（< 5000ms ✓）`,
);
console.log(`[test-lunar] 检查项: ${checker.passed} 通过 / ${checker.failures.length} 失败；总耗时 ${totalMs}ms`);
console.log(line);

if (checker.failures.length > 0) {
  console.error(`\n[test-lunar] FAILED: ${checker.failures.length} 个检查项失败`);
  process.exit(1);
}
console.log('[test-lunar] OK: 全部通过');
process.exit(0);
