// 関数電卓の計算（js/sci.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as N from '../js/num.js';
import * as S from '../js/sci.js';

const num = (t) => (t.startsWith('-') ? N.neg(N.parseDecimal(t.slice(1))) : N.parseDecimal(t));
const I = (n) => N.frac(BigInt(n));
const exact = (x, n, d = 1n) => {
  assert.equal(x.q, true, '正確な数のはず');
  assert.equal(N.cmp(x, N.frac(BigInt(n), BigInt(d))), 0, `${x.n}/${x.d} が ${n}/${d} でない`);
};
const near = (x, y) => assert.equal(N.roundSig(x, 50).digits, N.roundSig(y, 50).digits);

test('円周率と e', () => {
  assert.equal(N.roundSig(S.PI, 50).digits, '31415926535897932384626433832795028841971693993751');
  assert.equal(N.roundSig(S.E, 50).digits, '27182818284590452353602874713526624977572470937');
});

test('度：30°・45° ごとはちょうどの値', () => {
  exact(S.sin(I(30), 'deg'), 1n, 2n);
  exact(S.sin(I(150), 'deg'), 1n, 2n);
  exact(S.sin(I(-30), 'deg'), -1n, 2n);
  exact(S.sin(I(390), 'deg'), 1n, 2n);
  exact(S.sin(I(180), 'deg'), 0n);
  exact(S.cos(I(60), 'deg'), 1n, 2n);
  exact(S.cos(I(90), 'deg'), 0n);
  exact(S.cos(I(180), 'deg'), -1n);
  exact(S.tan(I(45), 'deg'), 1n);
  exact(S.tan(I(135), 'deg'), -1n);
  exact(S.tan(I(180), 'deg'), 0n);
  assert.throws(() => S.tan(I(90), 'deg'), /値がありません/);
  assert.throws(() => S.tan(I(-270), 'deg'), /値がありません/);
  near(S.sin(I(45), 'deg'), N.sqrt(N.frac(1n, 2n)));
  near(S.cos(I(30), 'deg'), N.div(N.sqrt(I(3)), I(2)));
  near(S.tan(I(30), 'deg'), N.div(N.sqrt(I(3)), I(3)));
});

test('rad：π を使った角度もちょうどに', () => {
  const pi = S.PI;
  exact(S.sin(N.div(pi, I(6)), 'rad'), 1n, 2n);
  exact(S.cos(pi, 'rad'), -1n);
  exact(S.sin(N.mul(pi, I(1000)), 'rad'), 0n);
  exact(S.tan(N.div(pi, I(4)), 'rad'), 1n);
  assert.throws(() => S.tan(N.div(pi, I(2)), 'rad'), /値がありません/);
  assert.equal(S.sin(I(1), 'rad').q, false);
  // とても小さい角度も桁が落ちない
  const tiny = N.parseDecimal('0.000000000000000000000000000001');
  near(S.sin(tiny, 'rad'), tiny);
  assert.equal(S.sin(N.ZERO, 'rad').q, true);
});

test('逆三角関数', () => {
  exact(S.asin(N.frac(1n, 2n), 'deg'), 30n);
  exact(S.acos(N.frac(1n, 2n), 'deg'), 60n);
  exact(S.acos(I(-1), 'deg'), 180n);
  exact(S.acos(N.ZERO, 'deg'), 90n);
  exact(S.atan(I(1), 'deg'), 45n);
  exact(S.atan(I(-1), 'deg'), -45n);
  near(S.asin(N.frac(1n, 2n), 'rad'), N.div(S.PI, I(6)));
  // √3/2（概数）の sin⁻¹ も 60° ちょうど
  exact(S.asin(N.div(N.sqrt(I(3)), I(2)), 'deg'), 60n);
  assert.throws(() => S.asin(I(2)), /−1 から 1/);
  assert.throws(() => S.acos(N.parseDecimal('1.0001')), /−1 から 1/);
  assert.equal(N.roundSig(S.atan(N.frac(10n ** 40n), 'deg'), 30).digits, '9'); // 90° より少しだけ小さい
});

test('検算：sin が同じになる角度か', () => {
  assert.equal(S.sameTrig('sin', I(150), I(30), 'deg'), true);
  assert.equal(S.sameTrig('sin', I(390), I(30), 'deg'), true);
  assert.equal(S.sameTrig('sin', I(120), I(30), 'deg'), false);
  assert.equal(S.sameTrig('cos', I(-60), I(60), 'deg'), true);
  assert.equal(S.sameTrig('tan', I(225), I(45), 'deg'), true);
  assert.equal(S.sameTrig('sin', I(2), S.asin(S.sin(I(2), 'rad'), 'rad'), 'rad'), true);
});

