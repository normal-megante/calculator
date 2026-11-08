// お買い物の計算（js/shop.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import { toYen, lineOf, totalsOf, taxOf, amountOf, sumTerms, compareReceipt } from '../js/shop.js';
import { typeKey, tidy } from '../js/form.js';

const yen = (x) => {
  assert.equal(x.q, true);
  assert.equal(x.d, 1n, '円は整数のはず');
  return Number(x.n);
};
const item = (price, extra = {}) => ({ price, qty: '1', rate: 10, incl: false, disc: { type: 'none', value: '' }, ...extra });

test('1円未満の丸め方', () => {
  const x = N.parseDecimal('12.5');
  assert.equal(yen(toYen(x, 'floor')), 12);
  assert.equal(yen(toYen(x, 'round')), 13);
  assert.equal(yen(toYen(x, 'ceil')), 13);
  assert.equal(yen(toYen(N.parseDecimal('12.4'), 'round')), 12);
  assert.equal(yen(toYen(N.neg(x), 'floor')), -13);
  assert.equal(yen(toYen(N.neg(x), 'ceil')), -12);
  assert.equal(yen(toYen(N.frac(7n), 'floor')), 7);
});

test('品物1つ：個数と割引', () => {
  assert.equal(yen(lineOf(item('198', { qty: '3' })).amount), 594);
  // 個数が空なら 1個
  assert.equal(yen(lineOf(item('198', { qty: '' })).amount), 198);
  // 298円の20%引き = 238.4 → 238円（切り捨て）
  const d = lineOf(item('298', { disc: { type: 'pct', value: '20' } }));
  assert.equal(yen(d.amount), 238);
  assert.equal(N.cmp(d.raw, N.parseDecimal('238.4')), 0);
  assert.equal(yen(d.discount), 60);
  assert.equal(yen(lineOf(item('298', { disc: { type: 'pct', value: '20' } }), 'ceil').amount), 239);
  // 1個あたり30円引き × 2個
  assert.equal(yen(lineOf(item('150', { qty: '2', disc: { type: 'yen', value: '30' } })).amount), 240);
  // 値引きしすぎても 0 円
  assert.equal(yen(lineOf(item('50', { disc: { type: 'yen', value: '80' } })).amount), 0);
  // 半額
  assert.equal(yen(lineOf(item('199', { disc: { type: 'pct', value: '50' } })).amount), 99);
  // ガソリン：168.5円 × 32.45L = 5467.825 → 5467円
  assert.equal(yen(lineOf(item('168.5', { qty: '32.45' })).amount), 5467);
});

const sample = () => [
  item('198', { qty: '3', rate: 8 }), // 594
  item('105', { rate: 8 }), // 105 → 8% は 699 → 消費税 55.92 → 55
  item('1980', { rate: 10 }), // 1980 → 消費税 198
  item('330', { rate: 10, incl: true }), // 税込 330 → ふくまれる消費税 30
];

test('合計：税率ごとにまとめて消費税を出す（ふつう）', () => {
  const t = totalsOf(sample());
  assert.equal(t.groups.length, 2);
  const [g10, g8] = t.groups;
  assert.equal(g10.rate, 10);
  assert.equal(yen(g10.ex), 1980);
  assert.equal(yen(g10.exTax), 198);
  assert.equal(yen(g10.inc), 330);
  assert.equal(yen(g10.incTax), 30);
  assert.equal(yen(g10.total), 1980 + 198 + 330);
  assert.equal(yen(g8.ex), 699);
  assert.equal(yen(g8.exTax), 55);
  assert.equal(N.cmp(g8.exTaxRaw, N.parseDecimal('55.92')), 0);
  assert.equal(yen(t.total), 1980 + 198 + 330 + 699 + 55);
  assert.equal(yen(t.tax), 198 + 30 + 55);
  assert.equal(yen(t.body), yen(t.total) - yen(t.tax));
  assert.equal(t.count, 4);
  assert.equal(yen(t.pieces), 6);
  // 足し算の項を全部足すと合計になる
  const terms = sumTerms(t);
  assert.deepEqual(terms.map(yen), [594, 105, 1980, 330, 198, 55]);
  assert.equal(yen(terms.reduce((a, b) => N.add(a, b), N.ZERO)), yen(t.total));
});

