/* 岁时 · 内容数据自检（tests/test-festivals.mjs）
 *
 * 运行：cd suishi && node tests/test-festivals.mjs
 * 退出码 0 = 全部通过；1 = 有失败项（逐条打印）。
 *
 * 校验对象：src/parts/20-festivals.js（TERMS_META / FESTIVALS_META / TERM_MAP / FESTIVAL_MAP）
 * 基准：
 * - 节气 key 顺序优先用 11-lunar.js 的 Lunar.TERM_KEYS（data 队友文件；若已就绪则一并加载）；
 *   未就绪时回退到契约 §8.2 的固定 TERM_KEYS 表，并打印提示。
 * - 三候、黄经、season、25 节令的固定名单/规则/priority/tagLabel 全部按契约 §8.3 硬编码为本脚本的快照。
 * 注意：本脚本不读取也不修改任何其它 part；不联网、不启动浏览器、不安装插件。
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PARTS = join(ROOT, 'src', 'parts');

let passCount = 0;
const fails = [];
const notes = [];

function ok(cond, msg) {
  if (cond) {
    passCount += 1;
  } else {
    fails.push(msg);
  }
  return cond;
}

function arrEq(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function textLen(s) {
  return Array.from(s).length;
}

function hanLen(s) {
  const m = String(s).match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g);
  return m ? m.length : 0;
}

function evalParts(files, retExpr) {
  const src = files.map((f) => readFileSync(join(PARTS, f), 'utf8')).join('\n');
  // 与 build.mjs 一致：拼进同一函数作用域后用 new Function 求值
  const fn = new Function(src + '\nreturn { ' + retExpr + ' };');
  return fn();
}

/* ── 契约 §8.2：TERM_KEYS 顺序 / 名称 / season 分组 ── */
const CONTRACT_TERM_KEYS = [
  'xiaohan', 'dahan', 'lichun', 'yushui', 'jingzhe', 'chunfen',
  'qingming', 'guyu', 'lixia', 'xiaoman', 'mangzhong', 'xiazhi',
  'xiaoshu', 'dashu', 'liqiu', 'chushu', 'bailu', 'qiufen',
  'hanlu', 'shuangjiang', 'lidong', 'xiaoxue', 'daxue', 'dongzhi',
];
const CONTRACT_TERM_NAMES = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];
// 小寒起每节气黄经 +15°；春分 360° 归一为 0°
const CONTRACT_LONGITUDES = CONTRACT_TERM_KEYS.map((_, i) => (285 + 15 * i) % 360);
const CONTRACT_SEASONS = [
  '冬', '冬', '春', '春', '春', '春', '春', '春',
  '夏', '夏', '夏', '夏', '夏', '夏',
  '秋', '秋', '秋', '秋', '秋', '秋',
  '冬', '冬', '冬', '冬',
];

