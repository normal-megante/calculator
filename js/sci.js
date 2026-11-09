// =========================================================
// 関数電卓の計算（画面なし・テストあり）
//
//   三角関数 sin cos tan と、その逆（sin⁻¹ など）… 角度は「度」か「rad」
//   log（常用対数）・ln（自然対数）
//   n!（階乗）・nPr（並べ方）・nCr（えらび方）
//   素因数分解
//
// 正確さのきまり
//   ・30° ごと・45° ごとの角度は、正確な値を返す（sin 30° ＝ 0.5 ちょうど、tan 45° ＝ 1）
//   ・π を使った角度（π/6 など）は概数なので、15° のちょうど何倍かに「50桁より下のちがい」
//     しかないときは、そのちょうどの角度とみなす（sin(π/6) ＝ 0.5）
//   ・tan 90° のように値がない角度はエラー
//   ・log 1000 ＝ 3 のように、10 の整数乗の log は正確に
//   ・n! は答えが10万桁までなら正確に、それより大きければ概数（スターリングの公式）
// =========================================================
import * as N from './num.js';

const { CalcError, P, ZERO, ONE } = N;
const I = (n) => N.frac(BigInt(n));
const HALF = N.frac(1n, 2n);
const EXACT_DIGITS = 100000; // 答えがこの桁数までなら、階乗などを正確に出す

export const PI = N.pi();
export const E = N.exp(ONE);

// ---------------------------------------------------------
// 角度のモード（度・rad）
// ---------------------------------------------------------
let angleMode = 'deg';
export const getAngle = () => angleMode;
export function setAngle(mode) {
  angleMode = mode === 'rad' ? 'rad' : 'deg';
}
export const ANGLE_NAME = { deg: '度', rad: 'rad' };

// ---------------------------------------------------------
// 小道具
// ---------------------------------------------------------
// いちばん近い整数（BigInt）。ちょうど半分は 0 から遠いほうへ
function nearestInt(x) {
  let n;
  let d;
  if (x.q) {
    n = x.n;
    d = x.d;
  } else {
    if (x.e >= 0n) return x.m * N.pow10(x.e);
    n = x.m;
    d = N.pow10(-x.e);
  }
  return n >= 0n ? (2n * n + d) / (2n * d) : -((-2n * n + d) / (2n * d));
}

// 整数なら BigInt、ちがえば null（概数は 10^30 くらいまで）
export function intOf(x) {
  if (x.q) return x.d === 1n ? x.n : null;
  if (x.e < 0n || x.e > 30n) return null;
  return x.m * N.pow10(x.e);
}

// 正確な数の、0 以上 1 未満の部分
function mod1(t) {
  return N.frac(((t.n % t.d) + t.d) % t.d, t.d);
}

// ---------------------------------------------------------
// 角度 ⇔ 回転の割合（1 ＝ 1回転 ＝ 360° ＝ 2π）
// ---------------------------------------------------------
export function toTurn(x, angle = angleMode) {
  if (angle === 'deg') return N.div(x, I(360));
  if (N.isZero(x)) return ZERO;
  const big = Math.max(0, Math.ceil(N.approxLog10(N.absNum(x))));
  if (big > 40) throw new CalcError('角度が大きすぎて計算できません');
  const p = P + 10 + big;
  return N.div(x, N.mul(I(2), N.pi(p), p), p);
}

export function fromTurn(t, angle = angleMode) {
  if (angle === 'deg') return N.mul(t, I(360));
  if (N.isZero(t)) return t;
  return N.mul(t, N.mul(I(2), N.pi(P + 10), P + 10));
}

// 15° のちょうど何倍かに、とても近い概数（50桁より下しかちがわない）は、そのちょうどの値に
function snapTurn(t) {
  if (t.q) return t;
  const exact = N.frac(nearestInt(N.mul(t, I(24))), 24n);
  return N.isZero(N.sub(t, exact)) ? exact : t;
}

// ---------------------------------------------------------
// 三角関数
// ---------------------------------------------------------
// 30° ごとの sin（回転の割合 × 12 が整数のとき）。null は √ が入る値（概数で計算する）
const SIN12 = [[0, 1], [1, 2], null, [1, 1], null, [1, 2], [0, 1], [-1, 2], null, [-1, 1], null, [-1, 2]];

function exactSin(t) {
  const u = mod1(t);
  if ((u.n * 12n) % u.d !== 0n) return null;
  const v = SIN12[Number((u.n * 12n) / u.d)];
  return v ? N.frac(BigInt(v[0]), BigInt(v[1])) : null;
}

const exactCos = (t) => exactSin(N.add(t, N.frac(1n, 4n)));