test('合計：品物1つずつ消費税を出す', () => {
  // 594 → 47.52 → 47 / 105 → 8.4 → 8 / 1980 → 198 / 330（税込）→ 30
  const t = totalsOf(sample(), { way: 'each' });
  assert.equal(yen(t.total), 641 + 113 + 2178 + 330);
  assert.equal(yen(t.tax), 47 + 8 + 198 + 30);
  assert.equal(t.groups[1].exTaxRaw, null);
  assert.equal(yen(sumTerms(t).reduce((a, b) => N.add(a, b), N.ZERO)), yen(t.total));
  // 四捨五入だと 594 → 48 / 105 → 8
  assert.equal(yen(totalsOf(sample(), { way: 'each', mode: 'round' }).total), 642 + 113 + 2178 + 330);
});

test('合計：空のとき', () => {
  const t = totalsOf([]);
  assert.equal(yen(t.total), 0);
  assert.equal(t.groups.length, 0);
  assert.deepEqual(sumTerms(t), []);
});

test('レシートとくらべる', () => {
  // いまの計算（まとめて・切り捨て）と同じ
  const same = compareReceipt(sample(), N.frac(3262n));
  assert.equal(same[0].current, true);
  assert.equal(same[0].same, true);
  // 1つずつ・四捨五入 だと 3263円。それを打つと、その出し方が見つかる
  const r = compareReceipt(sample(), N.frac(3263n));
  assert.equal(r[0].same, false);
  const found = r.filter((x) => x.same).map((x) => `${x.way}/${x.mode}`);
  assert.ok(found.includes('each/round'), found.join(','));
  assert.equal(r.length, 6);
});

test('税込・税抜のかんたん計算', () => {
  const p = amountOf('1000');
  const ex = taxOf(p, 10, false);
  assert.equal(yen(ex.total), 1100);
  assert.equal(yen(ex.tax), 100);
  assert.equal(yen(taxOf(p, 8, false).total), 1080);
  // 税込 1000 円 → ふくまれる消費税 90.9… → 90 円、税抜 910 円
  const inc = taxOf(p, 10, true);
  assert.equal(yen(inc.tax), 90);
  assert.equal(yen(inc.body), 910);
  assert.equal(N.roundSig(inc.exact, 7).digits, '9090909');
  const inc8 = taxOf(p, 8, true);
  assert.equal(yen(inc8.tax), 74);
  assert.equal(yen(inc8.body), 926);
  // 四捨五入なら 90.9… → 91
  assert.equal(yen(taxOf(p, 10, true, 'round').tax), 91);
  // 税率なし
  assert.equal(yen(taxOf(p, 0, false).total), 1000);
  assert.equal(yen(taxOf(p, 0, true).tax), 0);
});

test('数字キーで欄を打つ（js/form.js）', () => {
  assert.equal(typeKey('', '1'), '1');
  assert.equal(typeKey('0', '5'), '5');
  assert.equal(typeKey('19', '8'), '198');
  assert.equal(typeKey('', '00'), null);
  assert.equal(typeKey('1', '00'), '100');
  assert.equal(typeKey('', '.'), '0.');
  assert.equal(typeKey('1.5', '.'), null);
  assert.equal(typeKey('1.5', '.', { maxDecimals: 0 }), null);
  assert.equal(typeKey('1.25', '5', { maxDecimals: 2 }), null);
  assert.equal(typeKey('198', 'back'), '19');
  assert.equal(typeKey('', 'back'), null);
  assert.equal(typeKey('198', 'clear'), '');
  // 欄をえらんだ直後は、入れかわる
  assert.equal(typeKey('198', '2', { fresh: true }), '2');
  assert.equal(typeKey('198', 'back', { fresh: true }), '19');
  assert.equal(typeKey('9'.repeat(12), '9'), null);
  assert.equal(typeKey('99', '9', { maxInt: 2 }), null);
  assert.equal(tidy('12.'), '12');
  assert.equal(tidy(''), '');
});

test('打った文字 → 数', () => {
  assert.equal(N.isZero(amountOf('')), true);
  assert.equal(N.isZero(amountOf('.')), true);
  assert.equal(yen(amountOf('120')), 120);
  assert.equal(amountOf('98.5').d, 2n);
});
