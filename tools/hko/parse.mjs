/**
 * 香港天文台公历农历对照表原始文本解析（构建期工具，不随插件包发布）。
 *
 * 原始文本: tools/hko/raw/T{年}c.txt（UTF-8 BOM，CRLF）
 *   文件头: 2026(丙午 - 馬年)年公曆與農曆對照表
 *   列头:   公曆日期  農曆日期  星期  節氣
 *   数据行: 2026年1月5日          十七        星期一      小寒
 *           2026年2月17日         正月        星期二          ← 农历月首只写月名
 *
 * 本模块把 1901–2100 全部原始行解析成逐日序列，再据此推导
 *   - 每个农历月的月首与月长（29/30）
 *   - 每年 12/13 个月、闰月位置
 *   - 每个公历年 24 节气的 (epoch - 1 月 1 日)
 * 并做严格一致性断言；任何不一致都 throw。
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RAW_DIR = path.join(__dirname, 'raw');

export const YEAR_START = 1901;
export const YEAR_END = 2100;

/** 24 节气（与 Lunar.TERM_KEYS 顺序一致），含繁体/简体/异体别名 */
export const TERM_NAMES = [
  ['小寒'],
  ['大寒'],
  ['立春'],
  ['雨水'],
  ['驚蟄', '惊蛰', '驚蜇'],
  ['春分'],
  ['清明'],
  ['穀雨', '谷雨'],
  ['立夏'],
  ['小滿', '小满'],
  ['芒種', '芒种'],
  ['夏至'],
  ['小暑'],
  ['大暑'],
  ['立秋'],
  ['處暑', '处暑'],
  ['白露'],
  ['秋分'],
  ['寒露'],
  ['霜降'],
  ['立冬'],
  ['小雪'],
  ['大雪'],
  ['冬至'],
];

const TERM_LOOKUP = new Map();
TERM_NAMES.forEach((names, index) => names.forEach((n) => TERM_LOOKUP.set(n, index)));

/** 农历数字字面 */
const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

const MONTH_LOOKUP = new Map();
MONTH_LOOKUP.set('正月', 1);
MONTH_LOOKUP.set('二月', 2);
MONTH_LOOKUP.set('三月', 3);
MONTH_LOOKUP.set('四月', 4);
MONTH_LOOKUP.set('五月', 5);
MONTH_LOOKUP.set('六月', 6);
MONTH_LOOKUP.set('七月', 7);
MONTH_LOOKUP.set('八月', 8);
MONTH_LOOKUP.set('九月', 9);
MONTH_LOOKUP.set('十月', 10);
MONTH_LOOKUP.set('冬月', 11);
MONTH_LOOKUP.set('十一月', 11);
MONTH_LOOKUP.set('臘月', 12);
MONTH_LOOKUP.set('腊月', 12);
MONTH_LOOKUP.set('十二月', 12);

const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

const WEEKDAY_LOOKUP = new Map([
  ['星期日', 0], ['星期天', 0], ['星期一', 1], ['星期二', 2], ['星期三', 3],
  ['星期四', 4], ['星期五', 5], ['星期六', 6],
]);

// ────────────────────────────── 公历整数算术（与 src/parts/11-lunar.js 实现一致） ──

