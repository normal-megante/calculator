// n進法（js/base.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import { evaluate as calcEvaluate } from '../js/calc.js';
import {
  parseDigits, toBase, formText, baseText, parseBaseText, terminates, groups,
  evaluate, preview, pressBase, places, divisionRows, fracRows, twosComplement, bitColumns, modParts,
  toCalcItems, exprText, subText,
} from '../js/base.js';

// 「FF + 1010_2」のような文字 → 部品の並び（数の後ろの _2 はその数の進法。なければ base）
const OPS = { '-': '−', '*': '×', '/': '÷' };
function items(text, base) {
  const out = [];
  for (const w of text.split(' ').filter(Boolean)) {
    const m = /^([0-9A-F.]+)(?:_(\d+))?$/.exec(w);
    if (m) out.push(...[...m[1]].map((d) => ({ d, b: m[2] ? Number(m[2]) : base })));
    else out.push(OPS[w] ?? w);
  }
  return out;
}
const run = (text, base = 10) => evaluate(items(text, base));
const q = (n, d = 1n) => N.frac(BigInt(n), BigInt(d));
const same = (a, b) => assert.equal(N.cmp(a, b), 0, `${N.serialize(a).n ?? ''} ≠ 期待した数`);
// キーを順に押す（押せなかったキーは refused に）
function typeAll(keys, base) {
  let st = { items: [], caret: 0 };
  const refused = [];
  for (const k of keys) {
    const next = pressBase(st, k, base);
    if (next && !next.error) st = next;
    else refused.push(k);
  }
  return { st, text: exprText(st.items), refused };
}

test('数の文字 ⇄ 数（位の大きさ × 数字）', () => {
  same(parseDigits('FF', 16), q(255));
  same(parseDigits('1011', 2), q(11));
  same(parseDigits('0.1', 2), q(1, 2));
  same(parseDigits('A.8', 16), q(21, 2));
  same(parseDigits('12', 3), q(5));
  assert.throws(() => parseDigits('2', 2), /2進法では使えません/);
  assert.deepEqual(toBase(q(255), 2), { neg: false, int: '11111111', frac: '', rep: '', cut: false });
  assert.deepEqual(toBase(q(-10), 16), { neg: true, int: 'A', frac: '', rep: '', cut: false });
  // 10進の 0.1 は、2進ではくり返す小数
  assert.deepEqual(toBase(q(1, 10), 2), { neg: false, int: '0', frac: '0', rep: '0011', cut: false });
  assert.deepEqual(toBase(q(1, 3), 3), { neg: false, int: '0', frac: '1', rep: '', cut: false });
  assert.deepEqual(toBase(q(1, 3), 10), { neg: false, int: '0', frac: '', rep: '3', cut: false });
  // くり返しがとても長いときは、とちゅうで切る
  assert.equal(toBase(q(1, 1009), 2, 64).cut, true);
  assert.equal(terminates(q(1, 10), 2), false);
  assert.equal(terminates(q(1, 8), 2), true);
  assert.equal(terminates(q(1, 6), 12), true);
});

test('区切りと文字の形、文字から数にもどす', () => {
  assert.deepEqual(groups('100000000', 2), ['1', '0000', '0000']);
  assert.deepEqual(groups('1234567', 10), ['1', '234', '567']);
  assert.equal(baseText(q(255), 2), '1111 1111');
  assert.equal(baseText(q(1234567), 10), '1,234,567');
  assert.equal(baseText(q(-266), 16), '−10A');
  assert.equal(baseText(q(1, 10), 2), '0.0(0011)');
  assert.equal(baseText(q(1, 10), 2, { sep: '' }), '0.0(0011)');
  assert.equal(subText(16), '₁₆');
  // いろいろな数・進法で、文字にして もどすと同じ数
  const values = [q(0), q(1), q(-1), q(255), q(1, 3), q(-22, 7), q(1, 10), q(123456789, 1000), q(5, 12), q(1, 97)];
  for (let base = 2; base <= 16; base++) {
    for (const x of values) {
      const t = toBase(x, base, 200);
      assert.equal(t.cut, false);
      same(parseBaseText(formText(t, base), base), x);
    }
  }
  // とちゅうで切った数は、そこまでの数
  const cut = toBase(q(1, 1009), 2, 64);
  const back = parseBaseText(formText(cut, 2), 2);
  assert.ok(N.cmp(N.absNum(N.sub(back, q(1, 1009))), q(1n, 2n ** 64n)) < 0);
});