// tan は半回転（180°）ごとにくり返す。'none' は値がない（90° など）
function exactTan(t) {
  const u = mod1(N.mul(t, I(2)));
  if ((u.n * 4n) % u.d !== 0n) return null;
  return [ZERO, ONE, 'none', I(-1)][Number((u.n * 4n) / u.d)];
}

function trigTurn(name, t) {
  t = snapTurn(t);
  if (!t.q && N.approxLog10(N.absNum(t)) > P - 30) throw new CalcError('角度が大きすぎて計算できません');
  if (t.q) {
    const v = name === 'sin' ? exactSin(t) : name === 'cos' ? exactCos(t) : exactTan(t);
    if (v === 'none') throw new CalcError('tan 90°（π/2）や tan 270° などは、値がありません（限りなく大きくなります）');
    if (v) return v;
  }
  const sc = N.sinCosTurn(t, P + 5);
  if (name === 'sin') return N.toApprox(sc.sin, P);
  if (name === 'cos') return N.toApprox(sc.cos, P);
  return N.div(sc.sin, sc.cos);
}

export const sin = (x, angle = angleMode) => trigTurn('sin', toTurn(x, angle));
export const cos = (x, angle = angleMode) => trigTurn('cos', toTurn(x, angle));
export const tan = (x, angle = angleMode) => trigTurn('tan', toTurn(x, angle));

// 逆三角関数：ちょうどの値になるもの（数 → 回転の割合）
const INVERSE_EXACT = {
  asin: { 0: [0, 1], '1/2': [1, 12], 1: [1, 4], '-1/2': [-1, 12], '-1': [-1, 4] },
  acos: { 1: [0, 1], '1/2': [1, 6], 0: [1, 4], '-1/2': [1, 3], '-1': [1, 2] },
  atan: { 0: [0, 1], 1: [1, 8], '-1': [-1, 8] },
};
const INVERSE_NAME = { asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹' };

function inverseTurn(name, x) {
  if (x.q) {
    const v = INVERSE_EXACT[name][x.d === 1n ? `${x.n}` : `${x.n}/${x.d}`];
    if (v) return N.frac(BigInt(v[0]), BigInt(v[1]));
  }
  const over = N.cmp(N.absNum(x), ONE);
  if (name !== 'atan' && over > 0) throw new CalcError(`${INVERSE_NAME[name]} は −1 から 1 までの数だけです`);
  const p = P + 10;
  let rad;
  if (name === 'atan') {
    rad = N.atan(x, p);
  } else if (name === 'asin') {
    const r = over === 0 ? ZERO : N.sqrt(N.sub(ONE, N.mul(x, x, p), p), p);
    if (N.isZero(r)) return N.frac(BigInt(N.sign(x)), 4n);
    rad = N.atan(N.div(x, r, p), p);
  } else {
    // acos x ＝ 2 atan √((1 − x)/(1 + x))（1 に近い x でも桁が落ちない）
    const den = N.add(ONE, x, p);
    if (N.isZero(den)) return HALF;
    rad = N.mul(I(2), N.atan(N.sqrt(N.div(N.sub(ONE, x, p), den, p), p), p), p);
  }
  return snapTurn(N.div(rad, N.mul(I(2), N.pi(p), p), p));
}

export const asin = (x, angle = angleMode) => fromTurn(inverseTurn('asin', x), angle);
export const acos = (x, angle = angleMode) => fromTurn(inverseTurn('acos', x), angle);
export const atan = (x, angle = angleMode) => fromTurn(inverseTurn('atan', x), angle);

// 検算用：x と y は「sin（cos・tan）が同じになる角度」か
//   sin：y か 180° − y（に 360° の何倍かを足したもの）、cos：±y、tan：y（180° ごと）
export function sameTrig(name, x, y, angle = angleMode) {
  const tx = toTurn(x, angle);
  const ty = toTurn(y, angle);
  const candidates = name === 'sin' ? [ty, N.sub(HALF, ty)] : name === 'cos' ? [ty, N.neg(ty)] : [ty];
  const period = name === 'tan' ? HALF : ONE;
  return candidates.some((c) => {
    const q = N.div(N.sub(tx, c), period);
    return N.isZero(N.sub(q, N.frac(nearestInt(q))));
  });
}

// ---------------------------------------------------------
// 対数
// ---------------------------------------------------------
// 10 の整数乗なら、その指数。ちがえば null
function powerOfTen(x) {
  if (x.n === 1n && /^10*$/.test(x.d.toString())) return -(x.d.toString().length - 1);
  if (x.d === 1n && /^10*$/.test(x.n.toString())) return x.n.toString().length - 1;
  return null;
}

export function log10(x) {
  if (N.sign(x) <= 0) throw new CalcError('0 や負の数の log はありません');
  if (x.q) {
    const k = powerOfTen(x);
    if (k !== null) return I(k);
  }
  const p = P + 10;
  return N.toApprox(N.div(N.ln(x, p), N.ln(I(10), p), p), P);
}

export function ln(x) {
  if (N.sign(x) <= 0) throw new CalcError('0 や負の数の ln はふつうの数になりません（負の数は「複素数」で計算できます）');
  return N.ln(x);
}

// ---------------------------------------------------------
// 階乗・並べ方・えらび方
// ---------------------------------------------------------
// a × (a+1) × … × b（半分ずつに分けてかけると速い）
function prodRange(a, b) {
  if (a > b) return 1n;
  if (b - a < 24n) {
    let r = a;
    for (let i = a + 1n; i <= b; i++) r *= i;
    return r;
  }
  const m = (a + b) / 2n;
  return prodRange(a, m) * prodRange(m + 1n, b);
}

// log10(m!) のおおよそ（どの計算方法にするか決めるだけに使う）
function factDigits(m) {
  if (m < 2n) return 0;
  const x = Number(m);
  if (!Number.isFinite(x)) return Infinity;
  return (x * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI * x)) * Math.LOG10E;
}

