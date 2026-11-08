// 式の読み取り・計算（js/calc.js）、キーのきまり（js/keys.js）、表示（js/format.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import { evaluate, preview } from '../js/calc.js';
import { pressKey, insertRef } from '../js/keys.js';
import * as F from '../js/format.js';

// '2+3×4' のような文字 → 部品の並び
const items = (s) => [...s];
// 計算して、四捨五入した 20 桁の文字にする
function calc(s) {
  const { value } = evaluate(items(s));
  return F.compact(value, 20).text;
}

test('四則演算の順番（× ÷ が先）', () => {
  assert.equal(calc('2+3×4'), '14');
  assert.equal(calc('(2+3)×4'), '20');
  assert.equal(calc('10−4−3'), '3');
  assert.equal(calc('100÷10÷5'), '2');
  assert.equal(calc('6÷2(1+2)'), '9'); // 記号を省いたかけ算も × と同じ順番
});

test('マイナスの数・累乗', () => {
  assert.equal(calc('−2²'), '−4');
  assert.equal(calc('(−2)²'), '4');
  assert.equal(calc('2^3^2'), '512');
  assert.equal(calc('2^−2'), '0.25');
  assert.equal(calc('5×−3'), '−15');
  assert.equal(calc('3−−2'), '5');
});

test('√ と 記号を省いたかけ算', () => {
  assert.equal(calc('√16'), '4');
  assert.equal(calc('2√9'), '6');
  assert.equal(calc('√(9+16)'), '5');
  assert.equal(calc('√2^2'), '2');
  assert.equal(calc('2(3+4)'), '14');
  assert.equal(calc('(1+2)(3+4)'), '21');
});

test('% のきまり', () => {
  assert.equal(calc('50%'), '0.5');
  assert.equal(calc('200+10%'), '220');
  assert.equal(calc('200−10%'), '180');
  assert.equal(calc('200×10%'), '20');
  assert.equal(calc('200÷10%'), '2,000');
  assert.equal(calc('100+50+10%'), '165');
  const { notes } = evaluate(items('200+10%'));
  assert.equal(notes[0].kind, 'percent');
  assert.equal(F.compact(notes[0].part).text, '20');
});

test('閉じていない ( は最後に閉じる', () => {
  assert.equal(calc('2×(3+4'), '14');
  assert.equal(calc('((1+2'), '3');
});

test('誤差が出ない', () => {
  assert.equal(calc('0.1+0.2'), '0.3');
  assert.equal(calc('1÷3×3'), '1');
  assert.equal(calc('1.1×1.1'), '1.21');
  assert.equal(calc('0.3−0.1'), '0.2');
});

test('式がおかしいときのエラー', () => {
  assert.throws(() => evaluate(items('2+')), (e) => e.kind === 'incomplete');
  assert.throws(() => evaluate(items('×2')), (e) => e.kind === 'syntax');
  assert.throws(() => evaluate(items('2)')), (e) => e.kind === 'syntax');
  assert.throws(() => evaluate(items('1.2.3')), (e) => e.kind === 'syntax');
  assert.throws(() => evaluate(items('5÷0')), (e) => e.kind === 'math');
  assert.throws(() => evaluate([]), (e) => e.kind === 'incomplete');
});

test('＝を押さなくても出る答え（途中の式）', () => {
  assert.equal(preview(items('12')), null); // 数1つだけなら出さない
  assert.equal(F.compact(preview(items('12+3')).value).text, '15');
  assert.equal(F.compact(preview(items('12+3×')).value).text, '15'); // 最後の × は無視
  assert.equal(F.compact(preview(items('2×(3+4')).value).text, '14');
  assert.equal(F.compact(preview(items('2×(3+')).value).text, '6');
  assert.deepEqual(preview(items('5÷0')), { error: '0 で割ることはできません' });
  assert.equal(preview(items('×')), null);
});

test('前の答え（部品）を式に使う', () => {
  const third = N.div(N.frac(1n), N.frac(3n));
  const ref = { ref: third, label: '0.33333333…' };
  const { value } = evaluate([ref, '×', '3']);
  assert.equal(N.isInteger(value) && value.n, 1n); // 全部の桁を持っているので ぴったり 1
  assert.ok(preview([ref])); // 部品1つでも答えを出す
});

// ---- キーのきまり ----
function type(keys, start = { items: [], caret: 0 }) {
  let s = start;
  for (const k of keys) s = pressKey(s, k) ?? s;
  return s;
}
const text = (s) => s.items.join('');

