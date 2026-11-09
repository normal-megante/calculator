// =========================================================
// 数のしくみ：誤差をできるだけ出さないための「数」の計算
//
// ふつうの電卓アプリは、数を「2進数で約16桁」の形で持つので、
// 細かい計算で小さなずれが出たり、大きすぎる数を表せなくなったりします。
// この電卓では、数を次の2つの形で持ちます。
//
//   ・正確な数（分数）: { q: true,  n: 分子, d: 分母 }
//       たし算・ひき算・かけ算・わり算・整数の累乗は、分数のまま計算するので誤差ゼロ。
//       1÷3×3 はぴったり 1、0.1＋0.2 はぴったり 0.3 になります。
//       約10万桁までは正確なまま持ちます（それより大きいと概数に切り替え）。
//   ・概数:            { q: false, m: 仮数, e: 指数 }   値 ＝ m × 10^e
//       √2 のように割り切れない数。有効数字 P 桁（80桁）で計算し、
//       画面には SHOW 桁（50桁）までを四捨五入して出します（下の30桁は誤差の吸収用）。
//
// n, d, m, e はすべて BigInt（桁数に制限のない整数）です。
// 指数 e は ±10^15 まで（＝10 の 1000兆乗 まで）扱えます。
// =========================================================

export const P = 80;                  // 概数の計算に使う桁数（有効数字）
export const SHOW = 50;               // 概数を画面に出すときの桁数
export const EXACT_LIMIT_BITS = 340000; // 分子と分母の大きさの合計がこれ（約10万桁）を超えたら概数にする
const MAX_EXP = 10n ** 15n;           // 指数の上限（10 の 1000兆乗）
const CANCEL_KEEP = 15;               // 概数どうしの引き算で、上から (P − 15) 桁以上が打ち消し合ったら 0 とみなす
const LOG10_2 = Math.log10(2);

// 計算できないときのエラー。kind は
//   'math'       … 0 で割ったなど、計算そのものができない
//   'syntax'     … 式の形がおかしい
//   'incomplete' … 式が途中で終わっている
export class CalcError extends Error {
  constructor(message, kind = 'math') {
    super(message);
    this.name = 'CalcError';
    this.kind = kind;
  }
}

export const ZERO = Object.freeze({ q: true, n: 0n, d: 1n });
export const ONE = Object.freeze({ q: true, n: 1n, d: 1n });
const APPROX_ZERO = Object.freeze({ q: false, m: 0n, e: 0n });

// ---------------------------------------------------------
// 整数（BigInt）の小道具
// ---------------------------------------------------------

function babs(x) {
  return x < 0n ? -x : x;
}

// 2進数で何桁か（0 は 0）
export function bitLen(x) {
  x = babs(x);
  if (x === 0n) return 0;
  const s = x.toString(16);
  return (s.length - 1) * 4 + (32 - Math.clz32(parseInt(s[0], 16)));
}

// 10進数で何桁か（0 は 0）。何百桁くらいまでの数に使う
function digitLen(x) {
  x = babs(x);
  return x === 0n ? 0 : x.toString().length;
}

