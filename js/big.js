// =========================================================
// 巨大数（ステップ15。画面なし・テストあり）
//
//   テトレーション a↑↑n ＝ a^a^…^a（a を n 段つむ。上から計算する：3^3^3 ＝ 3^27）
//   スーパー対数 slog_a(x) ＝ a を何段つむと x になるか（テトレーションの逆）
//   矢印表記 a↑↑↑b など（クヌースの矢印。↑ が1つふえるごとに、くり返しが1段上がる）
//   アッカーマン関数 A(m, n) ＝ 2↑…↑(n+3) − 3（↑ が m−2 個）
//
// ふつうの数（num.js）は 10^(10^15) くらいまで。もっと大きい数は、次の形で持つ（巨大数は正の数だけ）：
//   { t: 'num', v }       … ふつうの数
//   { t: 'tower', h, x }  … 10^10^…^10^x（「10^」が h 回。h は 1 以上の整数、x はふつうの数で TOP_MIN より大きい）
//   { t: 'nest', k, s }   … 10↑↑10↑↑…10↑↑s（「10↑↑」が k 回。s はふつうの数）
//
// 大事なしくみ：塔が高くなると、上の数はもう変わらない。
//   10^10^x に 0.3 をかけても、x の上の 80 桁は変わらない（10^10^x × 0.3 ＝ 10^(10^x − 0.52)）。
//   だから a^(高い塔) は「10^ を1段ふやす」だけ。a↑↑(大きい n) は、段の数を数えるだけでよい。
//
// 整数でない高さ（2↑↑2.5 など）とスーパー対数は「線形近似」できめる：
//   −1 < h ≤ 0 のとき a↑↑h ＝ 1 + h（ほかの決め方もある）。整数の高さなら、ふつうのテトレーションと同じ。
// =========================================================
import * as N from './num.js';
import * as S from './sci.js';

const { CalcError, ZERO, ONE } = N;
const I = (n) => N.frac(BigInt(n));
const TEN = I(10);
export const MAX_COUNT = Number.MAX_SAFE_INTEGER; // 段・重ねる回数は、ここ（約 9000兆）まで数える
const MAX_COUNT_N = I(MAX_COUNT);
const TOP_MIN = I(9n * 10n ** 14n);  // x がこれ以下なら、10^x はふつうの数で出せる
const TEN_10 = I(10n ** 10n);
const TIME_LIMIT = 1500;              // ms。これより長くかかる計算はやめる
export const TOO_BIG = '大きすぎて、この電卓では表せません';
const SLOW = 'この底では、塔がなかなか大きくならない（または小さくならない）ので、計算しきれません';

export const num = (v) => ({ t: 'num', v });
export const isNum = (b) => b.t === 'num';

// ---------------------------------------------------------
// 小道具
// ---------------------------------------------------------
// x 以上でいちばん小さい整数（BigInt）
const ceilInt = (x) => -S.floorInt(N.neg(x));

// 正確な 0 以上の整数なら BigInt、ちがえば null（概数でも整数にとても近ければ、その整数）
function wholeOf(x) {
  if (x.q) return x.d === 1n && x.n >= 0n ? x.n : null;
  if (N.approxLog10(N.absNum(x)) > 60) return null;
  const k = S.floorInt(N.add(x, N.frac(1n, 2n)));
  return k >= 0n && N.cmp(x, N.frac(k)) === 0 ? k : null;
}

// a と b が、上から digits 桁くらいまで同じか
export function sameDigits(a, b, digits) {
  const d = N.sub(a, b, N.P + 20);
  if (N.isZero(d)) return true;
  if (N.isZero(b)) return N.approxLog10(N.absNum(a)) < -digits;
  return N.approxLog10(N.absNum(d)) - N.approxLog10(N.absNum(b)) <= -digits;
}

// slog₁₀ x（ふつうの正の数）：log₁₀ を何回とると 1 以下になるか ＋（残り − 1）
function slog10Num(x) {
  let s = 0;
  while (N.cmp(x, ONE) > 0) {
    x = S.log10(x);
    s++;
  }
  return N.add(I(s), N.sub(x, ONE));
}

