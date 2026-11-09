// 微分・積分・Σ・lim（js/calculus.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import * as S from '../js/sci.js';
import { compile } from '../js/calc.js';
import * as C from '../js/calculus.js';
import { runJob, parseBound } from '../js/calculus-job.js';

// '2x^3' のような文字 → 部品（sin( などは まとめて1つ）
function items(s) {
  const out = [];
  for (let i = 0; i < s.length;) {
    const fn = ['asin(', 'acos(', 'atan(', 'sin(', 'cos(', 'tan(', 'log(', 'ln('].find((f) => s.startsWith(f, i));
    if (fn) { out.push(fn); i += fn.length; continue; }
    out.push(s[i]);
    i++;
  }
  return out;
}
const T = (s) => compile(items(s));
const num = (s) => (s.startsWith('-') ? N.neg(N.parseDecimal(s.slice(1))) : N.parseDecimal(s));
const I = (n) => N.frac(BigInt(n));
const exact = (x, n, d = 1n) => {
  assert.equal(x.q, true, `正確な数のはず（${N.roundSig(x, 20).digits}）`);
  assert.equal(N.cmp(x, N.frac(BigInt(n), BigInt(d))), 0, `${x.n}/${x.d} が ${n}/${d} でない`);
};
// 上から k 桁が同じ
const near = (x, y, k = 30) => assert.equal(N.roundSig(x, k).digits, N.roundSig(y, k).digits,
  `${N.roundSig(x, k).digits} と ${N.roundSig(y, k).digits}`);
const rad = { angle: 'rad' };
const deg = { angle: 'deg' };

test('変数 x の入った式', () => {
  const t = T('2x^3+x');
  assert.equal(N.cmp(C.pEval(C.polyOf(t), I(2)), I(18)), 0);
  assert.equal(C.polyOf(T('sin(x)'), rad), null);
  assert.deepEqual(C.polyOf(T('(x+1)²')).map((c) => Number(c.n)), [1, 2, 1]);
});

test('微分：多項式はちょうど、関数も級数で正確に', () => {
  const d = C.derivative(T('x^3−2x'), I(2));
  exact(d.d1, 10n);
  exact(d.d2, 12n);
  exact(d.f, 4n);
  assert.equal(d.method, 'series');
  near(C.derivative(T('sin(x)'), I(1), rad).d1, N.parseDecimal('0.54030230586813971740093660744297660373231042061792'), 45);
  exact(C.derivative(T('sin(x)'), I(0), rad).d1, 1n);
  near(C.derivative(T('e^x'), I(1), rad).d1, S.E, 45);
  near(C.derivative(T('ln(x)'), I(3), rad).d1, N.frac(1n, 3n), 45);
  near(C.derivative(T('√x'), I(4), rad).d1, N.frac(1n, 4n), 45);
  near(C.derivative(T('x^x'), I(2), rad).d1, N.mul(I(4), N.add(ONE(), N.ln(I(2)))), 45);
  near(C.derivative(T('atan(x)'), I(1), rad).d1, N.frac(1n, 2n), 45);
  // 度のとき：d/dx sin(x°) ＝ π/180 · cos(x°)
  near(C.derivative(T('sin(x)'), I(60), deg).d1, N.div(S.PI, I(360)), 45);
  assert.throws(() => C.derivative(T('1÷x'), I(0)), /値がない/);
  assert.throws(() => C.derivative(T('x^(1÷3)'), I(0), rad), /傾きが限りなく大きく|微分できません/);
});
function ONE() { return N.ONE; }

