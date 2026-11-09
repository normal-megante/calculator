// 複素数（js/complex.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/num.js';
import * as S from '../js/sci.js';
import {
  cx, C_I, add, mul, div, pow, sqrt, exp, ln, abs, argTurn, fromPolar, near, isZero,
  evaluate, preview, pressComplex, rectText, polarText, expText, angleText, serItems, deserItems, FN_TOKENS,
} from '../js/complex.js';

// 「(3+4i)*(1-2i)」のような文字 → 部品の並び（- * / は − × ÷ に。√( abs( などは1つの部品）
function items(text) {
  const out = [];
  for (let i = 0; i < text.length;) {
    const fn = FN_TOKENS.find((f) => text.startsWith(f, i));
    if (fn) {
      out.push(fn);
      i += fn.length;
      continue;
    }
    const c = text[i++];
    out.push({ '-': '−', '*': '×', '/': '÷', p: 'π' }[c] ?? c);
  }
  return out;
}
const run = (text, angle = 'deg') => evaluate(items(text), { angle });
const q = (n, d = 1n) => N.frac(BigInt(n), BigInt(d));
const z = (re, im = 0) => cx(typeof re === 'object' ? re : q(re), typeof im === 'object' ? im : q(im));
// ちょうど同じ（正確な数）
function same(a, b) {
  assert.ok(N.cmp(a.re, b.re) === 0 && N.cmp(a.im, b.im) === 0, `${rectText(a, 20)} ≠ ${rectText(b, 20)}`);
}
// ほぼ同じ（概数）
function close(a, b) {
  assert.ok(near(a, b), `${rectText(a, 20)} ≈ ${rectText(b, 20)} ではありません`);
}
const exact = (a) => assert.ok(a.re.q && a.im.q, `${rectText(a, 20)} が正確な数ではありません`);

test('＋ − × ÷ と整数乗は正確', () => {
  same(run('(3+4i)(1-2i)').value, z(11, -2));
  same(run('(3+4i)/(1-2i)').value, z(-1, 2));
  same(run('i^2').value, z(-1));
  same(run('i^3').value, z(0, -1));
  same(run('i^4').value, z(1));
  same(run('(1+i)^2').value, z(0, 2));
  same(run('(1+i)^-1').value, z(q(1, 2), q(-1, 2)));
  same(run('1/i').value, z(0, -1));
  same(run('2-3i-(4+i)').value, z(-2, -4));
  same(run('-i*i').value, z(1));
  same(run('(2+i)^10').value, z(-237, -3116));
  exact(run('(1+2i)^-3').value);
  same(mul(z(0, 1), z(0, 1)), z(-1));
  same(add(z(1, 2), z(3, -2)), z(4));
  assert.throws(() => div(z(1), z(0)), /0 では割れません/);
});

test('計算の順番：かけ算の省略・マイナス・累乗', () => {
  // 3＋4i のように「数を書いているだけ」は、計算の順番に入れない
  assert.equal(run('3+4i').steps.length, 0);
  assert.equal(run('-3-4i').steps.length, 0);
  assert.deepEqual(run('(3+4i)(1-2i)').steps.map((s) => [s.op, s.implicit]), [['×', true]]);
  assert.deepEqual(run('(3+4i)*(1-2i)+2').steps.map((s) => s.op), ['×', '+']);
  // かけ算の省略は ÷ より先（注意書き）
  same(run('1/2i').value, z(0, q(-1, 2)));
  assert.deepEqual(run('1/2i').notes.map((n) => n.kind), ['implicitDiv']);
  assert.deepEqual(run('1/(2i)').notes, []);
  // 累乗はマイナスより先、右から
  same(run('-i^2').value, z(1));
  same(run('2^2^3').value, z(256));
  same(run('2^3i').value, z(0, 8));
  same(run('2(1+i)').value, z(2, 2));
  // 閉じていない ( は、おしまいで閉じる
  same(run('(1+i').value, z(1, 1));
});