// 10↑↑s（s は 3 以下のふつうの数。線形近似）→ ふつうの数
function tet10Small(s) {
  if (N.sign(s) <= 0) return N.add(ONE, s);
  const m = ceilInt(s);
  let v = N.add(ONE, N.sub(s, N.frac(m)));
  for (let i = 0n; i < m; i++) v = N.pow(TEN, v);
  return v;
}

function checkTime(t0) {
  if (Date.now() - t0 > TIME_LIMIT) throw new CalcError(SLOW);
}

// ---------------------------------------------------------
// 形をそろえる（小さければ下の形に）
// ---------------------------------------------------------
// 10^10^…^x（h 段）
function tower(h, x) {
  while (h > 0 && N.cmp(x, TOP_MIN) <= 0) {
    x = N.pow(TEN, x);
    h--;
  }
  return h === 0 ? num(x) : { t: 'tower', h, x };
}

// 10↑↑10↑↑…10↑↑s（k 回）
export function nest(k, s) {
  while (k > 1 && N.cmp(s, I(3)) <= 0) {
    // 中の 10↑↑s が、高さとして数えられる大きさなら1回へらす
    const v = tet10Small(s);
    if (N.cmp(v, MAX_COUNT_N) > 0) break;
    s = v;
    k--;
  }
  if (k > MAX_COUNT) throw new CalcError(TOO_BIG);
  if (k === 1 && N.cmp(s, MAX_COUNT_N) <= 0) return tetrate(TEN, num(s));
  return { t: 'nest', k, s };
}

// ---------------------------------------------------------
// 10^x・log₁₀ x・かけ算（巨大数と、ふつうの大きさの正の数 c）
// ---------------------------------------------------------
function exp10(v) {
  if (v.t === 'num') return N.cmp(v.v, TOP_MIN) <= 0 ? num(N.pow(TEN, v.v)) : { t: 'tower', h: 1, x: v.v };
  if (v.t === 'tower') {
    if (v.h < MAX_COUNT) return { t: 'tower', h: v.h + 1, x: v.x };
    return nest(1, N.add(I(v.h + 1), slog10Num(v.x)));
  }
  return v.k === 1 ? nest(1, N.add(v.s, ONE)) : v;
}

export function log10Big(v) {
  if (v.t === 'num') return num(S.log10(v.v));
  if (v.t === 'tower') return v.h === 1 ? num(v.x) : { t: 'tower', h: v.h - 1, x: v.x };
  return v.k === 1 ? nest(1, N.sub(v.s, ONE)) : v;
}

function mulSmall(v, c) {
  if (v.t === 'num') {
    if (N.isZero(v.v)) return v;
    if (N.approxLog10(v.v) + N.approxLog10(c) < 1e15 - 1e3) return num(N.mul(v.v, c));
    return tower(1, N.add(S.log10(v.v), S.log10(c)));
  }
  if (v.t === 'tower' && v.h === 1) return tower(1, N.add(v.x, S.log10(c)));
  return v; // 2段以上の塔・nest：かけても上の桁は変わらない
}

// a^v（a はふつうの正の数）
export function powBig(a, v) {
  if (N.sign(a) <= 0) throw new CalcError('巨大数の累乗の底は、0 より大きい数だけです');
  if (N.cmp(a, ONE) === 0) return num(ONE);
  if (v.t === 'num') {
    const lg = N.approxLog10(a) * N.toNumber(v.v);
    if (Number.isFinite(lg) && Math.abs(lg) < 1e14) return num(N.pow(a, v.v));
  }
  if (N.cmp(a, ONE) < 0) throw new CalcError('数が小さすぎて扱えません');
  return exp10(mulSmall(v, S.log10(a)));
}

// log_a v（a > 1）
export function logBig(a, v) {
  if (v.t === 'num') return num(S.logb(a, v.v)); // log₂ 65536 ＝ 16 のように、ちょうどの値も
  return mulSmall(log10Big(v), N.div(ONE, S.log10(a), N.P + 10));
}

// ---------------------------------------------------------
// テトレーション a↑↑n
//   返す値：{ value, steps: 上から1段ずつの数（はじめの 40 個まで）, start: いちばん上の数（1 か 1＋小数）,
//            count: つむ回数, jump: { at, rest }（ここからは 10^ を数えるだけ）,
//            conv: { at, kind: 'fixed' | 'cycle' }（同じ数・2つの数のくり返しになった） }
// ---------------------------------------------------------
const STEP_ROWS = 40;