/** 公历 y-m-d → epoch day（1970-01-01 = 0），纯整数，与时区无关 */
export function epochOf(y, m, d) {
  let yy = y;
  if (m <= 2) yy -= 1;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** epoch day → 公历 { y, m, d } */
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

/** epoch day → 星期（0=周日） */
export function weekdayOf(epoch) {
  return (((epoch + 4) % 7) + 7) % 7;
}

// ────────────────────────────── 单行解析 ──────────────────────────────

const DATE_RE = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/;

/** 农历日号字面 → 1..30；不是日号返回 0 */
export function dayNumberOf(token) {
  if (token.length === 2) {
    if (token[0] === '初') return CN_DIGIT[token[1]] ?? 0;
    if (token[0] === '十') return 10 + (CN_DIGIT[token[1]] ?? 0);
    if (token[0] === '廿') return 20 + (CN_DIGIT[token[1]] ?? 0);
    if (token[0] === '二' && token[1] === '十') return 20;
    if (token[0] === '三' && token[1] === '十') return 30;
  }
  return 0;
}

/** 农历字样 → { month, isLeap }；不是月名返回 null */
export function monthOf(token) {
  let t = token;
  let isLeap = false;
  if (t[0] === '閏' || t[0] === '闰') {
    isLeap = true;
    t = t.slice(1);
  }
  const m = MONTH_LOOKUP.get(t);
  if (!m) return null;
  return { month: m, isLeap };
}

/**
 * 解析单个公曆年文件。
 * @returns {{ year:number, rows: Array<{y:number,m:number,d:number,epoch:number,token:string,
 *            monthStart:{month:number,isLeap:boolean}|null, dayNumber:number, termIndex:number,
 *            weekday:number}> }}
 */
export function parseRawText(text, expectYear) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split('\n');
  const rows = [];
  const errors = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\r$/, '').trim();
    if (!line || line.startsWith('公曆') || /^星期/.test(line)) continue;
    const firstSpace = line.search(/\s/);
    const head = firstSpace === -1 ? line : line.slice(0, firstSpace);
    const match = DATE_RE.exec(head);
    if (!match) continue; // 文件标题行 / 空行

    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const rest = line.slice(firstSpace).trim().split(/\s+/);
    if (rest.length < 2) {
      errors.push(`第 ${i + 1} 行列数不足: ${line}`);
      continue;
    }
    const [lunarToken, weekdayToken, ...others] = rest;
    if (!WEEKDAY_LOOKUP.has(weekdayToken)) {
      errors.push(`第 ${i + 1} 行星期无法识别: ${line}`);
      continue;
    }
    let termIndex = null;
    if (others.length > 1) {
      errors.push(`第 ${i + 1} 行多出无法识别的列: ${line}`);
      continue;
    } else if (others.length === 1) {
      const t = TERM_LOOKUP.get(others[0]);
      if (t === undefined) {
        errors.push(`第 ${i + 1} 行节气无法识别: ${others[0]} (${line})`);
        continue;
      }
      termIndex = t;
    }
    const monthStart = monthOf(lunarToken);
    const dayNumber = monthStart ? 1 : dayNumberOf(lunarToken);
    if (!monthStart && dayNumber === 0) {
      errors.push(`第 ${i + 1} 行农历日期无法识别: ${lunarToken} (${line})`);
      continue;
    }
    rows.push({
      y, m, d,
      epoch: epochOf(y, m, d),
      token: lunarToken,
      monthStart,
      dayNumber,
      termIndex,
      weekday: WEEKDAY_LOOKUP.get(weekdayToken),
      raw: line,
    });
  }

  if (errors.length) {
    throw new Error(`T${expectYear}c.txt 解析失败 ${errors.length} 处:\n  ` + errors.slice(0, 8).join('\n  '));
  }
  return { year: expectYear, rows };
}

/** 读取一个公曆年的原始文件并解析 */
export function loadRawYear(year) {
  const file = path.join(RAW_DIR, `T${year}c.txt`);
  if (!existsSync(file)) throw new Error(`缺少原始文件 ${file}，请先运行: node tools/hko/fetch.mjs`);
  return parseRawText(readFileSync(file, 'utf8'), year);
}

/**
 * 读取全部 1901..2100 原始文件，合并为连续逐日序列。
 * @returns {Array<{epoch:number, y:number,m:number,d:number, token:string, monthStart:object|null,
 *                 dayNumber:number, termIndex:number|null, weekday:number}>}
 */
export function loadAllDays(start = YEAR_START, end = YEAR_END) {
  const days = [];
  for (let y = start; y <= end; y += 1) {
    const { rows } = loadRawYear(y);
    // 单年检查: 行数 = 全年天数, 日期连续覆盖 1/1..12/31, 星期正确
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const expected = isLeap ? 366 : 365;
    if (rows.length !== expected) {
      throw new Error(`T${y}c.txt 应有 ${expected} 行，实际 ${rows.length} 行`);
    }
    const jan1 = epochOf(y, 1, 1);
    for (let k = 0; k < rows.length; k += 1) {
      const r = rows[k];
      if (r.epoch !== jan1 + k) {
        throw new Error(`T${y}c.txt 日期不连续: 第 ${k + 1} 行 ${r.raw}`);
      }
      if (r.weekday !== weekdayOf(r.epoch)) {
        throw new Error(`T${y}c.txt 星期与公历不符: ${r.raw}`);
      }
      days.push(r);
    }
  }
  return days;
}

// ────────────────────────────── 构建 CAL_DATA 表 ──────────────────────────────

/**
 * 由逐日原始序列推导 CAL_DATA 所需的 years / terms 表，并做全部一致性断言。
 */
