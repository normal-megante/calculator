// =========================================================
// 微分・積分・Σ・lim の計算（ステップ9。画面とは切り離した計算だけ）
//
// 式は calc.js の計算の木（compile で作る）。x（Σ は k）に数を入れて計算する（evalTree）。
//
// しくみ
//   ・べき級数（テイラー展開）：x ＝ a ＋ h とおいて、式を h の級数 c0 ＋ c1·h ＋ c2·h² ＋ … にする。
//       微分：f'(a) ＝ c1、f''(a) ＝ 2·c2（数の差で近づけるのではないので、ほとんど誤差なし。x² なら正確）
//       lim ：いちばん低い次数の項で決まる（sin x ／ x → 1。h の −1 乗なら ∞）。x → ∞ は x ＝ 1/h とおく。
//     ln h や √h のように級数にならない式は、x を近づけた数で計算してみる（SeriesFail）。
//   ・積分：x の多項式なら原始関数で正確に。ほかは二重指数関数型の数値積分（tanh-sinh）。
//       ∞ までは exp-sinh・sinh-sinh。きざみを半分にしたときの差で、正しい桁数を見積もる。
//   ・Σ：多項式なら公式（S(n) を多項式で）で正確に。1万個までなら1つずつ足す。
//       ∞ まで：等比数列は公式、符号が交互なら CVZ の加速、すぐ小さくなる項はそのまま足す、
//       ゆっくり小さくなる項はオイラー・マクローリンの公式（積分 ＋ ベルヌーイ数での補正）。
// =========================================================
import * as N from './num.js';
import * as S from './sci.js';
import { evalTree } from './calc.js';

const { CalcError, ZERO, ONE } = N;
const I = (n) => N.frac(BigInt(n));
const HALF = N.frac(1n, 2n);
const HUNDREDTH = N.frac(1n, 100n);
const DEG = N.div(S.PI, I(180));     // 1° ＝ π/180 rad
const RAD2DEG = N.div(I(180), S.PI);
const INV_LN10 = N.div(ONE, N.ln(I(10)));
const HALF_PI = N.div(S.PI, I(2));

export const MAX_DIGITS = 40; // 数値で出す答えの桁数の上限

// 式のまま（級数で）扱えなかった。数値の計算に切りかえる合図
export class SeriesFail extends Error {}

const log10Abs = (x) => (N.isZero(x) ? -Infinity : N.approxLog10(N.absNum(x)));

// 上から digits 桁に四捨五入した概数
export function roundTo(x, digits) {
  if (N.isZero(x)) return ZERO;
  const r = N.roundSig(x, digits);
  const m = BigInt(r.digits) * (r.neg ? -1n : 1n);
  const e = r.exp - r.digits.length;
  return N.toApprox(e >= 0 ? N.frac(m * 10n ** BigInt(e)) : N.frac(m, 10n ** BigInt(-e)));
}

// 足し算（分数が大きくなりすぎたら概数に切りかえる。1万個の 1/k を正確に足すと遅いので）
function addSum(sum, t) {
  const r = N.add(sum, t);
  if (r.q && N.bitLen(r.n) + N.bitLen(r.d) > 4000) return N.toApprox(r);
  return r;
}

const fx = (tree, x, angle) => evalTree(tree, { x, angle });

// =========================================================
// べき級数（h の級数）
//   { v, c, o } … Σ c[i]·h^(v+i)。h^o 以上の項はわからない（o ＝ Infinity なら、ちょうどこれだけ）
//   c[0] は 0 でない（0 の級数は c ＝ []、v ＝ o）
// =========================================================
const ZERO_S = Object.freeze({ v: Infinity, c: [], o: Infinity });
const isZeroS = (s) => s.c.length === 0;
const coef = (s, j) => {
  const i = j - s.v;
  return i >= 0 && i < s.c.length ? s.c[i] : ZERO;
};
const isConstS = (s) => s.o === Infinity && (s.c.length === 0 || (s.v === 0 && s.c.length === 1));
const constOf = (s) => (s.c.length === 0 ? ZERO : s.c[0]);
const constS = (x) => mk(0, [x], Infinity, 1);

function mk(v, c, o, K) {
  let i = 0;
  while (i < c.length && N.isZero(c[i])) i++;
  if (i > 0) {
    c = c.slice(i);
    v += i;
  }
  if (c.length === 0) return o === Infinity ? ZERO_S : { v: o, c: [], o };
  if (o === Infinity) {
    let j = c.length;
    while (j > 1 && N.isZero(c[j - 1])) j--;
    if (j < c.length) c = c.slice(0, j);
  }
  if (c.length > K) {
    c = c.slice(0, K);
    o = v + K;
  }
  return { v, c, o };
}

// 相対的な長さ（いくつ先の項まで正しいか）
const relLen = (s, K) => (s.o === Infinity ? (s.c.length === 1 ? 1 : K) : Math.min(s.o - s.v, K));
const exactMono = (s) => s.o === Infinity && s.c.length === 1; // c·h^v だけ

function addS(a, b, K) {
  if (isZeroS(a) && a.o === Infinity) return b;
  if (isZeroS(b) && b.o === Infinity) return a;
  const v = Math.min(a.v, b.v);
  const o = Math.min(a.o, b.o);
  const end = o === Infinity ? Math.max(a.v + a.c.length, b.v + b.c.length) : o;
  const c = [];
  for (let j = v; j < end; j++) c.push(N.add(coef(a, j), coef(b, j)));
  return mk(v, c, o, Math.max(K, end - v));
}

const negS = (a) => ({ v: a.v, c: a.c.map(N.neg), o: a.o });
const subS = (a, b, K) => addS(a, negS(b), K);

function scaleS(a, k) {
  if (N.isZero(k)) return ZERO_S;
  return { v: a.v, c: a.c.map((x) => N.mul(x, k)), o: a.o };
}

function mulS(a, b, K) {
  if (isZeroS(a) || isZeroS(b)) {
    const o = Math.min(a.o + b.v, b.o + a.v);
    return o === Infinity ? ZERO_S : { v: o, c: [], o };
  }
  const v = a.v + b.v;
  const o = Math.min(a.o + b.v, b.o + a.v);
  const L0 = o === Infinity ? a.c.length + b.c.length - 1 : o - v;
  const L = Math.min(L0, K);
  const c = [];
  for (let n = 0; n < L; n++) {
    let sum = ZERO;
    for (let i = Math.max(0, n - b.c.length + 1); i <= Math.min(n, a.c.length - 1); i++) {
      sum = N.add(sum, N.mul(a.c[i], b.c[n - i]));
    }
    c.push(sum);
  }
  return mk(v, c, L < L0 ? v + L : o, K);
}

function invS(a, K) {
  if (isZeroS(a)) {
    if (a.o === Infinity) throw new CalcError('0 で割ることはできません');
    throw new SeriesFail('precision');
  }
  const a0 = a.c[0];
  const L = relLen(a, K);
  const b = [N.div(ONE, a0)];
  for (let n = 1; n < L; n++) {
    let sum = ZERO;
    for (let k = 1; k <= n && k < a.c.length; k++) sum = N.add(sum, N.mul(a.c[k], b[n - k]));
    b.push(N.neg(N.div(sum, a0)));
  }
  const v = -a.v;
  return mk(v, b, exactMono(a) ? Infinity : v + L, K);
}