// start から a^ を count 回（count は 0 以上の整数のふつうの数）
function climb(a, start, count) {
  const steps = [];
  const info = { steps, start, count, jump: null, conv: null };
  let v = num(start);
  let prev = null;
  let prev2 = null;
  const t0 = Date.now();
  for (let j = 0; ; j++) {
    if (steps.length < STEP_ROWS) steps.push(v);
    if (N.cmp(I(j), count) >= 0) return { ...info, value: v };
    if ((v.t === 'tower' && v.h >= 2) || v.t === 'nest') {
      // ここからは1回ごとに 10^ が1段ふえるだけ
      const rest = N.sub(count, I(j));
      info.jump = { at: j, rest };
      return { ...info, value: addLayers(v, rest) };
    }
    if (v.t === 'num' && prev?.t === 'num' && N.cmp(v.v, prev.v) === 0) {
      info.conv = { at: j, kind: 'fixed' };
      return { ...info, value: v };
    }
    if (v.t === 'num' && prev2?.t === 'num' && N.cmp(v.v, prev2.v) === 0) {
      // 2つの数を行ったり来たり：残りの回数が偶数か奇数か
      const rest = N.sub(count, I(j));
      const r = wholeOf(rest);
      if (r === null) throw new CalcError('高さが大きすぎて、偶数か奇数かがわかりません（この底では、それで答えが変わります）');
      info.conv = { at: j, kind: 'cycle' };
      return { ...info, value: r % 2n === 0n ? v : prev };
    }
    checkTime(t0);
    prev2 = prev;
    prev = v;
    v = powBig(a, v);
  }
}

// 10^ を rest 段ふやす
function addLayers(v, rest) {
  if (v.t === 'tower') {
    const total = N.add(I(v.h), rest);
    const h = wholeOf(total);
    if (h !== null && h <= BigInt(MAX_COUNT)) return { t: 'tower', h: Number(h), x: v.x };
    return nest(1, N.add(total, slog10Num(v.x)));
  }
  return v.k === 1 ? nest(1, N.add(v.s, rest)) : v;
}

// 10↑↑v（v は巨大数：a のちがいは見えないほど小さい）
function up10(v) {
  if (v.t === 'tower') return nest(2, N.add(I(v.h), slog10Num(v.x)));
  return nest(v.k + 1, v.s);
}

export function tetrateInfo(a, n) {
  if (N.sign(a) <= 0) throw new CalcError('テトレーションの底は、0 より大きい数だけです');
  if (n.t !== 'num') {
    if (N.cmp(a, N.exp(N.div(ONE, S.E))) <= 0) throw new CalcError('この底では、塔は大きくならずに1つの数に近づきます。高さは ふつうの数で打ってください');
    return { value: up10(n), steps: [], start: ONE, count: null, jump: null, conv: null, huge: true };
  }
  const nv = n.v;
  if (N.cmp(nv, I(-1)) < 0) throw new CalcError('テトレーションの高さは −1 以上だけです');
  if (N.cmp(nv, I(-1)) === 0) return { value: num(ZERO), steps: [], start: ZERO, count: ZERO, jump: null, conv: null };
  if (!nv.q && N.approxLog10(nv) > 60) return climb(a, ONE, nv); // とても高い：小数の部分はもうわからない
  // n ＝ count ＋ f（count は整数、−1 < f ≤ 0）。いちばん上は 1 ＋ f
  let c = ceilInt(nv);
  const near = wholeOf(nv);
  if (near !== null) c = near;
  const count = N.frac(c);
  const start = near !== null ? ONE : N.add(ONE, N.sub(nv, count));
  return climb(a, start, count);
}

export const tetrate = (a, n) => tetrateInfo(a, n).value;