test('キー：数字と小数点', () => {
  assert.equal(text(type(['0', '7'])), '7'); // 先頭の 0 は置きかえ
  assert.equal(text(type(['.', '5'])), '0.5');
  assert.equal(text(type(['1', '.', '2', '.', '3'])), '1.23'); // 小数点は1つだけ
  assert.equal(text(type(['1', '00'])), '100');
  assert.equal(text(type(['00'])), '0');
  assert.equal(pressKey({ items: ['0'], caret: 1 }, '0'), null);
});

test('キー：演算子の置きかえ', () => {
  assert.equal(text(type(['5', '+', '×'])), '5×');
  assert.equal(text(type(['5', '×', '−'])), '5×−');
  assert.equal(text(type(['5', '×', '−', '+'])), '5+');
  assert.equal(text(type(['5', '+', '−'])), '5−');
  assert.equal(pressKey({ items: [], caret: 0 }, '×'), null);
  assert.equal(text(type(['−', '5'])), '−5');
});

test('キー：かっこと % ²', () => {
  assert.equal(pressKey({ items: ['2'], caret: 1 }, ')'), null); // ( がないのに ) は入らない
  assert.equal(text(type(['(', '2', '+', '3', ')', '²'])), '(2+3)²');
  assert.equal(pressKey({ items: ['2', '+'], caret: 2 }, '%'), null);
});

test('キー：途中の数字を直す（カーソルを動かす）', () => {
  // 「123+456」の 2 のうしろ（カーソル2）で ⌫ → 「13+456」、そこへ 9 → 「193+456」
  let s = { items: items('123+456'), caret: 2 };
  s = pressKey(s, 'back');
  assert.deepEqual(s, { items: items('13+456'), caret: 1 });
  s = pressKey(s, '9');
  assert.equal(text(s), '193+456');
  s = pressKey(pressKey(s, 'left'), 'left');
  assert.equal(s.caret, 0);
  assert.equal(pressKey(s, 'left'), null);
  assert.equal(pressKey(s, 'back'), null);
});

test('キー：部品を入れる', () => {
  const ref = { ref: N.frac(5n), label: '5' };
  const s = insertRef({ items: ['2', '×'], caret: 2 }, ref);
  assert.equal(s.caret, 3);
  assert.equal(s.items[2], ref);
});

// ---- 表示 ----
test('表示：ふだんの形', () => {
  const first = (x) => F.mainForms(x)[0];
  assert.equal(first(N.frac(1234567n)).text, '1,234,567');
  assert.equal(first(N.frac(1n, 3n)).text, '0.3333333333333333');
  assert.equal(first(N.frac(1n, 3n)).rounded, true);
  assert.equal(first(N.frac(2n, 3n)).text, '0.6666666666666667'); // 四捨五入
  assert.equal(first(N.pow(N.frac(10n), N.frac(40n))).text, '10,000,000,000,000,000,000,000,000,000,000,000,000,000');
  assert.equal(first(N.neg(N.parseDecimal('0.5'))).text, '−0.5');
  const big = N.pow(N.frac(2n), N.frac(200n));
  assert.equal(F.mainForms(big)[0].text, '1.60693804426×10^60');
});

test('表示：全部の桁・くり返し・分数', () => {
  const third = F.fullDigits(N.frac(1n, 3n));
  assert.equal(third.kind, 'repeating');
  assert.deepEqual(third.repeat, { start: 1, digits: '3' });
  const sixth = F.fullDigits(N.frac(1n, 6n));
  assert.deepEqual(sixth.repeat, { start: 2, digits: '6' });
  const r7 = F.fullDigits(N.frac(1n, 7n));
  assert.deepEqual(r7.repeat, { start: 1, digits: '142857' });
  const eighth = F.fullDigits(N.frac(1n, 8n));
  assert.equal(eighth.kind, 'finite');
  assert.equal(eighth.text, '0.125');
  assert.equal(F.fullDigits(N.frac(-1234n)).text, '−1,234');
  assert.deepEqual(F.fractionForm(N.frac(5n, 3n)), { text: '5/3', mixed: '1と2/3' });
  assert.equal(F.fractionForm(N.frac(5n)), null);
});

test('表示：万・億・兆の読み方', () => {
  assert.equal(F.japaneseReading(N.frac(1234n)), null);
  assert.equal(F.japaneseReading(N.frac(100000005n)).text, '1億5');
  assert.equal(F.japaneseReading(N.frac(123456789012n)).text, '1234億5678万9012');
  assert.equal(F.japaneseReading(N.frac(10n ** 68n)).text, '1無量大数');
  assert.equal(F.japaneseReading(N.frac(10n ** 72n)).over, true);
  assert.equal(F.japaneseReading(N.frac(-50000n)).text, 'マイナス 5万');
});
