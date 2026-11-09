// 物理・電気の公式（js/phys.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import * as P from '../js/phys.js';

const q = (s) => {
  const [n, d = '1'] = String(s).replace('−', '-').split('/');
  const neg = n.startsWith('-');
  const x = N.div(N.parseDecimal(neg ? n.slice(1) : n), N.parseDecimal(d));
  return neg ? N.neg(x) : x;
};
const F = (key) => P.formulaByKey(key);
// given：{ key: '数 単位' }（単位がなければ、その量のはじめの単位）
function solve(key, target, given, ansUnit = null) {
  const f = F(key);
  const g = {};
  for (const [k, text] of Object.entries(given)) {
    const [num, unit] = text.split(' ');
    g[k] = { x: q(num), unit: unit ?? P.varOf(f, k).unit };
  }
  return P.solve(f, target, g, ansUnit);
}
const eq = (x, s) => assert.equal(N.cmp(x, q(s)), 0, `${P.numText(x)} ≠ ${s}`);

test('電気：オームの法則・電力・電気代・電池', () => {
  eq(solve('ohm', 'I', { V: '100', R: '50' }).answer, '2');
  eq(solve('ohm', 'R', { V: '12', I: '200 mA' }).answer, '60');
  eq(solve('ohm', 'V', { I: '2', R: '1 kΩ' }, 'kV').answer, '2');
  const r = solve('powerR', 'I', { P: '100', R: '4' });
  eq(r.answer, '5');
  assert.equal(r.plus, true); // √ の答えは ＋ だけ
  eq(solve('powerV', 'R', { P: '60', V: '100' }).answer, '500/3');
  eq(solve('powerV', 'V', { P: '100', R: '100' }).answer, '100');
  // 1000W を 1日1時間、30日、31円/kWh → 930円
  eq(solve('bill', 'cost', { P: '1000 W', t: '1', days: '30', price: '31' }).answer, '930');
  eq(solve('bill', 'days', { cost: '930', P: '1000 W', t: '1', price: '31' }).answer, '30');
  eq(solve('bill', 't', { cost: '930', P: '500 W', days: '30', price: '31' }).answer, '2');
  // 3000mAh の電池を 500mA で → 6時間
  const c = solve('charge', 't', { Q: '3000', I: '500' });
  eq(c.answer, '6');
  assert.deepEqual(c.conv, ['3,000 mAh ＝ 10,800 C', '500 mA ＝ 0.5 A']);
  assert.equal(c.ansConv, '21,600 秒 ＝ 6 時間');
  eq(solve('energy', 'W', { P: '1000', t: '3' }, 'kWh').answer, '3');
});

test('電気：合成抵抗', () => {
  eq(solve('series', 'R', { R1: '30', R2: '20' }).answer, '50');
  eq(solve('series', 'R2', { R: '50', R1: '30' }).answer, '20');
  eq(solve('parallel', 'R', { R1: '30', R2: '60' }).answer, '20');
  eq(solve('parallel', 'R1', { R: '20', R2: '60' }).answer, '30');
  eq(solve('parallel', 'R', { R1: '1 kΩ', R2: '1 kΩ' }).answer, '500');
  assert.throws(() => solve('parallel', 'R1', { R: '60', R2: '60' }), /0 なので割れません/);
});

test('力と運動・エネルギー・熱・波', () => {
  // 100km を 2時間 → 50km/h（m/s を通っても正確）
  eq(solve('speed', 'v', { x: '100', t: '2' }).answer, '50');
  eq(solve('speed', 'v', { x: '100', t: '2' }, 'm/s').answer, '125/9');
  eq(solve('accel', 'v', { v0: '0', a: '2', t: '5' }).answer, '10');
  eq(solve('accel', 't', { v: '0', v0: '20', a: '−4' }).answer, '5');
  assert.throws(() => solve('accel', 't', { v: '10', v0: '0', a: '0' }), /加速度が 0/);
  eq(solve('accel2', 'v', { v0: '0', a: '2', x: '25' }).answer, '10');
  eq(solve('accel2', 'a', { v: '0', v0: '20', x: '40' }).answer, '−5');
  assert.throws(() => solve('accel2', 'v', { v0: '0', a: '−2', x: '25' }), /√ の中がマイナス/);
  eq(solve('newton', 'a', { F: '10', m: '2' }).answer, '5');
  eq(solve('weight', 'W', { m: '60', g: '9.8' }).answer, '588');
  eq(solve('pressure', 'p', { F: '100', S: '2' }).answer, '50');
  eq(solve('pressure', 'S', { p: '1', F: '101325' }).answer, '101325'); // 1 Pa の圧力
  eq(solve('density', 'V', { rho: '1', m: '500' }).answer, '500');
  eq(solve('work', 'W', { F: '10', x: '3' }).answer, '30');
  eq(solve('workPower', 'P', { W: '600', t: '60' }).answer, '10');
  eq(solve('kinetic', 'K', { m: '2', v: '3' }).answer, '9');
  eq(solve('kinetic', 'v', { K: '50', m: '1' }).answer, '10');
  eq(solve('potential', 'U', { m: '1', g: '9.8', h: '10' }).answer, '98');
  // 水 100g を 10℃ あたためる → 4200 J
  eq(solve('heat', 'Q', { m: '100', c: '4.2', dT: '10' }).answer, '4200');
  eq(solve('heat', 'dT', { Q: '4200', m: '100', c: '4.2' }).answer, '10');
  eq(solve('wave', 'lam', { v: '340', f: '170' }).answer, '2');
  eq(solve('period', 'T', { f: '50' }).answer, '1/50');
  eq(solve('period', 'f', { T: '0.02' }).answer, '50');
});

