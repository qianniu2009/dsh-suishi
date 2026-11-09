#!/usr/bin/env node
/**
 * data 侧测试 harness：把 src/parts/10-cal-data.js + 11-lunar.js 装进一个
 * `new Function` 作用域求值（与 build.mjs 的拼接语义一致），并提供一个
 * **独立实现**的香港天文台原始表解析器（不复用 tools/hko/parse.mjs），
 * 用于逐日交叉校验农历引擎。
 *
 * 用法（tests/test-lunar.mjs 内部调用）:
 *   import { loadLunar, buildExpectedDays, RAW_DIR } from './harness.mjs'
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PARTS_DIR = path.join(ROOT, 'src', 'parts');
export const RAW_DIR = path.join(ROOT, 'tools', 'hko', 'raw');

export const YEAR_START = 1901;
export const YEAR_END = 2100;

/* ------------------------------------------------------------- 加载 parts --- */

/** 10-cal-data.js + 11-lunar.js → { CAL_DATA, Lunar }（与构建时同一作用域）。 */
export function loadLunar() {
  const body = ['10-cal-data.js', '11-lunar.js']
    .map((name) => readFileSync(path.join(PARTS_DIR, name), 'utf8'))
    .join('\n');
  const factory = new Function(body + '\nreturn { CAL_DATA: CAL_DATA, Lunar: Lunar };');
  const api = factory();
  if (!api.CAL_DATA) throw new Error('10-cal-data.js 未定义 CAL_DATA');
  if (!api.Lunar) throw new Error('11-lunar.js 未定义 Lunar');
  return api;
}

/* --------------------------------------------------------- 原始表独立解析 --- */

/** 节气名（香港天文台繁体写法）→ 24 节气索引（小寒…冬至） */
export const TERM_NAME_TO_INDEX = new Map([
  ['小寒', 0], ['大寒', 1], ['立春', 2], ['雨水', 3], ['驚蟄', 4], ['春分', 5],
  ['清明', 6], ['穀雨', 7], ['立夏', 8], ['小滿', 9], ['芒種', 10], ['夏至', 11],
  ['小暑', 12], ['大暑', 13], ['立秋', 14], ['處暑', 15], ['白露', 16], ['秋分', 17],
  ['寒露', 18], ['霜降', 19], ['立冬', 20], ['小雪', 21], ['大雪', 22], ['冬至', 23],
]);

/** 农历月名 → [月号, 是否闰]（兼容 十一月/冬月、十二月/腊月 两种写法） */
export const MONTH_TOKEN_TO_INFO = new Map();
[
  ['正月', 1], ['二月', 2], ['三月', 3], ['四月', 4], ['五月', 5], ['六月', 6],
  ['七月', 7], ['八月', 8], ['九月', 9], ['十月', 10], ['十一月', 11], ['冬月', 11],
  ['十二月', 12], ['臘月', 12], ['腊月', 12],
].forEach(([token, month]) => MONTH_TOKEN_TO_INFO.set(token, { month, isLeap: false }));
for (const base of ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']) {
  const info = MONTH_TOKEN_TO_INFO.get(base);
  MONTH_TOKEN_TO_INFO.set('閏' + base, { month: info.month, isLeap: true });
  MONTH_TOKEN_TO_INFO.set('闰' + base, { month: info.month, isLeap: true });
}

/** 农历日名（初一…三十）→ 1..30 */
export const DAY_TOKEN_TO_NUMBER = new Map([
  ['初一', 1], ['初二', 2], ['初三', 3], ['初四', 4], ['初五', 5], ['初六', 6], ['初七', 7],
  ['初八', 8], ['初九', 9], ['初十', 10], ['十一', 11], ['十二', 12], ['十三', 13], ['十四', 14],
  ['十五', 15], ['十六', 16], ['十七', 17], ['十八', 18], ['十九', 19], ['二十', 20], ['廿一', 21],
  ['廿二', 22], ['廿三', 23], ['廿四', 24], ['廿五', 25], ['廿六', 26], ['廿七', 27], ['廿八', 28],
  ['廿九', 29], ['三十', 30],
]);