test('√・e^・ln（主値）', () => {
  same(run('√(3+4i)').value, z(2, 1));
  same(run('√(-4)').value, z(0, 2));
  same(run('√(-3-4i)').value, z(1, -2));
  same(run('√(-3+4i)').value, z(1, 2));
  const h = N.div(N.sqrt(q(2)), q(2));
  close(run('√(i)').value, cx(h, h));
  assert.deepEqual(run('√(-4)').notes.map((n) => n.kind), ['principal']);
  assert.deepEqual(run('√(4)').notes, []);
  // e^(iπ) ＝ −1（ちょうど）
  same(run('e^(ip)').value, z(-1));
  same(run('e^(ip/2)').value, z(0, 1));
  same(run('e^(0)').value, z(1));
  close(run('ln(-1)').value, cx(N.ZERO, S.PI));
  close(exp(ln(z(3, 4))), z(3, 4));
  same(ln(z(1)), z(0));
  assert.throws(() => run('ln(0)'), /0 の ln/);
  // 負の数の分数乗は主値（電卓の −2 とはちがう）
  const cube = run('(-8)^(1/3)');
  close(cube.value, cx(q(1), N.sqrt(q(3))));
  assert.deepEqual(cube.notes.map((n) => n.kind), ['principal', 'negPow']);
  same(cx(cube.value.re), z(1)); // 実部はちょうど 1
  same(run('(-1)^(1/2)').value, z(0, 1));
  close(run('√(i)^2').value, z(0, 1));
  close(run('(-2)^0.5').value, cx(N.ZERO, N.sqrt(q(2))));
  same(run('4^(1/2)').value, z(2));
  close(run('2^i').value, cx(S.cos(N.ln(q(2)), 'rad'), S.sin(N.ln(q(2)), 'rad')));
  same(pow(z(0), z(q(1, 2))), z(0));
  assert.throws(() => pow(z(0), z(-1)), /0 で割る/);
});

test('長さ・角度・極形式（∠）', () => {
  same(run('abs(3+4i)').value, z(5));
  same(run('conj(3+4i)').value, z(3, -4));
  same(run('Re(3+4i)').value, z(3));
  same(run('Im(3+4i)').value, z(4));
  same(run('arg(1+i)').value, z(45));
  same(run('arg(-1-i)').value, z(-135));
  same(run('arg(-1)').value, z(180));
  same(run('arg(1+i)', 'rad').value, z(N.div(S.PI, q(4))));
  same(run('arg(1+√(3)i)').value, z(60));
  close(run('arg(3+4i)').value, cx(S.atan(q(4, 3), 'deg')));
  assert.throws(() => run('arg(0)'), /0 の角度/);
  assert.deepEqual(argTurn(z(0, -2)), q(-1, 4));
  // 2∠30° ＝ √3 ＋ i
  const p = run('2∠30').value;
  close(p, cx(N.sqrt(q(3)), q(1)));
  same(cx(N.ZERO, p.im), z(0, 1));
  same(run('1∠90').value, z(0, 1));
  same(run('2∠180').value, z(-2));
  same(run('3∠-90').value, z(0, -3));
  same(run('2∠p/2', 'rad').value, z(0, 2));
  same(run('2∠90×2').value, z(-2)); // ∠ の右の × ÷ は角度に入る（2∠180）
  same(run('(2∠90)×2').value, z(0, 4));
  same(run('3×2∠90').value, z(0, 6));
  same(run('(2∠30)(3∠60)').value, z(0, 6));
  same(run('1∠90+1').value, z(1, 1));
  assert.ok(run('2∠30').notes.some((n) => n.kind === 'polar'));
  assert.throws(() => run('(1+i)∠30'), /実数/);
  same(fromPolar(q(2), q(1, 8)), cx(N.sqrt(q(2)), N.sqrt(q(2))));
  assert.equal(N.cmp(abs(z(-5)), q(5)), 0);
});