// ---------------------------------------------------------
// スーパー対数 slog_a(x)：log_a を何回とると 1 以下になるか ＋（残り − 1）
//   返す値：{ value: 巨大数（ふつうは num）, steps: 途中の数（はじめの 40 個）, skip: [段をまとめてへらした所] }
// ---------------------------------------------------------
export function slogInfo(a, x) {
  if (N.cmp(a, ONE) <= 0) throw new CalcError('スーパー対数の底は、1 より大きい数だけです');
  if (x.t === 'num' && N.sign(x.v) <= 0) throw new CalcError('スーパー対数は、0 より大きい数だけです');
  if (x.t === 'nest') {
    if (x.k >= 2) return { value: nest(x.k - 1, x.s), steps: [x], skip: [], huge: true };
    return { value: num(slogHuge(a, x.s)), steps: [x], skip: [], huge: true };
  }
  const steps = [];
  const skip = [];
  let count = 0n;
  let v = x;
  let prev = null;
  const t0 = Date.now();
  for (;;) {
    if (v.t === 'tower' && v.h >= 3) {
      // 3段以上の塔は、log を1回とるごとに 10^ が1段へるだけ
      skip.push({ at: steps.length, n: v.h - 2 });
      count += BigInt(v.h - 2);
      v = { t: 'tower', h: 2, x: v.x };
    }
    if (steps.length < STEP_ROWS) steps.push(v);
    if (v.t === 'num' && N.cmp(v.v, ONE) <= 0) {
      // ちょうど 1（概数でも、上から 65 桁くらいまで 1）なら、答えはちょうどの整数
      const rest = N.cmp(v.v, ONE) === 0 ? ZERO : N.sub(v.v, ONE);
      return { value: num(N.add(N.frac(count), rest)), steps, skip, count };
    }
    if (v.t === 'num' && prev?.t === 'num' && N.cmp(v.v, prev.v) === 0) {
      throw new CalcError('この底では、どんなに高くつんでも、この数にとどきません');
    }
    checkTime(t0);
    prev = v;
    v = logBig(a, v);
    count++;
  }
}

export const slog = (a, x) => slogInfo(a, x).value;

// slog_a(10↑↑S)（S がとても大きいとき）
//   S ＝ H ＋ r（H は整数、5 < r ≤ 6）なら、10↑↑S は 10↑↑r の上に 10^ を H 段つんだ塔なので
//   slog_a(10↑↑S) ＝ H ＋ slog_a(10↑↑r)
function slogHuge(a, s) {
  if (!s.q && N.approxLog10(s) > 60) {
    const r = I(5);
    return N.add(s, N.sub(slog(a, tetrate(TEN, num(r))).v, r));
  }
  const H = N.frac(ceilInt(s) - 6n);
  const r = N.sub(s, H);
  return N.add(H, slog(a, tetrate(TEN, num(r))).v);
}

// slog₁₀（「10↑↑ いくつ」くらいの大きさか）。巨大数で返す
export function slog10(v) {
  if (v.t === 'num') return num(slog10Num(v.v));
  if (v.t === 'tower') return num(N.add(I(v.h), slog10Num(v.x)));
  return v.k === 1 ? num(v.s) : nest(v.k - 1, v.s);
}

// ---------------------------------------------------------
// 矢印表記 a↑…↑b（↑ が k 個）
//   返す値：{ value, steps: [a, a↑^k 2, a↑^k 3, …]（はじめの 40 個）, jump: { at, rest }（ここからは 10↑↑ を数えるだけ） }
// ---------------------------------------------------------
export const MAX_ARROWS = 100;

export function arrowInfo(a, k, b) {
  if (N.sign(a) <= 0) throw new CalcError('矢印表記の a は、0 より大きい数だけです');
  if (!Number.isInteger(k) || k < 1 || k > MAX_ARROWS) throw new CalcError(`↑ の数は 1 から ${MAX_ARROWS} までの整数です`);
  if (k === 1) return { value: powBig(a, b), steps: [], jump: null };
  if (k === 2) {
    const t = tetrateInfo(a, b);
    return { value: t.value, steps: [], jump: null, tet: t };
  }
  if (b.t !== 'num') throw new CalcError(TOO_BIG);
  const n = wholeOf(b.v);
  if (n === null) throw new CalcError('↑ が3個以上のとき、b は 0 以上の整数だけです');
  if (n === 0n) return { value: num(ONE), steps: [], jump: null };
  if (N.cmp(a, ONE) === 0) return { value: num(ONE), steps: [num(ONE)], jump: null };
  if (N.cmp(a, ONE) < 0) throw new CalcError('↑ が3個以上のとき、a は 1 以上の数だけです');
  const steps = [num(a)];
  let v = num(a);
  const t0 = Date.now();
  for (let done = 1n; done < n; done++) {
    if (k === 3 && v.t === 'nest') {
      // ここからは1回ごとに「10↑↑」が1つふえるだけ
      const kk = BigInt(v.k) + (n - done);
      if (kk > BigInt(MAX_COUNT)) throw new CalcError(TOO_BIG);
      return { value: { t: 'nest', k: Number(kk), s: v.s }, steps, jump: { at: Number(done), rest: n - done } };
    }
    const next = arrowInfo(a, k - 1, v).value;
    if (next.t === 'num' && v.t === 'num' && N.cmp(next.v, v.v) === 0) {
      return { value: next, steps, jump: null, conv: true }; // 同じ数のくり返し
    }
    v = next;
    if (steps.length < STEP_ROWS) steps.push(v);
    checkTime(t0);
  }
  return { value: v, steps, jump: null };
}

