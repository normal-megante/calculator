// 日付の計算（js/date.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysFromCivil, civilFromDays, weekday, dateText, wareki, parseDate, textInEra, typeDate,
  addMonths, ymdBetween, ymdText, holidaysOfYear, holidayName, countKinds, addBusinessDays,
  shiftDate, ageOf, etoText, breakdown, eraYears, parseYear, typeYear, yearInEra, kanshiText,
} from '../js/date.js';

const z = (y, m, d) => daysFromCivil(y, m, d);
const T = z(2026, 11, 9); // テストの「今日」（月曜）

test('日付 ⇔ 何日目・曜日', () => {
  assert.equal(z(1970, 1, 1), 0);
  assert.deepEqual(civilFromDays(z(2026, 11, 9)), { y: 2026, m: 11, d: 9 });
  for (const day of [-800000, -1, 0, 59, 60, 10957, 20401, 2932896]) {
    const c = civilFromDays(day);
    assert.equal(z(c.y, c.m, c.d), day);
  }
  assert.equal(weekday(T), 1);               // 月曜
  assert.equal(weekday(z(2000, 1, 1)), 6);   // 土曜
  assert.equal(z(2026, 12, 25) - T, 46);
  assert.equal(z(2024, 3, 1) - z(2024, 2, 28), 2); // うるう年
  assert.equal(z(2100, 3, 1) - z(2100, 2, 28), 1); // 2100年はうるう年でない
});

test('和暦', () => {
  assert.equal(wareki(z(2019, 4, 30)), '平成31年4月30日');
  assert.equal(wareki(z(2019, 5, 1)), '令和元年5月1日');
  assert.equal(wareki(z(1989, 1, 7)), '昭和64年1月7日');
  assert.equal(wareki(z(1989, 1, 8)), '平成元年1月8日');
  assert.equal(wareki(z(1926, 12, 25)), '昭和元年12月25日');
  assert.equal(wareki(z(1873, 1, 1)), '明治6年1月1日');
  assert.equal(wareki(z(1872, 12, 31)), null);
  assert.equal(wareki(T, { week: true }), '令和8年11月9日（月）');
});

test('打った文字 → 日付', () => {
  assert.equal(parseDate('2026/11/9', 'AD', T).z, T);
  assert.equal(parseDate('11/9', 'AD', T).z, T);
  assert.equal(parseDate('20261109', 'AD', T).z, T);
  assert.equal(parseDate('60/5/3', 'S', T).z, z(1985, 5, 3));
  assert.equal(parseDate('8/11/9', 'R', T).z, T);
  assert.equal(parseDate('', 'AD', T).z, null);
  assert.equal(parseDate('2026/', 'AD', T).incomplete, true);
  assert.match(parseDate('2026/2/30', 'AD', T).error, /28日まで/);
  assert.match(parseDate('2026/13/1', 'AD', T).error, /1〜12/);
  assert.match(parseDate('31/5/1', 'H', T).error, /平成は 1989\/1\/8〜2019\/4\/30/);
  assert.equal(textInEra(z(1985, 5, 3), 'S'), '60/5/3');
  assert.equal(textInEra(z(1985, 5, 3), 'H'), null);
});

test('日付の欄の打ち方', () => {
  const typeAll = (keys, o) => keys.reduce((t, k) => typeDate(t, k, o) ?? t, '');
  assert.equal(typeAll([...'2026/11/9']), '2026/11/9');
  assert.equal(typeAll([...'2026/111/99/']), '2026/11/99');
  assert.equal(typeAll([...'202611095']), '20261109');
  assert.equal(typeAll([...'12345/']), '12345');
  assert.equal(typeAll([...'600/5/3'], { era: 'S' }), '60/5/3');
  assert.equal(typeDate('', '/'), null);
  assert.equal(typeDate('2026/', '/'), null);
});

test('〇か月後と、〇年〇か月〇日', () => {
  const a = addMonths(z(2026, 1, 31), 1);
  assert.equal(a.z, z(2026, 2, 28));
  assert.equal(a.clamped, true);
  assert.equal(addMonths(z(2024, 1, 31), 1).z, z(2024, 2, 29));
  assert.equal(addMonths(z(2026, 11, 9), -12).z, z(2025, 11, 9));
  assert.deepEqual(ymdBetween(z(2026, 1, 31), z(2026, 3, 1)), { neg: false, y: 0, m: 1, d: 1, months: 1 });
  assert.equal(ymdText(ymdBetween(T, z(2026, 12, 25))), '1か月と16日');
  assert.equal(ymdText(ymdBetween(z(1985, 5, 3), T)), '41年と6か月と6日');
  assert.equal(ymdBetween(z(2026, 12, 25), T).neg, true);
});

