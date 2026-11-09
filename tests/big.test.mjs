// 巨大数（js/big.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import * as S from '../js/sci.js';
import * as B from '../js/big.js';

const q = (s) => {
  const [n, d = '1'] = String(s).split('/');
  const neg = n.startsWith('-');
  const x = N.div(N.parseDecimal(neg ? n.slice(1) : n), N.parseDecimal(d));
  return neg ? N.neg(x) : x;
};
const n = (s) => B.num(q(s));
const I = (k) => N.frac(BigInt(k));
// ふつうの数で、上から digits 桁が同じ
const near = (x, s, digits = 40) => assert.ok(B.sameDigits(x, q(s), digits), `${N.toNumber(x)} ≠ ${s}`);
const exact = (b, s) => {
  assert.equal(b.t, 'num');
  assert.ok(b.v.q, '正確な数のはず');
  assert.equal(N.cmp(b.v, q(s)), 0, `${b.v.n} ≠ ${s}`);
};

test('テトレーション：小さい数は正確に', () => {
  exact(B.tetrate(I(2), n('0')), '1');
  exact(B.tetrate(I(2), n('1')), '2');
  exact(B.tetrate(I(2), n('3')), '16');
  exact(B.tetrate(I(2), n('4')), '65536');
  exact(B.tetrate(I(3), n('3')), '7625597484987');
  exact(B.tetrate(I(2), n('-1')), '0');
  const t5 = B.tetrate(I(2), n('5'));
  assert.ok(t5.v.q);
  assert.equal(t5.v.n.toString().length, 19729); // 2^65536 は 19729 桁
  assert.equal(t5.v.n, 2n ** 65536n);
  exact(B.tetrate(I(1), n('1000000')), '1');
});

test('テトレーション：大きい数は塔の形で', () => {
  // 2↑↑6 ＝ 2^(2^65536) ＝ 10^(2^65536 × log₁₀2)
  const t6 = B.tetrate(I(2), n('6'));
  assert.equal(t6.t, 'tower');
  assert.equal(t6.h, 1);
  assert.ok(B.sameDigits(t6.x, N.mul(N.frac(2n ** 65536n), S.log10(I(2))), 40));
  // 2↑↑7 は 10^ が2段
  const t7 = B.tetrate(I(2), n('7'));
  assert.equal(t7.t, 'tower');
  assert.equal(t7.h, 2);
  assert.ok(B.sameDigits(t7.x, t6.x, 40)); // 上の数は同じ（a をかけても上の桁は変わらない）
  // 10↑↑100 ＝ 10^10^…^10（10^ が 99 段 → 上の 10^10 ＝ 1e10 を x に）
  const t100 = B.tetrate(I(10), n('100'));
  assert.equal(t100.t, 'tower');
  const p100 = B.towerParts(t100);
  assert.equal(p100.tens, 99); // 10^10^…^10^10（10^ が 99 回、いちばん上が 10）
  assert.ok(B.sameDigits(p100.top, I(10), 40));
  // 高さがとても大きいと nest
  const big = B.tetrate(I(10), n('100000000000000000000'));
  assert.equal(big.t, 'nest');
  assert.equal(big.k, 1);
  near(big.s, '100000000000000000000', 15);
  // 3↑↑4 ＝ 3^7625597484987（3兆6千億桁くらい）
  const t34 = B.tetrate(I(3), n('4'));
  assert.equal(t34.t, 'num');
  assert.ok(Math.abs(N.approxLog10(t34.v) / (7625597484987 * Math.log10(3)) - 1) < 1e-12);
});

test('テトレーション：整数でない高さ（線形近似）', () => {
  // 2↑↑0.5 ＝ 2^0.5（いちばん上が 1＋(−0.5) ＝ 0.5）
  assert.ok(B.sameDigits(B.tetrate(I(2), n('0.5')).v, N.sqrt(I(2)), 60));
  // 2↑↑1.5 ＝ 2^(2^0.5)
  assert.ok(B.sameDigits(B.tetrate(I(2), n('1.5')).v, N.pow(I(2), N.sqrt(I(2))), 60));
  // 高さ −0.5 ＝ 0.5
  exact(B.tetrate(I(5), n('-0.5')), '1/2');
  assert.throws(() => B.tetrate(I(2), n('-2')), /−1 以上/);
});

