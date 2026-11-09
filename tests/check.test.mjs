// 検算（js/check.js と、calc.js の計算の順番の記録）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import { evaluate } from '../js/calc.js';
import { reverseStep, liveCompare, fullCompare } from '../js/check.js';
import { compact } from '../js/format.js';

const items = (s) => [...s];
const t = (x) => compact(x, 20).text;

test('計算の順番が記録される（× が先）', () => {
  const { steps } = evaluate(items('1280×3+24000×(1+8%)'));
  assert.deepEqual(steps.map((s) => `${t(s.a)}${s.op}${s.b ? t(s.b) : ''}=${t(s.result)}`), [
    '1,280×3=3,840',
    '1pct+8=1.08', // 1 + 8% は「1 の 8% を足す」
    '24,000×1.08=25,920',
    '3,840+25,920=29,760',
  ]);
  // どのステップの答えを使ったか
  assert.equal(steps[2].bFrom, 1);
  assert.equal(steps[3].aFrom, 0);
  assert.equal(steps[3].bFrom, 2);
});

test('マイナスの数そのものは計算に数えない', () => {
  assert.equal(evaluate(items('−5+3')).steps.length, 1);
  assert.equal(evaluate(items('−(5+3)')).steps.length, 2);
});

test('逆算：どのステップも元の数に戻る', () => {
  for (const expr of ['1280×3+24000×(1+8%)', '1÷3×3', '200+10%', '200−10%', '√2×√2', '(−3)^3', '(−2)^4',
    '10÷4', '7−9', '2^0.5', '50%', '3²', '−(4+1)', '8^(1÷3)']) {
    const { steps } = evaluate(items(expr));
    for (const s of steps) {
      const r = reverseStep(s);
      assert.equal(r.none, undefined, `${expr} の ${s.op} は逆算できるはず`);
      assert.equal(r.ok, true, `${expr} の ${s.op} の逆算が合わない`);
    }
  }
});

test('逆算：0 をかけたもの・0 乗はできないと言う', () => {
  assert.match(reverseStep(evaluate(items('5×0')).steps[0]).none, /0 をかけて/);
  assert.match(reverseStep(evaluate(items('5^0')).steps[0]).none, /0 乗/);
});

test('逆算：√ をふくむ計算は概数の印がつく', () => {
  const r = reverseStep(evaluate(items('√2')).steps[0]);
  assert.equal(r.ok, true);
  assert.equal(r.approx, true);
});

test('照合：打っている途中', () => {
  const orig = items('1280+350×2');
  assert.deepEqual(liveCompare(orig, items('12')), { ok: true, complete: false }); // 1280 の途中
  assert.deepEqual(liveCompare(orig, items('1280+35')), { ok: true, complete: false });
  assert.deepEqual(liveCompare(orig, items('1280+350×2')), { ok: true, complete: true });
  const bad = liveCompare(orig, items('128+'));
  assert.equal(bad.ok, false);
  assert.deepEqual([...bad.marks], [0, 1, 2]); // 「128」が赤
  const bad2 = liveCompare(orig, items('13'));
  assert.equal(bad2.ok, false);
  const bad3 = liveCompare(orig, items('1280−'));
  assert.deepEqual([...bad3.marks], [4]); // 記号がちがう
  const longer = liveCompare(orig, items('1280+350×2+1'));
  assert.equal(longer.ok, false);
});

test('照合：数は数としてくらべる（12.50 と 12.5 は同じ）', () => {
  assert.equal(fullCompare(items('12.5+3'), items('12.50+3')).same, true);
  assert.equal(liveCompare(items('12.5+3'), items('12.50+')).ok, true);
});

test('照合：抜けた数・ちがう数を見つける', () => {
  const missing = fullCompare(items('100+200+300'), items('100+300'));
  assert.equal(missing.same, false);
  assert.equal(missing.marksA.size, 4); // 「+200」（または「200+」）が抜けている
  assert.ok([4, 5, 6].every((i) => missing.marksA.has(i)));
  assert.deepEqual([...missing.marksB], []);
  const changed = fullCompare(items('1280×3'), items('1208×3'));
  assert.deepEqual([...changed.marksA], [0, 1, 2, 3]);
  assert.deepEqual([...changed.marksB], [0, 1, 2, 3]);
});

test('照合：前の答え（部品）は値でくらべる', () => {
  const ref1 = { ref: N.frac(1n, 3n), label: 'a' };
  const ref2 = { ref: N.frac(1n, 3n), label: 'b' };
  assert.equal(fullCompare([ref1, '×', '3'], [ref2, '×', '3']).same, true);
});

// ---- 関数電卓の逆算（ステップ8） ----
const lastRev = (list, angle = 'deg') => {
  const { steps } = evaluate(list, { angle });
  return reverseStep(steps[steps.length - 1]);
};

test('逆算：三角関数（角度がちがっても値が同じなら ✓）', () => {
  const r = lastRev(['sin(', '1', '5', '0']);
  assert.equal(r.op, 'asin');
  assert.equal(t(r.value), '30');
  assert.equal(r.ok, true);
  assert.equal(r.same, false);                       // 150° と 30° は sin が同じ
  assert.equal(lastRev(['sin(', '3', '0']).same, true);
  assert.equal(lastRev(['cos(', '−', '6', '0']).ok, true);
  assert.equal(lastRev(['tan(', '2', '2', '5']).ok, true);
  assert.equal(lastRev(['sin(', '2'], 'rad').ok, true);
  const inv = lastRev(['asin(', '0', '.', '5']);
  assert.equal(inv.op, 'sin');
  assert.equal(inv.ok, true);
  assert.equal(lastRev(['acos(', '0', '.', '3'], 'rad').ok, true);
});

test('逆算：log・ln・!・nCr・nPr・x⁻¹', () => {
  assert.equal(lastRev(['log(', '2']).ok, true);
  assert.equal(lastRev(['ln(', '5']).ok, true);
  const f = lastRev(['5', '!']);
  assert.equal(`${t(f.value)} ${t(f.expect)} ${f.ok}`, '24 24 true'); // 120 ÷ 5 = 24 = 4!
  assert.match(lastRev(['0', '!']).none, /0! は 1/);
  const c = lastRev(['5', 'C', '2']);
  assert.equal(`${c.op} ${t(c.value)} ${c.ok}`, 'C 20 true');          // 10 × 2! = 20 = 5P2
  const p = lastRev(['5', 'P', '2']);
  assert.equal(`${p.op} ${t(p.value)} ${p.ok}`, 'P 120 true');         // 20 × 3! = 120 = 5!
  assert.match(lastRev(['5', 'P', '0']).none, /nP0 は 1/);
  assert.equal(lastRev(['4', '⁻¹']).ok, true);
  // 大きい数も（概数でも）確かめられる
  assert.equal(lastRev(['1', '0', '0', '0', '0', '0', 'C', '5', '0', '0', '0', '0']).ok, true);
  assert.equal(lastRev(['1', '0', '^', '(', '6', '0', ')', 'C', '1', '9', '9', '9']).ok, true);
  assert.equal(lastRev(['1', '0', '^', '(', '6', '0', ')', 'P', '1', '9', '9', '9']).ok, true);
});