const divS = (a, b, K) => mulS(a, invS(b, K), K);

function powIntS(a, n, K) {
  if (n === 0n) return constS(ONE);
  if (n < 0n) return invS(powIntS(a, -n, K), K);
  let result = null;
  let base = a;
  for (;;) {
    if (n & 1n) result = result ? mulS(result, base, K) : base;
    n >>= 1n;
    if (n === 0n) return result;
    base = mulS(base, base, K);
  }
}

// a の p 乗（p は x をふくまない数）
function powConstS(a, p, K) {
  if (N.isInteger(p)) return powIntS(a, p.n, K);
  if (isZeroS(a)) {
    if (a.o !== Infinity) throw new SeriesFail('precision');
    if (N.sign(p) > 0) return ZERO_S;
    throw new CalcError('0 で割ることはできません');
  }
  // a ＝ c0·h^v·(1 ＋ u) とすると a^p ＝ c0^p·h^(v·p)·(1 ＋ u)^p
  let nv = 0;
  if (a.v !== 0) {
    if (!p.q) throw new SeriesFail('pow');
    const q = N.mul(I(a.v), p);
    if (!N.isInteger(q)) throw new SeriesFail('pow'); // √h など
    nv = Number(q.n);
    if (p.d % 2n === 0n && nv % 2 !== 0) throw new SeriesFail('abs'); // √(h²) ＝ |h| など
  }
  const c0 = a.c[0];
  const lead = N.pow(c0, p);
  const L = relLen(a, K);
  const u = a.c.map((x) => N.div(x, c0));
  const b = [ONE];
  const p1 = N.add(p, ONE);
  for (let n = 1; n < L; n++) {
    let sum = ZERO;
    for (let k = 1; k <= n && k < u.length; k++) {
      sum = N.add(sum, N.mul(N.sub(N.mul(p1, I(k)), I(n)), N.mul(u[k], b[n - k])));
    }
    b.push(N.div(sum, I(n)));
  }
  return mk(nv, b.map((x) => N.mul(x, lead)), exactMono(a) ? Infinity : nv + L, K);
}

// a ＝ a0 ＋ r（r は h の1次から）
function splitS(a) {
  if (isZeroS(a)) {
    if (a.o === Infinity) return [ZERO, ZERO_S];
    if (a.o < 1) throw new SeriesFail('precision');
    return [ZERO, a];
  }
  if (a.v < 0) throw new SeriesFail('pole'); // sin(1/h) など
  if (a.v > 0) return [ZERO, a];
  return [a.c[0], mk(1, a.c.slice(1), a.o, Infinity)];
}

function expS(a, K) {
  const [a0, r] = splitS(a);
  const e0 = N.exp(a0);
  if (isZeroS(r) && r.o === Infinity) return constS(e0);
  const L = Math.min(r.o, K);
  const e = [ONE];
  for (let n = 1; n < L; n++) {
    let sum = ZERO;
    for (let k = 1; k <= n; k++) {
      const rk = coef(r, k);
      if (!N.isZero(rk)) sum = N.add(sum, N.mul(N.mul(I(k), rk), e[n - k]));
    }
    e.push(N.div(sum, I(n)));
  }
  return mk(0, e.map((x) => N.mul(x, e0)), L, K);
}

function lnS(a, K) {
  if (isZeroS(a)) {
    if (a.o === Infinity) throw new CalcError('0 や負の数の ln はありません');
    throw new SeriesFail('precision');
  }
  if (a.v !== 0) throw new SeriesFail('log'); // ln h が出てくる
  const a0 = a.c[0];
  const L = relLen(a, K);
  const b = [S.ln(a0)];
  for (let n = 1; n < L; n++) {
    let sum = ZERO;
    for (let k = 1; k < n; k++) sum = N.add(sum, N.mul(N.mul(I(k), b[k]), coef(a, n - k)));
    b.push(N.div(N.sub(coef(a, n), N.div(sum, I(n))), a0));
  }
  return mk(0, b, exactMono(a) ? Infinity : L, K);
}

// [sin a, cos a]（度のときは、a0 は度のまま正確に、残りは rad にして展開）
function sinCosS(a, angle, K) {
  const [a0, r0] = splitS(a);
  const s0 = S.sin(a0, angle);
  const c0 = S.cos(a0, angle);
  const r = angle === 'deg' ? scaleS(r0, DEG) : r0;
  if (isZeroS(r) && r.o === Infinity) return [constS(s0), constS(c0)];
  const L = Math.min(r.o, K);
  const s = [ZERO];
  const c = [ONE];
  for (let n = 1; n < L; n++) {
    let ss = ZERO;
    let cc = ZERO;
    for (let k = 1; k <= n; k++) {
      const rk = coef(r, k);
      if (N.isZero(rk)) continue;
      const kr = N.mul(I(k), rk);
      ss = N.add(ss, N.mul(kr, c[n - k]));
      cc = N.add(cc, N.mul(kr, s[n - k]));
    }
    s.push(N.div(ss, I(n)));
    c.push(N.neg(N.div(cc, I(n))));
  }
  const Ss = mk(0, s, L, K);
  const Cs = mk(0, c, L, K);
  return [
    addS(scaleS(Cs, s0), scaleS(Ss, c0), K),
    subS(scaleS(Cs, c0), scaleS(Ss, s0), K),
  ];
}

function derivS(a, K) {
  if (isZeroS(a)) return a.o === Infinity ? ZERO_S : { v: a.o - 1, c: [], o: a.o - 1 };
  const start = Math.max(a.v, 1);
  const c = [];
  for (let j = start; j < a.v + a.c.length; j++) c.push(N.mul(I(j), coef(a, j)));
  return mk(start - 1, c, a.o === Infinity ? Infinity : a.o - 1, K);
}

function integS(d, K) {
  if (isZeroS(d)) return d.o === Infinity ? ZERO_S : { v: d.o + 1, c: [], o: d.o + 1 };
  if (d.v < 0) throw new SeriesFail('log');
  return mk(d.v + 1, d.c.map((x, i) => N.div(x, I(d.v + i + 1))), d.o === Infinity ? Infinity : d.o + 1, K);
}

// 逆三角関数：b' ＝ a' ／ (1 ＋ a²) などを積分する
function inverseTrigS(name, a, angle, K) {
  const [a0] = splitS(a);
  const b0 = name === 'asin' ? S.asin(a0, angle) : name === 'acos' ? S.acos(a0, angle) : S.atan(a0, angle);
  const da = derivS(a, K);
  const a2 = mulS(a, a, K);
  const d = name === 'atan'
    ? mulS(da, invS(addS(constS(ONE), a2, K), K), K)
    : mulS(da, powConstS(subS(constS(ONE), a2, K), N.neg(HALF), K), K);
  let rest = integS(d, K);
  if (name === 'acos') rest = negS(rest);
  if (angle === 'deg') rest = scaleS(rest, RAD2DEG);
  return addS(constS(b0), rest, K);
}