test('テトレーション：近づいていく底', () => {
  // √2↑↑∞ ＝ 2
  const r = B.tetrateInfo(N.sqrt(I(2)), n('1000000000000'));
  assert.equal(r.conv.kind, 'fixed');
  assert.ok(B.sameDigits(r.value.v, I(2), 50));
  // 0.5↑↑n は 0.6411857445… に近づく
  const h = B.tetrate(q('1/2'), n('1000000'));
  near(h.v, '0.64118574450498598448', 18);
  // 0.01 は2つの数を行ったり来たり：偶数と奇数で答えがちがう
  const e = B.tetrateInfo(q('1/100'), n('1000000'));
  const o = B.tetrateInfo(q('1/100'), n('1000001'));
  assert.equal(e.conv.kind, 'cycle');
  assert.notEqual(N.cmp(e.value.v, o.value.v), 0);
  assert.equal(N.cmp(e.value.v, B.tetrate(q('1/100'), n('1000002')).v), 0);
});

test('巨大数のかけ算・累乗：塔の上は変わらない', () => {
  // 10^10^100（グーゴルプレックス）
  const gp = B.powBig(I(10), n('1' + '0'.repeat(100)));
  assert.equal(gp.t, 'tower');
  assert.equal(gp.h, 1);
  assert.equal(N.cmp(gp.x, N.pow(I(10), I(100))), 0);
  const parts = B.towerParts(gp);
  assert.equal(parts.tens, 2);
  exact(B.num(parts.top), '100'); // 10^10^100
  // log₁₀ でもどる
  assert.equal(N.cmp(B.log10Big(gp).v, N.pow(I(10), I(100))), 0);
  // 2^(10^20) ＝ 10^(3.0103×10^19)
  const p = B.powBig(I(2), n('100000000000000000000'));
  assert.equal(p.t, 'tower');
  near(p.x, '30102999566398119521.37', 20);
});

test('パースした数（10^10^100・3↑↑3 など）', () => {
  assert.equal(B.parseChain(''), null);
  assert.equal(B.parseChain('10^'), null);
  exact(B.parseChain('2^3^2'), '512'); // 右から：2^9
  exact(B.parseChain('3↑↑3'), '7625597484987');
  exact(B.parseChain('2.5'), '5/2');
  exact(B.parseChain('7.'), '7');
  const g = B.parseChain('10^10^100');
  assert.equal(g.t, 'tower');
  assert.equal(B.parseChain('10↑↑10↑↑3').t, 'nest');
});

test('スーパー対数', () => {
  exact(B.slog(I(2), n('65536')), '4');
  exact(B.slog(I(2), n('16')), '3');
  exact(B.slog(I(10), n('1')), '0');
  exact(B.slog(I(10), n('10')), '1');
  // slog₁₀(10^10^10) ＝ 3
  exact(B.slog(I(10), B.parseChain('10^10^10')), '3');
  exact(B.slog(I(10), B.parseChain('10^10^10^10^10')), '5');
  // 2↑↑7 の slog₂ は 7
  const s7 = B.slog(I(2), B.tetrate(I(2), n('7')));
  assert.ok(B.sameDigits(s7.v, I(7), 30), N.toNumber(s7.v));
  // 1 より小さい数：x − 1
  exact(B.slog(I(3), n('0.5')), '-1/2');
  // 逆になっている：a↑↑(slog_a x) ＝ x
  for (const [a, x] of [['3', '1000'], ['2', '12345.678'], ['1.5', '7'], ['10', '0.25']]) {
    const s = B.slog(q(a), n(x));
    assert.ok(B.sameDigits(B.tetrate(q(a), s).v, q(x), 40), `${a} ${x}`);
  }
  // √2 では 2 にとどかない
  assert.throws(() => B.slog(N.sqrt(I(2)), n('3')), /とどきません/);
  assert.throws(() => B.slog(I(1), n('3')), /1 より大きい/);
  // nest：10↑↑(10^20) の slog₁₀ は 10^20
  const sn = B.slog(I(10), B.tetrate(I(10), n('100000000000000000000')));
  near(sn.v, '100000000000000000000', 15);
  // slog₃ でも同じくらい（底のちがいは、たったの数段）
  const s3 = B.slog(I(3), B.tetrate(I(10), n('1000000000000000000')));
  assert.ok(N.cmp(s3.v, q('1000000000000000000')) > 0);
  assert.ok(N.cmp(s3.v, q('1000000000000000005')) < 0);
});

