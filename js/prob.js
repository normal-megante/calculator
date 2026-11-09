// =========================================================
// 場合の数・確率（ステップ16。画面なし・テストあり）
//
//   場合の数：順列・組合せ・重複順列・重複組合せ・円順列・じゅず順列・同じものを含む順列
//   くり返し：n 回のうち k 回起きる確率（反復試行・二項分布）
//   ガチャ：n 回で1回以上・〇% にするには何回・平均何回・全種類そろえる
//   くじ：戻さないくじで k 本当たる（超幾何分布）
//   条件付き：検査の陽性・ベイズの定理
//   偏差値・分布：偏差値と上位何%（正規分布）・データの平均と標準偏差
//
// 確率は num.js の正確な分数で計算する（大きすぎるときだけ概数）。
// 計算の種類（CALCS）ごとに、欄・答えの出し方（solve）・検算（check）を持つ。
// =========================================================
import * as N from './num.js';
import * as S from './sci.js';
import * as F from './format.js';

const { CalcError, ZERO, ONE } = N;
const I = (n) => N.frac(BigInt(n));
const HALF = N.frac(1n, 2n);
const HUNDRED = I(100);

// ---------------------------------------------------------
// 書き方（画面でも使う）
// ---------------------------------------------------------
// ふつうの数（四捨五入したら「…」。17桁以上は 1.2×10^30 の形）
export function numText(x, sig = 12) {
  if (N.isZero(x)) return { text: '0', html: '0' };
  if (!x.q && N.approxLog10(N.absNum(x)) < 15 && !N.isZero(x)) {
    // 概数でも、上から 65 桁くらいまで整数と同じなら、その整数で
    // （概数なので「…」はつける。1 − 10^−88 のような数を「ちょうど 1」に見せないため）
    const k = N.frac(S.floorInt(N.add(x, HALF)));
    if (N.cmp(x, k) === 0) {
      const t = F.compact(k, sig).text;
      return { text: `${t}…`, html: `${t}…` };
    }
  }
  if (!N.isZero(x) && N.approxLog10(N.absNum(x)) >= 16) {
    const r = N.roundSig(x, sig);
    const mant = (r.neg ? '−' : '') + (r.digits.length > 1 ? `${r.digits[0]}.${r.digits.slice(1)}` : r.digits);
    const dots = !r.exact || !x.q ? '…' : '';
    return { text: `${mant}×10^${r.exp - 1}${dots}`, html: `${mant}<span class="x10">×10</span><sup>${r.exp - 1}</sup>${dots}` };
  }
  const f = F.compact(x, sig);
  return { text: f.text + (f.rounded ? '…' : ''), html: f.html + (f.rounded ? '…' : '') };
}
const T = (x, sig) => numText(x, sig).text;

// 確率 → %（83.84944257…）
export const pctText = (x) => numText(N.mul(x, HUNDRED), 10);
export const pct = (x) => `${pctText(x).text}%`;

// 分数の形（短いときだけ。1/6 など）
export function fracText(x) {
  if (!x.q || x.d === 1n) return null;
  const a = x.n < 0n ? -x.n : x.n;
  if (a.toString().length + x.d.toString().length > 30) return null;
  return `${x.n < 0n ? '−' : ''}${F.groupInt(a.toString())}/${F.groupInt(x.d.toString())}`;
}

// 「約 7.3 回に1回」
export function oneIn(x) {
  if (N.sign(x) <= 0 || N.cmp(x, HALF) > 0) return null;
  const v = N.div(ONE, x);
  const t = numText(v, N.cmp(v, I(100)) < 0 ? 2 : 3).text.replace('…', '');
  return `約 ${t} 回に1回`;
}

// 2つの数が同じか（正確な数どうしはぴったり、概数なら上から digits 桁）
export function same(a, b, digits = 40) {
  if (a.q && b.q) return N.cmp(a, b) === 0;
  const d = N.sub(a, b, N.P + 20);
  if (N.isZero(d)) return true;
  if (N.isZero(b)) return N.approxLog10(N.absNum(a)) < -digits;
  return N.approxLog10(N.absNum(d)) - N.approxLog10(N.absNum(b)) <= -digits;
}

// ---------------------------------------------------------
// 欄の文字 → 数
//   int … 0 以上の整数（BigInt） / prob … 0.3・1/6・3%・1/2%（0〜1） / num … −12.5 など / list … 「,」で区切った数
//   打ちかけ（「1/」「−」など）や空は null
// ---------------------------------------------------------
const MINUS = '−';
const dec = (t) => N.parseDecimal(t.endsWith('.') ? t.slice(0, -1) : t);

export function parseText(type, text) {
  if (!text) return null;
  if (type === 'int') return /^\d+$/.test(text) ? BigInt(text) : null;
  if (type === 'num') {
    const m = /^(−?)(\d+\.?\d*)$/.exec(text);
    if (!m) return null;
    return m[1] ? N.neg(dec(m[2])) : dec(m[2]);
  }
  if (type === 'list') {
    const parts = text.split(',');
    if (parts[parts.length - 1] === '') parts.pop(); // 「65,72,」は 65・72
    if (!parts.length) return null;
    const list = parts.map((p) => parseText('num', p));
    return list.some((x) => x === null) ? null : list;
  }
  // prob
  const m = /^(\d+\.?\d*)(?:\/(\d+\.?\d*))?(%?)$/.exec(text);
  if (!m) return null;
  let x = dec(m[1]);
  if (m[2] !== undefined) {
    const d = dec(m[2]);
    if (N.isZero(d)) throw new CalcError('分母が 0 です');
    x = N.div(x, d);
  }
  if (m[3]) x = N.div(x, HUNDRED);
  if (N.cmp(x, ONE) > 0) throw new CalcError('確率は 0 から 1（0% から 100%）までです');
  return x;
}

// ---------------------------------------------------------
// 場合の数
// ---------------------------------------------------------
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const ENUM_MAX = 100000; // これより多いときは、書き出して数えない

// 全部書き出して数える（検算用）。返す値：{ count, sample: はじめの 12 個 }
export function enumerate(kind, n, r, counts = []) {
  const sample = [];
  let count = 0;
  const push = (s) => {
    count++;
    if (sample.length < 12) sample.push(s);
  };
  const cur = [];
  if (kind === 'perm') {
    const used = Array(n).fill(false);
    const rec = () => {
      if (cur.length === r) return push(cur.join(''));
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        used[i] = true;
        cur.push(LETTERS[i]);
        rec();
        cur.pop();
        used[i] = false;
      }
      return undefined;
    };
    rec();
  } else if (kind === 'comb' || kind === 'rcomb' || kind === 'rperm') {
    const rec = (start) => {
      if (cur.length === r) return push(cur.join(''));
      for (let i = kind === 'rperm' ? 0 : start; i < n; i++) {
        cur.push(LETTERS[i]);
        rec(kind === 'comb' ? i + 1 : i);
        cur.pop();
      }
      return undefined;
    };
    rec(0);
  } else if (kind === 'circ' || kind === 'neck') {
    // n 個の並べ方を全部作って、回す（裏返す）と同じものを1つにまとめる
    const seen = new Set();
    const used = Array(n).fill(false);
    const canon = (s) => {
      let best = null;
      const forms = kind === 'neck' ? [s, [...s].reverse().join('')] : [s];
      for (const f of forms) {
        for (let i = 0; i < n; i++) {
          const t = f.slice(i) + f.slice(0, i);
          if (best === null || t < best) best = t;
        }
      }
      return best;
    };
    const rec = () => {
      if (cur.length === n) {
        const c = canon(cur.join(''));
        if (!seen.has(c)) {
          seen.add(c);
          push(c);
        }
        return;
      }
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        used[i] = true;
        cur.push(LETTERS[i]);
        rec();
        cur.pop();
        used[i] = false;
      }
    };
    rec();
  } else if (kind === 'multi') {
    // AABC のような文字を、辞書の順に並べかえていく
    const a = counts.flatMap((c, i) => Array(c).fill(LETTERS[i]));
    for (;;) {
      push(a.join(''));
      let i = a.length - 2;
      while (i >= 0 && a[i] >= a[i + 1]) i--;
      if (i < 0) break;
      let j = a.length - 1;
      while (a[j] <= a[i]) j--;
      [a[i], a[j]] = [a[j], a[i]];
      a.splice(i + 1, a.length - i - 1, ...a.slice(i + 1).reverse());
    }
  }
  return { count, sample };
}

function needLE(r, n, what) {
  if (r > n) throw new CalcError(what);
}

// ---------------------------------------------------------
// 二項分布（くり返し）：Σ_{j=from}^{to} nCj p^j (1−p)^(n−j)
//
// 正確に：p ＝ A/B なら、分子 nCj A^j (B−A)^(n−j) を整数のまま足して、最後に B^n で割る。
//   となりの項は「× (n−j) A ÷ ((j+1)(B−A))」（割り切れる）
// 概数で：いちばん大きい項（mode）を 1 として、となりへの比で左右に足していく（固定小数点の整数）
// ---------------------------------------------------------
const EXACT_N = 2000n;       // これ以下なら正確な分数で
const EXACT_BITS = 8000;     // 分母がこれ（約2400桁）より大きくなるときは概数で（正確な分数は遅いので）

// 概数でも、そのままの値の分数に（0.3 → 3/10）
function asFrac(x) {
  if (x.q) return x;
  return x.e >= 0n ? N.frac(x.m * 10n ** x.e) : N.frac(x.m, 10n ** -x.e);
}