function fnS(name, a, angle, K) {
  if (isConstS(a)) return constS(applyFn(name, constOf(a), angle));
  switch (name) {
    case 'sin': return sinCosS(a, angle, K)[0];
    case 'cos': return sinCosS(a, angle, K)[1];
    case 'tan': {
      const [s, c] = sinCosS(a, angle, K);
      return divS(s, c, K);
    }
    case 'asin': case 'acos': case 'atan': return inverseTrigS(name, a, angle, K);
    case 'ln': return lnS(a, K);
    case 'log': return scaleS(lnS(a, K), INV_LN10);
    default: throw new Error(`知らない関数: ${name}`);
  }
}

function applyFn(name, a, angle) {
  switch (name) {
    case 'sin': return S.sin(a, angle);
    case 'cos': return S.cos(a, angle);
    case 'tan': return S.tan(a, angle);
    case 'asin': return S.asin(a, angle);
    case 'acos': return S.acos(a, angle);
    case 'atan': return S.atan(a, angle);
    case 'log': return S.log10(a);
    case 'ln': return S.ln(a);
    default: throw new Error(`知らない関数: ${name}`);
  }
}

// 計算の木 → 級数。ctx ＝ { x: 変数の級数, angle, K: 何項まで }
function ser(node, ctx) {
  const { K } = ctx;
  switch (node.t) {
    case 'num': return constS(node.v);
    case 'var': return ctx.x;
    case 'group': return ser(node.a, ctx);
    case 'add': {
      const a = ser(node.a, ctx);
      if (node.b.t === 'pct') {
        const part = mulS(a, scaleS(ser(node.b.a, ctx), HUNDREDTH), K);
        return node.op === '+' ? addS(a, part, K) : subS(a, part, K);
      }
      const b = ser(node.b, ctx);
      return node.op === '+' ? addS(a, b, K) : subS(a, b, K);
    }
    case 'mul': {
      const a = ser(node.a, ctx);
      const b = ser(node.b, ctx);
      return node.op === '÷' ? divS(a, b, K) : mulS(a, b, K);
    }
    case 'neg': return negS(ser(node.a, ctx));
    case 'pow': {
      const a = ser(node.a, ctx);
      const b = ser(node.b, ctx);
      if (isConstS(b)) return powConstS(a, constOf(b), K);
      return expS(mulS(b, lnS(a, K), K), K); // a^b ＝ e^(b·ln a)
    }
    case 'sq': {
      const a = ser(node.a, ctx);
      return mulS(a, a, K);
    }
    case 'pct': return scaleS(ser(node.a, ctx), HUNDREDTH);
    case 'sqrt': return powConstS(ser(node.a, ctx), HALF, K);
    case 'inv': return invS(ser(node.a, ctx), K);
    case 'fn': return fnS(node.name, ser(node.a, ctx), ctx.angle, K);
    case 'fact': {
      const a = ser(node.a, ctx);
      if (!isConstS(a)) throw new SeriesFail('fact'); // k! は整数のときだけ
      return constS(S.factorial(constOf(a)));
    }
    case 'perm': {
      const a = ser(node.a, ctx);
      const b = ser(node.b, ctx);
      if (!isConstS(a) || !isConstS(b)) throw new SeriesFail('perm');
      return constS(node.op === 'C' ? S.nCr(constOf(a), constOf(b)) : S.nPr(constOf(a), constOf(b)));
    }
    default:
      throw new Error(`知らない計算: ${node.t}`);
  }
}

// x ＝ a ＋ h（a が { inf: ±1 } なら x ＝ ±1/h）のときの級数
function seriesAt(tree, at, angle, K) {
  const x = at.inf ? mk(-1, [at.inf > 0 ? ONE : N.neg(ONE)], Infinity, K) : mk(0, [at, ONE], Infinity, K);
  return ser(tree, { x, angle, K });
}

// =========================================================
// 多項式（係数の配列。[c0, c1, c2, …] ＝ c0 ＋ c1·x ＋ c2·x² ＋ …）
// =========================================================
const MAX_DEG = 200;

function pTrim(p) {
  let n = p.length;
  while (n > 1 && N.isZero(p[n - 1])) n--;
  return n === p.length ? p : p.slice(0, n);
}

function pAdd(a, b) {
  const r = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) r.push(N.add(a[i] ?? ZERO, b[i] ?? ZERO));
  return pTrim(r);
}

const pScale = (a, k) => pTrim(a.map((x) => N.mul(x, k)));
const pSub = (a, b) => pAdd(a, pScale(b, I(-1)));

function pMul(a, b) {
  const r = Array.from({ length: a.length + b.length - 1 }, () => ZERO);
  a.forEach((x, i) => {
    if (N.isZero(x)) return;
    b.forEach((y, j) => { r[i + j] = N.add(r[i + j], N.mul(x, y)); });
  });
  return pTrim(r);
}

export function pEval(p, x) {
  let r = ZERO;
  for (let i = p.length - 1; i >= 0; i--) r = N.add(N.mul(r, x), p[i]);
  return r;
}

export const pDeriv = (p) => (p.length <= 1 ? [ZERO] : pTrim(p.slice(1).map((c, i) => N.mul(c, I(i + 1)))));
export const pInteg = (p) => pTrim([ZERO, ...p.map((c, i) => N.div(c, I(i + 1)))]);
export const pIsZero = (p) => p.length === 1 && N.isZero(p[0]);
export const pDegree = (p) => (pIsZero(p) ? -Infinity : p.length - 1);

function hasVar(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.t === 'var') return true;
  return hasVar(node.a) || hasVar(node.b);
}

// x の多項式なら係数の配列、ちがえば null
function polyNode(node, angle) {
  if (!hasVar(node)) return [evalTree(node, { angle })];
  switch (node.t) {
    case 'var': return [ZERO, ONE];
    case 'group': return polyNode(node.a, angle);
    case 'neg': {
      const a = polyNode(node.a, angle);
      return a && a.map(N.neg);
    }
    case 'add': {
      const a = polyNode(node.a, angle);
      if (!a) return null;
      if (node.b.t === 'pct') {
        const b = polyNode(node.b.a, angle);
        if (!b) return null;
        const part = pMul(a, pScale(b, HUNDREDTH));
        return node.op === '+' ? pAdd(a, part) : pSub(a, part);
      }
      const b = polyNode(node.b, angle);
      if (!b) return null;
      return node.op === '+' ? pAdd(a, b) : pSub(a, b);
    }
    case 'mul': {
      const a = polyNode(node.a, angle);
      const b = polyNode(node.b, angle);
      if (!a || !b) return null;
      if (node.op === '÷') return b.length === 1 ? pScale(a, N.div(ONE, b[0])) : null;
      return pMul(a, b);
    }
    case 'sq': {
      const a = polyNode(node.a, angle);
      return a && pMul(a, a);
    }
    case 'pct': {
      const a = polyNode(node.a, angle);
      return a && pScale(a, HUNDREDTH);
    }
    case 'pow': {
      if (hasVar(node.b)) return null;
      const e = evalTree(node.b, { angle });
      if (!N.isInteger(e) || e.n < 0n || e.n > BigInt(MAX_DEG)) return null;
      const a = polyNode(node.a, angle);
      if (!a || (a.length - 1) * Number(e.n) > MAX_DEG) return null;
      let r = [ONE];
      for (let i = 0n; i < e.n; i++) r = pMul(r, a);
      return r;
    }
    default:
      return null;
  }
}