test('答えの書き方', () => {
  assert.equal(rectText(z(3, 4)), '3 + 4i');
  assert.equal(rectText(z(1, -1)), '1 − i');
  assert.equal(rectText(z(0, -1)), '−i');
  assert.equal(rectText(z(0, q(1, 2))), '0.5i');
  assert.equal(rectText(z(-2)), '−2');
  assert.equal(rectText(z(q(1, 3), 1)), '0.3333333333… + i');
  assert.equal(polarText(z(1, 1), 'deg'), '√2∠45°');
  assert.equal(polarText(z(1, 1), 'rad'), '√2∠π/4');
  assert.equal(polarText(z(-1, -1), 'rad'), '√2∠−3π/4');
  assert.equal(polarText(z(3, 4), 'deg'), '5∠53.13010235…°');
  assert.equal(polarText(z(-2), 'deg'), '2∠180°');
  assert.equal(polarText(z(11, -2), 'deg').split('∠')[0], '5√5');
  assert.equal(polarText(z(2, 2), 'rad'), '2√2∠π/4');
  assert.equal(polarText(z(q(1, 2), q(1, 2)), 'deg'), '√0.5∠45°');
  assert.equal(expText(z(1, 1)), '√2e^(iπ/4)');
  assert.equal(expText(z(-1)), 'e^(iπ)');
  assert.equal(expText(z(0, -3)), '3e^(−iπ/2)');
  assert.equal(expText(z(2)), '2');
  assert.equal(expText(z(3, 4)), '5e^(0.927295218…i)');
  assert.equal(angleText(q(1, 12), 'deg'), '30°');
  assert.equal(rectText(run('e^(ip)').value), '−1');
  // 概数でも、短い数とほぼ同じなら … を付けない（√3 ＋ i の長さ ＝ 2）
  assert.equal(polarText(run('2∠30').value, 'deg'), '2∠30°');
  assert.equal(rectText(run('2∠30').value), '1.732050808… + i');
});

test('＝ を押す前の答えと、まちがった式', () => {
  same(preview(items('3+4i×')).value, z(3, 4));
  same(preview(items('2+√(')).value, z(2));
  assert.deepEqual(preview(items('1/0')), { error: '0 では割れません' });
  assert.equal(preview(items('1)')), null);
  assert.throws(() => run('1+'), (e) => e.kind === 'incomplete');
  assert.throws(() => run('()'), /中に数がありません/);
});

test('キーの押し方', () => {
  const typeAll = (keys) => {
    let st = { items: [], caret: 0 };
    const refused = [];
    for (const k of keys) {
      const next = pressComplex(st, k);
      if (next) st = next;
      else refused.push(k);
    }
    return { text: st.items.join(''), refused };
  };
  assert.deepEqual(typeAll(['3', '+', '4', 'i']), { text: '3+4i', refused: [] });
  assert.deepEqual(typeAll(['0', '5', 'i', '2']).refused, ['2']); // i のすぐ後ろに数字は打てない
  assert.equal(typeAll(['0', '5']).text, '5');
  assert.equal(typeAll(['.', '5']).text, '0.5');
  assert.deepEqual(typeAll(['1', '.', '.']).refused, ['.']);
  assert.equal(typeAll(['−', '2', '×', '−', 'i']).text, '−2×−i');
  assert.equal(typeAll(['2', '+', '×']).text, '2×');
  assert.equal(typeAll(['2', '^', '−', '1']).text, '2^−1');
  assert.deepEqual(typeAll(['×']).refused, ['×']);
  assert.deepEqual(typeAll([')', '√(', '4', ')', ')']).refused, [')', ')']);
  assert.equal(typeAll(['2', '∠', '3', '0']).text, '2∠30');
  assert.equal(typeAll(['2', 'π', 'i']).text, '2πi');
});

test('保存の形', () => {
  const list = ['(', '3', '+', 'i', ')', '×', { ref: z(q(1, 3), -2), label: '答え' }, '√('];
  const back = deserItems(JSON.parse(JSON.stringify(serItems(list))));
  assert.equal(back.length, list.length);
  same(back[6].ref, list[6].ref);
  assert.deepEqual(deserItems(['1', 'x']), []);
  assert.ok(isZero(z(0)));
  same(sqrt(z(-9)), z(0, 3));
  same(C_I, z(0, 1));
});
