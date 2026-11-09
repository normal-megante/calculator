// =========================================================
// 検算のきまり（画面とは切り離した計算だけ）
//
//   ・逆算：計算した1つ1つのステップを、逆の計算で元の数に戻して確かめる
//       例：1,280 × 3 = 3,840 → 3,840 ÷ 3 = 1,280 ✓
//   ・照合：同じ計算をもう一度打ってもらい、1回目とちがう所を見つける
//       数は「数として」くらべる（12.50 と 12.5 は同じ）。
//       抜けた数・増えた数も見つけられるように、いちばん長く一致する並べ方でくらべる。
// =========================================================
import * as N from './num.js';
import * as S from './sci.js';
import { isDigit, isRef } from './calc.js';

const HUNDRED = N.frac(100n);
const TEN = N.frac(10n);
const INVERSE = { sin: 'asin', cos: 'acos', tan: 'atan' };
const FORWARD = { asin: 'sin', acos: 'cos', atan: 'tan' };

// ---------------------------------------------------------
// 逆算
// 返す値：{ op: 逆の計算の記号, x, y, value: 逆算の答え, expect: 戻るはずの数, ok, approx }
//         または { none: 逆算できない理由 }
//   関数電卓：sin → sin⁻¹（角度がちがっても sin が同じなら ✓。same はぴったり同じか）、
//             sin⁻¹ → sin、log → 10^、ln → e^、n! → ÷n で (n−1)!、
//             nCr → ×r!×(n−r)! で n!、nPr → ×(n−r)! で n!、x⁻¹ → 1÷
// ---------------------------------------------------------
function isEvenInteger(x) {
  return N.isInteger(x) && x.n % 2n === 0n;
}

function reverseRaw(s) {
  switch (s.op) {
    case '+':
      return { op: '−', x: s.result, y: s.b, value: N.sub(s.result, s.b), expect: s.a };
    case '−':
      return { op: '+', x: s.result, y: s.b, value: N.add(s.result, s.b), expect: s.a };
    case '×':
      if (N.isZero(s.b)) return { none: '0 をかけているので、逆算できません' };
      return { op: '÷', x: s.result, y: s.b, value: N.div(s.result, s.b), expect: s.a };
    case '÷':
      return { op: '×', x: s.result, y: s.b, value: N.mul(s.result, s.b), expect: s.a };
    case 'pct+':
      return { op: '−', x: s.result, y: s.part, value: N.sub(s.result, s.part), expect: s.a };
    case 'pct−':
      return { op: '+', x: s.result, y: s.part, value: N.add(s.result, s.part), expect: s.a };
    case '%':
      return { op: '×', x: s.result, y: HUNDRED, value: N.mul(s.result, HUNDRED), expect: s.a };
    case 'neg':
      return { op: 'neg', x: s.result, value: N.neg(s.result), expect: s.a };
    case '²':
      return { op: '√', x: s.result, value: N.sqrt(s.result), expect: N.absNum(s.a) };
    case '√':
      return { op: '²', x: s.result, value: N.pow(s.result, N.frac(2n)), expect: s.a };
    case '^': {
      if (N.isZero(s.b)) return { none: '0 乗は、どんな数でも 1 になるので逆算できません' };
      const value = N.pow(s.result, N.div(N.ONE, s.b));
      // 2乗・4乗…では、もとの数のマイナスは消える
      return { op: 'root', x: s.result, y: s.b, value, expect: isEvenInteger(s.b) ? N.absNum(s.a) : s.a };
    }
    case 'sin': case 'cos': case 'tan': {
      const value = S[INVERSE[s.op]](s.result, s.angle);
      const ok = S.sameTrig(s.op, s.a, value, s.angle);
      return { op: INVERSE[s.op], x: s.result, value, expect: s.a, ok, same: N.cmp(value, s.a) === 0, angle: s.angle, fn: s.op };
    }
    case 'asin': case 'acos': case 'atan':
      return { op: FORWARD[s.op], x: s.result, value: S[FORWARD[s.op]](s.result, s.angle), expect: s.a, angle: s.angle };
    case 'log':
      return { op: 'pow10', x: s.result, value: N.pow(TEN, s.result), expect: s.a };
    case 'ln':
      return { op: 'exp', x: s.result, value: N.exp(s.result), expect: s.a };
    case '!': {
      const n = S.intOf(s.a);
      if (n === 0n) return { none: '0! は 1 ときまっているので、逆算するものはありません' };
      const k = N.frac(n - 1n);
      return { op: 'fact', x: s.result, y: s.a, k, value: N.div(s.result, s.a), expect: S.factorial(k) };
    }
    // nCr × r! ＝ nPr（nCr は「並べ方 nPr を、同じ組の並べかえ r! で割ったもの」だから）
    case 'C':
      return { op: 'C', x: s.result, n: s.a, r: s.b, value: N.mul(s.result, S.factorial(s.b)), expect: S.nPr(s.a, s.b) };
    // nPr × (n−r)! ＝ n!（n! が大きすぎて出せないときは nPr ÷ n ＝ (n−1)P(r−1)）
    case 'P': {
      const n = S.intOf(s.a);
      const r = S.intOf(s.b);
      if (r === 0n) return { none: 'nP0 は 1 ときまっているので、逆算するものはありません' };
      const rest = N.frac(n - r);
      try {
        return { op: 'P', x: s.result, n: s.a, rest, value: N.mul(s.result, S.factorial(rest)), expect: S.factorial(s.a) };
      } catch {
        const n1 = N.frac(n - 1n);
        const r1 = N.frac(r - 1n);
        return { op: 'P÷', x: s.result, n: s.a, n1, r1, value: N.div(s.result, s.a), expect: S.nPr(n1, r1) };
      }
    }
    case '⁻¹':
      return { op: '÷', x: N.ONE, y: s.result, value: N.div(N.ONE, s.result), expect: s.a };
    default:
      return { none: 'この計算は逆算できません' };
  }
}