/* ── 契约 §8.3：三候快照（《月令七十二候集解》通行本；异文取用见 20-festivals.js 头注释）── */
const CONTRACT_TERM_HOU = {
  xiaohan: ['雁北乡', '鹊始巢', '雉始雊'],
  dahan: ['鸡始乳', '征鸟厉疾', '水泽腹坚'],
  lichun: ['东风解冻', '蛰虫始振', '鱼陟负冰'],
  yushui: ['獭祭鱼', '候雁北', '草木萌动'],
  jingzhe: ['桃始华', '仓庚鸣', '鹰化为鸠'],
  chunfen: ['玄鸟至', '雷乃发声', '始电'],
  qingming: ['桐始华', '田鼠化为鴽', '虹始见'],
  guyu: ['萍始生', '鸣鸠拂其羽', '戴胜降于桑'],
  lixia: ['蝼蝈鸣', '蚯蚓出', '王瓜生'],
  xiaoman: ['苦菜秀', '靡草死', '麦秋至'],
  mangzhong: ['螳螂生', '鵙始鸣', '反舌无声'],
  xiazhi: ['鹿角解', '蜩始鸣', '半夏生'],
  xiaoshu: ['温风至', '蟋蟀居宇', '鹰始鸷'],
  dashu: ['腐草为萤', '土润溽暑', '大雨时行'],
  liqiu: ['凉风至', '白露降', '寒蝉鸣'],
  chushu: ['鹰乃祭鸟', '天地始肃', '禾乃登'],
  bailu: ['鸿雁来', '玄鸟归', '群鸟养羞'],
  qiufen: ['雷始收声', '蛰虫坯户', '水始涸'],
  hanlu: ['鸿雁来宾', '雀入大水为蛤', '菊有黄华'],
  shuangjiang: ['豺乃祭兽', '草木黄落', '蛰虫咸俯'],
  lidong: ['水始冰', '地始冻', '雉入大水为蜃'],
  xiaoxue: ['虹藏不见', '天气上升地气下降', '闭塞而成冬'],
  daxue: ['鹖鴠不鸣', '虎始交', '荔挺出'],
  dongzhi: ['蚯蚓结', '麋角解', '水泉动'],
};

/* ── 契约 §8.3：固定 25 节令（顺序、名称、规则、priority、tagLabel 都不可改）── */
const CONTRACT_FESTIVALS = [
  { key: 'chunjie', name: '春节', calendar: 'special', rule: 'spring-festival', priority: 1 },
  { key: 'chuxi', name: '除夕', calendar: 'special', rule: 'eve-of-spring-festival', priority: 1 },
  { key: 'yuanxiao', name: '元宵节', calendar: 'lunar', month: 1, day: 15, priority: 2 },
  { key: 'longtaitou', name: '龙抬头', calendar: 'lunar', month: 2, day: 2, priority: 3 },
  { key: 'duanwu', name: '端午节', calendar: 'lunar', month: 5, day: 5, priority: 2 },
  { key: 'qixi', name: '七夕节', calendar: 'lunar', month: 7, day: 7, priority: 2 },
  { key: 'zhongyuan', name: '中元节', calendar: 'lunar', month: 7, day: 15, priority: 3 },
  { key: 'zhongqiu', name: '中秋节', calendar: 'lunar', month: 8, day: 15, priority: 2 },
  { key: 'chongyang', name: '重阳节', calendar: 'lunar', month: 9, day: 9, priority: 2 },
  { key: 'laba', name: '腊八节', calendar: 'lunar', month: 12, day: 8, priority: 2, tagLabel: '腊日' },
  { key: 'xiaonian', name: '小年', calendar: 'lunar', month: 12, day: 23, priority: 2, tagLabel: '灶王节' },
  { key: 'yuandan', name: '元旦', calendar: 'solar', month: 1, day: 1, priority: 2 },
  { key: 'qingrenjie', name: '情人节', calendar: 'solar', month: 2, day: 14, priority: 3 },
  { key: 'funvjie', name: '妇女节', calendar: 'solar', month: 3, day: 8, priority: 3 },
  { key: 'yurenjie', name: '愚人节', calendar: 'solar', month: 4, day: 1, priority: 3 },
  { key: 'laodongjie', name: '劳动节', calendar: 'solar', month: 5, day: 1, priority: 2 },
  { key: 'qingnianjie', name: '青年节', calendar: 'solar', month: 5, day: 4, priority: 3 },
  { key: 'muqinjie', name: '母亲节', calendar: 'nth-weekday', month: 5, weekday: 0, nth: 2, priority: 3 },
  { key: 'ertongjie', name: '儿童节', calendar: 'solar', month: 6, day: 1, priority: 3 },
  { key: 'fuqinjie', name: '父亲节', calendar: 'nth-weekday', month: 6, weekday: 0, nth: 3, priority: 3 },
  { key: 'jiaoshijie', name: '教师节', calendar: 'solar', month: 9, day: 10, priority: 3 },
  { key: 'guoqingjie', name: '国庆节', calendar: 'solar', month: 10, day: 1, priority: 2 },
  { key: 'wanshengye', name: '万圣夜', calendar: 'solar', month: 10, day: 31, priority: 3 },
  { key: 'pinganye', name: '平安夜', calendar: 'solar', month: 12, day: 24, priority: 2 },
  { key: 'shengdanjie', name: '圣诞节', calendar: 'solar', month: 12, day: 25, priority: 2 },
];
const SOLAR_MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/* ═══════════ 0. 加载数据（含可选的 Lunar 基准）═══════════ */
const DATA_SRC = readFileSync(join(PARTS, '20-festivals.js'), 'utf8');
ok(true, 'new Function 解析 20-festivals.js');

