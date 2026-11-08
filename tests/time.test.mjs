// 時間の計算と時給（js/time.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import { evaluate } from '../js/calc.js';
import {
  readLiteral, evaluateTime, previewTime, pressTime, implicitUnits, combine,
  durText, clockText, hoursText, minutesText, decimalText,
  toCalcItems, toHours, clockMinutes, clockLabel, hoursMinutes, nightMinutes, wageOf, wageCalcItems,
} from '../js/time.js';

// 「1h30m+45m」のような文字 → 部品の並び（+ - * / は + − × ÷ に）
const items = (text) => [...text].map((c) => ({ '-': '−', '*': '×', '/': '÷' }[c] ?? c));
const sec = (x) => {
  assert.equal(x.q, true);
  return Number(x.n) / Number(x.d);
};
const run = (text) => evaluateTime(items(text));
// キーを順に押す（押せなかったキーは null を返す → 配列の文字で確かめる）
function typeAll(keys) {
  let st = { items: [], caret: 0 };
  const refused = [];
  for (const k of keys) {
    const next = pressTime(st, k);
    if (next) st = next;
    else refused.push(k);
  }
  return { text: st.items.join(''), refused };
}

test('時間の書き方を読む', () => {
  assert.equal(sec(readLiteral(items('1h30m')).value), 5400);
  assert.equal(sec(readLiteral(items('9:30')).value), 34200);
  assert.equal(sec(readLiteral(items('1:02:03')).value), 3723);
  assert.equal(sec(readLiteral(items('1.5h')).value), 5400);
  assert.equal(sec(readLiteral(items('1d2h')).value), 93600);
  // 単位のあとの数は1つ下の単位
  const r = readLiteral(items('1h30'));
  assert.equal(sec(r.value), 5400);
  assert.equal(r.pieces[1].implicit, true);
  assert.equal(readLiteral(items('25')).dur, false);
  assert.throws(() => readLiteral(items('30m1h')), /順に/);
  assert.throws(() => readLiteral(items('9:75')), /59/);
  assert.throws(() => readLiteral(items('5s3')), /単位がありません/);
});

test('60進法のまま計算する', () => {
  assert.equal(durText(run('1h30m+45m').value), '2時間15分');
  assert.equal(durText(run('17:15-9:30').value), '7時間45分');
  assert.equal(durText(run('1h30m*5').value), '7時間30分');
  assert.equal(durText(run('7h30m/3').value), '2時間30分');
  assert.equal(durText(run('(1h+30m)*2').value), '3時間');
  // 時間 ÷ 時間 → ただの数（何回分）
  const r = run('7h30m/1h30m');
  assert.equal(r.dur, false);
  assert.equal(sec(r.value), 5);
  // − の答え・秒・日
  assert.equal(durText(run('30m-1h').value), '−30分');
  assert.equal(durText(run('1h+30s').value), '1時間0分30秒');
  assert.equal(durText(run('20h+10h').value, { days: true }), '1日6時間');
  assert.equal(durText(run('20h+10h').value), '30時間');
  assert.equal(durText(run('10s/4').value), '2.5秒');
  // 1÷3 のような割り切れない数も誤差なし（3倍すると元にもどる）
  assert.equal(durText(run('1h/3*3').value), '1時間');
});

test('計算できない組み合わせ', () => {
  assert.throws(() => run('1h+5'), /時間どうし/);
  assert.throws(() => run('1h*2h'), /時間 × 時間/);
  assert.throws(() => run('5/1h'), /数 ÷ 時間/);
  assert.throws(() => run('1h/0'), /0 で割る/);
  assert.throws(() => combine('+', { dur: true, v: N.ONE }, { dur: false, v: N.ONE }));
});

test('打っている途中の答え', () => {
  assert.equal(durText(previewTime(items('1h30m+')).value), '1時間30分');
  assert.equal(previewTime(items('1h30')).single, true);
  assert.match(previewTime(items('1h+5')).error, /時間どうし/);
  assert.equal(previewTime(items('(')), null);
  assert.equal(previewTime([]), null);
});

test('時間の形の表示', () => {
  const x = run('2h15m').value;
  assert.equal(clockText(x), '2:15');
  assert.equal(hoursText(x), '2.25時間');
  assert.equal(minutesText(x), '135分');
  assert.equal(clockText(run('1h2m3s').value), '1:02:03');
  assert.equal(hoursText(run('1h20m').value), '1.3333…時間');
  assert.equal(clockText(run('-30m').value), '−0:30');
  assert.deepEqual(decimalText(N.frac(1n, 8n), 4), { text: '0.125', rounded: false });
  assert.deepEqual(decimalText(N.frac(2n, 3n), 2), { text: '0.67', rounded: true });
  assert.equal(durText(N.ZERO), '0分');
});

