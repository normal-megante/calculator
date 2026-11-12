// 単位の変換（js/unit.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import {
  CATS, catByKey, unitOf, baseUnit, convert, convertAll, toBase, fromBase, valueText, plainDecimal, factorText,
  factorLabel, sameValue, dmsText,
} from '../js/unit.js';

const d = (t) => N.parseDecimal(t);
const eq = (a, b, msg) => assert.equal(N.cmp(a, b), 0, msg ?? `${JSON.stringify(N.serialize(a))} と ${JSON.stringify(N.serialize(b))}`);
const conv = (cat, a, b, x) => convert(catByKey(cat), a, b, typeof x === 'string' ? d(x) : x);

test('種類と単位のそろい方', () => {
  for (const c of CATS) {
    const keys = c.units.map((u) => u.key);
    assert.equal(new Set(keys).size, keys.length, `${c.name} の key が重なっている`);
    assert.ok(baseUnit(c), `${c.name} の基準の単位`);
    assert.ok(unitOf(c, c.from) && unitOf(c, c.to) && c.from !== c.to, `${c.name} の最初の単位`);
    for (const u of c.units) assert.ok(u.affine || N.sign(u.inv ?? u.f) > 0, `${u.sym} の大きさ`);
  }
});

test('天文の長さ・小さい長さ・磁場', () => {
  eq(conv('len', 'au', 'km', '1'), d('149597870.7'));
  eq(conv('len', 'ly', 'km', '1'), d('9460730472580.8'));
  eq(conv('len', 'ly', 'au', '1'), N.div(d('9460730472580800'), d('149597870700')));
  assert.equal(valueText(conv('len', 'pc', 'ly', '1')).text, '3.26156377717…');
  assert.equal(valueText(conv('len', 'pc', 'au', '1')).text, '206,264.806247…');
  eq(conv('len', 'nm', 'um', '1000'), N.ONE);
  eq(conv('len', 'um', 'mm', '1000'), N.ONE);
  eq(conv('mag', 'T', 'G', '1'), d('10000'));
  eq(conv('mag', 'mT', 'G', '1'), d('10'));
  eq(conv('mag', 'uT', 'nT', '1'), d('1000'));
});

test('時間・力・仕事率・周波数・電気量・密度・放射線', () => {
  eq(conv('time', 'day', 's', '1'), d('86400'));
  eq(conv('time', 'year', 'day', '1'), d('365'));
  eq(conv('time', 's', 'day', '1000000'), N.div(d('1000000'), d('86400')));
  eq(conv('force', 'kgf', 'N', '1'), d('9.80665'));
  eq(conv('force', 'N', 'dyn', '1'), d('100000'));
  eq(conv('power', 'PS', 'W', '100'), d('73549.875'));
  eq(conv('power', 'kcalh', 'W', '3600'), d('4184'));
  assert.equal(valueText(conv('power', 'HP', 'PS', '1')).text, '1.01386966542…');
  eq(conv('freq', 'rpm', 'Hz', '3000'), d('50'));
  eq(conv('freq', 'GHz', 'MHz', '2.4'), d('2400'));
  eq(conv('charge', 'mAh', 'C', '1000'), d('3600'));
  eq(conv('charge', 'C', 'e', '1.602176634'), N.frac(N.pow10(19)));
  eq(conv('density', 'gcm3', 'kgm3', '1'), d('1000'));
  eq(conv('dose', 'mSv', 'uSv', '1'), d('1000'));
  eq(conv('dose', 'rem', 'mSv', '1'), d('10'));
  eq(conv('activity', 'Ci', 'GBq', '1'), d('37'));
});

test('燃費（L/100km は割り算で変換）', () => {
  eq(conv('fuel', 'kmL', 'l100', '20'), d('5'));
  eq(conv('fuel', 'l100', 'kmL', '5'), d('20'));
  eq(conv('fuel', 'l100', 'l100', '7.3'), d('7.3'));
  assert.equal(valueText(conv('fuel', 'kmL', 'mpg', '10')).text, '23.5214583333…');
  assert.equal(valueText(conv('fuel', 'mpg', 'l100', '30')).text, '7.84048611111…');
  const fuel = catByKey('fuel');
  assert.ok(convertAll(fuel, 'kmL', N.ZERO).error);
  assert.ok(convertAll(fuel, 'l100', d('-1')).error);
  assert.ok(!convertAll(fuel, 'l100', d('5')).error);
});

