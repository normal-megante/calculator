// 場合の数・確率（js/prob.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import * as P from '../js/prob.js';

const q = (s) => {
  const [n, d = '1'] = String(s).split('/');
  return N.div(N.parseDecimal(n), N.parseDecimal(d));
};
const I = (k) => N.frac(BigInt(k));
const eq = (x, s) => assert.equal(N.cmp(x, q(s)), 0, `${N.toNumber(x)} ≠ ${s}`);
const near = (x, s, digits = 12) => assert.ok(P.same(N.toApprox(x), q(s), digits), `${N.toNumber(x)} ≠ ${s}`);

// 答えを出して、検算が全部 ✓ になることもたしかめる
function solveOk(key, texts, mode) {
  const s = P.solve(key, texts, mode);
  assert.ok(s.r, `${key}: ${s.error ?? s.missing}`);
  const c = P.check(key, texts, mode);
  const bad = c.sections.flatMap((x) => x.rows.filter((r) => r[0] === 'ok' && !r[2]).map((r) => `${x.title}：${r[1]}`));
  assert.deepEqual(bad, [], `${key} の検算`);
  return s.r;
}

test('欄の文字を数に', () => {
  eq(P.parseText('prob', '1/6'), '1/6');
  eq(P.parseText('prob', '3%'), '3/100');
  eq(P.parseText('prob', '0.5%'), '1/200');
  eq(P.parseText('prob', '1/2%'), '1/200');
  eq(P.parseText('prob', '0.03'), '3/100');
  assert.equal(P.parseText('prob', '1/'), null);
  assert.equal(P.parseText('prob', ''), null);
  assert.throws(() => P.parseText('prob', '120%'), /0 から 1/);
  assert.throws(() => P.parseText('prob', '1/0'), /分母/);
  eq(P.parseText('num', '−12.5'), '-25/2');
  assert.equal(P.parseText('num', '−'), null);
  assert.equal(P.parseText('int', '12'), 12n);
  assert.equal(P.parseText('int', '1.5'), null);
  const l = P.parseText('list', '65,−72.5,');
  assert.equal(l.length, 2);
  eq(l[1], '-145/2');
});

test('場合の数', () => {
  eq(solveOk('perm', { n: '5', r: '3' }).value, '60');
  eq(solveOk('comb', { n: '5', r: '3' }).value, '10');
  eq(solveOk('rperm', { n: '2', r: '5' }).value, '32');
  eq(solveOk('rcomb', { n: '3', r: '5' }).value, '21');
  eq(solveOk('circ', { n: '5' }).value, '24');
  eq(solveOk('neck', { n: '6' }).value, '60');
  eq(solveOk('neck', { n: '2' }).value, '1');
  eq(solveOk('multi', { a: '2', b: '1', c: '1' }).value, '12');
  eq(solveOk('multi', { a: '3', b: '2', c: '', d: '2' }).value, '210');
  // 大きい数（書き出しは省略、検算は ✓）
  eq(solveOk('comb', { n: '100', r: '50' }).value, '100891344545564193334812497256');
  solveOk('perm', { n: '1000', r: '400' });
  solveOk('rperm', { n: '7', r: '5000' });
  // 書き出し
  assert.deepEqual(P.enumerate('comb', 4, 2).sample, ['AB', 'AC', 'AD', 'BC', 'BD', 'CD']);
  assert.equal(P.enumerate('circ', 5, 5).count, 24);
  assert.equal(P.enumerate('neck', 6, 6).count, 60);
  assert.deepEqual(P.enumerate('multi', 3, 3, [2, 1]).sample, ['AAB', 'ABA', 'BAA']);
  assert.equal(P.enumerate('rcomb', 3, 5).count, 21);
  // まちがい
  assert.match(P.solve('comb', { n: '3', r: '5' }).error, /r は n 以下/);
  assert.deepEqual(P.solve('comb', { n: '3' }).missing, ['r（選ぶ数）']);
});

test('くり返し（二項分布）', () => {
  eq(solveOk('binom', { p: '1/6', n: '10', k: '2' }, 'eq').value, '1953125/6718464');
  eq(solveOk('binom', { p: '1/6', n: '10', k: '2' }, 'ge').value, '31169301/60466176');
  eq(solveOk('binom', { p: '1/6', n: '10', k: '1' }, 'le').value, '29296875/60466176');
  eq(solveOk('binom', { p: '1/2', n: '4', k: '0' }, 'ge').value, '1');
  eq(solveOk('binom', { p: '1/2', n: '4', k: '9' }, 'eq').value, '0');
  // 大きい回数は概数で（平均 500万、標準偏差 1581）
  const big = solveOk('binom', { p: '1/2', n: '10000000', k: '5000000' }, 'ge');
  near(big.value, '0.500126157', 9);
  // 正確な分数のまま（2000回）と、概数（2001回）がほぼ同じ
  const a = P.binomSum(q('3/10'), 2000n, 0n, 600n);
  const b = P.binomSum(N.toApprox(q('3/10')), 2000n, 0n, 600n);
  assert.ok(a.q && !b.q);
  assert.ok(P.same(a, b, 40));
});