function gcd(a, b) {
  a = babs(a);
  b = babs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

const POW10 = [];
export function pow10(k) {
  k = Number(k);
  if (k < 400) return (POW10[k] ??= 10n ** BigInt(k));
  return 10n ** BigInt(k);
}

// a ÷ b を整数に丸める（ちょうど半分のときは偶数のほうへ。誤差がかたよらない）
function divRound(a, b) {
  if (b < 0n) { a = -a; b = -b; }
  let q = a / b;
  const r = a - q * b;
  if (r === 0n) return q;
  const r2 = babs(r) * 2n;
  if (r2 > b || (r2 === b && (q & 1n) !== 0n)) q += a < 0n ? -1n : 1n;
  return q;
}

// 整数の平方根（切り捨て）
export function isqrt(n) {
  if (n < 0n) throw new RangeError('isqrt of negative');
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(bitLen(n) / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

// 整数の k 乗根（切り捨て）
export function iroot(n, k) {
  if (n < 2n || k === 1) return n;
  const K = BigInt(k);
  let x = 1n << BigInt(Math.ceil(bitLen(n) / k));
  for (;;) {
    const y = ((K - 1n) * x + n / x ** (K - 1n)) / K;
    if (y >= x) return x;
    x = y;
  }
}

// ---------------------------------------------------------
// 数を作る
// ---------------------------------------------------------

// 分数 n/d（約分して、大きすぎれば概数にする）
export function frac(n, d = 1n) {
  n = BigInt(n);
  d = BigInt(d);
  if (d === 0n) throw new CalcError('0 で割ることはできません');
  if (d < 0n) { n = -n; d = -d; }
  if (d !== 1n) {
    const g = gcd(n, d);
    if (g > 1n) { n /= g; d /= g; }
  }
  return exactOrApprox(n, d);
}

// すでに約分ずみの n/d
function exactOrApprox(n, d) {
  if (n === 0n) return ZERO;
  if (bitLen(n) + bitLen(d) > EXACT_LIMIT_BITS) return toApprox({ q: true, n, d }, P);
  return { q: true, n, d };
}

// 「12.5」のような 10進数の文字列から（正確な数）
export function parseDecimal(text) {
  const [intPart = '', fracPart = ''] = text.split('.');
  const digits = intPart + fracPart || '0';
  return frac(BigInt(digits), pow10(fracPart.length));
}

// 概数を作る（p 桁に丸め、末尾の 0 をとる）
function approx(m, e, p = P) {
  if (m === 0n) return APPROX_ZERO;
  const len = digitLen(m);
  if (len > p) {
    const cut = len - p;
    m = divRound(m, pow10(cut));
    e += BigInt(cut);
    if (digitLen(m) > p) { m /= 10n; e += 1n; } // 99…9 が 100…0 に繰り上がったとき
  }
  while (m % 10n === 0n) { m /= 10n; e += 1n; }
  const top = e + BigInt(digitLen(m));
  if (top > MAX_EXP) throw new CalcError('数が大きすぎて扱えません');
  if (top < -MAX_EXP) throw new CalcError('数が小さすぎて扱えません');
  return { q: false, m, e };
}

// 正確な数を、p 桁の概数にする
export function toApprox(x, p = P) {
  if (!x.q) return digitLen(x.m) > p ? approx(x.m, x.e, p) : x;
  const { n, d } = x;
  if (n === 0n) return APPROX_ZERO;
  if (d === 1n) return approx(n, 0n, p);
  // |n/d| のおおよその桁を見積もって、ちょうど p 桁の整数になるよう 10^k をかけて割る
  const est = Math.floor((bitLen(n) - bitLen(d)) * LOG10_2);
  let k = p - 1 - est;
  for (let i = 0; i < 5; i++) {
    const [num, den] = k >= 0 ? [n * pow10(k), d] : [n, d * pow10(-k)];
    const len = digitLen(babs(num) / den);
    if (len === p) return approx(divRound(num, den), BigInt(-k), p);
    k += p - len;
  }
  throw new Error('toApprox: 桁合わせに失敗');
}

// ---------------------------------------------------------
// 性質
// ---------------------------------------------------------

export function sign(x) {
  const v = x.q ? x.n : x.m;
  return v > 0n ? 1 : v < 0n ? -1 : 0;
}

export function isZero(x) {
  return sign(x) === 0;
}

// 正確な整数か
export function isInteger(x) {
  return x.q && x.d === 1n;
}

export function neg(x) {
  return x.q ? { q: true, n: -x.n, d: x.d } : { q: false, m: -x.m, e: x.e };
}

export function absNum(x) {
  return sign(x) < 0 ? neg(x) : x;
}

// 大きさのおおよその log10（グラフや見積もり用。正確さは15桁ほど）
export function approxLog10(x) {
  if (x.q) return log10Big(babs(x.n)) - log10Big(x.d);
  return log10Big(babs(x.m)) + Number(x.e);
}

function log10Big(n) {
  if (n === 0n) return -Infinity;
  const b = bitLen(n);
  if (b <= 53) return Math.log10(Number(n));
  const sh = b - 53;
  return Math.log10(Number(n >> BigInt(sh))) + sh * LOG10_2;
}

// JavaScript のふつうの数（おおよそ）に
export function toNumber(x) {
  const s = sign(x);
  if (s === 0) return 0;
  return s * 10 ** approxLog10(x);
}

// ---------------------------------------------------------
// 四則演算
// ---------------------------------------------------------

export function add(a, b, p = P) {
  if (a.q && b.q) {
    if (a.d === b.d) return frac(a.n + b.n, a.d);
    return frac(a.n * b.d + b.n * a.d, a.d * b.d);
  }
  return approxAdd(toApprox(a, p + 5), toApprox(b, p + 5), p);
}

export function sub(a, b, p = P) {
  return add(a, neg(b), p);
}

// 概数の足し算
function approxAdd(a, b, p) {
  if (a.m === 0n) return approx(b.m, b.e, p);
  if (b.m === 0n) return approx(a.m, a.e, p);
  const ma = a.e + BigInt(digitLen(a.m)); // 10^(ma−1) ≤ |a| < 10^ma
  const mb = b.e + BigInt(digitLen(b.m));
  const far = BigInt(p + 3);
  if (ma - mb > far) return approx(a.m, a.e, p); // b が小さすぎて a に影響しない
  if (mb - ma > far) return approx(b.m, b.e, p);
  const e = a.e < b.e ? a.e : b.e;
  const m = a.m * pow10(a.e - e) + b.m * pow10(b.e - e);
  if (m === 0n) return APPROX_ZERO;
  // 打ち消し合って、誤差の部分しか残らなかったら 0 とみなす（√2×√2−2 を 0 にするため）
  const top = ma > mb ? ma : mb;
  if (e + BigInt(digitLen(m)) <= top - BigInt(p - CANCEL_KEEP)) return APPROX_ZERO;
  return approx(m, e, p);
}

export function mul(a, b, p = P) {
  if (a.q && b.q) {
    const g1 = gcd(a.n, b.d);
    const g2 = gcd(b.n, a.d);
    return exactOrApprox((a.n / g1) * (b.n / g2), (a.d / g2) * (b.d / g1));
  }
  if ((a.q && a.n === 0n) || (b.q && b.n === 0n)) return ZERO;
  const x = toApprox(a, p + 5);
  const y = toApprox(b, p + 5);
  return approx(x.m * y.m, x.e + y.e, p);
}

export function div(a, b, p = P) {
  if (isZero(b)) throw new CalcError('0 で割ることはできません');
  if (a.q && b.q) {
    const g1 = gcd(a.n, b.n);
    const g2 = gcd(a.d, b.d);
    let n = (a.n / g1) * (b.d / g2);
    let d = (a.d / g2) * (b.n / g1);
    if (d < 0n) { n = -n; d = -d; }
    return exactOrApprox(n, d);
  }
  if (a.q && a.n === 0n) return ZERO;
  const x = toApprox(a, p + 5);
  const y = toApprox(b, p + 5);
  const shift = Math.max(0, p + 3 + digitLen(y.m) - digitLen(x.m));
  return approx(divRound(x.m * pow10(shift), y.m), x.e - y.e - BigInt(shift), p);
}

// ---------------------------------------------------------
// 平方根・累乗
// ---------------------------------------------------------

export function sqrt(a, p = P) {
  const s = sign(a);
  if (s < 0) throw new CalcError('負の数の √ は、いまは計算できません');
  if (s === 0) return ZERO;
  if (a.q) {
    // 4/9 のように、分子も分母も「ある数の2乗」なら正確に
    const rn = isqrt(a.n);
    const rd = isqrt(a.d);
    if (rn * rn === a.n && rd * rd === a.d) return frac(rn, rd);
  }
  const x = toApprox(a, p + 5);
  let shift = Math.max(0, 2 * p + 4 - digitLen(x.m));
  if ((x.e - BigInt(shift)) % 2n !== 0n) shift += 1;
  const r = isqrt(x.m * pow10(shift));
  return approx(r, (x.e - BigInt(shift)) / 2n, p);
}

// a の b 乗
export function pow(a, b, p = P) {
  if (b.q && b.d === 1n) return powInt(a, b.n, p);
  const sa = sign(a);
  if (sa === 0) {
    if (sign(b) > 0) return ZERO;
    if (sign(b) === 0) return ONE;
    throw new CalcError('0 で割ることはできません');
  }
  if (b.q) {
    // 分数の累乗 a^(n/d)。d 乗根をとってから n 乗する
    if (sa < 0 && b.d % 2n === 0n) {
      throw new CalcError('負の数のこの累乗（偶数乗根）は、いまは計算できません');
    }
    if (a.q && b.d <= 64n) {
      const k = Number(b.d);
      const an = babs(a.n);
      const rn = iroot(an, k);
      const rd = iroot(a.d, k);
      if (rn ** b.d === an && rd ** b.d === a.d) {
        return powInt(frac(sa < 0 ? -rn : rn, rd), b.n, p); // 8^(2/3) = 4 のように正確に
      }
    }
    const r = powReal(absNum(a), b, p);
    return sa < 0 && b.n % 2n !== 0n ? neg(r) : r;
  }
  if (sa < 0) throw new CalcError('負の数の、小数での累乗は計算できません');
  return powReal(a, b, p);
}

// 整数乗
function powInt(a, k, p) {
  if (k === 0n) return ONE; // 0 の 0 乗も 1 とする（ふつうの電卓と同じ）
  if (isZero(a)) {
    if (k < 0n) throw new CalcError('0 で割ることはできません');
    return ZERO;
  }
  const K = babs(k);
  if (a.q) {
    if (a.d === 1n && (a.n === 1n || a.n === -1n)) {
      return a.n === -1n && (K & 1n) ? frac(-1n) : ONE;
    }
    const bits = bitLen(a.n) + bitLen(a.d);
    if (K <= BigInt(EXACT_LIMIT_BITS) && bits * Number(K) <= EXACT_LIMIT_BITS) {
      const n = a.n ** K;
      const d = a.d ** K;
      return k > 0n ? { q: true, n, d } : frac(d, n); // 約分ずみの数の累乗は約分ずみ
    }
  }
  // 大きすぎるので概数で。先に結果の大きさを見積もる
  const est = approxLog10(a) * Number(K);
  if (!(Math.abs(est) < 1e15)) {
    throw new CalcError((est > 0) === (k > 0n) ? '数が大きすぎて扱えません' : '数が小さすぎて扱えません');
  }
  const wp = p + digitLen(K) + 10;
  let base = toApprox(a, wp);
  let result = null;
  let e = K;
  while (e > 0n) {
    if (e & 1n) result = result ? approx(result.m * base.m, result.e + base.e, wp) : base;
    e >>= 1n;
    if (e > 0n) base = approx(base.m * base.m, base.e + base.e, wp);
  }
  if (k < 0n) result = div(ONE, result, wp);
  return approx(result.m, result.e, p);
}

// 正の数 a の、整数でない b 乗：exp(b × ln a)
function powReal(a, b, p) {
  const lg = approxLog10(a) * toNumber(b); // 結果のおおよその log10
  if (!(Math.abs(lg) < 1e15)) {
    throw new CalcError(lg > 0 ? '数が大きすぎて扱えません' : '数が小さすぎて扱えません');
  }
  const intDigits = Math.ceil(Math.log10(Math.abs(lg * Math.LN10) + 2));
  const bDigits = Math.max(0, Math.ceil(approxLog10(absNum(b))));
  const wp = p + 20 + intDigits + bDigits;
  const L = lnFixed(toApprox(a, wp), wp);
  return expFixed(mulFixed(b, L), wp, p);
}

// ---------------------------------------------------------
// 指数関数・対数（固定小数点：値 × 10^wp の整数で計算する）
// ---------------------------------------------------------

// x × Y（Y は固定小数点、x はふつうの数）
function mulFixed(x, Y) {
  if (x.q) return divRound(Y * x.n, x.d);
  return x.e >= 0n ? Y * x.m * pow10(x.e) : divRound(Y * x.m, pow10(-x.e));
}

// atanh(U) を級数で：U + U^3/3 + U^5/5 + …
function atanhFixed(U, S) {
  const U2 = (U * U) / S;
  let term = U;
  let sum = U;
  for (let k = 3n; ; k += 2n) {
    term = (term * U2) / S;
    if (term === 0n) return sum;
    sum += term / k;
  }
}

const constants = new Map();
// 定数を wp 桁で（一度計算したら覚えておく）
function constantFixed(name, wp, compute) {
  const known = constants.get(name);
  if (known && known.wp >= wp) return divRound(known.value, pow10(known.wp - wp));
  const value = compute(wp + 10);
  constants.set(name, { wp: wp + 10, value });
  return divRound(value, pow10(10));
}

// ln 2 = 2 atanh(1/3)
function ln2Fixed(wp) {
  return constantFixed('ln2', wp, (w) => {
    const S = pow10(w);
    return 2n * atanhFixed(divRound(S, 3n), S);
  });
}

// ln 10 = 3 ln 2 + ln 1.25 = 3 ln 2 + 2 atanh(1/9)
function ln10Fixed(wp) {
  return constantFixed('ln10', wp, (w) => {
    const S = pow10(w);
    return 3n * ln2Fixed(w) + 2n * atanhFixed(divRound(S, 9n), S);
  });
}

// ln x（x は正の概数）を固定小数点で
function lnFixed(x, wp) {
  const S = pow10(wp);
  const len = digitLen(x.m);
  // x = t × 10^E（t は 1 以上 10 未満）
  const E = x.e + BigInt(len - 1);
  const shift = wp - (len - 1);
  let T = shift >= 0 ? x.m * pow10(shift) : divRound(x.m, pow10(-shift));
  // t を 2^k で割って 1 の近くにする
  const lead = Number(x.m.toString().slice(0, 15)) / 10 ** (Math.min(len, 15) - 1);
  const k = Math.round(Math.log2(lead));
  T >>= BigInt(k);
  // ln r = 2 atanh((r − 1)/(r + 1))
  const U = divRound((T - S) * S, T + S);
  return 2n * atanhFixed(U, S) + BigInt(k) * ln2Fixed(wp) + E * ln10Fixed(wp);
}

// exp(Y)（Y は固定小数点）を p 桁の概数で
function expFixed(Y, wp, p) {
  const S = pow10(wp);
  const LN10 = ln10Fixed(wp);
  const K = divRound(Y, LN10); // exp(y) = exp(r) × 10^K
  const halvings = 12;
  const R = (Y - K * LN10) >> BigInt(halvings); // r を 2^12 で割って小さくする
  let term = S;
  let sum = S;
  for (let i = 1n; ; i++) {
    term = (term * R) / (S * i);
    if (term === 0n) break;
    sum += term;
  }
  for (let i = 0; i < halvings; i++) sum = (sum * sum) / S; // 2乗して戻す
  return approx(sum, K - BigInt(wp), p);
}

// e^x と ln x
export function exp(x, p = P) {
  if (isZero(x)) return ONE;
  const intDigits = Math.max(1, Math.ceil(approxLog10(absNum(x))) + 1);
  if (intDigits > 17) throw new CalcError(sign(x) > 0 ? '数が大きすぎて扱えません' : '数が小さすぎて扱えません');
  const wp = p + 20 + intDigits;
  const S = pow10(wp);
  return expFixed(mulFixed(x, S), wp, p);
}

export function ln(x, p = P) {
  if (sign(x) <= 0) throw new CalcError('0 や負の数の対数は計算できません');
  if (x.q && x.n === x.d) return ZERO;
  const diff = sub(x, ONE);
  if (isZero(diff)) return APPROX_ZERO;
  // 1 に近い数は、ln の値が小さくなるので、その分だけ桁を増やして計算する
  const near = approxLog10(absNum(diff));
  const extra = near < 0 ? Math.ceil(-near) : 0;
  const wp = p + 20 + extra;
  const L = lnFixed(toApprox(x, wp), wp);
  return approx(L, BigInt(-wp), p);
}

// ---------------------------------------------------------
// 円周率と三角関数（関数電卓。これも固定小数点で計算する）
// ---------------------------------------------------------

// atan(1/n) を級数で：1/n − 1/(3n³) + 1/(5n⁵) − …
function atanInvFixed(n, S) {
  const n2 = n * n;
  let term = S / n;
  let sum = term;
  for (let k = 1n; ; k++) {
    term /= n2;
    if (term === 0n) return sum;
    const t = term / (2n * k + 1n);
    sum += k % 2n === 1n ? -t : t;
  }
}

// π = 16 atan(1/5) − 4 atan(1/239)（マチンの式）
function piFixed(wp) {
  return constantFixed('pi', wp, (w) => {
    const S = pow10(w);
    return 16n * atanInvFixed(5n, S) - 4n * atanInvFixed(239n, S);
  });
}

export function pi(p = P) {
  const wp = p + 10;
  return approx(piFixed(wp), BigInt(-wp), p);
}

// sin と cos（X はラジアンの固定小数点、|X| ≦ π/4）をテイラー級数で
function sinCosFixed(X, S) {
  const X2 = (X * X) / S;
  let s = X;
  let c = S;
  let ts = X;
  let tc = S;
  for (let i = 1n; ts !== 0n || tc !== 0n; i++) {
    ts = -(ts * X2) / (S * (2n * i) * (2n * i + 1n));
    tc = -(tc * X2) / (S * (2n * i - 1n) * (2n * i));
    s += ts;
    c += tc;
  }
  return { s, c };
}

// 回転の割合 t（1 ＝ 1回転）の、1 未満の部分 × 10^wp（0 以上 10^wp 未満）
function turnFixed(t, wp) {
  const S = pow10(wp);
  if (t.q) return ((((t.n % t.d) + t.d) % t.d) * S) / t.d;
  const k = t.e + BigInt(wp);
  const scaled = k >= 0n ? t.m * pow10(k) : divRound(t.m, pow10(-k));
  return ((scaled % S) + S) % S;
}

// 角度を「回転の割合」t（1 ＝ 360° ＝ 2π）で受け取って、sin と cos を p 桁の概数で
//   45° ごとに区切り、区切りの中の 45° 未満の角度にして級数で計算する
export function sinCosTurn(t, p = P) {
  let wp = p + 20;
  for (let attempt = 0; ; attempt++) {
    const S = pow10(wp);
    const R = turnFixed(t, wp);
    const eighth = S / 8n;
    const k = R / eighth;          // 0〜7（どの 45° の区切りか）
    const PI = piFixed(wp);
    let X = ((R - k * eighth) * 2n * PI) / S;
    const odd = k % 2n === 1n;
    if (odd) X = PI / 4n - X;       // 45°〜90° の区切りは、90° から引いて小さくする
    let { s, c } = sinCosFixed(X, S);
    if (odd) [s, c] = [c, s];
    const j = k / 2n;              // 90° を何回まわすか
    const [sin, cos] = j === 0n ? [s, c] : j === 1n ? [c, -s] : j === 2n ? [-s, -c] : [-c, s];
    // 0 に近い答えは、上の桁が 0 になって桁が足りなくなるので、桁を増やしてやり直す
    const lost = wp - Math.min(digitLen(sin) || 1, digitLen(cos) || 1);
    if (lost > 15 && attempt < 3) {
      wp += lost;
      continue;
    }
    return { sin: approx(sin, BigInt(-wp), p), cos: approx(cos, BigInt(-wp), p) };
  }
}

// atan（X は固定小数点）→ ラジアンの固定小数点
function atanFixed(X, S, wp) {
  const negative = X < 0n;
  if (negative) X = -X;
  let inverse = false;
  if (X > S) {
    X = divRound(S * S, X); // atan(x) ＝ π/2 − atan(1/x)
    inverse = true;
  }
  let doubled = 0;
  while (X * 10n > S) {
    // atan(x) ＝ 2 atan(x / (1 + √(1 + x²)))：0.1 以下になるまで小さくする
    X = divRound(X * S, S + isqrt(S * S + X * X));
    doubled++;
  }
  const X2 = (X * X) / S;
  let term = X;
  let sum = X;
  for (let k = 1n; ; k++) {
    term = (term * X2) / S;
    if (term === 0n) break;
    const t = term / (2n * k + 1n);
    sum += k % 2n === 1n ? -t : t;
  }
  sum <<= BigInt(doubled);
  if (inverse) sum = piFixed(wp) / 2n - sum;
  return negative ? -sum : sum;
}

// atan x（答えはラジアン）
export function atan(x, p = P) {
  if (isZero(x)) return ZERO;
  const lg = approxLog10(absNum(x));
  const extra = lg < 0 ? Math.ceil(-lg) : 0; // 小さい数は、その分だけ桁を増やす
  const wp = p + 20 + extra;
  const S = pow10(wp);
  return approx(atanFixed(mulFixed(x, S), S, wp), BigInt(-wp), p);
}

// ---------------------------------------------------------
// くらべる
// ---------------------------------------------------------

export function cmp(a, b) {
  return sign(sub(a, b));
}

// ---------------------------------------------------------
// 表示のための丸め（四捨五入）
//
// 返す値：{ neg, digits, exp, exact }
//   値 ≒ 0.digits × 10^exp （digits は sig 桁以内、末尾の 0 なし）
//   exact … 丸めで値が変わらなかったか
// ---------------------------------------------------------

export function roundSig(x, sig) {
  if (isZero(x)) return { neg: false, digits: '0', exp: 1, exact: true };
  const neg = sign(x) < 0;
  let q;
  let r2cmp; // 余り×2 と割る数の比較（0：ちょうど半分、正：半分より大）
  let hasRest;
  let k; // 値 × 10^k の整数部分が q
  if (x.q) {
    const n = babs(x.n);
    const est = Math.floor((bitLen(n) - bitLen(x.d)) * LOG10_2);
    k = sig - 1 - est;
    for (let i = 0; ; i++) {
      const [num, den] = k >= 0 ? [n * pow10(k), x.d] : [n, x.d * pow10(-k)];
      q = num / den;
      const len = digitLen(q);
      if (len === sig || i > 5) {
        const rest = num - q * den;
        hasRest = rest !== 0n;
        r2cmp = rest * 2n - den;
        break;
      }
      k += sig - len;
    }
  } else {
    const m = babs(x.m);
    const len = digitLen(m);
    if (len <= sig) {
      return { neg, digits: trimZeros(m.toString()), exp: Number(x.e) + len, exact: true };
    }
    const cut = len - sig;
    const den = pow10(cut);
    q = m / den;
    const rest = m - q * den;
    hasRest = rest !== 0n;
    r2cmp = rest * 2n - den;
    k = -Number(x.e) - cut;
  }
  if (hasRest && r2cmp >= 0n) q += 1n; // 四捨五入
  let digits = q.toString();
  let exp = digits.length - k;
  if (digits.length > sig) { // 999… が 1000… に繰り上がった
    digits = digits.slice(0, sig);
    exp = sig + 1 - k;
  }
  return { neg, digits: trimZeros(digits), exp, exact: !hasRest };
}

function trimZeros(s) {
  const t = s.replace(/0+$/, '');
  return t === '' ? '0' : t;
}

// ---------------------------------------------------------
// 保存用の形（JSON にできる形）
// ---------------------------------------------------------

export function serialize(x) {
  return x.q
    ? { q: 1, n: x.n.toString(), d: x.d.toString() }
    : { q: 0, m: x.m.toString(), e: x.e.toString() };
}

export function deserialize(o) {
  return o.q
    ? { q: true, n: BigInt(o.n), d: BigInt(o.d) }
    : { q: false, m: BigInt(o.m), e: BigInt(o.e) };
}
