/**
 * 农历引擎（纯函数、无 React 依赖、不依赖 Date 时区换算）。
 *
 * 数据来自同目录更小的 part：10-cal-data.js 的 CAL_DATA（香港天文台 1901–2100）。
 * 全部计算基于「epoch day」= 自 1970-01-01 起的整数天数（本地日历语义），
 * 公历换算用 Howard Hinnant 的 days_from_civil / civil_from_days 纯整数算法，
 * 与运行环境的时区、Date 实现无关。
 *
 * 数据模型：
 *   CAL_DATA.years[i] = [正月初一 epoch, monthBits, leapMonth]
 *     monthBits 第 k 位 = 该年第 k+1 个序位月 30 天；leapMonth 为闰月序位（无闰 0）
 *   序位月 → 月号：无闰时 monthNo = pos；有闰时 pos < leapMonth → pos，
 *                 pos === leapMonth → 闰(leapMonth-1) 月，pos > leapMonth → pos-1
 *
 * 边界（详见 tests/LUNAR-REPORT.md）：
 *   - 契约数据范围 1901-01-01 ~ 2100-12-31；1900 年条目仅用于 1901 年 1 月换算。
 *   - 2100 年腊月（末月）跨入 2101 年，月长不可知，数据按 29 天占位：
 *     toEpoch(2100,12,30) 返回 null；nextSpringFestival 在 2100-12-31 之后按占位推定。
 *   - 1901-01-01..01-04 没有更早的节气数据，lastTermBefore 返回 null（节气数据自 1901 小寒起）。
 */
