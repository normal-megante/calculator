// =========================================================
// 微分・積分・Σ・lim の「仕事」：画面の欄（部品の並び）から計算して、答えを返す
//
//   runJob({ op: 'solve' | 'check', kind, f, a, lo, hi, at, side, angle })
//     kind：'diff' 微分 / 'int' 積分 / 'sum' Σ / 'lim' lim
//     f, a, lo, hi, at：欄の部品の並び（f は x の式、Σ は k の式）。∞ は '∞' の部品
//   返す値：{ ok: true, … } か { ok: false, error, errorKind }
//
// 時間がかかることがあるので、ふつうは calculus-worker.js（別の働き手）の中で動かす。
// 返す値は数（num.js の数・BigInt）と、ふつうの値だけ（そのまま画面へ送れる）。
// =========================================================
import * as N from './num.js';
import { compile, evaluate, isVar, usesVar } from './calc.js';
import * as C from './calculus.js';

export const VAR_OF = { diff: 'x', int: 'x', sum: 'k', lim: 'x' };

// ∞ の欄：['∞'] → ＋∞、['−', '∞'] → −∞（ほかの所に ∞ があればエラー）
function infOf(items) {
  const body = items[0] === '+' ? items.slice(1) : items;
  if (!body.includes('∞')) return null;
  if (body.length === 1) return 1;
  if (body.length === 2 && body[0] === '−' && body[1] === '∞') return -1;
  throw new N.CalcError('∞ は「∞」か「−∞」だけで使えます', 'syntax');
}

// 下端・上端・近づける先などの欄 → 数、または { inf: ±1 }
//   integer：整数だけ（Σ の k）→ BigInt で返す
export function parseBound(items, { name, allowInf = false, allowNegInf = true, integer = false, angle = 'rad' }) {
  if (!items.length) throw new N.CalcError(`${name}を打ってください`, 'empty');
  const inf = infOf(items);
  if (inf) {
    if (!allowInf || (inf < 0 && !allowNegInf)) throw new N.CalcError(`${name}に ${inf < 0 ? '−∞' : '∞'} は使えません`);
    return integer ? (inf > 0 ? Infinity : -Infinity) : { inf };
  }
  const v = items.find(isVar);
  if (v) throw new N.CalcError(`${name}に ${v} は使えません（数を打ってください）`, 'syntax');
  const { value } = evaluate(items, { angle });
  if (!integer) return value;
  if (!value.q || value.d !== 1n) throw new N.CalcError(`${name}は整数にしてください（k は 1, 2, 3 … のように1ずつ増えます）`);
  return value.n;
}

// f の欄 → 計算の木
function parseF(kind, items) {
  if (!items.length) throw new N.CalcError('f の式を打ってください', 'empty');
  if (items.includes('∞')) throw new N.CalcError('式の中には ∞ は使えません（lim の「x →」で使えます）', 'syntax');
  const v = VAR_OF[kind];
  const other = items.find((t) => isVar(t) && t !== v);
  if (other) throw new N.CalcError(`この式は ${v} で書きます（${other} は使えません）`, 'syntax');
  return compile(items);
}

// 欄をまとめて読む
function readInputs(req) {
  const { kind, angle } = req;
  const tree = parseF(kind, req.f);
  const hasVar = usesVar(req.f);
  if (kind === 'diff') {
    return { tree, hasVar, a: parseBound(req.a, { name: 'x の値', angle }) };
  }
  if (kind === 'int') {
    return {
      tree, hasVar,
      lo: parseBound(req.lo, { name: '下端', allowInf: true, angle }),
      hi: parseBound(req.hi, { name: '上端', allowInf: true, angle }),
    };
  }
  if (kind === 'sum') {
    return {
      tree, hasVar,
      lo: parseBound(req.lo, { name: 'はじめの k', integer: true, angle }),
      hi: parseBound(req.hi, { name: '終わりの k', integer: true, allowInf: true, allowNegInf: false, angle }),
    };
  }
  return { tree, hasVar, at: parseBound(req.at, { name: '近づける先', allowInf: true, angle }) };
}

export function runJob(req) {
  try {
    const input = readInputs(req);
    return { ok: true, ...(req.op === 'check' ? check(req, input) : solve(req, input)) };
  } catch (error) {
    if (error instanceof N.CalcError) return { ok: false, error: error.message, errorKind: error.kind };
    return { ok: false, error: 'うまく計算できませんでした（このアプリの不具合かもしれません）', errorKind: 'bug', detail: String(error?.stack ?? error) };
  }
}