test('キーの押し方', () => {
  assert.deepEqual(typeAll(['1', 'h', '3', '0', 'm', '+', '4', '5', 'm']), { text: '1h30m+45m', refused: [] });
  // 単位を押し直すと置きかわる・順番がちがう単位は押せない
  assert.equal(typeAll(['5', 'h', 'm']).text, '5m');
  assert.deepEqual(typeAll(['5', 'm', '3', 'h']).refused, ['h']);
  // 「:」は2つまで、後ろは2桁まで、単位といっしょには使えない
  assert.deepEqual(typeAll(['9', ':', '3', '0', '5']), { text: '9:30', refused: ['5'] });
  assert.deepEqual(typeAll(['1', ':', '2', ':', '3', ':']).refused, [':']);
  assert.deepEqual(typeAll(['9', ':', '3', 'h']).refused, ['h']);
  assert.deepEqual(typeAll(['9', ':', '3', '.']).refused, ['.']);
  // 演算子の置きかえ・先頭には × ÷ ＋ を置けない
  assert.equal(typeAll(['5', 'm', '+', '×', '2']).text, '5m×2');
  assert.deepEqual(typeAll(['×']).refused, ['×']);
  assert.equal(typeAll(['−', '5', 'm']).text, '−5m');
  // ( の前に数は置けない（× の省略はしない）、) は ( があるときだけ
  assert.deepEqual(typeAll(['2', '(']).refused, ['(']);
  assert.deepEqual(typeAll(['2', ')']).refused, [')']);
  assert.equal(typeAll(['(', '1', 'h', ')', '×', '2']).text, '(1h)×2');
  // 省いた単位の表示
  assert.deepEqual([...implicitUnits(items('1h30+2d5'))], [[3, 'm'], [7, 'h']]);
});

test('電卓の式にすると、時間の数で同じ答え', () => {
  for (const text of ['1h30m+45m', '7h30m/1h30m', '(1h+30m)*2', '17:15-9:30', '-30m+2']) {
    let expected;
    try {
      const r = run(text);
      expected = r.dur ? toHours(r.value) : r.value;
    } catch {
      continue; // 時間の式として計算できないものは、くらべない
    }
    const calcItems = toCalcItems(items(text));
    assert.equal(N.cmp(evaluate(calcItems).value, expected), 0, text);
  }
  const c = toCalcItems(items('1h30m+45m'));
  assert.equal(c[0].label, '1時間30分');
  assert.equal(c[2].label, '45分');
  assert.equal(toCalcItems(items('9:30'))[0].label, '9:30');
});

test('時刻の読み方', () => {
  assert.equal(clockMinutes('9').min, 540);
  assert.equal(clockMinutes('930').min, 570);
  assert.equal(clockMinutes('1730').min, 1050);
  assert.equal(clockMinutes('9:05').min, 545);
  assert.equal(clockMinutes('9:').min, 540);
  assert.equal(clockMinutes('').min, null);
  assert.match(clockMinutes('975').error, /59/);
  assert.match(clockMinutes('48').error, /47/);
  assert.equal(clockLabel(1560), '翌2:00');
  assert.equal(clockLabel(570), '9:30');
  assert.equal(sec(hoursMinutes('7:30').min), 450);
  assert.equal(sec(hoursMinutes('7.5').min), 450);
  assert.equal(sec(hoursMinutes('7').min), 420);
  assert.equal(nightMinutes(20 * 60, 26 * 60), 240);   // 20時〜翌2時 → 22〜26時の4時間
  assert.equal(nightMinutes(3 * 60, 9 * 60), 120);     // 3時〜9時 → 3〜5時の2時間
});

const wage = (input, opts) => wageOf({ how: 'clock', rest: '', days: '', ...input }, opts);
const yen = (x) => {
  assert.equal(x.d, 1n, '円は整数のはず');
  return Number(x.n);
};

test('時給：ふつう', () => {
  const r = wage({ wage: '1200', start: '900', end: '1730', rest: '60' });
  assert.equal(r.ok, true, r.error);
  assert.equal(sec(r.worked), 450);
  assert.equal(yen(r.pay), 9000);
  // 日数
  assert.equal(yen(wage({ wage: '1200', start: '9', end: '1730', rest: '60', days: '20' }).pay), 180000);
  // 時間で
  const h = wageOf({ wage: '1050', how: 'hours', hours: '7:45' });
  assert.equal(sec(h.worked), 465);
  assert.equal(yen(h.pay), 8138); // 8137.5 → 四捨五入
  assert.equal(yen(wageOf({ wage: '1050', how: 'hours', hours: '7.75' }, { mode: 'floor' }).pay), 8137);
});