test('lim：級数で（0/0 の形も）', () => {
  exact(C.limit(T('sin(x)÷x'), I(0), 'both', rad).value, 1n);
  exact(C.limit(T('(x²−1)÷(x−1)'), I(1)).value, 2n);
  exact(C.limit(T('(1−cos(x))÷x²'), I(0), 'both', rad).value, 1n, 2n);
  near(C.limit(T('(1+1÷x)^x'), { inf: 1 }).value, S.E, 45);
  near(C.limit(T('(e^x−1)÷x'), I(0), 'both', rad).value, I(1), 45);
  exact(C.limit(T('(2x²+1)÷(x²+3)'), { inf: 1 }).value, 2n);
  assert.deepEqual(C.limit(T('1÷x'), I(0)), { kind: 'split', right: 1, left: -1, method: 'series' });
  assert.equal(C.limit(T('1÷x'), I(0), 'right').sign, 1);
  assert.equal(C.limit(T('1÷x²'), I(0)).kind, 'inf');
  assert.equal(C.limit(T('x²'), { inf: -1 }).sign, 1);
  near(C.limit(T('sin(x)÷x'), I(0), 'both', deg).value, N.div(S.PI, I(180)), 45);
});

test('lim：級数にならない式は数値で', () => {
  const r = C.limit(T('x^x'), I(0), 'right', rad);
  assert.equal(r.method, 'numeric');
  near(r.value, I(1), 20);
  const z = C.limit(T('x×ln(x)'), I(0), 'right', rad);
  assert.equal(N.isZero(z.value), true);
  assert.equal(C.limit(T('sin(1÷x)'), I(0), 'both', rad).kind, 'none');
  const one = C.limit(T('√x'), I(0), 'both', rad);
  assert.equal(one.oneSide, 'right');
  assert.equal(N.isZero(one.value), true);
  near(C.limit(T('ln(x)÷x'), { inf: 1 }, 'both', rad).value ?? I(0), I(0), 5);
});

test('積分：多項式はちょうど', () => {
  const r = C.integral(T('x²'), I(0), I(1));
  exact(r.value, 1n, 3n);
  assert.equal(r.method, 'poly');
  exact(C.integral(T('3x²−2x+1'), I(-1), I(2)).value, 9n);
  exact(C.integral(T('x'), I(2), I(0)).value, -2n);         // 上と下が逆ならマイナス
  assert.throws(() => C.integral(T('x'), I(0), { inf: 1 }), /限りなく大きく/);
});

test('積分：数値（二重指数関数型）', () => {
  const r = C.integral(T('sin(x)'), I(0), S.PI, rad);
  assert.equal(r.method, 'numeric');
  assert.ok(r.digits >= 35, `桁数 ${r.digits}`);
  near(r.value, I(2), 35);
  near(C.integral(T('1÷√x'), I(0), I(1), rad).value, I(2), 30);              // 端で無限大でも
  near(C.integral(T('ln(x)'), I(0), I(1), rad).value, I(-1), 30);
  near(C.integral(T('e^(−x)'), I(0), { inf: 1 }, rad).value, I(1), 30);       // ∞ まで
  near(C.integral(T('e^(−x²)'), { inf: -1 }, { inf: 1 }, rad).value, N.sqrt(S.PI), 30);
  near(C.integral(T('1÷(1+x²)'), { inf: -1 }, { inf: 1 }, rad).value, S.PI, 30);
  near(C.integral(T('4÷(1+x²)'), I(0), I(1), rad).value, S.PI, 35);
  assert.equal(C.integral(T('sin(x)'), N.neg(S.PI), S.PI, rad).approxZero, true);
  assert.throws(() => C.integral(T('1÷x'), I(0), I(1), rad), /発散|計算でき/);
  assert.throws(() => C.integral(T('1÷x'), I(-1), I(1), rad), /計算できません/);
  // 広い区間の中の細いとがり：とがった所で分けて計算する（2·tan⁻¹(1000)）
  near(C.integral(T('1÷(1+x²)'), I(-1000), I(1000), rad).value, N.mul(I(2), S.atan(I(1000), 'rad')), 35);
  near(C.integral(T('1÷(1+(x−30)²)'), I(-100), I(100), rad).value, N.add(S.atan(I(70), 'rad'), S.atan(I(130), 'rad')), 30);
});