const Lunar = (function () {
  'use strict';

  const YEAR_BASE = CAL_DATA.yearBase; // 1900
  const YEAR_TABLE = CAL_DATA.years;
  const TERM_BASE = CAL_DATA.termBase; // 1901
  const TERM_TABLE = CAL_DATA.terms;
  const YEAR_COUNT = YEAR_TABLE.length;
  const YEAR_MIN = YEAR_BASE;
  const YEAR_MAX = YEAR_BASE + YEAR_COUNT - 1; // 2100
  const TERM_MIN = TERM_BASE;
  const TERM_MAX = TERM_BASE + TERM_TABLE.length - 1; // 2100

  const MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  const DAY_NAMES = [
    '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
  ];
  const TERM_KEYS = [
    'xiaohan', 'dahan', 'lichun', 'yushui', 'jingzhe', 'chunfen', 'qingming', 'guyu',
    'lixia', 'xiaoman', 'mangzhong', 'xiazhi', 'xiaoshu', 'dashu', 'liqiu', 'chushu',
    'bailu', 'qiufen', 'hanlu', 'shuangjiang', 'lidong', 'xiaoxue', 'daxue', 'dongzhi',
  ];

  const STEMS = '甲乙丙丁戊己庚辛壬癸';
  const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

  /* -------------------------------------------------- 公历整数算术（无时区） --- */

  /** 公历 y-m-d → epoch day（1970-01-01 = 0）。m 为 1-12。 */
  function epochOf(y, m, d) {
    let yy = y;
    if (m <= 2) yy -= 1;
    const era = Math.floor(yy / 400);
    const yoe = yy - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }

  /** epoch day → { y, m, d }。 */
  function dateOf(epoch) {
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

  /** epoch day → 星期（0=周日 … 6=周六）。1970-01-01 为周四。 */
  function weekdayOf(epoch) {
    return (((epoch + 4) % 7) + 7) % 7;
  }

  /** 公历某年某月的天数。 */
  function daysInMonth(y, m) {
    if (m === 12) return epochOf(y + 1, 1, 1) - epochOf(y, 12, 1);
    return epochOf(y, m + 1, 1) - epochOf(y, m, 1);
  }

  /* -------------------------------------------------- 预展开农历年表 --- */

  const yearStarts = new Array(YEAR_COUNT); // 每个农历年正月初一 epoch
  const yearBits = new Array(YEAR_COUNT); // 月长位串
  const yearLeap = new Array(YEAR_COUNT); // 闰月序位（0=无）
  const yearMonthStarts = new Array(YEAR_COUNT); // Int32Array 各序位月首 epoch
  const yearMonthNos = new Array(YEAR_COUNT); // Uint8Array 各序位月号 1-12
  const yearMonthLeaps = new Array(YEAR_COUNT); // Uint8Array 是否闰月
  const yearMonthCounts = new Array(YEAR_COUNT); // 序位月数量（12/13）

  for (let i = 0; i < YEAR_COUNT; i += 1) {
    const row = YEAR_TABLE[i];
    const startEpoch = row[0];
    const bits = row[1];
    const leap = row[2] || 0;
    // 完整年为 12 个月，闰年 13 个月（1900 年条目同样按 13 个月存储；
    // 2100 年条目的腊月跨入 2101 年，但月首仍在 2100 年内，故仍计入 12 个月）。
    const count = leap ? 13 : 12;
    const starts = new Int32Array(count);
    const nos = new Uint8Array(count);
    const leaps = new Uint8Array(count);
    let cursor = startEpoch;
    for (let pos = 1; pos <= count; pos += 1) {
      starts[pos - 1] = cursor;
      if (leap === 0) {
        nos[pos - 1] = pos;
        leaps[pos - 1] = 0;
      } else if (pos < leap) {
        nos[pos - 1] = pos;
        leaps[pos - 1] = 0;
      } else if (pos === leap) {
        nos[pos - 1] = leap - 1;
        leaps[pos - 1] = 1;
      } else {
        nos[pos - 1] = pos - 1;
        leaps[pos - 1] = 0;
      }
      cursor += (bits >> (pos - 1)) & 1 ? 30 : 29;
    }
    yearStarts[i] = startEpoch;
    yearBits[i] = bits;
    yearLeap[i] = leap;
    yearMonthStarts[i] = starts;
    yearMonthNos[i] = nos;
    yearMonthLeaps[i] = leaps;
    yearMonthCounts[i] = count;
  }

  /** 最大 i 使 yearStarts[i] <= epoch；早于数据范围时返回 0。 */
  function yearIndexAt(epoch) {
    if (epoch <= yearStarts[0]) return 0;
    let lo = 0;
    let hi = YEAR_COUNT - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (yearStarts[mid] <= epoch) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /* -------------------------------------------------- 干支 / 生肖 --- */

  function ganzhiOf(year) {
    const index = ((year - 1984) % 60 + 60) % 60;
    const gz = STEMS.charAt(index % 10) + BRANCHES.charAt(index % 12);
    return { gz, zodiac: ZODIAC[index % 12], text: gz + '年' };
  }

  /* -------------------------------------------------- 农历 ↔ 公历 --- */

  /**
   * epoch day → 农历。
   * @returns {{lunarYear:number, month:number, day:number, isLeap:boolean,
   *            monthName:string, dayName:string, text:string, gz:string, zodiac:string}}
   */
  function fromEpoch(epoch) {
    const value = Math.floor(epoch);
    const yi = yearIndexAt(value);
    const starts = yearMonthStarts[yi];
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= value) lo = mid;
      else hi = mid - 1;
    }
    const bits = yearBits[yi];
    const monthLength = (bits >> lo) & 1 ? 30 : 29;
    let day = value - starts[lo] + 1;
    if (day < 1) day = 1;
    if (day > monthLength) day = monthLength; // 超出数据范围时收敛到月内最后一天
    const month = yearMonthNos[yi][lo];
    const isLeap = yearMonthLeaps[yi][lo] === 1;
    const monthName = (isLeap ? '闰' : '') + MONTH_NAMES[month - 1];
    const dayName = DAY_NAMES[day - 1];
    const lunarYear = YEAR_BASE + yi;
    const gz = ganzhiOf(lunarYear);
    return {
      lunarYear,
      month,
      day,
      isLeap,
      monthName,
      dayName,
      text: monthName + dayName,
      gz: gz.gz,
      zodiac: gz.zodiac,
    };
  }

  /** 农历年某月的天数；该年无此月（含闰月不存在）返回 0。 */
  function monthLengthOf(lunarYear, month, isLeap) {
    const yi = lunarYear - YEAR_BASE;
    if (yi < 0 || yi >= YEAR_COUNT) return 0;
    const nos = yearMonthNos[yi];
    const leaps = yearMonthLeaps[yi];
    const wantLeap = isLeap ? 1 : 0;
    for (let pos = 0; pos < nos.length; pos += 1) {
      if (nos[pos] === month && leaps[pos] === wantLeap) {
        return (yearBits[yi] >> pos) & 1 ? 30 : 29;
      }
    }
    return 0;
  }

  /**
   * 农历 → epoch day；日期不存在（含小月三十、不存在的闰月、超出数据范围）返回 null。
   */
  function toEpoch(lunarYear, month, day, isLeap) {
    if (!Number.isInteger(lunarYear) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 30) return null;
    const yi = lunarYear - YEAR_BASE;
    if (yi < 0 || yi >= YEAR_COUNT) return null;
    const nos = yearMonthNos[yi];
    const leaps = yearMonthLeaps[yi];
    const wantLeap = isLeap ? 1 : 0;
    for (let pos = 0; pos < nos.length; pos += 1) {
      if (nos[pos] === month && leaps[pos] === wantLeap) {
        const length = (yearBits[yi] >> pos) & 1 ? 30 : 29;
        if (day > length) return null;
        return yearMonthStarts[yi][pos] + day - 1;
      }
    }
    return null;
  }

  function monthName(month) {
    return MONTH_NAMES[month - 1] || '';
  }

  function dayName(day) {
    return DAY_NAMES[day - 1] || '';
  }

  /** { gz:'丙午', zodiac:'马', text:'丙午年' } */
  function lunarYearInfo(lunarYear) {
    return ganzhiOf(lunarYear);
  }

  /** 农历年正月初一 epoch；超出 1900..2100 返回 null。 */
  function springFestival(lunarYear) {
    const yi = lunarYear - YEAR_BASE;
    if (yi < 0 || yi >= YEAR_COUNT) return null;
    return yearStarts[yi];
  }

  /**
   * epoch 当天或之后最近的一个春节（正月初一）。
   * 当天即春节时返回当天；超出数据范围（2101 春节）按末月占位长度推定。
   */
  function nextSpringFestival(epoch) {
    const value = Math.floor(epoch);
    const yi = yearIndexAt(value);
    const lunarYear = YEAR_BASE + yi;
    if (value <= yearStarts[yi]) return { lunarYear, epoch: yearStarts[yi] };
    if (yi + 1 < YEAR_COUNT) return { lunarYear: lunarYear + 1, epoch: yearStarts[yi + 1] };
    // 数据边界：2100 年腊月跨入 2101 年，月长按占位（29 天）推定
    const starts = yearMonthStarts[yi];
    const lastLength = (yearBits[yi] >> (starts.length - 1)) & 1 ? 30 : 29;
    return { lunarYear: lunarYear + 1, epoch: starts[starts.length - 1] + lastLength };
  }

  /* -------------------------------------------------- 二十四节气 --- */

  /** 公历年 24 节气 epoch（顺序 小寒…冬至）；超出 1901..2100 返回 []。 */
  function solarTermEpochs(gregYear) {
    const index = gregYear - TERM_BASE;
    if (index < 0 || index >= TERM_TABLE.length) return [];
    const jan1 = epochOf(gregYear, 1, 1);
    const offsets = TERM_TABLE[index];
    const epochs = new Array(24);
    for (let i = 0; i < 24; i += 1) epochs[i] = jan1 + offsets[i];
    return epochs;
  }

  /** 某公历年某个节气的 epoch；超出数据范围返回 null。 */
  function solarTermEpoch(gregYear, index) {
    const yearIndex = gregYear - TERM_BASE;
    if (yearIndex < 0 || yearIndex >= TERM_TABLE.length) return null;
    if (!(index >= 0 && index < 24)) return null;
    return epochOf(gregYear, 1, 1) + TERM_TABLE[yearIndex][index];
  }

  /** epoch 当天若为节气日返回 24 节气索引，否则 -1。 */
  function solarTermIndexAt(epoch) {
    const date = dateOf(epoch);
    const yearIndex = date.y - TERM_BASE;
    if (yearIndex < 0 || yearIndex >= TERM_TABLE.length) return -1;
    const offset = epoch - epochOf(date.y, 1, 1);
    return TERM_TABLE[yearIndex].indexOf(offset);
  }

  function isTermDay(epoch) {
    return solarTermIndexAt(epoch) >= 0;
  }

  /** 严格早于 epoch 的最近一个节气；1901-01-01..01-04 无更早数据时返回 null。 */
  function lastTermBefore(epoch) {
    const value = Math.floor(epoch);
    const gregYear = dateOf(value).y;
    let best = null;
    for (let year = gregYear - 1; year <= gregYear; year += 1) {
      const yearIndex = year - TERM_BASE;
      if (yearIndex < 0 || yearIndex >= TERM_TABLE.length) continue;
      const jan1 = epochOf(year, 1, 1);
      const offsets = TERM_TABLE[yearIndex];
      for (let i = 0; i < 24; i += 1) {
        const candidate = jan1 + offsets[i];
        if (candidate < value && (best === null || candidate > best.epoch)) best = { index: i, epoch: candidate };
      }
    }
    return best;
  }

  /** 严格晚于 epoch 的最近一个节气；超出数据范围返回 null。 */
  function nextTermAfter(epoch) {
    const value = Math.floor(epoch);
    const gregYear = dateOf(value).y;
    let best = null;
    for (let year = gregYear; year <= gregYear + 1; year += 1) {
      const yearIndex = year - TERM_BASE;
      if (yearIndex < 0 || yearIndex >= TERM_TABLE.length) continue;
      const jan1 = epochOf(year, 1, 1);
      const offsets = TERM_TABLE[yearIndex];
      for (let i = 0; i < 24; i += 1) {
        const candidate = jan1 + offsets[i];
        if (candidate > value && (best === null || candidate < best.epoch)) best = { index: i, epoch: candidate };
      }
    }
    return best;
  }

  /* -------------------------------------------------- 格式化 / 下一次 --- */

  /** '九月廿九'（不含「农历」前缀） */
  function fmtLunarShort(epoch) {
    return fromEpoch(epoch).text;
  }

  /** '农历九月廿九' */
  function lunarDateText(epoch) {
    return '农历' + fromEpoch(epoch).text;
  }

  /**
   * 从 anchor 起（含当天）下一个农历 month/day 的 epoch。
   * 小月三十自动回退到当月最后一天；不存在的闰月年份跳过。
   */
  function nextOccurrenceLunar(month, day, isLeap, anchor) {
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 30) return null;
    const startYear = fromEpoch(anchor).lunarYear;
    for (let lunarYear = startYear; lunarYear <= YEAR_MAX; lunarYear += 1) {
      const length = monthLengthOf(lunarYear, month, !!isLeap);
      if (length === 0) continue;
      const candidate = toEpoch(lunarYear, month, Math.min(day, length), !!isLeap);
      if (candidate !== null && candidate >= anchor) return candidate;
    }
    return null;
  }

  /** 从 anchor 起（含当天）下一个公历 month/day 的 epoch；2/29 只在闰年出现。 */
  function nextOccurrenceSolar(month, day, anchor) {
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    const startYear = dateOf(anchor).y;
    for (let year = startYear; year <= startYear + 8; year += 1) {
      if (day > daysInMonth(year, month)) continue;
      const candidate = epochOf(year, month, day);
      if (candidate >= anchor) return candidate;
    }
    return null;
  }

  return {
    // 常量
    MONTH_NAMES,
    DAY_NAMES,
    TERM_KEYS,
    // 公历工具
    epochOf,
    dateOf,
    weekdayOf,
    // 农历
    fromEpoch,
    toEpoch,
    monthName,
    dayName,
    lunarYearInfo,
    springFestival,
    nextSpringFestival,
    // 节气
    solarTermEpochs,
    solarTermEpoch,
    solarTermIndexAt,
    lastTermBefore,
    nextTermAfter,
    isTermDay,
    // 格式化 / 下一次
    lunarDateText,
    fmtLunarShort,
    nextOccurrenceLunar,
    nextOccurrenceSolar,
    // 数据边界（供 UI/测试检查，非契约必需）
    YEAR_MIN,
    YEAR_MAX,
    TERM_MIN,
    TERM_MAX,
  };
})();