// x^k（正確な分数が大きくなりすぎるときは概数で）
export function powFit(x, k) {
  if (x.q && (N.bitLen(x.n) + N.bitLen(x.d)) * Number(k) > EXACT_BITS) return N.pow(N.toApprox(x, N.P + 10), N.frac(k));
  return N.pow(x, N.frac(k));
}

function binomTerm(p, n, j) {
  return N.mul(N.mul(S.nCr(N.frac(n), N.frac(j)), powFit(p, j)), powFit(N.sub(ONE, p), n - j));
}

const nCrInt = (n, r) => S.nCr(N.frac(n), N.frac(r)).n; // 正確な整数（小さい数だけ）

export function binomSum(p, n, from, to) {
  if (from < 0n) from = 0n;
  if (to > n) to = n;
  if (from > to) return ZERO;
  if (N.isZero(p)) return from === 0n ? ONE : ZERO;
  if (N.cmp(p, ONE) === 0) return to === n ? ONE : ZERO;
  const { n: A, d: B } = asFrac(p);
  const C = B - A;
  if (p.q && n <= EXACT_N && N.bitLen(B) * Number(n) <= EXACT_BITS) {
    let t = nCrInt(n, from) * A ** from * C ** (n - from);
    let s = t;
    for (let j = from; j < to; j++) {
      t = (t * (n - j) * A) / ((j + 1n) * C);
      s += t;
    }
    return N.frac(s, B ** n);
  }
  const mode = binomMode(p, n);
  return centered((j) => binomTerm(N.toApprox(p), n, j), (j) => [(n - j) * A, (j + 1n) * C], (j) => [j * C, (n - j + 1n) * A], mode, from, to);
}

const binomMode = (p, n) => S.floorInt(N.mul(N.frac(n + 1n), p));

// mode から左右に足す（概数のとき）。項の大きさは mode から遠いほど小さい。
//   up(j) ＝ [分子, 分母]：t(j+1) ＝ t(j) × 分子 ÷ 分母、down(j)：t(j−1) ＝ t(j) × 分子 ÷ 分母
const FIX = 10n ** 110n;  // mode の項を 1 ＝ 10^110 とする
const TINY = 10n ** 15n;  // mode の項の 10^−95 より小さくなったら止める
function centered(term, up, down, mode, from, to) {
  const m = mode < from ? from : mode > to ? to : mode;
  let s = FIX;
  let t = FIX;
  for (let j = m; j < to && t > TINY; j++) {
    const [a, b] = up(j);
    t = (t * a) / b;
    s += t;
  }
  t = FIX;
  for (let j = m; j > from && t > TINY; j--) {
    const [a, b] = down(j);
    t = (t * a) / b;
    s += t;
  }
  return N.mul(N.toApprox(term(m), N.P + 10), N.frac(s, FIX));
}

// ---------------------------------------------------------
// 超幾何分布（くじ）：全部 N 本・当たり K 本・n 本引いて j 本当たる
//   KCj × (N−K)C(n−j) ÷ NCn。正確なときも分子を整数のまま足す
// ---------------------------------------------------------
const EXACT_LOT = 5000n;

function hyperTerm(Nn, K, n, j) {
  return N.div(N.mul(S.nCr(N.frac(K), N.frac(j)), S.nCr(N.frac(Nn - K), N.frac(n - j))), S.nCr(N.frac(Nn), N.frac(n)));
}

export function hyperRange(Nn, K, n) {
  const lo = n - (Nn - K) > 0n ? n - (Nn - K) : 0n;
  const hi = n < K ? n : K;
  return [lo, hi];
}

export function hyperSum(Nn, K, n, from, to) {
  const [lo, hi] = hyperRange(Nn, K, n);
  if (from < lo) from = lo;
  if (to > hi) to = hi;
  if (from > to) return ZERO;
  const M = Nn - K; // はずれの本数
  const up = (j) => [(K - j) * (n - j), (j + 1n) * (M - n + j + 1n)];
  const down = (j) => [j * (M - n + j), (K - j + 1n) * (n - j + 1n)];
  if (Nn <= EXACT_LOT) {
    let t = nCrInt(K, from) * nCrInt(M, n - from);
    let s = t;
    for (let j = from; j < to; j++) {
      const [a, b] = up(j);
      t = (t * a) / b;
      s += t;
    }
    return N.frac(s, nCrInt(Nn, n));
  }
  const mode = ((n + 1n) * (K + 1n)) / (Nn + 2n);
  return centered((j) => hyperTerm(Nn, K, n, j), up, down, mode, from, to);
}

// ---------------------------------------------------------
// ガチャ
// ---------------------------------------------------------
// p の確率を n 回で1回以上
export const atLeastOnce = (p, n) => N.sub(ONE, powFit(N.sub(ONE, p), n));

// t 以上にするには何回（いちばん少ない回数）
export function pullsFor(p, t) {
  if (N.isZero(t)) return 0n;
  if (N.isZero(p)) throw new CalcError('当たる確率が 0 なので、何回引いても当たりません');
  if (N.cmp(p, ONE) === 0) return 1n;
  if (N.cmp(t, ONE) === 0) throw new CalcError('100% にはなりません（何回引いても、はずれ続けることがあります）');
  const pp = N.P + 10;
  const x = N.div(N.ln(N.sub(ONE, t), pp), N.ln(N.sub(ONE, p), pp), pp);
  if (N.approxLog10(x) > 15) throw new CalcError('回数が大きすぎて計算できません');
  let n = -S.floorInt(N.neg(x));
  if (n < 1n) n = 1n;
  const reach = (k) => N.cmp(atLeastOnce(p, k), t) >= 0;
  while (n > 1n && reach(n - 1n)) n--;
  while (!reach(n)) n++;
  return n;
}

// 当たるまでの平均の回数（天井 c があれば c 回目は必ず当たる）：(1 − (1−p)^c) ÷ p
export function averagePulls(p, c = null) {
  if (N.isZero(p)) {
    if (c === null) throw new CalcError('当たる確率が 0 なので、当たりません');
    return N.frac(c);
  }
  if (c === null) return N.div(ONE, p);
  return N.div(N.sub(ONE, powFit(N.sub(ONE, p), c)), p);
}

// 全 m 種類そろえるまでの平均：m × (1 + 1/2 + … + 1/m)
//   多いときは 1/k を 100 桁の整数（固定小数点）にして足す
const FIX100 = 10n ** 100n;
export function completeAverage(m) {
  let h = ZERO;
  if (m <= 1000n) {
    for (let k = 1n; k <= m; k++) h = N.add(h, N.frac(1n, k));
    return N.mul(N.frac(m), h);
  }
  let s = 0n;
  for (let k = 1n; k <= m; k++) s += FIX100 / k;
  return N.toApprox(N.frac(m * s, FIX100));
}

// n 回で m 種類そろう確率：Σ (−1)^j mCj ((m−j)/m)^n（包除原理）
//   分子 Σ (−1)^j mCj (m−j)^n を整数のまま足して、最後に m^n で割る
export function completeWithin(m, n) {
  if (n < m) return ZERO;
  let s = 0n;
  let c = 1n; // mCj
  for (let j = 0n; j < m; j++) {
    const t = c * (m - j) ** n;
    s = j % 2n === 0n ? s + t : s - t;
    c = (c * (m - j)) / (j + 1n);
  }
  const x = N.frac(s, m ** n);
  return N.bitLen(x.d) > EXACT_BITS ? N.toApprox(x) : x;
}

// 1回ずつ「いま何種類もっているか」を追いかけて計算（検算用。整数の分子と、分母 m^n）
export function completeByStates(m, n) {
  const M = Number(m);
  let num = Array(M + 1).fill(0n);
  num[0] = 1n;
  for (let i = 0n; i < n; i++) {
    const next = Array(M + 1).fill(0n);
    for (let d = 0; d <= M; d++) {
      if (num[d] === 0n) continue;
      next[d] += num[d] * BigInt(d);           // もっている種類が出た
      if (d < M) next[d + 1] += num[d] * BigInt(M - d); // 新しい種類が出た
    }
    num = next;
  }
  return N.frac(num[M], m ** n);
}

// ---------------------------------------------------------
// 正規分布：上側の確率 Q(z) ＝ z より大きくなる割合
// ---------------------------------------------------------
function phiN(z, p) {
  const e = N.exp(N.neg(N.div(N.mul(z, z, p), I(2), p)), p);
  return N.div(e, N.sqrt(N.mul(I(2), N.pi(p), p), p), p);
}

export function upperTail(z) {
  if (N.sign(z) < 0) return N.sub(ONE, upperTail(N.neg(z)));
  if (N.isZero(z)) return HALF;
  const zz = N.toNumber(z);
  if (zz > 1e7) throw new CalcError('平均から はなれすぎていて計算できません');
  if (zz > 40) {
    // とても大きい z：Q(z) ≒ φ(z)/z × (1 − 1/z² + 3/z⁴ − 15/z⁶ …)
    const p = N.P + 10;
    const z2 = N.mul(z, z, p);
    let t = ONE;
    let s = ONE;
    for (let k = 1n; k < 200n; k++) {
      t = N.neg(N.div(N.mul(t, N.frac(2n * k - 1n), p), z2, p));
      s = N.add(s, t, p);
      if (N.approxLog10(N.absNum(t)) < -p) break;
    }
    return N.toApprox(N.div(N.mul(phiN(z, p), s, p), z, p), N.P);
  }
  // Q(z) ＝ 1/2 − φ(z) × (z + z³/3 + z⁵/(3·5) + …)。打ち消して消える桁のぶん、桁を増やす
  const p = N.P + 20 + Math.ceil((zz * zz) / 4.6);
  const z2 = N.mul(z, z, p);
  let t = N.toApprox(z, p);
  let s = t;
  for (let k = 1n; ; k++) {
    t = N.div(N.mul(t, z2, p), N.frac(2n * k + 1n), p);
    s = N.add(s, t, p);
    if (N.approxLog10(t) < N.approxLog10(s) - p) break;
  }
  return N.toApprox(N.sub(HALF, N.mul(phiN(z, p), s, p), p), N.P);
}