test('Σ：公式・1つずつ・等比', () => {
  const r = C.sigma(T('k²'), 1n, 100n);
  exact(r.value, 338350n);
  assert.equal(r.method, 'formula');
  exact(C.sigma(T('k²'), 1n, 10n ** 12n).value, 333333333333833333333333500000000000n);
  // 公式 S(n) ＝ n³/3 ＋ n²/2 ＋ n/6
  assert.deepEqual(r.formula.map((c) => `${c.n}/${c.d}`), ['0/1', '1/6', '1/2', '1/3']);
  const d = C.sigma(T('1÷k'), 1n, 10n);
  exact(d.value, 7381n, 2520n);
  assert.equal(d.method, 'direct');
  exact(C.sigma(T('(1÷2)^k'), 1n, Infinity).value, 1n);
  exact(C.sigma(T('3×(1÷2)^k'), 0n, 100000n).value, 6n * 2n ** 100000n - 3n, 2n ** 100000n); // 等比数列の公式
  exact(C.sigma(T('k'), 5n, 4n).value, 0n);                                      // 空の和
  assert.throws(() => C.sigma(T('k'), 1n, Infinity), /大きく/);
});

test('Σ：∞ まで（ゆっくり・交互・すぐ小さくなる）', () => {
  const z2 = C.sigma(T('1÷k²'), 1n, Infinity, rad);
  assert.equal(z2.method, 'em');
  near(z2.value, N.div(N.mul(S.PI, S.PI), I(6)), 30);
  const alt = C.sigma(T('(−1)^(k+1)÷k'), 1n, Infinity, rad);
  assert.equal(alt.method, 'alternating');
  near(alt.value, N.ln(I(2)), 35);
  const e = C.sigma(T('1÷k!'), 0n, Infinity, rad);
  assert.equal(e.method, 'fast');
  near(e.value, S.E, 45);
  near(C.sigma(T('1÷(k(k+1))'), 1n, Infinity, rad).value, I(1), 30);
  assert.throws(() => C.sigma(T('1÷k'), 1n, Infinity, rad), /発散/);
  assert.throws(() => C.sigma(T('(−1)^k'), 1n, Infinity, rad), /値が決まりません/);
  // 項がとても多い（1万個より多い）有限の和
  const h = C.sigma(T('1÷k'), 1n, 10n ** 9n, rad);
  near(h.value, N.parseDecimal('21.300481502347944016685101848908'), 30);
});

test('むずかしい所（とがった所・大きすぎる数・発散）', () => {
  assert.throws(() => C.derivative(T('√(x²)'), I(0), rad), /とがっている/);   // |x| の 0
  exact(C.derivative(T('√(x²)'), I(2), rad).d1, 1n);
  assert.equal(N.isZero(C.derivative(T('x√(x²)'), I(0), rad).d1), true);       // x|x| はなめらか
  assert.equal(N.isZero(C.derivative(T('x^(3÷2)'), I(0), rad).d1), true);      // 右からだけ
  const e = C.limit(T('e^(1÷x)'), I(0), 'both', rad);                           // 右は ∞、左は 0
  assert.equal(e.kind, 'differ');
  assert.equal(e.right.kind, 'inf');
  assert.equal(N.isZero(e.left.value), true);
  assert.equal(N.isZero(C.limit(T('x²÷e^x'), { inf: 1 }, 'both', rad).value), true);
  assert.throws(() => C.sigma(T('1÷√k'), 1n, Infinity, rad), /発散/);
  assert.throws(() => C.integral(T('1÷√x'), I(1), { inf: 1 }, rad), /発散/);
  assert.throws(() => C.integral(T('sin(x)÷x'), I(0), { inf: 1 }, rad), /∞ までの積分/);
  assert.throws(() => C.sigma(T('sin(k)÷k²'), 1n, Infinity, rad), /∞ までの和を出せません/);
});

test('検算用：差の商・長方形・途中までの和・表', () => {
  const dq = C.diffQuotients(T('x²'), I(3));
  assert.equal(dq.length, 5);
  exact(dq[0].value, 61n, 10n);                     // (3.1² − 9) ÷ 0.1 ＝ 6.1
  near(C.riemann(T('x²'), I(0), I(1), 10), N.frac(133n, 400n), 30); // 0.3325
  const ps = C.partialSums(T('k'), 1n, [10, 100]);
  exact(ps[1].value, 5050n);
  const tb = C.limitTable(T('sin(x)÷x'), I(0), 'both', rad);
  assert.equal(tb.length, 2);
  assert.equal(tb[0].rows.length, 5);
});

