// =========================================================
// 日付の計算（画面とは切り離した計算だけ）
//
//   日付は「1970年1月1日から何日目か」の整数（z）で持つ（グレゴリオ暦、1〜9999年）。
//   整数の足し算・引き算だけなので、誤差は出ない。
//
//   ・日数を数える：終わり − 始め。〇週〇日・〇年〇か月〇日・平日／土日／祝日の数
//   ・〇日後：日・週・か月・年（月末は合わせる：1/31 の1か月後 → 2/28）、土日祝をとばす（営業日）
//   ・年齢：満年齢（2/29 生まれは、うるう年でない年は 3/1 に1つ増える）、数え年、干支
//   ・和暦：明治6年（1873年。日本がこの暦にした年）から
//   ・和暦の年：年だけで 西暦 ⇔ 令和・平成・昭和・大正・明治（終わった元号も「続いていたら」）・十干十二支
//   ・祝日：2000〜2099年の分を、祝日の法律のきまりから計算（春分・秋分は計算式）
// =========================================================
import * as F from './format.js';

export const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;
export const HOLIDAY_FROM = 2000;
export const HOLIDAY_TO = 2099;

// ---------------------------------------------------------
// 日付 ⇔ 何日目
// ---------------------------------------------------------
export function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z) {
  const t = z + 719468;
  const era = Math.floor(t / 146097);
  const doe = t - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export const weekday = (z) => (((z + 4) % 7) + 7) % 7; // 0 日曜 … 6 土曜（1970/1/1 は木曜）
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
export const isWeekend = (z) => weekday(z) === 0 || weekday(z) === 6;

// 今日（このスマホの時計）
export function today(now = new Date()) {
  return daysFromCivil(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const inRange = (z) => {
  const { y } = civilFromDays(z);
  return y >= MIN_YEAR && y <= MAX_YEAR;
};

// ---------------------------------------------------------
// 文字にする
// ---------------------------------------------------------
export function dateText(z) {
  const { y, m, d } = civilFromDays(z);
  return `${y}/${m}/${d}`;
}
export const dateWeek = (z) => `${dateText(z)}（${WEEK[weekday(z)]}）`;
export function dateLong(z) {
  const { y, m, d } = civilFromDays(z);
  return `${y}年${m}月${d}日（${WEEK[weekday(z)]}）`;
}
export const shortMD = (z) => {
  const { m, d } = civilFromDays(z);
  return `${m}/${d}`;
};
export const daysText = (n) => `${F.groupInt(String(n))}日`;

// ---------------------------------------------------------
// 和暦
// ---------------------------------------------------------
// key は打つときの記号。from は始まりの日（この日からその元号）
export const ERAS = [
  { key: 'R', name: '令和', from: daysFromCivil(2019, 5, 1), offset: 2018 },
  { key: 'H', name: '平成', from: daysFromCivil(1989, 1, 8), offset: 1988 },
  { key: 'S', name: '昭和', from: daysFromCivil(1926, 12, 25), offset: 1925 },
  { key: 'T', name: '大正', from: daysFromCivil(1912, 7, 30), offset: 1911 },
  { key: 'M', name: '明治', from: daysFromCivil(1873, 1, 1), offset: 1867 },
];
export const eraByKey = (key) => ERAS.find((e) => e.key === key) ?? null;

export function eraOf(z) {
  return ERAS.find((e) => z >= e.from) ?? null;
}

// 「令和8年11月9日」（1873年より前は null）
export function wareki(z, { week = false } = {}) {
  const e = eraOf(z);
  if (!e) return null;
  const { y, m, d } = civilFromDays(z);
  const n = y - e.offset;
  return `${e.name}${n === 1 ? '元' : n}年${m}月${d}日${week ? `（${WEEK[weekday(z)]}）` : ''}`;
}

// 元号の終わりの日（次の元号の前の日）
function eraLastDay(e) {
  const i = ERAS.indexOf(e);
  return i === 0 ? null : ERAS[i - 1].from - 1;
}

// ---------------------------------------------------------
// 打った文字 → 日付
//   '2026/11/9'、'11/9'（今年）、'20261109'。era が 'R' 'H' 'S' 'T' なら年は和暦（'60/5/3'）
//   返す値：{ z } / { z: null }（空）/ { error, incomplete }（打ちかけ・ない日）
// ---------------------------------------------------------
export function parseDate(text, era = 'AD', todayZ = today()) {
  if (!text) return { z: null };
  const e = era === 'AD' ? null : eraByKey(era);
  let y;
  let m;
  let d;
  if (text.includes('/')) {
    const parts = text.split('/');
    if (parts.some((p) => p === '')) return { error: '月と日まで打ってください（例：2026/11/9）', incomplete: true };
    if (parts.length === 3) [y, m, d] = parts.map(Number);
    else if (parts.length === 2) {
      [m, d] = parts.map(Number);
      y = civilFromDays(todayZ).y;
      if (e) y -= e.offset;
    } else return { error: '日付の形がちがいます' };
  } else if (!e && /^\d{8}$/.test(text)) {
    y = Number(text.slice(0, 4));
    m = Number(text.slice(4, 6));
    d = Number(text.slice(6));
  } else {
    return { error: '「/」で区切って打ちます（例：2026/11/9）', incomplete: true };
  }
  if (e) {
    if (y < 1) return { error: `${e.name}は 1年（元年）からです` };
    y += e.offset;
  }
  if (y < MIN_YEAR || y > MAX_YEAR) return { error: `年は ${MIN_YEAR}〜${MAX_YEAR} 年です` };
  if (m < 1 || m > 12) return { error: '月は 1〜12 です' };
  if (d < 1 || d > daysInMonth(y, m)) return { error: `${y}年${m}月は ${daysInMonth(y, m)}日までです` };
  const z = daysFromCivil(y, m, d);
  if (e) {
    const last = eraLastDay(e);
    if (z < e.from || (last !== null && z > last)) {
      const from = e.key === 'M' ? '1873/1/1' : dateText(e.from);
      return { error: `${e.name}は ${from}〜${last === null ? '' : dateText(last)} です` };
    }
  }
  return { z };
}

// 日付を、その元号の形の文字に（打つ欄に入れる用）。元号の外なら null
export function textInEra(z, era) {
  if (era === 'AD') return dateText(z);
  const e = eraByKey(era);
  if (!e || eraOf(z) !== e) return null;
  const { y, m, d } = civilFromDays(z);
  return `${y - e.offset}/${m}/${d}`;
}

// 日付の欄の打ち方。打てないときは null
//   年は4桁（和暦なら2桁）、月・日は2桁まで、「/」は2つまで。「/」なしは8桁まで
export function typeDate(text, key, { fresh = false, era = 'AD' } = {}) {
  if (key === 'back') return text ? text.slice(0, -1) : null;
  if (key === 'clear') return text ? '' : null;
  if (fresh) text = '';
  const parts = text.split('/');
  if (key === '/') {
    if (!text || text.endsWith('/') || parts.length >= 3) return null;
    if (parts.length === 1 && text.length > 4) return null;
    return `${text}/`;
  }
  if (!/^[0-9]$/.test(key)) return null;
  const last = parts[parts.length - 1] + key;
  if (parts.length === 1) return last.length > (era === 'AD' ? 8 : 2) ? null : last;
  // 「/」が1つで年が3桁以上なら年/月、そうでなければ 月/日 か 年/月
  return last.length > 2 ? null : [...parts.slice(0, -1), last].join('/');
}

// ---------------------------------------------------------
// 足す・ひく
// ---------------------------------------------------------
// 〇か月後（月末をこえたら、その月の最後の日に合わせる）
export function addMonths(z, n) {
  const { y, m, d } = civilFromDays(z);
  const total = y * 12 + (m - 1) + n;
  const y2 = Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  const last = daysInMonth(y2, m2);
  return { z: daysFromCivil(y2, m2, Math.min(d, last)), clamped: d > last, wanted: { y: y2, m: m2, d } };
}

// 〇年〇か月〇日（a から b まで。b が前なら neg）
export function ymdBetween(a, b) {
  const neg = b < a;
  const [p, q] = neg ? [b, a] : [a, b];
  const s = civilFromDays(p);
  const e = civilFromDays(q);
  let months = (e.y - s.y) * 12 + (e.m - s.m);
  if (addMonths(p, months).z > q) months--;
  const days = q - addMonths(p, months).z;
  return { neg, y: Math.floor(months / 12), m: months % 12, d: days, months };
}

export function ymdText({ y, m, d }) {
  const parts = [];
  if (y) parts.push(`${y}年`);
  if (m) parts.push(`${m}か月`);
  if (d || !parts.length) parts.push(`${d}日`);
  return parts.join('と');
}

// ---------------------------------------------------------
// 祝日（2000〜2099年）
// ---------------------------------------------------------
function nthMonday(y, m, n) {
  const first = daysFromCivil(y, m, 1);
  return first + ((8 - weekday(first)) % 7) + 7 * (n - 1);
}
const shunbun = (y) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const shubun = (y) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

const holidayCache = new Map();
// その年の祝日 Map（何日目 → 名前）。2000〜2099年でなければ null
export function holidaysOfYear(y) {
  if (y < HOLIDAY_FROM || y > HOLIDAY_TO) return null;
  if (holidayCache.has(y)) return holidayCache.get(y);
  const list = new Map();
  const add = (m, d, name) => list.set(daysFromCivil(y, m, d), name);
  add(1, 1, '元日');
  list.set(nthMonday(y, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  if (y >= 2020) add(2, 23, '天皇誕生日');
  add(3, shunbun(y), '春分の日');
  add(4, 29, y >= 2007 ? '昭和の日' : 'みどりの日');
  add(5, 3, '憲法記念日');
  if (y >= 2007) add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  // 2020・2021年は東京オリンピックで、海の日・スポーツの日・山の日が動いた
  if (y === 2020) add(7, 23, '海の日');
  else if (y === 2021) add(7, 22, '海の日');
  else if (y >= 2003) list.set(nthMonday(y, 7, 3), '海の日');
  else add(7, 20, '海の日');
  if (y === 2020) add(8, 10, '山の日');
  else if (y === 2021) add(8, 8, '山の日');
  else if (y >= 2016) add(8, 11, '山の日');
  if (y >= 2003) list.set(nthMonday(y, 9, 3), '敬老の日');
  else add(9, 15, '敬老の日');
  add(9, shubun(y), '秋分の日');
  if (y === 2020) add(7, 24, 'スポーツの日');
  else if (y === 2021) add(7, 23, 'スポーツの日');
  else list.set(nthMonday(y, 10, 2), y >= 2020 ? 'スポーツの日' : '体育の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');
  if (y <= 2018) add(12, 23, '天皇誕生日');
  if (y === 2019) {
    add(5, 1, '天皇の即位の日');
    add(10, 22, '即位礼正殿の儀の日');
  }
  const base = [...list.keys()].sort((a, b) => a - b);
  const isBase = new Set(base);
  // 振替休日：祝日が日曜なら、そのあとの「祝日でない日」が休み
  for (const z of base) {
    if (weekday(z) !== 0) continue;
    let n = z + 1;
    while (list.has(n)) n++;
    list.set(n, '振替休日');
  }
  // 国民の休日：前の日と次の日が祝日の日（祝日・日曜でなければ）
  for (const z of base) {
    if (isBase.has(z + 2) && !list.has(z + 1) && weekday(z + 1) !== 0) list.set(z + 1, '国民の休日');
  }
  holidayCache.set(y, list);
  return list;
}

export function holidayName(z) {
  return holidaysOfYear(civilFromDays(z).y)?.get(z) ?? null;
}

// a 〜 b（両方の日をふくむ）の中の、平日・土日・祝日の数
//   祝日は平日にある祝日だけ数える（土日にある祝日は「土日」に入る）
//   返す値：{ total, weekday, weekend, holiday, holidays: [{ z, name }], partial: 祝日を見ていない年があるか }
export function countKinds(a, b) {
  const total = b - a + 1;
  // 土日：まず7日ずつ、残りは1日ずつ
  const weeks = Math.floor(total / 7);
  let weekend = weeks * 2;
  for (let z = a + weeks * 7; z <= b; z++) if (isWeekend(z)) weekend++;
  const holidays = [];
  let partial = false;
  const ya = civilFromDays(a).y;
  const yb = civilFromDays(b).y;
  if (ya < HOLIDAY_FROM || yb > HOLIDAY_TO) partial = true;
  for (let y = Math.max(ya, HOLIDAY_FROM); y <= Math.min(yb, HOLIDAY_TO); y++) {
    for (const [z, name] of holidaysOfYear(y)) {
      if (z >= a && z <= b && !isWeekend(z)) holidays.push({ z, name });
    }
  }
  holidays.sort((p, q) => p.z - q.z);
  return { total, weekend, holiday: holidays.length, weekday: total - weekend - holidays.length, holidays, partial };
}

const isOff = (z) => isWeekend(z) || holidayName(z) !== null;

// 土日・祝日をとばして n 日（営業日）すすむ（dir は 1 か −1）
export function addBusinessDays(z, n, dir = 1) {
  let skipped = 0;
  let cur = z;
  for (let k = 0; k < n;) {
    cur += dir;
    if (isOff(cur)) skipped++;
    else k++;
  }
  return { z: cur, skipped };
}

// ---------------------------------------------------------
// 〇日後・〇日前
//   unit 'd' 日・'w' 週・'m' か月・'y' 年。biz なら土日祝をとばす（日のときだけ）
//   返す値：{ ok, z, error, clamped, wanted, skipped }
// ---------------------------------------------------------
export const UNITS = { d: '日', w: '週', m: 'か月', y: '年' };
export function shiftDate(z, n, unit, dir = 1, { biz = false } = {}) {
  let out;
  if (unit === 'd' && biz) out = addBusinessDays(z, n, dir);
  else if (unit === 'd') out = { z: z + dir * n };
  else if (unit === 'w') out = { z: z + dir * 7 * n };
  else out = addMonths(z, dir * n * (unit === 'y' ? 12 : 1));
  if (!inRange(out.z)) return { ok: false, error: `${MIN_YEAR}〜${MAX_YEAR}年の中で計算できます` };
  return { ok: true, ...out };
}

// ---------------------------------------------------------
// 年齢
// ---------------------------------------------------------
// その年の誕生日（2/29 生まれは、うるう年でない年は 3/1）
export function birthdayIn(birth, year) {
  const { m, d } = civilFromDays(birth);
  if (m === 2 && d === 29 && !isLeap(year)) return daysFromCivil(year, 3, 1);
  return daysFromCivil(year, m, d);
}

const ETO = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ETO_READ = ['ね', 'うし', 'とら', 'う', 'たつ', 'み', 'うま', 'ひつじ', 'さる', 'とり', 'いぬ', 'い'];
export function etoText(y) {
  const i = (((y - 4) % 12) + 12) % 12;
  return `${ETO[i]}（${ETO_READ[i]}）年`;
}

// ---------------------------------------------------------
// 和暦の年（年だけで 西暦 ⇔ 令和・平成・昭和・大正・明治）
//   終わった元号も「続いていたら」の年を出す（2025年 ＝ 令和7年 ＝ 平成37年）
// ---------------------------------------------------------
export const YEAR_ERAS = ['AD', 'R', 'H', 'S', 'T', 'M'];
export const eraYearText = (name, n) => `${name}${n === 1 ? '元' : n}年`;

// 元号の始まりの年・終わりの年
//   明治は 1868年 ＝ 明治元年（改元の日は旧暦なので、始まりの日は出さない）
function eraSpan(e) {
  const i = ERAS.indexOf(e);
  const to = i === 0 ? null : ERAS[i - 1].from - 1; // 終わりの日（いまの元号は null）
  const last = to === null ? null : civilFromDays(to).y;
  return {
    first: e.offset + 1,
    from: e.key === 'M' ? null : e.from,
    last,
    lastN: last === null ? null : last - e.offset,
    to,
  };
}

// y 年は、それぞれの元号の何年か（新しい元号から順に）
//   state：'in'（その元号の年）・'after'（終わったあと＝続いていたら）・'before'（まだ始まっていない）
//   startsHere・endsHere：その年の途中から・途中まで（2019年は 平成31年は 4/30 まで、令和元年は 5/1 から）
export function eraYears(y) {
  return ERAS.map((e) => {
    const s = eraSpan(e);
    const n = y - e.offset;
    const state = n < 1 ? 'before' : s.last !== null && y > s.last ? 'after' : 'in';
    return {
      e, n, state, ...s,
      startsHere: state === 'in' && s.from !== null && y === s.first,
      endsHere: state === 'in' && s.to !== null && y === s.last,
    };
  });
}

// y 年を、その元号の年の数に（元年より前なら null）。'AD' はそのまま
export function yearInEra(y, era) {
  if (era === 'AD') return y;
  const e = eraByKey(era);
  const n = y - e.offset;
  return n >= 1 ? n : null;
}

// 年の欄 → 西暦の年。{ y } / { y: null }（空）/ { error }
//   和暦の年は、元号が終わったあとの年もよい（平成37 → 2025）
export function parseYear(text, era = 'AD') {
  if (!text) return { y: null };
  const n = Number(text);
  if (era === 'AD') {
    if (n < MIN_YEAR || n > MAX_YEAR) return { error: `年は ${MIN_YEAR}〜${MAX_YEAR} 年です` };
    return { y: n };
  }
  const e = eraByKey(era);
  if (!e) return { error: '元号がわかりません' };
  if (n < 1) return { error: `${e.name}は 1年（元年）からです` };
  return { y: n + e.offset };
}

// 年の欄の打ち方（西暦は4桁、和暦は3桁まで。先頭の 0 は打てない）。打てないときは null
export function typeYear(text, key, { fresh = false, era = 'AD' } = {}) {
  if (key === 'back') return text ? text.slice(0, -1) : null;
  if (key === 'clear') return text ? '' : null;
  if (!/^[0-9]$/.test(key)) return null;
  if (fresh) text = '';
  if (!text && key === '0') return null;
  const next = text + key;
  return next.length > (era === 'AD' ? 4 : 3) ? null : next;
}

// 十干十二支（西暦4年が 甲子）。2025年 → 乙巳（きのと・み）
const KAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const KAN_READ = ['きのえ', 'きのと', 'ひのえ', 'ひのと', 'つちのえ', 'つちのと', 'かのえ', 'かのと', 'みずのえ', 'みずのと'];
export function kanshiParts(y) {
  const k = (((y - 4) % 10) + 10) % 10;
  const s = (((y - 4) % 12) + 12) % 12;
  return { k, s, kan: KAN[k], kanRead: KAN_READ[k], eto: ETO[s], etoRead: ETO_READ[s] };
}
export function kanshiText(y) {
  const p = kanshiParts(y);
  return `${p.kan}${p.eto}（${p.kanRead}・${p.etoRead}）`;
}

// 満年齢など。at は「いつの時点で」
export function ageOf(birth, at) {
  if (at < birth) return { ok: false, error: '基準日が、生まれた日より前です' };
  const b = civilFromDays(birth);
  const t = civilFromDays(at);
  const thisYear = birthdayIn(birth, t.y);
  const age = t.y - b.y - (at < thisYear ? 1 : 0);
  const nextYear = at < thisYear ? t.y : t.y + 1;
  const next = nextYear <= MAX_YEAR ? birthdayIn(birth, nextYear) : null;
  return {
    ok: true,
    age,
    kazoe: t.y - b.y + 1,
    thisYear,
    passed: at >= thisYear,
    next,
    toNext: next === null ? null : next - at,
    days: at - birth,
    leapBaby: b.m === 2 && b.d === 29,
  };
}

// ---------------------------------------------------------
// 検算：月ごと（長いときは年ごと）に日数を分けて、足すと全部の日数になるように
//   a の次の日 〜 b（a < b）。返す値：[{ label, days }]
// ---------------------------------------------------------
export function breakdown(a, b) {
  const s = civilFromDays(a + 1);
  const e = civilFromDays(b);
  const crossYear = s.y !== e.y;
  const md = (z, withYear) => {
    const c = civilFromDays(z);
    return withYear ? `${c.y}/${c.m}/${c.d}` : `${c.m}/${c.d}`;
  };
  const byMonth = (e.y - s.y) * 12 + (e.m - s.m) <= 14;
  // 区切り：月ごとか年ごとに、a の次の日から b まで
  const segs = [];
  for (let cur = a + 1; cur <= b;) {
    const c = civilFromDays(cur);
    const last = byMonth ? daysFromCivil(c.y, c.m, daysInMonth(c.y, c.m)) : daysFromCivil(c.y, 12, 31);
    const end = Math.min(b, last);
    const full = c.d === 1 && (byMonth || c.m === 1) && end === last;
    segs.push({ cur, end, full, y: c.y, m: c.m, days: end - cur + 1 });
    cur = end + 1;
  }
  const rows = [];
  if (byMonth) {
    for (const g of segs) {
      rows.push({
        label: g.full ? `${crossYear ? `${g.y}年` : ''}${g.m}月（${daysInMonth(g.y, g.m)}日まで）` : `${md(g.cur, crossYear)}〜${md(g.end, false)}`,
        days: g.days,
      });
    }
    return rows;
  }
  // 年ごと：まるまるの年が7年以上続けば、1行にまとめる
  const fulls = segs.filter((g) => g.full);
  for (const g of segs) {
    if (!g.full) rows.push({ label: `${md(g.cur, true)}〜${md(g.end, false)}`, days: g.days });
    else if (fulls.length <= 6) rows.push({ label: `${g.y}年${isLeap(g.y) ? '（うるう年）' : ''}`, days: g.days });
    else if (g === fulls[0]) {
      const y1 = fulls[0].y;
      const y2 = fulls[fulls.length - 1].y;
      const leaps = fulls.filter((x) => isLeap(x.y)).length;
      rows.push({ label: `${y1}〜${y2}年（${fulls.length}年・うるう年 ${leaps}回）`, days: fulls.reduce((t, x) => t + x.days, 0) });
    }
  }
  return rows;
}