export function polyOf(tree, angle = S.getAngle()) {
  try {
    const p = polyNode(tree, angle);
    return p && pTrim(p);
  } catch (error) {
    if (error instanceof CalcError) return null; // 0 で割るなど（あとで、ふつうに計算してエラーを出す）
    throw error;
  }
}

// =========================================================
// 数の並びが、どこに近づいているか（数値で lim をとるとき）
//   { kind: 'value', value, digits } … 近づく値（digits 桁は正しいはず）
//   { kind: 'zero' } … 0 に近づく
//   { kind: 'inf', sign } … 限りなく大きく（小さく）なる
//   { kind: 'none' } … 1つの値に近づかない（ふれ続けるなど）
// =========================================================
function analyzeSeq(vals) {
  const n = vals.length;
  const last = vals[n - 1];
  const prev = vals[n - 2];
  const L = vals.map(log10Abs);
  const ld = log10Abs(N.sub(last, prev));
  const ldPrev = log10Abs(N.sub(prev, vals[n - 3]));
  const scale = Math.max(L[n - 1], L[n - 2]);
  if (ld === -Infinity || (scale - ld >= 6 && ld < ldPrev)) {
    const digits = ld === -Infinity ? MAX_DIGITS : Math.min(MAX_DIGITS, Math.floor(scale - ld));
    return { kind: 'value', value: last, digits };
  }
  const tail = L.slice(-4);
  if (tail.every((v, i) => i === 0 || v < tail[i - 1] - 0.5) && L[n - 1] < Math.min(-8, L[0] - 8)) return { kind: 'zero' };
  const sameSign = vals.slice(-3).every((v) => N.sign(v) === N.sign(last));
  if (tail.every((v, i) => i === 0 || v > tail[i - 1] + 0.5) && sameSign && L[n - 1] > 15) {
    return { kind: 'inf', sign: N.sign(last) };
  }
  return { kind: 'none' };
}

// =========================================================
// 微分
//   返す値：{ f: f(a), d1: f'(a), d2: f''(a) か null, method: 'series' | 'numeric', digits, side, poly }
// =========================================================
export function derivative(tree, a, { angle = S.getAngle() } = {}) {
  let fa;
  try {
    fa = fx(tree, a, angle);
  } catch (error) {
    if (!(error instanceof CalcError)) throw error;
    throw new CalcError(`この x では f(x) の値がないので、微分できません（${error.message}）`);
  }
  const poly = polyOf(tree, angle);
  try {
    const s = seriesAt(tree, a, angle, 6);
    if (s.v < 0 || s.o < 3) throw new SeriesFail('precision');
    return { f: fa, d1: coef(s, 1), d2: N.mul(I(2), coef(s, 2)), method: 'series', poly };
  } catch (error) {
    if (!(error instanceof SeriesFail) && !(error instanceof CalcError)) throw error;
  }
  return numericDerivative(tree, a, angle, fa, poly);
}

function numericDerivative(tree, a, angle, fa, poly) {
  const vals = [];
  let side = 'both';
  for (let k = 6; k <= 26; k += 4) {
    const h = N.frac(1n, 10n ** BigInt(k));
    let d = null;
    if (side === 'both') {
      try {
        d = N.div(N.sub(fx(tree, N.add(a, h), angle), fx(tree, N.sub(a, h), angle)), N.mul(I(2), h));
      } catch (error) {
        if (!(error instanceof CalcError)) throw error;
        side = 'right';
      }
    }
    if (d === null && side === 'right') {
      try {
        d = N.div(N.sub(fx(tree, N.add(a, h), angle), fa), h);
      } catch (error) {
        if (!(error instanceof CalcError)) throw error;
        side = 'left';
      }
    }
    if (d === null && side === 'left') {
      try {
        d = N.div(N.sub(fa, fx(tree, N.sub(a, h), angle)), h);
      } catch (error) {
        if (!(error instanceof CalcError)) throw error;
        throw new CalcError('この x の近くで f(x) が計算できないので、微分できません');
      }
    }
    vals.push(d);
  }
  const r = analyzeSeq(vals);
  if (side === 'both' && (r.kind === 'value' || r.kind === 'zero')) checkCorner(tree, a, angle, fa, r.kind === 'zero' ? ZERO : r.value);
  if (r.kind === 'value') return { f: fa, d1: roundTo(r.value, r.digits), d2: null, method: 'numeric', digits: r.digits, side, poly };
  if (r.kind === 'zero') return { f: fa, d1: ZERO, d2: null, method: 'numeric', digits: null, side, poly, zero: true };
  if (r.kind === 'inf') throw new CalcError('この x では、グラフの傾きが限りなく大きくなるので、微分できません');
  throw new CalcError('この x では微分できません（グラフがとがっている所など）');
}

// 右からの傾きと左からの傾きが、まん中の差で出した傾きと合うか（とがった所を見つける）
function checkCorner(tree, a, angle, fa, d) {
  const oneSide = (sign) => {
    const vals = [];
    for (let k = 6; k <= 26; k += 4) {
      const h = N.frac(BigInt(sign), 10n ** BigInt(k));
      vals.push(N.div(N.sub(fx(tree, N.add(a, h), angle), fa), h));
    }
    const r = analyzeSeq(vals);
    return r.kind === 'value' ? r.value : r.kind === 'zero' ? ZERO : null;
  };
  let right;
  let left;
  try {
    right = oneSide(1);
    left = oneSide(-1);
  } catch (error) {
    if (!(error instanceof CalcError)) throw error;
    return;
  }
  const far = (v) => v === null
    || log10Abs(N.sub(v, d)) > Math.max(log10Abs(d), log10Abs(v), 0) - 6;
  if (far(right) || far(left)) {
    throw new CalcError('この x では、右からと左からでグラフの傾きがちがうので、微分できません（とがっている所）');
  }
}

// =========================================================
// lim
//   at：数、または { inf: 1 }（∞）・{ inf: -1 }（−∞）
//   side：'both'（両側）・'right'（右から ＋）・'left'（左から −）
//   返す値：{ kind: 'value', value, method, digits?, approxZero? }
//           { kind: 'inf', sign }  … ＋∞ か −∞
//           { kind: 'split', right, left } … 右と左で ＋∞ と −∞ にわかれる
//           { kind: 'differ', right, left } … 右と左で近づき方がちがう（right・left は、それぞれの側の答え）
//           { kind: 'none' } … 1つの値に近づかない
//   oneSide：片側でしか計算できなかったとき、その側
// =========================================================
export function limit(tree, at, side = 'both', { angle = S.getAngle() } = {}) {
  if (at.inf) side = at.inf > 0 ? 'left' : 'right'; // ∞ へは片側から
  let s = null;
  try {
    s = seriesAt(tree, at, angle, 16);
  } catch (error) {
    if (!(error instanceof SeriesFail) && !(error instanceof CalcError)) throw error;
  }
  if (s) {
    if (isZeroS(s)) {
      if (s.o === Infinity) return { kind: 'value', value: ZERO, method: 'series' };
      if (s.o >= 1) return { kind: 'value', value: ZERO, method: 'series' };
    } else if (s.v > 0) {
      return { kind: 'value', value: ZERO, method: 'series' };
    } else if (s.v === 0) {
      return { kind: 'value', value: s.c[0], method: 'series' };
    } else {
      const sg = N.sign(s.c[0]);
      if (at.inf) return { kind: 'inf', sign: sg, method: 'series' };
      const right = sg;
      const left = s.v % 2 === 0 ? sg : -sg;
      if (side === 'right') return { kind: 'inf', sign: right, method: 'series' };
      if (side === 'left') return { kind: 'inf', sign: left, method: 'series' };
      return right === left ? { kind: 'inf', sign: right, method: 'series' } : { kind: 'split', right, left, method: 'series' };
    }
  }
  return numericLimit(tree, at, side, angle);
}

