// 数の計算（js/num.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as N from '../js/num.js';

const d = (s) => N.parseDecimal(s.replace('-', ''));
const num = (s) => (s.startsWith('-') ? N.neg(d(s)) : d(s));
const int = (v) => N.frac(BigInt(v));

// 上から sig 桁の数字（四捨五入）
function top(x, sig = 50) {
  const r = N.roundSig(x, sig);
  return { digits: r.digits, exp: r.exp, neg: r.neg };
}

function sameExact(x, n, dd = '1') {
  assert.equal(x.q, true, '正確な数のはず');
  assert.equal(x.n, BigInt(n));
  assert.equal(x.d, BigInt(dd));
}

test('0.1 + 0.2 はぴったり 0.3', () => {
  sameExact(N.add(d('0.1'), d('0.2')), 3, 10);
});

test('1 ÷ 3 × 3 はぴったり 1', () => {
  sameExact(N.mul(N.div(int(1), int(3)), int(3)), 1);
});

test('大きな整数もそのまま', () => {
  const x = N.pow(int(2), int(200));
  sameExact(x, (2n ** 200n).toString());
  const y = N.mul(d('99999999999999999999'), d('99999999999999999999'));
  sameExact(y, '9999999999999999999800000000000000000001');
});

test('平方根：割り切れるものは正確に', () => {
  sameExact(N.sqrt(int(144)), 12);
  sameExact(N.sqrt(N.frac(4n, 9n)), 2, 3);
  sameExact(N.sqrt(d('0.25')), 1, 2);
});

test('平方根：√2 は 50 桁正しい', () => {
  const x = N.sqrt(int(2));
  assert.equal(x.q, false);
  assert.equal(top(x).digits, '14142135623730950488016887242096980785696718753769');
});

test('√2 × √2 は 2 に、√2×√2−2 は 0 になる', () => {
  const r = N.sqrt(int(2));
  const two = N.mul(r, r);
  assert.deepEqual(top(two), { digits: '2', exp: 1, neg: false });
  assert.equal(N.isZero(N.sub(two, int(2))), true);
});

test('累乗：分数乗で割り切れるものは正確に', () => {
  sameExact(N.pow(int(8), N.frac(2n, 3n)), 4);
  sameExact(N.pow(int(-8), N.frac(1n, 3n)), -2);
  sameExact(N.pow(d('0.25'), d('0.5')), 1, 2);
  sameExact(N.pow(int(2), int(-3)), 1, 8);
  sameExact(N.pow(int(0), int(0)), 1);
});

test('累乗：負の数の偶数乗根・0 の負の乗はエラー', () => {
  assert.throws(() => N.pow(int(-4), d('0.5')), N.CalcError);
  assert.throws(() => N.pow(int(0), int(-1)), /0 で割る/);
  assert.throws(() => N.sqrt(int(-1)), N.CalcError);
});

test('0 で割るとエラー', () => {
  assert.throws(() => N.div(int(1), int(0)), /0 で割る/);
});

test('とても大きな数：2^1000000 は概数で、上の桁が正しい', () => {
  const x = N.pow(int(2), int(1000000));
  assert.equal(x.q, false);
  const r = N.roundSig(x, 20);
  // 2^1000000 = 9.9006562292958982506979236163…×10^301029
  assert.equal(r.digits, '99006562292958982507');
  assert.equal(r.exp, 301030);
});

test('とても大きな数：9^(9^9) も見積もれる', () => {
  const x = N.pow(int(9), N.pow(int(9), int(9)));
  const r = N.roundSig(x, 10);
  // 9^387420489 = 4.2812477317…×10^369693099
  assert.equal(r.digits, '4281247732'); // 4.28124773175…
  assert.equal(r.exp, 369693100);
});

test('大きすぎる数はエラー', () => {
  assert.throws(() => N.pow(int(10), N.pow(int(10), int(20))), /大きすぎ/);
});

test('正確な整数は約10万桁まで', () => {
  const x = N.pow(int(3), int(100000)); // 47,713 桁
  assert.equal(x.q, true);
  assert.equal(x.n.toString().length, 47713);
});

test('roundSig は四捨五入', () => {
  assert.deepEqual(N.roundSig(N.frac(2n, 3n), 5), { neg: false, digits: '66667', exp: 0, exact: false });
  assert.deepEqual(N.roundSig(d('0.125'), 2), { neg: false, digits: '13', exp: 0, exact: false });
  assert.deepEqual(N.roundSig(d('9.99'), 2), { neg: false, digits: '1', exp: 2, exact: false });
  assert.deepEqual(N.roundSig(int(1200), 5), { neg: false, digits: '12', exp: 4, exact: true });
  assert.deepEqual(N.roundSig(N.neg(d('0.000123')), 5), { neg: true, digits: '123', exp: -3, exact: true });
});

test('保存用の形にして戻せる', () => {
  for (const x of [N.frac(-7n, 3n), N.sqrt(int(3)), int(0)]) {
    assert.deepEqual(N.deserialize(JSON.parse(JSON.stringify(N.serialize(x)))), { ...x });
  }
});

// ---- Python の decimal と答え合わせ ----
const cases = JSON.parse(readFileSync(new URL('./oracle.json', import.meta.url), 'utf8'));

test(`Python と答え合わせ（${cases.length} 件）`, () => {
  let checked = 0;
  for (const c of cases) {
    const a = num(c.a);
    const b = c.b === undefined ? null : num(c.b);
    let got;
    switch (c.op) {
      case 'sqrt': got = N.sqrt(a); break;
      case 'pow': got = N.pow(a, b); break;
      case 'ln': got = N.ln(a); break;
      case 'exp': got = N.exp(a); break;
      case 'add': got = N.add(a, b); break;
      case 'sub': got = N.sub(a, b); break;
      case 'mul': got = N.mul(a, b); break;
      case 'div': got = N.div(a, b); break;
      default: throw new Error(c.op);
    }
    if (c.n !== undefined) {
      assert.equal(got.q, true, `${c.op}(${c.a}, ${c.b}) は正確な数のはず`);
      assert.equal(got.n.toString(), c.n, `${c.op}(${c.a}, ${c.b})`);
      assert.equal(got.d.toString(), c.d, `${c.op}(${c.a}, ${c.b})`);
    } else {
      // Python の答えを 50 桁に四捨五入したものと比べる
      const want = N.roundSig(
        (c.want.neg ? N.neg : (x) => x)(N.frac(BigInt(c.want.digits), 1n)), 50);
      const shift = c.want.exp - c.want.digits.length;
      const g = N.roundSig(got, 50);
      assert.equal(g.digits, want.digits, `${c.op}(${c.a}${c.b ? `, ${c.b}` : ''})`);
      assert.equal(g.exp, want.exp + shift, `${c.op}(${c.a}${c.b ? `, ${c.b}` : ''}) の桁の位置`);
      assert.equal(g.neg, c.want.neg);
    }
    checked++;
  }
  assert.equal(checked, cases.length);
});