const data = evalParts(['20-festivals.js'], 'TERMS_META, FESTIVALS_META, TERM_MAP, FESTIVAL_MAP');
const { TERMS_META, FESTIVALS_META, TERM_MAP, FESTIVAL_MAP } = data;

ok(!/^\s*(import|export)\s+/m.test(DATA_SRC), '20-festivals.js 不含 import/export（是普通 JS 片段，不是 module）');

let Lunar = null;
const lunarFiles = [];
if (existsSync(join(PARTS, '10-cal-data.js'))) lunarFiles.push('10-cal-data.js');
if (existsSync(join(PARTS, '11-lunar.js'))) lunarFiles.push('11-lunar.js');
if (lunarFiles.includes('11-lunar.js')) {
  try {
    Lunar = evalParts(lunarFiles, 'Lunar').Lunar;
  } catch (err) {
    notes.push('11-lunar.js 已存在但当前不可求值（' + err.message + '），节气顺序改用契约固定表。');
  }
}
const BENCH_KEYS = Lunar && Array.isArray(Lunar.TERM_KEYS) ? Lunar.TERM_KEYS : CONTRACT_TERM_KEYS;

/* ═══════════ 1. 数量与整体结构 ═══════════ */
ok(Array.isArray(TERMS_META), 'TERMS_META 是数组');
ok(Array.isArray(FESTIVALS_META), 'FESTIVALS_META 是数组');
ok(TERMS_META.length === 24, 'TERMS_META 恰 24 项（实得 ' + (TERMS_META || []).length + '）');
ok(FESTIVALS_META.length === 25, 'FESTIVALS_META 恰 25 项（实得 ' + (FESTIVALS_META || []).length + '）');
ok(isObj(TERM_MAP) && !Array.isArray(TERM_MAP), 'TERM_MAP 是对象');
ok(isObj(FESTIVAL_MAP) && !Array.isArray(FESTIVAL_MAP), 'FESTIVAL_MAP 是对象');

/* ═══════════ 2. 二十四节气 ═══════════ */
const termKeys = TERMS_META.map((t) => t.key);
ok(new Set(termKeys).size === termKeys.length, '节气 key 唯一');
ok(new Set(TERMS_META.map((t) => t.name)).size === 24, '节气 name 唯一');
ok(arrEq(termKeys, BENCH_KEYS), '节气顺序与 TERM_KEYS 一致（' + (Lunar ? '基准=Lunar.TERM_KEYS' : '基准=契约固定表 §8.2') + '）');
if (Lunar && Array.isArray(Lunar.TERM_KEYS)) {
  ok(arrEq(Lunar.TERM_KEYS, CONTRACT_TERM_KEYS), '11-lunar.js 的 TERM_KEYS 与契约 §8.2 一致');
}
ok(arrEq(TERMS_META.map((t) => t.name), CONTRACT_TERM_NAMES), '节气名称与契约 §8.3 顺序一致');