test('画面の欄から計算する（calculus-job.js）', () => {
  const job = (kind, f, more = {}) => runJob({ op: 'solve', kind, angle: 'rad', f: items(f), ...more });
  const d = job('diff', 'x^3', { a: items('2') });
  assert.equal(d.ok, true);
  exact(d.d1, 12n);
  assert.deepEqual(d.dpoly.map((c) => Number(c.n)), [0, 0, 3]);                 // f′(x) ＝ 3x²
  exact(d.tangent.slope, 12n);
  exact(d.tangent.icept, -16n);                                                  // 接線 y ＝ 12x − 16
  const i = job('int', 'x²', { lo: items('0'), hi: items('3') });
  exact(i.value, 9n);
  const inf = job('int', 'e^(−x)', { lo: items('0'), hi: ['∞'] });
  near(inf.value, I(1), 30);
  const back = job('int', 'x', { lo: items('2'), hi: items('0') });
  assert.equal(back.reversed, true);
  exact(back.value, -2n);
  exact(job('sum', 'k', { lo: items('1'), hi: items('100') }).value, 5050n);
  near(job('sum', '1÷k²', { lo: items('1'), hi: ['∞'] }).value, N.div(N.mul(S.PI, S.PI), I(6)), 30);
  exact(job('lim', 'sin(x)÷x', { at: items('0'), side: 'both' }).value, 1n);
  assert.equal(job('lim', '1÷x', { at: items('0'), side: 'right' }).sign, 1);
  assert.equal(job('lim', 'x', { at: ['−', '∞'] }).sign, -1);
  // まちがった入力
  assert.equal(job('diff', '', { a: items('1') }).errorKind, 'empty');
  assert.match(job('diff', 'x^', { a: items('1') }).errorKind, /syntax|incomplete/);
  assert.equal(job('diff', 'x', { a: [] }).errorKind, 'empty');
  assert.match(job('diff', 'k', { a: items('1') }).error, /x で書きます/);
  assert.match(job('sum', 'k', { lo: items('1.5'), hi: items('3') }).error, /整数/);
  assert.match(job('sum', 'k', { lo: ['∞'], hi: items('3') }).error, /使えません/);
  assert.match(job('int', 'x', { lo: items('x'), hi: items('1') }).error, /x は使えません/);
  assert.match(job('int', 'x', { lo: ['1', '∞'], hi: items('1') }).error, /∞/);
  assert.match(job('lim', '1÷x', { at: items('0'), side: 'both' }).kind, /split/);
  // 下端・上端は式でもよい（π÷2）
  near(parseBound(items('π÷2'), { name: '上端' }), N.div(S.PI, I(2)), 45);
});

test('検算に使う数（calculus-job.js）', () => {
  const job = (kind, f, more = {}) => runJob({ op: 'check', kind, angle: 'rad', f: items(f), ...more });
  const d = job('diff', 'x²', { a: items('3') });
  assert.equal(d.rows.length, 5);
  exact(d.polyAt, 6n);
  const i = job('int', 'x²', { lo: items('0'), hi: items('1') });
  assert.equal(i.rows.length, 3);
  assert.equal(i.antiCheck.same, true);
  exact(N.sub(i.antiCheck.Fhi, i.antiCheck.Flo), 1n, 3n);
  const inf = job('int', 'e^(−x)', { lo: items('0'), hi: ['∞'] });
  assert.equal(inf.rows.length, 3);                                              // 0〜10・0〜100・0〜1000
  const sm = job('sum', 'k²', { lo: items('1'), hi: items('100') });
  assert.equal(sm.formulaCheck.same, true);
  assert.equal(sm.all, true);
  exact(sm.partial[sm.partial.length - 1].value, 338350n);                        // 1つずつ全部足しても同じ
  assert.equal(sm.terms.length, 5);
  const lm = job('lim', 'sin(x)÷x', { at: items('0'), side: 'both' });
  assert.equal(lm.tables.length, 2);
});