export const arrow = (a, k, b) => arrowInfo(a, k, b).value;

// 矢印の逆（検算用）：a↑…↑b ＝ v になる b（↑ が k 個）
//   k ＝ 1 は log_a、k ＝ 2 は slog_a。
//   k ≥ 3 は「↑ が1つ少ない逆を何回とると a になるか」＋ 1（a↑↑↑3 → a↑↑↑2 → a で 2回 → b ＝ 3）
//   返す値：{ value: 巨大数, rows: [{ v, times }]（途中の数。times は まとめてとった回数）, last: さいごの数（a のはず） }
export function hyperLogInfo(a, k, v) {
  if (k === 1) return { value: logBig(a, v), rows: [], last: null };
  if (k === 2) return { value: slog(a, v), rows: [], last: null };
  const rows = [{ v, times: 0n }];
  let count = 1n;
  const above = (x) => x.t !== 'num' || (N.cmp(x.v, a) > 0 && !sameDigits(x.v, a, 30));
  const t0 = Date.now();
  while (above(v)) {
    let times = 1n;
    if (k === 3 && v.t === 'nest' && v.k >= 2) {
      // slog は「10↑↑」を1つへらすだけなので、まとめて
      times = BigInt(v.k - 1);
      v = nest(1, v.s);
    } else {
      v = hyperLogInfo(a, k - 1, v).value;
    }
    count += times;
    if (rows.length < STEP_ROWS) rows.push({ v, times });
    checkTime(t0);
  }
  return { value: num(N.frac(count)), rows, last: v };
}

// ---------------------------------------------------------
// アッカーマン関数 A(m, n)
//   A(0, n) ＝ n + 1、A(m, 0) ＝ A(m−1, 1)、A(m, n) ＝ A(m−1, A(m, n−1))
//   答えの形：A(m, n) ＝ 2↑^(m−2) (n+3) − 3（m ＝ 2 は 2(n+3) − 3、m ＝ 3 は 2^(n+3) − 3）
//   返す値：{ value: A（巨大数で −3 が見えないときは core と同じ）, core: 2↑…↑(n+3), minus: −3 をしたか }
// ---------------------------------------------------------
export const MAX_ACK_M = 100;

export function ackermann(mx, nx) {
  const m = mx.t === 'num' ? wholeOf(mx.v) : null;
  const n = nx.t === 'num' ? wholeOf(nx.v) : null;
  if (m === null || n === null) throw new CalcError('アッカーマン関数の m と n は、0 以上の整数だけです');
  if (m > BigInt(MAX_ACK_M)) throw new CalcError(`m は ${MAX_ACK_M} までです`);
  const big = (x) => num(N.frac(x));
  if (m === 0n) return { value: big(n + 1n), core: null, minus: false };
  if (m === 1n) return { value: big(n + 2n), core: null, minus: false };
  if (m === 2n) return { value: big(2n * n + 3n), core: null, minus: false };
  const core = m === 3n ? powBig(I(2), big(n + 3n)) : arrow(I(2), Number(m) - 2, big(n + 3n));
  if (core.t === 'num' && core.v.q) return { value: num(N.sub(core.v, I(3))), core, minus: true };
  return { value: core, core, minus: false };
}