// 近づける x の値（右から：a ＋ 10^−4k、∞：10^4k）
export function approachPoints(at, side, count = 10, step = 4) {
  const xs = [];
  for (let k = 1; k <= count; k++) {
    const big = 10n ** BigInt(step * k);
    if (at.inf) xs.push(N.frac(at.inf > 0 ? big : -big));
    else xs.push(side === 'right' ? N.add(at, N.frac(1n, big)) : N.sub(at, N.frac(1n, big)));
  }
  return xs;
}

function numericLimit(tree, at, side, angle) {
  const sides = at.inf ? [side] : side === 'both' ? ['right', 'left'] : [side];
  const res = {};
  for (const sd of sides) {
    for (const [count, step] of [[10, 4], [10, 1], [6, 1]]) {
      try {
        res[sd] = analyzeSeq(approachPoints(at, sd, count, step).map((x) => fx(tree, x, angle)));
        break;
      } catch (error) {
        if (!(error instanceof CalcError)) throw error;
        res[sd] = { kind: 'undefined', message: error.message };
      }
    }
  }
  const pack = (r) => {
    if (r.kind === 'value') return { kind: 'value', value: roundTo(r.value, r.digits), digits: r.digits, method: 'numeric' };
    if (r.kind === 'zero') return { kind: 'value', value: ZERO, method: 'numeric', approxZero: true };
    if (r.kind === 'inf') return { kind: 'inf', sign: r.sign, method: 'numeric' };
    return { kind: 'none', method: 'numeric' };
  };
  if (sides.length === 1) {
    const r = res[sides[0]];
    if (r.kind === 'undefined') throw new CalcError(`x を近づけても、f(x) が計算できません（${r.message}）`);
    return pack(r);
  }
  const { right, left } = res;
  if (right.kind === 'undefined' && left.kind === 'undefined') {
    throw new CalcError(`x を近づけても、f(x) が計算できません（${right.message}）`);
  }
  if (right.kind === 'undefined') return { ...pack(left), oneSide: 'left' };
  if (left.kind === 'undefined') return { ...pack(right), oneSide: 'right' };
  const R = pack(right);
  const Lf = pack(left);
  if (R.kind === 'none' || Lf.kind === 'none') return { kind: 'none', method: 'numeric' };
  if (R.kind === 'inf' && Lf.kind === 'inf') {
    return R.sign === Lf.sign ? R : { kind: 'split', right: R.sign, left: Lf.sign, method: 'numeric' };
  }
  if (R.kind === 'value' && Lf.kind === 'value') {
    const digits = Math.min(R.digits ?? MAX_DIGITS, Lf.digits ?? MAX_DIGITS);
    const both0 = R.approxZero || Lf.approxZero;
    const d = log10Abs(N.sub(R.value, Lf.value));
    const scale = Math.max(log10Abs(R.value), log10Abs(Lf.value));
    if (d === -Infinity || (!both0 && scale - d >= digits - 1) || (both0 && d < -15)) {
      return R.approxZero ? Lf : R;
    }
  }
  return { kind: 'differ', right: R, left: Lf, method: 'numeric' };
}

// =========================================================
// 積分
//   a, b：数、または { inf: ±1 }
//   返す値：{ value, method: 'poly' | 'numeric', exact, digits, antider（原始関数の係数）, approxZero }
// =========================================================
export function integral(tree, a, b, { angle = S.getAngle() } = {}) {
  const finiteA = !a.inf;
  const finiteB = !b.inf;
  // 上と下が逆なら、入れかえてマイナス
  const reversed = (finiteA && finiteB && N.cmp(a, b) > 0)
    || (a.inf === 1) || (b.inf === -1);
  if (reversed) {
    if (a.inf && b.inf && a.inf === b.inf) return { value: ZERO, method: 'poly', exact: true };
    const r = integral(tree, b, a, { angle });
    return { ...r, value: N.neg(r.value) };
  }
  if (finiteA && finiteB && N.cmp(a, b) === 0) return { value: ZERO, method: 'poly', exact: true };
  const poly = polyOf(tree, angle);
  if (poly) {
    const F = pInteg(poly);
    if (!finiteA || !finiteB) {
      if (pIsZero(poly)) return { value: ZERO, method: 'poly', exact: true, antider: F };
      throw new CalcError('∞ までの積分は、この式では限りなく大きくなります（値がありません）');
    }
    const value = N.sub(pEval(F, b), pEval(F, a));
    return { value, method: 'poly', exact: value.q, antider: F, poly };
  }
  const r = quad(tree, a, b, angle);
  return { ...r, method: 'numeric' };
}

// ---- 二重指数関数型の数値積分 ----
const T_MAX = 6;
const J_MAX = 8;
const NODE_CACHE = [];
const ORIGIN = Object.freeze({ ch: ONE, eu: ONE, emu: ONE, origin: true });

// きざみ 2^−j の点（t > 0。j ＝ 0 は t ＝ 1, 2, …、ほかは奇数 × きざみ）
function levelNodes(j) {
  if (NODE_CACHE[j]) return NODE_CACHE[j];
  const h = N.frac(1n, 1n << BigInt(j));
  const nodes = [];
  for (let m = 1; ; m += j === 0 ? 1 : 2) {
    const t = N.mul(I(m), h);
    if (N.toNumber(t) > T_MAX) break;
    const et = N.exp(t);
    const emt = N.div(ONE, et);
    const ch = N.mul(N.add(et, emt), HALF);
    const u = N.mul(HALF_PI, N.mul(N.sub(et, emt), HALF));
    const eu = N.exp(u);
    nodes.push({ ch, eu, emu: N.div(ONE, eu) });
  }
  NODE_CACHE[j] = nodes;
  return nodes;
}

// 点 → { x, w（重み）, near（端までの距離。端がないときは null）, edge（端の x）}
function makeMap(a, b) {
  if (!a.inf && !b.inf) {
    const half = N.mul(N.sub(b, a), HALF);
    const k = N.mul(I(4), half);
    return (nd, sg) => {
      const sum = N.add(nd.eu, nd.emu);
      const w = N.div(N.mul(N.mul(HALF_PI, nd.ch), k), N.mul(sum, sum));
      const off = N.div(N.mul(half, N.mul(I(2), nd.emu)), sum);
      return sg > 0 ? { x: N.sub(b, off), w, near: off, edge: b } : { x: N.add(a, off), w, near: off, edge: a };
    };
  }
  if (!a.inf) {
    return (nd, sg) => {
      const e = sg > 0 ? nd.eu : nd.emu;
      return { x: N.add(a, e), w: N.mul(N.mul(HALF_PI, nd.ch), e), near: sg < 0 ? e : null, edge: a };
    };
  }
  if (!b.inf) {
    return (nd, sg) => {
      const e = sg > 0 ? nd.eu : nd.emu;
      return { x: N.sub(b, e), w: N.mul(N.mul(HALF_PI, nd.ch), e), near: sg < 0 ? e : null, edge: b };
    };
  }
  return (nd, sg) => {
    const sh = N.mul(N.sub(nd.eu, nd.emu), HALF);
    const chu = N.mul(N.add(nd.eu, nd.emu), HALF);
    return { x: sg > 0 ? sh : N.neg(sh), w: N.mul(N.mul(HALF_PI, nd.ch), chu), near: null };
  };
}