test('計算：＋ − × ÷ mod と、進法のまざった式', () => {
  same(run('FF + 1', 16).value, q(256));
  same(run('FF_16 + 1010_2').value, q(265));
  same(run('111 / 10', 2).value, q(7, 2)); // 7 ÷ 2 ＝ 3.5 ＝ 11.1₂
  assert.equal(baseText(run('111 / 10', 2).value, 2), '11.1');
  same(run('1 / 3', 10).value, q(1, 3));
  same(run('2 + 3 * 4').value, q(14));
  same(run('( 2 + 3 ) * 4').value, q(20));
  same(run('- 5 * 3').value, q(-15));
  same(run('7 mod 3').value, q(1));
  same(run('- 7 mod 3').value, q(2)); // 答えは割る数と同じ向き
  same(run('7 mod - 3').value, q(-2));
  same(run('7.5 mod 2').value, q(3, 2));
  assert.deepEqual(modParts(q(-7), q(3)), { q: q(-3), r: q(2) });
  // 閉じていない ( は、おしまいで閉じる
  same(run('( 1 + 2').value, q(3));
});

test('計算：AND・OR・XOR・NOT・シフトと計算の順番', () => {
  same(run('1100 and 1010', 2).value, q(8));
  same(run('1100 or 1010', 2).value, q(14));
  same(run('1100 xor 1010', 2).value, q(6));
  same(run('not 5').value, q(-6));
  same(run('not - 6').value, q(5));
  same(run('1 << 4').value, q(16));
  same(run('- 5 >> 1').value, q(-3)); // 切り捨ては小さいほうへ
  same(run('- 1 and FF', 16).value, q(255)); // マイナスは 2の補数
  // 順番：× ÷ mod → ＋ − → << >> → AND → XOR → OR
  same(run('1 + 2 << 1').value, q(6));
  same(run('1 or 2 and 3').value, q(3));
  same(run('6 xor 3 and 1').value, q(7));
  same(run('not 0 and 255').value, q(255));
  same(run('2 * 3 << 1 + 1').value, q(24));
  // 計算した順番
  const r = run('1100 and 1010 or 1', 2);
  assert.deepEqual(r.steps.map((s) => s.op), ['and', 'or']);
  assert.equal(r.steps[1].aFrom, 0);
  assert.equal(r.literals.length, 3);
});

test('計算できないとき・注意書き', () => {
  const err = (text, re, kind = 'math') => assert.throws(() => run(text), (e) => e instanceof N.CalcError && re.test(e.message) && e.kind === kind);
  err('1.5 and 1', /AND は、整数だけ/);
  err('1 / 0', /0 では割れません/);
  err('1 mod 0', /あまりは出せません/);
  err('1 << - 1', /ずらす数は/);
  err('1 << 5000', /ずらす数は/);
  err('( 1 << 4000 ) * ( 1 << 4000 ) * ( 1 << 4000 )', /大きすぎ/);
  err('1 +', /途中/, 'incomplete');
  err('( )', /中に数がありません/, 'syntax');
  const kinds = (text) => run(text).notes.map((n) => n.kind);
  assert.deepEqual(kinds('1 + 2 and 3'), ['order']);
  assert.deepEqual(kinds('1 + 2 * 3'), []);
  assert.deepEqual(kinds('5 >> 1'), ['shiftLost']);
  assert.deepEqual(kinds('4 >> 1'), []);
  assert.deepEqual(kinds('7 / 2'), ['div']);
  assert.deepEqual(kinds('not 5'), ['not']);
  assert.deepEqual(kinds('- 7 mod 3'), ['modSign']);
  // ＝ を押す前の答え
  same(preview(items('FF +', 16)).value, q(255));
  same(preview(items('1 + ( 2 * (', 10)).value, q(3)); // おしまいの「× (」を外して「1 + (2」
  assert.deepEqual(preview(items('1 / 0', 10)), { error: '0 では割れません' });
  same(preview(items('1 + +', 10)).value, q(1));
  assert.equal(preview(items('1 )', 10)), null); // 形がちがう式は、答えを出さない
});