test('長さ・重さ', () => {
  eq(conv('len', 'in', 'cm', '1'), d('2.54'));
  eq(conv('len', 'ft', 'cm', '1'), d('30.48'));
  eq(conv('len', 'mi', 'km', '1'), d('1.609344'));
  eq(conv('len', 'ken', 'shaku', '1'), d('6'));
  eq(conv('len', 'shaku', 'sun', '1'), d('10'));
  assert.equal(valueText(conv('len', 'cm', 'in', '1')).text, '0.393700787402…');
  eq(conv('mass', 'lb', 'kg', '1'), d('0.45359237'));
  eq(conv('mass', 'lb', 'oz', '1'), d('16'));
  eq(conv('mass', 'kan', 'monme', '1'), d('1000'));
  eq(conv('mass', 'kin', 'monme', '1'), d('160'));
  assert.equal(valueText(conv('mass', 'kg', 'lb', '1')).text, '2.20462262185…');
});

test('面積：坪・畳', () => {
  eq(conv('area', 'tsubo', 'm2', '1'), N.frac(400n, 121n));
  eq(conv('area', 'jo', 'tsubo', '6'), d('2.9403'));   // 6畳 ＝ 9.72m² ＝ 2.9403坪
  eq(conv('area', 'tan', 'tsubo', '1'), d('300'));
  eq(conv('area', 'ha', 'a', '1'), d('100'));
  eq(conv('area', 'ac', 'ft2', '1'), d('43560'));
  assert.equal(valueText(conv('area', 'tsubo', 'm2', '1')).text, '3.30578512397…');
});

test('体積：合・升・カップ', () => {
  eq(conv('vol', 'sho', 'go', '1'), d('10'));
  eq(conv('vol', 'sho', 'L', '1'), N.frac(2401n, 1331n));
  assert.equal(valueText(conv('vol', 'go', 'mL', '1')).text, '180.390683696…');
  eq(conv('vol', 'cup', 'tbsp', '1'), N.frac(40n, 3n));
  eq(conv('vol', 'gal', 'floz', '1'), d('128'));
  eq(conv('vol', 'gal', 'uscup', '1'), d('16'));
});

test('温度（足し引きもある変換）', () => {
  eq(conv('temp', 'c', 'f', '100'), d('212'));
  eq(conv('temp', 'c', 'f', N.neg(d('40'))), N.neg(d('40')));
  eq(conv('temp', 'f', 'c', '98.6'), d('37'));
  eq(conv('temp', 'k', 'c', '0'), N.neg(d('273.15')));
  eq(conv('temp', 'c', 'k', '25'), d('298.15'));
  const cat = catByKey('temp');
  assert.match(convertAll(cat, 'c', N.neg(d('300'))).error, /絶対零度/);
  assert.match(convertAll(cat, 'k', N.neg(d('0.01'))).error, /絶対零度/);
  assert.equal(convertAll(cat, 'k', d('0')).error, undefined);
});

test('速さ・データ・エネルギー・圧力', () => {
  eq(conv('speed', 'kmh', 'ms', '36'), d('10'));
  eq(conv('speed', 'kn', 'kmh', '1'), d('1.852'));
  eq(conv('speed', 'mph', 'kmh', '1'), d('1.609344'));
  eq(conv('data', 'B', 'bit', '1'), d('8'));
  eq(conv('data', 'GiB', 'MiB', '1'), d('1024'));
  assert.equal(valueText(conv('data', 'GB', 'GiB', '1')).text, '0.931322574615…');
  eq(conv('data', 'TB', 'bit', '1'), d('8000000000000'));
  eq(conv('energy', 'kcal', 'kJ', '1'), d('4.184'));
  eq(conv('energy', 'kWh', 'kJ', '1'), d('3600'));
  eq(conv('press', 'atm', 'hPa', '1'), d('1013.25'));
  eq(conv('press', 'mmHg', 'atm', '760'), N.ONE);
  assert.equal(valueText(conv('press', 'psi', 'kPa', '1')).text, '6.89475729317…');
});