let termDescMin = Infinity;
let termDescMax = 0;
let termHanMin = Infinity;
TERMS_META.forEach((t, i) => {
  const p = '节气[' + i + ' ' + (t && t.name) + ']';
  ok(isObj(t), p + ' 是对象');
  if (!isObj(t)) return;
  ok(typeof t.key === 'string' && /^[a-z]+$/.test(t.key), p + ' key 为小写拼音');
  ok(t.key === CONTRACT_TERM_KEYS[i], p + ' key 与契约顺序一致');
  ok(typeof t.name === 'string' && t.name.length === 2 && /[\u4E00-\u9FFF]{2}/.test(t.name), p + ' name 为两字中文');
  ok(t.season === CONTRACT_SEASONS[i], p + ' season 为「' + CONTRACT_SEASONS[i] + '」');
  ok(t.longitude === CONTRACT_LONGITUDES[i], p + ' longitude 为 ' + CONTRACT_LONGITUDES[i] + '°（实得 ' + t.longitude + '）');
  ok(Array.isArray(t.hou), p + ' hou 是数组');
  ok(Array.isArray(t.hou) && t.hou.length === 3, p + ' 三候恰 3 条');
  ok(Array.isArray(t.hou) && t.hou.every((h) => typeof h === 'string' && h.length > 0), p + ' 三候均非空字符串');
  ok(Array.isArray(t.hou) && new Set(t.hou).size === t.hou.length, p + ' 三候不重复');
  ok(arrEq(t.hou, CONTRACT_TERM_HOU[t.key]), p + ' 三候与《月令七十二候集解》快照一致');
  const dl = typeof t.description === 'string' ? textLen(t.description) : -1;
  ok(dl >= 50 && dl <= 90, p + ' description 长度 50–90（实得 ' + dl + '）');
  const hl = typeof t.description === 'string' ? hanLen(t.description) : 0;
  ok(hl >= 50, p + ' description 汉字不少于 50（实得 ' + hl + '，防止用标点凑数）');
  if (typeof t.description === 'string') {
    termDescMin = Math.min(termDescMin, dl);
    termDescMax = Math.max(termDescMax, dl);
    termHanMin = Math.min(termHanMin, hl);
  }
  if (t.customs !== undefined) {
    ok(Array.isArray(t.customs) && t.customs.length >= 1 && t.customs.length <= 3, p + ' customs 若存在则 1–3 条');
    ok(Array.isArray(t.customs) && t.customs.every((c) => typeof c === 'string' && c.length > 0), p + ' customs 均非空字符串');
  }
});

/* ═══════════ 3. 二十五节令 ═══════════ */
const festKeys = FESTIVALS_META.map((f) => f.key);
ok(new Set(festKeys).size === festKeys.length, '节令 key 唯一');
ok(new Set(FESTIVALS_META.map((f) => f.name)).size === 25, '节令 name 唯一');
ok(arrEq(FESTIVALS_META.map((f) => f.name), CONTRACT_FESTIVALS.map((f) => f.name)), '节令名称与顺序严格等于契约 §8.3 的固定名单');

const calCount = { lunar: 0, solar: 0, 'nth-weekday': 0, special: 0 };
let festDescMin = Infinity;
let festDescMax = 0;

