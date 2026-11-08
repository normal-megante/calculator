// 割り勘の計算（js/split.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import { splitOf, roundUnit, summaryText, groupName } from '../js/split.js';

const yen = (x) => {
  assert.equal(x.q, true);
  assert.equal(x.d, 1n, '円は整数のはず');
  return Number(x.n);
};
const g = (id, count, extra = {}) => ({ id, name: '', count: String(count), fixed: false, mult: '', plus: '', minus: false, amount: '', ...extra });
const pays = (r) => r.rows.map((x) => yen(x.pay));

// ちょうどの額 × 人数 を足すと、合計にもどる（逆算）
function assertExact(r) {
  assert.equal(r.ok, true, r.error);
  assert.equal(N.cmp(r.exactSum, r.total), 0, 'ちょうどの額を足すと合計になるはず');
  assert.equal(N.cmp(N.sub(r.collected, r.total), r.diff), 0);
}

test('単位で丸める', () => {
  const x = N.frac(10000n, 3n); // 3333.33…
  assert.equal(yen(roundUnit(x, 100, 'up')), 3400);
  assert.equal(yen(roundUnit(x, 100, 'down')), 3300);
  assert.equal(yen(roundUnit(x, 1, 'up')), 3334);
  assert.equal(yen(roundUnit(x, 500, 'up')), 3500);
  assert.equal(yen(roundUnit(N.frac(3350n), 100, 'near')), 3400);
  assert.equal(yen(roundUnit(N.frac(3349n), 100, 'near')), 3300);
  assert.equal(yen(roundUnit(N.frac(3300n), 100, 'up')), 3300);
});

test('みんな同じ（30,000円を9人）', () => {
  const input = { total: '30000', groups: [g(1, 9)] };
  const up = splitOf(input, { unit: 100, how: 'up' });
  assertExact(up);
  assert.equal(N.roundSig(up.rows[0].exact, 6).digits, '333333');
  assert.deepEqual(pays(up), [3400]);
  assert.equal(yen(up.collected), 30600);
  assert.equal(yen(up.diff), 600);
  const one = splitOf(input, { unit: 1, how: 'up' });
  assert.deepEqual(pays(one), [3334]);
  assert.equal(yen(one.diff), 6);
  const down = splitOf(input, { unit: 1, how: 'down' });
  assert.deepEqual(pays(down), [3333]);
  assert.equal(yen(down.diff), -3);
  assert.equal(groupName({ name: '' }, 0, 1), 'みんな');
});

test('倍率と＋円（お酒を飲んだ人は1.5倍、先輩は＋2,000円）', () => {
  const input = {
    total: '30000',
    groups: [g(1, 4, { name: '飲む人', mult: '1.5' }), g(2, 4, { name: '飲まない人' }), g(3, 1, { name: '先輩', plus: '2000' })],
  };
  const r = splitOf(input, { unit: 100, how: 'up' });
  assertExact(r);
  // 残り 28,000 ÷（1.5×4 ＋ 1×4 ＋ 1×1 ＝ 11）＝ 2,545.45…
  assert.equal(yen(r.rest), 28000);
  assert.equal(N.cmp(r.weight, N.frac(11n)), 0);
  assert.equal(N.cmp(r.perWeight, N.frac(28000n, 11n)), 0);
  assert.equal(N.cmp(r.rows[2].exact, N.add(N.frac(28000n, 11n), N.frac(2000n))), 0);
  assert.deepEqual(pays(r), [3900, 2600, 4600]);
  assert.equal(yen(r.collected), 3900 * 4 + 2600 * 4 + 4600);
});

test('−円（早く帰った人は1,000円引き）', () => {
  const r = splitOf({ total: '10000', groups: [g(1, 3), g(2, 1, { plus: '1000', minus: true })] }, { unit: 1, how: 'up' });
  assertExact(r);
  assert.deepEqual(pays(r), [2750, 1750]);
  assert.equal(yen(r.diff), 0);
});