test('キーの押し方', () => {
  // 2進では 2〜F は打てない（お知らせ）
  assert.match(pressBase({ items: [], caret: 0 }, '2', 2).error, /2進法では使えません/);
  assert.match(pressBase({ items: [], caret: 0 }, 'A', 10).error, /0〜9/);
  // 先頭の 0 は置きかえ、小数点は 0. から
  assert.equal(typeAll(['0', '5'], 10).text, '5');
  assert.equal(typeAll(['.', '1'], 2).text, '0.1₂');
  assert.deepEqual(typeAll(['1', '.', '.'], 10).refused, ['.']);
  // 演算子の連打は置きかえ、− はマイナスの数
  assert.equal(typeAll(['5', '+', '×', '3'], 10).text, '5 × 3');
  assert.equal(typeAll(['5', '×', '−', '3'], 10).text, '5 × −3');
  assert.deepEqual(typeAll(['5', '×', '−', '+'], 10).refused, ['+']);
  assert.equal(typeAll(['−', '5'], 10).text, '−5');
  assert.deepEqual(typeAll(['+'], 10).refused, ['+']);
  // ) は ( が開いているときだけ。NOT・( は数のすぐ後ろには打てない
  assert.deepEqual(typeAll([')', '(', '1', ')', ')'], 10).refused, [')', ')']);
  assert.deepEqual(typeAll(['1', 'not', '('], 10).refused, ['not', '(']);
  assert.equal(typeAll(['not', '(', '1', 'and', '3'], 10).text, 'NOT (1 AND 3)');
  // ちがう進法の数の続きは打てない（お知らせ）
  const hex = typeAll(['F', 'F'], 16).st;
  assert.match(pressBase(hex, '1', 2).error, /ここは 16進の数です/);
  const mixed = pressBase(pressBase(hex, '+', 2), '1', 2);
  assert.equal(exprText(mixed.items), 'FF₁₆ + 1₂');
  // 64桁まで
  const long = typeAll(Array(64).fill('1'), 2).st;
  assert.match(pressBase(long, '1', 2).error, /64桁まで/);
  // ⌫ ◀ ▶ AC
  assert.equal(pressBase({ items: [], caret: 0 }, 'back', 10), null);
  assert.deepEqual(pressBase(hex, 'left', 16).caret, 1);
  assert.deepEqual(pressBase(hex, 'clear', 16), { items: [], caret: 0 });
});

test('検算に使う形（位・割り算のあまり・小数×進法・2の補数・ビットの表）', () => {
  assert.deepEqual(places('1A.8').map((p) => [p.v, p.p]), [[1, 1], [10, 0], [8, -1]]);
  // 266 を 16 で割っていく → あまりを下から読むと 10A
  assert.deepEqual(divisionRows(266n, 16).map((r) => [r.n, r.q, r.r]), [[266n, 16n, 10], [16n, 1n, 0], [1n, 0n, 1]]);
  assert.deepEqual(divisionRows(0n, 2).map((r) => r.r), [0]);
  // 0.375 × 2 → 0, 1, 1（0.011₂）
  const f = fracRows(q(3, 8), 2);
  assert.deepEqual(f.rows.map((r) => r.d), [0, 1, 1]);
  assert.equal(f.repeatAt, -1);
  // 0.1 × 2 → 0, 0, 0, 1, 1, 0, 0, 1, 1 …（0.2 にもどったら くり返し）
  const g = fracRows(q(1, 10), 2);
  assert.deepEqual(g.rows.map((r) => r.d), [0, 0, 0, 1, 1]);
  assert.equal(g.repeatAt, 1);
  assert.equal(fracRows(q(1, 1009), 2, 12).cut, true);
  assert.deepEqual(twosComplement(-1n), { width: 8, u: 255n, bits: '11111111', hex: 'FF' });
  assert.equal(twosComplement(-128n).width, 8);
  assert.equal(twosComplement(-129n).width, 16);
  assert.equal(twosComplement(-(2n ** 70n)).width, 128);
  assert.deepEqual(bitColumns([12n, 10n, 8n]), { width: 4, neg: false, bits: ['1100', '1010', '1000'] });
  assert.deepEqual(bitColumns([5n, -6n]), { width: 4, neg: true, bits: ['0101', '1010'] });
});

test('履歴・電卓へ：電卓で計算しても同じ答え', () => {
  for (const [text, base] of [['FF_16 + 1010_2 * ( 3 - 1 )', 10], ['- 1F / 4', 16], ['0.1 + 0.01', 2], ['12.5 * 2', 10]]) {
    const list = items(text, base);
    const calcItems = toCalcItems(list);
    assert.ok(calcItems, text);
    same(calcEvaluate(calcItems).value, evaluate(list).value);
  }
  assert.equal(toCalcItems(items('1100 and 1010', 2)), null);
  assert.equal(toCalcItems(items('7 mod 2', 10)), null);
  assert.equal(toCalcItems(items('not 1', 10)), null);
  assert.equal(exprText(items('1100 and ( 1010_2 or F_16 ) << 1', 2)), '1100₂ AND (1010₂ OR F₁₆) << 1₂');
  assert.equal(exprText(items('- 5 * - 3', 10)), '−5 × −3');
});