// ---------------------------------------------------------
// 答え
// ---------------------------------------------------------
function solve(req, input) {
  const { angle } = req;
  const { tree } = input;
  switch (req.kind) {
    case 'diff': {
      const { a } = input;
      const r = C.derivative(tree, a, { angle });
      const dpoly = r.poly ? C.pDeriv(r.poly) : null;
      // 接線 y ＝ d1·x ＋ (f(a) − d1·a)
      const tangent = { slope: r.d1, icept: N.sub(r.f, N.mul(r.d1, a)) };
      return { kind: 'diff', a, ...r, dpoly, tangent };
    }
    case 'int': {
      const { lo, hi } = input;
      const r = C.integral(tree, lo, hi, { angle });
      const reversed = (!lo.inf && !hi.inf && N.cmp(lo, hi) > 0) || lo.inf === 1 || hi.inf === -1;
      return { kind: 'int', lo, hi, reversed, ...r };
    }
    case 'sum': {
      const { lo, hi } = input;
      if (lo === -Infinity) throw new N.CalcError('はじめの k に −∞ は使えません');
      const r = C.sigma(tree, lo, hi, { angle });
      return { kind: 'sum', lo, hi, ...r };
    }
    default: {
      const { at } = input;
      const side = at.inf ? (at.inf > 0 ? 'left' : 'right') : req.side ?? 'both';
      const r = C.limit(tree, at, side, { angle });
      return { kind: 'lim', at, side, ...r };
    }
  }
}

// ---------------------------------------------------------
// 検算に使う数
// ---------------------------------------------------------
function check(req, input) {
  const { angle } = req;
  const { tree } = input;
  const ans = solve(req, input);
  const safe = (fn) => {
    try {
      return { value: fn() };
    } catch (error) {
      if (!(error instanceof N.CalcError)) throw error;
      return { error: error.message };
    }
  };
  switch (req.kind) {
    case 'diff': {
      const rows = C.diffQuotients(tree, input.a, { angle });
      const polyAt = ans.dpoly ? C.pEval(ans.dpoly, input.a) : null;
      return { ans, rows, polyAt };
    }
    case 'int': {
      const { lo, hi } = input;
      let rows;
      if (!lo.inf && !hi.inf) {
        rows = [10, 100, 1000].map((n) => ({ n, ...safe(() => C.riemann(tree, lo, hi, n, { angle })) }));
      } else {
        // ∞ のかわりに大きい数 R までで積分してみる
        rows = [];
        for (const R of [10n, 100n, 1000n]) {
          const a = lo.inf ? N.frac(BigInt(lo.inf) * R) : lo;
          const b = hi.inf ? N.frac(BigInt(hi.inf) * R) : hi;
          if (N.cmp(a, b) === 0) continue;
          rows.push({ R, a, b, ...safe(() => C.integral(tree, a, b, { angle }).value) });
        }
      }
      let antiCheck = null;
      if (ans.antider && ans.poly) {
        const back = C.pDeriv(ans.antider);
        const same = back.length === ans.poly.length && back.every((c, i) => N.cmp(c, ans.poly[i]) === 0);
        antiCheck = {
          back, same,
          Fhi: lo.inf || hi.inf ? null : C.pEval(ans.antider, hi),
          Flo: lo.inf || hi.inf ? null : C.pEval(ans.antider, lo),
        };
      }
      return { ans, rows, antiCheck };
    }
    case 'sum': {
      const { lo, hi } = input;
      const total = hi === Infinity ? null : hi - lo + 1n;
      const terms = [];
      for (let i = 0n; i < 5n && (total === null || i < total); i++) {
        const k = lo + i;
        terms.push({ k, ...safe(() => C.partialSums(tree, k, [1], { angle })[0].value) });
      }
      let counts = [10, 100, 1000].filter((n) => total === null || BigInt(n) < total);
      const all = total !== null && total <= 10000n && ans.method !== 'direct' && ans.method !== 'empty';
      if (all) counts = [...counts, Number(total)];
      let partial = [];
      if (counts.length) {
        try {
          partial = C.partialSums(tree, lo, counts, { angle });
        } catch (error) {
          if (!(error instanceof N.CalcError)) throw error;
          partial = [{ error: error.message }];
        }
      }
      // 公式 S(n) を確かめる：S(はじめ − 1) ＝ 0、S(n) − S(n − 1) ＝ f(n)
      let formulaCheck = null;
      if (ans.formula && ans.poly) {
        const S = (n) => C.pEval(ans.formula, N.frac(n));
        const zero = N.isZero(S(lo - 1n));
        let same = zero;
        const deg = ans.formula.length;
        for (let n = lo; n <= lo + BigInt(deg) && same; n++) {
          same = N.cmp(N.sub(S(n), S(n - 1n)), C.pEval(ans.poly, N.frac(n))) === 0;
        }
        const n1 = lo + 1n;
        formulaCheck = {
          same, zero, n1,
          s1: S(n1), s0: S(lo), f1: C.pEval(ans.poly, N.frac(n1)),
          sHi: hi === Infinity ? null : S(hi),
        };
      }
      return { ans, terms, partial, all, formulaCheck };
    }
    default: {
      const tables = C.limitTable(tree, input.at, ans.side, { angle });
      return { ans, tables };
    }
  }
}