test('金額指定（子どもは1人1,000円）', () => {
  const r = splitOf({ total: '10000', groups: [g(1, 3), g(2, 2, { fixed: true, amount: '1000' })] }, { unit: 1, how: 'up' });
  assertExact(r);
  assert.deepEqual(pays(r), [2667, 1000]);
  assert.equal(yen(r.diff), 1);
  // 全員が金額指定で、ぴったり
  const all = splitOf({ total: '3000', groups: [g(1, 3, { fixed: true, amount: '1000' })] });
  assertExact(all);
  // 全員が金額指定で、合わない
  const bad = splitOf({ total: '3500', groups: [g(1, 3, { fixed: true, amount: '1000' })] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /倍率で分ける人がいません/);
});

test('一部の人だけで払う物（お酒 8,000円は飲む人だけ）', () => {
  const input = {
    total: '30000',
    groups: [g(1, 4, { name: '飲む人' }), g(2, 4, { name: '飲まない人' })],
    parts: [{ id: 1, name: 'お酒', amount: '8000', members: [1] }],
  };
  const r = splitOf(input, { unit: 100, how: 'up' });
  assertExact(r);
  // 残り 22,000 ÷ 8人 ＝ 2,750。飲む人は ＋2,000
  assert.equal(N.cmp(r.rows[0].exact, N.frac(4750n)), 0);
  assert.equal(N.cmp(r.rows[1].exact, N.frac(2750n)), 0);
  assert.deepEqual(pays(r), [4800, 2800]);
  assert.equal(yen(r.parts[0].share), 2000);
  // 払う人をえらんでいない
  const none = splitOf({ ...input, parts: [{ id: 1, name: 'お酒', amount: '8000', members: [] }] });
  assert.equal(none.ok, false);
  assert.match(none.error, /お酒/);
  // 払う物が合計より大きい
  const big = splitOf({ ...input, parts: [{ id: 1, name: 'お酒', amount: '40000', members: [1] }] });
  assert.equal(big.ok, false);
});

test('幹事がぴったりに合わせる', () => {
  // 10,000円を3人、100円単位：2人は 3,300円、幹事は 3,400円
  const r = splitOf({ total: '10000', groups: [g(1, 3)] }, { unit: 100, how: 'payer', payer: 1 });
  assertExact(r);
  assert.equal(yen(r.payer.pay), 3400);
  assert.deepEqual(pays(r), [3300]);
  assert.equal(yen(r.collected), 10000);
  assert.equal(yen(r.diff), 0);
  // 幹事の組が見つからなければ、最初の組
  const r2 = splitOf({ total: '10000', groups: [g(1, 2, { fixed: true, amount: '1000' }), g(2, 4)] }, { unit: 1000, how: 'payer', payer: 99 });
  assertExact(r2);
  assert.equal(r2.payer.row.id, 2);
  // 4人で 8,000 → 1人 2,000 ちょうど
  assert.equal(yen(r2.payer.pay), 2000);
});

test('計算できないとき', () => {
  assert.match(splitOf({ total: '', groups: [g(1, 3)] }).error, /合計/);
  assert.match(splitOf({ total: '1000', groups: [g(1, 0)] }).error, /人数/);
  assert.match(splitOf({ total: '1000', groups: [g(1, 1), g(2, 1, { plus: '5000', minus: true })] }).error, /マイナス/);
  assert.match(splitOf({ total: '1000', groups: [g(1, 1, { plus: '5000' })] }).error, /大きく/);
});

test('結果の文（コピー用）', () => {
  const r = splitOf({ total: '10000', groups: [g(1, 3, { name: '大人' }), g(2, 1, { name: '子ども', fixed: true, amount: '1000' })] }, { unit: 100, how: 'up' });
  const text = summaryText(r);
  assert.match(text, /合計 10,000円・4人/);
  assert.match(text, /大人 3人：1人 3,000円/);
  assert.match(text, /子ども 1人：1人 1,000円/);
  assert.match(text, /集まるお金 10,000円（ぴったり）/);
  const p = splitOf({ total: '10000', groups: [g(1, 3)] }, { unit: 100, how: 'payer', payer: 1 });
  assert.match(summaryText(p), /1人 3,300円（幹事1人は 3,400円）/);
});