// ベルヌーイ数 B2, B4, …, B24（スターリングの公式で使う）
const BERNOULLI = [
  [1n, 6n], [-1n, 30n], [1n, 42n], [-1n, 30n], [5n, 66n], [-691n, 2730n],
  [7n, 6n], [-3617n, 510n], [43867n, 798n], [-174611n, 330n], [854513n, 138n], [-236364091n, 2730n],
];

// ln(m!)（p 桁）。大きい m はスターリングの公式
//   ln m! ＝ (m + ½) ln m − m + ½ ln 2π + Σ B₂ₖ / (2k(2k−1) m^(2k−1))
function lnFact(m, p) {
  if (m < 2000n) return N.ln(N.frac(prodRange(2n, m)), p);
  const M = N.frac(m);
  let s = N.sub(N.mul(N.add(M, HALF, p), N.ln(M, p), p), M, p);
  s = N.add(s, N.mul(HALF, N.ln(N.mul(I(2), N.pi(p), p), p), p), p);
  const M2 = N.mul(M, M, p);
  let power = M;
  BERNOULLI.forEach(([bn, bd], i) => {
    const k = BigInt(i + 1);
    s = N.add(s, N.div(N.frac(bn, bd * 2n * k * (2n * k - 1n)), power, p), p);
    power = N.mul(power, M2, p);
  });
  return s;
}

// e^(ln の和) で、大きい答えを概数に（lnParts は [[m, +1 / −1], …] で ln(m!) を足し引き）
function fromLnFacts(parts, digits) {
  const p = P + 20 + digits;
  let L = ZERO;
  for (const [m, sgn] of parts) {
    const v = lnFact(m, p);
    L = sgn > 0 ? N.add(L, v, p) : N.sub(L, v, p);
  }
  return N.exp(L, P);
}

// 小さい個数の、大きい数のかけ算を概数で
function approxRange(a, b) {
  let x = ONE;
  for (let i = a; i <= b; i++) x = N.mul(x, N.frac(i), P + 10);
  return N.toApprox(x, P);
}

export function factorial(x) {
  const n = intOf(x);
  if (n === null || n < 0n) throw new CalcError('n! は 0 以上の整数だけです');
  if (factDigits(n) <= EXACT_DIGITS) return N.frac(prodRange(2n, n));
  return fromLnFacts([[n, 1]], n.toString().length);
}

function nAndR(nx, rx, name) {
  const n = intOf(nx);
  const r = intOf(rx);
  if (n === null || r === null || n < 0n || r < 0n) throw new CalcError(`${name} の n と r は、0 以上の整数だけです`);
  if (r > n) throw new CalcError(`${name} は r が n 以下のときだけです（n 個から n 個より多くはとれません）`);
  return [n, r];
}

// nPr ＝ n × (n−1) × … × (n−r+1)
export function nPr(nx, rx) {
  const [n, r] = nAndR(nx, rx, 'nPr');
  if (factDigits(n) - factDigits(n - r) <= EXACT_DIGITS) return N.frac(prodRange(n - r + 1n, n));
  if (r <= 2000n) return approxRange(n - r + 1n, n);
  return fromLnFacts([[n, 1], [n - r, -1]], n.toString().length);
}