test('祝日', () => {
  const list = holidaysOfYear(2026);
  assert.equal(list.size, 18);
  assert.equal(holidayName(z(2026, 1, 12)), '成人の日');
  assert.equal(holidayName(z(2026, 3, 20)), '春分の日');
  assert.equal(holidayName(z(2026, 5, 6)), '振替休日');
  assert.equal(holidayName(z(2026, 7, 20)), '海の日');
  assert.equal(holidayName(z(2026, 9, 21)), '敬老の日');
  assert.equal(holidayName(z(2026, 9, 22)), '国民の休日');
  assert.equal(holidayName(z(2026, 9, 23)), '秋分の日');
  assert.equal(holidayName(z(2026, 10, 12)), 'スポーツの日');
  // 2019年（天皇の即位）・2021年（オリンピック）
  assert.equal(holidayName(z(2019, 4, 30)), '国民の休日');
  assert.equal(holidayName(z(2019, 5, 1)), '天皇の即位の日');
  assert.equal(holidayName(z(2019, 5, 2)), '国民の休日');
  assert.equal(holidayName(z(2019, 5, 6)), '振替休日');
  assert.equal(holidayName(z(2019, 12, 23)), null);
  assert.equal(holidayName(z(2021, 7, 23)), 'スポーツの日');
  assert.equal(holidayName(z(2021, 8, 9)), '振替休日');
  assert.equal(holidayName(z(2024, 9, 22)), '秋分の日');
  assert.equal(holidayName(z(2024, 9, 23)), '振替休日');
  assert.equal(holidaysOfYear(1999), null);
});

test('平日・土日・祝日の数と、営業日', () => {
  const k = countKinds(z(2026, 11, 1), z(2026, 11, 30));
  assert.deepEqual([k.total, k.weekend, k.holiday, k.weekday], [30, 9, 2, 19]);
  assert.deepEqual(k.holidays.map((h) => h.name), ['文化の日', '勤労感謝の日']);
  assert.equal(k.partial, false);
  // 1日ずつ数えたのと同じ
  const a = z(2025, 12, 20);
  const b = z(2027, 1, 10);
  let we = 0;
  for (let d = a; d <= b; d++) if (weekday(d) === 0 || weekday(d) === 6) we++;
  assert.equal(countKinds(a, b).weekend, we);
  // 金曜 11/20 の1営業日後 → 土日と 11/23（祝日）をとばして 11/24
  assert.deepEqual(addBusinessDays(z(2026, 11, 20), 1), { z: z(2026, 11, 24), skipped: 3 });
  assert.equal(addBusinessDays(z(2026, 11, 24), 1, -1).z, z(2026, 11, 20));
  assert.equal(countKinds(z(1999, 12, 1), z(2000, 1, 5)).partial, true);
});

test('〇日後・〇日前', () => {
  assert.equal(shiftDate(T, 100, 'd').z, z(2027, 2, 17));
  assert.equal(weekday(shiftDate(T, 100, 'd').z), 3); // 水曜
  assert.equal(shiftDate(T, 2, 'w', -1).z, z(2026, 10, 26));
  assert.equal(shiftDate(z(2026, 1, 31), 1, 'm').z, z(2026, 2, 28));
  assert.equal(shiftDate(z(2024, 2, 29), 1, 'y').z, z(2025, 2, 28));
  assert.equal(shiftDate(T, 5, 'd', 1, { biz: true }).z, z(2026, 11, 16));
  assert.equal(shiftDate(z(9999, 12, 31), 1, 'd').ok, false);
});

test('年齢・干支', () => {
  const a = ageOf(z(1985, 5, 3), T);
  assert.equal(a.age, 41);
  assert.equal(a.kazoe, 42);
  assert.equal(a.next, z(2027, 5, 3));
  assert.equal(a.toNext, 175);
  assert.equal(ageOf(z(1985, 11, 10), T).age, 40);  // 誕生日の前の日
  assert.equal(ageOf(z(1985, 11, 9), T).age, 41);   // 誕生日の当日
  // 2/29 生まれ
  assert.equal(ageOf(z(2004, 2, 29), z(2005, 2, 28)).age, 0);
  assert.equal(ageOf(z(2004, 2, 29), z(2005, 3, 1)).age, 1);
  assert.equal(ageOf(z(2004, 2, 29), z(2008, 2, 29)).age, 4);
  assert.equal(ageOf(T, z(2026, 1, 1)).ok, false);
  assert.equal(etoText(1985), '丑（うし）年');
  assert.equal(etoText(2026), '午（うま）年');
});