export function reverseStep(step) {
  let r;
  try {
    r = reverseRaw(step);
  } catch {
    return { none: 'この計算は逆算できません' };
  }
  if (r.none) return r;
  const ok = r.ok ?? N.cmp(r.value, r.expect) === 0;
  return { ...r, ok, approx: !r.value.q || !r.expect.q };
}

// ---------------------------------------------------------
// 照合
// ---------------------------------------------------------

// 式を「数」と「記号」のかたまりに分ける。start〜end は式の部品の位置
export function segments(items) {
  const segs = [];
  for (let i = 0; i < items.length;) {
    const t = items[i];
    if (isRef(t)) {
      segs.push({ kind: 'num', text: null, value: t.ref, start: i, end: i + 1 });
      i++;
    } else if (isDigit(t) || t === '.') {
      let j = i;
      let text = '';
      while (j < items.length && (isDigit(items[j]) || items[j] === '.')) text += items[j++];
      segs.push({ kind: 'num', text, start: i, end: j });
      i = j;
    } else {
      segs.push({ kind: 'sym', text: t, start: i, end: i + 1 });
      i++;
    }
  }
  return segs;
}

function numberOf(seg) {
  if (seg.value) return seg.value;
  if ((seg.text.match(/\./g) ?? []).length > 1) return null;
  seg.value = N.parseDecimal(seg.text);
  return seg.value;
}

function same(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'sym') return a.text === b.text;
  const x = numberOf(a);
  const y = numberOf(b);
  if (!x || !y) return a.text === b.text;
  return N.cmp(x, y) === 0;
}

function indexSet(segs) {
  const set = new Set();
  for (const s of segs) for (let i = s.start; i < s.end; i++) set.add(i);
  return set;
}

// 打っている途中のくらべ方：ここまで1回目と同じか
// 返す値：{ ok: true, complete } または { ok: false, marks: 赤くする部品の位置 }
export function liveCompare(original, typed) {
  const A = segments(original);
  const B = segments(typed);
  for (let i = 0; i < B.length; i++) {
    const a = A[i];
    const b = B[i];
    if (a && same(a, b)) continue;
    // いちばん最後の数を打っている途中なら、1回目の数の頭と同じかだけ見る（128 → 1280 の途中）
    const typing = i === B.length - 1 && b.end === typed.length && b.kind === 'num' && b.text !== null;
    if (a && typing && a.kind === 'num' && a.text !== null && a.text.startsWith(b.text)) continue;
    return { ok: false, marks: indexSet([b]) };
  }
  return { ok: true, complete: A.length === B.length };
}

// ＝ を押したあとのくらべ方
// 返す値：{ same, marksA: 1回目の赤い所, marksB: 2回目の赤い所 }
export function fullCompare(original, typed) {
  const A = segments(original);
  const B = segments(typed);
  const n = A.length;
  const m = B.length;
  // いちばん長く一致する並べ方（LCS）
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = same(A[i], B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const badA = [];
  const badB = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(A[i], B[j])) { i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) badA.push(A[i++]);
    else badB.push(B[j++]);
  }
  while (i < n) badA.push(A[i++]);
  while (j < m) badB.push(B[j++]);
  return { same: badA.length === 0 && badB.length === 0, marksA: indexSet(badA), marksB: indexSet(badB) };
}