test('log と ln', () => {
  exact(S.log10(I(1000)), 3n);
  exact(S.log10(N.parseDecimal('0.001')), -3n);
  exact(S.log10(I(1)), 0n);
  near(S.log10(I(2)), N.parseDecimal('0.30102999566398119521373889472449302676818988146211'));
  near(S.ln(S.E), I(1));
  exact(S.ln(I(1)), 0n);
  assert.throws(() => S.log10(N.ZERO), /log はありません/);
  assert.throws(() => S.ln(I(-1)), /ln はふつうの数になりません/);
});

test('階乗・nPr・nCr', () => {
  exact(S.factorial(N.ZERO), 1n);
  exact(S.factorial(I(5)), 120n);
  exact(S.factorial(I(20)), 2432902008176640000n);
  assert.equal(S.factorial(I(25000)).q, true);                 // 約10万桁まで正確
  assert.throws(() => S.factorial(N.parseDecimal('3.5')), /0 以上の整数/);
  assert.throws(() => S.factorial(I(-1)), /0 以上の整数/);
  exact(S.nPr(I(5), I(2)), 20n);
  exact(S.nCr(I(5), I(2)), 10n);
  exact(S.nCr(I(52), I(5)), 2598960n);
  exact(S.nCr(I(10), I(0)), 1n);
  exact(S.nCr(I(10), I(10)), 1n);
  assert.throws(() => S.nCr(I(5), I(6)), /r が n 以下/);
  assert.throws(() => S.nPr(I(5), N.parseDecimal('1.5')), /0 以上の整数/);
  exact(S.reciprocal(I(4)), 1n, 4n);
});

test('素因数分解', () => {
  const f = (n, o) => S.factorize(n, o);
  assert.deepEqual(f(360n), { factors: [[2n, 3], [3n, 2], [5n, 1]], rest: [] });
  assert.deepEqual(f(97n), { factors: [[97n, 1]], rest: [] });
  assert.deepEqual(f(600851475143n).factors, [[71n, 1], [839n, 1], [1471n, 1], [6857n, 1]]);
  assert.deepEqual(f(1000003n * 1000033n).factors, [[1000003n, 1], [1000033n, 1]]);
  assert.deepEqual(f(2n ** 61n - 1n).factors, [[2n ** 61n - 1n, 1]]);                 // メルセンヌ素数
  assert.deepEqual(f(2n ** 64n).factors, [[2n, 64]]);
  // 大きな素数どうしのかけ算は、時間がかかるので途中でやめる
  const big = (10n ** 15n + 37n) * (10n ** 15n + 91n);
  assert.deepEqual(f(big, { budget: 2000 }).rest, [big]);
  assert.equal(S.isPrime(10n ** 15n + 37n), true);
  assert.equal(S.supText(23), '²³');
});

// ---- Python の decimal と答え合わせ ----
const cases = JSON.parse(readFileSync(new URL('./oracle-sci.json', import.meta.url), 'utf8'));

test(`Python と答え合わせ（関数電卓 ${cases.length} 件）`, () => {
  for (const c of cases) {
    const a = num(c.a);
    const b = c.b === undefined ? null : num(c.b);
    let got;
    switch (c.op) {
      case 'sin': got = S.sin(a, c.angle); break;
      case 'cos': got = S.cos(a, c.angle); break;
      case 'tan': got = S.tan(a, c.angle); break;
      case 'atan': got = S.atan(a, c.angle); break;
      case 'asin': got = S.asin(a, c.angle); break;
      case 'acos': got = S.acos(a, c.angle); break;
      case 'log10': got = S.log10(a); break;
      case 'fact': got = S.factorial(a); break;
      case 'nPr': got = S.nPr(a, b); break;
      case 'nCr': got = S.nCr(a, b); break;
      default: throw new Error(c.op);
    }
    const name = `${c.op}(${c.a}${c.b ? `, ${c.b}` : ''})${c.angle ? ` ${c.angle}` : ''}`;
    const want = N.roundSig(N.frac(BigInt(c.want.digits), 1n), 50);
    const g = N.roundSig(got, 50);
    assert.equal(g.digits, want.digits, name);
    assert.equal(g.exp, want.exp + c.want.exp - c.want.digits.length, `${name} の桁の位置`);
    assert.equal(g.neg, c.want.neg, `${name} の符号`);
  }
});