test('矢印表記', () => {
  exact(B.arrow(I(2), 1, n('10')), '1024');
  exact(B.arrow(I(2), 2, n('4')), '65536');
  exact(B.arrow(I(2), 3, n('3')), '65536'); // 2↑↑↑3 ＝ 2↑↑(2↑↑2) ＝ 2↑↑4
  exact(B.arrow(I(2), 3, n('2')), '4');
  exact(B.arrow(I(2), 7, n('2')), '4'); // 2↑…↑2 はいつも 4
  exact(B.arrow(I(5), 4, n('1')), '5');
  exact(B.arrow(I(5), 4, n('0')), '1');
  // 3↑↑↑3 ＝ 3↑↑7625597484987：10^ が 7625597484985 段くらいの塔
  const tri = B.arrow(I(3), 3, n('3'));
  assert.equal(tri.t, 'tower');
  assert.ok(Math.abs(tri.h - 7625597484987) < 5);
  // 2↑↑↑↑3 ＝ 2↑↑↑4 ＝ 2↑↑65536
  const a4 = B.arrow(I(2), 4, n('3'));
  const t = B.tetrate(I(2), n('65536'));
  assert.ok(B.closeBig(a4, t, 40));
  // 3↑↑↑4 ＝ 3↑↑(3↑↑↑3)：nest
  const n4 = B.arrow(I(3), 3, n('4'));
  assert.equal(n4.t, 'nest');
  assert.equal(n4.k, 2);
  // 3↑↑↑100：10↑↑ が 98 回くらい
  const n100 = B.arrow(I(3), 3, n('100'));
  assert.equal(n100.t, 'nest');
  assert.ok(n100.k > 90 && n100.k < 100);
  // 逆算：a↑…↑b から b にもどる
  for (const [a, k, b] of [[2, 3, 3], [3, 3, 3], [3, 3, 4], [3, 3, 100], [2, 4, 3], [2, 3, 5], [10, 3, 3]]) {
    const v = B.arrow(I(a), k, n(String(b)));
    const r = B.hyperLogInfo(I(a), k, v);
    exact(r.value, String(b));
    assert.ok(B.sameDigits(r.last.v, I(a), 30), `${a} ${k} ${b}`);
  }
  // 3↑↑↑↑3（グラハム数の g₁）は表せない
  assert.throws(() => B.arrow(I(3), 4, n('3')), /表せません/);
  assert.throws(() => B.arrow(I(3), 3, n('2.5')), /整数/);
});

test('アッカーマン関数', () => {
  const A = (m, k) => B.ackermann(n(String(m)), n(String(k)));
  exact(A(0, 5).value, '6');
  exact(A(1, 5).value, '7');
  exact(A(2, 5).value, '13');
  exact(A(3, 3).value, '61');
  exact(A(4, 0).value, '13');
  exact(A(4, 1).value, '65533');
  const a42 = A(4, 2).value;
  assert.equal(a42.v.n, 2n ** 65536n - 3n); // 2↑↑5 − 3（19729 桁）
  const a43 = A(4, 3);
  assert.equal(a43.value.t, 'tower');
  assert.equal(a43.minus, false);
  // 定義どおり（呼び出しを数える）と同じ
  for (const [m, k] of [[0, 3], [1, 4], [2, 3], [3, 3], [3, 5], [4, 0]]) {
    const r = B.ackermannByDefinition(m, k);
    exact(A(m, k).value, String(r.value));
  }
  assert.equal(B.ackermannByDefinition(3, 3).calls, 2432);
  assert.equal(B.ackermannByDefinition(4, 1, 1000), null);
  assert.throws(() => A(2.5, 1), /0 以上の整数/);
});

test('有名な数', () => {
  const list = B.famous();
  const by = (name) => list.find((f) => f.name.startsWith(name));
  assert.equal(by('グーゴルプレックス').value.t, 'tower');
  const sk = B.towerParts(by('スキューズ').value);
  assert.equal(sk.tens, 3);
  near(sk.top, '33.94', 3); // e^e^e^79 ≒ 10^10^10^33.94
  assert.equal(by('グラハム').value, null);
});