const shortText = (x) => {
  const r = N.roundSig(x, 6);
  const v = Number(`${r.neg ? '-' : ''}0.${r.digits}e${r.exp}`);
  return String(v).replace('-', '−');
};

// 積分（数値）：うまく近づかなければ、区間を半分ずつに分けて計算する（細いとがりがある式など）
const QUAD_BUDGET = 20000; // 分けて計算するときの、f を計算する回数の上限
const SPLIT_DEPTH = 6;     // 何回まで半分にするか

function quad(tree, a, b, angle) {
  const r = quadSplit(tree, a, b, angle, 0, { left: QUAD_BUDGET });
  // 分けて計算しても 10 桁に届かないときは、答えを信用しない（ふれ続ける式など）
  if (r.digits < 6 || (r.split && r.digits < 10)) {
    if (r.tailBig) throw new CalcError('積分の値が限りなく大きくなるようです（発散）');
    throw new CalcError('うまく計算できませんでした（ふれ続ける式や、とがった所・切れた所がある式など）');
  }
  const vLog = log10Abs(r.value);
  if (N.isZero(r.value) || vLog < r.errLog + 1) return { value: ZERO, exact: false, digits: null, approxZero: true };
  const sig = Math.min(MAX_DIGITS, Math.floor(vLog - r.errLog));
  return { value: roundTo(r.value, sig), exact: false, digits: sig, tailBig: r.tailBig };
}

// 誤差の大きさ（log10）をたす
function addLog(x, y) {
  if (x === -Infinity) return y;
  if (y === -Infinity) return x;
  const m = Math.max(x, y);
  return m + Math.log10(1 + 10 ** (Math.min(x, y) - m));
}

function quadSplit(tree, a, b, angle, depth, budget) {
  const r = quadOnce(tree, a, b, angle, budget);
  if (r.digits >= MAX_DIGITS - 10 || a.inf || b.inf || r.tailBig || depth >= SPLIT_DEPTH || budget.left <= 0) return r;
  // f がいちばん大きかった所（とがった所）で分ける。はしに近ければ、まん中で
  const len = N.sub(b, a);
  const margin = N.mul(len, N.frac(1n, 50n));
  const inside = r.peakX && N.cmp(r.peakX, N.add(a, margin)) > 0 && N.cmp(r.peakX, N.sub(b, margin)) < 0;
  const mid = inside ? r.peakX : N.add(a, N.mul(len, HALF));
  const r1 = quadSplit(tree, a, mid, angle, depth + 1, budget);
  const r2 = quadSplit(tree, mid, b, angle, depth + 1, budget);
  const value = N.add(r1.value, r2.value);
  const errLog = addLog(r1.errLog, r2.errLog);
  const scaleLog = Math.max(r1.scaleLog, r2.scaleLog);
  const digits = errLog === -Infinity ? MAX_DIGITS + 5 : Math.floor(scaleLog - errLog);
  if (digits <= r.digits) return r; // 分けてもよくならなかった
  return { value, errLog, scaleLog, digits, tailBig: r1.tailBig || r2.tailBig, split: true };
}

// 二重指数関数型で1回計算する。返す値：{ value, errLog（誤差の log10）, scaleLog, digits, tailBig }
function quadOnce(tree, a, b, angle, budget) {
  const map = makeMap(a, b);
  let total = ZERO;
  let absSum = ZERO;
  let maxLog = -Infinity;
  let prevI = null;
  let result = null;
  let digits = 0;
  let tailBig = false;
  let peakLog = -Infinity; // |f| がいちばん大きかった所
  let peakX = null;
  for (let j = 0; j <= J_MAX; j++) {
    if (budget.left <= 0 && result) break; // 計算の回数の上限（分けて計算しているとき）
    const h = N.frac(1n, 1n << BigInt(j));
    const nodes = j === 0 ? [ORIGIN, ...levelNodes(0)] : levelNodes(j);
    tailBig = false;
    for (const sg of [1, -1]) {
      let small = 0;
      let lastLog = -Infinity;
      for (const nd of nodes) {
        if (nd.origin && sg < 0) continue;
        const p = map(nd, sg);
        if (p.edge && N.cmp(p.x, p.edge) === 0) break; // 桁が足りなくて端にくっついた
        let v;
        budget.left--;
        try {
          v = fx(tree, p.x, angle);
        } catch (error) {
          if (!(error instanceof CalcError)) throw error;
          const edgeLog = p.edge && !N.isZero(p.edge) ? log10Abs(p.edge) : 0;
          if (p.near && log10Abs(p.near) - edgeLog < -12) break; // 端のすぐそば：ここで打ち切る
          if (!p.near && log10Abs(p.x) > 15) {
            throw new CalcError(`∞ までの積分は、この式では計算できません（x ＝ ${shortText(p.x)} のような大きい所で：${error.message}）`);
          }
          throw new CalcError(`x ＝ ${shortText(p.x)} あたりで計算できません（${error.message}）`);
        }
        const vLog = log10Abs(v);
        if (vLog > peakLog) {
          peakLog = vLog;
          peakX = p.x;
        }
        const term = N.mul(p.w, v);
        total = N.add(total, term);
        absSum = N.add(absSum, N.absNum(term));
        const prevLog = lastLog;
        lastLog = log10Abs(term);
        if (lastLog > maxLog) maxLog = lastLog;
        // 小さくなっていく途中で、十分小さくなったら打ち切る（大きくなっていく途中は打ち切らない）
        if (lastLog < maxLog - (MAX_DIGITS + 15) && lastLog <= prevLog) {
          if (++small >= 2) break;
        } else {
          small = 0;
        }
      }
      if (small < 2 && lastLog > maxLog - 12) tailBig = true;
    }
    const Ij = N.mul(total, h);
    if (prevI) {
      const d = log10Abs(N.sub(Ij, prevI));
      const scale = log10Abs(N.mul(absSum, h));
      digits = d === -Infinity ? MAX_DIGITS + 5 : Math.floor(scale - d);
      result = { value: Ij, errLog: d === -Infinity ? scale - MAX_DIGITS - 5 : d, scaleLog: scale };
      if (digits >= MAX_DIGITS + 2 && j >= 3) break;
    }
    prevI = Ij;
  }
  return { ...result, digits, tailBig, peakX };
}

// =========================================================
// Σ
//   lo：BigInt、hi：BigInt か Infinity
//   返す値：{ value, method, exact, digits, formula（S(n) の係数）, poly, count }
//     method：'empty' 'formula'（多項式の公式）'direct'（1つずつ）'geometric'（等比）
//             'alternating'（符号が交互）'fast'（すぐ小さくなる）'em'（オイラー・マクローリン）
// =========================================================
const DIRECT_MAX = 10000;
const HEAD = 40;