/** 引擎展示用农历月名（与 Lunar.MONTH_NAMES 独立维护，用于比对） */
export const DISPLAY_MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
/** 引擎展示用农历日名 */
export const DISPLAY_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

const WEEKDAY_TO_INDEX = new Map([
  ['星期日', 0], ['星期天', 0], ['星期一', 1], ['星期二', 2], ['星期三', 3],
  ['星期四', 4], ['星期五', 5], ['星期六', 6],
]);

/** 公历 epoch（与引擎/工具同算法，但这里独立写一份用于交叉验证） */
export function epochOf(y, m, d) {
  let yy = y;
  if (m <= 2) yy -= 1;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function dateOf(epoch) {
  const z = epoch + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

export function fmtDate(epoch) {
  const date = dateOf(epoch);
  return date.y + '-' + String(date.m).padStart(2, '0') + '-' + String(date.d).padStart(2, '0');
}

const ROW_RE = /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\S+)\s+(星期[一二三四五六日天])(?:\s+(\S+))?$/;

/** 读取并校验单个公历年的原始文本。 */
export function readRawYear(year) {
  const file = path.join(RAW_DIR, `T${year}c.txt`);
  if (!existsSync(file)) {
    throw new Error(`缺少原始文件 ${file}\n请先运行: cd ${ROOT} && node tools/hko/fetch.mjs`);
  }
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/u, '');
  const rows = [];
  let lineNo = 0;
  for (const rawLine of text.split('\n')) {
    lineNo += 1;
    const line = rawLine.replace(/\r$/u, '').trim();
    if (!line || !/^\d{4}年/.test(line)) continue;
    const match = ROW_RE.exec(line);
    if (!match) throw new Error(`T${year}c.txt:${lineNo} 无法解析: ${line}`);
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (y !== year) throw new Error(`T${year}c.txt:${lineNo} 年份不符: ${line}`);
    const token = match[4];
    const weekday = WEEKDAY_TO_INDEX.get(match[5]);
    const termToken = match[6] || null;
    let termIndex = -1;
    if (termToken !== null) {
      termIndex = TERM_NAME_TO_INDEX.has(termToken) ? TERM_NAME_TO_INDEX.get(termToken) : -1;
      if (termIndex < 0) throw new Error(`T${year}c.txt:${lineNo} 未知节气名: ${termToken}`);
    }
    const monthInfo = MONTH_TOKEN_TO_INFO.get(token) || null;
    const dayNumber = monthInfo ? 1 : DAY_TOKEN_TO_NUMBER.get(token) ?? 0;
    if (!monthInfo && dayNumber === 0) throw new Error(`T${year}c.txt:${lineNo} 未知农历日期: ${token}`);
    rows.push({ y, m, d, epoch: epochOf(y, m, d), token, monthInfo, dayNumber, termIndex, weekday });
  }
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const expectedRows = isLeapYear ? 366 : 365;
  if (rows.length !== expectedRows) throw new Error(`T${year}c.txt 应有 ${expectedRows} 行，实际 ${rows.length} 行`);
  const jan1 = epochOf(year, 1, 1);
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].epoch !== jan1 + i) throw new Error(`T${year}c.txt 第 ${i + 1} 行日期不连续`);
    if (rows[i].weekday !== ((((rows[i].epoch + 4) % 7) + 7) % 7)) {
      throw new Error(`T${year}c.txt 第 ${i + 1} 行星期与公历不符: ${rows[i].token}`);
    }
  }
  return rows;
}

/**
 * 独立解析 1901-01-01..2100-12-31 全部原始行，推导逐日期望值：
 *   { epoch, y, m, d, weekday, lunarYear, month, isLeap, day, termIndex, monthStart }
 */