test('ガチャ', () => {
  near(solveOk('atleast', { p: '1%', n: '100' }).value, '0.633967658726771');
  eq(solveOk('needed', { p: '1%', t: '50%' }).value, '69');
  eq(solveOk('needed', { p: '1%', t: '90%' }).value, '230');
  eq(solveOk('needed', { p: '1%', t: '99%' }).value, '459');
  eq(solveOk('needed', { p: '1/1000000', t: '50%' }).value, '693147');
  assert.match(P.solve('needed', { p: '1%', t: '100%' }).error, /100% にはなりません/);
  eq(solveOk('average', { p: '1%' }).value, '100');
  const avg = N.toNumber(solveOk('average', { p: '1%', c: '90' }).value);
  assert.ok(Math.abs(avg - (1 - 0.99 ** 90) / 0.01) < 1e-9, `${avg}`);
  eq(solveOk('comp', { m: '6' }).value, '14.7');
  near(solveOk('comp', { m: '5000' }).value, '45472.5', 5);
  eq(solveOk('compn', { m: '6', n: '6' }).value, '5/324');
  eq(solveOk('compn', { m: '6', n: '5' }).value, '0');
  solveOk('compn', { m: '50', n: '300' });
});

test('くじ（超幾何分布）', () => {
  eq(solveOk('hyper', { N: '10', K: '3', n: '2', k: '1' }, 'ge').value, '8/15');
  eq(solveOk('hyper', { N: '10', K: '3', n: '2', k: '1' }, 'eq').value, '7/15');
  eq(solveOk('hyper', { N: '10', K: '3', n: '2', k: '0' }, 'le').value, '7/15');
  eq(solveOk('hyper', { N: '10', K: '3', n: '5', k: '4' }, 'eq').value, '0');
  // 大きいくじは概数
  const r = solveOk('hyper', { N: '100000', K: '30000', n: '1000', k: '300' }, 'ge');
  assert.ok(!r.value.q);
  assert.match(P.solve('hyper', { N: '5', K: '6', n: '1', k: '1' }).error, /当たりの本数/);
});

test('条件付き確率', () => {
  eq(solveOk('test', { a: '1%', s: '99%', t: '99%' }, 'pos').value, '1/2');
  eq(solveOk('test', { a: '1%', s: '99%', t: '99%' }, 'neg').value, '9801/9802');
  eq(solveOk('general', { a: '30%', b: '80%', c: '10%' }, 'pos').value, '24/31');
  solveOk('general', { a: '30%', b: '80%', c: '10%' }, 'neg');
  solveOk('test', { a: '0.0123%', s: '87.5%', t: '99.9%' }, 'pos');
});

test('正規分布', () => {
  near(P.upperTail(I(1)), '0.158655253931457', 14);
  near(P.upperTail(I(3)), '0.00134989803163009', 14);
  near(P.upperTail(I(5)), '0.000000286651571879194', 14);
  near(P.upperTail(I(10)), '0.00000000000000000000000761985302416047', 14);
  near(P.upperTail(I(-1)), '0.841344746068543', 14);
  // 40 のさかい目で、計算のしかたが変わってもつながっている
  const a = P.upperTail(q('39.999999'));
  const b = P.upperTail(q('40.000001'));
  const ratio = N.toNumber(N.div(a, b));
  assert.ok(Math.abs(ratio - Math.exp(40 * 0.000002) * (40.000001 / 39.999999)) < 1e-9, `${ratio}`);
  near(P.upperTailInv(q('1/10')), '1.2815515655446004', 15);
  near(P.upperTailInv(q('97.5/100')), '-1.959963984540054', 15);
  near(P.upperTailInv(P.upperTail(I(45))), '45', 30);
  near(q(P.areaBySimpson(-1, 1).toString()), '0.682689492137086', 10);
});

test('偏差値・データ', () => {
  const s = solveOk('score', { mu: '60', sd: '10', x: '75' });
  eq(s.value, '65');
  near(s.up, '0.0668072012688581', 14);
  near(solveOk('dev', { T: '60' }).value, '0.158655253931457', 14);
  near(solveOk('top', { q: '10%', mu: '60', sd: '10' }).value, '62.815515655446', 13);
  near(solveOk('range', { mu: '60', sd: '10', a: '50', b: '70' }).value, '0.682689492137086', 14);
  // 平均よりずっと下どうしでも、桁が消えない
  assert.ok(P.same(solveOk('range', { mu: '0', sd: '1', a: '−60', b: '−50' }).value, P.upperTail(I(50)), 30));
  const d = solveOk('data', { list: '65,72,80,58,90' });
  eq(d.value, '73');
  eq(d.variance, '125.6');
  solveOk('data', { list: '−3,4.5,4.5' });
  solveOk('data', { list: '7' });
  assert.match(P.solve('score', { mu: '60', sd: '0', x: '75' }).error, /標準偏差/);
});

test('書き方', () => {
  assert.equal(P.pct(q('1/2')), '50%');
  assert.equal(P.pct(q('1/3')), '33.33333333…%');
  assert.equal(P.fracText(q('1/6')), '1/6');
  assert.equal(P.oneIn(q('1/6')), '約 6 回に1回');
  assert.equal(P.oneIn(q('3/1000')), '約 333 回に1回');
  assert.equal(P.numText(I('100000000000000000000')).text, '1×10^20');
});

test('全部の計算で、はじめの値の検算が ✓', () => {
  for (const c of P.CALCS) {
    const texts = Object.fromEntries(c.fields.map((f) => [f.key, f.init]));
    for (const [m] of c.modes ?? [[undefined]]) solveOk(c.key, texts, m);
  }
});