export function sigma(tree, lo, hi, { angle = S.getAngle() } = {}) {
  if (hi !== Infinity && hi < lo) return { value: ZERO, method: 'empty', exact: true };
  const term = (k) => fx(tree, N.frac(k), angle);
  const poly = polyOf(tree, angle);
  if (poly) {
    if (hi === Infinity) {
      if (pIsZero(poly)) return { value: ZERO, method: 'formula', exact: true, poly };
      const up = N.sign(poly[poly.length - 1]) > 0;
      throw new CalcError(`足し続けると、限りなく${up ? '大きく' : '小さく'}なります（発散）`);
    }
    const formula = sumFormula(poly, lo);
    const value = pEval(formula, N.frac(hi));
    return { value, method: 'formula', exact: value.q, formula, poly, count: hi - lo + 1n };
  }
  if (hi !== Infinity && hi - lo + 1n <= BigInt(DIRECT_MAX)) {
    let sum = ZERO;
    for (let k = lo; k <= hi; k++) sum = addSum(sum, term(k));
    return { value: sum, method: 'direct', exact: sum.q, count: hi - lo + 1n };
  }
  return sigmaLong(tree, lo, hi, angle, term);
}

// S(n) ＝ Σ_{k=lo}^{n} p(k) の多項式（S(lo−1) ＝ 0 から、差分を使って作る）
export function sumFormula(p, lo) {
  const d = p.length - 1;
  const n0 = lo - 1n;
  const vals = [ZERO];
  for (let m = 1; m <= d + 1; m++) vals.push(N.add(vals[m - 1], pEval(p, N.frac(n0 + BigInt(m)))));
  // ニュートンの前進差分：S(n0 + m) ＝ Σ Δ^j S(n0) · C(m, j)
  let diffs = vals;
  let result = [ZERO];
  let basis = [ONE]; // C(n − n0, j) の多項式（n の）
  for (let j = 0; j <= d + 1; j++) {
    result = pAdd(result, pScale(basis, diffs[0]));
    // 次の C(n − n0, j+1) ＝ C(n − n0, j) × (n − n0 − j) ／ (j + 1)
    basis = pScale(pMul(basis, [N.frac(-(n0 + BigInt(j))), ONE]), N.frac(1n, BigInt(j + 1)));
    diffs = diffs.slice(1).map((v, i) => N.sub(v, diffs[i]));
    if (diffs.length === 0) break;
  }
  return result;
}

function sigmaLong(tree, lo, hi, angle, term) {
  const terms = [];
  for (let i = 0; i < HEAD; i++) terms.push(term(lo + BigInt(i)));
  const count = hi === Infinity ? null : hi - lo + 1n;

  // 等比数列（となりどうしの比が、ちょうど同じ）
  const r = geometricRatio(terms);
  if (r) {
    const t0 = terms[0];
    const one_r = N.sub(ONE, r);
    if (hi === Infinity) {
      if (N.cmp(N.absNum(r), ONE) >= 0) {
        throw new CalcError(N.sign(r) > 0 ? '足し続けると、限りなく大きくなります（発散）' : '足し続けても値が決まりません（ふれ続けます）');
      }
      return { value: N.div(t0, one_r), method: 'geometric', exact: t0.q, ratio: r };
    }
    let rn;
    try {
      rn = N.pow(r, N.frac(count));
    } catch (error) {
      if (!(error instanceof CalcError) || N.cmp(N.absNum(r), ONE) >= 0) throw error;
      rn = ZERO; // 小さすぎて 0 とみなせる
    }
    const value = N.div(N.mul(t0, N.sub(ONE, rn)), one_r);
    return { value, method: 'geometric', exact: value.q, ratio: r, count };
  }

  if (hi === Infinity) {
    // 項が 1/k より遅く小さくなるなら発散（x → ∞ での級数の次数で見る）
    const order = decayOrder(tree, angle);
    if (order !== null && order <= 0) throw new CalcError('項が 0 に近づかないので、足し続けても値が決まりません（発散）');
    if (order !== null && order <= 1) throw new CalcError('項は 0 に近づきますが、ゆっくりすぎて、足し続けると限りなく大きくなります（発散）');
    if (alternates(terms)) {
      if (!shrinking(terms)) throw new CalcError('項が 0 に近づかないので、足し続けても値が決まりません（ふれ続けます）');
      return alternatingSum(term, lo, terms);
    }
  }
  if (fastDecay(terms)) {
    const r2 = directUntilTiny(term, lo, hi, terms);
    if (r2) return r2;
  }
  return eulerMaclaurin(tree, lo, hi, angle, terms, term);
}

function geometricRatio(terms) {
  if (!terms.every((t) => t.q && !N.isZero(t))) return null;
  const r = N.div(terms[1], terms[0]);
  for (let i = 1; i + 1 < terms.length; i++) {
    if (N.cmp(N.mul(terms[i], r), terms[i + 1]) !== 0) return null;
  }
  return r;
}

const alternates = (terms) => terms.every((t, i) => i === 0 || N.sign(t) * N.sign(terms[i - 1]) < 0);

function shrinking(terms) {
  const L = terms.map(log10Abs);
  const n = L.length;
  return L[n - 1] < L[0] - 0.3 && L.slice(-6).every((v, i, arr) => i === 0 || v <= arr[i - 1]);
}

function fastDecay(terms) {
  const tail = terms.slice(-11);
  if (tail.some((t) => N.isZero(t))) return false;
  for (let i = 1; i < tail.length; i++) {
    if (log10Abs(tail[i]) - log10Abs(tail[i - 1]) > Math.log10(0.9)) return false;
  }
  return true;
}

// すぐ小さくなる項：小さくなって効かなくなるまで、そのまま足す
function directUntilTiny(term, lo, hi, terms) {
  let sum = ZERO;
  for (const t of terms) sum = addSum(sum, t);
  let k = lo + BigInt(terms.length);
  let tiny = 0;
  for (let i = 0; i < 20000; i++, k++) {
    if (hi !== Infinity && k > hi) return { value: sum, method: 'fast', exact: sum.q, count: hi - lo + 1n };
    const t = term(k);
    sum = addSum(sum, t);
    if (log10Abs(t) < log10Abs(sum) - (N.P - 5)) {
      if (++tiny >= 3) return { value: N.toApprox(sum), method: 'fast', exact: false, digits: null, count: hi === Infinity ? null : hi - lo + 1n };
    } else {
      tiny = 0;
    }
  }
  return null;
}

// 符号が交互の和：コーエン・ビジェガス・ザギエの加速（Σ (−1)^k a_k）
function cvz(a, n) {
  let d = N.pow(N.add(I(3), N.sqrt(I(8))), I(n));
  d = N.mul(N.add(d, N.div(ONE, d)), HALF);
  let b = I(-1);
  let c = N.neg(d);
  let s = ZERO;
  for (let k = 0; k < n; k++) {
    c = N.sub(b, c);
    s = N.add(s, N.mul(c, a[k]));
    b = N.div(N.mul(N.mul(I(k + n), I(k - n)), b), N.mul(N.add(I(k), HALF), I(k + 1)));
  }
  return N.div(s, d);
}