test('どの単位からどの単位へも、もどすと元の数（ぴったり）', () => {
  const xs = [d('1'), d('0.001'), d('123456.789'), N.frac(1n, 3n)];
  for (const c of CATS) {
    for (const a of c.units) {
      for (const b of c.units) {
        for (const x of xs) {
          const y = convert(c, a.key, b.key, x);
          eq(convert(c, b.key, a.key, y), x, `${c.name} ${a.sym}→${b.sym}`);
        }
      }
    }
  }
  // 基準の単位を通しても同じ
  const area = catByKey('area');
  const jo = unitOf(area, 'jo');
  eq(fromBase(jo, toBase(jo, d('6'))), d('6'));
});

test('全部の単位にいっぺんに', () => {
  const r = convertAll(catByKey('len'), 'in', d('10'));
  eq(r.base, d('0.254'));
  eq(r.values.get('cm'), d('25.4'));
  eq(r.values.get('in'), d('10'));
  assert.equal(r.values.size, catByKey('len').units.length);
});

test('表示の形', () => {
  assert.deepEqual(plainDecimal(d('2.54')), { text: '2.54', neg: false });
  assert.deepEqual(plainDecimal(N.frac(1n, 20n)), { text: '0.05', neg: false });
  assert.deepEqual(plainDecimal(N.neg(d('0.5'))), { text: '0.5', neg: true });
  assert.deepEqual(plainDecimal(d('123')), { text: '123', neg: false });
  assert.equal(plainDecimal(N.frac(1n, 3n)), null);
  assert.equal(plainDecimal(d('0.000000001')), null);                 // 小数が 8 桁より長い
  assert.equal(plainDecimal(d('1234567890123')), null);               // 整数が 12 桁より長い
  assert.equal(factorText(d('0.0254')), '0.0254');
  assert.equal(factorText(d('3600000')), '3,600,000');
  assert.equal(factorText(N.frac(400n, 121n)), '400/121');
  assert.equal(valueText(d('2.9403')).text, '2.9403');
  assert.equal(valueText(N.frac(1n, 3n)).text, '0.333333333333…');
});

test('角度：度・ラジアン・π rad・回転・分・秒・度分秒', () => {
  eq(conv('angle', 'pirad', 'deg', '0.5'), d('90'));        // π/2 rad ＝ 90度（ぴったり）
  eq(conv('angle', 'deg', 'pirad', '45'), d('0.25'));
  eq(conv('angle', 'deg', 'pirad', '60'), N.frac(1n, 3n));  // 60度 ＝ π/3 rad
  eq(conv('angle', 'turn', 'amin', '1'), d('21600'));
  eq(conv('angle', 'grad', 'deg', '100'), d('90'));
  eq(conv('angle', 'asec', 'amin', '90'), d('1.5'));
  // rad は π を使うので概数（50桁）
  const deg = conv('angle', 'rad', 'deg', '1');
  assert.equal(deg.q, false);
  assert.equal(valueText(deg, 50).text, '57.295779513082320876798154814105170332405472466564…');
  assert.equal(valueText(conv('angle', 'deg', 'rad', '180'), 50).text, '3.1415926535897932384626433832795028841971693993751…');
  assert.ok(sameValue(conv('angle', 'deg', 'rad', conv('angle', 'rad', 'deg', '2')), d('2')));
  assert.ok(!sameValue(d('1'), d('1.0000001')));
  assert.equal(factorLabel(catByKey('angle').units.find((u) => u.key === 'rad')), '180/π');
  // 度分秒
  assert.equal(dmsText(d('12.5')), '12°30′00″');
  assert.equal(dmsText(d('0.0125')), '0°00′45″');
  assert.equal(dmsText(N.neg(d('0.5'))), '−0°30′00″');
  assert.equal(dmsText(d('359.99999')), '約 359°59′59.96″');
  assert.equal(dmsText(d('359.999999999')), '約 360°00′00″');   // 四捨五入で繰り上がる
  assert.equal(dmsText(deg), '約 57°17′44.81″');
  assert.equal(dmsText(d('1000000000')), null);
});