export function buildCalendarTable(days) {
  if (!days.length) throw new Error('没有解析到任何原始数据');
  for (let i = 1; i < days.length; i += 1) {
    if (days[i].epoch !== days[i - 1].epoch + 1) throw new Error(`逐日序列在 ${days[i].raw} 处不连续`);
  }
  const firstEpoch = days[0].epoch;
  const lastEpoch = days[days.length - 1].epoch;

  // ── 1. 节气表：每个公历年恰好 24 个，且按 小寒→冬至 顺序出现 ──
  const byYear = new Map();
  for (const day of days) {
    if (!byYear.has(day.y)) byYear.set(day.y, []);
    byYear.get(day.y).push(day);
  }
  const termTable = [];
  for (let y = YEAR_START; y <= YEAR_END; y += 1) {
    const yearDays = byYear.get(y) ?? [];
    const terms = yearDays.filter((d) => d.termIndex !== null);
    if (terms.length !== 24) throw new Error(`${y} 年节气应为 24 个，实际 ${terms.length} 个`);
    const jan1 = epochOf(y, 1, 1);
    const offsets = [];
    const seen = new Set();
    for (let i = 0; i < terms.length; i += 1) {
      const t = terms[i];
      if (t.termIndex !== i) {
        throw new Error(`${y} 年第 ${i + 1} 个节气顺序错误: 期望索引 ${i}，实际 ${t.termIndex}（${t.raw}）`);
      }
      if (seen.has(t.termIndex)) throw new Error(`${y} 年节气重复: ${t.raw}`);
      seen.add(t.termIndex);
      const offset = t.epoch - jan1;
      if (offset < 0 || offset > 365) throw new Error(`${y} 年节气偏移越界: ${t.raw} → ${offset}`);
      offsets.push(offset);
    }
    for (let i = 1; i < offsets.length; i += 1) {
      if (offsets[i] <= offsets[i - 1]) throw new Error(`${y} 年节气偏移未递增: ${offsets}`);
    }
    termTable.push(offsets);
  }

  // ── 2. 农历月首序列（含 1901 文件开头反推的上一年月首） ──
  const starts = []; // { epoch, month, isLeap, derived }
  const firstTokenDay = days[0].dayNumber;
  if (days[0].monthStart) {
    starts.push({ epoch: days[0].epoch, month: days[0].monthStart.month, isLeap: days[0].monthStart.isLeap, derived: false });
  } else {
    // 1901-01-01 处于上一农历年某月中间：用日号反推月首
    starts.push({ epoch: days[0].epoch - (firstTokenDay - 1), month: 0, isLeap: false, derived: true });
  }
  for (const day of days) {
    if (day.monthStart) {
      const last = starts[starts.length - 1];
      if (last.epoch === day.epoch) continue; // 已作为首条
      starts.push({ epoch: day.epoch, month: day.monthStart.month, isLeap: day.monthStart.isLeap, derived: false });
    }
  }

  // 首条的月份由其后第一个「正月」之前的月首数量反推：first.month = 12 - (正月前的月首行数)
  const firstZhengIndex = starts.findIndex((s) => !s.isLeap && s.month === 1);
  if (firstZhengIndex < 0) throw new Error('原始数据中找不到正月月首');
  if (starts[0].derived) {
    const before = firstZhengIndex - 1; // 首条之后、正月之前的月首数
    starts[0].month = 12 - before;
    if (starts[0].month < 1) throw new Error(`反推 1901 年前一月首失败（before=${before}）`);
  }

  // ── 3. 逐日连续性校验：每个日期的农历字样必须与月首/日号一致 ──
  let startCursor = 0;
  for (const day of days) {
    while (startCursor + 1 < starts.length && starts[startCursor + 1].epoch <= day.epoch) startCursor += 1;
    const start = starts[startCursor];
    const offset = day.epoch - start.epoch;
    if (offset < 0) throw new Error(`日期 ${day.raw} 早于首个农历月首`);
    const expectedToken = offset === 0
      ? (start.isLeap ? '閏' : '') + MONTH_TOKEN[start.month]
      : DAY_NAMES[offset];
    if (offset > 29) throw new Error(`农历月长超过 30 天：${day.raw}（月首 ${dateOf(start.epoch).y}-${dateOf(start.epoch).m}-${dateOf(start.epoch).d}）`);
    const actualMonth = monthOf(day.token);
    if (offset === 0) {
      if (!actualMonth || actualMonth.month !== start.month || actualMonth.isLeap !== start.isLeap) {
        throw new Error(`月首不一致：${day.raw}（表内 ${start.month}${start.isLeap ? '闰' : ''}）`);
      }
    } else if (day.token !== expectedToken) {
      throw new Error(`农历日不一致：${day.raw}，期望 ${expectedToken}`);
    }
  }
  // 月长 29/30 + 月首必须严格递进
  const monthLengths = [];
  for (let i = 1; i < starts.length; i += 1) {
    const len = starts[i].epoch - starts[i - 1].epoch;
    if (len !== 29 && len !== 30) throw new Error(`月长异常 ${len}（月首 ${starts[i - 1].epoch}）`);
    monthLengths.push(len);
  }

  // ── 4. 按农历年归组 ──
  // 首条为 1900 年某月（由反推得到 11）；之后遇到非闰正月即进入下一年
  const groups = new Map(); // lunarYear -> [{month,isLeap,epoch}]
  let lunarYear = 1900;
  for (let i = 0; i < starts.length; i += 1) {
    const s = starts[i];
    if (i > 0 && !s.isLeap && s.month === 1) {
      const greg = dateOf(s.epoch);
      if (greg.y !== lunarYear + 1) throw new Error(`正月初一 ${greg.y} 年不属于农历 ${lunarYear + 1} 年`);
      lunarYear += 1;
    }
    if (!groups.has(lunarYear)) groups.set(lunarYear, []);
    groups.get(lunarYear).push(s);
  }

  // ── 5. 组装 years 表 ──
  // years[0] 为农历 1900 年：HKO 年历从 1901 起，缺失 1–10 月数据。
  //   仅 11、12 月（T1901c.txt 反推）为真实值；1–10 月长度按「闰八月（闰月位置 9）」
  //   的合法划分占位（总和恰与 11 月首衔接）。1900 正月初一取通行万年历值 1900-01-31。
  const CNY_1900 = epochOf(1900, 1, 31);
  const g1901 = groups.get(1901);
  if (!g1901 || g1901[0].month !== 1) throw new Error('农历 1901 年正月缺失');
  const g1900 = groups.get(1900) ?? [];
  const m11 = g1900.find((s) => !s.isLeap && s.month === 11);
  const m12 = g1900.find((s) => !s.isLeap && s.month === 12);
  if (!m11 || !m12) throw new Error('无法从 T1901c.txt 反推农历 1900 年 11/12 月月首');
  const gap = m11.epoch - CNY_1900; // 1900 正月初一 → 冬月(11月)初一
  // 闰八月情形：位置 1..11 共 11 个月（含闰八月）覆盖 gap 天
  const PLACEHOLDER_1900 = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30]; // 位置 1..11，和 = 325
  const placeholderSum = PLACEHOLDER_1900.reduce((a, b) => a + b, 0);
  if (placeholderSum !== gap) {
    throw new Error(
      `农历 1900 年占位月长与真实衔接不符: 占位和 ${placeholderSum} 天，需 ${gap} 天（1900 正月初一推导值 ${new Date(CNY_1900 * 86400000).toISOString().slice(0, 10)}）`,
    );
  }
  const len11of1900 = m12.epoch - m11.epoch;
  const len12of1900 = g1901[0].epoch - m12.epoch;
  if (len11of1900 !== 29 && len11of1900 !== 30) throw new Error(`1900 年 11 月长度异常: ${len11of1900}`);
  if (len12of1900 !== 29 && len12of1900 !== 30) throw new Error(`1900 年 12 月长度异常: ${len12of1900}`);
  // 1900 年必须是有闰月的 13 个月长年（384 天）；否则 1900 正月初一 / 闰月假设不成立
  const total1900 = g1901[0].epoch - CNY_1900;
  if (total1900 !== 384) {
    throw new Error(`农历 1900 年总长异常: ${total1900} 天（应为 384，说明 1900 正月初一或闰月假设有误）`);
  }
  if (gap + len11of1900 + len12of1900 !== total1900) {
    throw new Error(`农历 1900 年推导不闭合: ${gap}+${len11of1900}+${len12of1900} != ${total1900}`);
  }
  const months1900 = [...PLACEHOLDER_1900, len11of1900, len12of1900]; // 位置 1..13
  const bits1900 = months1900.reduce((bits, len, idx) => (len === 30 ? bits | (1 << idx) : bits), 0);

  const years = [{ startEpoch: CNY_1900, monthBits: bits1900, leapMonth: 9 }];
  const leapYears = [];
  for (let ly = 1901; ly <= 2100; ly += 1) {
    const months = groups.get(ly);
    if (!months || months.length < 11) {
      throw new Error(`农历 ${ly} 年月数异常: ${months ? months.length : 0}`);
    }
    if (months[0].month !== 1 || months[0].isLeap) throw new Error(`农历 ${ly} 年首月必须是正月`);
    // 校验月序：1..12 依次出现，闰月只重复前一月号
    const positions = [];
    let leapPos = 0;
    for (let i = 0; i < months.length; i += 1) {
      const mo = months[i];
      if (!mo.isLeap) {
        if (mo.month !== i - (leapPos ? 1 : 0) + 1) {
          throw new Error(`农历 ${ly} 年月序异常: 第 ${i + 1} 个月为 ${mo.month} 月`);
        }
      } else {
        if (leapPos) throw new Error(`农历 ${ly} 年出现多个闰月`);
        if (i === 0) throw new Error(`农历 ${ly} 年闰月不能位于正月之前`);
        if (mo.month !== months[i - 1].month) throw new Error(`农历 ${ly} 年闰月 ${mo.month} 与前月不符`);
        leapPos = i + 1;
      }
      positions.push(mo);
    }
    // 月数：完整年 12/13；2100 年数据截断允许 11 或 12（末月跨入 2101 年，月长未知）
    const isLastYear = ly === 2100;
    if (isLastYear) {
      if (months.length < 11 || months.length > 13) throw new Error(`农历 2100 年月数异常: ${months.length}`);
    } else if (months.length !== 12 && months.length !== 13) {
      throw new Error(`农历 ${ly} 年月数应为 12/13，实际 ${months.length}`);
    }
    if (leapPos && (leapPos < 2 || leapPos > 13)) throw new Error(`农历 ${ly} 年闰月位置非法: ${leapPos}`);
    if (leapPos) leapYears.push({ ly, leapMonth: leapPos, name: months[leapPos - 1].month });

    // 月长：完整年的最后一个月长 = 下一年正月初一 - 末月月首（由全局月首序列取下一月首）；
    //       2100 年末月月长未知 → 占位 29（仅用于换算，不用于 2100-12-31 之后日期）
    const lengths = [];
    for (let i = 0; i < months.length; i += 1) {
      const gi = starts.indexOf(months[i]);
      const nextEpoch = gi + 1 < starts.length ? starts[gi + 1].epoch : null;
      if (nextEpoch !== null) lengths.push(nextEpoch - months[i].epoch);
      else lengths.push(isLastYear ? 29 : -1);
    }
    for (let i = 0; i < lengths.length; i += 1) {
      if (lengths[i] !== 29 && lengths[i] !== 30) {
        if (isLastYear && i === lengths.length - 1) continue; // 2100 末月占位
        throw new Error(`农历 ${ly} 年第 ${i + 1} 个月长异常: ${lengths[i]}`);
      }
    }
    const bits = lengths.reduce((acc, len, idx) => (len === 30 ? acc | (1 << idx) : acc), 0);
    years.push({ startEpoch: months[0].epoch, monthBits: bits, leapMonth: leapPos });
  }

  // 春节（正月初一）必须严格递增，且相邻间隔 353..385 天
  for (let i = 1; i < years.length; i += 1) {
    const delta = years[i].startEpoch - years[i - 1].startEpoch;
    if (delta < 353 || delta > 385) {
      throw new Error(`春节间隔异常: ${years[i - 1].startEpoch} → ${years[i].startEpoch} 相差 ${delta} 天`);
    }
  }
  // 1901-01-01 必须落在 1901 春节之前
  if (!(firstEpoch < years[1].startEpoch)) throw new Error('1901-01-01 应早于农历 1901 年正月初一');

  return {
    yearBase: 1900,
    termBase: YEAR_START,
    years,
    terms: termTable,
    stats: {
      days: days.length,
      firstEpoch,
      lastEpoch,
      firstDate: dateOf(firstEpoch),
      lastDate: dateOf(lastEpoch),
      gregYears: YEAR_END - YEAR_START + 1,
      lunarYears: years.length,
      leapYears,
      monthStarts: starts.length,
      minMonthLen: Math.min(...monthLengths),
      maxMonthLen: Math.max(...monthLengths),
      firstLunarMonth: `${starts[0].month}${starts[0].isLeap ? '闰' : ''}月（1900 年，反推）`,
    },
  };
}

const MONTH_TOKEN = ['', '正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

/** 便捷入口：读取全部原始数据并构建表 */
export function loadAndBuild() {
  const days = loadAllDays();
  return buildCalendarTable(days);
}