function alternatingSum(term, lo, terms) {
  const n1 = 56;
  const n2 = 72;
  const all = [...terms];
  for (let i = all.length; i < n2; i++) all.push(term(lo + BigInt(i)));
  const a = all.map((t) => N.toApprox(N.absNum(t)));
  const sg = N.sign(all[0]) > 0 ? ONE : I(-1);
  const v2 = N.mul(sg, cvz(a, n2));
  const v1 = N.mul(sg, cvz(a, n1));
  const d = log10Abs(N.sub(v2, v1));
  const digits = d === -Infinity ? MAX_DIGITS : Math.min(MAX_DIGITS, Math.floor(log10Abs(v2) - d));
  if (digits < 3) throw new CalcError('うまく計算できませんでした（項の大きさが、なめらかに小さくならない式など）');
  return { value: roundTo(v2, digits), method: 'alternating', exact: false, digits };
}

// x → ∞ で、f(x) が 1/x の何乗のように小さくなるか（わからなければ null）
function decayOrder(tree, angle) {
  try {
    const s = seriesAt(tree, { inf: 1 }, angle, 4);
    if (isZeroS(s)) return s.o === Infinity ? Infinity : null;
    return s.v;
  } catch (error) {
    if (error instanceof SeriesFail || error instanceof CalcError) return null;
    throw error;
  }
}

// ベルヌーイ数 B0〜B_n（正確な分数）
const BERNOULLI = [];
function bernoulli(n) {
  if (BERNOULLI.length > n) return BERNOULLI[n];
  if (BERNOULLI.length === 0) BERNOULLI.push(ONE);
  for (let m = BERNOULLI.length; m <= n; m++) {
    let sum = ZERO;
    let c = 1n; // C(m+1, k)
    for (let k = 0; k < m; k++) {
      sum = N.add(sum, N.mul(N.frac(c), BERNOULLI[k]));
      c = (c * BigInt(m + 1 - k)) / BigInt(k + 1);
    }
    BERNOULLI.push(N.div(N.neg(sum), I(m + 1)));
  }
  return BERNOULLI[n];
}

// オイラー・マクローリン：Σ_{k=N0}^{M} f(k) ≒ ∫ f ＋ (f(N0) ＋ f(M))/2 ＋ Σ B_2j/(2j)! (f^(2j−1)(M) − f^(2j−1)(N0))
function eulerMaclaurin(tree, lo, hi, angle, terms, term) {
  const J = 14;
  const K = 2 * J + 1;
  const N0 = lo + BigInt(terms.length);
  let head = ZERO;
  for (const t of terms) head = addSum(head, t);
  const series = (x) => {
    try {
      return seriesAt(tree, N.frac(x), angle, K);
    } catch (error) {
      if (error instanceof SeriesFail || error instanceof CalcError) {
        throw new CalcError(hi === Infinity
          ? 'この Σ は計算できません（k に整数しか入れられない式や、なめらかでない式など）'
          : `この Σ は計算できません（項が ${DIRECT_MAX.toLocaleString()} 個より多く、なめらかでない式など）`);
      }
      throw error;
    }
  };
  const s0 = series(N0);
  const s1 = hi === Infinity ? null : series(hi);
  let integ;
  try {
    integ = quad(tree, N.frac(N0), hi === Infinity ? { inf: 1 } : N.frac(hi), angle);
  } catch (error) {
    if (!(error instanceof CalcError)) throw error;
    if (/発散/.test(error.message)) throw new CalcError('足し続けると、限りなく大きくなるようです（発散）');
    throw new CalcError(hi === Infinity
      ? 'この Σ は、∞ までの和を出せませんでした（sin や cos が入って、ふれながらゆっくり小さくなる式など）'
      : `この Σ は計算できません（項が ${DIRECT_MAX.toLocaleString()} 個より多く、ふれながら変わる式など）`);
  }
  let tail = N.add(integ.value, N.mul(HALF, N.add(coef(s0, 0), s1 ? coef(s1, 0) : ZERO)));
  let lastLog = -Infinity;
  for (let j = 1; j <= J; j++) {
    const m = 2 * j - 1;
    const diff = N.sub(s1 ? coef(s1, m) : ZERO, coef(s0, m));
    const corr = N.mul(N.div(bernoulli(2 * j), I(2 * j)), diff);
    tail = N.add(tail, corr);
    lastLog = log10Abs(corr);
  }
  const total = N.add(head, tail);
  const tLog = log10Abs(total);
  const emDigits = Math.floor(tLog - lastLog);
  const qDigits = integ.approxZero ? MAX_DIGITS : Math.floor(tLog - (log10Abs(integ.value) - integ.digits));
  const digits = Math.max(0, Math.min(MAX_DIGITS, emDigits, qDigits));
  if (digits < 3) throw new CalcError('うまく計算できませんでした（項がふれながら変わる式など）');
  return {
    value: roundTo(total, digits), method: 'em', exact: false, digits,
    count: hi === Infinity ? null : hi - lo + 1n,
  };
}

// =========================================================
// 検算用
// =========================================================

// 差の商 (f(a＋h) − f(a)) ÷ h を、h を小さくしながら
export function diffQuotients(tree, a, { angle = S.getAngle() } = {}) {
  const fa = fx(tree, a, angle);
  const rows = [];
  for (let k = 1; k <= 5; k++) {
    const h = N.frac(1n, 10n ** BigInt(k));
    try {
      rows.push({ h, value: N.div(N.sub(fx(tree, N.add(a, h), angle), fa), h) });
    } catch (error) {
      if (!(error instanceof CalcError)) throw error;
      rows.push({ h: N.neg(h), value: N.div(N.sub(fx(tree, N.sub(a, h), angle), fa), N.neg(h)) });
    }
  }
  return rows;
}

// 長方形で近づける（区間を n 等分して、まん中の高さ × はば を足す）
export function riemann(tree, a, b, n, { angle = S.getAngle() } = {}) {
  const w = N.toApprox(N.div(N.sub(b, a), I(n)));
  let sum = ZERO;
  for (let i = 0; i < n; i++) {
    const x = N.add(a, N.mul(w, N.add(I(i), HALF)));
    sum = N.add(sum, N.toApprox(fx(tree, x, angle)));
  }
  return N.mul(sum, w);
}

// 途中までの和（lo から n 個）
export function partialSums(tree, lo, counts, { angle = S.getAngle() } = {}) {
  const max = Math.max(...counts);
  const out = [];
  let sum = ZERO;
  for (let i = 1; i <= max; i++) {
    sum = addSum(sum, fx(tree, N.frac(lo + BigInt(i - 1)), angle));
    if (counts.includes(i)) out.push({ n: i, upto: lo + BigInt(i - 1), value: sum });
  }
  return out;
}

// x を近づけたときの f(x) の表
export function limitTable(tree, at, side, { angle = S.getAngle() } = {}) {
  const sides = at.inf ? ['inf'] : side === 'both' ? ['right', 'left'] : [side];
  return sides.map((sd) => ({
    side: sd,
    rows: approachPoints(at, sd, 5, 1).map((x) => {
      try {
        return { x, value: fx(tree, x, angle) };
      } catch (error) {
        if (!(error instanceof CalcError)) throw error;
        return { x, error: error.message };
      }
    }),
  }));
}