// Q(z) ＝ q になる z（ニュートン法）
export function upperTailInv(q) {
  if (N.sign(q) <= 0 || N.cmp(q, ONE) >= 0) throw new CalcError('割合は 0% より大きく 100% より小さい数です');
  const c = N.cmp(q, HALF);
  if (c === 0) return ZERO;
  if (c > 0) return N.neg(upperTailInv(N.sub(ONE, q)));
  // はじめの見当（アブラモウィッツとステガンの近似式）
  const lq = N.approxLog10(q) * Math.LN10;
  const t = Math.sqrt(-2 * lq);
  const z0 = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  let z = N.toApprox(N.parseDecimal(z0.toFixed(12)));
  const p = N.P + 10;
  for (let i = 0; i < 40; i++) {
    const dz = N.div(N.sub(upperTail(z), q, p), phiN(z, p), p);
    z = N.add(z, dz, p);
    if (N.isZero(dz) || N.approxLog10(N.absNum(dz)) < -75) break;
  }
  return N.toApprox(z, N.P);
}

// 細い長方形（シンプソンの公式）で φ の面積を出す（検算用。ふつうの小数で 10桁くらい）
export function areaBySimpson(za, zb, steps = 20000) {
  const f = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const h = (zb - za) / steps;
  let s = f(za) + f(zb);
  for (let i = 1; i < steps; i++) s += f(za + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

// ---------------------------------------------------------
// 計算の種類
//   fields：{ key, name, type, init, hint, opt（空でもよい） }
//   modes：[[key, 文字], …]（ちょうど・以上・以下 など）
//   solve(v, mode, raw) → { value, unit, label, lines, formula }
//     unit：'prob'（% で出す）・'通り'・'回'・'本'・''
//   check(v, mode, r, raw) → [{ title, rows: [['line'|'hint', 文] | ['ok', 文, 合うか]] }]
// ---------------------------------------------------------
export const CATS = [
  { key: 'count', name: '場合の数' },
  { key: 'rep', name: 'くり返し' },
  { key: 'gacha', name: 'ガチャ' },
  { key: 'lot', name: 'くじ' },
  { key: 'bayes', name: '条件付き' },
  { key: 'norm', name: '偏差値・分布' },
];

const f = (key, name, type, init, hint, opt = false) => ({ key, name, type, init, hint, opt });
const line = (t) => ['line', t];
const hint = (t) => ['hint', t];
const ok = (t, good) => ['ok', t, good];
const sec = (title, ...rows) => ({ title, rows });

const MODES3 = [['eq', 'ちょうど'], ['ge', '以上'], ['le', '以下']];
const modeWord = (m) => ({ eq: 'ちょうど', ge: '以上', le: '以下' }[m]);

// 場合の数の「全部書き出して数える」
function enumSection(kind, n, r, value, counts) {
  const big = !value.q || N.cmp(value, I(ENUM_MAX)) > 0;
  const tooMany = kind === 'circ' || kind === 'neck' ? n > 8 : n > 26 || r > 30;
  if (big || tooMany) {
    return sec('全部書き出して数える', hint(`${big ? `${ENUM_MAX.toLocaleString()} 通りより多い` : 'ものが多すぎる'}ので、書き出すのは省略します（小さい数で試すと、書き出した数が見られます）`));
  }
  const e = enumerate(kind, Number(n), Number(r), counts.map(Number));
  const rows = [line(`${e.sample.join(' ')}${e.count > e.sample.length ? ' …' : ''}`)];
  if (kind === 'circ') rows.push(hint('円のように並べた形を、A から時計回りに読んでいます（回して同じになるものは1つ）'));
  if (kind === 'neck') rows.push(hint('回したものと裏返したものを同じとみなして、1つだけ残しています'));
  rows.push(ok(`書き出すと全部で ${e.count.toLocaleString()} 通り`, N.cmp(I(e.count), value) === 0));
  return sec('全部書き出して数える（A, B, C … で）', ...rows);
}

const factors = (from, count) => {
  // from × (from−1) × … （count 個）
  if (count === 0n) return '1';
  if (count <= 6n) return Array.from({ length: Number(count) }, (_, i) => String(from - BigInt(i))).join(' × ');
  return `${from} × ${from - 1n} × … × ${from - count + 1n}（${count} 個）`;
};

export const CALCS = [
  // ---------------- 場合の数 ----------------
  {
    key: 'perm', cat: 'count', name: '順列 nPr', show: 'nPr ＝ n × (n−1) × …（r 個）',
    ex: '例：5人から3人を選んで1列に並べる → 5P3 ＝ 60 通り',
    note: '順番がちがえば別の並び（AB と BA は別）',
    fields: [f('n', 'n（全部の数）', 'int', '5', 'n：全部でいくつあるか'), f('r', 'r（並べる数）', 'int', '3', 'r：何個えらんで並べるか')],
    solve({ n, r }) {
      needLE(r, n, 'r は n 以下にしてください（n 個から n 個より多くは選べません）');
      return { value: S.nPr(N.frac(n), N.frac(r)), unit: '通り', label: `${n}P${r}`, formula: `${n}P${r} ＝ ${factors(n, r)}` };
    },
    check({ n, r }, mode, res) {
      const out = [];
      const a = S.factorial(N.frac(n));
      const b = S.factorial(N.frac(n - r));
      const v = N.div(a, b);
      out.push(sec('階乗の割り算でも出す', line(`n! ÷ (n−r)! ＝ ${n}! ÷ ${n - r}!`), line(`＝ ${T(a)} ÷ ${T(b)} ＝ ${T(v)}`), ok('同じ答え', same(v, res.value)),
        hint(`${n}! は ${n} から 1 まで全部かけた数。うしろの ${n - r}! の分を割ると、はじめの ${r} 個のかけ算だけが残ります`)));
      out.push(enumSection('perm', n, r, res.value, []));
      return out;
    },
  },
  {
    key: 'comb', cat: 'count', name: '組合せ nCr', show: 'nCr ＝ nPr ÷ r!',
    ex: '例：5人から3人を選ぶ（順番は関係ない） → 5C3 ＝ 10 通り',
    note: '順番は関係ない（AB と BA は同じ）',
    fields: [f('n', 'n（全部の数）', 'int', '5', 'n：全部でいくつあるか'), f('r', 'r（選ぶ数）', 'int', '3', 'r：何個選ぶか')],
    solve({ n, r }) {
      needLE(r, n, 'r は n 以下にしてください（n 個から n 個より多くは選べません）');
      return { value: S.nCr(N.frac(n), N.frac(r)), unit: '通り', label: `${n}C${r}`, formula: `${n}C${r} ＝ ${n}P${r} ÷ ${r}! ＝ (${factors(n, r)}) ÷ (${factors(r, r)})` };
    },
    check({ n, r }, mode, res) {
      const out = [];
      const P = S.nPr(N.frac(n), N.frac(r));
      const back = N.mul(res.value, S.factorial(N.frac(r)));
      out.push(sec('逆算：選んだ r 個の並べ方（r!）をかけると順列', line(`${T(res.value)} × ${r}! ＝ ${T(back)}`), line(`${n}P${r} ＝ ${T(P)}`), ok('同じ', same(back, P)),
        hint('選んだ r 個を並べる並べ方は r! 通り。だから 組合せ × r! ＝ 順列 になります')));
      if (r >= 1n && r < n) {
        const a = S.nCr(N.frac(n - 1n), N.frac(r - 1n));
        const b = S.nCr(N.frac(n - 1n), N.frac(r));
        const s = N.add(a, b);
        out.push(sec('別の数え方（パスカルの三角形）', line(`${n - 1n}C${r - 1n} ＋ ${n - 1n}C${r} ＝ ${T(a)} ＋ ${T(b)} ＝ ${T(s)}`), ok('同じ答え', same(s, res.value)),
          hint('ある1つ（A）を「選ぶ場合」と「選ばない場合」に分けて数えた和です')));
      }
      out.push(enumSection('comb', n, r, res.value, []));
      return out;
    },
  },
  {
    key: 'rperm', cat: 'count', name: '重複順列 nʳ', show: 'n × n × … × n（r 回）',
    ex: '例：○× の答え方を5問 → 2⁵ ＝ 32 通り',
    note: '同じものを何回えらんでもよい。並べる（順番がちがえば別）',
    fields: [f('n', 'n（種類の数）', 'int', '2', 'n：何種類から選ぶか'), f('r', 'r（回数・個数）', 'int', '5', 'r：何回（何個）並べるか')],
    solve({ n, r }) {
      return { value: N.pow(N.frac(n), N.frac(r)), unit: '通り', label: `${n}^${r}`, formula: `${n}^${r} ＝ ${r <= 6n && r > 0n ? Array(Number(r)).fill(String(n)).join(' × ') : `${n} × ${n} × …（${r} 回）`}` };
    },
    check({ n, r }, mode, res) {
      const out = [];
      if (n >= 2n && r >= 1n) {
        const back = S.logb(N.frac(n), res.value);
        const sub = String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
        out.push(sec('逆算：log で「何回かけたか」にもどす', line(`log${sub} ${T(res.value)} ＝ ${T(back)}`), ok(`${r} 回`, same(back, N.frac(r), 30)),
          hint(`log${sub} は「${n} を何回かけるとその数になるか」です`)));
      }
      out.push(enumSection('rperm', n, r, res.value, []));
      return out;
    },
  },
  {
    key: 'rcomb', cat: 'count', name: '重複組合せ nHr', show: 'nHr ＝ (n＋r−1)Cr',
    ex: '例：3種類のおにぎりから5個（同じ種類を何個でも） → 3H5 ＝ 21 通り',
    note: '同じ種類を何個えらんでもよい。順番は関係ない',
    fields: [f('n', 'n（種類の数）', 'int', '3', 'n：何種類から選ぶか'), f('r', 'r（選ぶ数）', 'int', '5', 'r：全部で何個選ぶか')],
    solve({ n, r }) {
      if (n === 0n && r > 0n) throw new CalcError('種類が 0 なので選べません');
      const v = n === 0n ? ONE : S.nCr(N.frac(n + r - 1n), N.frac(r));
      return { value: v, unit: '通り', label: `${n}H${r}`, formula: `${n}H${r} ＝ ${n + r - 1n}C${r}` };
    },
    check({ n, r }, mode, res) {
      const out = [];
      if (n >= 1n) {
        const v = S.nCr(N.frac(n + r - 1n), N.frac(n - 1n));
        out.push(sec('別の数え方：○ と 仕切り｜ の並べ方', line(`○ ${r} 個と ｜ ${n - 1n} 本を並べる → ${n + r - 1n}C${n - 1n} ＝ ${T(v)}`), ok('同じ答え', same(v, res.value)),
          hint(`○○｜○｜○○ は「1種類目 2個・2種類目 1個・3種類目 2個」。${n + r - 1n} か所のうち、仕切りの ${n - 1n} か所を選ぶのと同じです`)));
      }
      out.push(enumSection('rcomb', n, r, res.value, []));
      return out;
    },
  },
  {
    key: 'circ', cat: 'count', name: '円順列', show: '(n−1)!',
    ex: '例：5人が丸いテーブルに座る → 4! ＝ 24 通り',
    note: '回して同じになる並びは1通り',
    fields: [f('n', 'n（並べる数）', 'int', '5', 'n：何個（何人）を丸く並べるか')],
    solve({ n }) {
      if (n < 1n) throw new CalcError('n は 1 以上です');
      return { value: S.factorial(N.frac(n - 1n)), unit: '通り', label: '円順列', formula: `(${n}−1)! ＝ ${n - 1n}! ＝ ${factors(n - 1n, n - 1n)}` };
    },
    check({ n }, mode, res) {
      const all = S.factorial(N.frac(n));
      const back = N.mul(res.value, N.frac(n));
      return [
        sec('逆算：回した n 通りをもどすと、1列の並べ方', line(`${T(res.value)} × ${n} ＝ ${T(back)}`), line(`${n}! ＝ ${T(all)}`), ok('同じ', same(back, all)),
          hint(`丸い並び1つから、どこから読みはじめるかで 1列の並びが ${n} 通りできます`)),
        enumSection('circ', n, n, res.value, []),
      ];
    },
  },
  {
    key: 'neck', cat: 'count', name: 'じゅず順列', show: '(n−1)! ÷ 2',
    ex: '例：6個のちがう玉でブレスレット → 5! ÷ 2 ＝ 60 通り',
    note: '回しても裏返しても同じなら1通り（3個より少ないときは 1 通り）',
    fields: [f('n', 'n（玉の数）', 'int', '6', 'n：何個のちがう玉を輪にするか')],
    solve({ n }) {
      if (n < 1n) throw new CalcError('n は 1 以上です');
      const v = n < 3n ? ONE : N.div(S.factorial(N.frac(n - 1n)), I(2));
      return { value: v, unit: '通り', label: 'じゅず順列', formula: n < 3n ? '3個より少ないと、裏返しても同じ並び → 1' : `(${n}−1)! ÷ 2 ＝ ${n - 1n}! ÷ 2` };
    },
    check({ n }, mode, res) {
      const out = [];
      if (n >= 3n) {
        const c = S.factorial(N.frac(n - 1n));
        const back = N.mul(res.value, I(2));
        out.push(sec('逆算：裏返しの 2 通りをもどすと円順列', line(`${T(res.value)} × 2 ＝ ${T(back)}`), line(`円順列 (${n}−1)! ＝ ${T(c)}`), ok('同じ', same(back, c)),
          hint('3個以上なら、裏返すと必ず別の円順列になるので、ちょうど半分です')));
      }
      out.push(enumSection('neck', n, n, res.value, []));
      return out;
    },
  },
  {
    key: 'multi', cat: 'count', name: '同じものを含む順列', show: 'n! ÷ (a! × b! × …)',
    ex: '例：A・A・B・C の4文字の並べ方 → 4! ÷ 2! ＝ 12 通り',
    note: '同じ文字どうしを入れかえても同じ並び（空の欄は使わない）',
    fields: [f('a', 'A の数', 'int', '2', 'A が何個あるか'), f('b', 'B の数', 'int', '1', 'B が何個あるか'), f('c', 'C の数', 'int', '1', 'C が何個あるか（なければ空）', true), f('d', 'D の数', 'int', '', 'D が何個あるか（なければ空）', true)],
    solve(v) {
      const cs = ['a', 'b', 'c', 'd'].map((k) => v[k]).filter((x) => x !== undefined);
      const n = cs.reduce((s, x) => s + x, 0n);
      let d = ONE;
      for (const c of cs) d = N.mul(d, S.factorial(N.frac(c)));
      const val = N.div(S.factorial(N.frac(n)), d);
      return { value: val, unit: '通り', label: '並べ方', formula: `${n}! ÷ (${cs.map((c) => `${c}!`).join(' × ')})`, n, cs };
    },
    check(v, mode, res) {
      const { n, cs } = res;
      const out = [];
      let back = res.value;
      for (const c of cs) back = N.mul(back, S.factorial(N.frac(c)));
      const all = S.factorial(N.frac(n));
      out.push(sec('逆算：同じ文字の入れかえ方をかけると、全部ちがうときの並べ方', line(`${T(res.value)} × ${cs.map((c) => `${c}!`).join(' × ')} ＝ ${T(back)}`), line(`${n}! ＝ ${T(all)}`), ok('同じ', same(back, all))));
      // 場所を選んでいく
      let rest = n;
      let prod = ONE;
      const parts = [];
      for (const c of cs) {
        prod = N.mul(prod, S.nCr(N.frac(rest), N.frac(c)));
        parts.push(`${rest}C${c}`);
        rest -= c;
      }
      out.push(sec('別の数え方：文字ごとに、置く場所を選ぶ', line(`${parts.join(' × ')} ＝ ${T(prod)}`), ok('同じ答え', same(prod, res.value)),
        hint(`${n} か所から A の場所を選び、残りから B の場所を選び…とかけていきます`)));
      out.push(enumSection('multi', n, n, res.value, cs));
      return out;
    },
  },

  // ---------------- くり返し（二項分布） ----------------
  {
    key: 'binom', cat: 'rep', name: 'n 回中 k 回', show: 'nCk × p^k × (1−p)^(n−k)',
    ex: '例：さいころを10回ふって、6の目が2回以上（p ＝ 1/6）',
    note: '毎回の起こりやすさが同じで、前の結果に関係しないとき（反復試行）',
    fields: [f('p', '確率 p', 'prob', '1/6', 'p：1回で起きる確率。1/6・0.3・3% のように打てます（/ と % のキー）'), f('n', '回数 n', 'int', '10', 'n：何回くり返すか'), f('k', '起きる回数 k', 'int', '2', 'k：そのうち何回起きるか')],
    modes: MODES3, mode: 'ge',
    solve({ p, n, k }, mode) {
      if (n > 10000000n) throw new CalcError('回数は 1000万回 までです');
      const [from, to] = mode === 'eq' ? [k, k] : mode === 'ge' ? [k, n] : [0n, k];
      const value = binomSum(p, n, from, to);
      const lines = [`平均すると ${T(N.mul(N.frac(n), p), 8)} 回 起きる`];
      if (!N.isZero(p) && N.cmp(p, ONE) < 0) {
        const m = binomMode(p, n) > n ? n : binomMode(p, n);
        lines.push(`いちばん起きやすいのは ${m} 回（${pct(binomSum(p, n, m, m))}）`);
      }
      const q = `(1−p)`;
      return {
        value, unit: 'prob', label: `${k} 回${modeWord(mode)}`, lines,
        formula: mode === 'eq' ? `${n}C${k} × p^${k} × ${q}^${n - k}` : `${mode === 'ge' ? `${k}〜${n}` : `0〜${k}`} 回の確率を足す`,
      };
    },
    check({ p, n, k }, mode, res) {
      const out = [];
      if (k > n) {
        return [sec('k が n より大きい', hint(`${n} 回で ${k} 回は起きないので、ちょうど・以上は 0、以下は 1（100%）です`))];
      }
      if (mode === 'eq') {
        const c = S.nCr(N.frac(n), N.frac(k));
        const a = N.pow(p, N.frac(k));
        const b = N.pow(N.sub(ONE, p), N.frac(n - k));
        const v = N.mul(N.mul(c, a), b);
        out.push(sec('式に数を入れる', line(`${n}C${k} ＝ ${T(c)}（${k} 回起きるのが どの回か の選び方）`), line(`p^${k} ＝ ${fracOr(a)}`), line(`(1−p)^${n - k} ＝ ${fracOr(b)}`),
          line(`かけると ${fracOr(v)} ＝ ${pct(v)}`), ok('答えと同じ', same(v, res.value))));
      } else {
        const [from, to] = mode === 'ge' ? [k, n] : [0n, k];
        const rows = [];
        const show = [];
        for (let j = from; j <= to && show.length < 5; j++) show.push(j);
        for (const j of show) rows.push(line(`${j} 回：${pct(binomSum(p, n, j, j))}`));
        if (to > show[show.length - 1]) rows.push(line(`…（${to} 回まで）`));
        rows.push(line(`足すと ${pct(res.value)}`));
        out.push(sec('1つずつの確率を足す', ...rows));
      }
      // 反対の場合
      if ((mode === 'ge' && k > 0n) || (mode === 'le' && k < n)) {
        const other = mode === 'ge' ? binomSum(p, n, 0n, k - 1n) : binomSum(p, n, k + 1n, n);
        out.push(complementSection(`${mode === 'ge' ? `${k - 1n} 回以下` : `${k + 1n} 回以上`} の確率`, other, res.value));
      }
      if (n <= 400n) {
        const all = binomSum(p, n, 0n, n);
        out.push(sec('0 回から n 回まで全部足すと 1（100%）', line(`合計 ＝ ${pct(all)}`), ok('100%', same(all, ONE, 30))));
      }
      return out;
    },
  },

  // ---------------- ガチャ ----------------
  {
    key: 'atleast', cat: 'gacha', name: 'n 回で1回以上', show: '1 − (1−p)^n',
    ex: '例：1% のガチャを100回引いて、1回以上当たる',
    note: '「1% を100回引けば必ず当たる」わけではありません',
    fields: [f('p', '当たる確率 p', 'prob', '1%', 'p：1% や 0.5% のように（/ と % のキー）'), f('n', '引く回数 n', 'int', '100', 'n：何回引くか')],
    solve({ p, n }) {
      const none = powFit(N.sub(ONE, p), n);
      const value = N.sub(ONE, none);
      return {
        value, unit: 'prob', label: '1回以上当たる',
        lines: [`1回も当たらない：${pct(none)}`, `平均すると ${T(N.mul(N.frac(n), p), 8)} 回 当たる`, `ちょうど1回：${pct(binomSum(p, n, 1n, 1n))}`],
        formula: `1 − (1 − p)^${n}（1回も当たらない確率を 1 から引く）`,
      };
    },
    check({ p, n }, mode, res) {
      const q = N.sub(ONE, p);
      const out = [];
      // k 回目にはじめて当たる確率を足す
      const rows = [];
      let s = ZERO;
      if (n <= 5000n) {
        const exact = (N.bitLen(q.n) + N.bitLen(q.d)) * Number(n) <= EXACT_BITS;
        let t = exact ? p : N.toApprox(p, N.P + 10);
        for (let k = 1n; k <= n; k++) {
          if (k <= 3n) rows.push(line(`${k} 回目にはじめて当たる：${k === 1n ? 'p' : `(1−p)${k === 2n ? '' : `^${k - 1n}`} × p`} ＝ ${pct(t)}`));
          s = N.add(s, t, N.P + 10);
          t = N.mul(t, q, N.P + 10);
        }
      } else {
        s = N.div(N.mul(p, N.sub(ONE, powFit(q, n))), N.isZero(p) ? ONE : p);
        rows.push(hint('回数が多いので、等比数列の和の公式で足しました'));
      }
      if (n > 3n) rows.push(line(`…（${n} 回目まで）`));
      rows.push(line(`足すと ${pct(s)}`), ok('答えと同じ', same(s, res.value, 30)));
      out.push(sec('別の計算：「k 回目にはじめて当たる」を足す', ...rows));
      const none = powFit(q, n);
      out.push(sec('当たる ＋ 1回も当たらない ＝ 100%', line(`${pct(res.value)} ＋ ${pct(none)} ＝ ${pct(N.add(res.value, none))}`), ok('100%', same(N.add(res.value, none), ONE, 30))));
      return out;
    },
  },
  {
    key: 'needed', cat: 'gacha', name: '〇% にするには何回', show: '1 − (1−p)^n ≥ 〇%',
    ex: '例：1% のガチャで、90% 以上の確率で当てるには？',
    note: '天井がなければ、何回引いても 100% にはなりません',
    fields: [f('p', '当たる確率 p', 'prob', '1%', 'p：1% や 0.5% のように'), f('t', 'めざす確率', 'prob', '90%', 'めざす確率：50%・90%・99% など')],
    solve({ p, t }) {
      const n = pullsFor(p, t);
      const lines = [];
      for (const [label, x] of [['50%', HALF], ['90%', N.frac(9n, 10n)], ['99%', N.frac(99n, 100n)]]) {
        try {
          lines.push(`${label} にするには ${pullsFor(p, x).toLocaleString()} 回`);
        } catch {
          // p が 0 など
        }
      }
      return { value: N.frac(n), unit: '回', label: '必要な回数', lines, formula: `1 − (1 − p)^n が めざす確率以上になる、いちばん少ない n` };
    },
    check({ p, t }, mode, res) {
      const n = S.floorInt(res.value);
      const rows = [];
      if (n >= 1n) {
        const a = atLeastOnce(p, n - 1n);
        rows.push(line(`${n - 1n} 回：${pct(a)}`), ok(`めざす ${pct(t)} より小さい`, N.cmp(a, t) < 0));
      }
      const b = atLeastOnce(p, n);
      rows.push(line(`${n} 回：${pct(b)}`), ok(`めざす ${pct(t)} 以上`, N.cmp(b, t) >= 0));
      return [sec('1回少ないと足りず、この回数でとどく', ...rows)];
    },
  },
  {
    key: 'average', cat: 'gacha', name: '当たるまで平均何回', show: '1 ÷ p（天井 c があれば (1 − (1−p)^c) ÷ p）',
    ex: '例：1% なら平均 100 回。天井 90 回なら 約 59.5 回',
    note: '天井：その回数目は必ず当たる回数（なければ空に）',
    fields: [f('p', '当たる確率 p', 'prob', '1%', 'p：1% や 0.5% のように'), f('c', '天井 c（なければ空）', 'int', '', '天井：何回目で必ず当たるか（なければ空）', true)],
    solve({ p, c }) {
      const cc = c ?? null;
      if (cc !== null && cc < 1n) throw new CalcError('天井は 1 回以上です');
      const value = averagePulls(p, cc);
      const lines = [];
      if (!N.isZero(p) && N.cmp(p, ONE) < 0) {
        const half = pullsFor(p, HALF);
        if (cc === null || half <= cc) lines.push(`半分（50%）の人は ${half.toLocaleString()} 回までに当たる`);
        if (cc !== null) lines.push(`天井まで行く確率：${pct(powFit(N.sub(ONE, p), cc - 1n))}`);
      }
      return { value, unit: '回', label: '平均', lines, formula: cc === null ? '1 ÷ p' : `(1 − (1 − p)^${cc}) ÷ p` };
    },
    check({ p, c }, mode, res) {
      const q = N.sub(ONE, p);
      const cc = c ?? null;
      if (cc === null) {
        const back = N.add(ONE, N.mul(q, res.value));
        return [sec('考え方でたしかめる：1回引いて、はずれたら最初からと同じ', line(`平均 ＝ 1 ＋ (1−p) × 平均`), line(`1 ＋ ${pct(q)} × ${T(res.value)} ＝ ${T(back)}`), ok('同じ', same(back, res.value, 30)),
          hint('1回は必ず引きます。はずれた（1−p）ときは、また同じ平均の回数がかかります'))];
      }
      if (cc > 20000n) return [sec('たしかめ', hint('天井が大きいので省略します'))];
      // 天井から1回ずつ：E₁ ＝ 1、Eₖ ＝ 1 ＋ (1−p) × Eₖ₋₁
      const qq = cc > 300n ? N.toApprox(q, N.P + 10) : q;
      let e = ONE;
      for (let k = 2n; k <= cc; k++) e = N.add(ONE, N.mul(qq, e, N.P + 10), N.P + 10);
      return [sec('天井から1回ずつ考える', line('天井まで残り1回なら 1 回'), line('残り k 回なら：1 ＋ (1−p) × (残り k−1 回のときの平均)'), line(`残り ${cc} 回 ＝ ${T(e)}`), ok('答えと同じ', same(e, res.value, 30)))];
    },
  },
  {
    key: 'comp', cat: 'gacha', name: '全種類そろえる（平均）', show: 'm × (1 ＋ 1/2 ＋ … ＋ 1/m)',
    ex: '例：6種類のおまけを全部そろえるまで、平均 14.7 回',
    note: 'どの種類も同じ確率で出るとき',
    fields: [f('m', '種類の数 m', 'int', '6', 'm：全部で何種類か')],
    solve({ m }) {
      if (m < 1n) throw new CalcError('種類は 1 以上です');
      if (m > 100000n) throw new CalcError('種類は 10万 までです');
      const value = completeAverage(m);
      const lines = m >= 2n ? [`最後の1種類だけで、平均 ${m} 回`] : [];
      return { value, unit: '回', label: '平均', lines, formula: `${m} × (1 ＋ 1/2 ＋ … ＋ 1/${m})` };
    },
    check({ m }, mode, res) {
      const rows = [];
      let s = ZERO;
      let fix = 0n; // 多いときは固定小数点で
      for (let k = 1n; k <= m; k++) {
        if (k <= 3n || k === m) rows.push(line(`${k} 種類目（新しいのが出る確率 ${m - k + 1n}/${m}）：平均 ${T(N.frac(m, m - k + 1n))} 回`));
        else if (k === 4n) rows.push(line('…'));
        if (m <= 1000n) s = N.add(s, N.frac(m, m - k + 1n));
        else fix += (m * FIX100) / (m - k + 1n);
      }
      if (m > 1000n) s = N.toApprox(N.frac(fix, FIX100));
      rows.push(line(`足すと ${T(s)} 回`), ok('答えと同じ', same(s, res.value, 30)));
      return [sec('1種類ずつ、新しい種類が出るまでの平均を足す', ...rows, hint('新しい種類が出る確率が q なら、出るまで平均 1 ÷ q 回（ガチャの「平均何回」と同じ）'))];
    },
  },
  {
    key: 'compn', cat: 'gacha', name: 'n 回でそろう確率', show: 'Σ (−1)^j mCj ((m−j)/m)^n',
    ex: '例：6種類を20回で全部そろえる確率',
    note: 'どの種類も同じ確率で出るとき（m は 200、n は 3000 まで）',
    fields: [f('m', '種類の数 m', 'int', '6', 'm：全部で何種類か'), f('n', '引く回数 n', 'int', '20', 'n：何回引くか')],
    solve({ m, n }) {
      if (m < 1n) throw new CalcError('種類は 1 以上です');
      if (m > 200n || n > 3000n) throw new CalcError('m は 200 まで、n は 3000 までです');
      const value = completeWithin(m, n);
      return { value, unit: 'prob', label: 'そろう', lines: [`平均でそろう回数：${T(completeAverage(m))} 回`], formula: '「どれかが出ない」場合を引いて足して（包除原理）' };
    },
    check({ m, n }, mode, res) {
      if (m * n > 60000n) return [sec('たしかめ', hint('数が大きいので省略します'))];
      const v = completeByStates(m, n);
      return [sec('別の計算：1回ずつ「何種類もっているか」を追いかける', line(`${n} 回引いたあと ${m} 種類もっている確率 ＝ ${pct(v)}`), ok('答えと同じ', same(v, res.value)),
        hint(`いま d 種類もっていると、次に新しい種類が出る確率は (${m}−d)/${m}。これを ${n} 回くり返します`))];
    },
  },

  // ---------------- くじ ----------------
  {
    key: 'hyper', cat: 'lot', name: 'くじで k 本当たる', show: 'KCk × (N−K)C(n−k) ÷ NCn',
    ex: '例：10本のうち当たり3本のくじを2本引いて、1本以上当たる',
    note: '引いたくじは戻さないとき（戻すなら「くり返し」）',
    fields: [f('N', '全部の本数 N', 'int', '10', 'N：くじが全部で何本か'), f('K', '当たりの本数 K', 'int', '3', 'K：当たりが何本か'), f('n', '引く本数 n', 'int', '2', 'n：何本引くか'), f('k', '当たる本数 k', 'int', '1', 'k：何本当たるか')],
    modes: MODES3, mode: 'ge',
    solve({ N: Nn, K, n, k }, mode) {
      if (Nn < 1n) throw new CalcError('くじは 1 本以上です');
      needLE(K, Nn, '当たりの本数は、全部の本数以下です');
      needLE(n, Nn, '引く本数は、全部の本数以下です');
      if (Nn > 1000000n) throw new CalcError('全部の本数は 100万 までです');
      const [from, to] = mode === 'eq' ? [k, k] : mode === 'ge' ? [k, n] : [0n, k];
      const value = hyperSum(Nn, K, n, from, to);
      return {
        value, unit: 'prob', label: `${k} 本${modeWord(mode)}`,
        lines: [`平均すると ${T(N.div(N.frac(n * K), N.frac(Nn)), 8)} 本 当たる`, `戻すくじなら：${pct(binomSum(N.frac(K, Nn), n, from, to))}`],
        formula: mode === 'eq' ? `${K}C${k} × ${Nn - K}C${n - k} ÷ ${Nn}C${n}` : `${mode === 'ge' ? `${k}〜${n}` : `0〜${k}`} 本の確率を足す`,
      };
    },
    check({ N: Nn, K, n, k }, mode, res) {
      const out = [];
      if (mode === 'ge' && k === 1n) {
        // 1本ずつ引いて、全部はずれる確率
        let none = ONE;
        const rows = [];
        for (let i = 0n; i < n; i++) {
          const t = N.frac(Nn - K - i < 0n ? 0n : Nn - K - i, Nn - i);
          if (i < 4n) rows.push(line(`${i + 1n} 本目もはずれ：${Nn - K - i < 0n ? 0n : Nn - K - i}/${Nn - i}`));
          none = N.mul(none, t, N.P + 10);
          if (N.isZero(none)) break;
        }
        if (n > 4n) rows.push(line(`…（${n} 本目まで）`));
        const back = N.sub(ONE, none);
        rows.push(line(`全部はずれ ＝ かけて ${pct(none)}`), line(`1 − ${pct(none)} ＝ ${pct(back)}`), ok('答えと同じ', same(back, res.value, 30)));
        out.push(sec('別の計算：1本ずつ引いて「全部はずれ」を 1 から引く', ...rows, hint('はずれを1本引くと、はずれも全部も1本ずつへります（戻さないので）')));
      }
      if ((mode === 'ge' && k > 0n) || (mode === 'le' && k < n)) {
        const other = mode === 'ge' ? hyperSum(Nn, K, n, 0n, k - 1n) : hyperSum(Nn, K, n, k + 1n, n);
        out.push(complementSection(`${mode === 'ge' ? `${k - 1n} 本以下` : `${k + 1n} 本以上`}`, other, res.value));
      } else if (mode === 'eq' && k <= K && n - k <= Nn - K && k <= n) {
        const a = S.nCr(N.frac(K), N.frac(k));
        const b = S.nCr(N.frac(Nn - K), N.frac(n - k));
        const c = S.nCr(N.frac(Nn), N.frac(n));
        const v = N.div(N.mul(a, b), c);
        out.push(sec('式に数を入れる', line(`当たり ${K} 本から ${k} 本：${K}C${k} ＝ ${T(a)}`), line(`はずれ ${Nn - K} 本から ${n - k} 本：${Nn - K}C${n - k} ＝ ${T(b)}`), line(`全部から ${n} 本：${Nn}C${n} ＝ ${T(c)}`),
          line(`${T(a)} × ${T(b)} ÷ ${T(c)} ＝ ${pct(v)}`), ok('答えと同じ', same(v, res.value, 30))));
      }
      const [lo, hi] = hyperRange(Nn, K, n);
      if (hi - lo <= 2000n && Nn <= EXACT_LOT) {
        const all = hyperSum(Nn, K, n, lo, hi);
        out.push(sec('当たりが何本でも、全部足すと 1（100%）', line(`${lo}〜${hi} 本の合計 ＝ ${pct(all)}`), ok('100%', same(all, ONE))));
      }
      return out;
    },
  },

  // ---------------- 条件付き ----------------
  {
    key: 'test', cat: 'bayes', name: '検査の陽性・陰性', show: 'かかっていて陽性 ÷ 陽性 全部',
    ex: '例：1% の人がかかる病気、感度 99%・特異度 99% の検査で陽性',
    note: 'まれな病気ほど、陽性でも本当にかかっている確率は低くなります（まちがって陽性の人が多いため）',
    fields: [f('a', 'かかる人の割合', 'prob', '1%', 'かかる人の割合（有病率）：調べる人のうち、病気にかかっている人の割合'), f('s', '感度', 'prob', '99%', '感度：かかっている人が、陽性になる確率'), f('t', '特異度', 'prob', '99%', '特異度：かかっていない人が、陰性になる確率')],
    modes: [['pos', '陽性のとき'], ['neg', '陰性のとき']], mode: 'pos',
    solve({ a, s, t }, mode) {
      const sick = N.mul(a, s); // かかっていて陽性
      const false1 = N.mul(N.sub(ONE, a), N.sub(ONE, t)); // かかっていないのに陽性
      const posAll = N.add(sick, false1);
      const negOk = N.mul(N.sub(ONE, a), t); // かかっていなくて陰性
      const negAll = N.sub(ONE, posAll);
      if (mode === 'pos') {
        if (N.isZero(posAll)) throw new CalcError('陽性になる人がいません');
        return { value: N.div(sick, posAll), unit: 'prob', label: '本当にかかっている', lines: [`陽性になる人の割合：${pct(posAll)}`], formula: 'かかっていて陽性 ÷ (かかっていて陽性 ＋ かかっていないのに陽性)', parts: { a, s, t } };
      }
      if (N.isZero(negAll)) throw new CalcError('陰性になる人がいません');
      return { value: N.div(negOk, negAll), unit: 'prob', label: '本当にかかっていない', lines: [`陰性になる人の割合：${pct(negAll)}`, `陰性でも かかっている：${pct(N.div(N.mul(a, N.sub(ONE, s)), negAll))}`], formula: 'かかっていなくて陰性 ÷ 陰性 全部', parts: { a, s, t } };
    },
    check({ a, s, t }, mode, res) {
      return bayesCheck(a, s, N.sub(ONE, t), mode, res, ['かかっている', 'かかっていない', '陽性', '陰性']);
    },
  },
  {
    key: 'general', cat: 'bayes', name: 'ベイズの定理', show: 'P(A|B) ＝ P(B|A) P(A) ÷ P(B)',
    ex: '例：P(A) ＝ 30%、A のとき B は 80%、A でないとき B は 10% → B のとき A は？',
    note: 'P(B|A) は「A のとき B になる確率」',
    fields: [f('a', 'P(A)', 'prob', '30%', 'P(A)：A の確率'), f('b', 'P(B|A)', 'prob', '80%', 'P(B|A)：A のとき B になる確率'), f('c', 'P(B|Aでない)', 'prob', '10%', 'P(B|Aでない)：A でないとき B になる確率')],
    modes: [['pos', 'B のとき A'], ['neg', 'B でないとき A でない']], mode: 'pos',
    solve({ a, b, c }, mode) {
      const ab = N.mul(a, b);
      const pb = N.add(ab, N.mul(N.sub(ONE, a), c));
      if (mode === 'pos') {
        if (N.isZero(pb)) throw new CalcError('B になることがありません');
        return { value: N.div(ab, pb), unit: 'prob', label: 'P(A|B)', lines: [`P(B) ＝ ${pct(pb)}`], formula: 'P(A) P(B|A) ÷ (P(A) P(B|A) ＋ P(Aでない) P(B|Aでない))' };
      }
      const nb = N.sub(ONE, pb);
      if (N.isZero(nb)) throw new CalcError('B でないことがありません');
      return { value: N.div(N.mul(N.sub(ONE, a), N.sub(ONE, c)), nb), unit: 'prob', label: 'P(Aでない|Bでない)', lines: [`P(Bでない) ＝ ${pct(nb)}`], formula: 'P(Aでない) P(Bでない|Aでない) ÷ P(Bでない)' };
    },
    check({ a, b, c }, mode, res) {
      return bayesCheck(a, b, c, mode, res, ['A', 'A でない', 'B', 'B でない']);
    },
  },

  // ---------------- 偏差値・分布 ----------------
  {
    key: 'score', cat: 'norm', name: '点数 → 偏差値', show: '50 ＋ 10 × (点数 − 平均) ÷ 標準偏差',
    ex: '例：平均 60 点・標準偏差 10 点のテストで 75 点',
    note: '上位〇% は、点数がきれいな山の形（正規分布）に分かれているときの目安です',
    fields: [f('mu', '平均点', 'num', '60', '平均点'), f('sd', '標準偏差', 'num', '10', '標準偏差：点数のちらばりの大きさ'), f('x', '自分の点数', 'num', '75', '自分の点数')],
    solve({ mu, sd, x }) {
      if (N.sign(sd) <= 0) throw new CalcError('標準偏差は 0 より大きい数です');
      const z = N.div(N.sub(x, mu), sd);
      const T2 = N.add(I(50), N.mul(I(10), z));
      const up = upperTail(z);
      return { value: T2, unit: '', label: '偏差値', lines: tailLines(up, z), formula: `50 ＋ 10 × (${T(x)} − ${T(mu)}) ÷ ${T(sd)}`, z, up };
    },
    check({ mu, sd, x }, mode, res) {
      const back = N.add(mu, N.div(N.mul(sd, N.sub(res.value, I(50))), I(10)));
      return [
        sec('逆算：偏差値から点数にもどす', line(`平均 ＋ 標準偏差 × (偏差値 − 50) ÷ 10`), line(`${T(mu)} ＋ ${T(sd)} × (${T(res.value)} − 50) ÷ 10 ＝ ${T(back)}`), ok(`点数 ${T(x)}`, same(back, x))),
        simpsonSection(res.z, null, res.up),
      ];
    },
  },
  {
    key: 'dev', cat: 'norm', name: '偏差値 → 上位何%', show: '偏差値から上位の割合',
    ex: '例：偏差値 60 は 上位 約 15.9%',
    note: '点数がきれいな山の形（正規分布）に分かれているときの目安です',
    fields: [f('T', '偏差値', 'num', '60', '偏差値')],
    solve({ T: dv }) {
      const z = N.div(N.sub(dv, I(50)), I(10));
      const up = upperTail(z);
      return { value: up, unit: 'prob', label: '上位', lines: tailLines(up, z, true), formula: `z ＝ (${T(dv)} − 50) ÷ 10 ＝ ${T(z)} より上の割合`, z, up };
    },
    check(v, mode, res) {
      const low = N.sub(ONE, res.value);
      return [
        simpsonSection(res.z, null, res.up),
        sec('上位 ＋ 下位 ＝ 100%', line(`${pct(res.value)} ＋ ${pct(low)} ＝ ${pct(N.add(res.value, low))}`), ok('100%', same(N.add(res.value, low), ONE))),
      ];
    },
  },
  {
    key: 'top', cat: 'norm', name: '上位何% → 偏差値', show: '上位の割合から偏差値',
    ex: '例：上位 10% に入るには 偏差値 約 62.8',
    note: '点数がきれいな山の形（正規分布）に分かれているときの目安です',
    fields: [f('q', '上位 何%', 'prob', '10%', '上位の割合（10% など）'), f('mu', '平均点', 'num', '', '平均点：点数も出すときだけ（「なし」のままでもよい）', true), f('sd', '標準偏差', 'num', '', '標準偏差：点数も出すときだけ（「なし」のままでもよい）', true)],
    solve({ q, mu, sd }) {
      const z = upperTailInv(q);
      const value = N.add(I(50), N.mul(I(10), z));
      const lines = [zLine(z)];
      if (mu && sd) {
        if (N.sign(sd) <= 0) throw new CalcError('標準偏差は 0 より大きい数です');
        lines.unshift(`点数なら ${T(N.add(mu, N.mul(sd, z)), 8)} 点 以上`);
      }
      return { value, unit: '', label: '偏差値', lines, formula: '上の割合が ちょうどその % になる位置', z };
    },
    check({ q }, mode, res) {
      const up = upperTail(res.z);
      return [
        sec('逆算：その偏差値の上位の割合', line(`偏差値 ${T(res.value)}（z ＝ ${T(res.z, 10)}）より上 ＝ ${pct(up)}`), ok(`${pct(q)}`, same(up, q, 30))),
        simpsonSection(res.z, null, up),
      ];
    },
  },
  {
    key: 'range', cat: 'norm', name: 'a 点〜b 点の割合', show: 'a 点から b 点のあいだにいる割合',
    ex: '例：平均 60・標準偏差 10 で、50 点〜70 点は 約 68.3%',
    note: '点数がきれいな山の形（正規分布）に分かれているときの目安です',
    fields: [f('mu', '平均点', 'num', '60', '平均点'), f('sd', '標準偏差', 'num', '10', '標準偏差'), f('a', '下の点数 a', 'num', '50', 'a：下の点数'), f('b', '上の点数 b', 'num', '70', 'b：上の点数')],
    solve({ mu, sd, a, b }) {
      if (N.sign(sd) <= 0) throw new CalcError('標準偏差は 0 より大きい数です');
      if (N.cmp(a, b) > 0) throw new CalcError('a は b 以下にしてください');
      const za = N.div(N.sub(a, mu), sd);
      const zb = N.div(N.sub(b, mu), sd);
      const ua = upperTail(za);
      const ub = upperTail(zb);
      // 平均より下どうし・上どうしは、はしの小さい割合どうしで引く（1 に近い数どうしで引くと桁が消える）
      let value;
      if (N.sign(za) >= 0) value = N.sub(ua, ub, N.P + 10);
      else if (N.sign(zb) <= 0) value = N.sub(upperTail(N.neg(zb)), upperTail(N.neg(za)), N.P + 10);
      else value = N.sub(N.sub(ONE, upperTail(N.neg(za))), ub, N.P + 10);
      return { value, unit: 'prob', label: 'あいだ', lines: [`${T(a)} 点以上：${pct(ua)}`, `${T(b)} 点より上：${pct(ub)}`], formula: `(${T(a)} 点より上) − (${T(b)} 点より上)`, za, zb };
    },
    check(v, mode, res) {
      return [simpsonSection(res.za, res.zb, res.value)];
    },
  },
  {
    key: 'data', cat: 'norm', name: 'データの平均・標準偏差', show: '平均 ＝ 合計 ÷ 個数',
    ex: '例：65, 72, 80, 58, 90 の平均・標準偏差・偏差値',
    note: '標準偏差は「個数」で割っています（「個数 − 1」で割る値も下に）',
    fields: [f('list', 'データ', 'list', '65,72,80,58,90', 'データ：数を「、」のキーで区切って打ちます（− のキーでマイナス）')],
    solve({ list }) {
      const n = I(list.length);
      const sum = list.reduce((s, x) => N.add(s, x), ZERO);
      const mean = N.div(sum, n);
      const ss = list.reduce((s, x) => N.add(s, N.mul(N.sub(x, mean), N.sub(x, mean))), ZERO);
      const variance = N.div(ss, n);
      const sd = N.sqrt(variance);
      const sorted = [...list].sort((x, y) => N.cmp(x, y));
      const mid = list.length >> 1;
      const median = list.length % 2 ? sorted[mid] : N.div(N.add(sorted[mid - 1], sorted[mid]), I(2));
      const lines = [`個数 ${list.length}・合計 ${T(sum)}`, `中央値 ${T(median)}（いちばん小さい ${T(sorted[0])}、大きい ${T(sorted[sorted.length - 1])}）`, `分散 ${T(variance)}、標準偏差 ${T(sd)}`];
      if (list.length >= 2) lines.push(`「個数 − 1」で割ると：標準偏差 ${T(N.sqrt(N.div(ss, I(list.length - 1))))}`);
      if (!N.isZero(sd) && list.length <= 12) {
        lines.push(`偏差値：${list.map((x) => `${T(x)} → ${T(N.add(I(50), N.div(N.mul(I(10), N.sub(x, mean)), sd)), 4)}`).join('、')}`);
      }
      return { value: mean, unit: '', label: '平均', lines, formula: `(${list.length <= 6 ? list.map((x) => T(x)).join(' ＋ ') : `${T(list[0])} ＋ … ＋ ${T(list[list.length - 1])}`}) ÷ ${list.length}`, mean, variance, sd, sum, ss };
    },
    check({ list }, mode, res) {
      const dev = list.reduce((s, x) => N.add(s, N.sub(x, res.mean)), ZERO);
      const sq = N.div(list.reduce((s, x) => N.add(s, N.mul(x, x)), ZERO), I(list.length));
      const v2 = N.sub(sq, N.mul(res.mean, res.mean));
      const rows = list.slice(0, 6).map((x) => line(`${T(x)} − ${T(res.mean)} ＝ ${T(N.sub(x, res.mean))}`));
      if (list.length > 6) rows.push(line('…'));
      return [
        sec('平均との差を全部足すと 0', ...rows, line(`合計 ＝ ${T(dev)}`), ok('0', N.isZero(dev) || same(dev, ZERO))),
        sec('別の式で分散：2乗の平均 − 平均の2乗', line(`${T(sq)} − ${T(res.mean)}² ＝ ${T(v2)}`), ok(`分散 ${T(res.variance)}`, same(v2, res.variance))),
        sec('標準偏差を2乗すると分散', line(`${T(res.sd)}² ＝ ${T(N.mul(res.sd, res.sd))}`), ok('分散と同じ', same(N.mul(res.sd, res.sd), res.variance, 40))),
      ];
    },
  },
];

const BY_KEY = new Map(CALCS.map((c) => [c.key, c]));
export const calcByKey = (key) => BY_KEY.get(key) ?? null;
export const calcsOf = (cat) => CALCS.filter((c) => c.cat === cat);

// 反対の場合を 1 から引く（答えが小さすぎる概数のときは、桁が足りなくて引けない）
function complementSection(label, other, value) {
  const title = '逆算：反対の場合を 1 から引く';
  if (!value.q && !N.isZero(value) && N.approxLog10(value) < -50) {
    return sec(title, line(`${label} ＝ ${pct(other)}`), hint('答えがとても小さいので、1 から引く計算では桁が足りず、たしかめられません'));
  }
  const back = N.sub(ONE, other);
  return sec(title, line(`${label} ＝ ${pct(other)}`), line(`1 − ${pct(other)} ＝ ${pct(back)}`), ok('答えと同じ', same(back, value, 30)));
}

// 分数でも書けるなら「1/36 ＝ 2.77…%」
function fracOr(x) {
  const fr = fracText(x);
  return fr ? `${fr}（${pct(x)}）` : pct(x);
}

// z の行：「z ＝ 1.5（平均より 標準偏差 1.5 こ分 上）」
function zLine(z) {
  if (N.isZero(z)) return 'z ＝ 0（ちょうど平均）';
  return `z ＝ ${T(z, 10)}（平均より 標準偏差 ${T(N.absNum(z), 6)} こ分 ${N.sign(z) > 0 ? '上' : '下'}）`;
}

// 上位・下位の行
function tailLines(up, z, isTop = false) {
  const lines = [];
  if (!isTop) lines.push(`上位 ${pct(up)}（下位 ${pct(N.sub(ONE, up))}）`);
  else lines.push(`下位 ${pct(N.sub(ONE, up))}`);
  const rank = N.mul(up, I(1000));
  if (N.cmp(rank, I(1)) >= 0) lines.push(`1000人なら 上から 約 ${T(N.frac(S.floorInt(N.add(rank, HALF))))} 番`);
  else lines.push(oneIn(up) ? `${oneIn(up).replace('回に1回', '人に1人')}` : '');
  lines.push(zLine(z));
  return lines.filter(Boolean);
}

// 山の面積を細い長方形で（シンプソンの公式）
function simpsonSection(za, zb, value) {
  const a = N.toNumber(za);
  const b = zb === null ? null : N.toNumber(zb);
  if (Math.abs(a) > 8 || (b !== null && Math.abs(b) > 8)) {
    return sec('別の計算：山の面積を細い長方形で', hint('平均から はなれすぎていて、長方形では計算しきれないので省略します'));
  }
  let area;
  let what;
  if (b === null) {
    // 右はしは z ＋ 12 まで（その先の面積は小さすぎて見えない）
    area = a >= 0 ? areaBySimpson(a, a + 12) : 0.5 + areaBySimpson(a, 0);
    what = `z ＝ ${T(za, 8)} より右の面積`;
  } else {
    area = areaBySimpson(a, b);
    what = `z ＝ ${T(za, 8)} から ${T(zb, 8)} までの面積`;
  }
  const v = N.toNumber(value);
  const good = v === 0 ? area < 1e-300 : Math.abs(area - v) <= 1e-9 * Math.abs(v);
  return sec('別の計算：山（正規分布）の面積を細かく区切って足す', line(`${what} ≒ ${(area * 100).toPrecision(10)}%`), ok(`答え ${pct(value)} と 上から 9 桁くらい同じ`, good),
    hint('正規分布の山 φ(z) ＝ e^(−z²/2) ÷ √(2π) の面積が、その範囲にいる人の割合です。山を 2万の細い帯に区切って面積を足しました（シンプソンの公式）'));
}

// ベイズ：1万人なら（人数の表）
function bayesCheck(a, hit, miss, mode, res, [A, notA, B, notB]) {
  // hit ＝ A のとき B、miss ＝ A でないとき B
  let people = 10000n;
  const counts = (np) => {
    const P = N.frac(np);
    const aB = N.mul(N.mul(P, a), hit);
    const aN = N.mul(N.mul(P, a), N.sub(ONE, hit));
    const nB = N.mul(N.mul(P, N.sub(ONE, a)), miss);
    const nN = N.mul(N.mul(P, N.sub(ONE, a)), N.sub(ONE, miss));
    return [aB, aN, nB, nN];
  };
  let c = counts(people);
  for (let i = 0; i < 4 && !c.every((x) => N.isInteger(x)); i++) {
    people *= 10n;
    c = counts(people);
  }
  if (!c.every((x) => N.isInteger(x))) {
    people = 10000n;
    c = counts(people);
  }
  const [aB, aN, nB, nN] = c;
  const ppl = (x) => `${T(x, 8)} 人`;
  const rows = [
    line(`${people.toLocaleString()} 人のうち ${A}：${ppl(N.add(aB, aN))}、${notA}：${ppl(N.add(nB, nN))}`),
    line(`${A} → ${B} ${ppl(aB)}・${notB} ${ppl(aN)}`),
    line(`${notA} → ${B} ${ppl(nB)}・${notB} ${ppl(nN)}`),
  ];
  const [num, den, label] = mode === 'pos'
    ? [aB, N.add(aB, nB), `${B}（${ppl(N.add(aB, nB))}）のうち ${A}：${ppl(aB)}`]
    : [nN, N.add(aN, nN), `${notB}（${ppl(N.add(aN, nN))}）のうち ${notA}：${ppl(nN)}`];
  const v = N.isZero(den) ? ZERO : N.div(num, den);
  rows.push(line(label), line(`${T(num, 8)} ÷ ${T(den, 8)} ＝ ${pct(v)}`), ok('答えと同じ', same(v, res.value)));
  const out = [sec(`人数で考える（${people.toLocaleString()} 人なら）`, ...rows, hint('割合のままより、人数にするとわかりやすくなります'))];
  // ベイズの式：P(A|B) P(B) ＝ P(B|A) P(A)
  if (mode === 'pos') {
    const pB = N.add(N.mul(a, hit), N.mul(N.sub(ONE, a), miss));
    const left = N.mul(res.value, pB);
    const right = N.mul(hit, a);
    out.push(sec('逆算：ベイズの式の左と右', line(`P(${A}|${B}) × P(${B}) ＝ ${pct(res.value)} × ${pct(pB)} ＝ ${pct(left)}`), line(`P(${B}|${A}) × P(${A}) ＝ ${pct(hit)} × ${pct(a)} ＝ ${pct(right)}`), ok('左と右が同じ', same(left, right))));
  }
  return out;
}

// ---------------------------------------------------------
// 画面から使う入り口
// ---------------------------------------------------------
// texts：{ 欄の key: 文字 }。返す値：{ c, v, missing } か { c, v, r } か { c, error }
export function solve(key, texts, mode) {
  const c = calcByKey(key);
  try {
    const v = {};
    const missing = [];
    for (const fl of c.fields) {
      const x = parseText(fl.type, texts[fl.key] ?? '');
      if (x === null) {
        if (!fl.opt) missing.push(fl.name);
      } else v[fl.key] = x;
    }
    if (missing.length) return { c, v, missing };
    return { c, v, mode: modeOf(c, mode), r: c.solve(v, modeOf(c, mode)) };
  } catch (error) {
    if (!(error instanceof CalcError)) throw error;
    return { c, error: error.message };
  }
}

// 「ちょうど・以上・以下」などのえらび方（その計算にないものなら、はじめの形）
export function modeOf(c, mode) {
  return c.modes?.some(([k]) => k === mode) ? mode : c.mode;
}

// 検算。返す値：{ ok, sections, r }（答えが出ないときは null）
export function check(key, texts, mode) {
  const s = solve(key, texts, mode);
  if (!s.r) return null;
  let sections;
  try {
    sections = s.c.check(s.v, s.mode, s.r);
  } catch (error) {
    if (!(error instanceof CalcError)) throw error;
    sections = [sec('たしかめ', hint(`数が大きすぎて、たしかめられませんでした（${error.message}）`))];
  }
  const ok = sections.every((x) => x.rows.every((row) => row[0] !== 'ok' || row[2]));
  return { ok, sections, r: s.r };
}