test('検算の区切り：足すと全部の日数', () => {
  const rows = breakdown(T, z(2027, 2, 17));
  assert.deepEqual(rows.map((r) => r.days), [21, 31, 31, 17]);
  assert.equal(rows[0].label, '2026/11/10〜11/30');
  assert.equal(rows[1].label, '2026年12月（31日まで）');
  const pairs = [[T, z(2026, 11, 10)], [z(2026, 11, 30), z(2026, 12, 1)], [z(1985, 5, 3), T], [z(2026, 1, 1), z(2027, 12, 31)], [z(1900, 2, 28), z(2100, 3, 1)]];
  for (const [a, b] of pairs) {
    assert.equal(breakdown(a, b).reduce((t, r) => t + r.days, 0), b - a, `${dateText(a)}〜${dateText(b)}`);
  }
});

test('和暦の年（年だけ）', () => {
  const at = (y, key) => eraYears(y).find((r) => r.e.key === key);
  // 2025年 ＝ 令和7年 ＝ 平成37年 ＝ 昭和100年 ＝ 大正114年 ＝ 明治158年（終わった元号は「続いていたら」）
  assert.deepEqual(eraYears(2025).map((r) => [r.e.name, r.n, r.state]), [
    ['令和', 7, 'in'], ['平成', 37, 'after'], ['昭和', 100, 'after'], ['大正', 114, 'after'], ['明治', 158, 'after'],
  ]);
  assert.deepEqual([at(2025, 'H').lastN, at(2025, 'H').last], [31, 2019]);
  // 2019年は 平成31年（4/30 まで）と 令和元年（5/1 から）
  const h = at(2019, 'H');
  const r = at(2019, 'R');
  assert.deepEqual([h.n, h.state, h.endsHere, h.startsHere], [31, 'in', true, false]);
  assert.deepEqual([r.n, r.state, r.endsHere, r.startsHere], [1, 'in', false, true]);
  assert.equal(dateText(h.to), '2019/4/30');
  assert.equal(dateText(r.from), '2019/5/1');
  // 1989年：昭和64年（1/7 まで）・平成元年（1/8 から）。1926年：大正15年・昭和元年
  assert.deepEqual([at(1989, 'S').n, at(1989, 'S').endsHere, at(1989, 'H').n, at(1989, 'H').startsHere], [64, true, 1, true]);
  assert.deepEqual([at(1926, 'T').n, at(1926, 'T').endsHere, at(1926, 'S').n, at(1926, 'S').startsHere], [15, true, 1, true]);
  // 1868年は明治元年（年の途中からとは出さない）
  assert.deepEqual([at(1868, 'M').n, at(1868, 'M').state, at(1868, 'M').startsHere], [1, 'in', false]);
  assert.equal(at(2000, 'R').state, 'before');
  assert.equal(at(1867, 'M').state, 'before');
  // 打った年 → 西暦
  assert.deepEqual(parseYear('37', 'H'), { y: 2025 });
  assert.deepEqual(parseYear('7', 'R'), { y: 2025 });
  assert.deepEqual(parseYear('1', 'M'), { y: 1868 });
  assert.deepEqual(parseYear('2025'), { y: 2025 });
  assert.deepEqual(parseYear(''), { y: null });
  assert.match(parseYear('0', 'R').error, /元年/);
  assert.match(parseYear('0').error, /1〜9999/);
  assert.equal(yearInEra(2025, 'S'), 100);
  assert.equal(yearInEra(2000, 'R'), null);
  assert.equal(yearInEra(2025, 'AD'), 2025);
  // 打ち方：西暦は4桁、和暦は3桁まで。先頭の 0 は打てない
  assert.equal(typeYear('202', '5'), '2025');
  assert.equal(typeYear('2025', '1'), null);
  assert.equal(typeYear('15', '8', { era: 'M' }), '158');
  assert.equal(typeYear('158', '1', { era: 'M' }), null);
  assert.equal(typeYear('', '0'), null);
  assert.equal(typeYear('37', '5', { fresh: true }), '5');
  assert.equal(typeYear('37', '/'), null);
  assert.equal(typeYear('37', 'back'), '3');
  // 十干十二支（西暦4年が 甲子）
  assert.equal(kanshiText(2025), '乙巳（きのと・み）');
  assert.equal(kanshiText(1984), '甲子（きのえ・ね）');
  assert.equal(kanshiText(2026), '丙午（ひのえ・うま）');
});