test('時給：深夜・残業', () => {
  // 18時〜翌3時（休憩60分）：9時間 − 1時間 ＝ 8時間。深夜は 22〜27時の5時間
  const r = wage({ wage: '1000', start: '18', end: '3', rest: '60' }, { night: true });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.overnight, true);
  const mins = Object.fromEntries(r.rows.map((x) => [x.key, sec(x.min)]));
  assert.deepEqual(mins, { day: 180, night: 300 });
  assert.equal(yen(r.pay), 3000 + 6250);
  // 9時〜20時（休憩60分）：10時間。残業は最後の2時間
  const o = wage({ wage: '1000', start: '9', end: '20', rest: '60' }, { over: true });
  assert.deepEqual(Object.fromEntries(o.rows.map((x) => [x.key, sec(x.min)])), { day: 480, over: 120 });
  assert.equal(yen(o.pay), 8000 + 2500);
  // 15時〜翌2時（休憩60分）、両方：10時間。残業は 0〜2時（深夜の残業）、22〜24時は深夜
  const b = wage({ wage: '1000', start: '15', end: '2', rest: '60' }, { night: true, over: true });
  assert.deepEqual(Object.fromEntries(b.rows.map((x) => [x.key, sec(x.min)])), { day: 360, night: 120, both: 120 });
  assert.equal(yen(b.pay), 6000 + 2500 + 3000);
  // 割増を時間に直した合計で割ると、時給にもどる（逆算）
  assert.equal(N.cmp(N.div(b.perDay, b.weighted), N.frac(1000n)), 0);
  // 22時〜翌6時（休憩60分）→ 休憩は 5〜6時の「ふつう」の時間から引く
  const m = wage({ wage: '1000', start: '22', end: '6', rest: '60' }, { night: true });
  assert.equal(m.restFromNight, 0);
  assert.deepEqual(Object.fromEntries(m.rows.map((x) => [x.key, sec(x.min)])), { night: 420 });
  // 全部が深夜のとき（22時〜翌5時、休憩60分）→ 深夜から引く
  const n = wage({ wage: '1000', start: '22', end: '5', rest: '60' }, { night: true });
  assert.equal(n.restFromNight, 60);
  assert.deepEqual(Object.fromEntries(n.rows.map((x) => [x.key, sec(x.min)])), { night: 360 });
});

test('時給：打ちまちがい', () => {
  assert.match(wage({ wage: '', start: '9', end: '17' }).error, /時給/);
  assert.match(wage({ wage: '1000', start: '9', end: '' }).error, /時刻/);
  assert.match(wage({ wage: '1000', start: '9', end: '9' }).error, /同じ/);
  assert.match(wage({ wage: '1000', start: '9', end: '10', rest: '60' }).error, /休憩/);
  assert.match(wage({ wage: '1000', start: '9', end: '10', days: '0' }).error, /日数/);
  assert.match(wageOf({ wage: '1000', how: 'hours', hours: '' }).error, /働いた時間/);
});

test('時給を電卓の式にすると、同じ給料（ちょうど）', () => {
  const cases = [
    wage({ wage: '1200', start: '900', end: '1730', rest: '60', days: '20' }),
    wage({ wage: '1000', start: '15', end: '2', rest: '60' }, { night: true, over: true }),
    wageOf({ wage: '1050', how: 'hours', hours: '7:45' }),
  ];
  for (const r of cases) {
    assert.equal(N.cmp(evaluate(wageCalcItems(r)).value, r.exact), 0);
  }
});

test('時刻・時間の欄の打ち方', async () => {
  const { typeClock } = await import('../js/time.js');
  const typeAllClock = (keys, o) => keys.reduce((t, k) => typeClock(t, k, o) ?? t, '');
  assert.equal(typeAllClock(['1', '7', '3', '0', '5']), '1730');
  assert.equal(typeAllClock(['9', ':', '3', '0', '5']), '9:30');
  assert.equal(typeAllClock(['9', '.']), '9');
  assert.equal(typeClock('123', ':'), null);
  assert.equal(typeAllClock(['7', '.', '5', '5', '5'], { maxHead: 3, decimals: true }), '7.55');
  assert.equal(typeAllClock(['1', '0', '0', '0'], { maxHead: 3, decimals: true }), '100');
  assert.equal(typeClock('9:30', '1', { fresh: true }), '1');
  assert.equal(typeClock('9', '00'), '900');
});