// nCr ＝ nPr ÷ r!
export function nCr(nx, rx) {
  const [n, r0] = nAndR(nx, rx, 'nCr');
  const r = r0 < n - r0 ? r0 : n - r0; // nCr ＝ nC(n−r)
  if (factDigits(n) - factDigits(r) - factDigits(n - r) <= EXACT_DIGITS) {
    return N.frac(prodRange(n - r + 1n, n) / prodRange(2n, r));
  }
  if (r <= 2000n) return N.toApprox(N.div(approxRange(n - r + 1n, n), N.frac(prodRange(2n, r)), P + 10), P);
  return fromLnFacts([[n, 1], [r, -1], [n - r, -1]], n.toString().length);
}

export const reciprocal = (x) => N.div(ONE, x);

// ---------------------------------------------------------
// 素因数分解
// ---------------------------------------------------------
const SMALL_PRIMES = (() => {
  const LIMIT = 10000;
  const sieve = new Uint8Array(LIMIT + 1);
  const list = [];
  for (let i = 2; i <= LIMIT; i++) {
    if (sieve[i]) continue;
    list.push(BigInt(i));
    for (let j = i * i; j <= LIMIT; j += i) sieve[j] = 1;
  }
  return list;
})();

function gcd(a, b) {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function modPow(b, e, m) {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

// 素数か（ミラー・ラビン法。3.3×10^24 までは必ず正しい。それより大きくても、まずまちがえない）
export function isPrime(n) {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES.slice(0, 13)) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let s = 0;
  while (d % 2n === 0n) { d /= 2n; s++; }
  outer: for (const a of SMALL_PRIMES.slice(0, 13)) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

// 割り切る数を1つ見つける（ポラード・ブレントのロー法）。見つからなければ null
function findFactor(n, state) {
  const step = 128n;
  for (let c = 1n; c < 30n; c++) {
    let y = 2n;
    let x = y;
    let ys = y;
    let g = 1n;
    let q = 1n;
    let r = 1n;
    do {
      x = y;
      for (let i = 0n; i < r; i++) y = (y * y + c) % n;
      let k = 0n;
      do {
        ys = y;
        const lim = step < r - k ? step : r - k;
        for (let i = 0n; i < lim; i++) {
          y = (y * y + c) % n;
          q = (q * (x > y ? x - y : y - x)) % n;
        }
        g = gcd(q, n);
        k += step;
        state.budget -= Number(lim);
        if (state.budget < 0) return null;
      } while (k < r && g === 1n);
      r *= 2n;
    } while (g === 1n);
    if (g === n) {
      do {
        ys = (ys * ys + c) % n;
        g = gcd(x > ys ? x - ys : ys - x, n);
      } while (g === 1n);
    }
    if (g !== n) return g;
  }
  return null;
}

// n（2 以上の BigInt）を素因数分解
//   返す値：{ factors: [[素数, 指数], …]（小さい順）, rest: [分解しきれなかった数, …] }
export function factorize(n, { budget = 200000 } = {}) {
  const found = new Map();
  const addFactor = (p) => found.set(p, (found.get(p) ?? 0) + 1);
  for (const p of SMALL_PRIMES) {
    if (p * p > n) break;
    while (n % p === 0n) {
      addFactor(p);
      n /= p;
    }
  }
  const rest = [];
  const state = { budget };
  const stack = n > 1n ? [n] : [];
  while (stack.length) {
    const m = stack.pop();
    if (isPrime(m)) {
      addFactor(m);
      continue;
    }
    const d = findFactor(m, state);
    if (d === null) rest.push(m);
    else stack.push(d, m / d);
  }
  const factors = [...found.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { factors, rest: rest.sort((a, b) => (a < b ? -1 : 1)) };
}

// 指数を小さい字に（2³）
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const supText = (k) => String(k).replace(/\d/g, (d) => SUP[d]);

// =========================================================
// ステップ14：関数を増やす
//   log(a, x)（底を変える log）・ⁿ√(n, x)（n 乗根）・gcd・lcm・mod（あまり）
//   n!!（二重階乗）・n#（素数階乗）・sf(n)（超階乗）・H(n)（ハイパー階乗）・Γ(x)（ガンマ関数）
//   sinh・cosh・tanh（双曲線関数）・abs（絶対値）
// =========================================================
const LOG10_2 = Math.log10(2);

// x 以下でいちばん大きい整数（BigInt）
export function floorInt(x) {
  let n;
  let d;
  if (x.q) {
    n = x.n;
    d = x.d;
  } else {
    if (x.e >= 0n) return x.m * N.pow10(x.e);
    n = x.m;
    d = N.pow10(-x.e);
  }
  return n >= 0n ? n / d : -((-n + d - 1n) / d);
}

// ---------------------------------------------------------
// 底を変える log：log(a, x) ＝ a を何乗すると x になるか
// ---------------------------------------------------------
export function logb(a, x) {
  const baseError = () => new CalcError('log の底は、0 より大きく 1 でない数だけです');
  if (N.sign(a) <= 0 || (a.q && a.n === 1n && a.d === 1n)) throw baseError();
  if (N.sign(x) <= 0) throw new CalcError('0 や負の数の log はありません');
  if (a.q && x.q) {
    const r = exactLog(a, x);
    if (r) return r;
  }
  const p = P + 10;
  const la = N.ln(a, p);
  if (N.isZero(la)) throw baseError();
  return N.toApprox(N.div(N.ln(x, p), la, p), P);
}

// a^r ＝ x になる分数 r（分母は 64 まで。log(4, 8) ＝ 3/2）を探す。なければ null
function exactLog(a, x) {
  if (x.n === x.d) return ZERO;
  const guess = N.approxLog10(x) / N.approxLog10(a);
  if (!Number.isFinite(guess) || Math.abs(guess) > 1e6) return null;
  // 連分数で、分母の小さい分数の候補を出す
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let v = guess;
  for (let i = 0; i < 20; i++) {
    const t = Math.floor(v);
    [h0, h1] = [h1, t * h1 + h0];
    [k0, k1] = [k1, t * k1 + k0];
    if (k1 > 64) return null;
    if (Math.abs(h1 / k1 - guess) < 1e-9 * Math.max(1, Math.abs(guess))) {
      const r = N.frac(BigInt(h1), BigInt(k1));
      try {
        const y = N.pow(a, r);
        return y.q && N.cmp(y, x) === 0 ? r : null;
      } catch {
        return null;
      }
    }
    const f = v - t;
    if (f < 1e-12) return null;
    v = 1 / f;
  }
  return null;
}

// ---------------------------------------------------------
// n 乗根：ⁿ√(n, x)（n 回かけると x になる数。n が奇数なら負の数も）
// ---------------------------------------------------------
export function root(nx, x) {
  if (N.isZero(nx)) throw new CalcError('ⁿ√ の n に 0 は使えません');
  const k = nx.q ? intOf(nx) : null;
  const odd = k !== null && k % 2n !== 0n;
  if (N.sign(x) < 0 && !odd) throw new CalcError('負の数の ⁿ√ は、n が奇数のときだけです（偶数乗根は「複素数」で）');
  if (N.isZero(x)) {
    if (N.sign(nx) < 0) throw new CalcError('0 で割ることはできません');
    return ZERO;
  }
  if (k !== null && x.q) {
    // 割り切れる乗根なら正確に（ⁿ√(3, 8) ＝ 2）
    const K = k < 0n ? -k : k;
    const an = x.n < 0n ? -x.n : x.n;
    const exactRoot = (v) => {
      if (v === 1n) return 1n;
      if (K > BigInt(N.bitLen(v))) return null; // 2 以上の数の K 乗は K ビットより大きい
      const r = N.iroot(v, Number(K));
      return r ** K === v ? r : null;
    };
    const rn = exactRoot(an);
    const rd = rn === null ? null : exactRoot(x.d);
    if (rn !== null && rd !== null) {
      const r = N.frac(x.n < 0n ? -rn : rn, rd);
      return k < 0n ? N.div(ONE, r) : r;
    }
  }
  const r = N.pow(N.absNum(x), N.div(ONE, nx));
  return N.sign(x) < 0 ? N.neg(r) : r;
}

// ---------------------------------------------------------
// 最大公約数・最小公倍数（整数だけ。2つ以上）
// ---------------------------------------------------------
function intList(list, name) {
  return list.map((x) => {
    if (!x.q || x.d !== 1n) throw new CalcError(`${name} は整数だけです`);
    return x.n;
  });
}

export function gcdOf(list) {
  let g = 0n;
  for (const n of intList(list, 'gcd（最大公約数）')) g = gcd(g, n);
  return N.frac(g);
}

export function lcmOf(list) {
  let l = 1n;
  for (const n of intList(list, 'lcm（最小公倍数）')) {
    if (n === 0n) return ZERO;
    const a = n < 0n ? -n : n;
    l = (l / gcd(l, a)) * a;
  }
  return N.frac(l);
}

// BigInt の最大公約数（検算でも使う）
export const gcdInt = (a, b) => gcd(a, b);

// ---------------------------------------------------------
// あまり：a mod b ＝ a − b × (a ÷ b 以下でいちばん大きい整数)
//   答えは b と同じ符号（−7 mod 3 ＝ 2。n進法の mod と同じ）
//   返す値：{ q: 商（BigInt）, r: あまり }
// ---------------------------------------------------------
export function mod(a, b) {
  if (N.isZero(b)) throw new CalcError('0 で割ったあまりはありません');
  const p = P + 10;
  const qv = N.div(a, b, p);
  if (!qv.q && N.approxLog10(N.absNum(qv)) > P - 25) {
    throw new CalcError('割られる数が大きすぎて、あまりを正確に出せません');
  }
  let q = floorInt(qv);
  if (!qv.q) {
    // 概数の割り算がちょうど整数のときは、その整数（下の桁の誤差で 1 小さくならないように）
    const near = nearestInt(qv);
    if (N.cmp(qv, N.frac(near)) === 0) q = near;
  }
  return { q, r: N.sub(a, N.mul(b, N.frac(q), p)) };
}

// ---------------------------------------------------------
// たくさんの正の整数をかけた答えの概数
//   2進数で上の 384〜448 ビット（115桁くらい）だけ残しながらかける：値 ＝ m × 2^e
// ---------------------------------------------------------
const KEEP = 1n << 448n;

class BinProduct {
  constructor() {
    this.m = 1n;
    this.e = 0n;
  }

  times(k) {
    this.m *= k;
    while (this.m >= KEEP) {
      this.m >>= 64n;
      this.e += 64n;
    }
  }

  timesProduct(other) {
    this.m *= other.m;
    this.e += other.e;
    while (this.m >= KEEP) {
      this.m >>= 64n;
      this.e += 64n;
    }
  }

  value(p = P) {
    const wp = p + 10;
    return N.toApprox(N.mul(N.frac(this.m), N.pow(I(2), N.frac(this.e), wp), wp), p);
  }
}

// 整数の並びの積（半分ずつに分けてかける）
function prodList(list, lo = 0, hi = list.length) {
  if (hi - lo <= 16) {
    let r = 1n;
    for (let i = lo; i < hi; i++) r *= list[i];
    return r;
  }
  const mid = (lo + hi) >> 1;
  return prodList(list, lo, mid) * prodList(list, mid, hi);
}

// ---------------------------------------------------------
// 二重階乗：n!! ＝ n × (n−2) × (n−4) × …（7!! ＝ 7×5×3×1 ＝ 105、8!! ＝ 8×6×4×2 ＝ 384）
//   0!! ＝ 1、(−1)!! ＝ 1 ときめる
// ---------------------------------------------------------
// a × (a+2) × … × b（a と b は奇数）
function oddProd(a, b) {
  if (a > b) return 1n;
  if (b - a < 48n) {
    let r = a;
    for (let i = a + 2n; i <= b; i += 2n) r *= i;
    return r;
  }
  let m = (a + b) / 2n;
  if (m % 2n === 0n) m -= 1n;
  return oddProd(a, m) * oddProd(m + 2n, b);
}

export function doubleFactorial(x) {
  const n = intOf(x);
  if (n === null || n < -1n) throw new CalcError('n!! は −1 以上の整数だけです');
  if (n <= 1n) return ONE;
  const even = n % 2n === 0n;
  const k = even ? n / 2n : (n - 1n) / 2n;
  // 偶数：(2k)!! ＝ 2^k × k!、奇数：(2k+1)!! ＝ (2k+1)! ÷ (2^k × k!)
  const digits = even
    ? Number(k) * LOG10_2 + factDigits(k)
    : factDigits(n) - Number(k) * LOG10_2 - factDigits(k);
  if (digits <= EXACT_DIGITS) return N.frac(even ? prodRange(2n, k) << k : oddProd(3n, n));
  const p = P + 20 + n.toString().length;
  const kLn2 = N.mul(N.frac(k), N.ln(I(2), p), p);
  const L = even
    ? N.add(kLn2, lnFact(k, p), p)
    : N.sub(N.sub(lnFact(n, p), kLn2, p), lnFact(k, p), p);
  return N.exp(L, P);
}

// ---------------------------------------------------------
// 素数階乗：n# ＝ n 以下の素数を全部かけたもの（10# ＝ 2×3×5×7 ＝ 210）
// ---------------------------------------------------------
export const PRIMORIAL_MAX = 1000000;

function primesUpTo(n) {
  const sieve = new Uint8Array(n + 1);
  const list = [];
  for (let i = 2; i <= n; i++) {
    if (sieve[i]) continue;
    list.push(i);
    for (let j = i * i; j <= n; j += i) sieve[j] = 1;
  }
  return list;
}

function primorialCheck(x) {
  const n = intOf(x);
  if (n === null || n < 0n) throw new CalcError('n# は 0 以上の整数だけです');
  if (n > BigInt(PRIMORIAL_MAX)) throw new CalcError('n# は n が 100万 までです');
  return Number(n);
}

export function primorial(x) {
  const ps = primesUpTo(primorialCheck(x));
  let digits = 0;
  for (const p of ps) digits += Math.log10(p);
  if (digits <= EXACT_DIGITS) return N.frac(prodList(ps.map(BigInt)));
  const prod = new BinProduct();
  for (const p of ps) prod.times(BigInt(p));
  return prod.value();
}

// n 以下でいちばん大きい素数（なければ null）。検算で使う
export function largestPrimeAtMost(x) {
  const n = primorialCheck(x);
  for (let m = n; m >= 2; m--) if (isPrime(BigInt(m))) return m;
  return null;
}

// ---------------------------------------------------------
// 超階乗：sf(n) ＝ 1! × 2! × … × n!（sf(4) ＝ 1×2×6×24 ＝ 288）
// ハイパー階乗：H(n) ＝ 1¹ × 2² × … × nⁿ（H(3) ＝ 1×4×27 ＝ 108）
//   H(n) × sf(n) ＝ (n!)^(n+1) なので、大きい H(n) は (n!)^(n+1) ÷ sf(n) で出す
// ---------------------------------------------------------
export const SF_MAX = 100000;

function smallInt(x, name) {
  const n = intOf(x);
  if (n === null || n < 0n) throw new CalcError(`${name} は 0 以上の整数だけです`);
  if (n > BigInt(SF_MAX)) throw new CalcError(`${name} は n が 10万 までです`);
  return Number(n);
}

// sf(n) の概数（と n! の概数）
function superfactorialApprox(n) {
  const f = new BinProduct();
  const s = new BinProduct();
  for (let k = 2n; k <= BigInt(n); k++) {
    f.times(k);
    s.timesProduct(f);
  }
  return { sf: s, fact: f };
}

export function superfactorial(x) {
  const n = smallInt(x, 'sf(n)');
  let lf = 0;
  let digits = 0;
  for (let k = 2; k <= n && digits <= EXACT_DIGITS; k++) {
    lf += Math.log10(k);
    digits += lf;
  }
  if (digits <= EXACT_DIGITS) {
    let f = 1n;
    let s = 1n;
    for (let k = 2n; k <= BigInt(n); k++) {
      f *= k;
      s *= f;
    }
    return N.frac(s);
  }
  return superfactorialApprox(n).sf.value();
}

export function hyperfactorial(x) {
  const n = smallInt(x, 'H(n)');
  let digits = 0;
  for (let k = 2; k <= n && digits <= EXACT_DIGITS; k++) digits += k * Math.log10(k);
  if (digits <= EXACT_DIGITS) {
    let s = 1n;
    for (let k = 2n; k <= BigInt(n); k++) s *= k ** k;
    return N.frac(s);
  }
  const p = P + 20;
  const { sf, fact } = superfactorialApprox(n);
  return N.toApprox(N.div(N.pow(fact.value(p), I(n + 1), p), sf.value(p), p), P);
}

// ---------------------------------------------------------
// ガンマ関数：Γ(x)。Γ(n) ＝ (n−1)!（整数でない数にも「階乗」を広げたもの）
//   Γ(½) ＝ √π。0 と負の整数は値がない
//   x が小さいときは Γ(x) ＝ Γ(x+s) ÷ (x(x+1)…(x+s−1)) で大きくしてからスターリングの公式
//   負の数は Γ(x) ＝ π ÷ (sin(πx) × Γ(1−x))
// ---------------------------------------------------------
const GAMMA_SHIFT = 2000;

// ln Γ(y)（y が大きいとき。スターリングの公式）
function lnGammaBig(y, p) {
  let s = N.sub(N.mul(N.sub(y, HALF, p), N.ln(y, p), p), y, p);
  s = N.add(s, N.mul(HALF, N.ln(N.mul(I(2), N.pi(p), p), p), p), p);
  const y2 = N.mul(y, y, p);
  let power = y;
  BERNOULLI.forEach(([bn, bd], i) => {
    const k = BigInt(i + 1);
    s = N.add(s, N.div(N.frac(bn, bd * 2n * k * (2n * k - 1n)), power, p), p);
    power = N.mul(power, y2, p);
  });
  return s;
}

// x > 0 の Γ(x)（p 桁）
function gammaPos(x, p) {
  let y = N.toApprox(x, p);
  let prod = ONE;
  const shift = Math.ceil(GAMMA_SHIFT - N.toNumber(y));
  for (let i = 0; i < shift; i++) {
    prod = N.mul(prod, y, p);
    y = N.add(y, ONE, p);
  }
  return N.div(N.exp(lnGammaBig(y, p), p), prod, p);
}

export function gamma(x) {
  if (!x.q) {
    const k = nearestInt(x);
    if (N.cmp(x, N.frac(k)) === 0) x = N.frac(k);
  }
  if (x.q && x.d === 1n) {
    if (x.n <= 0n) throw new CalcError('Γ(0)・Γ(−1)・Γ(−2)… は値がありません（限りなく大きくなります）');
    return factorial(N.frac(x.n - 1n));
  }
  const p = P + 20;
  if (N.sign(x) < 0) {
    if (N.approxLog10(N.absNum(x)) > 15) throw new CalcError('数が大きすぎて扱えません');
    const s = N.sinCosTurn(N.div(x, I(2), p), p).sin; // sin(πx)：πx は x/2 回転
    return N.toApprox(N.div(N.pi(p), N.mul(s, gammaPos(N.sub(ONE, x, p), p), p), p), P);
  }
  return N.toApprox(gammaPos(x, p), P);
}

// ---------------------------------------------------------
// 双曲線関数：sinh x ＝ (eˣ − e⁻ˣ)/2、cosh x ＝ (eˣ + e⁻ˣ)/2、tanh x ＝ sinh x ÷ cosh x
//   （角度ではないので、度・rad は関係なし）
// ---------------------------------------------------------
const TINY = -30; // |x| が 10^−30 より小さいときは、級数の頭だけで十分
const cube = (x) => N.mul(N.mul(x, x), x);

// 0 に近い x は、引き算で桁が消えるので、その分だけ桁を増やす
const extraFor = (x) => Math.max(0, Math.ceil(-N.approxLog10(N.absNum(x))));

function sinhP(x, p) {
  const ex = N.exp(x, p);
  return N.div(N.sub(ex, N.div(ONE, ex, p), p), I(2), p);
}

function coshP(x, p) {
  const ex = N.exp(x, p);
  return N.div(N.add(ex, N.div(ONE, ex, p), p), I(2), p);
}

export function sinh(x) {
  if (N.isZero(x)) return ZERO;
  if (N.approxLog10(N.absNum(x)) < TINY) return N.toApprox(N.add(x, N.div(cube(x), I(6))), P);
  return N.toApprox(sinhP(x, P + 10 + extraFor(x)), P);
}

export function cosh(x) {
  if (N.isZero(x)) return ONE;
  return N.toApprox(coshP(x, P + 10), P);
}

export function tanh(x) {
  if (N.isZero(x)) return ZERO;
  const lg = N.approxLog10(N.absNum(x));
  if (lg < TINY) return N.toApprox(N.sub(x, N.div(cube(x), I(3))), P);
  if (lg > 2.5) return N.toApprox(I(N.sign(x))); // 1 との差が 10^−270 より小さい
  const p = P + 10 + extraFor(x);
  return N.toApprox(N.div(sinhP(x, p), coshP(x, p), p), P);
}

// 逆の関数（検算用）
export function asinh(y) {
  if (N.isZero(y)) return ZERO;
  if (N.sign(y) < 0) return N.neg(asinh(N.neg(y)));
  const lg = N.approxLog10(y);
  if (lg < TINY) return N.toApprox(N.sub(y, N.div(cube(y), I(6))), P);
  const p = P + 10 + extraFor(y);
  if (lg > 45) return N.toApprox(N.ln(N.mul(I(2), y, p), p), P); // ln 2y（ちがいは 10^−90 より小さい）
  return N.toApprox(N.ln(N.add(y, N.sqrt(N.add(N.mul(y, y, p), ONE, p), p), p), p), P);
}

export function acosh(y) {
  const c = N.cmp(y, ONE);
  if (c < 0) throw new CalcError('cosh⁻¹ は 1 以上の数だけです');
  if (c === 0) return ZERO;
  const p = P + 20;
  if (N.approxLog10(y) > 45) return N.toApprox(N.ln(N.mul(I(2), y, p), p), P);
  return N.toApprox(N.ln(N.add(y, N.sqrt(N.sub(N.mul(y, y, p), ONE, p), p), p), p), P);
}

export function atanh(y) {
  if (N.isZero(y)) return ZERO;
  if (N.cmp(N.absNum(y), ONE) >= 0) throw new CalcError('tanh⁻¹ は −1 より大きく 1 より小さい数だけです');
  const lg = N.approxLog10(N.absNum(y));
  if (lg < TINY) return N.toApprox(N.add(y, N.div(cube(y), I(3))), P);
  const p = P + 20 + extraFor(y);
  return N.toApprox(N.mul(HALF, N.ln(N.div(N.add(ONE, y, p), N.sub(ONE, y, p), p), p), p), P);
}

export const abs = (x) => N.absNum(x);