test('式の変形の書き方', () => {
  const form = (key, target) => P.formOf(F(key), target);
  assert.equal(form('ohm', 'I'), 'I ＝ V ÷ R');
  assert.equal(form('ohm', 'V'), 'V ＝ I × R');
  assert.equal(form('kinetic', 'v'), 'v ＝ √(2 × K ÷ m)');
  assert.equal(form('kinetic', 'K'), 'K ＝ m × v² ÷ 2');
  assert.equal(form('kinetic', 'm'), 'm ＝ 2 × K ÷ v²');
  assert.equal(form('potential', 'h'), 'h ＝ U ÷ (m × g)');
  assert.equal(form('period', 'f'), 'f ＝ 1 ÷ T');
  assert.equal(form('powerV', 'R'), 'R ＝ V² ÷ P');
  assert.equal(form('powerV', 'V'), 'V ＝ √(P × R)');
  assert.equal(form('pressure', 'S'), 'S ＝ F ÷ p');
  assert.equal(form('bill', 'P'), 'P ＝ 電気代 ÷ (t × 日数 × 単価)');
  assert.equal(form('parallel', 'R'), 'R ＝ R₁ × R₂ ÷ (R₁ ＋ R₂)');
  const r = solve('kinetic', 'v', { K: '50', m: '1' });
  assert.deepEqual(r.form, ['v² ＝ 2 × K ÷ m', 'v ＝ √(2 × K ÷ m)']);
  assert.equal(r.calc, '√(2 × 50 ÷ 1)');
  assert.equal(solve('accel', 'v', { v0: '−3', a: '2', t: '5' }).calc, '(−3) ＋ 2 × 5');
});

test('どの公式・どの量でも、解いて元の公式に入れると合う', () => {
  for (const f of P.FORMULAS) {
    // はじめの量（左の量）を、ほかの量から出す
    const given = {};
    f.vars.slice(1).forEach((v, i) => {
      given[v.key] = { x: v.preset ? q(v.preset) : q(String(i + 2)), unit: v.unit };
    });
    const first = P.solve(f, f.vars[0].key, given);
    assert.ok(P.verify(f, first.X).ok, `${f.name} の検算`);
    // ほかの量を、残りから出しても同じ
    for (const v of f.vars) {
      const g = Object.fromEntries(f.vars.filter((w) => w.key !== v.key).map((w) => [w.key, { x: first.X[w.key], unit: w.base }]));
      const r = P.solve(f, v.key, g, v.base);
      assert.ok(P.near(r.value, first.X[v.key]), `${f.name} の ${v.sym}：${P.numText(r.value)} ≠ ${P.numText(first.X[v.key])}`);
      assert.ok(P.verify(f, r.X).ok, `${f.name} の ${v.sym} の検算`);
    }
  }
});

test('足りない量・マイナスの注意', () => {
  assert.deepEqual(solve('ohm', 'I', { V: '10' }), { missing: ['R'] });
  assert.deepEqual(solve('ohm', 'R', { V: '10', I: '−2' }).warn, ['R']);
  assert.deepEqual(solve('ohm', 'R', { V: '10', I: '2' }).warn, []);
  assert.throws(() => solve('ohm', 'I', { V: '10', R: '0' }), /抵抗が 0/);
  const v = P.verify(F('ohm'), { V: q('10'), I: q('2'), R: q('5') });
  assert.equal(v.ok, true);
  assert.equal(v.rightText, 'I × R ＝ 2 × 5');
  assert.equal(P.verify(F('ohm'), { V: q('10'), I: q('2'), R: q('6') }).ok, false);
});