FESTIVALS_META.forEach((f, i) => {
  const exp = CONTRACT_FESTIVALS[i] || {};
  const p = '节令[' + i + ' ' + (f && f.name) + ']';
  ok(isObj(f), p + ' 是对象');
  if (!isObj(f)) return;
  ok(f.key === exp.key, p + ' key 为 ' + exp.key + '（实得 ' + f.key + '）');
  ok(typeof f.key === 'string' && /^[a-z]+$/.test(f.key), p + ' key 为小写拼音');
  ok(f.name === exp.name, p + ' name 为 ' + exp.name);
  ok(f.calendar === exp.calendar, p + ' calendar 为 ' + exp.calendar);
  ok(f.priority === exp.priority, p + ' priority 为 ' + exp.priority);
  ok(exp.calendar === 'special' ? f.rule === exp.rule : f.rule === undefined,
    p + (exp.calendar === 'special' ? ' rule 为 ' + exp.rule : ' 无 rule 字段'));

  // 规则字段合法
  if (f.calendar === 'lunar') {
    calCount.lunar += 1;
    ok(Number.isInteger(f.month) && f.month >= 1 && f.month <= 12, p + ' 农历 month 合法');
    ok(Number.isInteger(f.day) && f.day >= 1 && f.day <= 30, p + ' 农历 day 合法（1–30）');
    ok(f.weekday === undefined && f.nth === undefined, p + ' 农历项无 weekday/nth');
    ok(f.month === exp.month && f.day === exp.day, p + ' 农历日期为 ' + exp.month + '/' + exp.day);
  } else if (f.calendar === 'solar') {
    calCount.solar += 1;
    ok(Number.isInteger(f.month) && f.month >= 1 && f.month <= 12, p + ' 公历 month 合法');
    ok(Number.isInteger(f.day) && f.day >= 1 && f.day <= SOLAR_MONTH_DAYS[f.month - 1], p + ' 公历 day 合法');
    ok(f.weekday === undefined && f.nth === undefined, p + ' 公历项无 weekday/nth');
    ok(f.month === exp.month && f.day === exp.day, p + ' 公历日期为 ' + exp.month + '/' + exp.day);
  } else if (f.calendar === 'nth-weekday') {
    calCount['nth-weekday'] += 1;
    ok(Number.isInteger(f.month) && f.month >= 1 && f.month <= 12, p + ' nth-weekday month 合法');
    ok(Number.isInteger(f.weekday) && f.weekday >= 0 && f.weekday <= 6, p + ' nth-weekday weekday 合法（0=周日）');
    ok(Number.isInteger(f.nth) && f.nth >= 1 && f.nth <= 5, p + ' nth-weekday nth 合法（1–5）');
    ok(f.day === undefined, p + ' nth-weekday 无 day 字段');
    ok(f.month === exp.month && f.weekday === exp.weekday && f.nth === exp.nth,
      p + ' 规则为 ' + exp.month + ' 月第 ' + exp.nth + ' 个周' + '日一二三四五六'[exp.weekday]);
  } else if (f.calendar === 'special') {
    calCount.special += 1;
    ok(f.month === undefined && f.day === undefined && f.weekday === undefined && f.nth === undefined,
      p + ' special 项不带 month/day/weekday/nth');
  } else {
    ok(false, p + ' calendar 取值非法：' + f.calendar);
  }

  // aliases
  ok(Array.isArray(f.aliases) && f.aliases.length >= 2 && f.aliases.length <= 4, p + ' aliases 2–4 条');
  ok(Array.isArray(f.aliases) && f.aliases.every((a) => typeof a === 'string' && a.length > 0 && a !== f.name), p + ' aliases 均非空且不等于本名');
  ok(Array.isArray(f.aliases) && new Set(f.aliases).size === f.aliases.length, p + ' aliases 不重复');
  if (exp.name === '小年') ok(Array.isArray(f.aliases) && f.aliases.includes('灶王节'), p + ' 小年 aliases 含「灶王节」');

  // 描述
  const dl = typeof f.description === 'string' ? textLen(f.description) : -1;
  ok(dl >= 40 && dl <= 80, p + ' description 长度 40–80（实得 ' + dl + '）');
  const hl = typeof f.description === 'string' ? hanLen(f.description) : 0;
  ok(hl >= 40, p + ' description 汉字不少于 40（实得 ' + hl + '）');
  if (typeof f.description === 'string') {
    festDescMin = Math.min(festDescMin, dl);
    festDescMax = Math.max(festDescMax, dl);
  }

  // 习俗
  ok(Array.isArray(f.customs) && f.customs.length >= 2 && f.customs.length <= 4, p + ' customs 2–4 条');
  ok(Array.isArray(f.customs) && f.customs.every((c) => typeof c === 'string' && c.length > 0), p + ' customs 均非空短句');
  ok(Array.isArray(f.customs) && new Set(f.customs).size === f.customs.length, p + ' customs 不重复');

  // tagLabel：仅腊八节=腊日、小年=灶王节
  if (exp.tagLabel) {
    ok(f.tagLabel === exp.tagLabel, p + ' tagLabel 为「' + exp.tagLabel + '」');
  } else {
    ok(f.tagLabel === undefined, p + ' 无 tagLabel');
  }
});

