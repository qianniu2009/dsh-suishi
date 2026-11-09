#!/usr/bin/env node
/**
 * 由香港天文台原始年历文本生成 src/parts/10-cal-data.js。
 *
 * 用法:
 *   node tools/hko/fetch.mjs            # 先下载 1901–2100 原始文本（约 5.6MB）
 *   node tools/hko/build-calendar.mjs   # 解析 + 断言 + 生成数据文件
 *
 * 产物: src/parts/10-cal-data.js（构建期生成，禁止手改）
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndBuild, epochOf, dateOf, YEAR_START, YEAR_END } from './parse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_FILE = path.join(ROOT, 'src', 'parts', '10-cal-data.js');

function formatYears(years) {
  return years
    .map(({ startEpoch, monthBits, leapMonth }) => `    [${startEpoch}, 0b${monthBits.toString(2)}, ${leapMonth}],`)
    .join('\n');
}

function formatTerms(terms) {
  return terms.map((offsets) => `    [${offsets.join(',')}],`).join('\n');
}

function main() {
  const t0 = Date.now();
  const table = loadAndBuild();
  const { years, terms, stats } = table;
  if (years.length !== 201) throw new Error(`years 应为 201 条（1900..2100），实际 ${years.length}`);
  if (terms.length !== 200) throw new Error(`terms 应为 200 条（1901..2100），实际 ${terms.length}`);

  const header = `/**
 * 香港天文台 1901–2100 公历农历对照表（离线内置数据）。
 *
 * 数据来源: 香港天文台「1901–2100 年公曆與農曆日期對照表」
 *   https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T{年}c.txt
 * 生成命令: node tools/hko/fetch.mjs && node tools/hko/build-calendar.mjs
 * 数据校验: node tests/test-lunar.mjs
 * ※ 本文件由 tools/hko/build-calendar.mjs 生成，禁止手改。
 *
 * CAL_DATA.years[i] → 农历年 (yearBase + i)，覆盖 1900..2100：
 *   [startEpoch, monthBits, leapMonth]
 *   startEpoch  该农历年正月初一的 epoch day（自 1970-01-01 的整数天数，与时区无关）
 *   monthBits   第 k 位(0 起)=1 → 该年第 k+1 个序位月 30 天，0 → 29 天
 *   leapMonth   闰月在月序中的位置 1..13：第 leapMonth 个序位是闰月（月号同第 leapMonth-1 个），
 *               无闰月为 0
 *   ※ 1900 年条目：HKO 年历自 1901 起（T1900c.txt 为 404），故 1900 正月初一取通行万年历值
 *     1900-01-31，1–10 月长度为占位（按闰八月、位置 9 的合法划分，仅保证与 11 月首衔接），
 *     11、12 月由 T1901c.txt 首行「十一」反推。1901-01-01 之后的换算不依赖占位月。
 *   ※ 2100 年条目：末月（跨入 2101 年）月长无法由 1901–2100 原始数据确定，按 29 天占位；
 *     该占位只影响 2100-12-31 之后的换算（契约数据范围之外）。
 *
 * CAL_DATA.terms[i] → 公历年 (termBase + i) 的 24 个节气（1901..2100）：
 *   每项 24 个整数 = 节气日期的 (epoch - 该年 1 月 1 日 epoch)；
 *   顺序: 小寒,大寒,立春,雨水,惊蛰,春分,清明,谷雨,立夏,小满,芒种,夏至,
 *         小暑,大暑,立秋,处暑,白露,秋分,寒露,霜降,立冬,小雪,大雪,冬至
 */
const CAL_DATA = {
  yearBase: 1900,
  termBase: 1901,
  years: [
${formatYears(years)}
  ],
  terms: [
${formatTerms(terms)}
  ]
};
`;

  writeFileSync(OUT_FILE, header, 'utf8');

  // ── 统计输出 ──
  const pad2 = (value) => String(value).padStart(2, '0');
  const first = stats.firstDate;
  const last = stats.lastDate;
  const firstText = first.y + '-' + pad2(first.m) + '-' + pad2(first.d);
  const lastText = last.y + '-' + pad2(last.m) + '-' + pad2(last.d);
  console.log('[hko] 原始数据: ' + stats.days + ' 天（' + firstText + ' .. ' + lastText + '）');
  console.log('[hko] 公历年: ' + stats.gregYears + '（' + YEAR_START + '..' + YEAR_END + '），每年 24 节气');
  console.log('[hko] 农历年: ' + stats.lunarYears + '（1900..2100），闰年 ' + stats.leapYears.length + ' 个（1901..2100）');
  console.log('[hko] 农历月首: ' + stats.monthStarts + ' 个，月长 ' + stats.minMonthLen + '..' + stats.maxMonthLen + ' 天');
  console.log('[hko] 生成 ' + path.relative(ROOT, OUT_FILE) + '（' + header.length + ' bytes，' + (Date.now() - t0) + ' ms）');

  // 一轮自检：从生成后的内存数据反查关键日期
  const { years: Y } = table;
  const cny = (ly) => Y[ly - 1900].startEpoch;
  const checks = [
    ['1901 春节', dateOf(cny(1901)), { y: 1901, m: 2, d: 19 }],
    ['2026 春节', dateOf(cny(2026)), { y: 2026, m: 2, d: 17 }],
    ['2027 春节', dateOf(cny(2027)), { y: 2027, m: 2, d: 6 }],
    ['2100 春节', dateOf(cny(2100)), { y: 2100, m: 2, d: 9 }],
  ];
  for (const [name, got, want] of checks) {
    if (got.y !== want.y || got.m !== want.m || got.d !== want.d) {
      throw new Error(`${name} 自检失败: 得到 ${got.y}-${got.m}-${got.d}，期望 ${want.y}-${want.m}-${want.d}`);
    }
    console.log('[hko] 自检 ' + name + ' = ' + got.y + '-' + pad2(got.m) + '-' + pad2(got.d) + ' ✓');
  }
  console.log('[hko] 完成');
  return table;
}

try {
  main();
} catch (e) {
  console.error('[hko] 生成失败:', e.message);
  process.exit(1);
}