// 定義どおりに計算する（呼び出しの回数も数える）。limit 回をこえたら null
export function ackermannByDefinition(m, n, limit = 3000000) {
  const stack = [m];
  let calls = 0;
  while (stack.length) {
    if (++calls > limit) return null;
    const mm = stack.pop();
    if (mm === 0) n += 1;
    else if (n === 0) {
      stack.push(mm - 1);
      n = 1;
    } else {
      stack.push(mm - 1, mm);
      n -= 1;
    }
  }
  return { value: n, calls };
}

// ---------------------------------------------------------
// 「10^2^3」「10↑↑5」のような打ち方 → 巨大数（右から計算する）
//   返す値：巨大数。打ちかけ（「10^」で終わる）なら null
// ---------------------------------------------------------
export function parseChain(text) {
  if (!text) return null;
  const parts = text.split(/(\^|↑↑)/);
  if (parts.some((p, i) => i % 2 === 0 && (p === '' || p === '.'))) return null;
  const nums = parts.filter((_, i) => i % 2 === 0).map((p) => N.parseDecimal(p.endsWith('.') ? p.slice(0, -1) : p));
  let v = num(nums[nums.length - 1]);
  for (let i = nums.length - 2; i >= 0; i--) {
    v = parts[2 * i + 1] === '^' ? powBig(nums[i], v) : tetrate(nums[i], v);
  }
  return v;
}

// ---------------------------------------------------------
// くらべる（検算用）：同じ形で、上から digits 桁くらいまで同じか
// ---------------------------------------------------------
export function closeBig(a, b, digits = 40) {
  if (a.t !== b.t) return false;
  if (a.t === 'num') return sameDigits(a.v, b.v, digits);
  if (a.t === 'tower') return a.h === b.h && sameDigits(a.x, b.x, digits);
  return a.k === b.k && sameDigits(a.s, b.s, digits);
}

// ---------------------------------------------------------
// 書き方
// ---------------------------------------------------------
// 塔 → { tens: 「10^」の数, top: いちばん上の数（10^10 以下にする） }
export function towerParts(v) {
  let top = v.x;
  let tens = v.h;
  while (N.cmp(top, TEN_10) >= 0) {
    top = S.log10(top);
    tens++;
  }
  return { tens, top };
}

// 有名な巨大数（value が null のものは、この電卓では表せない）
export function famous() {
  const P = (a, b) => powBig(a, b);
  return [
    { name: '観測できる宇宙の原子の数', def: 'だいたい 10^80', value: num(N.pow(TEN, I(80))), note: 'くらべるための目安（くわしい数はわかっていません）' },
    { name: 'グーゴル', def: '10^100', value: num(N.pow(TEN, I(100))), note: '1 のあとに 0 が 100 個' },
    { name: '2↑↑5', def: '2^2^2^2^2 ＝ 2^65536', value: tetrate(I(2), num(I(5))), note: '19,729 桁。正確に出せます' },
    { name: '3↑↑4', def: '3^3^3^3 ＝ 3^7625597484987', value: tetrate(I(3), num(I(4))), note: '3兆6千億桁くらい' },
    { name: 'グーゴルプレックス', def: '10^グーゴル ＝ 10^10^100', value: P(TEN, num(N.pow(TEN, I(100)))), note: '0 を書くだけでも、宇宙に入りきらない' },
    { name: 'スキューズ数', def: 'e^e^e^79', value: P(S.E, P(S.E, P(S.E, num(I(79))))), note: '素数の数え方の研究で出てきた数' },
    { name: 'グーゴルプレキシアン', def: '10^グーゴルプレックス ＝ 10^10^10^100', value: P(TEN, P(TEN, num(N.pow(TEN, I(100))))), note: '' },
    { name: 'トリトリ（3↑↑↑3）', def: '3↑↑(3↑↑3) ＝ 3 を 7,625,597,484,987 段つんだ塔', value: arrow(I(3), 3, num(I(3))), note: '' },
    { name: 'グラハム数', def: 'g₁ ＝ 3↑↑↑↑3、g₂ ＝ 3↑…↑3（↑ が g₁ 個）… と 64 回くり返した g₆₄', value: null, note: '↑ が4個の 3↑↑↑↑3（g₁）でさえ、この電卓では表せません' },
  ];
}