export function buildExpectedDays() {
  const rows = [];
  for (let year = YEAR_START; year <= YEAR_END; year += 1) rows.push(...readRawYear(year));
  if (rows.length !== 73049) throw new Error(`逐日行数应为 73049，实际 ${rows.length}`);

  // 1901 文件首行处于农历 1900 年某月：用「正月之前还有几个月首」反推该月月号
  const firstZhengIndex = rows.findIndex((row) => row.monthInfo && !row.monthInfo.isLeap && row.monthInfo.month === 1);
  if (firstZhengIndex < 0) throw new Error('原始数据中找不到正月月首');
  const monthsBeforeZheng = rows
    .slice(0, firstZhengIndex)
    .filter((row) => row.monthInfo != null).length;
  const startsWithMonthToken = rows[0].monthInfo != null;
  const firstMonth = (startsWithMonthToken ? 13 : 12) - monthsBeforeZheng;
  if (firstMonth < 1 || firstMonth > 12) throw new Error(`反推 1901 年前一月号失败: ${firstMonth}`);
  if (!startsWithMonthToken && firstMonth !== 11) throw new Error(`1901 文件首月应为农历 1900 年 11 月，反推得 ${firstMonth}`);

  const expected = new Array(rows.length);
  let lunarYear = 1900;
  let currentMonth = firstMonth;
  let currentLeap = false;
  let prevDayNumber = null;
  let monthStartEpoch = null;

  if (!startsWithMonthToken) {
    prevDayNumber = rows[0].dayNumber;
    monthStartEpoch = rows[0].epoch - (prevDayNumber - 1);
  }

  const monthLengths = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.monthInfo) {
      const info = row.monthInfo;
      if (!info.isLeap && info.month === 1 && i > 0) {
        lunarYear += 1;
        const gregYear = row.y;
        if (gregYear !== lunarYear) throw new Error(`正月初一 ${fmtDate(row.epoch)} 的农历年应为 ${gregYear}`);
      }
      if (monthStartEpoch !== null) {
        const length = row.epoch - monthStartEpoch;
        if (length !== 29 && length !== 30) {
          throw new Error(`原始数据月长异常: ${fmtDate(monthStartEpoch)} 起 ${length} 天`);
        }
        monthLengths.push(length);
      }
      currentMonth = info.month;
      currentLeap = info.isLeap;
      prevDayNumber = 1;
      monthStartEpoch = row.epoch;
    } else {
      if (prevDayNumber === null) throw new Error(`首行不是月首且缺少日号: ${fmtDate(row.epoch)}`);
      if (i > 0 && row.dayNumber !== prevDayNumber + 1) {
        throw new Error(`农历日不连续: ${fmtDate(row.epoch)} 日号 ${row.dayNumber}，上一日 ${prevDayNumber}`);
      }
      prevDayNumber = row.dayNumber;
    }
    expected[i] = {
      epoch: row.epoch,
      y: row.y,
      m: row.m,
      d: row.d,
      weekday: row.weekday,
      lunarYear,
      month: currentMonth,
      isLeap: currentLeap,
      day: prevDayNumber,
      termIndex: row.termIndex,
      monthStart: row.monthInfo != null,
    };
  }
  return { days: expected, monthLengths };
}

/* ---------------------------------------------------------------- 断言工具 --- */

export class Checker {
  constructor() {
    this.passed = 0;
    this.failures = [];
    this.pending = [];
  }

  check(name, fn) {
    try {
      fn();
      this.passed += 1;
      this.pending.push({ name, ok: true });
    } catch (error) {
      this.failures.push({ name, message: error && error.message ? error.message : String(error) });
      this.pending.push({ name, ok: false, message: error && error.message ? error.message : String(error) });
    }
  }

  flush() {
    for (const item of this.pending) {
      if (item.ok) console.log(`  ok   ${item.name}`);
      else console.log(`  FAIL ${item.name}: ${item.message}`);
    }
    this.pending = [];
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** 比较并返回前 limit 条差异描述（用于逐日比对时集中打印）。 */
export class DiffCollector {
  constructor(limit = 20) {
    this.limit = limit;
    this.count = 0;
    this.messages = [];
  }

  add(message) {
    this.count += 1;
    if (this.messages.length < this.limit) this.messages.push(message);
  }

  assertEmpty(label) {
    if (this.count > 0) {
      throw new Error(`${label}: ${this.count} 处不一致\n    ` + this.messages.join('\n    '));
    }
  }
}