ok(calCount.special === 2, 'special 恰 2 项（春节/除夕）');
ok(calCount.lunar === 9, '农历固定节日恰 9 项');
ok(calCount.solar === 12, '公历固定节日恰 12 项');
ok(calCount['nth-weekday'] === 2, 'nth-weekday 恰 2 项（母亲节/父亲节）');

/* ═══════════ 4. 索引表 ═══════════ */
ok(Object.keys(TERM_MAP).length === 24, 'TERM_MAP 含 24 个 key');
ok(Object.keys(FESTIVAL_MAP).length === 25, 'FESTIVAL_MAP 含 25 个 key');
ok(TERMS_META.every((t) => TERM_MAP[t.key] === t), 'TERM_MAP 的每一项都指回 TERMS_META 原对象');
ok(FESTIVALS_META.every((f) => FESTIVAL_MAP[f.key] === f), 'FESTIVAL_MAP 的每一项都指回 FESTIVALS_META 原对象');

/* ═══════════ 5. 契约验收点抽查 ═══════════ */
const lidong = TERM_MAP.lidong;
ok(lidong && lidong.longitude === 225, '立冬黄经 = 225°（详情弹层 chip 的文案来源）');
ok(lidong && arrEq(lidong.hou, ['水始冰', '地始冻', '雉入大水为蜃']), '立冬三候 = 水始冰/地始冻/雉入大水为蜃（与参考图 p5-drawer 一致）');
ok(lidong && /包饺子/.test(lidong.description) && /羊肉/.test(lidong.description), '立冬文案含「包饺子 / 羊肉」的具体生活动作');
const spot = [
  ['xiaohan', ['雁北乡', '鹊始巢', '雉始雊']],
  ['dashu', ['腐草为萤', '土润溽暑', '大雨时行']],
  ['dongzhi', ['蚯蚓结', '麋角解', '水泉动']],
  ['jingzhe', ['桃始华', '仓庚鸣', '鹰化为鸠']],
];
spot.forEach(([k, hou]) => ok(TERM_MAP[k] && arrEq(TERM_MAP[k].hou, hou), '三候抽查 ' + TERM_MAP[k].name + ' = ' + hou.join('/')));

/* ═══════════ 输出 ═══════════ */
console.log('=== 岁时 · 内容数据自检 (tests/test-festivals.mjs) ===');
console.log('数据：src/parts/20-festivals.js');
console.log('基准：' + (Lunar ? 'Lunar.TERM_KEYS（11-lunar.js 已加载）' : '契约 §8.2 固定 TERM_KEYS（11-lunar.js 尚未就绪）'));
notes.forEach((n) => console.log('提示：' + n));
console.log('— 节气：24 项；描述长度 ' + termDescMin + '–' + termDescMax + ' 字（最少汉字 ' + termHanMin + '）');
console.log('— 节令：25 项；描述长度 ' + festDescMin + '–' + festDescMax + ' 字；' +
  '传统/公历/nth-weekday/special = ' + calCount.lunar + '/' + calCount.solar + '/' + calCount['nth-weekday'] + '/' + calCount.special);

if (fails.length === 0) {
  console.log('✓ 全部通过：' + passCount + ' 项断言，0 失败');
  process.exit(0);
}
console.log('✗ 失败 ' + fails.length + ' 项（通过 ' + passCount + ' 项）：');
fails.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
process.exit(1);
